const fs = require('fs');
const file = 'src/context/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    if (extraOptions?.editingInvoiceId) {
      setInvoices(prev => prev.map(inv => inv.id === extraOptions.editingInvoiceId ? newInvoice : inv));
    } else {
      setInvoices(prev => [newInvoice, ...prev]);
    }`;

const replaceStr = `    if (extraOptions?.editingInvoiceId) {
      console.log('UPDATING INVOICE', extraOptions.editingInvoiceId);
      setInvoices(prev => prev.map(inv => inv.id === extraOptions.editingInvoiceId ? newInvoice : inv));
    } else {
      console.log('CREATING NEW INVOICE', newInvoice.id);
      setInvoices(prev => [newInvoice, ...prev]);
    }`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(file, content);
console.log("Console added");
