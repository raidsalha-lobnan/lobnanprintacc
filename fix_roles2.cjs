const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

// The issue is multiple properties with the same name.
// We can parse the object or just use regex to remove duplicates.
// The easiest way is to remove the specific duplicate block I injected.

const dupBlock = `      view_dashboard: true,
      view_pos: true,
      view_print_orders: true,
      view_invoices: true,
      view_inventory: true,
      view_accounting: true,
      view_reports: true,
      view_settings: true,`;

content = content.replace(new RegExp(dupBlock, 'g'), '');
content = content.replace(/    view_dashboard: true,\n  view_pos: true,\n  view_print_orders: true,\n  view_invoices: true,\n  view_inventory: true,\n  view_accounting: true,\n  view_reports: true,\n  view_settings: true,\n  view: true,/g, 'view: true');

// Now let's carefully add the new properties to all roles.
const screenPerms = `view_dashboard: true,
      view_pos: true,
      view_print_orders: true,
      view_invoices: true,
      view_inventory: true,
      view_accounting: true,
      view_reports: true,
      view_settings: true,
      view: true,`;

content = content.replace(/view: true,/g, screenPerms);

// Now apply Print Tech restrictions again
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
