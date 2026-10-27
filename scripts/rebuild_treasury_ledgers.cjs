const fs = require('fs');

function rebuildAllTreasuryLedgers(snapshotData) {
  const treasuries = snapshotData.treasuries || [];
  const invoices = snapshotData.invoices || [];
  const vouchers = snapshotData.vouchers || [];
  const purchases = snapshotData.purchases || [];
  const expenses = snapshotData.expenses || [];
  const journalEntries = snapshotData.journalEntries || [];

  // Map treasury by ID and by accountCode
  const treasuryMapByCode = new Map();
  const treasuryMapById = new Map();

  treasuries.forEach(t => {
    if (!t) return;
    treasuryMapById.set(t.id, t);
    if (t.accountCode) {
      treasuryMapByCode.set(t.accountCode, t);
    }
  });

  // Default cash treasury (1101)
  const defaultCashTreasury = treasuryMapByCode.get('1101') || treasuries.find(t => t.type === 'cash_box' || t.isDefault) || treasuries[0];

  // Helper to find target treasury for a transaction
  function findTreasury(codeOrId, isBankOrCard = false, notesText = '') {
    if (codeOrId) {
      if (treasuryMapById.has(codeOrId)) return treasuryMapById.get(codeOrId);
      if (treasuryMapByCode.has(codeOrId)) return treasuryMapByCode.get(codeOrId);
    }
    // Search by keywords in notesText if provided
    if (notesText) {
      const lower = notesText.toLowerCase();
      if (lower.includes('بال باي') || lower.includes('palpay') || lower.includes('pal pay')) {
        const palpay = treasuryMapByCode.get('1104') || treasuries.find(t => t.name.includes('بال باي'));
        if (palpay) return palpay;
      }
      if (lower.includes('جوال باي') || lower.includes('مال شات') || lower.includes('ال باي') || lower.includes('رائد صالحة')) {
        const jawwal = treasuryMapByCode.get('1103') || treasuries.find(t => t.name.includes('مال شات') || t.name.includes('جوال باي'));
        if (jawwal) return jawwal;
      }
      if (lower.includes('بنك فلسطين') || lower.includes('ماهر صالحة') || lower.includes('0599992615')) {
        const bank = treasuryMapByCode.get('1105') || treasuries.find(t => t.name.includes('بنك فلسطين'));
        if (bank) return bank;
      }
    }
    if (isBankOrCard) {
      // Default bank/app treasury (1105)
      return treasuryMapByCode.get('1105') || treasuries.find(t => t.type === 'bank_account' || t.type === 'bank_app') || defaultCashTreasury;
    }
    return defaultCashTreasury;
  }

  // Gather all transaction events across the system
  const txByTreasuryId = new Map();
  treasuries.forEach(t => txByTreasuryId.set(t.id, []));

  function addTx(t, tx) {
    if (!t) return;
    const list = txByTreasuryId.get(t.id) || [];
    list.push(tx);
    txByTreasuryId.set(t.id, list);
  }

  // 1. Process Sales Invoices
  invoices.forEach(inv => {
    if (!inv) return;
    const paidAmt = typeof inv.paidAmount === 'number' ? inv.paidAmount : (inv.totalAmount || 0);
    if (paidAmt <= 0) return;

    const invDate = inv.date || '2026-10-01';
    const invTime = inv.time || '12:00';

    // Handle Split Cash & Bank
    const cashPaid = typeof inv.cashPaidAmount === 'number' ? inv.cashPaidAmount : (inv.paymentMethod === 'cash' ? paidAmt : 0);
    const bankPaid = typeof inv.bankPaidAmount === 'number' ? inv.bankPaidAmount : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer' || inv.paymentMethod === 'e_wallet' ? paidAmt : 0);

    if (cashPaid > 0) {
      const targetCash = findTreasury(inv.cashTreasuryCode || inv.treasuryAccountCode, false, `${inv.notes || ''} ${inv.paymentNotes || ''}`);
      addTx(targetCash, {
        id: `tx-inv-cash-${inv.id}`,
        treasuryId: targetCash.id,
        treasuryName: targetCash.name,
        date: invDate,
        time: invTime,
        type: 'deposit',
        amount: Math.abs(cashPaid),
        currency: inv.currency || 'ILS',
        currencySymbol: inv.currencySymbol || '₪',
        exchangeRate: inv.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: Math.abs(cashPaid * (inv.exchangeRate || 1.0)),
        voucherNumber: inv.invoiceNumber,
        partyName: inv.customerName || 'زبون نقدي',
        description: `تحصيل نقدي - فاتورة مبيعات رقم ${inv.invoiceNumber} (${inv.customerName || 'زبون نقدي'})`,
        referenceType: 'pos_sale',
        referenceId: inv.id
      });
    }

    if (bankPaid > 0) {
      const targetBank = findTreasury(inv.bankTreasuryCode || inv.treasuryAccountCode, true, `${inv.notes || ''} ${inv.paymentNotes || ''}`);
      addTx(targetBank, {
        id: `tx-inv-bank-${inv.id}`,
        treasuryId: targetBank.id,
        treasuryName: targetBank.name,
        date: invDate,
        time: invTime,
        type: 'deposit',
        amount: Math.abs(bankPaid),
        currency: inv.currency || 'ILS',
        currencySymbol: inv.currencySymbol || '₪',
        exchangeRate: inv.exchangeRate || 1.0,
        baseCurrency: 'ILS',
        baseAmount: Math.abs(bankPaid * (inv.exchangeRate || 1.0)),
        voucherNumber: inv.invoiceNumber,
        partyName: inv.customerName || 'زبون نقدي',
        description: `تحصيل شبكة / بنك - فاتورة مبيعات رقم ${inv.invoiceNumber} (${inv.customerName || 'زبون نقدي'})`,
        referenceType: 'pos_sale',
        referenceId: inv.id
      });
    }
  });

  // 2. Process Payment Vouchers
  vouchers.forEach(v => {
    if (!v) return;
    const amt = typeof v.amount === 'number' ? Math.abs(v.amount) : 0;
    if (amt <= 0) return;

    const isReceipt = v.type === 'receipt';
    const isBank = v.paymentMethod === 'bank_transfer' || v.paymentMethod === 'cheque';
    const targetT = findTreasury(v.treasuryAccountCode || v.accountCode, isBank, `${v.description || ''} ${v.partyName || ''}`);

    const vDate = v.date || '2026-10-01';

    addTx(targetT, {
      id: `tx-vch-${v.id}`,
      treasuryId: targetT.id,
      treasuryName: targetT.name,
      date: vDate,
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
      referenceId: v.id
    });
  });

  // 3. Process Purchases
  purchases.forEach(pur => {
    if (!pur) return;
    const paidAmt = typeof pur.paidAmount === 'number' ? Math.abs(pur.paidAmount) : (pur.totalAmount || 0);
    if (paidAmt <= 0) return;

    const purDate = pur.date || '2026-10-01';
    const targetT = findTreasury(pur.treasuryAccountCode, false, pur.notes || '');

    addTx(targetT, {
      id: `tx-pur-${pur.id}`,
      treasuryId: targetT.id,
      treasuryName: targetT.name,
      date: purDate,
      type: 'withdrawal',
      amount: paidAmt,
      currency: pur.currency || 'ILS',
      currencySymbol: pur.currencySymbol || '₪',
      exchangeRate: pur.exchangeRate || 1.0,
      baseCurrency: 'ILS',
      baseAmount: paidAmt * (pur.exchangeRate || 1.0),
      voucherNumber: pur.invoiceNumber,
      partyName: pur.supplierName || 'مورد',
      description: `سداد فاتورة مشتريات رقم ${pur.invoiceNumber} (${pur.supplierName || 'مورد'})`,
      referenceType: 'expense',
      referenceId: pur.id
    });
  });

  // 4. Process Expenses
  expenses.forEach(exp => {
    if (!exp) return;
    const amt = typeof exp.amount === 'number' ? Math.abs(exp.amount) : 0;
    if (amt <= 0) return;

    const expDate = exp.date || '2026-10-01';
    const targetT = findTreasury(exp.treasuryAccountCode || exp.accountCode, false, exp.notes || '');

    addTx(targetT, {
      id: `tx-exp-${exp.id}`,
      treasuryId: targetT.id,
      treasuryName: targetT.name,
      date: expDate,
      type: 'withdrawal',
      amount: amt,
      currency: exp.currency || 'ILS',
      currencySymbol: exp.currencySymbol || '₪',
      exchangeRate: exp.exchangeRate || 1.0,
      baseCurrency: 'ILS',
      baseAmount: amt * (exp.exchangeRate || 1.0),
      voucherNumber: exp.voucherNumber || exp.id,
      partyName: exp.category || 'مصروفات',
      description: `صرف مصروفات - ${exp.title || exp.category || 'مصروف'}`,
      referenceType: 'expense',
      referenceId: exp.id
    });
  });

  // Re-calculate each treasury's balance and running ledger sorted oldest first
  const updatedTreasuries = treasuries.map(t => {
    if (!t) return t;
    const rawTxns = txByTreasuryId.get(t.id) || [];

    // Sort chronologically oldest first
    const sortedOldest = [...rawTxns].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.id || '').localeCompare(b.id || '');
    });

    let runningBase = 0;
    const currMap = { ILS: 0 };

    const computedLedgerOldest = sortedOldest.map(tx => {
      const curr = tx.currency || 'ILS';
      const rate = tx.exchangeRate || 1.0;
      const rawAmt = typeof tx.amount === 'number' ? Math.abs(tx.amount) : 0;
      const baseAmt = typeof tx.baseAmount === 'number' ? Math.abs(tx.baseAmount) : (rawAmt * rate);

      const isDeposit = tx.type === 'deposit' || tx.type === 'transfer_in';
      const deltaCurr = isDeposit ? rawAmt : -rawAmt;
      const deltaBase = isDeposit ? baseAmt : -baseAmt;

      currMap[curr] = Number(((currMap[curr] || 0) + deltaCurr).toFixed(2));
      runningBase = Number((runningBase + deltaBase).toFixed(2));

      return {
        ...tx,
        amount: rawAmt,
        baseAmount: baseAmt,
        balanceAfter: runningBase,
        balanceAfterCurrency: currMap[curr]
      };
    });

    return {
      ...t,
      balance: runningBase,
      currencyBalances: currMap,
      transactions: computedLedgerOldest.reverse() // Most recent first
    };
  });

  snapshotData.treasuries = updatedTreasuries;
  return updatedTreasuries;
}

function processAndSave(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('Rebuilding treasuries in:', filePath);
  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = rebuildAllTreasuryLedgers(snap);
  fs.writeFileSync(filePath, JSON.stringify(snap, null, 2), 'utf8');

  console.log('\nResulting Treasury Balances for:', filePath);
  updated.forEach(t => {
    console.log(` - [${t.accountCode}] ${t.name}: Balance = ${t.balance} ILS, Transactions = ${t.transactions ? t.transactions.length : 0}`);
  });
}

processAndSave('master_drive_database_snapshot.json');
processAndSave('public/master_drive_database_snapshot.json');
