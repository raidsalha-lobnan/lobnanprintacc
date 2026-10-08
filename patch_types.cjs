const fs = require('fs');
let text = fs.readFileSync('src/types/index.ts', 'utf8');

text = text.replace(/taxNumber: string;\n\s*crNumber: string;/, `taxNumber?: string;\n  crNumber?: string;\n  showTaxNumberInPrints?: boolean;\n  showCrNumberInPrints?: boolean;`);

fs.writeFileSync('src/types/index.ts', text);
