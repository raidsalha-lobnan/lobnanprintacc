const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

// Match id, companyId, username, fullName, email
// and replace username with email value
content = content.replace(/username: '([^']+)',([\s\S]*?)email: '([^']+)',/g, function(match, p1, p2, p3) {
  return `username: '${p3}',${p2}email: '${p3}',`;
});

fs.writeFileSync(file, content);
