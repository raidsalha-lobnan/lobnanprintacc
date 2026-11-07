import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { LocalSyncDb } from '../src/sync-next/localDb';
import { SyncCommand } from '../src/sync-next/types';

test('Reconcile test probe conflicts archives inv-probe-sync-1 and inv-test-full-1 without touching real records', async () => {
  const local = new LocalSyncDb(`test-probe-${Date.now()}`);

  const probeCmd: SyncCommand = {
    id: 'c0f1465e-3ab9-4ce9-8e4a-38a6769e823b',
    workspaceId: 'test-w',
    createdAt: Date.now(),
    attempts: 1,
    retryAt: 0,
    status: 'conflict',
    error: 'VERSION_CONFLICT inventory/inv-probe-sync-1 expected=5 actual=8',
    changes: [{ entity: 'inventory', id: 'inv-probe-sync-1', expectedVersion: 5, value: null }]
  };

  const fullCmd: SyncCommand = {
    id: '43495a50-0a4e-453d-ba17-6965feab2f85',
    workspaceId: 'test-w',
    createdAt: Date.now(),
    attempts: 1,
    retryAt: 0,
    status: 'conflict',
    error: 'VERSION_CONFLICT inventory/inv-test-full-1 expected=5 actual=6',
    changes: [{ entity: 'inventory', id: 'inv-test-full-1', expectedVersion: 5, value: null }]
  };

  const realInvoiceCmd: SyncCommand = {
    id: 'real-inv-100',
    workspaceId: 'test-w',
    createdAt: Date.now(),
    attempts: 0,
    retryAt: 0,
    status: 'pending',
    changes: [{ entity: 'invoices', id: 'INV-0099', expectedVersion: 0, value: { id: 'INV-0099', total: 500 } }]
  };

  await local.enqueue([probeCmd.changes[0]], probeCmd.id);
  await local.enqueue([fullCmd.changes[0]], fullCmd.id);
  await local.enqueue([realInvoiceCmd.changes[0]], realInvoiceCmd.id);

  // Mark status as conflict manually for test simulation
  await local.markError(probeCmd.id, 'conflict', probeCmd.error!);
  await local.markError(fullCmd.id, 'conflict', fullCmd.error!);

  const beforeConflicts = await local.getConflicts();
  assert.equal(beforeConflicts.length, 2);

  // Verify automatic conflict archiving is safely disabled
  await assert.rejects(
    async () => await local.reconcileTestProbeConflicts(),
    /Automatic conflict archiving is disabled/
  );

  const afterConflicts = await local.getConflicts();
  assert.equal(afterConflicts.length, 2);

  // Real invoice operation remains intact in pending outbox
  const pending = await local.pending();
  assert.ok(pending.some(c => c.id === realInvoiceCmd.id));
});

test('retryCommand blocks auto-merging for financial and deletion conflicts (Req 8)', async () => {
  const local = new LocalSyncDb(`test-fin-${Date.now()}`);

  const finCmd: SyncCommand = {
    id: 'fin-conflict-1',
    workspaceId: 'test-w',
    createdAt: Date.now(),
    attempts: 1,
    retryAt: 0,
    status: 'conflict',
    error: 'VERSION_CONFLICT invoices/inv-77 expected=1 actual=3',
    changes: [{ entity: 'invoices', id: 'inv-77', expectedVersion: 1, value: { id: 'inv-77', total: 1200 } }]
  };

  await local.enqueue([finCmd.changes[0]], finCmd.id);
  await local.markError(finCmd.id, 'conflict', finCmd.error!);

  await assert.rejects(
    async () => {
      await local.retryCommand(finCmd.id);
    },
    /العمليات المالية والحذف وتعديل رصيد المخزون تتطلب مراجعة صريحة/
  );

  const conflicts = await local.getConflicts();
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, finCmd.id);
});

test('retryCommand detects idempotency when operation is already applied (Req 6)', async () => {
  const local = new LocalSyncDb(`test-idempotent-${Date.now()}`);

  const partyCmd: SyncCommand = {
    id: 'party-cmd-1',
    workspaceId: 'test-w',
    createdAt: Date.now(),
    attempts: 1,
    retryAt: 0,
    status: 'conflict',
    error: 'VERSION_CONFLICT parties/cust-1 expected=0 actual=2',
    changes: [{ entity: 'parties', id: 'cust-1', expectedVersion: 0, value: { id: 'cust-1', name: 'عميل معتمد' } }]
  };

  await local.enqueue([partyCmd.changes[0]], partyCmd.id);
  await local.markError(partyCmd.id, 'conflict', partyCmd.error!);

  // Simulate event catch-up arriving from server marking cust-1 at version 2 with same value
  await local.applyEvent({
    commandId: 'server-cmd-2',
    changes: [{ entity: 'parties', id: 'cust-1', version: 2, value: { id: 'cust-1', name: 'عميل معتمد' } }],
    cursor: { sequence: 10, seconds: 0, nanoseconds: 0, eventId: 'ev-10' }
  });

  // Now retrying party-cmd-1 recognizes that cust-1 is already applied with identical content
  await local.retryCommand(partyCmd.id);

  const conflicts = await local.getConflicts();
  assert.equal(conflicts.length, 0);
});

test('Double-deletion prevention ensures deleted items do not resurrect or loop (Req 12)', async () => {
  const local = new LocalSyncDb(`test-double-del-${Date.now()}`);

  // Delete item inv-item-10
  const delCmdId = 'del-op-1';
  await local.enqueue([{ entity: 'inventory', id: 'inv-item-10', value: null }], delCmdId);

  // Apply event for deletion from server
  await local.applyEvent({
    commandId: delCmdId,
    changes: [{ entity: 'inventory', id: 'inv-item-10', version: 1, value: null }],
    cursor: { sequence: 15, seconds: 0, nanoseconds: 0, eventId: 'ev-15' }
  });

  const records = await local.listVisible('inventory');
  const record = records.find(r => r.id === 'inv-item-10');
  assert.equal(record, undefined);

  // Attempting second deletion does not resurrect or cause invalid state
  const delCmdId2 = 'del-op-2';
  await local.enqueue([{ entity: 'inventory', id: 'inv-item-10', value: null }], delCmdId2);
  
  await local.ack(delCmdId2, [{ entity: 'inventory', id: 'inv-item-10', version: 2, value: null }]);

  const recordsAfter = await local.listVisible('inventory');
  const recordAfter = recordsAfter.find(r => r.id === 'inv-item-10');
  assert.equal(recordAfter, undefined);
});
