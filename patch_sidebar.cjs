const fs = require('fs');
const file = 'src/components/Sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

const newMenuItem = `    {
      id: 'manual_invoices',
      label: 'فاتورة مبيعات يدوية',
      icon: FileText,
      badge: null
    },
`;

content = content.replace("id: 'invoices',", newMenuItem + "    {\n      id: 'invoices',");
fs.writeFileSync(file, content);
console.log('Sidebar.tsx patched');
