const fs = require('fs');
const file = 'src/components/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "import('../firebase').then(({ auth }) => auth.signOut());",
  "import('../firebase').then(({ auth }) => auth.signOut());\n                    localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');\n                    window.location.reload();"
);

fs.writeFileSync(file, content);
