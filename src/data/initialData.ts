import { Account, InventoryItem, Party, PrintJobOrder, Invoice, PurchaseInvoice, PurchaseReturn, SalesReturn, JournalEntry, PaymentVoucher, Employee, EmployeeAdvance, EmployeeDeduction, EmployeeIncentive, PayrollSheet, Treasury, Company, Branch, Warehouse, SystemUser, Role, DebtClearingRecord, ExpenseItem, BusinessSettings, StockMovement } from '../types';
import masterSnapshot from '../../master_drive_database_snapshot.json';

const snap: any = masterSnapshot || {};

export const initialSettings: BusinessSettings = snap.settings || {
  businessName: 'مطبعة ومكتبة لبنان',
  businessNameEn: 'Lobnan Press & Library',
  activityType: 'مطبعة ومكتبة ومستلزمات دعاية وإعلان',
  currency: '₪',
  baseCurrencyCode: 'ILS',
  vatRate: 0,
  invoiceFooterNote: 'شكراً لتعاملكم معنا - نسعد بخدمتكم دائماً',
  logoText: 'مطبعة ومكتبة لبنان',
  phone: '0590000000',
  email: 'raid.salha@gmail.com',
  address: 'فلسطين - غزة - دير البلح'
};

export const initialAccounts: Account[] = Array.isArray(snap.accounts) ? snap.accounts : [];
export const initialInventory: InventoryItem[] = Array.isArray(snap.inventory) ? snap.inventory : [];
export const initialParties: Party[] = Array.isArray(snap.parties) ? snap.parties : [];
export const initialPrintOrders: PrintJobOrder[] = Array.isArray(snap.printOrders) ? snap.printOrders : [];
export const initialInvoices: Invoice[] = Array.isArray(snap.invoices) ? snap.invoices : [];
export const initialPurchases: PurchaseInvoice[] = Array.isArray(snap.purchases) ? snap.purchases : [];
export const initialPurchaseReturns: PurchaseReturn[] = Array.isArray(snap.purchaseReturns) ? snap.purchaseReturns : [];
export const initialSalesReturns: SalesReturn[] = Array.isArray(snap.salesReturns) ? snap.salesReturns : [];
export const initialJournalEntries: JournalEntry[] = Array.isArray(snap.journalEntries) ? snap.journalEntries : [];
export const initialEmployees: Employee[] = Array.isArray(snap.employees) ? snap.employees : [];
export const initialEmployeeAdvances: EmployeeAdvance[] = Array.isArray(snap.employeeAdvances) ? snap.employeeAdvances : [];
export const initialEmployeeDeductions: EmployeeDeduction[] = Array.isArray(snap.employeeDeductions) ? snap.employeeDeductions : [];
export const initialEmployeeIncentives: EmployeeIncentive[] = Array.isArray(snap.employeeIncentives) ? snap.employeeIncentives : [];
export const initialPayrollSheets: PayrollSheet[] = Array.isArray(snap.payrollSheets) ? snap.payrollSheets : [];
const rawSnapTreasuries: Treasury[] = Array.isArray(snap.treasuries) ? snap.treasuries : [];

export const initialTreasuries: Treasury[] = [
  {
    id: 'treasury-cash-main',
    name: 'الصندوق النقدي الرئيسي (الكاشير)',
    type: 'cash_box',
    balance: 800,
    accountCode: 'CASH-1101',
    isDefault: true,
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: rawSnapTreasuries.find(t => t.accountCode === '1101' || t.accountCode === 'CASH-1101' || t.id === 'treasury-cash-main')?.transactions || []
  },
  {
    id: 'treasury-1791395958513',
    name: 'طلة لبنان - محفظة جوال باي',
    type: 'digital_wallet',
    balance: 165,
    accountCode: 'CASH-1102',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: rawSnapTreasuries.find(t => t.accountCode === '1103' || t.accountCode === 'CASH-1102' || t.id === 'treasury-1791395958513')?.transactions || []
  },
  {
    id: 'treasury-1791324119020',
    name: 'محفظة بال باي - PalPay',
    type: 'digital_wallet',
    balance: 0,
    accountCode: 'CASH-1103',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: rawSnapTreasuries.find(t => t.accountCode === '1104' || t.accountCode === 'CASH-1103' || t.id === 'treasury-1791324119020')?.transactions || []
  },
  {
    id: 'treasury-1790639512764',
    name: 'بنك فلسطين - ماهر صالحة 0599992615',
    type: 'bank_account',
    balance: 2112,
    accountCode: 'CASH-1104',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: rawSnapTreasuries.find(t => t.accountCode === '1105' || t.accountCode === 'CASH-1104' || t.id === 'treasury-1790639512764')?.transactions || []
  },
  {
    id: 'treasury-1791395958599-1107',
    name: 'رائد صالحة - جوال باي - بال باي - مال شات',
    type: 'digital_wallet',
    balance: 0,
    accountCode: 'CASH-1105',
    status: 'active',
    currency: 'ILS',
    currencySymbol: '₪',
    createdAt: '2024-01-01',
    transactions: []
  }
];
export const initialVouchers: PaymentVoucher[] = Array.isArray(snap.vouchers) ? snap.vouchers : [];
export const initialStockMovements: StockMovement[] = Array.isArray(snap.stockMovements) ? snap.stockMovements : [];
export const initialExpenses: ExpenseItem[] = Array.isArray(snap.expenses) ? snap.expenses : [];
