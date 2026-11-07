import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('=== أداة رفع قاعدة البيانات المعتمدة إلى فيربيس (Firebase Upload Tool) ===');

  const configPath = path.resolve('firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-applet-config.json not found');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const snapshotPath = path.resolve('master_drive_database_snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    throw new Error('master_drive_database_snapshot.json not found');
  }

  const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const workspaceId = 'lobnan_main';

  const entities = [
    'invoices', 'parties', 'inventory', 'vouchers', 'purchases',
    'purchaseReturns', 'salesReturns', 'accounts', 'treasuries',
    'journalEntries', 'stockMovements', 'expenses', 'employees',
    'employeeAdvances', 'employeeDeductions', 'employeeIncentives',
    'payrollSheets', 'printOrders', 'debtClearings', 'companies',
    'branches', 'warehouses', 'roles', 'users'
  ];

  let totalRecords = 0;
  let batch = writeBatch(db);
  let batchOps = 0;

  async function flushBatch() {
    if (batchOps > 0) {
      await batch.commit();
      console.log(`  ✓ تم تأكيد دفعة بنجاح (${batchOps} عملية)...`);
      batch = writeBatch(db);
      batchOps = 0;
    }
  }

  // 1. Upload each entity to lobnan_sync_workspaces/{workspaceId}/records and root collection
  for (const entity of entities) {
    const items = Array.isArray(data[entity]) ? data[entity] : [];
    if (items.length === 0) continue;
    console.log(`- جاري معالجة ${entity} (${items.length} سجل)...`);

    for (const item of items) {
      if (!item || !item.id) continue;
      const cleanId = String(item.id).replace(/\//g, '_');

      // 1. Unified Sync Workspace Record
      const recordRef = doc(db, 'lobnan_sync_workspaces', workspaceId, 'records', `${entity}_${cleanId}`);
      batch.set(recordRef, {
        entity,
        id: cleanId,
        version: 1,
        value: item,
        deleted: false,
        updatedAt: serverTimestamp()
      }, { merge: true });
      batchOps++;

      // 2. Backward compatibility root collection
      const rootRef = doc(db, entity, cleanId);
      batch.set(rootRef, item, { merge: true });
      batchOps++;
      totalRecords++;

      if (batchOps >= 200) {
        await flushBatch();
      }
    }
  }

  // 2. Register Invoice Number Claims and Counter
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];
  let maxInvoiceSeq = 0;
  for (const inv of invoices) {
    const num = (inv.invoiceNumber || '').trim();
    const match = num.match(/^INV-(?:202\d-)?(\d+)$/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxInvoiceSeq) maxInvoiceSeq = seq;
      const claimRef = doc(db, 'lobnan_sync_workspaces', workspaceId, 'invoiceNumberClaims', num);
      batch.set(claimRef, {
        invoiceId: inv.id,
        invoiceNumber: num,
        reservedAt: serverTimestamp(),
        isHistorical: true
      }, { merge: true });
      batchOps++;
      if (batchOps >= 200) await flushBatch();
    }
  }

  // 3. Counter and Readiness Meta
  const counterRef = doc(db, 'lobnan_sync_workspaces', workspaceId, 'counters', 'invoices_global');
  batch.set(counterRef, {
    seq: maxInvoiceSeq || 66,
    updatedAt: serverTimestamp()
  }, { merge: true });
  batchOps++;

  const readyRef = doc(db, 'lobnan_sync_workspaces', workspaceId, 'meta', 'invoiceNumberingReady');
  batch.set(readyRef, {
    ready: true,
    reconciledAt: new Date().toISOString(),
    initialSeq: maxInvoiceSeq || 66
  }, { merge: true });
  batchOps++;

  // 4. Global Settings
  if (data.settings) {
    const settingsRef = doc(db, 'settings', 'global');
    batch.set(settingsRef, data.settings, { merge: true });
    batchOps++;
  }

  await flushBatch();
  console.log(`\n🎉 اكتمل رفع قاعدة البيانات السحابية بالكامل إلى فيربيس!`);
  console.log(`- إجمالي السجلات المرفوعة: ${totalRecords}`);
  console.log(`- أعلى تسلسل فواتير معتمد: ${maxInvoiceSeq}`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ خطأ أثناء الرفع إلى فيربيس:', err);
  process.exit(1);
});
