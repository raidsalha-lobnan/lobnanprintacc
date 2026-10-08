const fs = require('fs');
let text = fs.readFileSync('src/types/index.ts', 'utf8');
text = text.replace(/export type ItemCategory = string; \/\/[^;]+;/s, "export type ItemCategory = string;");
fs.writeFileSync('src/types/index.ts', text);
