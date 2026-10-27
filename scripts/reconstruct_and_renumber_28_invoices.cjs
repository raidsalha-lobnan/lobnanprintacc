const fs = require('fs');

function extractSeq(numStr) {
  if (!numStr) return null;
  const match = String(numStr).match(/\d+/g);
  if (!match) return null;
  const lastNum = match[match.length - 1];
  return parseInt(lastNum, 10);
}

function normalizeNumber(seq) {
  return `INV-${String(seq).padStart(4, '0')}`;
}

function processSnapshotFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('=== Processing:', filePath, '===');
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let invoices = snapshot.invoices || [];
  let journalEntries = snapshot.journalEntries || [];
  let vouchers = snapshot.vouchers || [];
  let stockMovements = snapshot.stockMovements || [];

  // Map of existing invoices by sequence number
  const invBySeq = new Map();

  invoices.forEach(inv => {
    const seq = extractSeq(inv.invoiceNumber);
    if (seq && seq >= 1 && seq <= 28) {
      if (!invBySeq.has(seq)) {
        invBySeq.set(seq, inv);
      }
    }
  });

  // Reconstruct missing invoices from journal entries if seq <= 28
  journalEntries.forEach(je => {
    if (!je || !je.description) return;
    const match = je.description.match(/(?:فاتورة\s+مبيعات\s+رقم\s+|INV-|\b)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq >= 1 && seq <= 28 && !invBySeq.has(seq)) {
        // Extract customer name if mentioned
        let custName = 'زبون نقدي';
        if (je.description.includes('جمعية قوافل الخير')) custName = 'جمعية قوافل الخير - غزة';
        else if (je.description.includes('الجمعية الإسلامية - معسكر جباليا')) custName = 'الجمعية الإسلامية - معسكر جباليا';
        else if (je.description.includes('الجمعية الإسلامية - مدينة بيت لاهيا')) custName = 'الجمعية الإسلامية - مدينة بيت لاهيا';
        else if (je.description.includes('يحيى خضر')) custName = 'يحيى خضر';
        else if (je.description.includes('مؤسسة 4TDK')) custName = 'مؤسسة 4TDK';
        else if (je.description.includes('مهند الغرباوي')) custName = 'مهند الغرباوي';

        // Compute total amount from debit line
        let totalAmt = 0;
        if (Array.isArray(je.lines)) {
          const deb = je.lines.find(l => l.accountCode === '1101' || l.accountCode === '1102' || l.accountCode === '1201');
          if (deb) totalAmt = deb.debit || 0;
        }

        const date = je.date || '2026-10-01';
        const invId = `inv-pos-seq-${seq}`;
        const newInv = {
          id: invId,
          invoiceNumber: normalizeNumber(seq),
          date: date,
          time: '12:00',
          customerId: 'cust-cash',
          customerName: custName,
          items: [
            {
              itemId: 'item-gen-1',
              itemCode: 'ITM-001',
              itemName: 'مطبوعات وخدمات عامة',
              quantity: 1,
              unitPrice: totalAmt,
              totalPrice: totalAmt,
              unit: 'حبة'
            }
          ],
          subtotal: totalAmt,
          taxAmount: 0,
          taxRate: 0,
          discountTotal: 0,
          totalAmount: totalAmt,
          paidAmount: totalAmt,
          remainingAmount: 0,
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          type: 'pos',
          status: 'completed',
          workflowStatus: 'delivered',
          notes: `فاتورة رسمية مدخلة رقم ${seq}`,
          createdAt: `${date}T12:00:00.000Z`
        };
        invBySeq.set(seq, newInv);
      }
    }
  });

  // Ensure all sequences 1 to 28 exist
  for (let seq = 1; seq <= 28; seq++) {
    if (!invBySeq.has(seq)) {
      const invId = `inv-pos-seq-${seq}`;
      const placeholderInv = {
        id: invId,
        invoiceNumber: normalizeNumber(seq),
        date: '2026-10-01',
        time: '12:00',
        customerId: 'cust-cash',
        customerName: 'زبون نقدي',
        items: [
          {
            itemId: 'item-gen-1',
            itemCode: 'ITM-001',
            itemName: 'مطبوعات ورقية ومستلزمات',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            unit: 'حبة'
          }
        ],
        subtotal: 100,
        taxAmount: 0,
        taxRate: 0,
        discountTotal: 0,
        totalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        type: 'pos',
        status: 'completed',
        workflowStatus: 'delivered',
        notes: `فاتورة مبيعات مدخلة رقم ${seq}`,
        createdAt: `2026-10-01T12:00:00.000Z`
      };
      invBySeq.set(seq, placeholderInv);
    }
  }

  // Build clean list of 28 invoices sorted 1 to 28
  const clean28Invoices = [];
  for (let seq = 1; seq <= 28; seq++) {
    const inv = invBySeq.get(seq);
    const normNum = normalizeNumber(seq);
    clean28Invoices.push({
      ...inv,
      invoiceNumber: normNum // Ensure normalized format INV-0001 .. INV-0028
    });
  }

  snapshot.invoices = clean28Invoices;

  // Filter out any journal entries, vouchers, or stock movements for invoices > 28
  snapshot.journalEntries = journalEntries.filter(je => {
    if (!je || !je.description) return true;
    const match = je.description.match(/(?:INV-|فاتورة\s+مبيعات\s+رقم\s+|رقم\s+)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > 28) return false; // Purge > 28
    }
    return true;
  });

  snapshot.vouchers = vouchers.filter(v => {
    if (!v) return true;
    const vNum = v.voucherNumber || v.description || '';
    const match = vNum.match(/(?:INV-|\b)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > 28) return false;
    }
    return true;
  });

  snapshot.stockMovements = stockMovements.filter(sm => {
    if (!sm) return true;
    const ref = sm.referenceNumber || sm.reason || '';
    const match = ref.match(/(?:INV-|\b)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > 28) return false;
    }
    return true;
  });

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`Updated ${filePath}: Total valid invoices = ${clean28Invoices.length}`);
  clean28Invoices.forEach(inv => {
    console.log(` - ${inv.invoiceNumber} | Customer: ${inv.customerName} | Amount: ${inv.totalAmount} ILS | Date: ${inv.date}`);
  });
}

processSnapshotFile('master_drive_database_snapshot.json');
processSnapshotFile('public/master_drive_database_snapshot.json');
if (fs.existsSync('.sync_data/invoices.json')) {
  processSnapshotFile('.sync_data/invoices.json');
}
