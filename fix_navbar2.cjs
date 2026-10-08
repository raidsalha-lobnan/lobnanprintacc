const fs = require('fs');
const file = 'src/components/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("forceSyncNow\n  } = useAccounting();", "forceSyncNow,\n    hasPermission\n  } = useAccounting();");

fs.writeFileSync(file, content);
