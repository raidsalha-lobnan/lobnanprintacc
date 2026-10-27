const fs = require('fs');
const path = require('path');

const masterPath = path.join(__dirname, '..', 'master_drive_database_snapshot.json');
const publicPath = path.join(__dirname, '..', 'public', 'master_drive_database_snapshot.json');
const initialDataPath = path.join(__dirname, '..', 'src', 'data', 'initialData.ts');

console.log('1. Reading authoritative master database snapshot...');
const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

console.log('2. Syncing master database to public directory...');
fs.writeFileSync(publicPath, JSON.stringify(masterData, null, 2), 'utf8');

console.log('3. Updating src/data/initialData.ts to import authoritatively from master_drive_database_snapshot.json...');

const initialDataTsContent = `import { Account, InventoryItem, Party, PrintJobOrder, Invoice, PurchaseInvoice, PurchaseReturn, SalesReturn, JournalEntry, PaymentVoucher, Employee, EmployeeAdvance, EmployeeDeduction, EmployeeIncentive, PayrollSheet, Treasury, Company, Branch, Warehouse, SystemUser, Role, DebtClearingRecord, ExpenseItem, BusinessSettings, StockMovement } from '../types';
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
export const initialTreasuries: Treasury[] = Array.isArray(snap.treasuries) ? snap.treasuries : [];
export const initialVouchers: PaymentVoucher[] = Array.isArray(snap.vouchers) ? snap.vouchers : [];
export const initialStockMovements: StockMovement[] = Array.isArray(snap.stockMovements) ? snap.stockMovements : [];
export const initialExpenses: ExpenseItem[] = Array.isArray(snap.expenses) ? snap.expenses : [];
`;

fs.writeFileSync(initialDataPath, initialDataTsContent, 'utf8');
console.log('✓ Successfully unified master database snapshot across the entire application!');
