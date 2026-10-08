const fs = require('fs');
const file = 'src/context/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("status: 'active'", "status: 'active',\n          createdAt: new Date().toISOString()");

fs.writeFileSync(file, content);
