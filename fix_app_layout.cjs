const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const layoutChange = `const MainLayout: React.FC = () => {
  const { activeTab, setActiveTab, hasPermission } = useAccounting();

  // Enforce screen permissions
  React.useEffect(() => {
    const isAllowed = () => {
      switch(activeTab) {
        case 'home':
        case 'dashboard':
          return hasPermission('view_dashboard');
        case 'pos':
          return hasPermission('view_pos');
        case 'print_orders':
          return hasPermission('view_print_orders');
        case 'invoices':
        case 'sales_returns':
          return hasPermission('view_invoices');
        case 'inventory':
        case 'warehouses':
        case 'purchases':
        case 'purchases_invoices':
        case 'purchases_suppliers':
        case 'purchases_returns':
          return hasPermission('view_inventory');
        case 'accounting':
        case 'receipt_vouchers':
        case 'payment_vouchers':
        case 'expenses':
        case 'debt_clearing':
        case 'treasuries':
          return hasPermission('view_accounting');
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
          return hasPermission('view_reports');
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
          return hasPermission('view_settings');
        default:
          return true;
      }
    };

    if (!isAllowed()) {
      if (hasPermission('view_pos')) setActiveTab('pos');
      else if (hasPermission('view_print_orders')) setActiveTab('print_orders');
      else if (hasPermission('view_dashboard')) setActiveTab('dashboard');
      else setActiveTab('settings');
    }
  }, [activeTab, hasPermission, setActiveTab]);
`;

content = content.replace(/const MainLayout: React\.FC = \(\) => \{\n\s*const \{ activeTab, settings \} = useAccounting\(\);/, layoutChange.replace('const { activeTab, setActiveTab, hasPermission } = useAccounting();', 'const { activeTab, settings, setActiveTab, hasPermission } = useAccounting();'));

fs.writeFileSync(file, content);
