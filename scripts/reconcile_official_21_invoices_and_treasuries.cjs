const fs = require('fs');

// Treasuries Map in System
// 1. Cash Main Treasury: id='treasury-cash-main', code='1101', name='الصندوق النقدي (الخزينة الرئيسية)'
// 2. Bank Palestine Maher Salha: id='treasury-1790639512764', code='1105', name='بنك فلسطين - ماهر صالحة 0599992615'
// 3. Jawwal Pay / PalPay Maher Salha: id='treasury-1791324119020', code='1105', name='محفظة بال باي - جوال باي - ماهر صالحة'
// 4. Raed Salha Jawwal Pay / PalPay: id='treasury-1791395958513', code='1105', name='رائد صالحة - ال باي - جوال باي - مال شات'

function runReconciliation() {
  console.log('=== STARTING RECONCILIATION FOR OFFICIAL 21 SALES INVOICES & TREASURIES ===');

  // Load sync invoices or master snapshot invoices
  let allInvoices = [];
  if (fs.existsSync('.sync_data/invoices.json')) {
    allInvoices = JSON.parse(fs.readFileSync('.sync_data/invoices.json', 'utf8'));
  } else if (fs.existsSync('master_drive_database_snapshot.json')) {
    const snap = JSON.parse(fs.readFileSync('master_drive_database_snapshot.json', 'utf8'));
    allInvoices = snap.invoices || [];
  }

  // Filter to keep ONLY official 21 invoices (INV-0001 to INV-0021)
  const valid21Invoices = allInvoices.filter(inv => {
    if (!inv || !inv.invoiceNumber) return false;
    const match = inv.invoiceNumber.match(/INV-(\d+)/i);
    if (!match) return false;
    const num = parseInt(match[1], 10);
    return num >= 1 && num <= 21;
  });

  // Deduplicate by invoiceNumber keeping the newest/most complete version
  const invMap = new Map();
  valid21Invoices.forEach(inv => {
    const numStr = inv.invoiceNumber.toUpperCase();
    if (!invMap.has(numStr) || (inv.paidAmount > (invMap.get(numStr).paidAmount || 0))) {
      invMap.set(numStr, inv);
    }
  });

  const officialInvoices = Array.from(invMap.values()).sort((a, b) => {
    const na = parseInt(a.invoiceNumber.replace('INV-', ''), 10);
    const nb = parseInt(b.invoiceNumber.replace('INV-', ''), 10);
    return na - nb;
  });

  console.log(`Filtered Official Invoices Count: ${officialInvoices.length}`);
  officialInvoices.forEach(inv => {
    console.log(` ${inv.invoiceNumber} | Customer: ${inv.customerName} | Total: ${inv.totalAmount} | Paid: ${inv.paidAmount} | Method: ${inv.paymentMethod} | Cash: ${inv.cashPaidAmount || 0} | Bank: ${inv.bankPaidAmount || 0}`);
  });

  // Master Treasuries template
  const treasuries = [
    {
      id: 'treasury-cash-main',
      name: 'الصندوق النقدي (الخزينة الرئيسية)',
      type: 'cash_box',
      accountCode: '1101',
      balance: 0,
      currencyBalances: { ILS: 0 },
      isDefault: true,
      status: 'active',
      createdAt: '2026-01-01',
      transactions: []
    },
    {
      id: 'treasury-1790639512764',
      name: 'بنك فلسطين - ماهر صالحة 0599992615',
      type: 'bank_account',
      accountCode: '1105',
      bankName: 'بنك فلسطين',
      accountNumber: '0599992615',
      balance: 0,
      currencyBalances: { ILS: 0 },
      status: 'active',
      createdAt: '2026-01-01',
      transactions: []
    },
    {
      id: 'treasury-1791324119020',
      name: 'محفظة بال باي - جوال باي - ماهر صالحة',
      type: 'digital_wallet',
      accountCode: '1105',
      bankName: 'جوال باي / بال باي',
      balance: 0,
      currencyBalances: { ILS: 0 },
      status: 'active',
      createdAt: '2026-01-01',
      transactions: []
    },
    {
      id: 'treasury-1791395958513',
      name: 'رائد صالحة - ال باي - جوال باي - مال شات',
      type: 'digital_wallet',
      accountCode: '1105',
      bankName: 'جوال باي / مال شات',
      balance: 0,
      currencyBalances: { ILS: 0 },
      status: 'active',
      createdAt: '2026-01-01',
      transactions: []
    }
  ];

  const cashTreasury = treasuries[0];
  const bankTreasury = treasuries[1];
  const jawwalMaherTreasury = treasuries[2];
  const jawwalRaedTreasury = treasuries[3];

  // Route invoice payments strictly to designated treasuries
  officialInvoices.forEach(inv => {
    const paid = typeof inv.paidAmount === 'number' ? inv.paidAmount : 0;
    if (paid <= 0) return; // Unpaid/credit invoice -> no cash flow

    const cashPart = typeof inv.cashPaidAmount === 'number' && inv.cashPaidAmount > 0 
      ? inv.cashPaidAmount 
      : (inv.paymentMethod === 'cash' ? paid : 0);

    const bankPart = typeof inv.bankPaidAmount === 'number' && inv.bankPaidAmount > 0 
      ? inv.bankPaidAmount 
      : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer' ? paid : 0);

    // Determine target bank/wallet treasury
    let targetBankTreasury = bankTreasury;
    const invText = `${inv.notes || ''} ${inv.bankTreasuryCode || ''}`.toLowerCase();
    if (invText.includes('رائد') || invText.includes('مال شات')) {
      targetBankTreasury = jawwalRaedTreasury;
    } else if (invText.includes('محفظة') || invText.includes('بال باي')) {
      targetBankTreasury = jawwalMaherTreasury;
    }

    // Record Cash deposit if applicable
    if (cashPart > 0) {
      cashTreasury.transactions.push({
        id: `tx-cash-${inv.id}`,
        treasuryId: cashTreasury.id,
        treasuryName: cashTreasury.name,
        date: inv.date || new Date().toISOString().split('T')[0],
        type: 'deposit',
        amount: cashPart,
        currency: inv.currency || 'ILS',
        currencySymbol: '₪',
        exchangeRate: 1,
        baseCurrency: 'ILS',
        baseAmount: cashPart,
        balanceAfter: 0,
        balanceAfterCurrency: 0,
        voucherNumber: inv.invoiceNumber,
        partyName: inv.customerName,
        description: `تحصيل نقدي - فاتورة مبيعات رقم ${inv.invoiceNumber} (${inv.customerName})`,
        referenceType: 'pos_sale',
        referenceId: inv.id,
        paymentMethod: 'cash'
      });
    }

    // Record Bank/Network deposit if applicable
    if (bankPart > 0) {
      targetBankTreasury.transactions.push({
        id: `tx-bank-${inv.id}`,
        treasuryId: targetBankTreasury.id,
        treasuryName: targetBankTreasury.name,
        date: inv.date || new Date().toISOString().split('T')[0],
        type: 'deposit',
        amount: bankPart,
        currency: inv.currency || 'ILS',
        currencySymbol: '₪',
        exchangeRate: 1,
        baseCurrency: 'ILS',
        baseAmount: bankPart,
        balanceAfter: 0,
        balanceAfterCurrency: 0,
        voucherNumber: inv.invoiceNumber,
        partyName: inv.customerName,
        description: `تحصيل شبكة / بنكي - فاتورة مبيعات رقم ${inv.invoiceNumber} (${inv.customerName})`,
        referenceType: 'pos_sale',
        referenceId: inv.id,
        paymentMethod: inv.paymentMethod || 'card'
      });
    }
  });

  // Recompute balances and running balance for each treasury
  treasuries.forEach(t => {
    let runningBase = 0;
    const currMap = { ILS: 0 };

    // Sort transactions oldest to newest by date/id
    t.transactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    t.transactions.forEach(tx => {
      const amt = Math.abs(tx.amount || 0);
      const isDep = tx.type === 'deposit' || tx.type === 'transfer_in';
      const delta = isDep ? amt : -amt;

      currMap.ILS = Number((currMap.ILS + delta).toFixed(2));
      runningBase = Number((runningBase + delta).toFixed(2));

      tx.balanceAfter = runningBase;
      tx.balanceAfterCurrency = currMap.ILS;
    });

    t.balance = runningBase;
    t.currencyBalances = currMap;

    // Reverse to display newest first in UI lists
    t.transactions.reverse();

    console.log(`\nTreasury "${t.name}" (${t.accountCode}):`);
    console.log(` - Recomputed Balance: ${t.balance} ILS`);
    console.log(` - Transactions Count: ${t.transactions.length}`);
  });

  // Write updated data to snapshot files
  const snapshotFiles = ['master_drive_database_snapshot.json', 'public/master_drive_database_snapshot.json'];
  snapshotFiles.forEach(sf => {
    if (fs.existsSync(sf)) {
      const data = JSON.parse(fs.readFileSync(sf, 'utf8'));
      data.invoices = officialInvoices;
      data.treasuries = treasuries;
      fs.writeFileSync(sf, JSON.stringify(data, null, 2), 'utf8');
      console.log(`Updated snapshot file: ${sf}`);
    }
  });

  if (fs.existsSync('.sync_data/invoices.json')) {
    fs.writeFileSync('.sync_data/invoices.json', JSON.stringify(officialInvoices, null, 2), 'utf8');
    console.log('Updated .sync_data/invoices.json');
  }
}

runReconciliation();
