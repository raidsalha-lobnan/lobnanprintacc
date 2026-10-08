import { CATEGORY_DEFINITIONS } from '../utils/barcodeGenerator';
import {
  Account,
  InventoryItem,
  Party,
  PrintJobOrder,
  Invoice,
  PurchaseInvoice,
  PurchaseReturn,
  SalesReturn,
  JournalEntry,
  PaymentVoucher,
  BusinessSettings,
  Employee,
  EmployeeAdvance,
  EmployeeDeduction,
  EmployeeIncentive,
  PayrollSheet,
  Treasury,
  StockMovement,
  ExpenseItem
} from '../types';
import { defaultCurrencies } from '../utils/currencies';
import { defaultUnitsOfMeasure } from '../utils/unitsOfMeasure';

export const initialSettings: BusinessSettings = {
  appTitle: 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة',
  categories: Object.values(CATEGORY_DEFINITIONS),
  businessName: 'مطبعة ومكتبة لبنان',
  businessNameEn: 'Lebanon Press & Bookstore',
  activityType: 'خدمات الطباعة والنشر والقرطاسية والأدوات المدرسية والمكتبية',
  taxNumber: '',
  crNumber: '',
  phone: '0592840352',
  email: 'lobnanprint@gmail.com',
  address: 'غزة - الشيخ رضوان - مفترق الغزالي',
  addresses: [
    'المقر الرئيسي والمطبعة: غزة - الشيخ رضوان - مفترق الغزالي'
  ],
  phones: [
    '0592840352'
  ],
  name: 'مطبعة ومكتبة لبنان',
  description: 'طباعة أوفست وديجيتال - خامات ومطبوعات وأدوات قرطاسية متكاملة',
  currency: '₪',
  baseCurrencyCode: 'ILS',
  vatRate: 16,
  invoiceFooterNote: 'شكراً لتعاملكم معنا. المواد المطبوعة بحسب المواصفات المعتمدة لا ترد ولا تستبدل بعد التسليم.',
  logoText: 'لبنان',
  currencies: defaultCurrencies,
  unitsOfMeasure: defaultUnitsOfMeasure,
  sqlServerConfig: {
    enabled: false,
    serverUrl: 'http://localhost:3000/api/sync',
    dbType: 'postgres',
    dbName: 'lobnan_press_db',
    autoSync: false,
    syncIntervalMinutes: 30
  },
  homeShortcuts: [
    'pos',
    'customer_statement',
    'supplier_statement',
    'new_invoice',
    'new_print_order',
    'payment_voucher',
    'receipt_voucher',
    'purchases',
    'inventory',
    'treasury_transfer',
    'dashboard_info',
    'reports'
  ]
};

export const initialAccounts: Account[] = [
  // 1. الأصول (Assets)
  { code: '1101', name: 'الصندوق النقدي (الكاشير الرئيسي)', type: 'asset', balance: 0, isSystem: true, description: 'السيولة النقدية في الخزينة والكاشير' },
  { code: '1102', name: 'الحساب البنكي (شيكات وحوالات)', type: 'asset', balance: 0, isSystem: true, description: 'الحساب البنكي الجاري والشيكات الواردة' },
  { code: '1103', name: 'أجهزة ونقاط الدفع الإلكتروني (POS)', type: 'asset', balance: 0, isSystem: true, description: 'متحصلات بطاقات الدفع الإلكتروني والفيزا' },
  { code: '1104', name: 'سلف ومستحقات الموظفين', type: 'asset', balance: 0, isSystem: true, description: 'سلف الموظفين المعلقة للخصم من الرواتب' },
  { code: '1201', name: 'العملاء والذمم المدينة', type: 'asset', balance: 0, isSystem: true, description: 'مستحقات آجلة وعرابين متبقية على العملاء' },
  { code: '1301', name: 'مخزون المواد الخام والقرطاسية', type: 'asset', balance: 0, isSystem: true, description: 'قيمة مخزون البضائع والأدوات المكتبية المتاحة' },
  { code: '1302', name: 'مخزون خامات وأوراق وماكينات المطبعة', type: 'asset', balance: 0, isSystem: true, description: 'رولات وخامات الطباعة والأحبار' },
  { code: '1501', name: 'آلات ومعدات وماكينات الطباعة', type: 'asset', balance: 0, isSystem: true, description: 'ماكينات الطباعة الرقمية ومقصات الورق والتجليد' },
  
  // 2. الخصوم (Liabilities)
  { code: '2101', name: 'الموردون والذمم الدائنة', type: 'liability', balance: 0, isSystem: true, description: 'مستحقات موردي الخامات والأوراق والأحبار' },
  { code: '2103', name: 'أمانات ضريبة القيمة المضافة (VAT)', type: 'liability', balance: 0, isSystem: true, description: 'صافي أمانات ضريبة القيمة المضافة' },
  { code: '2104', name: 'أمانات ومستحقات خدمة التوصيل', type: 'liability', balance: 0, isSystem: true, description: 'مستحقات التوصيل المحصلة من الزبائن لصالح عمال التوصيل' },
  
  // 3. حقوق الملكية (Equity)
  { code: '3101', name: 'رأس المال الموظف', type: 'equity', balance: 0, isSystem: true, description: 'رأس المال المؤسس للمنشأة' },
  { code: '3102', name: 'جاري المالك (م. رائد صالحة)', type: 'equity', balance: 0, isSystem: true, description: 'المسحوبات الشخصية وتغذية رأس المال الخاصة بالمالك' },
  { code: '3201', name: 'الأرباح والخسائر المبقاة والمرحلة', type: 'equity', balance: 0, isSystem: true, description: 'الأرباح المتراكمة من الفترات السابقة' },
  
  // 4. الإيرادات (Revenue)
  { code: '4101', name: 'إيرادات مبيعات المكتبة والقرطاسية', type: 'revenue', balance: 0, isSystem: true, description: 'مبيعات الكاشير من الأدوات المكتبية والقرطاسية' },
  { code: '4102', name: 'إيرادات أعمال ومطبوعات المطبعة', type: 'revenue', balance: 0, isSystem: true, description: 'إيرادات عقود الكروت والبروشورات واليافطات والطباعة' },
  { code: '4103', name: 'إيرادات خدمات التصوير والطباعة السريعة', type: 'revenue', balance: 0, isSystem: true, description: 'تصوير مستندات وتجليد وطباعة أوراق' },
  { code: '4201', name: 'إيرادات متنوعة وأخرى', type: 'revenue', balance: 0, isSystem: true, description: 'إيرادات متفرقة غير تشغيلية' },
  
  // 5. المصروفات وتكلفة البضاعة (Expenses & COGS)
  { code: '5101', name: 'تكلفة مبيعات القرطاسية والمطبوعات', type: 'expense', balance: 0, isSystem: true, description: 'تكلفة شراء الأصناف المباعة' },
  { code: '5102', name: 'تكلفة خامات وأحبار ومستهلكات الطباعة', type: 'expense', balance: 0, isSystem: true, description: 'قيمة الخامات والأوراق والأحبار المستهلكة في عمليات الطباعة' },
  { code: '5201', name: 'مصروفات الرواتب والأجور', type: 'expense', balance: 0, isSystem: true, description: 'رواتب موظفي المكتبة وفنيي المطبعة' },
  { code: '5202', name: 'إيجار المعرض والمطبعة', type: 'expense', balance: 0, isSystem: true, description: 'إيجار المقر' },
  { code: '5203', name: 'مصروفات الصيانة وقطع غيار الماكينات', type: 'expense', balance: 0, isSystem: true, description: 'صيانة ماكينات الطباعة والتجليد' },
  { code: '5204', name: 'الكهرباء والمياه والإنترنت والوقود', type: 'expense', balance: 0, isSystem: true, description: 'فواتير الطاقة والمرافق والسولار' },
  { code: '5205', name: 'مصروفات عمومية وإدارية وتسويق', type: 'expense', balance: 0, isSystem: true, description: 'مصاريف تشغيلية ونظافة وضيافة' }
];

// Production clean baseline: No mock demo records. Cloud and real user entries only.
export const initialInventory: InventoryItem[] = [];

export const initialParties: Party[] = [];

export const initialPrintOrders: PrintJobOrder[] = [];

export const initialInvoices: Invoice[] = [];

export const initialPurchases: PurchaseInvoice[] = [];

export const initialPurchaseReturns: PurchaseReturn[] = [];

export const initialSalesReturns: SalesReturn[] = [];

export const initialJournalEntries: JournalEntry[] = [];

export const initialEmployees: Employee[] = [];

export const initialEmployeeAdvances: EmployeeAdvance[] = [];

export const initialEmployeeDeductions: EmployeeDeduction[] = [];

export const initialEmployeeIncentives: EmployeeIncentive[] = [];

export const initialPayrollSheets: PayrollSheet[] = [];

export const initialTreasuries: Treasury[] = [
  {
    id: 'treasury-cash-main',
    name: 'الصندوق النقدي (الخزينة الرئيسية)',
    type: 'cash_box',
    accountCode: '1101',
    balance: 0,
    currencyBalances: {
      ILS: 0,
      USD: 0,
      JOD: 0
    },
    isDefault: true,
    status: 'active',
    notes: 'الخزينة النقدية الرئيسية لمكتب المبيعات والكاشير والسيولة متعددة العملات (شيكل، دولار، دينار)',
    createdAt: '2026-01-01',
    transactions: []
  }
];

export const initialVouchers: PaymentVoucher[] = [];

export const initialStockMovements: StockMovement[] = [];

export const initialExpenses: ExpenseItem[] = [];
