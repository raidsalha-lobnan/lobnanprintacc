import { DailyEntryRow, DailyEntrySheet, Party, InventoryItem, Treasury, PaymentMethod } from '../types';
import { DraftInvoiceItem, MultiItemDraftInvoice, autoMatchDraftEntities } from './liveSheetService';

export const DAILY_ENTRY_STORAGE_KEY = 'accounting_daily_entry_sheets_v1';

/**
 * إنشاء سطر جديد فارغ لكشف الإدخال اليومي
 */
export function createEmptyDailyEntryRow(
  serialNumber: number,
  defaultTreasuryId?: string,
  defaultTreasuryName?: string
): DailyEntryRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serialNumber,
    customerName: '',
    subCustomerName: '',
    itemName: '',
    notes: '',
    requiredAmount: 0,
    paidAmount: 0,
    treasuryId: defaultTreasuryId || '',
    treasuryName: defaultTreasuryName || ''
  };
}

/**
 * تحويل أسطر كشف الإدخال اليومي إلى مسودات فواتير متكاملة
 * وترحيلها لشاشة مسودات فواتير Excel و OneDrive
 */
export function convertDailyEntryRowsToDrafts(
  date: string,
  rows: DailyEntryRow[],
  parties: Party[],
  inventory: InventoryItem[],
  treasuries: Treasury[]
): MultiItemDraftInvoice[] {
  // تصفية الأسطر الصالحة (التي تحتوي على اسم زبون أو صنف أو مبلغ مطلوب)
  const validRows = rows.filter(r =>
    (r.customerName && r.customerName.trim().length > 0) ||
    (r.itemName && r.itemName.trim().length > 0) ||
    Number(r.requiredAmount) > 0
  );

  return validRows.map((row, idx) => {
    const draftId = `daily-draft-${date}-${idx + 1}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    
    // مطابقة الصندوق أو البنك
    const matchedTreasury = treasuries.find(t => 
      (row.treasuryId && t.id === row.treasuryId) || 
      (row.treasuryName && (t.name === row.treasuryName || t.name.includes(row.treasuryName)))
    );

    const isBank = matchedTreasury?.type === 'bank' || 
                   matchedTreasury?.name?.includes('بنك') || 
                   matchedTreasury?.name?.includes('حوالة') ||
                   matchedTreasury?.name?.includes('شيك');

    const reqAmt = Number(row.requiredAmount || 0);
    const paidAmt = Number(row.paidAmount || 0);

    let paymentMethod: PaymentMethod = 'credit';
    if (paidAmt >= reqAmt && reqAmt > 0) {
      paymentMethod = isBank ? 'bank_transfer' : 'cash';
    } else if (paidAmt > 0) {
      paymentMethod = isBank ? 'bank_transfer' : 'cash';
    }

    const itemNotes = row.notes?.trim() || '';
    const draftItem: DraftInvoiceItem = {
      id: `it-${draftId}-1`,
      itemName: row.itemName?.trim() || 'صنف مبيعات',
      quantity: 1,
      unitPrice: reqAmt,
      totalAmount: reqAmt,
      notes: itemNotes,
      count: 1
    };

    const draft: MultiItemDraftInvoice = {
      id: draftId,
      date: date,
      customerName: row.customerName?.trim() || 'زبون نقدي',
      customerId: row.customerId,
      subCustomerName: row.subCustomerName?.trim() || undefined,
      subCustomerId: row.subCustomerId,
      paymentMethod: paymentMethod,
      notes: row.notes?.trim() || '',
      items: [draftItem],
      totalAmount: reqAmt,
      selected: true,
      isApproved: false,
      
      // تفاصيل السداد
      cashAmount: (!isBank && paidAmt > 0) ? String(paidAmt) : undefined,
      bankAmount: (isBank && paidAmt > 0) ? String(paidAmt) : undefined,
      cashTreasuryCode: (!isBank && matchedTreasury) ? (matchedTreasury.accountCode || matchedTreasury.id) : undefined,
      bankTreasuryCode: (isBank && matchedTreasury) ? (matchedTreasury.accountCode || matchedTreasury.id) : undefined,
      
      // بيانات للمعاينة والشفافية
      rawHeaders: ['م', 'الزبون الرئيسي', 'الزبون الفرعي', 'الصنف', 'ملاحظات', 'المطلوب', 'المدفوع', 'الصندوق'],
      rawRowCells: [[
        row.serialNumber || idx + 1,
        row.customerName || '',
        row.subCustomerName || '',
        row.itemName || '',
        row.notes || '',
        reqAmt,
        paidAmt,
        row.treasuryName || matchedTreasury?.name || ''
      ]]
    };

    // مطابقة ذكية مع قواعد البيانات المخزنة
    return autoMatchDraftEntities(draft, parties, inventory, treasuries as any);
  });
}

/**
 * حساب إجماليات كشف الإدخال اليومي
 */
export function calculateDailyEntryTotals(rows: DailyEntryRow[]) {
  let totalRequired = 0;
  let totalPaid = 0;
  const treasuryBreakdown: Record<string, { name: string; amount: number; count: number }> = {};

  rows.forEach(r => {
    const req = Number(r.requiredAmount || 0);
    const paid = Number(r.paidAmount || 0);
    totalRequired += req;
    totalPaid += paid;

    if (paid > 0) {
      const tKey = r.treasuryId || r.treasuryName || 'other';
      const tName = r.treasuryName || 'الصندوق النقدي';
      if (!treasuryBreakdown[tKey]) {
        treasuryBreakdown[tKey] = { name: tName, amount: 0, count: 0 };
      }
      treasuryBreakdown[tKey].amount += paid;
      treasuryBreakdown[tKey].count += 1;
    }
  });

  return {
    totalRequired,
    totalPaid,
    totalRemaining: Math.max(0, totalRequired - totalPaid),
    rowsCount: rows.length,
    validRowsCount: rows.filter(r => (r.customerName && r.customerName.trim()) || (r.itemName && r.itemName.trim()) || r.requiredAmount > 0).length,
    treasuryBreakdown
  };
}
