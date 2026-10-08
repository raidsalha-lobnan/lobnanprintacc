const fs = require('fs');
const file = 'src/data/defaultCompanyBranchUserData.ts';
let content = fs.readFileSync(file, 'utf8');

// Fix allPermissionsTrue
const screenPermsTrue = `  view_dashboard: true,
  view_pos: true,
  view_print_orders: true,
  view_invoices: true,
  view_inventory: true,
  view_accounting: true,
  view_reports: true,
  view_settings: true,
  view: true,`;

content = content.replace(/view: true,/, screenPermsTrue);

// For other roles, they should use ...allPermissionsTrue, or their own definitions.
// Let's remove the duplicated view_* from print_tech.
const printTechRegex = /id: 'role-print-tech',[\s\S]*?permissions: \{([\s\S]*?)\},/;
content = content.replace(printTechRegex, (match, perms) => {
  // Just rewrite it entirely.
  const correctedPerms = `
      view_dashboard: false,
      view_pos: false,
      view_print_orders: true,
      view_invoices: false,
      view_inventory: false,
      view_accounting: false,
      view_reports: false,
      view_settings: false,
      view: true,
      add: true,
      edit: true,
      approve: false,
      cancel: false,
      soft_delete: false,
      print: true,
      export: false,
      edit_prices: false,
      edit_cost: false,
      edit_exchange_rate: false,
      create_receipt: false,
      approve_receipt: false,
      create_payment: false,
      approve_payment: false,
      create_clearing: false,
      approve_clearing: false,
      transfer_funds: false,
      close_cash_drawer: false,
      reopen_closed_period: false
    `;
  return match.replace(perms, correctedPerms);
});

fs.writeFileSync(file, content);
