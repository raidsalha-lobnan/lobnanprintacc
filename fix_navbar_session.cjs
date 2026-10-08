const fs = require('fs');
const file = 'src/components/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');",
  "localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');\n                    localStorage.removeItem('active_session_id');"
);

fs.writeFileSync(file, content);
