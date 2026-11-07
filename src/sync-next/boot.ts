import { db, registerDurableWriter } from '../firebase';
import type { EntityName } from './types';

import {
  FirestoreSyncTransport
} from './firestoreTransport';

import { LocalSyncDb } from './localDb';
import { SyncCoordinator } from './coordinator';
import { UnifiedRepository } from './repository';

export async function createUnifiedDataLayer(
  workspaceId: string
) {
  const local = new LocalSyncDb(workspaceId);

  const remote = new FirestoreSyncTransport(
    db,
    workspaceId
  );

  const coordinator = new SyncCoordinator(
    local,
    remote,
    workspaceId
  );

  const repository = new UnifiedRepository(
    local,
    coordinator
  );

  // Funnel ordinary top-level SDK writes from older screens/services through
  // the SAME IndexedDB repository instead of creating duplicate cloud writers.
  const supported = new Set<string>([
    'invoices','parties','inventory','vouchers','purchases','purchaseReturns',
    'salesReturns','accounts','treasuries','treasuryTransactions','employees',
    'employeeAdvances','employeeDeductions','employeeIncentives','payrollSheets',
    'journalEntries','expenses','stockMovements','printOrders','debtClearings',
    'companies','branches','warehouses','warehouseOperations','roles','users',
    'dailyEntrySheets','settings'
  ]);
  const unregister = registerDurableWriter(async (operation, ref, payload, options) => {
    const segments = String(ref?.path || '').split('/');
    if (segments.length !== 2) return false;
    const entity = segments[0] === 'journals' ? 'journalEntries' : segments[0];
    if (!supported.has(entity)) return false;
    const id = segments[1];
    if (!id) throw new Error('Cannot synchronize a document without a stable ID');
    if (operation === 'delete') {
      await repository.tombstone(entity as EntityName, id);
    } else {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid record payload');
      }
      const existing = options?.merge
        ? (await repository.all(entity as EntityName)).find(r => r.id === id)?.value
        : null;
      await repository.put(entity as EntityName, id, {
        ...(existing || {}), ...payload, id
      });
    }
    return true;
  });

  // One-time initial safe hydration for a brand-new device with an empty IndexedDB
  try {
    const existingInvoices = await local.listVisible('invoices');
    const pendingOutbox = await local.pending();
    const needsReconciliation = typeof localStorage !== 'undefined' &&
      localStorage.getItem('lobnan_sync_reconciliation_required') === 'true';

    if (existingInvoices.length === 0 && pendingOutbox.length === 0 && !needsReconciliation) {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        const cloudSnap = await remote.fetchCloudSnapshot().catch(() => ({}));
        if (cloudSnap && Object.keys(cloudSnap).length > 0) {
          for (const [entity, items] of Object.entries(cloudSnap)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
              if (item?.id) {
                await repository.put(entity as EntityName, item.id, item).catch(() => {});
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Initial safe hydration notice:', err);
  }

  // Historical invoice registry is initialized explicitly after data reconciliation, not blindly on boot.
  await coordinator.start();

  return {
    repository,
    coordinator,
    local,
    stop: () => { unregister(); coordinator.stop(); }
  };
}
