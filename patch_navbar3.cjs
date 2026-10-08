const fs = require('fs');
let text = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

const regex = /\{\/\* Dynamic Active User Persona Switcher \*\/\}[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*\{\/\* Dropdown Menu Bar)/;
text = text.replace(regex, '');

fs.writeFileSync('src/components/Navbar.tsx', text);
