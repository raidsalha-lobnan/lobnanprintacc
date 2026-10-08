const fs = require('fs');
let text = fs.readFileSync('src/components/common/PrintHeader.tsx', 'utf8');

const regex1 = /\{settings\.taxNumber && \(/;
const replacement1 = `{(settings.taxNumber && settings.showTaxNumberInPrints !== false) && (`;
text = text.replace(regex1, replacement1);

const regex2 = /\{settings\.crNumber && \(/;
const replacement2 = `{(settings.crNumber && settings.showCrNumberInPrints !== false) && (`;
text = text.replace(regex2, replacement2);

const regex3 = /\{settings\.taxNumber && <div>الرقم الضريبي: \{settings\.taxNumber\}<\/div>\}/;
const replacement3 = `{(settings.taxNumber && settings.showTaxNumberInPrints !== false) && <div>الرقم الضريبي: {settings.taxNumber}</div>}`;
text = text.replace(regex3, replacement3);

const regex4 = /\{settings\.crNumber && <div>سجل تجاري: \{settings\.crNumber\}<\/div>\}/;
const replacement4 = `{(settings.crNumber && settings.showCrNumberInPrints !== false) && <div>سجل تجاري: {settings.crNumber}</div>}`;
text = text.replace(regex4, replacement4);

fs.writeFileSync('src/components/common/PrintHeader.tsx', text);
