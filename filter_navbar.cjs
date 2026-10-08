const fs = require('fs');
const file = 'src/components/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace map of menuSections with a filtered list based on permissions
const filterCode = `
  const filterMenuItems = (sections: TopMenuSection[]): TopMenuSection[] => {
    return sections.map(section => {
      const filteredItems = section.items.filter(item => {
        if (!item) return false;
        
        // Define screen permissions based on tab id
        let reqPerm: string | null = null;
        switch(item.id) {
          case 'home':
          case 'dashboard':
            reqPerm = 'view_dashboard';
            break;
          case 'pos':
            reqPerm = 'view_pos';
            break;
          case 'print_orders':
            reqPerm = 'view_print_orders';
            break;
          case 'invoices':
          case 'sales_returns':
            reqPerm = 'view_invoices';
            break;
          case 'inventory':
          case 'warehouses':
          case 'purchases':
          case 'purchases_invoices':
          case 'purchases_suppliers':
          case 'purchases_returns':
            reqPerm = 'view_inventory';
            break;
          case 'accounting':
          case 'receipt_vouchers':
          case 'payment_vouchers':
          case 'expenses':
          case 'debt_clearing':
          case 'treasuries':
            reqPerm = 'view_accounting';
            break;
          case 'reports':
          case 'report_customer_statement':
          case 'report_supplier_statement':
          case 'report_employee_statement':
          case 'report_customer_items':
          case 'report_supplier_items':
          case 'report_receipt_vouchers':
          case 'report_payment_vouchers':
          case 'report_payroll_sheets':
          case 'report_treasuries_movement':
            reqPerm = 'view_reports';
            break;
          case 'settings':
          case 'settings_general':
          case 'settings_sql':
          case 'settings_backup':
          case 'users_permissions':
          case 'branches':
          case 'parties':
          case 'employees':
          case 'employees_adjustments':
          case 'employees_payroll':
            reqPerm = 'view_settings';
            break;
        }
        
        if (reqPerm) {
           return hasPermission(reqPerm as any);
        }
        return true;
      });
      return { ...section, items: filteredItems };
    }).filter(section => section.items.length > 0);
  };

  const visibleMenuSections = filterMenuItems(menuSections);
`;

content = content.replace(/const isSectionActive = \(section: TopMenuSection\) => \{/g, filterCode + '\n  const isSectionActive = (section: TopMenuSection) => {');

content = content.replace(/\{menuSections\.map\(\(section\)/g, '{visibleMenuSections.map((section)');

fs.writeFileSync(file, content);
