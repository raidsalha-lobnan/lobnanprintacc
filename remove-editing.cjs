const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/,\n    editingPosInvoiceId,\n    setEditingPosInvoiceId/g, '');
content = content.replace(/editingInvoiceId: editingPosInvoiceId \|\| undefined,/g, '');
content = content.replace(/\/\/ Handle Edit Mode from InvoicesView\n  useEffect\(\(\) => \{\n    if \(editingPosInvoiceId\) \{\n      const invToEdit = invoices\.find\(inv => inv\.id === editingPosInvoiceId\);\n      if \(invToEdit\) \{\n        loadInvoiceToScreen\(invToEdit\);\n      \}\n    \}\n  \}, \[editingPosInvoiceId, invoices\]\);\n/g, '');
content = content.replace(/\$\{editingPosInvoiceId \? 'bg-rose-600' : 'bg-blue-600'\}/g, 'bg-blue-600');
content = content.replace(/\$\{editingPosInvoiceId \? 'text-rose-200' : 'text-blue-200'\}/g, 'text-blue-200');
content = content.replace(/\{editingPosInvoiceId \? \(\n\s*<span className="text-\[10px\] text-white bg-rose-600 font-bold px-2 py-0\.5 rounded shadow-sm animate-pulse ml-1 shrink-0">وضع التعديل المباشر<\/span>\n\s*\) : \(\n\s*<span className="text-\[10px\] text-slate-500 font-semibold hidden sm:inline">\(تسلسلي موحد\)<\/span>\n\s*\)\}/g, '<span className="text-[10px] text-slate-500 font-semibold hidden sm:inline">(تسلسلي موحد)</span>');

fs.writeFileSync(file, content);
