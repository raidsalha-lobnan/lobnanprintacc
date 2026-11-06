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
  await local.reconcileTestProbeConflicts().catch(() => {});
  await coordinator.start();

  return {
    repository,
    coordinator,
    local,
    stop: () => { unregister(); coordinator.stop(); }
  };
}
