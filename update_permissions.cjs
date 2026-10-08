const fs = require('fs');
const file = 'src/types/companyBranchUser.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace PermissionKey
const newPermissions = `  | 'view'                    // مشاهدة
  | 'view_dashboard'
  | 'view_pos'
  | 'view_print_orders'
  | 'view_invoices'
  | 'view_inventory'
  | 'view_accounting'
  | 'view_reports'
  | 'view_settings'`;

content = content.replace(/\|\ 'view'\s*\/\/ مشاهدة/, newPermissions);

const newDefs = `  // صلاحيات الشاشات
  { key: 'view_dashboard', label: 'الرئيسية', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى الشاشة الرئيسية ولوحة القيادة' },
  { key: 'view_pos', label: 'نقطة البيع', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى شاشة الكاشير ونقاط البيع' },
  { key: 'view_print_orders', label: 'أوامر الطباعة والورشة', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى أوامر الطباعة وشاشة الورشة' },
  { key: 'view_invoices', label: 'الفواتير والمبيعات', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى سجل الفواتير والمردودات' },
  { key: 'view_inventory', label: 'المخزون والمستودعات', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى المخازن والأصناف والمشتريات' },
  { key: 'view_accounting', label: 'الحسابات والمالية', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى شجرة الحسابات، السندات، والمصروفات' },
  { key: 'view_reports', label: 'التقارير', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول إلى التقارير الشاملة' },
  { key: 'view_settings', label: 'الإعدادات والصلاحيات', category: 'screens', categoryLabel: 'الشاشات والقوائم', description: 'الوصول لإعدادات النظام، المستخدمين، والصلاحيات' },
  
  // عام وسجلات
  { key: 'view', label: 'مشاهدة عامة', category: 'general', categoryLabel: 'عام وإدارة السجلات', description: 'مشاهدة السجلات في الشاشات المسموح بها' },`;

content = content.replace(/\/\/\s*عام وسجلات\s*\{\s*key:\s*'view',\s*label:\s*'مشاهدة',\s*category:\s*'general',\s*categoryLabel:\s*'عام وإدارة السجلات',\s*description:\s*'استعراض البيانات والسجلات والشاشات وقوائم النظام'\s*\},/, newDefs);

const categoryType = `category: 'general' | 'sales_inventory' | 'finance_treasury' | 'accounting_system' | 'screens';`;
content = content.replace(/category:\ 'general'\ \|\ 'sales_inventory'\ \|\ 'finance_treasury'\ \|\ 'accounting_system';/, categoryType);

fs.writeFileSync(file, content);
