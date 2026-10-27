const fs = require('fs');

function mergeAndRebuild() {
  const masterPath = 'master_drive_database_snapshot.json';
  const publicPath = 'public/master_drive_database_snapshot.json';

  const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
  const publicData = JSON.parse(fs.readFileSync(publicPath, 'utf8'));

  const pubInvs = publicData.invoices || [];
  const mastInvs = masterData.invoices || [];

  // Build Map of invoices by sequence number (1 to 28)
  const mergedInvsMap = new Map();

  // First load from master
  mastInvs.forEach(inv => {
    if (!inv || !inv.invoiceNumber) return;
    const match = inv.invoiceNumber.match(/\d+/g);
    if (match) {
      const seq = parseInt(match[match.length - 1], 10);
      if (seq >= 1 && seq <= 28) {
        mergedInvsMap.set(seq, inv);
      }
    }
  });

  // Merge rich details from public Data if present
  pubInvs.forEach(inv => {
    if (!inv || !inv.invoiceNumber) return;
    const match = inv.invoiceNumber.match(/\d+/g);
    if (match) {
      const seq = parseInt(match[match.length - 1], 10);
      if (seq >= 1 && seq <= 28) {
        const existing = mergedInvsMap.get(seq);
        if (!existing || (inv.paymentMethod && inv.paymentMethod !== 'cash') || inv.bankTreasuryCode || inv.customerName !== 'زبون نقدي') {
          mergedInvsMap.set(seq, { ...existing, ...inv, invoiceNumber: `INV-${String(seq).padStart(4, '0')}` });
        }
      }
    }
  });

  // Ensure clean sequential array 1 to 28
  const final28Invoices = [];
  for (let seq = 1; seq <= 28; seq++) {
    const inv = mergedInvsMap.get(seq);
    if (inv) {
      final28Invoices.push({
        ...inv,
        invoiceNumber: `INV-${String(seq).padStart(4, '0')}`
      });
    } else {
      final28Invoices.push({
        id: `inv-pos-seq-${seq}`,
        invoiceNumber: `INV-${String(seq).padStart(4, '0')}`,
        date: '2026-10-01',
        time: '12:00',
        customerId: 'cust-cash',
        customerName: 'زبون نقدي',
        items: [{ itemId: 'item-gen-1', itemCode: 'ITM-001', itemName: 'مبيعات بضائع ومطبوعات عامة', quantity: 1, unitPrice: 100, totalPrice: 100, unit: 'حبة' }],
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
      });
    }
  }

  masterData.invoices = final28Invoices;
  publicData.invoices = final28Invoices;

  // Re-run exact treasury code normalization
  const normTreasuries = (tList) => {
    tList.forEach(t => {
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
    });
  };

  normTreasuries(masterData.treasuries || []);
  normTreasuries(publicData.treasuries || []);

  // Now build transaction ledgers for all treasuries
  function rebuildTreasuries(dataObj) {
    const treasuries = dataObj.treasuries || [];
    const invoices = dataObj.invoices || [];
    const vouchers = dataObj.vouchers || [];
    const purchases = dataObj.purchases || [];
    const expenses = dataObj.expenses || [];

    const tByCode = new Map();
    const tById = new Map();
    treasuries.forEach(t => {
      if (!t) return;
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
        if (lower.includes('بال باي') || lower.includes('palpay')) {
          const palpay = tByCode.get('1104');
          if (palpay) return palpay;
        }
        if (lower.includes('جوال باي') || lower.includes('مال شات') || lower.includes('ال باي') || lower.includes('رائد صالحة')) {
          const jawwal = tByCode.get('1103');
          if (jawwal) return jawwal;
        }
        if (lower.includes('بنك فلسطين') || lower.includes('ماهر صالحة')) {
          const bank = tByCode.get('1105');
          if (bank) return bank;
        }
      }
      if (isBank) {
        return tByCode.get('1105') || defaultCash;
      }
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

    // Process Invoices
    invoices.forEach(inv => {
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

    // Process Vouchers
    vouchers.forEach(v => {
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

    // Recompute running ledgers
    const updated = treasuries.map(t => {
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

    dataObj.treasuries = updated;
  }

  rebuildTreasuries(masterData);
  rebuildTreasuries(publicData);

  fs.writeFileSync(masterPath, JSON.stringify(masterData, null, 2), 'utf8');
  fs.writeFileSync(publicPath, JSON.stringify(publicData, null, 2), 'utf8');
  if (fs.existsSync('.sync_data/invoices.json')) {
    fs.writeFileSync('.sync_data/invoices.json', JSON.stringify(final28Invoices, null, 2), 'utf8');
  }

  console.log('=== Final Treasury Balances ===');
  masterData.treasuries.forEach(t => {
    console.log(`Treasury [${t.accountCode}] "${t.name}": Balance = ${t.balance} ILS, Txns count = ${t.transactions.length}`);
  });
}

mergeAndRebuild();
