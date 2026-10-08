const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

const printTechRegex = /id: 'role-print-tech',[\s\S]*?permissions: \{([\s\S]*?)\},/;
content = content.replace(printTechRegex, (match, perms) => {
  let newPerms = perms.replace(/view_dashboard: true,/g, 'view_dashboard: false,');
  newPerms = newPerms.replace(/view_pos: true,/g, 'view_pos: false,');
  newPerms = newPerms.replace(/view_invoices: true,/g, 'view_invoices: false,');
  newPerms = newPerms.replace(/view_inventory: true,/g, 'view_inventory: false,');
  newPerms = newPerms.replace(/view_accounting: true,/g, 'view_accounting: false,');
  newPerms = newPerms.replace(/view_reports: true,/g, 'view_reports: false,');
  newPerms = newPerms.replace(/view_settings: true,/g, 'view_settings: false,');
  
  return match.replace(perms, newPerms);
});

fs.writeFileSync(file, content);
