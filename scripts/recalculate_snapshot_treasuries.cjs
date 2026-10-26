const fs = require('fs');
const path = require('path');

const BANK_NET_KEYWORDS = ['شبكة', 'بنك', 'بنكي', 'تحصيل شبكة', 'حوالة', 'شيك', 'بطاقة', 'فيزا', 'ماستر', 'صراف'];

function extractInvNum(str) {
  if (!str) return null;
  const match = String(str).match(/INV-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function auditAndRecalculateTreasuries(treasuriesList, activeInvoices, activeVouchers) {
  if (!Array.isArray(treasuriesList)) return [];

  const validInvNums = new Set();
  const validInvIds = new Set();
  if (Array.isArray(activeInvoices)) {
    activeInvoices.forEach(inv => {
      if (inv) {
        if (inv.id) validInvIds.add(String(inv.id));
        if (inv.invoiceNumber) validInvNums.add(String(inv.invoiceNumber).toUpperCase());
      }
    });
  }

  const validVchNums = new Set();
  const validVchIds = new Set();
  if (Array.isArray(activeVouchers)) {
    activeVouchers.forEach(v => {
      if (v) {
        if (v.id) validVchIds.add(String(v.id));
        if (v.voucherNumber) validVchNums.add(String(v.voucherNumber).toUpperCase());
      }
    });
  }

  return treasuriesList.map(t => {
    if (!t) return t;
    const isCashBox = t.type === 'cash_box' || t.accountCode === '1101' || t.name?.includes('خزينة') || t.name?.includes('صندوق');

    const originalTxns = Array.isArray(t.transactions) ? t.transactions : [];

    const cleanTxns = originalTxns.filter(tx => {
      if (!tx) return false;
      const refId = String(tx.referenceId || '');

      // Check if transaction belongs to an invoice
      const invNum = extractInvNum(tx.description) || extractInvNum(tx.voucherNumber);
      if (invNum) {
        if (!validInvNums.has(invNum)) {
          return false; // Invoice deleted -> purge transaction
        }
      }
      if (refId.startsWith('inv-') || refId.startsWith('INV-')) {
        if (!validInvIds.has(refId) && (!invNum || !validInvNums.has(invNum))) {
          return false;
        }
      }

      // Check if transaction belongs to a payment voucher
      if (refId.startsWith('vch-') || refId.startsWith('PV-') || refId.startsWith('WTH-') || refId.startsWith('RCT-')) {
        const vNum = tx.voucherNumber || tx.referenceId;
        if (!validVchIds.has(refId) && (!vNum || !validVchNums.has(String(vNum).toUpperCase()))) {
          return false;
        }
      }

      // Strict Treasury Isolation Rule
      if (tx.treasuryId && tx.treasuryId !== t.id && tx.treasuryId !== t.accountCode) {
        return false;
      }

      const txText = `${tx.description || ''} ${tx.paymentMethod || ''} ${tx.notes || ''}`.toLowerCase();
      const hasBankNetKeyword = BANK_NET_KEYWORDS.some(kw => txText.includes(kw));

      if (isCashBox && t.accountCode === '1101' && !t.name?.includes('شبكة')) {
        if (hasBankNetKeyword) {
          return false; // exclude bank/network entries from main cash box
        }
      }

      return true;
    });

    // Recalculate running balance and currency balances from scratch
    let runningBase = 0;
    const currMap = { ILS: 0 };

    const sortedOldestFirst = [...cleanTxns].reverse();
    const recomputedOldest = sortedOldestFirst.map(tx => {
      const curr = tx.currency || 'ILS';
      const rate = tx.exchangeRate || 1.0;
      const rawAmt = typeof tx.amount === 'number' ? tx.amount : 0;
      const magAmt = Math.abs(rawAmt);
      const rawBaseAmt = typeof tx.baseAmount === 'number' ? tx.baseAmount : (magAmt * rate);
      const magBaseAmt = Math.abs(rawBaseAmt);

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
      transactions: recomputedOldest.reverse()
    };
  });
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('Processing:', filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const activeInvoices = data.invoices || [];
  const activeVouchers = data.vouchers || [];
  const treasuries = data.treasuries || [];

  const updatedTreasuries = auditAndRecalculateTreasuries(treasuries, activeInvoices, activeVouchers);
  data.treasuries = updatedTreasuries;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Updated:', filePath);
  updatedTreasuries.forEach(t => {
    console.log(` - Treasury "${t.name}" (${t.accountCode}): Balance = ${t.balance} ILS, Txns count = ${t.transactions ? t.transactions.length : 0}`);
  });
}

processFile('master_drive_database_snapshot.json');
processFile('public/master_drive_database_snapshot.json');
