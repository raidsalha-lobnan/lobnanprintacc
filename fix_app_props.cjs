const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "<AccountingProvider firebaseUser={firebaseUser} localUserId={localUserId}>",
  "<AccountingProvider>"
);

fs.writeFileSync(file, content);
