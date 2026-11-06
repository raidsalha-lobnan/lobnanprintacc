/** Portable, JSON-only wire format. All IDs refer to immutable record identities. */
export type EntityName =
  | 'invoices' | 'parties' | 'inventory' | 'vouchers' | 'purchases'
  | 'purchaseReturns' | 'salesReturns' | 'accounts' | 'treasuries'
  | 'treasuryTransactions' | 'employees' | 'employeeAdvances' | 'employeeDeductions'
  | 'employeeIncentives' | 'payrollSheets' | 'journalEntries'
  | 'expenses' | 'stockMovements' | 'printOrders' | 'debtClearings'
  | 'companies' | 'branches' | 'warehouses' | 'warehouseOperations'
  | 'roles' | 'users' | 'dailyEntrySheets' | 'settings';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ProposedChange {
  entity: EntityName;
  id: string;             // Immutable UUID; never invoiceNumber / accountCode
  value: JsonObject | null; // null means tombstone; NEVER hard delete finalized accounting records
}
export interface VersionedChange extends ProposedChange {
  expectedVersion: number; // optimistic concurrency: 0 for new record
}
export interface AppliedChange extends ProposedChange {
  version: number;          // authoritative version from transaction
}
export interface SyncCommand {
  id: string;               // stable idempotency ID, preserved across retries
  workspaceId: string;
  changes: VersionedChange[];
  createdAt: number;
  attempts: number;
  retryAt: number;
  status: 'pending' | 'conflict' | 'rejected';
  error?: string;
}
export interface StoredRecord {
  key: string;
  entity: EntityName;
  id: string;
  version: number;
  value: JsonObject | null;
}
export interface ServerCursor { seconds: number; nanoseconds: number; eventId: string }
export interface ServerEvent {
  commandId: string;
  changes: AppliedChange[];
  cursor: ServerCursor;
}
export interface CommitReceipt { commandId: string; changes: AppliedChange[] }
export interface LocalView { id: string; value: JsonObject | null; version: number; pending: boolean }

export class VersionConflict extends Error {
  readonly name = 'VersionConflict';
  constructor(
    public entity: EntityName,
    public recordId: string,
    public expectedVersion: number,
    public actualVersion: number,
  ) { super(`VERSION_CONFLICT ${entity}/${recordId} expected=${expectedVersion} actual=${actualVersion}`); }
}
export class PermanentSyncError extends Error { readonly name = 'PermanentSyncError'; }

export const recordKey = (entity: EntityName, id: string): string => `${entity}\u001f${id}`;
export function validateChanges(changes: ProposedChange[]): void {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 80) {
    throw new Error('Operation must contain between 1 and 80 changes');
  }
  const seen = new Set<string>();
  for (const c of changes) {
    if (!c || !c.entity || !c.id || /[/\u001f]/.test(c.id)) throw new Error('Invalid entity/id');
    const key = recordKey(c.entity, c.id);
    if (seen.has(key)) throw new Error(`Duplicate change within operation: ${key}`);
    seen.add(key);
    if (c.value !== null && (typeof c.value !== 'object' || Array.isArray(c.value))) {
      throw new Error('Record must be a plain object or null tombstone');
    }
    if (c.value && c.value.id != null && c.value.id !== c.id) {
      throw new Error(`Record ID mismatch: ${key}`);
    }
  }
  // Fail before local queueing if JSON is not valid / exceeds reasonable event size.
  const raw = JSON.stringify(changes);
  if (!raw || new TextEncoder().encode(raw).length > 700_000) {
    throw new Error('Operation too large for single Firestore event; split into independent transactions');
  }
  if (/"(?:NaN|Infinity)"/.test(raw)) { /* informative only: strings may legitimately use these names */ }
}
export function toJsonObject(value: JsonObject): JsonObject {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Non-finite number in record');
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
      throw new Error('Unsupported value in record');
    }
    if (v && typeof v === 'object') {
      if (seen.has(v)) throw new Error('Shared/cyclic object is not valid portable JSON');
      seen.add(v);
    }
    return v;
  });
  if (!json) throw new Error('Empty JSON record');
  return JSON.parse(json) as JsonObject;
}
export function sleep(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)); }
