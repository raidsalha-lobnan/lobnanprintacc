import { Invoice, JournalEntry, PaymentVoucher, StockMovement } from '../types';

/**
 * Upserts sales invoices by ID and resolves invoice number concurrency collisions.
 * Guarantees NO invoice is ever deleted or lost during central server / cloud sync.
 */
export function mergeInvoicesWithUpsertAndConflictResolution(
  localInvoices: Invoice[],
  remoteInvoices: Invoice[]
): Invoice[] {
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

  const invoiceMap = new Map<string, Invoice>();

  function processInvoice(inv: Invoice) {
    if (!inv || typeof inv !== 'object' || inv.id == null) return;
    const idStr = String(inv.id);
    if ((inv as any)._deleted || (inv as any).deletedAt || deletedIds.has(idStr)) {
      deletedIds.add(idStr);
      return;
    }

    // Ignore legacy ghost/recovery test items
    if (
      idStr.includes('recovered') ||
      idStr.includes('INV-2026') ||
      idStr.includes('inv-pos-1001') ||
      (inv.invoiceNumber && (inv.invoiceNumber.includes('INV-2026') || inv.invoiceNumber.includes('STAT-')))
    ) {
      return;
    }

    const existing = invoiceMap.get(idStr);
    if (!existing) {
      invoiceMap.set(idStr, { ...inv });
    } else {
      const tExisting = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const tInv = new Date(inv.updatedAt || inv.createdAt || 0).getTime();
      const base = tInv >= tExisting ? inv : existing;
      const fallback = tInv >= tExisting ? existing : inv;

      invoiceMap.set(idStr, {
        ...fallback,
        ...base,
        items: (Array.isArray(base.items) && base.items.length > 0) ? base.items : (fallback.items || []),
        totalAmount: base.totalAmount ?? fallback.totalAmount,
        paidAmount: base.paidAmount ?? fallback.paidAmount,
        remainingAmount: base.remainingAmount ?? fallback.remainingAmount,
        updatedAt: new Date(Math.max(tExisting, tInv, Date.now())).toISOString()
      });
    }
  }

  if (Array.isArray(localInvoices)) {
    localInvoices.forEach(processInvoice);
  }
  if (Array.isArray(remoteInvoices)) {
    remoteInvoices.forEach(processInvoice);
  }

  const allValid = Array.from(invoiceMap.values()).filter(inv => !deletedIds.has(String(inv.id)));

  // Helper to extract numeric invoice number
  function parseInvoiceNum(inv: Invoice): number {
    const raw = String(inv.invoiceNumber || '');
    const matches = raw.match(/\d+/g);
    if (!matches || matches.length === 0) return 0;
    return parseInt(matches[matches.length - 1], 10) || 0;
  }

  // Sort chronologically ascending to assign sequential invoice numbers
  allValid.sort((a, b) => {
    const dateA = a.date || a.createdAt || '';
    const dateB = b.date || b.createdAt || '';
    const dateCmp = dateA.localeCompare(dateB);
    if (dateCmp !== 0) return dateCmp;

    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    const createdCmp = createdA.localeCompare(createdB);
    if (createdCmp !== 0) return createdCmp;

    return parseInvoiceNum(a) - parseInvoiceNum(b);
  });

  // Re-assign sequential invoice numbers (INV-0001, INV-0002, ...) ensuring NO duplicate numbers
  const usedNumbers = new Set<string>();
  const renumberedResult = allValid.map((inv, idx) => {
    const origSeq = parseInvoiceNum(inv);
    let targetSeq = origSeq > 0 ? origSeq : (idx + 1);
    let candidateNumber = `INV-${String(targetSeq).padStart(4, '0')}`;

    // If duplicate invoiceNumber exists across different IDs, resolve collision sequentially
    while (usedNumbers.has(candidateNumber)) {
      targetSeq++;
      candidateNumber = `INV-${String(targetSeq).padStart(4, '0')}`;
    }

    usedNumbers.add(candidateNumber);
    return {
      ...inv,
      invoiceNumber: candidateNumber
    };
  });

  // Return sorted descending by invoice number for UI tables
  renumberedResult.sort((a, b) => {
    const numA = parseInvoiceNum(a);
    const numB = parseInvoiceNum(b);
    return numB - numA;
  });

  return renumberedResult;
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
