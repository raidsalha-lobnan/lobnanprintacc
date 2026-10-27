const fs = require('fs');

function comprehensiveAuditAndRecalculate(treasuriesList, activeInvoices, activeVouchers, activePurchases = [], activeExpenses = []) {
  if (!Array.isArray(treasuriesList)) return [];

  const treasuryMapByCode = new Map();
  const treasuryMapById = new Map();

  treasuriesList.forEach(t => {
    if (!t) return;
    treasuryMapById.set(t.id, t);
    if (t.accountCode) {
      treasuryMapByCode.set(t.accountCode, t);
    }
  });

  const defaultCash = treasuryMapByCode.get('1101') || treasuriesList.find(t => t.type === 'cash_box' || t.isDefault) || treasuriesList[0];

  function findTreasury(codeOrId, isBank = false, notesText = '') {
    if (codeOrId) {
      if (treasuryMapById.has(codeOrId)) return treasuryMapById.get(codeOrId);
      if (treasuryMapByCode.has(codeOrId)) return treasuryMapByCode.get(codeOrId);
    }
    if (notesText) {
      const lower = notesText.toLowerCase();
      if (lower.includes('بال باي') || lower.includes('palpay')) {
        const palpay = treasuryMapByCode.get('1104') || treasuriesList.find(t => t.name.includes('بال باي'));
        if (palpay) return palpay;
      }
      if (lower.includes('جوال باي') || lower.includes('مال شات') || lower.includes('ال باي') || lower.includes('رائد صالحة')) {
        const jawwal = treasuryMapByCode.get('1103') || treasuriesList.find(t => t.name.includes('مال شات') || t.name.includes('جوال باي'));
        if (jawwal) return jawwal;
      }
      if (lower.includes('بنك فلسطين') || lower.includes('ماهر صالحة')) {
        const bank = treasuryMapByCode.get('1105') || treasuriesList.find(t => t.name.includes('بنك فلسطين'));
        if (bank) return bank;
      }
    }
    if (isBank) {
      return treasuryMapByCode.get('1105') || treasuriesList.find(t => t.type === 'bank_account' || t.type === 'digital_wallet') || defaultCash;
    }
    return defaultCash;
  }

  const txMap = new Map();
  treasuriesList.forEach(t => txMap.set(t.id, []));

  function pushTx(t, tx) {
    if (!t) return;
    const list = txMap.get(t.id) || [];
    list.push(tx);
    txMap.set(t.id, list);
  }

  // 1. Process Sales Invoices
  if (Array.isArray(activeInvoices)) {
    activeInvoices.forEach(inv => {
      if (!inv) return;
      const paidAmt = typeof inv.paidAmount === 'number' ? Math.abs(inv.paidAmount) : (Math.abs(inv.totalAmount || 0));
      if (paidAmt <= 0) return;

      const date = inv.date || '2026-10-01';
      const time = inv.time || '12:00';

      const cashAmt = typeof inv.cashPaidAmount === 'number' ? Math.abs(inv.cashPaidAmount) : (inv.paymentMethod === 'cash' ? paidAmt : 0);
      const bankAmt = typeof inv.bankPaidAmount === 'number' ? Math.abs(inv.bankPaidAmount) : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer' || inv.paymentMethod === 'e_wallet' ? paidAmt : 0);

      if (cashAmt > 0) {
        const target = findTreasury(inv.cashTreasuryCode || inv.treasuryAccountCode, false, `${inv.notes || ''} ${inv.paymentNotes || ''}`);
        pushTx(target, {
          id: `tx-inv-cash-${inv.id}`,
          treasuryId: target.id,
          treasuryName: target.name,
          date,
          time,
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
        const target = findTreasury(inv.bankTreasuryCode || inv.treasuryAccountCode, true, `${inv.notes || ''} ${inv.paymentNotes || ''}`);
        pushTx(target, {
          id: `tx-inv-bank-${inv.id}`,
          treasuryId: target.id,
          treasuryName: target.name,
          date,
          time,
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
  }

  // 2. Process Vouchers
  if (Array.isArray(activeVouchers)) {
    activeVouchers.forEach(v => {
      if (!v) return;
      const amt = typeof v.amount === 'number' ? Math.abs(v.amount) : 0;
      if (amt <= 0) return;

      const isReceipt = v.type === 'receipt';
      const isBank = v.paymentMethod === 'bank_transfer' || v.paymentMethod === 'cheque';
      const target = findTreasury(v.treasuryAccountCode || v.accountCode, isBank, `${v.description || ''} ${v.partyName || ''}`);

      pushTx(target, {
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
  }

  // Build each treasury
  return treasuriesList.map(t => {
    if (!t) return t;

    const rawTxns = txMap.get(t.id) || [];

    // Combine with manual transfers in existing t.transactions if any
    if (Array.isArray(t.transactions)) {
      t.transactions.forEach(existingTx => {
        if (!existingTx) return;
        if (existingTx.referenceType === 'transfer' || existingTx.referenceType === 'manual' || existingTx.type === 'transfer_in' || existingTx.type === 'transfer_out') {
          if (!rawTxns.some(x => x.id === existingTx.id)) {
            rawTxns.push(existingTx);
          }
        }
      });
    }

    // Sort oldest first
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
}

// Test on snapshot
const snapshot = JSON.parse(fs.readFileSync('master_drive_database_snapshot.json', 'utf8'));
const res = comprehensiveAuditAndRecalculate(snapshot.treasuries, snapshot.invoices, snapshot.vouchers);

console.log('=== Tested Audit Result ===');
res.forEach(t => {
  console.log(`Treasury [${t.accountCode}] "${t.name}": Balance = ${t.balance} ILS, Transactions count = ${t.transactions.length}`);
});
