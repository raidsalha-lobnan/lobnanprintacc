const fs = require('fs');
let text = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// Replace the right toolbar buttons (Home and Sync)
const rightToolbarRegex = /<button\s*onClick=\{\(\) => setActiveTab\('home'\)\}[\s\S]*?<\/button>\s*<div className="h-4 w-px bg-slate-700 mx-0\.5 hidden sm:block"><\/div>\s*\{\/\* Offline-First & Primary Cloud Database Sync Widget \*\/\}[\s\S]*?<\/button>/;

text = text.replace(rightToolbarRegex, '');

fs.writeFileSync('src/components/Navbar.tsx', text);
