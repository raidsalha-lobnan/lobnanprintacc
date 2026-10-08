const fs = require('fs');
let text = fs.readFileSync('src/context/AccountingContext.tsx', 'utf8');

const newFn = `
  const deleteInventoryItem = (id: string): { success: boolean; message: string } => {
    const hasMovements = stockMovements.some(m => m.itemId === id);
    if (hasMovements) {
      return { success: false, message: 'لا يمكن حذف الصنف لوجود حركات (وارد/منصرف) مسجلة عليه.' };
    }
    
    const usedInInvoices = invoices.some(inv => inv.items.some(i => i.itemId === id));
    if (usedInInvoices) {
       return { success: false, message: 'لا يمكن حذف الصنف لوجوده في فواتير مبيعات سابقة.' };
    }
    
    const usedInPurchases = purchases.some(p => p.items.some(i => i.itemId === id));
    if (usedInPurchases) {
       return { success: false, message: 'لا يمكن حذف الصنف لوجوده في فواتير مشتريات سابقة.' };
    }

    setInventory(prev => prev.filter(it => it.id !== id));
    return { success: true, message: 'تم حذف الصنف بنجاح' };
  };

  const adjustStock = `;

text = text.replace('  const adjustStock = ', newFn);
fs.writeFileSync('src/context/AccountingContext.tsx', text);
