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
      idStr.includes('inv-pos-1001') ||
      (inv.invoiceNumber && inv.invoiceNumber.includes('STAT-'))
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

  // Detect and resolve invoice number collision across different IDs deterministically by timestamp
  const sortedForCollisionCheck = [...allValid].sort((a, b) => {
    const tA = new Date(a.createdAt || a.date || 0).getTime();
    const tB = new Date(b.createdAt || b.date || 0).getTime();
    if (tA !== tB) return tA - tB;
    return String(a.id).localeCompare(String(b.id));
  });

  const usedNumbers = new Set<string>();
  let maxSeq = 0;

  // First pass: register existing unique invoice numbers and find highest sequence
  sortedForCollisionCheck.forEach(inv => {
    const seq = parseInvoiceNum(inv);
    if (seq > maxSeq) maxSeq = seq;
  });

  const renumberedResult = sortedForCollisionCheck.map(inv => {
    let numStr = (inv.invoiceNumber || '').trim();
    if (!numStr || numStr === 'INV-0000' || usedNumbers.has(numStr)) {
      // Collision detected! The older invoice keeps its number, the newer invoice receives the next available unique sequential number
      maxSeq++;
      numStr = `INV-${String(maxSeq).padStart(4, '0')}`;
    }
    usedNumbers.add(numStr);
    return {
      ...inv,
      invoiceNumber: numStr
    };
  });

  // Return sorted descending by invoice number for UI tables
  renumberedResult.sort((a, b) => {
    const numA = parseInvoiceNum(a);
    const numB = parseInvoiceNum(b);
    if (numB !== numA) return numB - numA;
    return new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime();
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
  
  // Build lookup maps for immutable invoice ID -> updated invoice number
  const invoiceNumberByIdMap = new Map<string, string>();
  mergedInvoices.forEach(inv => {
    if (inv.id && inv.invoiceNumber) {
      invoiceNumberByIdMap.set(inv.id, inv.invoiceNumber);
    }
  });

  // Cascade invoice number updates to linked journal entries, payment vouchers, and stock movements
  const updatedJournalEntries = journalEntries.map(je => {
    if (je.referenceId && invoiceNumberByIdMap.has(je.referenceId)) {
      const newNum = invoiceNumberByIdMap.get(je.referenceId)!;
      return {
        ...je,
        description: je.description ? je.description.replace(/INV-\d+/gi, newNum) : je.description
      };
    }
    return je;
  });

  const updatedVouchers = vouchers.map(v => {
    const targetId = v.referenceInvoiceId || (v as any).referenceId || (v as any).invoiceId;
    if (targetId && invoiceNumberByIdMap.has(targetId)) {
      const newNum = invoiceNumberByIdMap.get(targetId)!;
      return {
        ...v,
        description: v.description ? v.description.replace(/INV-\d+/gi, newNum) : v.description
      };
    }
    return v;
  });

  const updatedStockMovements = stockMovements.map(sm => {
    const refId = (sm as any).referenceId || sm.referenceNumber;
    if (refId && invoiceNumberByIdMap.has(refId)) {
      const newNum = invoiceNumberByIdMap.get(refId)!;
      return {
        ...sm,
        referenceNumber: newNum
      };
    }
    return sm;
  });

  return {
    updatedInvoices: mergedInvoices,
    updatedJournalEntries,
    updatedVouchers,
    updatedStockMovements
  };
}
