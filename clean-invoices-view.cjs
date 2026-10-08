const fs = require('fs');
const file = 'src/components/InvoicesView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/import \{ InvoiceEditModal \} from '\.\/pos\/InvoiceEditModal';\n/, '');
content = content.replace(/\s*const \[editingInvoice, setEditingInvoice\] = useState<Invoice \| null>\(null\);\n/, '\n');

const modalRegex = /\s*\{\/\* Invoice Edit Modal \*\/\}\n\s*\{editingInvoice && \(\n\s*<InvoiceEditModal\n\s*invoice=\{editingInvoice\}\n\s*isOpen=\{!!editingInvoice\}\n\s*onClose=\{\(\) => setEditingInvoice\(null\)\}\n\s*\/>\n\s*\)\}/g;

content = content.replace(modalRegex, '');

fs.writeFileSync(file, content);
