const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\s*setEditingPosInvoiceId\(null\);\n/g, '\n');

fs.writeFileSync(file, content);
