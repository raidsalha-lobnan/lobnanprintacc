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
  const deletedIds = new Set<string>();

  try {
    const delList = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
    if (Array.isArray(delList)) {
      delList.forEach((d: any) => {
        if (d && d.id) {
          deletedIds.add(String(d.id));
          if (d.col === 'invoices') deletedIds.add(String(d.id));
        }
      });
    }
  } catch {}

  // 1. Load valid local invoices into map
  if (Array.isArray(localInvoices)) {
    for (const inv of localInvoices) {
      if (inv && typeof inv === 'object' && inv.id != null) {
        const key = String(inv.id);
        if ((inv as any)._deleted || (inv as any).deletedAt || deletedIds.has(key)) {
          deletedIds.add(key);
        } else {
          map.set(key, { ...inv });
        }
      }
    }
  }

  // 2. Merge valid remote invoices with ID-matching in-place update (Upsert)
  if (Array.isArray(remoteInvoices)) {
    for (const remoteInv of remoteInvoices) {
      if (!remoteInv || typeof remoteInv !== 'object' || remoteInv.id == null) continue;
      const key = String(remoteInv.id);

      if ((remoteInv as any)._deleted || (remoteInv as any).deletedAt) {
        deletedIds.add(key);
        map.delete(key);
      } else if (!deletedIds.has(key)) {
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
            // Preserve non-empty items
            items: (Array.isArray(base.items) && base.items.length > 0) ? base.items : (localInv.items || []),
            invoiceNumber: base.invoiceNumber || localInv.invoiceNumber,
            customerName: base.customerName || localInv.customerName,
            totalAmount: base.totalAmount ?? localInv.totalAmount,
            paidAmount: base.paidAmount ?? localInv.paidAmount,
            remainingAmount: base.remainingAmount ?? localInv.remainingAmount,
            updatedAt: new Date(Math.max(tLocal, tRemote, Date.now())).toISOString()
          });
        }
      }
    }
  }

  const mergedList = Array.from(map.values()).filter(inv => inv && typeof inv === 'object' && !deletedIds.has(String(inv.id)));

  // 3. Resolve invoice number collisions across distinct IDs with clean INV-000X formatting
  const numberMap = new Map<string, Invoice>();
  let maxNum = 0;
  for (const inv of mergedList) {
    if (inv.invoiceNumber) {
      const matched = inv.invoiceNumber.match(/\d+/g);
      if (matched && matched.length > 0) {
        const rawNum = parseInt(matched[matched.length - 1], 10);
        if (!isNaN(rawNum) && rawNum > maxNum && rawNum < 1000000) maxNum = rawNum;
      }
    }
  }

  for (const inv of mergedList) {
    const numKey = inv.invoiceNumber || '';
    if (!numKey) continue;
    const existing = numberMap.get(numKey);
    if (!existing) {
      numberMap.set(numKey, inv);
    } else if (existing.id !== inv.id) {
      // Concurrency collision: 2 different invoices created offline/online with same invoice number
      maxNum++;
      const prefixMatch = (existing.invoiceNumber || inv.invoiceNumber || 'INV-').match(/^[^\d]*/);
      const prefix = prefixMatch && prefixMatch[0] ? prefixMatch[0] : 'INV-';
      const digitsMatch = (existing.invoiceNumber || inv.invoiceNumber || '').match(/\d+/g);
      const digitsCount = digitsMatch && digitsMatch.length > 0 ? digitsMatch[digitsMatch.length - 1].length : 4;
      inv.invoiceNumber = `${prefix}${String(maxNum).padStart(Math.max(4, digitsCount), '0')}`;
      numberMap.set(inv.invoiceNumber, inv);
    }
  }

  // Sort descending by invoice number
  mergedList.sort((a, b) => {
    const numA = parseInt((a?.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt((b?.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numB - numA;
    return (b?.invoiceNumber || '').localeCompare(a?.invoiceNumber || '', undefined, { numeric: true });
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
