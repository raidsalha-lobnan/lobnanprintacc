const fs = require('fs');
const file = 'src/components/Sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("    {\n          {\n      id: 'manual_invoices',", "    {\n      id: 'manual_invoices',");
fs.writeFileSync(file, content);
