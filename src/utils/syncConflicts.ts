import { Invoice, JournalEntry, PaymentVoucher, StockMovement } from '../types';

/**
 * Upserts sales invoices by ID and resolves invoice number concurrency collisions.
 * Guarantees NO invoice is ever deleted or lost during central server / cloud sync.
 */
export function mergeInvoicesWithUpsertAndConflictResolution(
  localInvoices: Invoice[],
  remoteInvoices: Invoice[]
): Invoice[] {
  const map = new Map<string, Invoice>();

  // 1. Load local invoices into map
  if (Array.isArray(localInvoices)) {
    for (const inv of localInvoices) {
      if (inv && inv.id) {
        map.set(String(inv.id), { ...inv });
      }
    }
  }

  // 2. Merge remote invoices with ID-matching in-place update (Upsert)
  if (Array.isArray(remoteInvoices)) {
    for (const remoteInv of remoteInvoices) {
      if (!remoteInv || !remoteInv.id) continue;
      const key = String(remoteInv.id);
      const localInv = map.get(key);

      if (!localInv) {
        // ID does not exist locally: insert new invoice
        map.set(key, { ...remoteInv });
      } else {
        // ID exists: UPDATE in-place rather than overwrite or delete
        const tLocal = new Date(localInv.updatedAt || localInv.createdAt || 0).getTime();
        const tRemote = new Date(remoteInv.updatedAt || remoteInv.createdAt || 0).getTime();

        const base = tRemote >= tLocal ? remoteInv : localInv;
        const fallback = tRemote >= tLocal ? localInv : remoteInv;

        map.set(key, {
          ...fallback,
          ...base,
          // Preserve non-empty items and payment history
          items: (Array.isArray(base.items) && base.items.length > 0) ? base.items : (localInv.items || []),
          payments: (Array.isArray(base.payments) && base.payments.length > 0) ? base.payments : (localInv.payments || []),
          invoiceNumber: base.invoiceNumber || localInv.invoiceNumber,
          customerName: base.customerName || localInv.customerName,
          totalAmount: base.totalAmount ?? localInv.totalAmount,
          finalAmount: base.finalAmount ?? localInv.finalAmount,
          updatedAt: new Date(Math.max(tLocal, tRemote, Date.now())).toISOString()
        });
      }
    }
  }

  const mergedList = Array.from(map.values());

  // 3. Resolve invoice number collisions across distinct IDs
  const numberMap = new Map<string, Invoice>();
  let maxNum = 0;
  for (const inv of mergedList) {
    const rawNum = parseInt((inv.invoiceNumber || '').replace(/\D/g, ''), 10);
    if (!isNaN(rawNum) && rawNum > maxNum) maxNum = rawNum;
  }

  for (const inv of mergedList) {
    const numKey = inv.invoiceNumber || '';
    if (!numKey) continue;
    const existing = numberMap.get(numKey);
    if (!existing) {
      numberMap.set(numKey, inv);
    } else if (existing.id !== inv.id) {
      // Concurrency collision: 2 different invoices created offline with same invoice number
      maxNum++;
      inv.invoiceNumber = String(maxNum);
      numberMap.set(inv.invoiceNumber, inv);
    }
  }

  // Sort descending by invoice number
  mergedList.sort((a, b) => {
    const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numB - numA;
    return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
  });

  return mergedList;
}

export function resolveInvoiceConflicts(
  localInvoices: Invoice[],
  serverInvoices: Invoice[],
  journalEntries: JournalEntry[],
  vouchers: PaymentVoucher[],
  stockMovements: StockMovement[]
): {
  updatedInvoices: Invoice[];
  updatedJournalEntries: JournalEntry[];
  updatedVouchers: PaymentVoucher[];
  updatedStockMovements: StockMovement[];
} {
  const mergedInvoices = mergeInvoicesWithUpsertAndConflictResolution(localInvoices, serverInvoices);
  const updatedJournalEntries = [...journalEntries];
  const updatedVouchers = [...vouchers];
  const updatedStockMovements = [...stockMovements];

  return {
    updatedInvoices: mergedInvoices,
    updatedJournalEntries,
    updatedVouchers,
    updatedStockMovements
  };
}
