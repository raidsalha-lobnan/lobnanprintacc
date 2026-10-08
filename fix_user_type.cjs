const fs = require('fs');
const file = 'src/types/companyBranchUser.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "  email?: string;",
  "  email?: string;\n  password?: string;"
);

fs.writeFileSync(file, content);
