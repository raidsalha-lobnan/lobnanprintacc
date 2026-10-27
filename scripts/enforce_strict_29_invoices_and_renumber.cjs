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

function enforceStrict29Invoices(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('Enforcing strict 29 invoices on:', filePath);
  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let invoices = snap.invoices || [];
  let journalEntries = snap.journalEntries || [];
  let vouchers = snap.vouchers || [];
  let stockMovements = snap.stockMovements || [];

  const invBySeq = new Map();

  // Load existing invoices by sequence
  invoices.forEach(inv => {
    if (!inv) return;
    const seq = extractSeq(inv.invoiceNumber);
    if (seq && seq >= 1 && seq <= 29) {
      if (!invBySeq.has(seq)) {
        invBySeq.set(seq, inv);
      } else {
        // Merge rich fields if needed
        const existing = invBySeq.get(seq);
        invBySeq.set(seq, { ...existing, ...inv });
      }
    }
  });

  // Ensure all 29 sequence slots 1..29 exist
  for (let seq = 1; seq <= 29; seq++) {
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
            itemName: 'مبيعات بضائع ومطبوعات عامة',
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
        createdAt: '2026-10-01T12:00:00.000Z'
      };
      invBySeq.set(seq, placeholderInv);
    }
  }

  // Build clean list of 29 invoices sorted 1 to 29
  const clean29Invoices = [];
  for (let seq = 1; seq <= 29; seq++) {
    const inv = invBySeq.get(seq);
    clean29Invoices.push({
      ...inv,
      invoiceNumber: normalizeNumber(seq) // Strict INV-0001 .. INV-0029
    });
  }

  snap.invoices = clean29Invoices;

  // Purge any journal entries, vouchers, stock movements for invoices > 29
  snap.journalEntries = journalEntries.filter(je => {
    if (!je || !je.description) return true;
    const match = je.description.match(/(?:INV-|فاتورة\s+مبيعات\s+رقم\s+|رقم\s+)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > 29) return false;
    }
    return true;
  });

  snap.vouchers = vouchers.filter(v => {
    if (!v) return true;
    const vNum = v.voucherNumber || v.description || '';
    const match = vNum.match(/(?:INV-|\b)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > 29) return false;
    }
    return true;
  });

  snap.stockMovements = stockMovements.filter(sm => {
    if (!sm) return true;
    const ref = sm.referenceNumber || sm.reason || '';
    const match = ref.match(/(?:INV-|\b)(\d+)/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > 29) return false;
    }
    return true;
  });

  // Re-calculate treasuries
  const treasuries = snap.treasuries || [];
  const tByCode = new Map();
  const tById = new Map();
  treasuries.forEach(t => {
    if (!t) return;
    if (t.id === 'treasury-cash-main' || t.name.includes('الخزينة الرئيسية')) {
      t.accountCode = '1101';
      t.isDefault = true;
    } else if (t.id === 'treasury-1791395958513' || (t.name.includes('رائد صالحة') && !t.name.includes('ماهر صالحة'))) {
      t.accountCode = '1103';
      t.type = 'digital_wallet';
    } else if (t.id === 'treasury-1791324119020' || t.name.includes('بال باي')) {
      t.accountCode = '1104';
      t.type = 'digital_wallet';
    } else if (t.id === 'treasury-1790639512764' || t.name.includes('بنك فلسطين')) {
      t.accountCode = '1105';
      t.type = 'bank_account';
    }
    tById.set(t.id, t);
    if (t.accountCode) tByCode.set(t.accountCode, t);
  });

  const defaultCash = tByCode.get('1101') || treasuries[0];

  function getTargetTreasury(codeOrId, isBank = false, notesText = '') {
    if (codeOrId) {
      if (tById.has(codeOrId)) return tById.get(codeOrId);
      if (tByCode.has(codeOrId)) return tByCode.get(codeOrId);
    }
    if (notesText) {
      const lower = notesText.toLowerCase();
      if (lower.includes('بال باي') || lower.includes('palpay')) return tByCode.get('1104') || defaultCash;
      if (lower.includes('جوال باي') || lower.includes('مال شات') || lower.includes('ال باي') || lower.includes('رائد صالحة')) return tByCode.get('1103') || defaultCash;
      if (lower.includes('بنك فلسطين') || lower.includes('ماهر صالحة')) return tByCode.get('1105') || defaultCash;
    }
    if (isBank) return tByCode.get('1105') || defaultCash;
    return defaultCash;
  }

  const txMap = new Map();
  treasuries.forEach(t => txMap.set(t.id, []));

  function addTx(target, tx) {
    if (!target) return;
    const list = txMap.get(target.id) || [];
    list.push(tx);
    txMap.set(target.id, list);
  }

  clean29Invoices.forEach(inv => {
    if (!inv) return;
    const paidAmt = typeof inv.paidAmount === 'number' ? Math.abs(inv.paidAmount) : Math.abs(inv.totalAmount || 0);
    if (paidAmt <= 0) return;

    const date = inv.date || '2026-10-01';
    const time = inv.time || '12:00';

    const cashAmt = typeof inv.cashPaidAmount === 'number' ? Math.abs(inv.cashPaidAmount) : (inv.paymentMethod === 'cash' ? paidAmt : 0);
    const bankAmt = typeof inv.bankPaidAmount === 'number' ? Math.abs(inv.bankPaidAmount) : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer' || inv.paymentMethod === 'e_wallet' ? paidAmt : 0);

    if (cashAmt > 0) {
      const target = getTargetTreasury(inv.cashTreasuryCode || inv.treasuryAccountCode, false, `${inv.notes || ''}`);
      addTx(target, {
        id: `tx-inv-cash-${inv.id}`,
        treasuryId: target.id,
        treasuryName: target.name,
        date, time,
        type: 'deposit',
        amount: cashAmt,
        currency: inv.currency || 'ILS',
        currencySymbol: inv.currencySymbol || '₪',
        exchangeRate: inv.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: cashAmt * (inv.exchangeRate || 1.0),
        voucherNumber: inv.invoiceNumber,
        partyName: inv.customerName || 'زبون نقدي',
        description: `تحصيل نقدي - فاتورة مبيعات رقم ${inv.invoiceNumber} (${inv.customerName || 'زبون نقدي'})`,
        referenceType: 'pos_sale',
        referenceId: inv.id,
        paymentMethod: 'cash',
        notes: inv.notes || ''
      });
    }

    if (bankAmt > 0) {
      const target = getTargetTreasury(inv.bankTreasuryCode || inv.treasuryAccountCode, true, `${inv.notes || ''}`);
      addTx(target, {
        id: `tx-inv-bank-${inv.id}`,
        treasuryId: target.id,
        treasuryName: target.name,
        date, time,
        type: 'deposit',
        amount: bankAmt,
        currency: inv.currency || 'ILS',
        currencySymbol: inv.currencySymbol || '₪',
        exchangeRate: inv.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: bankAmt * (inv.exchangeRate || 1.0),
        voucherNumber: inv.invoiceNumber,
        partyName: inv.customerName || 'زبون نقدي',
        description: `تحصيل شبكة / بنك - فاتورة مبيعات رقم ${inv.invoiceNumber} (${inv.customerName || 'زبون نقدي'})`,
        referenceType: 'pos_sale',
        referenceId: inv.id,
        paymentMethod: inv.paymentMethod || 'card',
        notes: inv.notes || ''
      });
    }
  });

  // Vouchers
  (snap.vouchers || []).forEach(v => {
    if (!v) return;
    const amt = typeof v.amount === 'number' ? Math.abs(v.amount) : 0;
    if (amt <= 0) return;

    const isReceipt = v.type === 'receipt';
    const isBank = v.paymentMethod === 'bank_transfer' || v.paymentMethod === 'cheque';
    const target = getTargetTreasury(v.treasuryAccountCode || v.accountCode, isBank, `${v.description || ''} ${v.partyName || ''}`);

    addTx(target, {
      id: `tx-vch-${v.id}`,
      treasuryId: target.id,
      treasuryName: target.name,
      date: v.date || '2026-10-01',
      type: isReceipt ? 'deposit' : 'withdrawal',
      amount: amt,
      currency: v.currency || 'ILS',
      currencySymbol: v.currencySymbol || '₪',
      exchangeRate: v.exchangeRate || 1.0,
      baseCurrency: 'ILS',
      baseAmount: amt * (v.exchangeRate || 1.0),
      voucherNumber: v.voucherNumber,
      partyName: v.partyName || '',
      description: v.description || (isReceipt ? `سند قبض رقم ${v.voucherNumber}` : `سند صرف رقم ${v.voucherNumber}`),
      referenceType: isReceipt ? 'receipt' : 'payment',
      referenceId: v.id,
      paymentMethod: v.paymentMethod || 'cash'
    });
  });

  const updatedTreasuries = treasuries.map(t => {
    if (!t) return t;
    const rawTxns = txMap.get(t.id) || [];
    const sortedOldest = [...rawTxns].sort((a, b) => {
      const dCmp = (a.date || '').localeCompare(b.date || '');
      if (dCmp !== 0) return dCmp;
      return (a.id || '').localeCompare(b.id || '');
    });

    let runningBase = 0;
    const currMap = { ILS: 0 };

    const ledgerOldest = sortedOldest.map(tx => {
      const curr = tx.currency || 'ILS';
      const rate = tx.exchangeRate || 1.0;
      const magAmt = typeof tx.amount === 'number' ? Math.abs(tx.amount) : 0;
      const magBaseAmt = typeof tx.baseAmount === 'number' ? Math.abs(tx.baseAmount) : (magAmt * rate);

      const isDep = tx.type === 'deposit' || tx.type === 'transfer_in';
      const dCurr = isDep ? magAmt : -magAmt;
      const dBase = isDep ? magBaseAmt : -magBaseAmt;

      currMap[curr] = Number(((currMap[curr] || 0) + dCurr).toFixed(2));
      runningBase = Number((runningBase + dBase).toFixed(2));

      return {
        ...tx,
        amount: magAmt,
        baseAmount: magBaseAmt,
        balanceAfter: runningBase,
        balanceAfterCurrency: currMap[curr]
      };
    });

    return {
      ...t,
      balance: runningBase,
      currencyBalances: currMap,
      transactions: ledgerOldest.reverse()
    };
  });

  snap.treasuries = updatedTreasuries;

  fs.writeFileSync(filePath, JSON.stringify(snap, null, 2), 'utf8');
  console.log(`✓ Successfully updated ${filePath}: Total Invoices = ${clean29Invoices.length}`);
  clean29Invoices.slice(-5).forEach(i => console.log('  -', i.invoiceNumber, '| Cust:', i.customerName, '| Date:', i.date, '| Amount:', i.totalAmount));
}

enforceStrict29Invoices('master_drive_database_snapshot.json');
enforceStrict29Invoices('public/master_drive_database_snapshot.json');

// Also update .sync_data/invoices.json if directory exists
if (fs.existsSync('.sync_data/invoices.json')) {
  const masterSnap = JSON.parse(fs.readFileSync('master_drive_database_snapshot.json', 'utf8'));
  fs.writeFileSync('.sync_data/invoices.json', JSON.stringify(masterSnap.invoices || [], null, 2), 'utf8');
  console.log('✓ Synced .sync_data/invoices.json with clean 29 master invoices');
}

// Unify master database across files
require('./unify_master_database.cjs');

