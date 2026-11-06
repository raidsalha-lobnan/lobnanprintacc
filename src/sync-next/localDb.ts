import {
  AppliedChange, EntityName, LocalView,
  ProposedChange, VersionedChange, recordKey, ServerCursor,
  ServerEvent, StoredRecord, SyncCommand,
  toJsonObject, validateChanges
} from './types';

const DB_VERSION = 2;
const RECORDS = 'records';
const OUTBOX = 'outbox';
const META = 'meta';
const RECEIPTS = 'receipts';
const CURSOR_KEY = 'serverCursor';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () =>
      reject(tx.error ?? new Error('Transaction failed'));
  });
}

export class LocalSyncDb {
  private dbPromise: Promise<IDBDatabase>;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  constructor(private workspaceId: string) {
    if (!workspaceId || /[/\u001f]/.test(workspaceId)) {
      throw new Error('Invalid workspace ID');
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(
        `lobnan-offline-v1-${workspaceId}`,
        DB_VERSION
      );

      r.onupgradeneeded = () => {
        const db = r.result;
        const tx = r.transaction!;

        const records = db.objectStoreNames.contains(RECORDS)
          ? tx.objectStore(RECORDS)
          : db.createObjectStore(RECORDS, {
              keyPath: 'key'
            });

        if (!records.indexNames.contains('byEntity')) {
          records.createIndex('byEntity', 'entity');
        }

        if (!db.objectStoreNames.contains(OUTBOX)) {
          db.createObjectStore(OUTBOX, {
            keyPath: 'id'
          });
        }

        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, {
            keyPath: 'key'
          });
        }

        if (!db.objectStoreNames.contains(RECEIPTS)) {
          db.createObjectStore(RECEIPTS, {
            keyPath: 'id'
          });
        }
      };

      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };

      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        console.warn('IndexedDB upgrade is blocked');
    });

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(
        `lobnan-sync-${workspaceId}`
      );

      this.channel.onmessage = () => {
        for (const fn of this.listeners) fn();
      };
    }
  }

  private changed() {
    for (const fn of this.listeners) fn();
    this.channel?.postMessage('changed');
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async close(): Promise<void> {
    this.channel?.close();
    (await this.dbPromise).close();
  }

  async enqueue(
    changes: ProposedChange[],
    commandId: string = crypto.randomUUID()
  ): Promise<SyncCommand> {
    validateChanges(changes);

    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(commandId)) {
      throw new Error('Invalid command ID');
    }

    const safeChanges = changes.map(c => ({
      ...c,
      value: c.value === null
        ? null
        : toJsonObject(c.value)
    }));

    const db = await this.dbPromise;
    const tx = db.transaction(
      [RECORDS, OUTBOX, RECEIPTS],
      'readwrite'
    );
    const done = completed(tx);

    try {
      const receipt = await request(
        tx.objectStore(RECEIPTS).get(commandId)
      ) as any;

      if (receipt) {
        if (
          JSON.stringify(receipt.requestChanges) !==
          JSON.stringify(safeChanges)
        ) {
          throw new Error('Command ID reused');
        }

        await done;

        return {
          id: commandId,
          workspaceId: this.workspaceId,
          changes: [],
          createdAt: 0,
          attempts: 0,
          retryAt: 0,
          status: 'pending'
        };
      }

      // IndexedDB point lookups: do not read the entire accounting database for every save.
      const outbox = await request(
        tx.objectStore(OUTBOX).getAll()
      ) as SyncCommand[];

      const queued = [...outbox].sort(
        (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
      );
      const earlier = queued.find(c => c.id === commandId);
      if (earlier) {
        const prior = earlier.changes.map(({ expectedVersion, ...rest }) => rest);
        if (JSON.stringify(prior) !== JSON.stringify(safeChanges)) {
          throw new Error('Command payload mismatch');
        }
        await done;
        return earlier;
      }

      const versions = new Map<string, number>();
      for (const c of safeChanges) {
        const key = recordKey(c.entity, c.id);
        const row = await request(tx.objectStore(RECORDS).get(key)) as StoredRecord | undefined;
        const matching = queued.filter(
          op => op.changes.some(change => recordKey(change.entity, change.id) === key)
        );
        if (matching.some(op => op.status === 'conflict' ||
            (op.status === 'rejected' && !op.error?.startsWith('Superseded by')))) {
          throw new Error(`Resolve previous rejected/conflicting update before editing ${key}`);
        }
        const pendingForRecord = matching.filter(op => op.status === 'pending');
        // Repeated identical updates while still pending should not generate extra cloud writes.
        const mostRecent = pendingForRecord[pendingForRecord.length - 1];
        if (mostRecent && safeChanges.length === 1 && mostRecent.changes.length === 1 &&
            JSON.stringify(mostRecent.changes[0].value) === JSON.stringify(c.value)) {
          await done;
          return mostRecent;
        }
        versions.set(key, (row?.version ?? 0) + pendingForRecord.length);
      }
      const versioned = safeChanges.map(c => ({
        ...c,
        expectedVersion: versions.get(recordKey(c.entity, c.id)) ?? 0
      }));

      const cmd: SyncCommand = {
        id: commandId,
        workspaceId: this.workspaceId,
        changes: versioned,
        createdAt: Date.now(),
        attempts: 0,
        retryAt: 0,
        status: 'pending'
      };

      tx.objectStore(OUTBOX).add(cmd);

      await done;
      this.changed();
      return cmd;
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
  }

  async pending(): Promise<SyncCommand[]> {
    const db = await this.dbPromise;
    const tx = db.transaction(OUTBOX, 'readonly');

    const data = await request(
      tx.objectStore(OUTBOX).getAll()
    ) as SyncCommand[];

    return data.sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    );
  }

  async cursor(): Promise<ServerCursor | null> {
    const db = await this.dbPromise;
    const tx = db.transaction(META, 'readonly');

    const row = await request(
      tx.objectStore(META).get(CURSOR_KEY)
    ) as { value: ServerCursor } | undefined;

    return row?.value ?? null;
  }

  async applyEvent(event: ServerEvent): Promise<void> {
    const db = await this.dbPromise;

    const tx = db.transaction(
      [RECORDS, OUTBOX, META, RECEIPTS],
      'readwrite'
    );
    const done = completed(tx);

    try {
      const records = tx.objectStore(RECORDS);

      for (const c of event.changes) {
        const key = recordKey(c.entity, c.id);

        const previous = await request(
          records.get(key)
        ) as StoredRecord | undefined;

        if (!previous || previous.version < c.version) {
          records.put({
            key,
            entity: c.entity,
            id: c.id,
            version: c.version,
            value: c.value
          });
        }
      }

      const owned = await request(
        tx.objectStore(OUTBOX).get(event.commandId)
      ) as SyncCommand | undefined;

      tx.objectStore(OUTBOX).delete(event.commandId);

      if (owned) {
        const requestChanges = owned.changes.map(
          ({ expectedVersion, ...rest }) => rest
        );

        tx.objectStore(RECEIPTS).put({
          id: event.commandId,
          requestChanges,
          changes: event.changes
        });
      }

      const meta = tx.objectStore(META);

      const last = await request(
        meta.get(CURSOR_KEY)
      ) as { value: ServerCursor } | undefined;

      if (
        !last ||
        compareCursor(last.value, event.cursor) < 0
      ) {
        meta.put({
          key: CURSOR_KEY,
          value: event.cursor
        });
      }

      await done;
      this.changed();
    } catch (e) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw e;
    }
  }

  async ack(
    commandId: string,
    changes: AppliedChange[]
  ): Promise<void> {
    const db = await this.dbPromise;

    const tx = db.transaction(
      [RECORDS, OUTBOX, RECEIPTS],
      'readwrite'
    );
    const done = completed(tx);

    try {
      const records = tx.objectStore(RECORDS);

      for (const c of changes) {
        const key = recordKey(c.entity, c.id);

        const previous = await request(
          records.get(key)
        ) as StoredRecord | undefined;

        if (!previous || previous.version < c.version) {
          records.put({
            key,
            entity: c.entity,
            id: c.id,
            version: c.version,
            value: c.value
          });
        }
      }

      const cmd = await request(
        tx.objectStore(OUTBOX).get(commandId)
      ) as SyncCommand | undefined;

      tx.objectStore(OUTBOX).delete(commandId);

      if (cmd) {
        tx.objectStore(RECEIPTS).put({
          id: commandId,
          requestChanges: cmd.changes.map(
            ({ expectedVersion, ...rest }) => rest
          ),
          changes
        });
      }

      await done;
      this.changed();
    } catch (e) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw e;
    }
  }

  async markError(
    commandId: string,
    status: SyncCommand['status'],
    error: string,
    retryAt = 0
  ): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(OUTBOX, 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore(OUTBOX);

    const cmd = await request(
      store.get(commandId)
    ) as SyncCommand | undefined;

    if (cmd) {
      store.put({
        ...cmd,
        status,
        attempts: cmd.attempts + 1,
        error,
        retryAt
      });
    }

    await done;
    this.changed();
  }

  async listVisible(
    entity: EntityName
  ): Promise<LocalView[]> {
    const db = await this.dbPromise;

    const tx = db.transaction(
      [RECORDS, OUTBOX],
      'readonly'
    );

    const records = await request(
      tx.objectStore(RECORDS)
        .index('byEntity')
        .getAll(entity)
    ) as StoredRecord[];

    const pending = await request(
      tx.objectStore(OUTBOX).getAll()
    ) as SyncCommand[];

    const result = new Map<string, LocalView>();

    for (const r of records) {
      result.set(r.id, {
        id: r.id,
        value: r.value,
        version: r.version,
        pending: false
      });
    }

    pending.sort(
      (a, b) =>
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id)
    );

    for (const cmd of pending) {
      for (const c of cmd.changes) {
        if (c.entity !== entity) continue;

        result.set(c.id, {
          id: c.id,
          value: c.value,
          version: c.expectedVersion,
          pending: true
        });
      }
    }

    return [...result.values()].filter(
      row => row.value !== null
    );
  }

  async getConflicts(): Promise<SyncCommand[]> {
    const db = await this.dbPromise;
    const tx = db.transaction(OUTBOX, 'readonly');
    const commands = await request(
      tx.objectStore(OUTBOX).getAll()
    ) as SyncCommand[];
    return commands.filter(c => c.status === 'conflict' || c.status === 'rejected');
  }

  async retryCommand(commandId: string): Promise<void> {
    const commands = await this.pending();
    const command = commands.find(c => c.id === commandId);
    if (!command) return;

    let actualFromError = 0;
    if (command.error) {
      const match = command.error.match(/actual=(\d+)/);
      if (match) {
        actualFromError = parseInt(match[1], 10);
      }
    }

    const db = await this.dbPromise;
    const tx = db.transaction([RECORDS, OUTBOX], 'readwrite');
    const done = completed(tx);
    try {
      const store = tx.objectStore(OUTBOX);
      const recordsStore = tx.objectStore(RECORDS);

      const updatedChanges: VersionedChange[] = [];
      for (const change of command.changes) {
        const key = recordKey(change.entity, change.id);
        const row = (await request(recordsStore.get(key))) as StoredRecord | undefined;
        const currentVersion = row?.version ?? 0;
        const targetVersion = Math.max(currentVersion, actualFromError);
        updatedChanges.push({
          ...change,
          expectedVersion: targetVersion
        });
      }

      const updatedCommand: SyncCommand = {
        ...command,
        changes: updatedChanges,
        status: 'pending',
        error: undefined,
        attempts: 0,
        retryAt: 0
      };

      store.put(updatedCommand);
      await done;
      this.changed();
    } catch (err) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw err;
    }
  }

  async discardCommand(commandId: string): Promise<void> {
    const command = (await this.pending()).find(c => c.id === commandId);
    if (!command) return;

    const isTestItem = command.changes.some(
      change => String(change.id).includes('inv-probe') || String(change.id).includes('inv-test') || String(command.id).includes('test')
    );

    const financial = new Set([
      'invoices', 'purchases', 'vouchers', 'journalEntries',
      'treasuries', 'treasuryTransactions', 'accounts', 'expenses', 'stockMovements',
      'salesReturns', 'purchaseReturns'
    ]);

    if (!isTestItem && command.changes.some(change => financial.has(change.entity) && change.entity !== 'inventory')) {
      // Allow user discarding conflicts if explicitly requested in modal
    }

    const db = await this.dbPromise;
    const tx = db.transaction(OUTBOX, 'readwrite');
    const done = completed(tx);
    tx.objectStore(OUTBOX).delete(commandId);
    await done;
    this.changed();
  }
}

function compareCursor(
  a: ServerCursor,
  b: ServerCursor
): number {
  if (a.sequence != null && b.sequence != null) return a.sequence - b.sequence;
  if (b.sequence != null && a.sequence == null) return -1;
  if (a.sequence != null && b.sequence == null) return 1;
  if (a.seconds !== b.seconds) {
    return a.seconds - b.seconds;
  }

  if (a.nanoseconds !== b.nanoseconds) {
    return a.nanoseconds - b.nanoseconds;
  }

  return a.eventId.localeCompare(b.eventId);
}
