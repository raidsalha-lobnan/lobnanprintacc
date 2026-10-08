const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/email: '([^']+)',/g, "email: '$1',\n    password: '123456',");

// Also update username to be their email, as requested
content = content.replace(/username: '([^']+)',\n    fullName/g, "username: '$1',\n    fullName");
// Let's just fix the username field to be identical to email for default users manually? Or just regex?

fs.writeFileSync(file, content);
