import { Invoice, JournalEntry, PaymentVoucher, StockMovement } from '../types';

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
  const updatedInvoices = [...localInvoices];
  const updatedJournalEntries = [...journalEntries];
  const updatedVouchers = [...vouchers];
  const updatedStockMovements = [...stockMovements];

  // 1. Get max invoice number on server
  let maxInvoiceNumber = 0;
  serverInvoices.forEach(inv => {
    const num = parseInt(inv.invoiceNumber);
    if (!isNaN(num) && num > maxInvoiceNumber) {
      maxInvoiceNumber = num;
    }
  });

  // 2. Identify and resolve conflicts
  const serverInvoiceMap = new Map(serverInvoices.map(inv => [inv.invoiceNumber, inv]));

  updatedInvoices.forEach(inv => {
    // Check if this invoice number is already taken by a *different* invoice on server
    const conflict = serverInvoiceMap.get(inv.invoiceNumber);
    
    if (conflict && conflict.id !== inv.id) {
      // Conflict detected!
      const oldNumber = inv.invoiceNumber;
      maxInvoiceNumber++;
      const newNumber = maxInvoiceNumber.toString();
      
      inv.invoiceNumber = newNumber;
      
      // Update references in other entities
      updatedJournalEntries.forEach(entry => {
        if (entry.referenceId === inv.id) {
           // If journal entry references the invoice number somehow, update it.
           // Based on type, it uses referenceId, so maybe this isn't needed?
           // Let's assume we might need to update description or something.
           if (entry.description.includes(oldNumber)) {
             entry.description = entry.description.replace(oldNumber, newNumber);
           }
        }
      });
      
      // Update vouchers if they reference invoice number
      updatedVouchers.forEach(v => {
        if (v.referenceId === inv.id) {
          if (v.notes && v.notes.includes(oldNumber)) {
            v.notes = v.notes.replace(oldNumber, newNumber);
          }
        }
      });

      // Update stock movements if they reference invoice number
      updatedStockMovements.forEach(sm => {
         if (sm.referenceType === 'pos_invoice' && sm.referenceNumber === oldNumber) {
             sm.referenceNumber = newNumber;
         }
      });
    }
  });

  return { updatedInvoices, updatedJournalEntries, updatedVouchers, updatedStockMovements };
}
