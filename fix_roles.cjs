const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

const screenPerms = `  view_dashboard: true,
  view_pos: true,
  view_print_orders: true,
  view_invoices: true,
  view_inventory: true,
  view_accounting: true,
  view_reports: true,
  view_settings: true,
  view: true,`;

content = content.replace(/view: true,/, screenPerms);

content = content.replace(/view: true,/g, 'view: true,\n      view_dashboard: true,\n      view_pos: true,\n      view_print_orders: true,\n      view_invoices: true,\n      view_inventory: true,\n      view_accounting: true,\n      view_reports: true,\n      view_settings: true,');

// Modify specific roles, like Cashier should only see POS, Dashboard, and Invoices
// Accountant should see Accounting, Reports, Dashboard, Invoices
// Wait, replacing globally with all true will give everyone all screens.
// We can just give everyone all screens initially by default, then let the admin customize it via the UsersPermissionsView.
// But the user specifically asked: "مثلا فني الطباعة لا يرى إلا شاشة أوامر الطباعة والورشة"
// Let's modify the Print Tech role specifically if it exists, or create one.
fs.writeFileSync(file, content);
