const fs = require('fs');
const file = 'src/components/pos/PosDailyInvoicesSidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

// Just print the imports to see them
const imports = content.match(/import .*?;/gs);
console.log(imports.join('\n'));

