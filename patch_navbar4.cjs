const fs = require('fs');
let text = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

text = text.replace(
  /\{\/\* Dropdown Menu Bar \(سطر القوائم العرضي المنسدلة في أعلى البرنامج\)\ \*\/}/,
  '</div>\n      </div>\n      {/* Dropdown Menu Bar (سطر القوائم العرضي المنسدلة في أعلى البرنامج) */}'
);

fs.writeFileSync('src/components/Navbar.tsx', text);
