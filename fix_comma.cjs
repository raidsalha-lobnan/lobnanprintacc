const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/view: true\s*add: true,/g, 'view: true,\n  add: true,');

fs.writeFileSync(file, content);
