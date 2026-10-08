const fs = require('fs');
let text = fs.readFileSync('src/data/initialData.ts', 'utf8');

const importAdd = `import { CATEGORY_DEFINITIONS } from '../utils/barcodeGenerator';\n`;

const newSettings = `export const initialSettings: BusinessSettings = {
  categories: Object.values(CATEGORY_DEFINITIONS),`;

text = text.replace(/export const initialSettings: BusinessSettings = \{/, newSettings);

if (!text.includes('CATEGORY_DEFINITIONS')) {
  // It shouldn't happen because we just added it to the settings object replacement
}

text = importAdd + text;

fs.writeFileSync('src/data/initialData.ts', text);
