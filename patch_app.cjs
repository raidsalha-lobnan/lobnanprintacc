const fs = require('fs');
let text = fs.readFileSync('src/App.tsx', 'utf8');

const search = `return localStorage.getItem('alnoor_press_accounting_v1_current_user_id') || 'usr-1';`;
const replacement = `return localStorage.getItem('alnoor_press_accounting_v1_current_user_id');`;

text = text.replace(search, replacement);
fs.writeFileSync('src/App.tsx', text);
