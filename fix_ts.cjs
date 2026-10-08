const fs = require('fs');
const file = 'src/components/pos/PosDailyInvoicesSidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'onChange={e => handleChangeStatus(inv, e.target.value)}',
  'onChange={e => handleChangeStatus(inv, e.target.value as PosInvoiceWorkflowStatus)}'
);

fs.writeFileSync(file, content);
console.log("Fixed TS");
