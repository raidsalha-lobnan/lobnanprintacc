import { TelegramService } from '../services/TelegramService';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, collection, getDocs, onSnapshot } from 'firebase/firestore';
import {
  Account,
  InventoryItem,
  Party,
  PrintJobOrder,
  Invoice,
  AuditLogEntry,
  PurchaseInvoice,
  PurchaseReturn,
  SalesReturn,
  JournalEntry,
  PaymentVoucher,
  BusinessSettings,
  PaymentMethod,
  Employee,
  EmployeeAdvance,
  EmployeeDeduction,
  EmployeeIncentive,
  PayrollSheet,
  PayrollSheetItem,
  SalaryType,
  SalaryPaymentRecord,
  Treasury,
  TreasuryTransaction,
  CurrencyInfo,
  SqlServerConfig,
  StockMovement,
  StockMovementType,
  InvoicePaymentStatus,
  PosInvoiceWorkflowStatus,
  InvoiceStatusLog,
  Company,
  Branch,
  Warehouse,
  WarehouseType,
  WarehouseStatus,
  WarehouseOperation,
  WarehouseOperationType,
  WarehouseOperationItem,
  Role,
  SystemUser,
  PermissionKey,
  PriceTierKey,
  AllowedPriceTierScope,
  LineAttachment,
  InvoiceTechnicalNote,
  DebtClearingRecord,
  DatabaseZeroingOptions,
  ZeroingExecutionResult,
  ExpenseItem,
  DailyEntryRow,
  DailyEntrySheet,
  RowLockInfo
} from '../types';
import {
  initialSettings,
  initialAccounts,
  initialInventory,
  initialParties,
  initialPrintOrders,
  initialInvoices,
  initialPurchases,
  initialPurchaseReturns,
  initialSalesReturns,
  initialJournalEntries,
  initialVouchers,
  initialEmployees,
  initialEmployeeAdvances,
  initialEmployeeDeductions,
  initialEmployeeIncentives,
  initialPayrollSheets,
  initialTreasuries,
  initialStockMovements,
  initialExpenses
} from '../data/initialData';
import {
  DEFAULT_COMPANIES,
  DEFAULT_BRANCHES,
  DEFAULT_WAREHOUSES,
  DEFAULT_WAREHOUSE_OPERATIONS,
  DEFAULT_ROLES,
  DEFAULT_SYSTEM_USERS
} from '../data/defaultCompanyBranchUserData';
import { defaultCurrencies, fetchLiveExchangeRates } from '../utils/currencies';
import { generateSqlDump, downloadSqlFile, syncWithWebServer } from '../utils/sqlExporter';
import { generateSequentialSku } from '../utils/barcodeGenerator';
import { generateSequentialPartyCode } from '../utils/partyUtils';
import { isInvoiceAccountingEligible, computeInvoicePaymentStatus } from '../utils/invoiceStatusUtils';
import { deleteFileFromGoogleDrive } from '../services/googleDriveService';

interface AccountingContextType {
  settings: BusinessSettings;
  updateSettings: (newSettings: BusinessSettings) => void;
  
  accounts: Account[];
  addAccount: (account: Omit<Account, 'balance'> & { initialBalance?: number }) => void;
  updateAccount: (code: string, updated: Partial<Account>) => void;
  
  // Treasuries & Bank Apps (بند الخزنات والصناديق والتطبيقات البنكية)
  treasuries: Treasury[];
  addTreasury: (treasury: Omit<Treasury, 'id' | 'createdAt'>) => Treasury;
  updateTreasury: (id: string, updated: Partial<Treasury>) => void;
  deleteTreasury: (id: string) => { success: boolean; message?: string };
  transferBetweenTreasuries: (
    sourceTreasuryId: string,
    destTreasuryId: string,
    amount: number,
    notes?: string,
    date?: string,
    currencyCode?: string,
    exchangeRate?: number
  ) => { success: boolean; message?: string };
  depositIntoTreasury: (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    depositorName?: string;
    notes?: string;
    date?: string;
  }) => { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher };
  withdrawFromTreasury: (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    recipientName?: string;
    notes?: string;
    date?: string;
    allowNegativeBalance?: boolean;
  }) => { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher };
  executeTreasuryOperation: (params: {
    operationType: 'deposit' | 'withdrawal' | 'transfer';
    sourceTreasuryId: string;
    destTreasuryId: string;
    amount: number;
    currencyCode: string;
    notes?: string;
    date?: string;
    exchangeRate?: number;
  }) => { success: boolean; message?: string };
  adjustTreasuryBalance: (
    treasuryIdOrCode: string,
    delta: number,
    description: string,
    refType?: TreasuryTransaction['referenceType'],
    refId?: string,
    options?: {
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      voucherNumber?: string;
      partyName?: string;
      date?: string;
    }
  ) => void;
  
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>) => void;
  
  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => InventoryItem;
  updateInventoryItem: (id: string, updated: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => { success: boolean; message: string };
  adjustStock: (id: string, newQuantity: number, reason: string, notes?: string) => void;

  // Stock Ledger & Movements (كارتة حركة المخزون والوارد والمنصرف)
  stockMovements: StockMovement[];
  addStockMovement: (movement: Omit<StockMovement, 'id'>) => void;
  
  parties: Party[];
  addParty: (party: Omit<Party, 'id' | 'balance' | 'code'> & { initialBalance?: number; code?: string }) => Party;
  updateParty: (id: string, updated: Partial<Party>) => void;
  deleteParty: (id: string) => { success: boolean; message?: string };
  selectedPartyForStatement: Party | null;
  setSelectedPartyForStatement: (party: Party | null) => void;
  selectedEmployeeForStatement: Employee | null;
  setSelectedEmployeeForStatement: (employee: Employee | null) => void;

  // Debt Clearings (المقاصة بين عميل ومورد)
  debtClearings: DebtClearingRecord[];
  addDebtClearing: (clearing: Omit<DebtClearingRecord, 'id' | 'createdAt' | 'clearingNumber'>) => { success: boolean; message?: string; record?: DebtClearingRecord };
  updateDebtClearing: (id: string, updated: Partial<DebtClearingRecord>) => { success: boolean; message?: string };
  deleteDebtClearing: (id: string) => { success: boolean; message?: string };

  // Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
  expenses: ExpenseItem[];
  addExpense: (expense: Omit<ExpenseItem, 'id' | 'createdAt'>) => ExpenseItem;
  deleteExpense: (id: string) => void;

  employees: Employee[];
  addEmployee: (emp: Omit<Employee, 'id'>) => Employee;
  updateEmployee: (id: string, updated: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  payEmployeeSalary: (
    employeeId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    note: string,
    type: 'salary' | 'advance',
    period: string
  ) => void;

  // Employee Adjustments & Payroll Sheets
  employeeAdvances: EmployeeAdvance[];
  addEmployeeAdvance: (
    employeeId: string,
    amount: number,
    date: string,
    treasuryAccountCode: string,
    reason: string,
    disburseImmediately: boolean
  ) => void;
  cancelEmployeeAdvance: (id: string) => void;

  employeeDeductions: EmployeeDeduction[];
  addEmployeeDeduction: (employeeId: string, amount: number, date: string, reason: string) => void;
  cancelEmployeeDeduction: (id: string) => void;

  employeeIncentives: EmployeeIncentive[];
  addEmployeeIncentive: (employeeId: string, amount: number, date: string, reason: string) => void;
  cancelEmployeeIncentive: (id: string) => void;

  payrollSheets: PayrollSheet[];
  createDraftPayrollSheet: (
    sheetData: Omit<PayrollSheet, 'id' | 'sheetNumber' | 'createdAt' | 'status'>
  ) => PayrollSheet;
  updateDraftPayrollSheet: (id: string, updated: Partial<PayrollSheet>) => void;
  deleteDraftPayrollSheet: (id: string) => void;
  approveAndDisbursePayrollSheet: (id: string, treasuryAccountCode?: string) => { success: boolean; message?: string };
  unapprovePayrollSheet: (id: string) => { success: boolean; message?: string };
  selectedPayrollSheetForPrint: PayrollSheet | null;
  setSelectedPayrollSheetForPrint: (sheet: PayrollSheet | null) => void;
  
  printOrders: PrintJobOrder[];
  createPrintOrder: (order: Omit<PrintJobOrder, 'id' | 'orderNumber' | 'createdAt'>) => string;
  updatePrintOrderStatus: (id: string, newStatus: PrintJobOrder['status']) => void;
  updatePrintOrder: (id: string, updates: Partial<PrintJobOrder>) => void;
  collectPrintOrderPayment: (id: string, amount: number, paymentMethod: PaymentMethod) => void;
  
  invoices: Invoice[];
  createPosSale: (
    items: Array<{
      item: InventoryItem;
      quantity: number;
      discount?: number;
      unitPrice?: number;
      description?: string;
      notes?: string;
      hasDimensions?: boolean;
      length?: number;
      width?: number;
      count?: number;
      unit?: string;
      tax?: number;
      taxRate?: number;
      attachments?: LineAttachment[];
    }>,
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: {
      invoiceNumber?: string;
      date?: string;
      additionalCharges?: number;
      overallDiscount?: number;
      taxRate?: number;
      paidAmount?: number;
      representative?: string;
      branch?: string;
      warehouse?: string;
      customCustomerText?: string;
      subCustomerId?: string;
      subCustomerName?: string;
      subCustomerPhone?: string;
      treasuryAccountCode?: string;
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      cashPaidAmount?: number;
      cashCurrency?: string;
      cashExchangeRate?: number;
      cashTreasuryCode?: string;
      bankPaidAmount?: number;
      bankCurrency?: string;
      bankExchangeRate?: number;
      bankTreasuryCode?: string;
      workflowStatus?: PosInvoiceWorkflowStatus;
      paymentStatus?: InvoicePaymentStatus;
      branchId?: string;
      userId?: string;
      userName?: string;
      paymentNotes?: string;
    }
  ) => Invoice;
  updateInvoice: (
    id: string,
    updates: Partial<Invoice>,
    statusMeta?: { notes?: string; userName?: string; userId?: string }
  ) => void;
  deleteInvoice: (id: string, reason?: string) => void;
  deletedInvoices: Invoice[];
  restoreDeletedInvoice: (id: string) => Promise<Invoice | null>;
  permanentlyDeleteInvoice: (id: string) => Promise<void>;
  getInvoiceDeleteAuditLogs: (invoiceId?: string) => Promise<AuditLogEntry[]>;
  addInvoiceTechnicalNote: (invoiceId: string, text: string) => void;
  addInvoiceItemAttachment: (invoiceId: string, itemIndexOrId: string | number, attachment: LineAttachment) => void;
  removeInvoiceItemAttachment: (invoiceId: string, itemIndexOrId: string | number, attachmentId: string) => { success: boolean; message?: string };
  startInvoicePrinting: (invoiceId: string) => void;
  finishInvoicePrinting: (invoiceId: string) => void;
  deliverInvoice: (invoiceId: string, notes?: string) => void;
  
  purchases: PurchaseInvoice[];
  createPurchaseInvoice: (invoice: Omit<PurchaseInvoice, 'id' | 'invoiceNumber'>) => void;
  deletePurchaseInvoice: (id: string) => void;
  selectedPurchaseForPrint: PurchaseInvoice | null;
  setSelectedPurchaseForPrint: (purchase: PurchaseInvoice | null) => void;

  purchaseReturns: PurchaseReturn[];
  createPurchaseReturn: (returnData: Omit<PurchaseReturn, 'id' | 'returnNumber' | 'createdAt'>) => PurchaseReturn;
  deletePurchaseReturn: (id: string) => void;
  selectedReturnForPrint: PurchaseReturn | null;
  setSelectedReturnForPrint: (ret: PurchaseReturn | null) => void;

  salesReturns: SalesReturn[];
  createSalesReturn: (returnData: Omit<SalesReturn, 'id' | 'returnNumber' | 'createdAt'>) => SalesReturn;
  deleteSalesReturn: (id: string) => void;
  selectedSalesReturnForPrint: SalesReturn | null;
  setSelectedSalesReturnForPrint: (ret: SalesReturn | null) => void;
  
  vouchers: PaymentVoucher[];
  createPaymentVoucher: (voucher: Omit<PaymentVoucher, 'id' | 'voucherNumber'>) => void;
  updatePaymentVoucher: (id: string, updates: Partial<PaymentVoucher>) => void;
  deletePaymentVoucher: (id: string) => void;

  // Multi-Currency Support (تعدد العملات والعملة الأساسية: الشيكل الفلسطيني)
  currencies: CurrencyInfo[];
  updateCurrencies: (currencies: CurrencyInfo[]) => void;
  updateCurrencyRate: (code: string, rate: number) => void;
  fetchLiveRates: () => Promise<{ success: boolean; message: string }>;

  // Offline-First & Database Integration (التشغيل المحلي الدائم والربط بقاعدة بيانات البرنامج الرئيسي)
  isOnline: boolean;
  lastSyncTime: string | null;
  isFirebaseSyncing: boolean;
  lastFirebaseSyncTime: string | null;
  hasUnsyncedChanges: boolean;
  pendingSyncCount: number;
  lastLocalSaveTime: string;
  syncToFirebase: (force?: boolean) => Promise<boolean>;
  forceSyncNow: () => Promise<{ success: boolean; message: string }>;

  // SQL Server Export & Web Server Integration (التصدير والمزامنة مع خادم ويب خارجي)
  sqlServerConfig: SqlServerConfig;
  updateSqlServerConfig: (config: SqlServerConfig) => void;
  generateSqlBackup: (dialect?: 'postgres' | 'mysql' | 'sqlite') => string;
  downloadSqlBackup: (dialect?: 'postgres' | 'mysql' | 'sqlite') => void;
  syncToServer: () => Promise<{ success: boolean; message: string }>;
  
  // Modals & Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  goBack: () => void;
  canGoBack: boolean;
  editingPosInvoiceId: string | null;
  setEditingPosInvoiceId: (id: string | null) => void;
  selectedInvoiceForPrint: Invoice | null;
  setSelectedInvoiceForPrint: (inv: Invoice | null) => void;
  directPrintOptions: { format: 'thermal' | 'a4' | 'a4-custom', autoPrint: boolean } | null;
  setDirectPrintOptions: (options: { format: 'thermal' | 'a4' | 'a4-custom', autoPrint: boolean } | null) => void;
  selectedInvoiceForLifecycle: Invoice | null;
  setSelectedInvoiceForLifecycle: (inv: Invoice | null) => void;
  selectedJobForPrint: PrintJobOrder | null;
  setSelectedJobForPrint: (job: PrintJobOrder | null) => void;
  selectedVoucherForPrint: PaymentVoucher | null;
  setSelectedVoucherForPrint: (v: PaymentVoucher | null) => void;

  // Multi-Company, Multi-Branch & Warehouses (الشركات والفروع والمستودعات)
  companies: Company[];
  activeCompanyId: string;
  setActiveCompanyId: (id: string) => void;
  addCompany: (comp: Omit<Company, 'id' | 'createdAt'>) => Company;
  updateCompany: (id: string, updated: Partial<Company>) => void;
  deleteCompany: (id: string) => { success: boolean; message?: string };

  branches: Branch[];
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
  addBranch: (branch: Omit<Branch, 'id' | 'createdAt'>) => Branch;
  updateBranch: (id: string, updated: Partial<Branch>) => void;
  deleteBranch: (id: string) => { success: boolean; message?: string };
  getActiveBranch: () => Branch | undefined;

  warehouses: Warehouse[];
  activeWarehouseId: string;
  setActiveWarehouseId: (id: string) => void;
  addWarehouse: (wh: Omit<Warehouse, 'id' | 'createdAt'>) => Warehouse;
  updateWarehouse: (id: string, updated: Partial<Warehouse>) => void;
  deleteWarehouse: (id: string) => { success: boolean; message?: string };
  getWarehousesForBranch: (branchId?: string) => Warehouse[];
  getWarehouseStock: (warehouseId: string, itemId: string) => number;

  // Warehouse Operations (استلام، صرف، تحويل، جرد، تسوية، إتلاف، مرتجع، تعديل مخزون)
  warehouseOperations: WarehouseOperation[];
  addWarehouseOperation: (op: Omit<WarehouseOperation, 'id' | 'createdAt'> & { documentNumber?: string; date?: string; time?: string }) => WarehouseOperation;

  // Granular Roles, Permissions & Users (المستخدمون والصلاحيات الدقيقة)
  roles: Role[];
  addRole: (role: Omit<Role, 'id' | 'createdAt'>) => Role;
  updateRole: (id: string, updated: Partial<Role>) => void;
  deleteRole: (id: string) => { success: boolean; message?: string };

  users: SystemUser[];
  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  currentUser: SystemUser;
  getCurrentUser: () => SystemUser;
  addUser: (user: Omit<SystemUser, 'id' | 'createdAt'>) => SystemUser;
  updateUser: (id: string, updated: Partial<SystemUser>) => void;
  deleteUser: (id: string) => { success: boolean; message?: string };

  hasPermission: (permission: PermissionKey) => boolean;
  canAccessBranch: (branchId: string, user?: SystemUser) => boolean;
  getAllowedBranchesForUser: (user?: SystemUser) => Branch[];

  // Pricing policies & customer special prices
  getItemPriceForCustomer: (
    item: InventoryItem,
    customerId?: string,
    tier?: 'price1' | 'price2' | 'price3' | 'retail' | 'wholesale' | 'special'
  ) => { price: number; isSpecialPrice: boolean; specialPriceLabel?: string };
  getCurrentUserPricePolicy: (user?: SystemUser) => {
    canEditPrice: boolean;
    allowedTier: AllowedPriceTierScope;
    defaultTier: PriceTierKey;
  };

  // Data management
  lastBackupInfo: { timestamp: string; filename: string } | null;
  exportDataJSON: () => void;
  importDataJSON: (jsonString: string, includeSettings?: boolean, keepTelegramSettings?: boolean, keepFacilitySettings?: boolean) => Promise<boolean>;
  resetAllData: () => void;
  performDatabaseZeroing: (options: DatabaseZeroingOptions) => ZeroingExecutionResult;
  
  // Quick stats
  stats: {
    totalRevenue: number;
    printRevenue: number;
    bookstoreRevenue: number;
    netProfit: number;
    cashBalance: number;
    bankBalance: number;
    customerReceivables: number;
    supplierPayables: number;
    inventoryTotalValue: number;
    pendingPrintJobs: number;
    lowStockCount: number;
    totalEmployeesCount: number;
    activeEmployeesCount: number;
    estimatedMonthlyPayroll: number;
    totalTreasuriesBalance: number;
    treasuriesCount: number;
    exceededCreditLimitCount: number;
    purchaseReturnsCount: number;
    salesReturnsCount: number;
    todaySales: number;
  };

  // Daily Entry Sheets (كشف الإدخال اليومي)
  dailyEntrySheets: Record<string, DailyEntrySheet>;
  getDailyEntrySheet: (date: string) => DailyEntrySheet;
  saveDailyEntrySheet: (date: string, rows: DailyEntryRow[], notes?: string) => void;
  saveDailyEntryRow: (date: string, row: DailyEntryRow) => void;
  deleteDailyEntrySheet: (date: string) => void;
  getAllDailyEntryDates: () => string[];
  markDailyEntryRowsApproved: (date: string, rowIds: string[], invoiceId: string, invoiceNumber: string) => void;
  acquireDailyEntryRowLock: (date: string, rowId: string, field?: string) => void;
  releaseDailyEntryRowLock: (date: string, rowId: string) => void;
  forceReleaseDailyEntryRowLock: (date: string, rowId: string) => void;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

const STORAGE_KEY = 'alnoor_press_accounting_v1';

export function cleanDocForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  return JSON.parse(JSON.stringify(data));
}

function safeLoadArray<T>(key: string, fallback: T[]): T[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeLoadObject<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function deduplicateById<T extends { id?: string; invoiceNumber?: string }>(items: T[], prefix = 'item'): T[] {
  const seenIds = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item) continue;
    const id = item.id;
    
    // If item has no ID, assign one
    if (!id) {
      const generatedId = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      seenIds.add(generatedId);
      result.push({ ...item, id: generatedId });
      continue;
    }

    // If ID was already seen in this array, IGNORE duplicate copy instead of re-keying and creating shadow documents!
    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    result.push(item);
  }

  return result;
}

// One-time self-purging of old mock demo entries from browser localStorage
(() => {
  try {
    const purgeKey = 'accounting_demo_purge_clean_v3';
    if (localStorage.getItem(purgeKey) !== 'true') {
      const demoStorageKeys = [
        `${STORAGE_KEY}_purchases`,
        `${STORAGE_KEY}_vouchers`,
        `${STORAGE_KEY}_purchaseReturns`,
        `${STORAGE_KEY}_salesReturns`,
        `${STORAGE_KEY}_employees`,
        `${STORAGE_KEY}_advances`,
        `${STORAGE_KEY}_deductions`,
        `${STORAGE_KEY}_incentives`,
        `${STORAGE_KEY}_payrollSheets`,
        `${STORAGE_KEY}_warehouse_operations`,
        `${STORAGE_KEY}_warehouses`,
        `${STORAGE_KEY}_companies`,
        `${STORAGE_KEY}_branches`
      ];
      demoStorageKeys.forEach(k => {
        const val = localStorage.getItem(k);
        if (val && (val.includes('الراجحي') || val.includes('الرياض') || val.includes('INV-2026-') || val.includes('STAT-0001') || val.includes('PO-2026-') || val.includes('w-op-1') || val.includes('adv-1') || val.includes('wh-2') || val.includes('br-2') || val.includes('comp-2'))) {
          localStorage.removeItem(k);
        }
      });
      // Check parties for pt-1 Riyadh demo
      const rawParties = localStorage.getItem(`${STORAGE_KEY}_parties`);
      if (rawParties && (rawParties.includes('info@alsahab.com') || rawParties.includes('حي المعذر') || rawParties.includes('pt-1'))) {
        try {
          const parsed = JSON.parse(rawParties);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((p: any) => p && p.id !== 'pt-1' && !p.email?.includes('alsahab.com'));
            localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(cleaned));
          }
        } catch (e) {}
      }
      // Check inventory for inv-1 STAT-0001
      const rawInv = localStorage.getItem(`${STORAGE_KEY}_inventory`);
      if (rawInv && (rawInv.includes('STAT-0001') || rawInv.includes('دفتر سلك جامعي') || rawInv.includes('inv-1'))) {
        try {
          const parsed = JSON.parse(rawInv);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((i: any) => i && i.id !== 'inv-1' && !i.code?.includes('STAT-'));
            localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(cleaned));
          }
        } catch (e) {}
      }
      // Check invoices for demo invoices
      const rawInvoices = localStorage.getItem(`${STORAGE_KEY}_invoices`);
      if (rawInvoices && (rawInvoices.includes('INV-2026-1001') || rawInvoices.includes('inv-pos-1001'))) {
        try {
          const parsed = JSON.parse(rawInvoices);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((inv: any) => inv && inv.id !== 'inv-pos-1001' && inv.id !== 'inv-pos-1002');
            localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(cleaned));
          }
        } catch (e) {}
      }
      // Clean accounts cache if it contained Saudi references
      const rawAccounts = localStorage.getItem(`${STORAGE_KEY}_accounts`);
      if (rawAccounts && (rawAccounts.includes('الراجحي') || rawAccounts.includes('STC Pay') || rawAccounts.includes('زكاة'))) {
        localStorage.removeItem(`${STORAGE_KEY}_accounts`);
      }
      localStorage.setItem(purgeKey, 'true');
    }
  } catch (e) {}
})();

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<BusinessSettings>(() => {
    const loaded = safeLoadObject(`${STORAGE_KEY}_settings`, initialSettings);
    // Ensure base currency is Palestinian Shekel (₪ / ILS) as requested
    const currency = (loaded.currency === 'ر.س' || !loaded.currency) ? '₪' : loaded.currency;
    const baseCurrencyCode = loaded.baseCurrencyCode || 'ILS';
    const loadedCurrencies = (loaded.currencies && loaded.currencies.length > 0) ? loaded.currencies : defaultCurrencies;
    const currencies = loadedCurrencies.map((c: any) => {
      if (c.code === 'ILS') {
        return { ...c, name: 'شيكل' };
      }
      return c;
    });
    
    const sqlServerConfig = loaded.sqlServerConfig || initialSettings.sqlServerConfig || {
      enabled: false,
      serverUrl: 'http://localhost:3000/api/sync',
      dbType: 'postgres',
      dbName: 'alnoor_press_db',
      autoSync: false,
      syncIntervalMinutes: 30
    };
    
    // Ensure categories exists (if undefined, set from initialSettings)
    const categories = loaded.categories !== undefined ? loaded.categories : initialSettings.categories;

    return {
      ...loaded,
      currency,
      baseCurrencyCode,
      currencies,
      sqlServerConfig,
      categories
    };

  });

  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_last_sync`) || null;
  });
  const [lastFirebaseSyncTime, setLastFirebaseSyncTime] = useState<string | null>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_last_sync`) || null;
  });
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState<boolean>(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_has_unsynced`) === 'true';
  });
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_pending_sync_count`);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lastLocalSaveTime, setLastLocalSaveTime] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_last_local_save`) || new Date().toLocaleTimeString('en-US');
  });

  const isInitialMount = React.useRef<boolean>(true);
  const isCloudHydratedRef = React.useRef<boolean>(false);
  const isRemoteSyncRef = React.useRef<boolean>(false);
  const debouncedSyncRef = React.useRef<any>(null);
  const syncToFirebaseRef = React.useRef<any>(null);
  const fetchFromFirebaseRef = React.useRef<any>(null);
  const lastSyncErrorRef = React.useRef<string | null>(null);

  // Track online/offline status for instant auto-sync when network returns
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      console.log('Online event: internet connection restored. Triggering auto-sync with main database...');
      if (syncToFirebaseRef.current) {
        await syncToFirebaseRef.current(true);
      }
      if (fetchFromFirebaseRef.current) {
        await fetchFromFirebaseRef.current();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('Offline event: internet connection lost. System running fully offline on LocalStorage without disruption.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [accounts, setAccounts] = useState<Account[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_accounts`, initialAccounts);
    if (!loaded.some(a => a.code === '2104')) {
      const deliveryAcc: Account = {
        code: '2104',
        name: 'أمانات ومستحقات خدمة التوصيل (عمال وشركات التوصيل)',
        type: 'liability',
        balance: 0,
        isSystem: true,
        description: 'مستحقات التوصيل المحصلة من الزبائن لصالح عمال التوصيل - خدمة صفرية الربح ولا أثر مخزني لها'
      };
      return [...loaded, deliveryAcc];
    }
    return loaded;
  });

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_journals`, initialJournalEntries);
    return deduplicateById(loaded, 'je');
  });

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_inventory`, initialInventory);
    const mapped = loaded.map(it => {
      if (!it) return it;
      if (
        it.code === 'PRI-0009' ||
        it.name?.includes('جاليه سيلكون') ||
        (it.name?.includes('جاليه') && (it.category === 'مطبوعات قماش' || it.category === 'textiles'))
      ) {
        return { ...it, code: 'TEX-0001', category: 'textiles' };
      }
      return it;
    });
    return deduplicateById(mapped, 'inv');
  });

  const [parties, setParties] = useState<Party[]>(() => {
    const raw = safeLoadArray(`${STORAGE_KEY}_parties`, initialParties);
    // Deduplicate any accidental duplicate cash customer records & purge invalid phantom records
    const seenGenericCash = new Set<string>();
    const cleanedRaw = raw.filter(p => {
      if (!p || !p.id || !p.name || !p.name.trim() || p.id.startsWith('emp-')) return false;
      const trimmed = (p.name || '').trim();
      const isGeneric = trimmed === 'زبون نقدي' || trimmed === 'عميل نقدي' || trimmed === 'عميل كاشير نقدي' || trimmed === 'زبون عام';
      if (isGeneric) {
        if (seenGenericCash.has(trimmed)) return false;
        seenGenericCash.add(trimmed);
      }
      return true;
    });
    // Migration: ensure every single party has a guaranteed unique sequential code
    const result: Party[] = [];
    cleanedRaw.forEach(p => {
      if (p.code && !result.some(r => r.code.toLowerCase() === p.code.toLowerCase())) {
        result.push(p);
      } else {
        const code = generateSequentialPartyCode(p.type, result);
        result.push({ ...p, code });
      }
    });
    return result;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_employees`, initialEmployees);
  });

  const [printOrders, setPrintOrders] = useState<PrintJobOrder[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_printOrders`, initialPrintOrders);
    return loaded.map(po => {
      if (!po || !Array.isArray(po.items)) return po;
      const items = po.items.map(it => {
        if (it.itemCode === 'PRI-0009' || it.itemName?.includes('جاليه سيلكون')) {
          return { ...it, itemCode: 'TEX-0001' };
        }
        return it;
      });
      return { ...po, items };
    });
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_invoices`, initialInvoices);
    let anyChange = false;
    const cleaned = loaded.filter(inv => {
      if (!inv) return false;
      const num = parseInt((inv.invoiceNumber || '').replace(/\D/g, ''), 10);
      return num !== 11 && inv.invoiceNumber !== 'INV-0011' && inv.invoiceNumber !== 'INV-00011' && inv.id !== 'inv-11';
    }).map(inv => {
      if (!inv || !Array.isArray(inv.items)) return inv;
      let hasChange = false;
      const items = inv.items.map(it => {
        if (
          it.itemCode === 'PRI-0009' ||
          it.itemName?.includes('جاليه سيلكون')
        ) {
          hasChange = true;
          anyChange = true;
          return { ...it, itemCode: 'TEX-0001' };
        }
        return it;
      });
      return hasChange ? { ...inv, items } : inv;
    });
    if (anyChange) {
      try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(cleaned)); } catch {}
    }
    const deduped = deduplicateById(cleaned, 'inv');
    return deduped.sort((a, b) => {
      const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numB - numA;
      return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
    });
  });

  const [purchases, setPurchases] = useState<PurchaseInvoice[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_purchases`, initialPurchases);
    return deduplicateById(loaded, 'pur');
  });

  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_purchaseReturns`, initialPurchaseReturns);
    return deduplicateById(loaded, 'prn');
  });

  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_salesReturns`, initialSalesReturns);
    return deduplicateById(loaded, 'srn');
  });

  const [vouchers, setVouchers] = useState<PaymentVoucher[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_vouchers`, initialVouchers);
    return deduplicateById(loaded, 'vch');
  });

  const [deletedInvoices, setDeletedInvoices] = useState<Invoice[]>(() => {
    try {
      const r = localStorage.getItem(`${STORAGE_KEY}_deleted_invoices`);
      return r ? JSON.parse(r) : [];
    } catch {
      return [];
    }
  });

  const [employeeAdvances, setEmployeeAdvances] = useState<EmployeeAdvance[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_advances`, initialEmployeeAdvances);
  });

  const [employeeDeductions, setEmployeeDeductions] = useState<EmployeeDeduction[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_deductions`, initialEmployeeDeductions);
  });

  const [employeeIncentives, setEmployeeIncentives] = useState<EmployeeIncentive[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_incentives`, initialEmployeeIncentives);
  });

  const [payrollSheets, setPayrollSheets] = useState<PayrollSheet[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_payrollSheets`, initialPayrollSheets);
  });

  const [treasuries, setTreasuries] = useState<Treasury[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_treasuries`, initialTreasuries);
  });

  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_stockMovements`, initialStockMovements);
    return deduplicateById(loaded, 'sm');
  });

  // Multi-Company, Multi-Branch & Warehouses State
  const [companies, setCompanies] = useState<Company[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_companies`, DEFAULT_COMPANIES);
  });
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_company_id`) || 'comp-1';
  });

  const [branches, setBranches] = useState<Branch[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_branches`, DEFAULT_BRANCHES);
  });
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_branch_id`) || 'br-1';
  });

  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_warehouses`, DEFAULT_WAREHOUSES);
  });
  const [activeWarehouseId, setActiveWarehouseId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_warehouse_id`) || 'wh-1';
  });

  const [warehouseOperations, setWarehouseOperations] = useState<WarehouseOperation[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_warehouse_operations`, DEFAULT_WAREHOUSE_OPERATIONS);
  });

  // Daily Entry Sheets State (كشف الإدخال اليومي)
  const [dailyEntrySheets, setDailyEntrySheets] = useState<Record<string, DailyEntrySheet>>(() => {
    try {
      const saved = localStorage.getItem('accounting_daily_entry_sheets_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load daily entry sheets:', e);
    }
    return {};
  });

  const getDailyEntrySheet = (date: string): DailyEntrySheet => {
    if (dailyEntrySheets[date]) {
      return dailyEntrySheets[date];
    }
    return {
      date,
      rows: [],
      notes: '',
      updatedAt: new Date().toISOString()
    };
  };

  const saveDailyEntrySheet = (date: string, rows: DailyEntryRow[], notes?: string) => {
    // الحفظ المباشر والنهائي للأسطر المعتمدة: الأسطر المحذوفة تُحذف نهائياً ولا يتم إعادتها
    const finalRows = rows;

    const currentLocks = { ...(dailyEntrySheets[date]?.activeLocks || {}) };
    const now = Date.now();
    Object.keys(currentLocks).forEach(k => {
      if (now - (currentLocks[k]?.lockedAt || 0) > 120000) {
        delete currentLocks[k];
      }
    });

    const sheetData: DailyEntrySheet = {
      date,
      rows: finalRows,
      notes: notes !== undefined ? notes : (dailyEntrySheets[date]?.notes || ''),
      updatedAt: new Date().toISOString(),
      activeLocks: currentLocks
    };
    setDailyEntrySheets(prev => {
      const updated: Record<string, DailyEntrySheet> = {
        ...prev,
        [date]: sheetData
      };
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save daily entry sheets to localStorage', err);
      }
      return updated;
    });

    // مزامنة سحابية فورية لكشف الإدخال اليومي عبر Firestore ليعمل متزامناً لدى كافة المستخدمين
    try {
      setDoc(doc(db, 'dailyEntrySheets', date), cleanDocForFirestore(sheetData), { merge: true }).catch(err => {
        console.warn('Firestore live write dailyEntrySheets error:', err);
      });
    } catch (e) {
      console.warn('Firestore write failed:', e);
    }
  };

  const saveDailyEntryRow = (date: string, row: DailyEntryRow) => {
    setDailyEntrySheets(prev => {
      const sheet = prev[date] || { date, rows: [], notes: '', updatedAt: new Date().toISOString() };
      const currentRows = sheet.rows || [];
      const rowIndex = currentRows.findIndex(r => r.id === row.id);
      let updatedRows: DailyEntryRow[];
      if (rowIndex >= 0) {
        updatedRows = currentRows.map(r => r.id === row.id ? row : r);
      } else {
        updatedRows = [...currentRows, row];
      }
      const updatedSheet: DailyEntrySheet = {
        ...sheet,
        rows: updatedRows,
        updatedAt: new Date().toISOString()
      };
      const updated: Record<string, DailyEntrySheet> = {
        ...prev,
        [date]: updatedSheet
      };
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(updated));
      } catch (err) {}

      // Atomic row update in sub-collection
      try {
        setDoc(doc(db, 'dailyEntrySheets', date, 'rows', row.id), cleanDocForFirestore(row)).catch(err => {
          console.warn('Firestore sub-collection row write failed:', err);
        });
      } catch (e) {}

      return updated;
    });
  };

  const deleteDailyEntrySheet = (date: string) => {
    setDailyEntrySheets(prev => {
      const next = { ...prev };
      delete next[date];
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to update daily entry sheets in localStorage', err);
      }
      return next;
    });

    try {
      deleteDoc(doc(db, 'dailyEntrySheets', date)).catch(err => {
        console.warn('Firestore delete dailyEntrySheets error:', err);
      });
    } catch (e) {
      console.warn('Firestore delete failed:', e);
    }
  };

  const getAllDailyEntryDates = (): string[] => {
    return Object.keys(dailyEntrySheets)
      .filter(d => dailyEntrySheets[d]?.rows && dailyEntrySheets[d].rows.length > 0)
      .sort()
      .reverse();
  };

  const markDailyEntryRowsApproved = (date: string, rowIds: string[], invoiceId: string, invoiceNumber: string) => {
    let sheetToSync: DailyEntrySheet | null = null;
    setDailyEntrySheets(prev => {
      const sheet = prev[date];
      if (!sheet || !sheet.rows) return prev;
      const updatedRows = sheet.rows.map(r => {
        if (rowIds.includes(r.id)) {
          return {
            ...r,
            isApproved: true,
            approvedInvoiceId: invoiceId,
            approvedInvoiceNumber: invoiceNumber,
            approvedAt: new Date().toISOString()
          };
        }
        return r;
      });
      sheetToSync = {
        ...sheet,
        rows: updatedRows,
        updatedAt: new Date().toISOString()
      };
      const updated: Record<string, DailyEntrySheet> = {
        ...prev,
        [date]: sheetToSync
      };
      try {
        localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to update daily entry sheet approval in localStorage', err);
      }
      return updated;
    });

    if (sheetToSync) {
      try {
        setDoc(doc(db, 'dailyEntrySheets', date), sheetToSync).catch(err => {
          console.warn('Firestore live update dailyEntrySheets approval error:', err);
        });
      } catch (e) {
        console.warn('Firestore approval update failed:', e);
      }
    }
  };

  // Granular Roles & System Users State
  const [roles, setRoles] = useState<Role[]>(() => {
    const loaded = safeLoadArray(`${STORAGE_KEY}_roles`, DEFAULT_ROLES);
    // Ensure system roles reflect latest security definitions while keeping custom roles
    return DEFAULT_ROLES.map(defRole => {
      const existing = loaded.find(r => r.id === defRole.id);
      if (!existing || defRole.isSystem) return defRole;
      return existing;
    }).concat(loaded.filter(r => !DEFAULT_ROLES.some(dr => dr.id === r.id)));
  });

  const [users, setUsers] = useState<SystemUser[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_users`, DEFAULT_SYSTEM_USERS);
  });

  const [currentUserId, _setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_current_user_id`) ||
      localStorage.getItem('alnoor_press_accounting_v1_current_user_id') ||
      'usr-1';
  });

  const setCurrentUserId = (id: string) => {
    _setCurrentUserId(id);
    try {
      localStorage.setItem(`${STORAGE_KEY}_current_user_id`, id);
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', id);
      const matched = users.find(u => u.id === id);
      if (matched) {
        localStorage.setItem(`${STORAGE_KEY}_current_user`, JSON.stringify(matched));
        localStorage.setItem('alnoor_press_accounting_v1_current_user', JSON.stringify(matched));
      }
    } catch (e) {}
  };

  // Sync Firebase user to System User only when needed without overriding manual user switches
  useEffect(() => {
    const fUser = auth.currentUser;
    const authType = localStorage.getItem('auth_type');
    
    // If user explicitly signed in with local credentials, do not override
    if (authType === 'local') {
      return;
    }

    if (fUser && fUser.email && isCloudHydratedRef.current) {
      const isOwner = fUser.email.toLowerCase() === 'lobnanprint@gmail.com' || fUser.email.toLowerCase() === 'raid.salha@gmail.com' || fUser.email.toLowerCase().includes('lobnan') || fUser.email.toLowerCase().includes('raid');
      const existingUser = users.find(u => u.email?.toLowerCase() === fUser.email?.toLowerCase() || u.username?.toLowerCase() === fUser.email?.toLowerCase());
      
      if (existingUser) {
        // Automatically upgrade owner to full admin
        if (isOwner && existingUser.roleId !== 'role-admin') {
          setUsers(prev => {
            const updated = prev.map(u => u.id === existingUser.id ? { ...u, roleId: 'role-admin', allowedBranchIds: ['*'] } : u);
            localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(updated));
            return updated;
          });
        }
        const savedId = localStorage.getItem(`${STORAGE_KEY}_current_user_id`);
        if (!savedId) {
          setCurrentUserId(existingUser.id);
        }
      } else if (users.length > 0) {
        // Create new user for this email only if cloud database users are loaded and email is truly new
        const newUser: SystemUser = {
          id: 'user-' + Date.now(),
          companyId: 'comp-1',
          username: fUser.email,
          email: fUser.email,
          fullName: fUser.displayName || fUser.email.split('@')[0],
          roleId: isOwner ? 'role-admin' : 'role-cashier', 
          defaultBranchId: 'br-1',
          allowedBranchIds: isOwner ? ['*'] : ['br-1'],
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setUsers(prev => {
          const updated = [...prev, newUser];
          localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(updated));
          return updated;
        });
        const savedId = localStorage.getItem(`${STORAGE_KEY}_current_user_id`);
        if (!savedId) {
          setCurrentUserId(newUser.id);
        }
      }
    }
  }, [auth.currentUser?.email, users.length]);

  // Debt Clearings (المقاصة بين عميل ومورد)
  const [debtClearings, setDebtClearings] = useState<DebtClearingRecord[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_debt_clearings`, [
      {
        id: 'clr-1',
        clearingNumber: 'CLR-2026-001',
        date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
        customerId: 'p-cust-1',
        customerName: 'مكتبة النجاح الأكاديمية',
        supplierId: 'p-supp-1',
        supplierName: 'شركة الأهرام لتوريد الورق والكرتون',
        amount: 1500,
        currency: 'ILS',
        reason: 'مقاصة مقابل توريد خامات ورق وسداد مطبوعات مدرسية سابقة',
        notes: 'تمت التسوية بموجب اتفاق مالي بين الطرفين لتخفيض الذمم المتبادلة دون مساس بالصناديق النقدية',
        createdBy: 'المدير المالي',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        customerOldBalance: 4200,
        customerNewBalance: 2700,
        supplierOldBalance: -3800,
        supplierNewBalance: -2300,
        journalEntryId: 'entry-clr-sample-1'
      }
    ]);
  });

  // Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => {
    return safeLoadArray(`${STORAGE_KEY}_expenses`, initialExpenses);
  });

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(expenses));
  }, [expenses]);

  const [tabHistory, setTabHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_tab_history`);
      return saved ? JSON.parse(saved) : ['home'];
    } catch {
      return ['home'];
    }
  });
  const [activeTab, setActiveTabState] = useState<string>(() => {
    return localStorage.getItem(`${STORAGE_KEY}_active_tab`) || 'home';
  });

  const setActiveTab = (tab: string) => {
    if (tab === activeTab) return;
    setTabHistory(prev => {
      const next = [...prev.slice(-30), tab];
      try {
        localStorage.setItem(`${STORAGE_KEY}_tab_history`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setActiveTabState(tab);
    try {
      localStorage.setItem(`${STORAGE_KEY}_active_tab`, tab);
    } catch (e) {}
  };

  const goBack = () => {
    if (tabHistory.length > 1) {
      const nextHistory = [...tabHistory];
      nextHistory.pop(); // remove current
      const previous = nextHistory[nextHistory.length - 1];
      setTabHistory(nextHistory);
      setActiveTabState(previous);
      try {
        localStorage.setItem(`${STORAGE_KEY}_tab_history`, JSON.stringify(nextHistory));
        localStorage.setItem(`${STORAGE_KEY}_active_tab`, previous);
      } catch (e) {}
    } else if (activeTab !== 'home') {
      setActiveTabState('home');
      setTabHistory(['home']);
      try {
        localStorage.setItem(`${STORAGE_KEY}_tab_history`, JSON.stringify(['home']));
        localStorage.setItem(`${STORAGE_KEY}_active_tab`, 'home');
      } catch (e) {}
    }
  };

  const canGoBack = tabHistory.length > 1 || activeTab !== 'home';
  const [editingPosInvoiceId, setEditingPosInvoiceId] = useState<string | null>(null);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<Invoice | null>(null);
  const [directPrintOptions, setDirectPrintOptions] = useState<{ format: 'thermal' | 'a4' | 'a4-custom', autoPrint: boolean } | null>(null);
  const [selectedInvoiceForLifecycle, setSelectedInvoiceForLifecycle] = useState<Invoice | null>(null);
  const [selectedJobForPrint, setSelectedJobForPrint] = useState<PrintJobOrder | null>(null);
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<PaymentVoucher | null>(null);
  const [selectedPayrollSheetForPrint, setSelectedPayrollSheetForPrint] = useState<PayrollSheet | null>(null);
  const [selectedPartyForStatement, setSelectedPartyForStatement] = useState<Party | null>(null);
  const [selectedEmployeeForStatement, setSelectedEmployeeForStatement] = useState<Employee | null>(null);

  // Helper to record deleted document IDs persistently so they never resurrect on cloud sync
  const registerDeletedDoc = (colName: string, id: string | number) => {
    try {
      const existing = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
      const idStr = String(id);
      if (!existing.some((e: any) => e.col === colName && e.id === idStr)) {
        existing.push({ col: colName, id: idStr, time: Date.now() });
        localStorage.setItem('accounting_deleted_docs', JSON.stringify(existing.slice(-10000)));
      }
      // Invalidate synced hash
      const syncedHashes = JSON.parse(localStorage.getItem('accounting_synced_hashes') || '{}');
      if (syncedHashes[`${colName}_${idStr}`]) {
        delete syncedHashes[`${colName}_${idStr}`];
        localStorage.setItem('accounting_synced_hashes', JSON.stringify(syncedHashes));
      }
      localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
      setHasUnsyncedChanges(true);
    } catch (e) {
      console.warn('registerDeletedDoc storage note:', e);
    }
    // Delete immediately from Firestore if online
    if (navigator.onLine) {
      deleteDoc(doc(db, colName, String(id))).catch(e => {
        console.warn(`Direct deleteDoc notice for ${colName}/${id}:`, e);
      });
    }
  };

  // Sync to Firebase Cloud Database (قاعدة البيانات الرئيسية)
  const syncToFirebase = async (force: boolean = false): Promise<boolean> => {
    if (!navigator.onLine && !force) {
      return false;
    }
    // Prevent automated syncing until cloud hydration has completed
    if (!isCloudHydratedRef.current && !force) {
      return false;
    }
    try {
      setIsFirebaseSyncing(true);
      const collectionsToSync: Record<string, any[]> = {
        accounts, treasuries, parties, employees, invoices,
        purchases, purchaseReturns, salesReturns, vouchers, printOrders,
        journalEntries, employeeAdvances, employeeDeductions, employeeIncentives,
        payrollSheets, inventory, stockMovements, companies, branches,
        warehouses, warehouseOperations, roles, users, debtClearings, expenses
      };
      
      const syncedHashes = JSON.parse(localStorage.getItem('accounting_synced_hashes') || '{}');
      const newHashes = { ...syncedHashes };
      
      let writeCount = 0;
      const batchWrites: Promise<void>[] = [];
      let currentBatch = writeBatch(db);
      
      // 1. Process pending persistent deletions first so deleted documents are purged from Firestore
      let parsedDeletedDocs: any[] = [];
      try {
        const deletedDocs = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
        if (Array.isArray(deletedDocs) && deletedDocs.length > 0) {
          parsedDeletedDocs = deletedDocs;
          for (const d of deletedDocs) {
            if (d && d.col && d.id) {
              currentBatch.delete(doc(db, d.col, String(d.id)));
              writeCount++;
              if (writeCount % 400 === 0) {
                batchWrites.push(currentBatch.commit());
                currentBatch = writeBatch(db);
              }
            }
          }
        }
      } catch (delErr) {
        console.warn('Error processing deletions batch in syncToFirebase:', delErr);
      }

      const hashItem = (item: any) => JSON.stringify(item);
      
      for (const [colName, items] of Object.entries(collectionsToSync)) {
         if (!Array.isArray(items)) continue;
         for (const item of items) {
            if (!item || !item.id) continue;
            
            const cleanItem = cleanDocForFirestore(item);
            const itemHash = hashItem(cleanItem);
            const hashKey = `${colName}_${item.id}`;
            
            if (syncedHashes[hashKey] !== itemHash) {
               const docRef = doc(db, colName, String(item.id));
               currentBatch.set(docRef, cleanItem);
               newHashes[hashKey] = itemHash;
               writeCount++;
               
               if (writeCount % 400 === 0) {
                  batchWrites.push(currentBatch.commit());
                  currentBatch = writeBatch(db);
               }
            }
         }
      }
      
      const cleanSettings = cleanDocForFirestore(settings);
      const settingsHash = hashItem(cleanSettings);
      if (syncedHashes['settings_global'] !== settingsHash) {
         currentBatch.set(doc(db, 'settings', 'global'), cleanSettings);
         newHashes['settings_global'] = settingsHash;
         writeCount++;
      }
      
      if (writeCount % 400 !== 0 && writeCount > 0) {
         batchWrites.push(currentBatch.commit());
      }
      
      await Promise.all(batchWrites);
      
      try {
        const currentDeletedDocs = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
        if (Array.isArray(currentDeletedDocs) && Array.isArray(parsedDeletedDocs) && parsedDeletedDocs.length > 0) {
          const remainingDeletedDocs = currentDeletedDocs.filter((d: any) => !parsedDeletedDocs.find((synced: any) => synced.col === d.col && synced.id === d.id));
          localStorage.setItem('accounting_deleted_docs', JSON.stringify(remainingDeletedDocs));
        }
      } catch (e) {}
      localStorage.setItem('accounting_synced_hashes', JSON.stringify(newHashes));
      const nowStr = new Date().toLocaleTimeString('en-US');
      setLastFirebaseSyncTime(nowStr);
      setLastSyncTime(nowStr);
      setHasUnsyncedChanges(false);
      setPendingSyncCount(0);
      localStorage.setItem(`${STORAGE_KEY}_last_sync`, nowStr);
      localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'false');
      localStorage.setItem(`${STORAGE_KEY}_pending_sync_count`, '0');
      lastSyncErrorRef.current = null;
      setIsFirebaseSyncing(false);
      return true;
    } catch (e: any) {
      console.warn('Firebase cloud sync notice (system running offline-safe):', e);
      const errMsg = e?.code === 'permission-denied'
        ? 'تم رفض الصلاحية من خادم قاعدة البيانات (Permission Denied)'
        : (e?.message || e?.code || 'تعذر الاتصال بخادم قاعدة البيانات');
      lastSyncErrorRef.current = errMsg;
      setIsFirebaseSyncing(false);
      return false;
    }
  };
  syncToFirebaseRef.current = syncToFirebase;

  // Manual immediate sync trigger with user feedback
  const forceSyncNow = async (): Promise<{ success: boolean; message: string }> => {
    if (!navigator.onLine) {
      return {
        success: false,
        message: 'أنت غير متصل بالإنترنت حالياً. كافة البيانات محفوظة فورياً في LocalStorage وستتم المزامنة تلقائياً بمجرد عودة الاتصال.'
      };
    }
    const ok = await syncToFirebase(true);
    if (ok) {
      try {
        if (fetchFromFirebaseRef.current) {
          await fetchFromFirebaseRef.current();
        }
      } catch (fetchErr) {
        console.warn('Fetch from cloud notice:', fetchErr);
      }
      return {
        success: true,
        message: `تمت المزامنة بنجاح مع قاعدة البيانات للبرنامج الرئيسي (${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}).`
      };
    } else {
      const detail = lastSyncErrorRef.current ? `: ${lastSyncErrorRef.current}` : '';
      return {
        success: false,
        message: `تعذرت المزامنة مع خادم قاعدة البيانات${detail}، البيانات محفوظة بأمان محلياً في الذاكرة.`
      };
    }
  };

  // Initial load from Firebase if available, or sync offline changes to cloud
  

  const fetchCloudData = async (isInitial = false) => {
    let isMounted = true;
    
      if (!navigator.onLine) {
        setIsOnline(false);
        isInitialMount.current = false;
        isCloudHydratedRef.current = true;
        return;
      }
      try {
        // Pre-fetch: do not push unhydrated state to cloud. Cloud database is authoritative.

        const collectionsToFetch = [
          'accounts', 'treasuries', 'parties', 'employees', 'invoices',
          'purchases', 'purchaseReturns', 'salesReturns', 'vouchers', 'printOrders',
          'journalEntries', 'employeeAdvances', 'employeeDeductions', 'employeeIncentives',
          'payrollSheets', 'inventory', 'stockMovements', 'companies', 'branches',
          'warehouses', 'warehouseOperations', 'roles', 'users', 'debtClearings', 'expenses'
        ];
        
        let hasCloudData = false;
        const data: any = {};
        
        // Load set of persistently deleted documents & zeroing cutoffs
        const deletedDocsSet = new Set<string>();
        try {
          const delList = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
          if (Array.isArray(delList)) {
            delList.forEach((d: any) => {
              if (d && d.col && d.id) deletedDocsSet.add(`${d.col}_${d.id}`);
            });
          }
        } catch (e) {}
        const zeroedCutoffs = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_zeroed_cutoffs`) || '{}');

        // Fetch collections in small batches to prevent socket contention on initial load
        const chunkSize = 4;
        for (let i = 0; i < collectionsToFetch.length; i += chunkSize) {
          const chunk = collectionsToFetch.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map(async (colName) => {
              try {
                const querySnapshot = await getDocs(collection(db, colName));
                const filteredDocs: any[] = [];
                if (!querySnapshot.empty) {
                  for (const d of querySnapshot.docs) {
                    const docData = d.data();
                    if (!docData || !docData.id) continue;
                    const docKey = `${colName}_${docData.id}`;
                    
                    // If document was registered as deleted, purge from cloud and do not resurrect
                    if (deletedDocsSet.has(docKey)) {
                      deleteDoc(d.ref).catch(() => {});
                      continue;
                    }

                    // If collection was zeroed, purge documents matching zeroing criteria
                    const cutoff = zeroedCutoffs[colName];
                    if (cutoff) {
                      const docDate = (docData.date || docData.createdAt || docData.openingBalanceDate || '').split('T')[0];
                      if (cutoff.scope === 'all') {
                        deleteDoc(d.ref).catch(() => {});
                        continue;
                      } else if (docDate && docDate <= cutoff.cutoffDate) {
                        deleteDoc(d.ref).catch(() => {});
                        continue;
                      }
                    }

                    filteredDocs.push(docData);
                  }

                  if (filteredDocs.length > 0) {
                    hasCloudData = true;
                  }
                }
                data[colName] = filteredDocs;
              } catch (e: any) {
                // Silently fallback to local state if offline or unavailable
                if (e?.code !== 'unavailable') {
                  console.debug(`Sync notice for ${colName}:`, e?.message || e);
                }
              }
            })
          );
        }
        
        try {
          const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
          if (settingsSnap.exists()) {
            hasCloudData = true;
            data.settings = settingsSnap.data();
          }
        } catch (e: any) {
          if (e?.code !== 'unavailable') {
            console.debug('Settings sync notice:', e?.message || e);
          }
        }
        
        const hasUnsyncedLocalChanges = localStorage.getItem(`${STORAGE_KEY}_has_unsynced`) === 'true';
        if (isMounted && hasUnsyncedLocalChanges) {
            console.log('Local changes pending sync; pushing local changes to cloud first...');
            if (syncToFirebaseRef.current) {
              await syncToFirebaseRef.current(true);
            }
        } else if (isMounted && hasCloudData) {
            if (data.parties !== undefined && data.parties.length > 0) setParties(data.parties);
            if (data.invoices !== undefined && data.invoices.length > 0) setInvoices(data.invoices);
            if (data.employees !== undefined && data.employees.length > 0) setEmployees(data.employees);
            if (data.vouchers !== undefined && data.vouchers.length > 0) setVouchers(data.vouchers);
            if (data.printOrders !== undefined && data.printOrders.length > 0) setPrintOrders(data.printOrders);
            if (data.inventory !== undefined && data.inventory.length > 0) setInventory(data.inventory);
            if (data.accounts !== undefined && data.accounts.length > 0) setAccounts(data.accounts);
            if (data.treasuries !== undefined && data.treasuries.length > 0) setTreasuries(data.treasuries);
            if (data.purchases !== undefined && data.purchases.length > 0) setPurchases(data.purchases);
            if (data.purchaseReturns !== undefined && data.purchaseReturns.length > 0) setPurchaseReturns(data.purchaseReturns);
            if (data.salesReturns !== undefined && data.salesReturns.length > 0) setSalesReturns(data.salesReturns);
            if (data.journalEntries !== undefined && data.journalEntries.length > 0) setJournalEntries(data.journalEntries);
            if (data.employeeAdvances !== undefined && data.employeeAdvances.length > 0) setEmployeeAdvances(data.employeeAdvances);
            if (data.employeeDeductions !== undefined && data.employeeDeductions.length > 0) setEmployeeDeductions(data.employeeDeductions);
            if (data.employeeIncentives !== undefined && data.employeeIncentives.length > 0) setEmployeeIncentives(data.employeeIncentives);
            if (data.payrollSheets !== undefined && data.payrollSheets.length > 0) setPayrollSheets(data.payrollSheets);
            if (data.stockMovements !== undefined && data.stockMovements.length > 0) setStockMovements(data.stockMovements);
            if (data.companies !== undefined && data.companies.length > 0) setCompanies(data.companies);
            if (data.branches !== undefined && data.branches.length > 0) setBranches(data.branches);
            if (data.warehouses !== undefined && data.warehouses.length > 0) setWarehouses(data.warehouses);
            if (data.warehouseOperations !== undefined && data.warehouseOperations.length > 0) setWarehouseOperations(data.warehouseOperations);
            if (data.roles !== undefined && data.roles.length > 0) setRoles(data.roles);
            if (data.users !== undefined && data.users.length > 0) {
              const cleanCloudUsers = data.users.filter((u: any) => u && u.id && !deletedDocsSet.has(`users_${u.id}`));
              if (cleanCloudUsers.length > 0) {
                setUsers(cleanCloudUsers);
                try {
                  localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(cleanCloudUsers));
                } catch(e) {}
              }
            }
            if (data.debtClearings !== undefined && data.debtClearings.length > 0) setDebtClearings(data.debtClearings);
            if (data.expenses !== undefined && data.expenses.length > 0) setExpenses(data.expenses);
            
            if (data.settings && typeof data.settings === 'object') {
              setSettings(prev => ({
                ...prev,
                ...data.settings,
                currency: data.settings.currency || prev.currency || '₪',
                baseCurrencyCode: data.settings.baseCurrencyCode || prev.baseCurrencyCode || 'ILS',
                currencies: (data.settings.currencies && data.settings.currencies.length > 0) ? data.settings.currencies : prev.currencies
              }));
            }

            // Build accurate local hashes from cloud content so we don't treat fresh deployment as unsynced
            const newHashes: Record<string, string> = {};
            for (const [colName, items] of Object.entries(data)) {
                if (Array.isArray(items)) {
                    for (const item of items) {
                        if (item && item.id) {
                            newHashes[`${colName}_${item.id}`] = JSON.stringify(item);
                        }
                    }
                }
            }
            if (data.settings) {
                newHashes['settings_global'] = JSON.stringify(data.settings);
            }
            localStorage.setItem('accounting_synced_hashes', JSON.stringify(newHashes));

            const timeStr = new Date().toLocaleTimeString('en-US');
            setLastFirebaseSyncTime(timeStr);
            setLastSyncTime(timeStr);
            setHasUnsyncedChanges(false);
            setPendingSyncCount(0);
            localStorage.setItem(`${STORAGE_KEY}_last_sync`, timeStr);
            localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'false');
            localStorage.setItem(`${STORAGE_KEY}_pending_sync_count`, '0');
        } else if (isMounted && !hasCloudData) {
          console.log('Database cloud connection ready.');
        }
      } catch (err) {
        console.log('Firebase cloud ready / offline mode active:', err);
      } finally {
        if (isMounted) {
          isCloudHydratedRef.current = true;
          setTimeout(() => {
            isInitialMount.current = false;
          }, 400);
        }
      }
    
  };
  fetchFromFirebaseRef.current = fetchCloudData;

  useEffect(() => {
    fetchCloudData(true);

    const unsubs: (() => void)[] = [];

    const getDeletedSet = () => {
      const set = new Set<string>();
      try {
        const delList = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
        if (Array.isArray(delList)) {
          delList.forEach((d: any) => {
            if (d && d.col && d.id) set.add(`${d.col}_${d.id}`);
          });
        }
      } catch {}
      return set;
    };

    const isPendingUnsynced = () => localStorage.getItem(`${STORAGE_KEY}_has_unsynced`) === 'true';

    try {
      // 1. Live Invoices (فواتير المبيعات ونقاط البيع لحظياً لكافة المستخدمين)
      const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snapshot) => {
        // Live sync processing
        const delSet = getDeletedSet();
        const docs = snapshot.docs
          .map(d => ({ ...d.data(), id: d.id } as Invoice))
          .filter(inv => {
            if (!inv || !inv.id || delSet.has(`invoices_${inv.id}`)) return false;
            const num = parseInt((inv.invoiceNumber || '').replace(/\D/g, ''), 10);
            if (num === 11 || inv.invoiceNumber === 'INV-0011' || inv.invoiceNumber === 'INV-00011' || inv.id === 'inv-11') {
              registerDeletedDoc('invoices', inv.id);
              deleteDoc(doc(db, 'invoices', inv.id)).catch(err => { if (err?.code !== 'resource-exhausted') console.debug(err); });
              return false;
            }
            return true;
          })
          .map(inv => {
            if (!inv || !Array.isArray(inv.items)) return inv;
            let hasChange = false;
            const items = inv.items.map(it => {
              if (
                it.itemCode === 'PRI-0009' ||
                it.itemName?.includes('جاليه سيلكون')
              ) {
                hasChange = true;
                return { ...it, itemCode: 'TEX-0001' };
              }
              return it;
            });
            if (hasChange) {
              const updated = { ...inv, items };
              setDoc(doc(db, 'invoices', inv.id), cleanDocForFirestore(updated), { merge: true }).catch(() => {});
              return updated;
            }
            return inv;
          });
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => {
          const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
          const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
          if (numA !== numB) return numB - numA;
          const invCmp = (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
          if (invCmp !== 0) return invCmp;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        // Deduplicate strictly by ID first, then by invoiceNumber to eliminate ghost duplicates
        const dedupedById = deduplicateById(docs, 'inv');
        const seenNumbers = new Set<string>();
        const dedupedInvoices: Invoice[] = [];

        for (const inv of dedupedById) {
          const num = (inv.invoiceNumber || '').trim();
          if (num && seenNumbers.has(num)) {
            // Delete duplicate ghost copy from Firestore
            deleteDoc(doc(db, 'invoices', inv.id)).catch(() => {});
            continue;
          }
          if (num) seenNumbers.add(num);
          dedupedInvoices.push(inv);
        }

        setInvoices(dedupedInvoices);
        try { localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(dedupedInvoices)); } catch {}
      }, (e) => console.debug('Live invoices sync:', e));
      unsubs.push(unsubInvoices);

      // 1B. Live Deleted Invoices (سلة فواتير المبيعات المحذوفة)
      const unsubDeletedInvoices = onSnapshot(collection(db, 'deletedInvoices'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Invoice));
        docs.sort((a, b) => {
          const timeA = new Date(a.deletedAt || a.date || 0).getTime() || 0;
          const timeB = new Date(b.deletedAt || b.date || 0).getTime() || 0;
          return timeB - timeA;
        });
        const dedupedDel = deduplicateById(docs, 'inv');
        setDeletedInvoices(dedupedDel);
        try { localStorage.setItem(`${STORAGE_KEY}_deleted_invoices`, JSON.stringify(dedupedDel)); } catch {}
      }, (e) => console.debug('Live deleted invoices sync:', e));
      unsubs.push(unsubDeletedInvoices);

      // 2. Live Print Orders (أوامر تشغيل ومطبوعات المطبعة لحظياً للجميع)
      const unsubPrintOrders = onSnapshot(collection(db, 'printOrders'), (snapshot) => {
        // Live sync processing
        const delSet = getDeletedSet();
        const docs = snapshot.docs
          .map(d => d.data() as PrintJobOrder)
          .filter(ord => ord && ord.id && !delSet.has(`printOrders_${ord.id}`))
          .map(ord => {
            if (!ord || !Array.isArray(ord.items)) return ord;
            let hasChange = false;
            const items = ord.items.map(it => {
              if (it.itemCode === 'PRI-0009' || it.itemName?.includes('جاليه سيلكون')) {
                hasChange = true;
                return { ...it, itemCode: 'TEX-0001' };
              }
              return it;
            });
            if (hasChange) {
              const updated = { ...ord, items };
              setDoc(doc(db, 'printOrders', ord.id), cleanDocForFirestore(updated), { merge: true }).catch(() => {});
              return updated;
            }
            return ord;
          });
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (b.id || '').localeCompare(a.id || ''));
        const dedupedPrn = deduplicateById(docs, 'prn');
        setPrintOrders(dedupedPrn);
        try { localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(dedupedPrn)); } catch {}
      }, (e) => console.debug('Live printOrders sync:', e));
      unsubs.push(unsubPrintOrders);

      // 3. Live Parties (العملاء والموردين وحساباتهم وأرصدتهم لحظياً)
      const unsubParties = onSnapshot(collection(db, 'parties'), (snapshot) => {
        // Live sync processing
        const delSet = getDeletedSet();
        const docs = snapshot.docs
          .map(d => d.data() as Party)
          .filter(p => p && p.id && p.name && p.name.trim() && !p.id.startsWith('emp-') && !delSet.has(`parties_${p.id}`));
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || ''));
        const dedupedParties = deduplicateById(docs, 'party');
        setParties(dedupedParties);
        try { localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(dedupedParties)); } catch {}
      }, (e) => console.debug('Live parties sync:', e));
      unsubs.push(unsubParties);

      // 4. Live Inventory (المخزون، الأصناف، والأسعار لكافة المستخدمين)
      const unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
        // Live sync processing
        const delSet = getDeletedSet();
        const docs = snapshot.docs
          .map(d => ({ ...d.data(), id: d.id } as InventoryItem))
          .filter(it => it && it.id && !delSet.has(`inventory_${it.id}`))
          .map(it => {
            if (
              it.code === 'PRI-0009' ||
              it.name?.includes('جاليه سيلكون') ||
              (it.name?.includes('جاليه') && (it.category === 'مطبوعات قماش' || it.category === 'textiles'))
            ) {
              const updated = { ...it, code: 'TEX-0001', category: 'textiles' };
              if (it.code !== 'TEX-0001' || it.category !== 'textiles') {
                setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updated), { merge: true }).catch(() => {});
              }
              return updated;
            }
            return it;
          });
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || ''));
        const dedupedInventory = deduplicateById(docs, 'inv');
        setInventory(dedupedInventory);
        try { localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(dedupedInventory)); } catch {}
      }, (e) => console.debug('Live inventory sync:', e));
      unsubs.push(unsubInventory);

      // 5. Live Vouchers (سندات القبض والصرف)
      const unsubVouchers = onSnapshot(collection(db, 'vouchers'), (snapshot) => {
        // Live sync processing
        const delSet = getDeletedSet();
        const docs = snapshot.docs
          .map(d => d.data() as PaymentVoucher)
          .filter(v => v && v.id && !delSet.has(`vouchers_${v.id}`));
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
        setVouchers(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live vouchers sync:', e));
      unsubs.push(unsubVouchers);

      // 6. Live Users (المستخدمين وبياناتهم وصلاحياتهم المحفوظة في قاعدة البيانات)
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        // Live sync processing
        const delSet = getDeletedSet();
        const docs = snapshot.docs
          .map(d => d.data() as SystemUser)
          .filter(u => u && u.id && !delSet.has(`users_${u.id}`));
        if (docs.length > 0) {
          setUsers(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live users sync:', e));
      unsubs.push(unsubUsers);

      // 7. Live Roles (الأدوار وصلاحيات الشاشات)
      const unsubRoles = onSnapshot(collection(db, 'roles'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as Role).filter(r => r && r.id);
        if (docs.length > 0) {
          setRoles(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_roles`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live roles sync:', e));
      unsubs.push(unsubRoles);

      // 8. Live Treasuries (الصناديق والخزائن)
      const unsubTreasuries = onSnapshot(collection(db, 'treasuries'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as Treasury).filter(t => t && t.id);
        if (docs.length > 0) {
          docs.sort((a, b) => (a.accountCode || '').localeCompare(b.accountCode || '') || (a.name || '').localeCompare(b.name || ''));
          setTreasuries(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live treasuries sync:', e));
      unsubs.push(unsubTreasuries);

      // 9. Live Purchases (المشتريات)
      const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as PurchaseInvoice).filter(p => p && p.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
        setPurchases(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live purchases sync:', e));
      unsubs.push(unsubPurchases);

      // 10. Live Expenses (المصروفات)
      const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as ExpenseItem).filter(e => e && e.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
        setExpenses(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live expenses sync:', e));
      unsubs.push(unsubExpenses);

      // 11. Live Debt Clearings (المقاصات)
      const unsubDebtClearings = onSnapshot(collection(db, 'debtClearings'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as DebtClearingRecord).filter(dc => dc && dc.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
        setDebtClearings(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live debtClearings sync:', e));
      unsubs.push(unsubDebtClearings);

      // 12. Live Accounts (شجرة الحسابات)
      const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as Account).filter(a => a && a.code);
        if (docs.length > 0) {
          docs.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
          setAccounts(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live accounts sync:', e));
      unsubs.push(unsubAccounts);

      // 13. Live Journal Entries (قيود اليومية العامة)
      const unsubJournals = onSnapshot(collection(db, 'journals'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as JournalEntry).filter(j => j && j.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.entryNumber) || 0) - (Number(a.entryNumber) || 0));
        setJournalEntries(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live journals sync:', e));
      unsubs.push(unsubJournals);

      // 14. Live Stock Movements (حركات المخزون)
      const unsubStockMovements = onSnapshot(collection(db, 'stockMovements'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as StockMovement).filter(sm => sm && sm.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setStockMovements(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live stockMovements sync:', e));
      unsubs.push(unsubStockMovements);

      // 15. Live Employees (الموظفين)
      const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as Employee).filter(emp => emp && emp.id);
        if (docs.length > 0) {
          docs.sort((a, b) => (a.code || '').localeCompare(b.code || '') || (a.name || '').localeCompare(b.name || ''));
          setEmployees(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live employees sync:', e));
      unsubs.push(unsubEmployees);

      // 16. Live Payroll Sheets (مسيرات الرواتب)
      const unsubPayroll = onSnapshot(collection(db, 'payrollSheets'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as PayrollSheet).filter(ps => ps && ps.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setPayrollSheets(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_payrollSheets`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live payroll sync:', e));
      unsubs.push(unsubPayroll);

      // 17. Live Companies & Branches (الشركات والفروع)
      const unsubBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as Branch).filter(b => b && b.id);
        if (docs.length > 0) {
          docs.sort((a, b) => (a.branchCode || '').localeCompare(b.branchCode || ''));
          setBranches(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live branches sync:', e));
      unsubs.push(unsubBranches);

      // 18. Live Warehouses & Operations (المستودعات وحركاتها)
      const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as Warehouse).filter(w => w && w.id);
        if (docs.length > 0) {
          docs.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
          setWarehouses(docs);
          try { localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(docs)); } catch {}
        }
      }, (e) => console.debug('Live warehouses sync:', e));
      unsubs.push(unsubWarehouses);

      const unsubWhOps = onSnapshot(collection(db, 'warehouseOperations'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as WarehouseOperation).filter(wo => wo && wo.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setWarehouseOperations(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_warehouse_operations`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live warehouseOperations sync:', e));
      unsubs.push(unsubWhOps);

      // 19. Live Sales Returns & Purchase Returns (المردودات)
      const unsubSalesReturns = onSnapshot(collection(db, 'salesReturns'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as SalesReturn).filter(sr => sr && sr.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setSalesReturns(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live salesReturns sync:', e));
      unsubs.push(unsubSalesReturns);

      const unsubPurchaseReturns = onSnapshot(collection(db, 'purchaseReturns'), (snapshot) => {
        // Live sync processing
        const docs = snapshot.docs.map(d => d.data() as PurchaseReturn).filter(pr => pr && pr.id);
        if (docs.length === 0 && isPendingUnsynced()) return;
        docs.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setPurchaseReturns(docs);
        try { localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(docs)); } catch {}
      }, (e) => console.debug('Live purchaseReturns sync:', e));
      unsubs.push(unsubPurchaseReturns);

      // 20. Live Daily Entry Sheets Realtime Multi-User Sync (كشف الإدخال اليومي المتزامن سحابياً)
      const unsubDailyEntrySheets = onSnapshot(collection(db, 'dailyEntrySheets'), (snapshot) => {
        // Live sync processing
        const sheetsMap: Record<string, DailyEntrySheet> = {};
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data() as DailyEntrySheet;
          if (data && data.date) {
            sheetsMap[data.date] = data;
          }
        });
        if (Object.keys(sheetsMap).length > 0) {
          setDailyEntrySheets(prev => {
            const merged = { ...prev, ...sheetsMap };
            try {
              localStorage.setItem('accounting_daily_entry_sheets_v1', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      }, (e) => console.debug('Live dailyEntrySheets sync notice:', e));
      unsubs.push(unsubDailyEntrySheets);
    } catch (listenerErr) {
      console.warn('Realtime listeners initialization notice:', listenerErr);
    }

    return () => {
      unsubs.forEach(unsub => {
        try { unsub(); } catch {}
      });
    };
  }, []);

  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<PurchaseInvoice | null>(null);
  const [selectedReturnForPrint, setSelectedReturnForPrint] = useState<PurchaseReturn | null>(null);
  const [selectedSalesReturnForPrint, setSelectedSalesReturnForPrint] = useState<SalesReturn | null>(null);

  // Instant LocalStorage Persistence + Debounced Cloud Auto-Sync
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(settings));
      localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(accounts));
      localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(treasuries));
      localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(journalEntries));
      localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(inventory));
      localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(parties));
      localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(employees));
      localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(printOrders));
      localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(invoices));
      localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(purchases));
      localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(purchaseReturns));
      localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(salesReturns));
      localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(vouchers));
      localStorage.setItem(`${STORAGE_KEY}_advances`, JSON.stringify(employeeAdvances));
      localStorage.setItem(`${STORAGE_KEY}_deductions`, JSON.stringify(employeeDeductions));
      localStorage.setItem(`${STORAGE_KEY}_incentives`, JSON.stringify(employeeIncentives));
      localStorage.setItem(`${STORAGE_KEY}_payrollSheets`, JSON.stringify(payrollSheets));
      localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(stockMovements));
      localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(companies));
      localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branches));
      localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(warehouses));
      localStorage.setItem(`${STORAGE_KEY}_warehouse_operations`, JSON.stringify(warehouseOperations));
      localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(debtClearings));
      localStorage.setItem(`${STORAGE_KEY}_active_warehouse_id`, activeWarehouseId);
      localStorage.setItem(`${STORAGE_KEY}_roles`, JSON.stringify(roles));
      localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(users));
      localStorage.setItem(`${STORAGE_KEY}_active_company_id`, activeCompanyId);
      localStorage.setItem(`${STORAGE_KEY}_active_branch_id`, activeBranchId);
      localStorage.setItem(`${STORAGE_KEY}_current_user_id`, currentUserId);

      const nowTime = new Date().toLocaleTimeString('en-US');
      localStorage.setItem(`${STORAGE_KEY}_last_local_save`, nowTime);
      setLastLocalSaveTime(nowTime);

      if (!isInitialMount.current && isCloudHydratedRef.current) {
        setHasUnsyncedChanges(true);
        setPendingSyncCount(prev => prev + 1);
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');

        // Debounced automatic background sync to main database when online
        if (debouncedSyncRef.current) {
          clearTimeout(debouncedSyncRef.current);
        }
        debouncedSyncRef.current = setTimeout(() => {
          if (navigator.onLine && syncToFirebaseRef.current) {
            syncToFirebaseRef.current();
          }
        }, 2500);
      }
    } catch (err) {
      console.warn('LocalStorage immediate save notice:', err);
    }
  }, [settings, accounts, treasuries, journalEntries, inventory, parties, employees, printOrders, invoices, purchases, purchaseReturns, salesReturns, vouchers, employeeAdvances, employeeDeductions, employeeIncentives, payrollSheets, stockMovements, companies, branches, warehouses, warehouseOperations, activeWarehouseId, roles, users, activeCompanyId, activeBranchId, currentUserId]);

  // Keep treasury balances synchronized with their Chart of Accounts assets
  useEffect(() => {
    setTreasuries(prev =>
      prev.map(t => {
        const acc = accounts.find(a => a.code === t.accountCode);
        if (acc && acc.balance !== t.balance) {
          return { ...t, balance: acc.balance };
        }
        return t;
      })
    );
  }, [accounts]);

  // One-time data consistency and SKU migration (TEX-0001 for جاليه سيلكون)
  useEffect(() => {
    try {
      const draftKeys = [
        'accounting_pending_multi_draft_invoices_v5',
        'accounting_pending_draft_invoices_v4',
        'accounting_pending_draft_invoices_v3',
        'live_onedrive_drafts_v3'
      ];
      draftKeys.forEach(k => {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            let changed = false;
            const next = parsed.map((d: any) => {
              if (Array.isArray(d.items)) {
                const items = d.items.map((it: any) => {
                  if (it.itemCode === 'PRI-0009' || it.itemName?.includes('جاليه سيلكون')) {
                    changed = true;
                    return { ...it, itemCode: 'TEX-0001' };
                  }
                  return it;
                });
                return { ...d, items };
              }
              return d;
            });
            if (changed) {
              localStorage.setItem(k, JSON.stringify(next));
            }
          }
        }
      });
    } catch (e) {
      console.warn('Drafts migration notice:', e);
    }
  }, []);

  // Helper accessors and CRUD for Multi-Company, Multi-Branch & Granular RBAC
  const currentUser: SystemUser = React.useMemo(() => {
    return users.find(u => u.id === currentUserId) || users[0] || {
      id: 'usr-admin',
      companyId: 'comp-1',
      username: 'admin',
      fullName: 'مدير النظام',
      roleId: 'role-admin',
      roleName: 'مدير النظام',
      defaultBranchId: 'br-1',
      allowedBranchIds: ['*'],
      status: 'active',
      createdAt: '2024-01-01'
    };
  }, [users, currentUserId]);

  const getCurrentUser = (): SystemUser => {
    return users.find(u => u.id === currentUserId) || users[0] || {
      id: 'usr-admin',
      companyId: 'comp-1',
      username: 'admin',
      fullName: 'مدير النظام',
      roleId: 'role-admin',
      roleName: 'مدير النظام',
      defaultBranchId: 'br-1',
      allowedBranchIds: ['*'],
      status: 'active',
      createdAt: '2024-01-01'
    };
  };

  const acquireDailyEntryRowLock = (date: string, rowId: string, field?: string) => {
    const user = currentUser;
    const lock: RowLockInfo = {
      rowId,
      userId: user?.id || currentUserId || 'usr-anon',
      userName: user?.fullName || user?.username || 'مستخدم النظام',
      userEmail: user?.email,
      field,
      lockedAt: Date.now()
    };

    setTimeout(() => {
      setDailyEntrySheets(prev => {
        const sheet = prev[date] || { date, rows: [], notes: '', updatedAt: new Date().toISOString() };
        const currentLocks = { ...(sheet.activeLocks || {}) };
        const now = Date.now();
        Object.keys(currentLocks).forEach(k => {
          if (now - (currentLocks[k]?.lockedAt || 0) > 120000) {
            delete currentLocks[k];
          }
        });
        currentLocks[rowId] = lock;
        const updatedSheet: DailyEntrySheet = {
          ...sheet,
          activeLocks: currentLocks
        };
        const updated = { ...prev, [date]: updatedSheet };
        try {
          setDoc(doc(db, 'dailyEntrySheets', date), cleanDocForFirestore(updatedSheet), { merge: true }).catch(() => {});
        } catch (e) {}
        return updated;
      });
    }, 0);
  };

  const releaseDailyEntryRowLock = (date: string, rowId: string) => {
    setTimeout(() => {
      setDailyEntrySheets(prev => {
        const sheet = prev[date];
        if (!sheet || !sheet.activeLocks || !sheet.activeLocks[rowId]) return prev;
        const currentLocks = { ...sheet.activeLocks };
        delete currentLocks[rowId];
        const updatedSheet: DailyEntrySheet = {
          ...sheet,
          activeLocks: currentLocks
        };
        const updated = { ...prev, [date]: updatedSheet };
        try {
          setDoc(doc(db, 'dailyEntrySheets', date), cleanDocForFirestore(updatedSheet), { merge: true }).catch(() => {});
        } catch (e) {}
        return updated;
      });
    }, 0);
  };

  const forceReleaseDailyEntryRowLock = (date: string, rowId: string) => {
    releaseDailyEntryRowLock(date, rowId);
  };

  const getActiveBranch = (): Branch | undefined => {
    return branches.find(b => b.id === activeBranchId) || branches[0];
  };

  const hasPermission = (permission: PermissionKey): boolean => {
    const user = users.find(u => u.id === currentUserId) || users[0];
    if (!user) return true;

    // Check custom overrides first
    if (user.customPermissions && user.customPermissions[permission] !== undefined) {
      return !!user.customPermissions[permission];
    }

    const role = roles.find(r => r.id === user.roleId);
    if (!role) return true;

    // System Admins & General Managers have full access
    if (role.code === 'SYS_ADMIN' || role.code === 'GEN_MGR') {
      return true;
    }

    return !!role.permissions[permission];
  };

  const canAccessBranch = (branchId: string, user?: SystemUser): boolean => {
    return true;
  };

  const getAllowedBranchesForUser = (user?: SystemUser): Branch[] => {
    return branches;
  };

  // Resolve effective price for item considering customer special prices & allowed pricing tier
  const getItemPriceForCustomer = (
    item: InventoryItem,
    customerId?: string,
    tier: 'price1' | 'price2' | 'price3' | 'retail' | 'wholesale' | 'special' = 'price1'
  ): { price: number; isSpecialPrice: boolean; specialPriceLabel?: string } => {
    if (customerId) {
      // 1. Check special prices recorded on the item card itself (item.customerSpecialPrices)
      if (item.customerSpecialPrices && item.customerSpecialPrices.length > 0) {
        const specialFromItem = item.customerSpecialPrices.find(sp => sp.customerId === customerId);
        if (specialFromItem && typeof specialFromItem.price === 'number' && specialFromItem.price >= 0) {
          return {
            price: specialFromItem.price,
            isSpecialPrice: true,
            specialPriceLabel: specialFromItem.notes || `سعر خاص للعميل (${specialFromItem.price} ₪)`
          };
        }
      }

      // 2. Check special prices stored in customer profile (party.specialPrices)
      const party = parties.find(p => p.id === customerId);
      if (party?.specialPrices && party.specialPrices[item.id] !== undefined) {
        const partyPrice = party.specialPrices[item.id];
        if (typeof partyPrice === 'number' && partyPrice >= 0) {
          return {
            price: partyPrice,
            isSpecialPrice: true,
            specialPriceLabel: `سعر خاص بملف العميل (${partyPrice} ₪)`
          };
        }
      }
    }

    // Tier fallback (retail / price1, wholesale / price2, special / price3)
    const normalizedTier = tier === 'retail' ? 'price1' : tier === 'wholesale' ? 'price2' : tier === 'special' ? 'price3' : tier;

    if (normalizedTier === 'price2') {
      if (item.sellingPrice2 !== undefined && item.sellingPrice2 > 0) {
        return { price: item.sellingPrice2, isSpecialPrice: false };
      }
      // Wholesale fallback if sellingPrice2 not explicitly entered: 90% of sellingPrice
      return { price: Number((item.sellingPrice * 0.9).toFixed(2)), isSpecialPrice: false };
    }

    if (normalizedTier === 'price3') {
      if (item.sellingPrice3 !== undefined && item.sellingPrice3 > 0) {
        return { price: item.sellingPrice3, isSpecialPrice: false };
      }
      return { price: item.sellingPrice, isSpecialPrice: false };
    }

    // Default: price1 (سعر بيع 1)
    return { price: item.sellingPrice, isSpecialPrice: false };
  };

  // Get current user price permissions and allowed tiers
  const getCurrentUserPricePolicy = (user?: SystemUser) => {
    const targetUser = user || users.find(u => u.id === currentUserId) || users[0];
    const role = targetUser ? roles.find(r => r.id === targetUser.roleId) : undefined;

    // Check permission to edit price manually
    const canEditPrice = hasPermission('edit_prices');

    // Allowed price tiers
    const allowedTier: AllowedPriceTierScope = targetUser?.allowedPriceTier || role?.allowedPriceTier || 'all';
    const defaultTier: PriceTierKey = targetUser?.defaultPriceTier || role?.defaultPriceTier || 'price1';

    return {
      canEditPrice,
      allowedTier,
      defaultTier
    };
  };

  // CRUD for Company
  const addCompany = (comp: Omit<Company, 'id' | 'createdAt'>): Company => {
    const newComp: Company = {
      ...comp,
      id: `comp-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setCompanies(prev => [...prev, newComp]);
    setDoc(doc(db, 'companies', newComp.id), cleanDocForFirestore(newComp)).catch(() => {});
    return newComp;
  };

  const updateCompany = (id: string, updated: Partial<Company>) => {
    const existing = companies.find(c => c.id === id);
    const merged: Company = existing ? { ...existing, ...updated } : ({ ...updated, id } as Company);
    setCompanies(prev => prev.map(c => (c.id === id ? merged : c)));
    try {
      const next = companies.map(c => (c.id === id ? merged : c));
      localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(next));
    } catch {}
    setDoc(doc(db, 'companies', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
  };

  const deleteCompany = (id: string) => {
    if (companies.length <= 1) {
      return { success: false, message: 'لا يمكن حذف الشركة الوحيدة المتبقية بالنظام' };
    }
    setCompanies(prev => prev.filter(c => c.id !== id));
    deleteDoc(doc(db, 'companies', id)).catch(e => console.warn('Could not delete company in cloud:', e));
    return { success: true };
  };

  // CRUD for Branch
  const addBranch = (branch: Omit<Branch, 'id' | 'createdAt'>): Branch => {
    const newBranch: Branch = {
      ...branch,
      id: `br-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setBranches(prev => [...prev, newBranch]);
    setDoc(doc(db, 'branches', newBranch.id), cleanDocForFirestore(newBranch)).catch(() => {});
    return newBranch;
  };

  const updateBranch = (id: string, updated: Partial<Branch>) => {
    const existing = branches.find(b => b.id === id);
    const merged: Branch = existing ? { ...existing, ...updated } : ({ ...updated, id } as Branch);
    setBranches(prev => prev.map(b => (b.id === id ? merged : b)));
    try {
      const next = branches.map(b => (b.id === id ? merged : b));
      localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(next));
    } catch {}
    setDoc(doc(db, 'branches', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
  };

  const deleteBranch = (id: string) => {
    if (branches.length <= 1) {
      return { success: false, message: 'لا يمكن حذف الفرع الوحيد المتبقي بالنظام' };
    }
    setBranches(prev => prev.filter(b => b.id !== id));
    deleteDoc(doc(db, 'branches', id)).catch(e => console.warn('Could not delete branch in cloud:', e));
    if (activeBranchId === id) {
      const remaining = branches.filter(b => b.id !== id);
      if (remaining.length > 0) setActiveBranchId(remaining[0].id);
    }
    return { success: true };
  };

  // CRUD & Operations for Warehouses (نظام المخازن والعمليات)
  const addWarehouse = (wh: Omit<Warehouse, 'id' | 'createdAt'>): Warehouse => {
    const branch = branches.find(b => b.id === wh.branchId);
    const newWh: Warehouse = {
      ...wh,
      id: `wh-${Date.now()}`,
      branchName: wh.branchName || branch?.name,
      status: wh.status || 'active',
      warehouseType: wh.warehouseType || 'general_main',
      createdAt: new Date().toISOString()
    };
    setWarehouses(prev => [...prev, newWh]);
    setDoc(doc(db, 'warehouses', newWh.id), cleanDocForFirestore(newWh)).catch(() => {});

    // Link new warehouse to its branch if not already linked
    if (wh.branchId) {
      setBranches(prev => prev.map(b => {
        if (b.id === wh.branchId && !b.warehouseIds.includes(newWh.id)) {
          const updatedB = { ...b, warehouseIds: [...b.warehouseIds, newWh.id] };
          setDoc(doc(db, 'branches', b.id), cleanDocForFirestore(updatedB)).catch(() => {});
          return updatedB;
        }
        return b;
      }));
    }

    return newWh;
  };

  const updateWarehouse = (id: string, updated: Partial<Warehouse>) => {
    const existing = warehouses.find(w => w.id === id);
    let nextWh: Warehouse = existing ? { ...existing, ...updated } : ({ ...updated, id } as Warehouse);
    if (updated.branchId) {
      const b = branches.find(br => br.id === updated.branchId);
      nextWh.branchName = b?.name || nextWh.branchName;
    }
    setWarehouses(prev => prev.map(w => (w.id === id ? nextWh : w)));
    try {
      const next = warehouses.map(w => (w.id === id ? nextWh : w));
      localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(next));
    } catch {}
    setDoc(doc(db, 'warehouses', id), cleanDocForFirestore(nextWh), { merge: true }).catch(() => {});

    // Update branch warehouseIds if branch changed
    if (updated.branchId) {
      setBranches(prev => prev.map(b => {
        if (b.id === updated.branchId && !b.warehouseIds.includes(id)) {
          const updatedB = { ...b, warehouseIds: [...b.warehouseIds, id] };
          setDoc(doc(db, 'branches', b.id), cleanDocForFirestore(updatedB)).catch(() => {});
          return updatedB;
        }
        return b;
      }));
    }
  };

  const deleteWarehouse = (id: string) => {
    if (warehouses.length <= 1) {
      return { success: false, message: 'لا يمكن حذف المستودع الوحيد المتبقي بالنظام' };
    }
    setWarehouses(prev => prev.filter(w => w.id !== id));
    deleteDoc(doc(db, 'warehouses', id)).catch(e => console.warn('Could not delete warehouse in cloud:', e));
    setBranches(prev => prev.map(b => {
      const updatedB = {
        ...b,
        warehouseIds: b.warehouseIds.filter(wId => wId !== id)
      };
      setDoc(doc(db, 'branches', b.id), cleanDocForFirestore(updatedB)).catch(() => {});
      return updatedB;
    }));
    if (activeWarehouseId === id) {
      const remaining = warehouses.filter(w => w.id !== id);
      if (remaining.length > 0) setActiveWarehouseId(remaining[0].id);
    }
    return { success: true };
  };

  const getWarehousesForBranch = (branchId?: string): Warehouse[] => {
    const targetBranchId = branchId || activeBranchId;
    return warehouses.filter(w => w.branchId === targetBranchId);
  };

  const getWarehouseStock = (warehouseId: string, itemId: string): number => {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return 0;
    if (item.warehouseStock && item.warehouseStock[warehouseId] !== undefined) {
      return item.warehouseStock[warehouseId];
    }
    // Fallback: Default warehouse or first warehouse gets current stock if not partitioned yet
    const targetWh = warehouses.find(w => w.id === warehouseId);
    if (targetWh?.isDefault || warehouses[0]?.id === warehouseId) {
      return item.stockQuantity;
    }
    return 0;
  };

  const addWarehouseOperation = (
    op: Omit<WarehouseOperation, 'id' | 'createdAt'> & { documentNumber?: string; date?: string; time?: string }
  ): WarehouseOperation => {
    const typePrefixes: Record<WarehouseOperationType, string> = {
      receipt: 'REC',
      issue: 'ISS',
      transfer: 'TRF',
      audit: 'AUD',
      settlement: 'ADJ',
      damaged: 'DMG',
      return: 'RET',
      stock_modify: 'MOD'
    };
    const prefix = typePrefixes[op.operationType] || 'WH';
    const year = new Date().getFullYear();
    const existingCount = warehouseOperations.filter(o => o.operationType === op.operationType).length + 1;
    const autoDocNumber = op.documentNumber || `${prefix}-${year}-${String(existingCount).padStart(4, '0')}`;

    const branch = branches.find(b => b.id === op.branchId);
    const warehouse = warehouses.find(w => w.id === op.warehouseId);
    const targetBranch = op.targetBranchId ? branches.find(b => b.id === op.targetBranchId) : undefined;
    const targetWarehouse = op.targetWarehouseId ? warehouses.find(w => w.id === op.targetWarehouseId) : undefined;

    const opDate = op.date || new Date().toISOString().split('T')[0];
    const opTime = op.time || new Date().toLocaleTimeString('ar-SA', { hour12: false });

    const newOp: WarehouseOperation = {
      ...op,
      id: `w-op-${Date.now()}`,
      documentNumber: autoDocNumber,
      date: opDate,
      time: opTime,
      branchName: op.branchName || branch?.name || 'الفرع الرئيسي',
      warehouseName: op.warehouseName || warehouse?.name || 'المستودع الرئيسي',
      targetBranchName: op.targetBranchName || targetBranch?.name,
      targetWarehouseName: op.targetWarehouseName || targetWarehouse?.name,
      userId: op.userId || currentUser.id,
      userName: op.userName || currentUser.fullName,
      userRole: op.userRole || currentUser.roleName,
      status: op.status || 'completed',
      createdAt: new Date().toISOString()
    };

    // Apply inventory stock changes & movements
    setInventory(prevInventory => {
      const updatedInventory = [...prevInventory];
      const newStockMovementsToAdd: StockMovement[] = [];

      newOp.items.forEach(opItem => {
        const itemIndex = updatedInventory.findIndex(it => it.id === opItem.itemId);
        if (itemIndex === -1) return;

        const currentItem = updatedInventory[itemIndex];
        const oldTotalStock = currentItem.stockQuantity;
        const currentWhStock = (currentItem.warehouseStock && currentItem.warehouseStock[newOp.warehouseId] !== undefined)
          ? currentItem.warehouseStock[newOp.warehouseId]
          : oldTotalStock;

        let newTotalStock = oldTotalStock;
        let newWhStock = currentWhStock;
        let targetWhOldStock = 0;
        let targetWhNewStock = 0;

        const itemWarehouseStock = { ...(currentItem.warehouseStock || {}) };

        switch (newOp.operationType) {
          case 'receipt': // استلام (زيادة رصيد)
            newTotalStock = oldTotalStock + opItem.quantity;
            newWhStock = currentWhStock + opItem.quantity;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'in_receipt',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'receipt',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: newOp.notes || opItem.notes
            });
            break;

          case 'issue': // صرف (خصم رصيد)
            newTotalStock = Math.max(0, oldTotalStock - opItem.quantity);
            newWhStock = Math.max(0, currentWhStock - opItem.quantity);
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'out_issue',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'issue',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: newOp.notes || opItem.notes
            });
            break;

          case 'transfer': // تحويل بين مستودعين / فرعين
            if (newOp.targetWarehouseId) {
              targetWhOldStock = itemWarehouseStock[newOp.targetWarehouseId] || 0;
              newWhStock = Math.max(0, currentWhStock - opItem.quantity);
              targetWhNewStock = targetWhOldStock + opItem.quantity;
              itemWarehouseStock[newOp.warehouseId] = newWhStock;
              itemWarehouseStock[newOp.targetWarehouseId] = targetWhNewStock;
              newTotalStock = oldTotalStock;

              newStockMovementsToAdd.push({
                id: `mv-${Date.now()}-out-${Math.random().toString(36).substring(2, 6)}`,
                itemId: currentItem.id,
                itemCode: currentItem.code,
                itemName: currentItem.name,
                category: currentItem.category,
                date: opDate,
                time: opTime,
                type: 'transfer_out',
                quantity: opItem.quantity,
                balanceBefore: currentWhStock,
                balanceAfter: newWhStock,
                unitPrice: opItem.unitCost,
                totalValue: opItem.totalCost,
                referenceType: 'transfer',
                referenceNumber: newOp.referenceNumber,
                documentNumber: autoDocNumber,
                userId: newOp.userId,
                userName: newOp.userName,
                branchId: newOp.branchId,
                branchName: newOp.branchName,
                warehouseId: newOp.warehouseId,
                warehouseName: newOp.warehouseName,
                targetBranchId: newOp.targetBranchId,
                targetBranchName: newOp.targetBranchName,
                targetWarehouseId: newOp.targetWarehouseId,
                targetWarehouseName: newOp.targetWarehouseName,
                reason: newOp.reason,
                notes: `تحويل إلى ${newOp.targetWarehouseName}`
              });

              newStockMovementsToAdd.push({
                id: `mv-${Date.now()}-in-${Math.random().toString(36).substring(2, 6)}`,
                itemId: currentItem.id,
                itemCode: currentItem.code,
                itemName: currentItem.name,
                category: currentItem.category,
                date: opDate,
                time: opTime,
                type: 'transfer_in',
                quantity: opItem.quantity,
                balanceBefore: targetWhOldStock,
                balanceAfter: targetWhNewStock,
                unitPrice: opItem.unitCost,
                totalValue: opItem.totalCost,
                referenceType: 'transfer',
                referenceNumber: newOp.referenceNumber,
                documentNumber: autoDocNumber,
                userId: newOp.userId,
                userName: newOp.userName,
                branchId: newOp.targetBranchId || newOp.branchId,
                branchName: newOp.targetBranchName || newOp.branchName,
                warehouseId: newOp.targetWarehouseId,
                warehouseName: newOp.targetWarehouseName,
                reason: newOp.reason,
                notes: `وارد تحويل من ${newOp.warehouseName}`
              });
            }
            break;

          case 'audit': // جرد (توثيق المطابقة أو الفارق)
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'inventory_audit',
              quantity: opItem.countedQuantity !== undefined ? opItem.countedQuantity : currentWhStock,
              balanceBefore: currentWhStock,
              balanceAfter: currentWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'audit',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `محضر جرد فعلي. الكمية الفعلية: ${opItem.countedQuantity || 0}، الفارق: ${opItem.discrepancy || 0}`
            });
            break;

          case 'settlement': // تسوية جردية (تعديل الرصيد ليطابق الفعلي)
            const countedQty = opItem.countedQuantity !== undefined ? opItem.countedQuantity : opItem.quantity;
            const diff = countedQty - currentWhStock;
            newWhStock = countedQty;
            newTotalStock = oldTotalStock + diff;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: diff >= 0 ? 'in_adjustment' : 'out_adjustment',
              quantity: Math.abs(diff),
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: Math.abs(diff) * opItem.unitCost,
              referenceType: 'settlement',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `تسوية جردية - ${diff >= 0 ? 'فائض مخزني' : 'عجز مخزني'} بمقدار ${Math.abs(diff)}`
            });
            break;

          case 'damaged': // إتلاف وهالك
            newTotalStock = Math.max(0, oldTotalStock - opItem.quantity);
            newWhStock = Math.max(0, currentWhStock - opItem.quantity);
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'out_damaged',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'damaged',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `محضر إتلاف بضاعة تالفة - ${newOp.reason}`
            });
            break;

          case 'return': // مرتجع إلى المستودع
            newTotalStock = oldTotalStock + opItem.quantity;
            newWhStock = currentWhStock + opItem.quantity;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'in_return',
              quantity: opItem.quantity,
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost,
              totalValue: opItem.totalCost,
              referenceType: 'return',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `إذن مرتجع مخزني - ${newOp.reason}`
            });
            break;

          case 'stock_modify': // تعديل مباشر للكمية أو التكلفة
            const targetQty = opItem.quantity;
            const modifyDiff = targetQty - currentWhStock;
            newWhStock = targetQty;
            newTotalStock = oldTotalStock + modifyDiff;
            itemWarehouseStock[newOp.warehouseId] = newWhStock;
            newStockMovementsToAdd.push({
              id: `mv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              itemId: currentItem.id,
              itemCode: currentItem.code,
              itemName: currentItem.name,
              category: currentItem.category,
              date: opDate,
              time: opTime,
              type: 'stock_modify',
              quantity: Math.abs(modifyDiff),
              balanceBefore: currentWhStock,
              balanceAfter: newWhStock,
              unitPrice: opItem.unitCost || currentItem.purchasePrice,
              totalValue: Math.abs(modifyDiff) * (opItem.unitCost || currentItem.purchasePrice),
              referenceType: 'stock_modify',
              referenceNumber: newOp.referenceNumber,
              documentNumber: autoDocNumber,
              userId: newOp.userId,
              userName: newOp.userName,
              branchId: newOp.branchId,
              branchName: newOp.branchName,
              warehouseId: newOp.warehouseId,
              warehouseName: newOp.warehouseName,
              reason: newOp.reason,
              notes: `تعديل مخزون مباشر`
            });
            break;
        }

        updatedInventory[itemIndex] = {
          ...currentItem,
          stockQuantity: newTotalStock,
          purchasePrice: opItem.unitCost ? opItem.unitCost : currentItem.purchasePrice,
          warehouseStock: itemWarehouseStock,
          lastMovementDate: opDate
        };
      });

      if (newStockMovementsToAdd.length > 0) {
        setStockMovements(prevMovements => [...newStockMovementsToAdd, ...prevMovements]);
        newStockMovementsToAdd.forEach(sm => {
          setDoc(doc(db, 'stockMovements', sm.id), cleanDocForFirestore(sm)).catch(() => {});
        });
      }

      // Sync updated inventory items to Firestore
      newOp.items.forEach(opItem => {
        const it = updatedInventory.find(item => item.id === opItem.itemId);
        if (it) {
          setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(it)).catch(() => {});
        }
      });

      return updatedInventory;
    });

    setWarehouseOperations(prev => [newOp, ...prev]);
    setDoc(doc(db, 'warehouseOperations', newOp.id), cleanDocForFirestore(newOp)).catch(() => {});
    return newOp;
  };

  // CRUD for Role
  const addRole = (role: Omit<Role, 'id' | 'createdAt'>): Role => {
    const newRole: Role = {
      ...role,
      id: `role-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setRoles(prev => [...prev, newRole]);
    setDoc(doc(db, 'roles', newRole.id), cleanDocForFirestore(newRole)).catch(() => {});
    return newRole;
  };

  const updateRole = (id: string, updated: Partial<Role>) => {
    let finalRole: Role | null = null;
    setRoles(prev => prev.map(r => {
      if (r.id === id) {
        finalRole = { ...r, ...updated };
        return finalRole;
      }
      return r;
    }));
    if (finalRole) {
      setDoc(doc(db, 'roles', id), cleanDocForFirestore(finalRole)).catch(() => {});
    }
  };

  const deleteRole = (id: string) => {
    setRoles(prev => prev.filter(r => r.id !== id));
    deleteDoc(doc(db, 'roles', id)).catch(e => console.warn('Could not delete role in cloud:', e));
    return { success: true };
  };

  // CRUD for User
  const addUser = (user: Omit<SystemUser, 'id' | 'createdAt'>): SystemUser => {
    const newUser: SystemUser = {
      ...user,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setUsers(prev => {
      const next = [...prev, newUser];
      try {
        localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    // Immediate Firestore persistence so user can log in immediately from any browser/device
    setDoc(doc(db, 'users', newUser.id), newUser).catch(e => {
      console.warn('Direct save user to cloud note:', e);
    });

    return newUser;
  };

  const updateUser = (id: string, updated: Partial<SystemUser>) => {
    setUsers(prev => {
      const next = prev.map(u => (u.id === id ? { ...u, ...updated } : u));
      try {
        localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(next));
      } catch (e) {}
      const target = next.find(u => u.id === id);
      if (target) {
        setDoc(doc(db, 'users', id), target).catch(e => {
          console.warn('Direct update user in cloud note:', e);
        });
      }
      return next;
    });
  };

  const deleteUser = (id: string) => {
    if (users.length <= 1) {
      return { success: false, message: 'لا يمكن حذف المستخدم الوحيد بالنظام' };
    }
    setUsers(prev => {
      const next = prev.filter(u => u.id !== id);
      try {
        localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    deleteDoc(doc(db, 'users', id)).catch(e => console.warn('Could not delete user in cloud:', e));
    if (currentUserId === id) {
      const remaining = users.filter(u => u.id !== id);
      if (remaining.length > 0) setCurrentUserId(remaining[0].id);
    }
    return { success: true };
  };

  const updateSettings = (newSettings: BusinessSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(newSettings));
      setDoc(doc(db, 'settings', 'global'), newSettings).catch(err => {
        console.warn('Failed direct settings save to cloud:', err);
      });
    } catch (e) {
      console.warn('Settings persistence error:', e);
    }
  };

  // Multi-Currency handlers (العملة الأساسية: الشيكل الفلسطيني ₪)
  const currencies = settings.currencies && settings.currencies.length > 0 ? settings.currencies : defaultCurrencies;

  const updateCurrencies = (newCurrencies: CurrencyInfo[]) => {
    setSettings(prev => ({
      ...prev,
      currencies: newCurrencies
    }));
  };

  const updateCurrencyRate = (code: string, rate: number) => {
    const today = new Date().toISOString().split('T')[0];
    setSettings(prev => {
      const currentList = prev.currencies || defaultCurrencies;
      const updatedList = currentList.map(c =>
        c.code === code ? { ...c, rateAgainstBase: rate, updatedAt: today } : c
      );
      return {
        ...prev,
        currencies: updatedList
      };
    });
  };

  const fetchLiveRates = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const currentList = settings.currencies || defaultCurrencies;
      const refreshed = await fetchLiveExchangeRates(currentList);
      updateCurrencies(refreshed);
      return {
        success: true,
        message: 'تم تحديث أسعار الصرف الحية بنجاح بالنسبة للشيكل الفلسطيني (₪).'
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'تعذر جلب أسعار الصرف الحية: ' + (err.message || 'خطأ غير معروف')
      };
    }
  };

  // Offline-First & SQL Server Integration
  const sqlServerConfig = settings.sqlServerConfig || {
    enabled: false,
    serverUrl: 'http://localhost:3000/api/sync',
    dbType: 'postgres',
    dbName: 'alnoor_press_db',
    autoSync: false,
    syncIntervalMinutes: 30
  };

  const updateSqlServerConfig = (newConfig: SqlServerConfig) => {
    setSettings(prev => ({
      ...prev,
      sqlServerConfig: newConfig
    }));
  };

  const generateSqlBackup = (dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres'): string => {
    return generateSqlDump({
      settings,
      accounts,
      treasuries,
      inventory,
      parties,
      invoices,
      purchases,
      printOrders,
      employees,
      advances: employeeAdvances,
      payrollSheets,
      journals: journalEntries
    }, dialect);
  };

  const downloadSqlBackup = (dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres'): void => {
    const sql = generateSqlBackup(dialect);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadSqlFile(sql, `alnoor_press_backup_${dialect}_${dateStr}.sql`);
  };

  const syncToServer = async (): Promise<{ success: boolean; message: string }> => {
    if (!sqlServerConfig.serverUrl) {
      return { success: false, message: 'لم يتم تحديد رابط خادم الويب API في الإعدادات.' };
    }
    const payload = {
      settings,
      accounts,
      treasuries,
      inventory,
      parties,
      invoices,
      purchases,
      printOrders,
      employees,
      advances: employeeAdvances,
      payrollSheets,
      journals: journalEntries
    };
    const res = await syncWithWebServer(sqlServerConfig.serverUrl, payload, sqlServerConfig.apiKey);
    if (res.success && res.timestamp) {
      setLastSyncTime(res.timestamp);
      localStorage.setItem(`${STORAGE_KEY}_last_sync`, res.timestamp);
      updateSqlServerConfig({ ...sqlServerConfig, lastSyncTime: res.timestamp });
    }
    return res;
  };

  const addAccount = (accountData: Omit<Account, 'balance'> & { initialBalance?: number }) => {
    const newAcc: Account = {
      ...accountData,
      balance: accountData.initialBalance || 0
    };
    setAccounts(prev => [...prev, newAcc]);
  };

  const updateAccount = (code: string, updated: Partial<Account>) => {
    setAccounts(prev => prev.map(acc => acc.code === code ? { ...acc, ...updated } : acc));
  };

  // Treasury Management (إدارة الخزنات والصناديق والتطبيقات البنكية)
  const addTreasury = (treasuryData: Omit<Treasury, 'id' | 'createdAt'>): Treasury => {
    const id = 'treasury-' + Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Determine accountCode in Chart of Accounts (asset range 1100-1199)
    let accountCode = treasuryData.accountCode;
    if (!accountCode || accounts.some(a => a.code === accountCode)) {
      const existingAssetCodes = accounts
        .map(a => parseInt(a.code, 10))
        .filter(num => !isNaN(num) && num >= 1100 && num < 1200);
      const maxCode = existingAssetCodes.length > 0 ? Math.max(...existingAssetCodes) : 1105;
      accountCode = String(maxCode + 1);
    }

    // Ensure account exists in Chart of Accounts
    const existingAccount = accounts.find(a => a.code === accountCode);
    if (!existingAccount) {
      const newAccount: Account = {
        code: accountCode,
        name: treasuryData.name,
        type: 'asset',
        balance: Number(treasuryData.balance) || 0,
        description: treasuryData.notes || `خزينة / حساب: ${treasuryData.name}`
      };
      setAccounts(prev => [...prev, newAccount]);
    }

    const initBal = Number(treasuryData.balance) || 0;
    const initialBalances = treasuryData.currencyBalances || { ILS: initBal };

    const initialTransactions: TreasuryTransaction[] = initBal > 0 ? [
      {
        id: 'tx-init-' + Date.now(),
        treasuryId: id,
        treasuryName: treasuryData.name,
        date: today,
        type: 'deposit',
        amount: initBal,
        currency: 'ILS',
        currencySymbol: '₪',
        exchangeRate: 1.0,
        baseCurrency: 'ILS',
        baseAmount: initBal,
        balanceAfter: initBal,
        balanceAfterCurrency: initBal,
        description: 'رصيد افتتاحي عند تدشين الخزنة / التطبيق',
        referenceType: 'opening'
      }
    ] : [];

    const newTreasury: Treasury = {
      ...treasuryData,
      id,
      accountCode,
      balance: initBal,
      currencyBalances: initialBalances,
      status: treasuryData.status || 'active',
      createdAt: today,
      transactions: initialTransactions
    };

    setTreasuries(prev => [...prev, newTreasury]);
    setDoc(doc(db, 'treasuries', newTreasury.id), cleanDocForFirestore(newTreasury)).catch(() => {});
    return newTreasury;
  };

  const updateTreasury = (id: string, updated: Partial<Treasury>) => {
    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === id) {
          const updatedTreasury = { ...t, ...updated };
          // If name changed, keep linked chart of account name updated
          if (updated.name && updated.name !== t.name) {
            setAccounts(accs => accs.map(a => a.code === t.accountCode ? { ...a, name: updated.name! } : a));
          }
          setDoc(doc(db, 'treasuries', id), cleanDocForFirestore(updatedTreasury)).catch(() => {});
          return updatedTreasury;
        }
        return t;
      })
    );
  };

  const deleteTreasury = (id: string): { success: boolean; message?: string } => {
    const target = treasuries.find(t => t.id === id);
    if (!target) return { success: false, message: 'الخزنة غير موجودة' };
    if (target.isDefault || target.id === 'treasury-cash-main') {
      return { success: false, message: 'لا يمكن حذف الصندوق النقدي الرئيسي للنظام' };
    }
    if (target.balance > 0) {
      return {
        success: false,
        message: `لا يمكن حذف (${target.name}) لأن رصيدها الحالي (${target.balance.toLocaleString()} ر.س) أكبر من صفر. يرجى تحويل الرصيد إلى خزنة أخرى أولاً.`
      };
    }

    setTreasuries(prev => prev.filter(t => t.id !== id));
    deleteDoc(doc(db, 'treasuries', id)).catch(e => console.warn('Could not delete treasury in cloud:', e));
    return { success: true, message: `تم حذف الخزنة (${target.name}) بنجاح` };
  };

  const executeTreasuryOperation = (params: {
    operationType: 'deposit' | 'withdrawal' | 'transfer';
    sourceTreasuryId: string;
    destTreasuryId: string;
    amount: number;
    currencyCode: string;
    notes?: string;
    date?: string;
    exchangeRate?: number;
  }): { success: boolean; message?: string } => {
    const { operationType, sourceTreasuryId, destTreasuryId, amount, currencyCode, notes, date, exchangeRate } = params;

    if (amount <= 0) {
      return { success: false, message: 'مبلغ العملية يجب أن يكون أكبر من الصفر' };
    }
    const source = treasuries.find(t => t.id === sourceTreasuryId || t.accountCode === sourceTreasuryId);
    const dest = treasuries.find(t => t.id === destTreasuryId || t.accountCode === destTreasuryId);

    if (!source || !dest) {
      return { success: false, message: 'الصندوق/الحساب المصدر أو الوجهة غير موجود' };
    }
    if (source.id === dest.id) {
      return { success: false, message: 'لا يمكن التحويل من وإلى نفس الحساب/الصندوق' };
    }

    const curr = currencyCode || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = exchangeRate !== undefined ? exchangeRate : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = curr === 'ILS' ? '₪' : (currInfo?.symbol || curr);
    const baseEquivalent = Number((amount * rate).toFixed(2));

    const txDate = date || new Date().toISOString().split('T')[0];
    const opPrefix = operationType === 'deposit' ? 'DEP' : operationType === 'withdrawal' ? 'WTH' : 'TRF';
    const opId = `OP-${opPrefix}-${Date.now()}`;
    const entryNumber = `JV-${opPrefix}-${Date.now().toString().slice(-6)}`;

    let opTitle = '';
    let srcDesc = '';
    let destDesc = '';

    if (operationType === 'deposit') {
      opTitle = `إيداع بنكي (${amount.toLocaleString()} ${symbol}) من (${source.name}) إلى البنك (${dest.name})`;
      srcDesc = `إيداع بنكي صادر إلى (${dest.name})${notes ? ` - ${notes}` : ''}`;
      destDesc = `إيداع نقدي وارد من (${source.name})${notes ? ` - ${notes}` : ''}`;
    } else if (operationType === 'withdrawal') {
      opTitle = `سحب نقدي (${amount.toLocaleString()} ${symbol}) من البنك (${source.name}) إلى (${dest.name})`;
      srcDesc = `سحب نقدي صادر لصالح (${dest.name})${notes ? ` - ${notes}` : ''}`;
      destDesc = `سحب نقدي وارد ومستلم من (${source.name})${notes ? ` - ${notes}` : ''}`;
    } else {
      opTitle = `تحويل مالي (${amount.toLocaleString()} ${symbol}) من (${source.name}) إلى (${dest.name})`;
      srcDesc = `تحويل نقدي صادر إلى (${dest.name})${notes ? ` - ${notes}` : ''}`;
      destDesc = `تحويل نقدي وارد من (${source.name})${notes ? ` - ${notes}` : ''}`;
    }

    // 1. Unified double-entry journal entry: طرفان كعملية واحدة غير قابلة للانفصال
    const newJournal: JournalEntry = {
      id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      entryNumber,
      date: txDate,
      description: `${opTitle}${notes ? ` [${notes}]` : ''}`,
      referenceType: 'transfer',
      referenceId: opId,
      lines: [
        {
          accountCode: dest.accountCode,
          accountName: dest.name,
          debit: baseEquivalent,
          credit: 0,
          description: `${destDesc} (${amount.toLocaleString()} ${symbol})`
        },
        {
          accountCode: source.accountCode,
          accountName: source.name,
          debit: 0,
          credit: baseEquivalent,
          description: `${srcDesc} (${amount.toLocaleString()} ${symbol})`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [newJournal, ...prev]);
    setDoc(doc(db, 'journals', newJournal.id), cleanDocForFirestore(newJournal)).catch(() => {});

    // 2. Update Accounts in chart of accounts
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === source.accountCode) {
          return { ...acc, balance: Number((acc.balance - baseEquivalent).toFixed(2)) };
        }
        if (acc.code === dest.accountCode) {
          return { ...acc, balance: Number((acc.balance + baseEquivalent).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Treasuries balances in original currency without forced conversion
    const sourceTxId = 'tx-src-' + Date.now();
    const destTxId = 'tx-dst-' + Date.now();

    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === source.id) {
          const currentBalances = { ...(t.currencyBalances || {}) };
          if (currentBalances[curr] === undefined) {
            currentBalances[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = currentBalances[curr];
          const newCurrBal = Number((prevBal - amount).toFixed(2));
          currentBalances[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(currentBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: sourceTxId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: operationType === 'transfer' ? 'transfer_out' : 'withdrawal',
            amount,
            currency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: -baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            description: srcDesc,
            referenceType: 'transfer',
            referenceId: opId,
            targetTreasuryId: dest.id,
            targetTreasuryName: dest.name
          };

          const updatedSourceT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: currentBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(updatedSourceT)).catch(() => {});
          return updatedSourceT;
        }

        if (t.id === dest.id) {
          const currentBalances = { ...(t.currencyBalances || {}) };
          if (currentBalances[curr] === undefined) {
            currentBalances[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = currentBalances[curr];
          const newCurrBal = Number((prevBal + amount).toFixed(2));
          currentBalances[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(currentBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: destTxId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: operationType === 'transfer' ? 'transfer_in' : 'deposit',
            amount,
            currency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            description: destDesc,
            referenceType: 'transfer',
            referenceId: opId,
            targetTreasuryId: source.id,
            targetTreasuryName: source.name
          };

          const updatedDestT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: currentBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(updatedDestT)).catch(() => {});
          return updatedDestT;
        }

        return t;
      })
    );

    return {
      success: true,
      message: `تمت العملية بنجاح (${opTitle}) وقيد الطرفان كعملية واحدة غير قابلة للتجزئة برقم ${entryNumber}.`
    };
  };

  const transferBetweenTreasuries = (
    sourceTreasuryId: string,
    destTreasuryId: string,
    amount: number,
    notes?: string,
    date?: string,
    currencyCode?: string,
    exchangeRate?: number
  ): { success: boolean; message?: string } => {
    return executeTreasuryOperation({
      operationType: 'transfer',
      sourceTreasuryId,
      destTreasuryId,
      amount,
      currencyCode: currencyCode || 'ILS',
      notes,
      date,
      exchangeRate
    });
  };

  const depositIntoTreasury = (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    depositorName?: string;
    notes?: string;
    date?: string;
  }): { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher } => {
    const { treasuryId, amount, currencyCode, exchangeRate, contraAccountCode, depositorName, notes, date } = params;

    if (amount <= 0) {
      return { success: false, message: 'مبلغ الإيداع يجب أن يكون أكبر من الصفر' };
    }

    const target = treasuries.find(t => t.id === treasuryId || t.accountCode === treasuryId);
    if (!target) {
      return { success: false, message: 'الخزنة أو الصندوق المحدد غير موجود' };
    }

    const curr = currencyCode || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = exchangeRate !== undefined ? exchangeRate : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = curr === 'ILS' ? '₪' : (currInfo?.symbol || curr);
    const baseEquivalent = Number((amount * rate).toFixed(2));
    const txDate = date || new Date().toISOString().split('T')[0];

    const voucherNumber = `DEP-${Date.now().toString().slice(-6)}`;
    const entryNumber = `JV-DEP-${Date.now().toString().slice(-6)}`;

    // Contra Account (default: 3101 Paid-in Capital / Owner Equity, or 3102 Owner Account, or 4201 Other Revenues)
    const contraCode = contraAccountCode || '3101';
    const contraAcc = accounts.find(a => a.code === contraCode);
    const contraName = contraAcc?.name || 'رأس المال / تمويل المالك';

    const opTitle = `إيداع نقدي (${amount.toLocaleString()} ${symbol}) في (${target.name})`;
    const fullDesc = `إيداع نقدي في ${target.name} من ${depositorName || contraName}${notes ? ` - ${notes}` : ''}`;

    // 1. Post double-entry Journal Entry:
    // Debit: Treasury Account (Asset +)
    // Credit: Contra Account (Equity or Revenue +)
    const newJournal: JournalEntry = {
      id: 'entry-dep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      entryNumber,
      date: txDate,
      description: `${opTitle}${notes ? ` [${notes}]` : ''}`,
      referenceType: 'receipt',
      referenceId: voucherNumber,
      lines: [
        {
          accountCode: target.accountCode,
          accountName: target.name,
          debit: baseEquivalent,
          credit: 0,
          description: `إيداع نقدي وارد في ${target.name} (${amount.toLocaleString()} ${symbol})`
        },
        {
          accountCode: contraCode,
          accountName: contraName,
          debit: 0,
          credit: baseEquivalent,
          description: `مقابل إيداع نقدي في ${target.name} (${amount.toLocaleString()} ${symbol})`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [newJournal, ...prev]);

    // 2. Update Accounts in Chart of Accounts
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === target.accountCode) {
          // Asset: increases by debit
          return { ...acc, balance: Number((acc.balance + baseEquivalent).toFixed(2)) };
        }
        if (acc.code === contraCode) {
          // If equity/revenue/liability: increases by credit. If asset/expense: decreases by credit
          const delta = (acc.type === 'asset' || acc.type === 'expense') ? -baseEquivalent : baseEquivalent;
          return { ...acc, balance: Number((acc.balance + delta).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Treasury Balance & Currency Balances & Add TreasuryTransaction
    const txId = 'tx-dep-' + Date.now();
    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === target.id) {
          const currentBalances = { ...(t.currencyBalances || {}) };
          if (currentBalances[curr] === undefined) {
            currentBalances[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = currentBalances[curr];
          const newCurrBal = Number((prevBal + amount).toFixed(2));
          currentBalances[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(currentBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: txId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: 'deposit',
            amount,
            actualAmount: amount,
            currency: curr,
            actualCurrency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            voucherNumber,
            partyName: depositorName || contraName,
            description: fullDesc,
            referenceType: 'receipt',
            referenceId: voucherNumber,
            contraAccountCode: contraCode,
            contraAccountName: contraName
          };

          return {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: currentBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
        }
        return t;
      })
    );

    // 4. Create official PaymentVoucher (سند قبض)
    const newVoucher: PaymentVoucher = {
      id: 'vch-dep-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      voucherNumber,
      type: 'receipt',
      date: txDate,
      partyId: 'treasury-party',
      partyName: depositorName || contraName,
      amount,
      paymentMethod: target.type === 'bank_account' || target.type === 'bank_app' ? 'bank_transfer' : 'cash',
      accountCode: contraCode,
      treasuryAccountCode: target.accountCode,
      description: fullDesc,
      currency: curr,
      currencySymbol: symbol,
      exchangeRate: rate,
      baseAmount: baseEquivalent
    };
    setVouchers(prev => [newVoucher, ...prev]);
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

    return {
      success: true,
      message: `تم إيداع مبلغ (${amount.toLocaleString()} ${symbol}) في (${target.name}) بنجاح، وقيدت المحاسبة برقم ${entryNumber}، وسند القبض برقم ${voucherNumber}.`,
      voucherNumber,
      entryNumber,
      voucher: newVoucher
    };
  };

  const withdrawFromTreasury = (params: {
    treasuryId: string;
    amount: number;
    currencyCode?: string;
    exchangeRate?: number;
    contraAccountCode?: string;
    recipientName?: string;
    notes?: string;
    date?: string;
    allowNegativeBalance?: boolean;
  }): { success: boolean; message?: string; voucherNumber?: string; entryNumber?: string; voucher?: PaymentVoucher } => {
    const { treasuryId, amount, currencyCode, exchangeRate, contraAccountCode, recipientName, notes, date, allowNegativeBalance } = params;

    if (amount <= 0) {
      return { success: false, message: 'مبلغ السحب يجب أن يكون أكبر من الصفر' };
    }

    const target = treasuries.find(t => t.id === treasuryId || t.accountCode === treasuryId);
    if (!target) {
      return { success: false, message: 'الخزنة أو الصندوق المحدد غير موجود' };
    }

    const curr = currencyCode || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = exchangeRate !== undefined ? exchangeRate : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = curr === 'ILS' ? '₪' : (currInfo?.symbol || curr);
    const baseEquivalent = Number((amount * rate).toFixed(2));
    const txDate = date || new Date().toISOString().split('T')[0];

    // Check available balance in the specified currency
    const currentBalances = { ...(target.currencyBalances || {}) };
    const currBal = currentBalances[curr] !== undefined ? currentBalances[curr] : (curr === 'ILS' ? (target.balance || 0) : 0);
    if (!allowNegativeBalance && currBal < amount) {
      return {
        success: false,
        message: `الرصيد المتوفر في (${target.name}) بعملة (${curr}) هو (${currBal.toLocaleString()} ${symbol})، ولا يكفي لسحب (${amount.toLocaleString()} ${symbol}).`
      };
    }

    const voucherNumber = `WTH-${Date.now().toString().slice(-6)}`;
    const entryNumber = `JV-WTH-${Date.now().toString().slice(-6)}`;

    // Contra Account (default: 3102 Owner Drawings or 5205 General Expenses)
    const contraCode = contraAccountCode || '3102';
    const contraAcc = accounts.find(a => a.code === contraCode);
    const contraName = contraAcc?.name || 'مسحوبات المالك / جاري الشركاء';

    const opTitle = `سحب نقدي (${amount.toLocaleString()} ${symbol}) من (${target.name})`;
    const fullDesc = `سحب نقدي من ${target.name} لصالح ${recipientName || contraName}${notes ? ` - ${notes}` : ''}`;

    // 1. Post double-entry Journal Entry:
    // Debit: Contra Account (Expense or Equity Drawings +)
    // Credit: Treasury Account (Asset -)
    const newJournal: JournalEntry = {
      id: 'entry-wth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      entryNumber,
      date: txDate,
      description: `${opTitle}${notes ? ` [${notes}]` : ''}`,
      referenceType: 'payment',
      referenceId: voucherNumber,
      lines: [
        {
          accountCode: contraCode,
          accountName: contraName,
          debit: baseEquivalent,
          credit: 0,
          description: `سحب نقدي من ${target.name} (${amount.toLocaleString()} ${symbol})`
        },
        {
          accountCode: target.accountCode,
          accountName: target.name,
          debit: 0,
          credit: baseEquivalent,
          description: `سحب نقدي صادر من ${target.name} (${amount.toLocaleString()} ${symbol})`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [newJournal, ...prev]);
    setDoc(doc(db, 'journals', newJournal.id), cleanDocForFirestore(newJournal)).catch(() => {});

    // 2. Update Accounts in Chart of Accounts
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === target.accountCode) {
          // Asset: decreases by credit
          return { ...acc, balance: Number((acc.balance - baseEquivalent).toFixed(2)) };
        }
        if (acc.code === contraCode) {
          // If asset/expense: increases by debit (+baseEquivalent).
          // If equity/liability/revenue: decreases by debit (-baseEquivalent).
          const delta = (acc.type === 'asset' || acc.type === 'expense') ? baseEquivalent : -baseEquivalent;
          return { ...acc, balance: Number((acc.balance + delta).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Treasury Balance & Currency Balances & Add TreasuryTransaction
    const txId = 'tx-wth-' + Date.now();
    setTreasuries(prev =>
      prev.map(t => {
        if (t.id === target.id) {
          const curBal = { ...(t.currencyBalances || {}) };
          if (curBal[curr] === undefined) {
            curBal[curr] = curr === 'ILS' ? (t.balance || 0) : 0;
          }
          const prevBal = curBal[curr];
          const newCurrBal = Number((prevBal - amount).toFixed(2));
          curBal[curr] = newCurrBal;

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(curBal)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: txId,
            treasuryId: t.id,
            treasuryName: t.name,
            date: txDate,
            type: 'withdrawal',
            amount,
            actualAmount: amount,
            currency: curr,
            actualCurrency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: -baseEquivalent,
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            voucherNumber,
            partyName: recipientName || contraName,
            description: fullDesc,
            referenceType: 'payment',
            referenceId: voucherNumber,
            contraAccountCode: contraCode,
            contraAccountName: contraName
          };

          const updatedT = {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: curBal,
            transactions: [tx, ...(t.transactions || [])]
          };
          setDoc(doc(db, 'treasuries', t.id), cleanDocForFirestore(updatedT)).catch(() => {});
          return updatedT;
        }
        return t;
      })
    );

    // 4. Create official PaymentVoucher (سند صرف)
    const newVoucher: PaymentVoucher = {
      id: 'vch-wth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      voucherNumber,
      type: 'payment',
      date: txDate,
      partyId: 'treasury-party',
      partyName: recipientName || contraName,
      amount,
      paymentMethod: target.type === 'bank_account' || target.type === 'bank_app' ? 'bank_transfer' : 'cash',
      accountCode: contraCode,
      treasuryAccountCode: target.accountCode,
      description: fullDesc,
      currency: curr,
      currencySymbol: symbol,
      exchangeRate: rate,
      baseAmount: baseEquivalent
    };
    setVouchers(prev => [newVoucher, ...prev]);
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

    return {
      success: true,
      message: `تم سحب مبلغ (${amount.toLocaleString()} ${symbol}) من (${target.name}) بنجاح، وقيدت المحاسبة برقم ${entryNumber}، وسند الصرف برقم ${voucherNumber}.`,
      voucherNumber,
      entryNumber,
      voucher: newVoucher
    };
  };

  // ==========================================
  // DEBT CLEARING OPERATIONS (المقاصة بين عميل ومورد)
  // لا تدخل ضمن الصناديق والخزن المالية وتؤثر حصراً على ذمم العميل والمورد
  // ==========================================
  const addDebtClearing = (
    clearingData: Omit<DebtClearingRecord, 'id' | 'createdAt' | 'clearingNumber'>
  ): { success: boolean; message?: string; record?: DebtClearingRecord } => {
    const customer = parties.find(p => p.id === clearingData.customerId);
    const supplier = parties.find(p => p.id === clearingData.supplierId);

    if (!customer || !supplier) {
      return { success: false, message: 'العميل أو المورد غير موجود بالنظام' };
    }
    if (clearingData.amount <= 0) {
      return { success: false, message: 'مبلغ المقاصة يجب أن يكون أكبر من الصفر' };
    }

    const clrNum = `CLR-${new Date().getFullYear()}-${(debtClearings.length + 1).toString().padStart(3, '0')}`;
    const jId = `entry-clr-${Date.now()}`;
    const custOld = customer.balance;
    const custNew = Number((custOld - clearingData.amount).toFixed(2));
    const suppOld = supplier.balance;
    const suppNew = Number((suppOld + clearingData.amount).toFixed(2));

    // 1. Post double-entry journal (Debit Supplier Payables 2101, Credit Customer Receivables 1201)
    // CRITICAL: Does NOT affect cash boxes or treasuries!
    const jEntry: JournalEntry = {
      id: jId,
      entryNumber: `JV-${clrNum}`,
      date: clearingData.date,
      description: `مقاصة وتسوية ذمم بين العميل (${customer.name}) والمورد (${supplier.name}) - ${clearingData.reason || 'تسوية حسابات متبادلة'}`,
      referenceType: 'clearance',
      referenceId: clrNum,
      lines: [
        {
          accountCode: '2101',
          accountName: 'الموردون والذمم الدائنة',
          debit: clearingData.amount,
          credit: 0,
          description: `تسوية مقاصة لحساب المورد: ${supplier.name} بموجب سند ${clrNum}`
        },
        {
          accountCode: '1201',
          accountName: 'العملاء والذمم المدينة',
          debit: 0,
          credit: clearingData.amount,
          description: `تسوية مقاصة لحساب العميل: ${customer.name} بموجب سند ${clrNum}`
        }
      ],
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [jEntry, ...prev]);
    setDoc(doc(db, 'journals', jEntry.id), cleanDocForFirestore(jEntry)).catch(() => {});

    // 2. Update accounts in chart of accounts (Payables and Receivables only, NOT Cash/Bank)
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === '2101') {
          return { ...acc, balance: Number((acc.balance + clearingData.amount).toFixed(2)) };
        }
        if (acc.code === '1201') {
          return { ...acc, balance: Number((acc.balance - clearingData.amount).toFixed(2)) };
        }
        return acc;
      })
    );

    // 3. Update Party Balances
    updateParty(customer.id, { balance: custNew });
    updateParty(supplier.id, { balance: suppNew });

    const record: DebtClearingRecord = {
      ...clearingData,
      id: `clr-${Date.now()}`,
      clearingNumber: clrNum,
      createdAt: new Date().toISOString(),
      customerOldBalance: custOld,
      customerNewBalance: custNew,
      supplierOldBalance: suppOld,
      supplierNewBalance: suppNew,
      journalEntryId: jId
    };

    setDebtClearings(prev => [record, ...prev]);
    setDoc(doc(db, 'debtClearings', record.id), cleanDocForFirestore(record)).catch(() => {});
    return { success: true, message: `تم قيد سند المقاصة بنجاح برقم ${clrNum}`, record };
  };

  const updateDebtClearing = (
    id: string,
    updated: Partial<DebtClearingRecord>
  ): { success: boolean; message?: string } => {
    const existing = debtClearings.find(c => c.id === id);
    if (!existing) return { success: false, message: 'سند المقاصة غير موجود' };

    // 1. Revert previous party balance impacts
    const prevCust = parties.find(p => p.id === existing.customerId);
    const prevSupp = parties.find(p => p.id === existing.supplierId);
    if (prevCust) {
      updateParty(prevCust.id, { balance: Number((prevCust.balance + existing.amount).toFixed(2)) });
    }
    if (prevSupp) {
      updateParty(prevSupp.id, { balance: Number((prevSupp.balance - existing.amount).toFixed(2)) });
    }

    // 2. Determine target customer, supplier, amount, date, notes
    const targetCustId = updated.customerId || existing.customerId;
    const targetSuppId = updated.supplierId || existing.supplierId;
    const targetAmount = updated.amount !== undefined ? updated.amount : existing.amount;
    const targetDate = updated.date || existing.date;
    const targetReason = updated.reason || existing.reason;
    const targetNotes = updated.notes !== undefined ? updated.notes : existing.notes;

    const newCust = parties.find(p => p.id === targetCustId);
    const newSupp = parties.find(p => p.id === targetSuppId);
    if (!newCust || !newSupp) {
      return { success: false, message: 'العميل أو المورد غير موجود' };
    }

    const custBaseBal = (newCust.id === prevCust?.id) ? (newCust.balance + existing.amount) : newCust.balance;
    const suppBaseBal = (newSupp.id === prevSupp?.id) ? (newSupp.balance - existing.amount) : newSupp.balance;

    const updatedCustBal = Number((custBaseBal - targetAmount).toFixed(2));
    const updatedSuppBal = Number((suppBaseBal + targetAmount).toFixed(2));

    updateParty(newCust.id, { balance: updatedCustBal });
    updateParty(newSupp.id, { balance: updatedSuppBal });

    // 3. Update general ledger journal entry
    if (existing.journalEntryId) {
      setJournalEntries(prev => prev.map(je => {
        if (je.id === existing.journalEntryId) {
          return {
            ...je,
            date: targetDate,
            description: `مقاصة وتسوية ذمم بين العميل (${newCust.name}) والمورد (${newSupp.name}) - ${targetReason}`,
            lines: [
              {
                accountCode: '2101',
                accountName: 'الموردون والذمم الدائنة',
                debit: targetAmount,
                credit: 0,
                description: `تسوية مقاصة لحساب المورد: ${newSupp.name} بموجب سند ${existing.clearingNumber}`
              },
              {
                accountCode: '1201',
                accountName: 'العملاء والذمم المدينة',
                debit: 0,
                credit: targetAmount,
                description: `تسوية مقاصة لحساب العميل: ${newCust.name} بموجب سند ${existing.clearingNumber}`
              }
            ]
          };
        }
        return je;
      }));
    }

    // 4. Update the clearing record
    setDebtClearings(prev => prev.map(c => {
      if (c.id === id) {
        return {
          ...c,
          customerId: newCust.id,
          customerName: newCust.name,
          supplierId: newSupp.id,
          supplierName: newSupp.name,
          amount: targetAmount,
          date: targetDate,
          reason: targetReason,
          notes: targetNotes,
          customerOldBalance: custBaseBal,
          customerNewBalance: updatedCustBal,
          supplierOldBalance: suppBaseBal,
          supplierNewBalance: updatedSuppBal
        };
      }
      return c;
    }));

    return { success: true, message: `تم تحديث سند المقاصة (${existing.clearingNumber}) بنجاح وإعادة احتساب الأرصدة والقيود المحاسبية.` };
  };

  const deleteDebtClearing = (id: string): { success: boolean; message?: string } => {
    const existing = debtClearings.find(c => c.id === id);
    if (!existing) return { success: false, message: 'سند المقاصة غير موجود' };

    // 1. Restore balances
    const cust = parties.find(p => p.id === existing.customerId);
    const supp = parties.find(p => p.id === existing.supplierId);
    if (cust) {
      updateParty(cust.id, { balance: Number((cust.balance + existing.amount).toFixed(2)) });
    }
    if (supp) {
      updateParty(supp.id, { balance: Number((supp.balance - existing.amount).toFixed(2)) });
    }

    // 2. Remove journal entry
    if (existing.journalEntryId) {
      setJournalEntries(prev => prev.filter(je => je.id !== existing.journalEntryId));
    }

    // 3. Remove clearing record
    setDebtClearings(prev => prev.filter(c => c.id !== id));
    return { success: true, message: `تم حذف سند المقاصة (${existing.clearingNumber}) واستعادة أرصدة العميل والمورد وإلغاء القيد المحاسبي بالكامل.` };
  };

  const adjustTreasuryBalance = (
    treasuryIdOrCode: string,
    delta: number,
    description: string,
    refType?: TreasuryTransaction['referenceType'],
    refId?: string,
    options?: {
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      voucherNumber?: string;
      partyName?: string;
      date?: string;
    }
  ) => {
    if (delta === 0) return;
    const now = options?.date || new Date().toISOString().split('T')[0];
    const isDeposit = delta > 0;

    const curr = options?.currency || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = options?.exchangeRate !== undefined
      ? options.exchangeRate
      : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = options?.currencySymbol || (curr === 'ILS' ? '₪' : (currInfo?.symbol || curr));
    const baseDelta = Number((delta * rate).toFixed(2));

    let matchedAccountCode = '';

    setTreasuries(prev => {
      let target = prev.find(t => t.id === treasuryIdOrCode || t.accountCode === treasuryIdOrCode);
      if (!target) {
        target = prev.find(t => t.isDefault) || prev[0];
      }
      if (!target) return prev;
      matchedAccountCode = target.accountCode;

      return prev.map(t => {
        if (t.id === target!.id) {
          const prevCurrBal = (t.currencyBalances && t.currencyBalances[curr] !== undefined)
            ? t.currencyBalances[curr]
            : (curr === 'ILS' ? (t.balance || 0) : 0);
          const newCurrBal = Number((prevCurrBal + delta).toFixed(2));
          const updatedBalances = {
            ...(t.currencyBalances || { ILS: t.balance || 0 }),
            [curr]: newCurrBal
          };

          let totalEstimatedBase = 0;
          for (const [cCode, cAmt] of Object.entries(updatedBalances)) {
            const cRate = cCode === 'ILS' ? 1.0 : (currencies.find(c => c.code === cCode)?.rateAgainstBase || 1.0);
            totalEstimatedBase += (cAmt as number) * cRate;
          }
          totalEstimatedBase = Number(totalEstimatedBase.toFixed(2));

          const tx: TreasuryTransaction = {
            id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            treasuryId: t.id,
            treasuryName: t.name,
            date: now,
            type: isDeposit ? 'deposit' : 'withdrawal',
            amount: Math.abs(delta),
            currency: curr,
            currencySymbol: symbol,
            exchangeRate: rate,
            baseCurrency: 'ILS',
            baseAmount: isDeposit ? Math.abs(baseDelta) : -Math.abs(baseDelta),
            balanceAfter: totalEstimatedBase,
            balanceAfterCurrency: newCurrBal,
            voucherNumber: options?.voucherNumber,
            partyName: options?.partyName,
            description,
            referenceType: refType || 'manual',
            referenceId: refId
          };
          return {
            ...t,
            balance: totalEstimatedBase,
            currencyBalances: updatedBalances,
            transactions: [tx, ...(t.transactions || [])]
          };
        }
        return t;
      });
    });

    // Also update account in Chart of Accounts by baseDelta (in ILS)
    setAccounts(prev =>
      prev.map(acc => {
        if (acc.code === treasuryIdOrCode || (matchedAccountCode && acc.code === matchedAccountCode)) {
          return { ...acc, balance: Number((acc.balance + baseDelta).toFixed(2)) };
        }
        return acc;
      })
    );
  };

  const addJournalEntry = (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>) => {
    const uniqueSuffix = Math.random().toString(36).substring(2, 8) + '-' + Math.floor(Math.random() * 1000);
    const id = 'je-' + Date.now() + '-' + uniqueSuffix;
    const createdAt = new Date().toISOString();
    const nextIndex = journalEntries.length + 1;
    const entryNumber = `JE-2026-${String(nextIndex).padStart(4, '0')}`;
    const newEntry: JournalEntry = {
      ...entry,
      id,
      entryNumber,
      createdAt
    };

    setJournalEntries(prev => [newEntry, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'journals', newEntry.id), cleanDocForFirestore(newEntry)).catch(err => {
      console.warn('Direct cloud save journal notice:', err);
    });

    // Telegram Notification - Do not send daily journal proofs for invoice/POS transactions
    try {
      const isInvoiceRelated =
        entry.referenceType === 'pos_invoice' ||
        entry.referenceType === 'cogs' ||
        entry.referenceType === ('invoice' as any) ||
        (entry.description && (entry.description.includes('فاتورة مبيعات') || entry.description.includes('تكلفة البضاعة المباعة')));
      if (!isInvoiceRelated) {
        const msg2 = `📝 <b>قيد يومية جديد</b>\nالبيان: ${entry.description}\nالقيمة: ${entry.lines.reduce((sum, l) => sum + l.debit, 0)} ${settings?.currency || ''}`;
        TelegramService.sendMessage(msg2, settings);
      }
    } catch(e) {}

    // Update account balances according to double entry rule
    setAccounts(prev => {
      const updated = [...prev];
      entry.lines.forEach(line => {
        const acc = updated.find(a => a.code === line.accountCode);
        if (acc) {
          // Normal balance: Asset & Expense = Debit - Credit; Liability, Equity, Revenue = Credit - Debit
          if (acc.type === 'asset' || acc.type === 'expense') {
            acc.balance += (line.debit - line.credit);
          } else {
            acc.balance += (line.credit - line.debit);
          }
        }
      });
      return updated;
    });
  };

  // Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
  const addExpense = (
    expenseData: Omit<ExpenseItem, 'id' | 'createdAt'>
  ): ExpenseItem => {
    const id = `exp-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const jId = `entry-exp-${Date.now()}`;
    const voucherNum = `PV-EXP-${Date.now().toString().slice(-5)}`;

    const selectedAcc = accounts.find(a => a.code === expenseData.expenseAccountCode) || {
      code: expenseData.expenseAccountCode,
      name: expenseData.expenseAccountName || 'مصروفات عامة'
    };

    const targetTreasury = treasuries.find(
      t => t.accountCode === expenseData.treasuryAccountCode || t.id === expenseData.treasuryAccountCode
    );
    const treasuryCode = targetTreasury ? targetTreasury.accountCode : (expenseData.treasuryAccountCode || '1101');
    const treasuryName = targetTreasury ? targetTreasury.name : (expenseData.treasuryName || 'الصندوق النقدي (الكاشير)');

    const amount = Number(expenseData.amount) || 0;
    const curr = expenseData.currency || settings.baseCurrencyCode || 'ILS';
    const rate = expenseData.exchangeRate || 1.0;
    const baseAmount = Number((amount * rate).toFixed(2));

    const newExpense: ExpenseItem = {
      ...expenseData,
      id,
      createdAt,
      voucherNumber: voucherNum,
      journalEntryId: jId,
      treasuryAccountCode: treasuryCode,
      treasuryName,
      currency: curr,
      exchangeRate: rate
    };

    setExpenses(prev => [newExpense, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'expenses', newExpense.id), cleanDocForFirestore(newExpense)).catch(err => {
      console.warn('Direct cloud save expense notice:', err);
    });

    // 1. Post balanced double-entry journal (Debit Expense, Credit Treasury)
    addJournalEntry({
      date: expenseData.date,
      description: `سداد مصروف تشغيلي: ${selectedAcc.name} - ${expenseData.beneficiary || ''} (${expenseData.notes || expenseData.categoryName})`,
      referenceType: 'expense' as any,
      referenceId: id,
      lines: [
        {
          accountCode: selectedAcc.code,
          accountName: selectedAcc.name,
          debit: baseAmount,
          credit: 0,
          description: `مصروف: ${expenseData.notes || expenseData.categoryName}`
        },
        {
          accountCode: treasuryCode,
          accountName: treasuryName,
          debit: 0,
          credit: baseAmount,
          description: `صرف من: ${treasuryName}`
        }
      ]
    });

    // 2. Adjust treasury register balance and transaction history
    adjustTreasuryBalance(
      treasuryCode,
      -amount,
      `مصروف: ${selectedAcc.name} (${expenseData.beneficiary || ''})`,
      'manual',
      id,
      {
        currency: curr,
        currencySymbol: expenseData.currencySymbol || (curr === 'ILS' ? '₪' : curr),
        exchangeRate: rate,
        voucherNumber: voucherNum,
        partyName: expenseData.beneficiary,
        date: expenseData.date
      }
    );

    return newExpense;
  };

  const deleteExpense = (id: string) => {
    const existing = expenses.find(e => e.id === id);
    if (!existing) return;

    // 1. Revert Treasury balance
    if (existing.treasuryAccountCode && existing.amount) {
      adjustTreasuryBalance(
        existing.treasuryAccountCode,
        existing.amount,
        `إلغاء قيد مصروف: ${existing.expenseAccountName}`,
        'manual',
        id
      );
    }

    // 2. Revert journal entry
    if (existing.journalEntryId) {
      setJournalEntries(prev => prev.filter(je => je.id !== existing.journalEntryId));
      deleteDoc(doc(db, 'journals', existing.journalEntryId)).catch(() => {});
    }

    // 3. Remove expense item from state & cloud
    setExpenses(prev => prev.filter(e => e.id !== id));
    registerDeletedDoc('expenses', id);
    deleteDoc(doc(db, 'expenses', id)).catch(() => {});
  };

  const addStockMovement = (movement: Omit<StockMovement, 'id'>) => {
    const id = 'sm-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const newMovement: StockMovement = {
      ...movement,
      id,
      time: movement.time || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
    };
    setStockMovements(prev => [newMovement, ...prev]);
    setDoc(doc(db, 'stockMovements', newMovement.id), cleanDocForFirestore(newMovement)).catch(() => {});
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id'>) => {
    const id = 'inv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    // Enforce SKU uniqueness: ensure item.code never duplicates any existing item
    let uniqueCode = (item.code || '').trim();
    const isDuplicate = inventory.some(it => (it.code || '').trim().toLowerCase() === uniqueCode.toLowerCase());
    if (!uniqueCode || isDuplicate) {
      uniqueCode = generateSequentialSku(item.category, inventory.map(i => i.code || ''), settings.categories);
    }

    const newItem: InventoryItem = { ...item, id, code: uniqueCode, lastMovementDate: today };
    setInventory(prev => [newItem, ...prev]);

    // Save directly to cloud
    setDoc(doc(db, 'inventory', newItem.id), cleanDocForFirestore(newItem)).catch(err => {
      console.warn('Direct cloud save inventory notice:', err);
    });

    // If opening stock > 0, record opening balance in stock movements ledger
    if (item.stockQuantity > 0) {
      addStockMovement({
        itemId: id,
        itemCode: uniqueCode,
        itemName: item.name,
        category: item.category,
        date: today,
        time,
        type: 'in_opening',
        quantity: item.stockQuantity,
        balanceBefore: 0,
        balanceAfter: item.stockQuantity,
        unitPrice: item.purchasePrice,
        totalValue: item.stockQuantity * item.purchasePrice,
        referenceType: 'opening',
        referenceNumber: 'OP-' + uniqueCode,
        reason: 'رصيد افتتاحي عند تعريف وتكويد الصنف',
        performedBy: 'أمين المستودع'
      });
    }

    return newItem;
  };

  const updateInventoryItem = (id: string, updated: Partial<InventoryItem>) => {
    const existing = inventory.find(it => it.id === id);
    let merged: InventoryItem;
    if (existing) {
      if (updated.code) {
        const trimmed = updated.code.trim();
        const conflict = inventory.some(other => other.id !== id && (other.code || '').trim().toLowerCase() === trimmed.toLowerCase());
        if (conflict) {
          console.warn(`SKU conflict: "${trimmed}" already in use. Retaining original SKU "${existing.code}".`);
          merged = { ...existing, ...updated, code: existing.code };
        } else {
          merged = { ...existing, ...updated };
        }
      } else {
        merged = { ...existing, ...updated };
      }
    } else {
      merged = { ...updated, id } as InventoryItem;
    }

    setInventory(prev => prev.map(it => (it.id === id ? merged : it)));
    try {
      const next = inventory.map(it => (it.id === id ? merged : it));
      if (!inventory.some(it => it.id === id)) next.push(merged);
      localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(next));
    } catch {}
    setDoc(doc(db, 'inventory', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
  };

  const deleteInventoryItem = (id: string): { success: boolean; message: string } => {
    const hasMovements = stockMovements.some(m => m.itemId === id);
    if (hasMovements) {
      return { success: false, message: 'لا يمكن حذف الصنف لوجود حركات (وارد/منصرف) مسجلة عليه.' };
    }
    
    const usedInInvoices = invoices.some(inv => inv.items.some(i => i.itemId === id));
    if (usedInInvoices) {
       return { success: false, message: 'لا يمكن حذف الصنف لوجوده في فواتير مبيعات سابقة.' };
    }
    
    const usedInPurchases = purchases.some(p => p.items.some(i => i.itemId === id));
    if (usedInPurchases) {
       return { success: false, message: 'لا يمكن حذف الصنف لوجوده في فواتير مشتريات سابقة.' };
    }

    setInventory(prev => prev.filter(it => it.id !== id));
    registerDeletedDoc('inventory', id);
    deleteDoc(doc(db, 'inventory', id)).catch(() => {});
    return { success: true, message: 'تم حذف الصنف بنجاح' };
  };

  const adjustStock = (id: string, newQuantity: number, reason: string, notes?: string) => {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    setInventory(prev => prev.map(it => {
      if (it.id === id) {
        const oldQty = it.stockQuantity;
        const diff = newQuantity - oldQty;
        if (diff !== 0) {
          const isSurplus = diff > 0;
          const movementType: StockMovementType = isSurplus ? 'in_adjustment' : 'out_adjustment';
          const totalVal = Math.abs(diff) * it.purchasePrice;

          addStockMovement({
            itemId: it.id,
            itemCode: it.code,
            itemName: it.name,
            category: it.category,
            date: today,
            time,
            type: movementType,
            quantity: Math.abs(diff),
            balanceBefore: oldQty,
            balanceAfter: newQuantity,
            unitPrice: it.purchasePrice,
            totalValue: totalVal,
            referenceType: 'adjustment',
            referenceNumber: `ADJ-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
            reason: reason || (isSurplus ? 'تسوية جرد (فائض وزيادة مخزنية)' : 'تسوية جرد (عجز وهالك تالف)'),
            notes: notes || `تسوية رصيد الصنف من ${oldQty} إلى ${newQuantity} ${it.unit}`,
            performedBy: 'لجنة الجرد والمطابقة'
          });
        }
        const updatedItem = { ...it, stockQuantity: newQuantity, lastMovementDate: today };
        setDoc(doc(db, 'inventory', id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));
  };

  const addParty = (partyData: Omit<Party, 'id' | 'balance' | 'code'> & { initialBalance?: number; code?: string }) => {
    // منع تكرار إنشاء زبون نقدي أو عميل عام بأي حال من الأحوال
    const trimmedName = (partyData.name || '').trim();
    const isGenericCash = trimmedName === 'زبون نقدي' || trimmedName === 'عميل نقدي' || trimmedName === 'عميل كاشير نقدي' || trimmedName === 'زبون عام';
    if (isGenericCash) {
      const existing = parties.find(p => (p.name || '').trim() === trimmedName);
      if (existing) {
        return existing;
      }
    }

    const id = 'pt-' + Date.now();
    // Enforce sequential code generated automatically by the program (cannot be duplicated or altered)
    const code = generateSequentialPartyCode(partyData.type, parties);

    let initialBal = partyData.initialBalance || 0;
    if (partyData.openingBalance !== undefined && partyData.openingBalance > 0) {
      if (partyData.openingBalanceType === 'credit' || (!partyData.openingBalanceType && partyData.type === 'supplier')) {
        initialBal = -Math.abs(partyData.openingBalance);
      } else {
        initialBal = Math.abs(partyData.openingBalance);
      }
    }

    const newParty: Party = {
      ...partyData,
      id,
      code,
      balance: initialBal,
      openingBalance: partyData.openingBalance !== undefined ? partyData.openingBalance : Math.abs(initialBal),
      openingBalanceType: partyData.openingBalanceType || (initialBal < 0 ? 'credit' : 'debit'),
      openingBalanceDate: partyData.openingBalanceDate || new Date().toISOString().split('T')[0]
    };
    setParties(prev => {
      const next = [...prev, newParty];
      try {
        localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(next));
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
      } catch (e) {}
      return next;
    });

    setHasUnsyncedChanges(true);
    setPendingSyncCount(prev => prev + 1);

    // Save directly to cloud
    setDoc(doc(db, 'parties', newParty.id), cleanDocForFirestore(newParty)).catch(err => {
      console.warn('Direct cloud save party notice:', err);
    });

    return newParty;
  };

  const updateParty = (id: string, updated: Partial<Party>) => {
    let finalMergedParty: Party | null = null;
    let targetId = id;

    setParties(prev => {
      // 1. Resolve existing party robustly (by id or code)
      const existing = prev.find(p => p.id === id || (p.code && p.code.toLowerCase() === id.toLowerCase()));
      if (!existing) {
        console.warn(`updateParty: Target party ${id} not found in parties list. Ignored.`);
        return prev;
      }
      targetId = existing.id;

      const { code: _ignored, ...allowedUpdates } = updated;
      const merged: Party = { ...existing, ...allowedUpdates, code: existing.code };

      // If existing party exists, preserve existing balance unless explicitly updated.balance is passed or openingBalance is modified
      if (updated.balance !== undefined) {
        merged.balance = updated.balance;
      } else if (updated.openingBalance !== undefined) {
        const isCredit = merged.openingBalanceType === 'credit' || (!merged.openingBalanceType && merged.type === 'supplier');
        const nextOpeningVal = isCredit ? -Math.abs(merged.openingBalance) : Math.abs(merged.openingBalance);
        
        const oldIsCredit = existing.openingBalanceType === 'credit' || (!existing.openingBalanceType && existing.type === 'supplier');
        const oldOpeningVal = oldIsCredit ? -Math.abs(existing.openingBalance || 0) : Math.abs(existing.openingBalance || 0);
        
        // Current balance adjusts by the difference in opening balance
        const diff = nextOpeningVal - oldOpeningVal;
        merged.balance = Number(((existing.balance || 0) + diff).toFixed(2));
      } else {
        merged.balance = existing.balance;
      }

      finalMergedParty = merged;

      const nextParties = prev.map(p => (p.id === targetId ? merged : p));

      // 2. Persist to LocalStorage immediately with the updated array
      try {
        localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(nextParties));
        localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
        const hashes = JSON.parse(localStorage.getItem('accounting_synced_hashes') || '{}');
        delete hashes[`parties_${targetId}`];
        localStorage.setItem('accounting_synced_hashes', JSON.stringify(hashes));
      } catch (e) {}

      // 3. Direct cloud update
      setDoc(doc(db, 'parties', targetId), cleanDocForFirestore(merged), { merge: true }).catch(err => {
        console.warn('Direct cloud update party notice:', err);
      });

      return nextParties;
    });

    setHasUnsyncedChanges(true);
    setPendingSyncCount(prev => prev + 1);

    if (debouncedSyncRef.current) {
      clearTimeout(debouncedSyncRef.current);
    }
    debouncedSyncRef.current = setTimeout(() => {
      if (navigator.onLine && syncToFirebaseRef.current) {
        syncToFirebaseRef.current(true);
      }
    }, 1500);

    return finalMergedParty;
  };

  const deleteParty = (id: string): { success: boolean; message?: string } => {
    const hasInvoices = invoices.some(i => i.customerId === id);
    const hasPurchases = purchases.some(p => p.supplierId === id);
    const hasReturns = purchaseReturns.some(r => r.supplierId === id);
    const hasVouchers = vouchers.some(v => v.partyId === id);
    const hasPrintOrders = printOrders.some(po => po.customerId === id);

    if (hasInvoices || hasPurchases || hasReturns || hasVouchers || hasPrintOrders) {
      return {
        success: false,
        message: 'لا يمكن حذف هذا العميل/المورد لوجود حركات مالية وفواتير مسجلة باسمه. يمكنك تعديل بياناته أو تصفير رصيده.'
      };
    }

    setParties(prev => prev.filter(p => p.id !== id));
    registerDeletedDoc('parties', id);
    deleteDoc(doc(db, 'parties', id)).catch(err => console.warn('Direct cloud delete party notice:', err));
    if (selectedPartyForStatement?.id === id) {
      setSelectedPartyForStatement(null);
    }
    return { success: true };
  };

  // Employee management
  const addEmployee = (employeeData: Omit<Employee, 'id'>) => {
    const id = 'emp-' + Date.now();
    const newEmp: Employee = {
      ...employeeData,
      id,
      paymentHistory: employeeData.paymentHistory || []
    };
    setEmployees(prev => [newEmp, ...prev]);
    setDoc(doc(db, 'employees', newEmp.id), cleanDocForFirestore(newEmp)).catch(() => {});
    return newEmp;
  };

  const updateEmployee = (id: string, updated: Partial<Employee>) => {
    const existing = employees.find(emp => emp.id === id);
    const merged: Employee = existing ? { ...existing, ...updated } : ({ ...updated, id } as Employee);
    setEmployees(prev => prev.map(emp => (emp.id === id ? merged : emp)));
    try {
      const next = employees.map(emp => (emp.id === id ? merged : emp));
      localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(next));
    } catch {}
    setDoc(doc(db, 'employees', id), cleanDocForFirestore(merged), { merge: true }).catch(() => {});
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(emp => emp.id !== id));
    registerDeletedDoc('employees', id);
    deleteDoc(doc(db, 'employees', id)).catch(() => {});
  };

  const payEmployeeSalary = (
    employeeId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    note: string,
    type: 'salary' | 'advance',
    period: string
  ) => {
    const targetEmp = employees.find(e => e.id === employeeId);
    if (!targetEmp) return;

    const voucherNumber = `PV-SAL-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(4, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const paymentRecord = {
      id: 'sp-' + Date.now(),
      date: today,
      amount,
      type,
      period,
      paymentMethod,
      notes: note,
      voucherNumber
    };

    setEmployees(prev =>
      prev.map(emp => {
        if (emp.id === employeeId) {
          const updatedEmp = {
            ...emp,
            paymentHistory: [paymentRecord, ...(emp.paymentHistory || [])]
          };
          setDoc(doc(db, 'employees', emp.id), cleanDocForFirestore(updatedEmp)).catch(() => {});
          return updatedEmp;
        }
        return emp;
      })
    );

    const cashBankCode = paymentMethod === 'cash' ? '1101' : '1102';
    const cashBankName = paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

    const newVoucher: PaymentVoucher = {
      id: 'vch-' + Date.now(),
      voucherNumber,
      type: 'payment',
      date: today,
      partyId: targetEmp.id,
      partyName: targetEmp.name,
      amount,
      paymentMethod: paymentMethod === 'credit' ? 'cash' : (paymentMethod as 'cash' | 'bank_transfer' | 'cheque'),
      accountCode: '5201',
      description: `${type === 'salary' ? 'صرف راتب' : 'صرف سلفة'} للموظف: ${targetEmp.name} (${targetEmp.jobTitle}) - ${period}`
    };

    setVouchers(prev => [newVoucher, ...prev]);
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

    addJournalEntry({
      date: today,
      description: `سند صرف رواتب ${voucherNumber} للموظف ${targetEmp.name} - ${period}`,
      referenceType: 'payment',
      referenceId: newVoucher.id,
      lines: [
        {
          accountCode: '5201',
          accountName: 'مصروفات الرواتب والأجور',
          debit: amount,
          credit: 0,
          description: `${type === 'salary' ? 'راتب' : 'سلفة'} ${targetEmp.name} (${period})`
        },
        {
          accountCode: cashBankCode,
          accountName: cashBankName,
          debit: 0,
          credit: amount,
          description: `صرف من ${cashBankName}`
        }
      ]
    });
  };

  // Employee Adjustments & Payroll Sheets
  const addEmployeeAdvance = (
    employeeId: string,
    amount: number,
    date: string,
    treasuryAccountCode: string,
    reason: string,
    disburseImmediately: boolean
  ) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const treasuryAcc = accounts.find(a => a.code === treasuryAccountCode);
    const treasuryName = treasuryAcc ? treasuryAcc.name : (treasuryAccountCode === '1101' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)');

    let voucherNumber: string | undefined = undefined;

    if (disburseImmediately) {
      voucherNumber = `PV-ADV-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(4, '0')}`;
      const newVoucher: PaymentVoucher = {
        id: 'vch-' + Date.now(),
        voucherNumber,
        type: 'payment',
        date,
        partyId: emp.id,
        partyName: emp.name,
        amount,
        paymentMethod: treasuryAccountCode === '1101' ? 'cash' : 'bank_transfer',
        accountCode: '1104',
        description: `سند صرف سلفة نقدية للموظف: ${emp.name} (${emp.jobTitle}) - ${reason}`
      };
      setVouchers(prev => [newVoucher, ...prev]);
      setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(() => {});

      // Journal entry: Debit 1104 (سلف ومستحقات الموظفين), Credit Treasury (1101/1102)
      addJournalEntry({
        date,
        description: `سند صرف سلفة فورية ${voucherNumber} للموظف ${emp.name} - ${reason}`,
        referenceType: 'payment',
        referenceId: newVoucher.id,
        lines: [
          {
            accountCode: '1104',
            accountName: 'سلف ومستحقات الموظفين',
            debit: amount,
            credit: 0,
            description: `سلفة ${emp.name} - ${reason}`
          },
          {
            accountCode: treasuryAccountCode,
            accountName: treasuryName,
            debit: 0,
            credit: amount,
            description: `صرف من ${treasuryName}`
          }
        ]
      });

      // Add to employee payment history
      setEmployees(prev =>
        prev.map(e => {
          if (e.id === employeeId) {
            const updatedEmp = {
              ...e,
              paymentHistory: [
                {
                  id: 'sp-' + Date.now(),
                  date,
                  amount,
                  type: 'advance' as const,
                  period: `سلفة نقدية (${date})`,
                  paymentMethod: treasuryAccountCode === '1101' ? 'cash' as const : 'bank_transfer' as const,
                  voucherNumber,
                  notes: reason
                },
                ...(e.paymentHistory || [])
              ]
            };
            setDoc(doc(db, 'employees', e.id), cleanDocForFirestore(updatedEmp)).catch(() => {});
            return updatedEmp;
          }
          return e;
        })
      );
    }

    const newAdvance: EmployeeAdvance = {
      id: 'adv-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      date,
      amount,
      treasuryAccountCode,
      treasuryName,
      reason,
      status: 'pending',
      disbursedImmediately: disburseImmediately,
      voucherNumber
    };

    setEmployeeAdvances(prev => [newAdvance, ...prev]);
    setDoc(doc(db, 'employeeAdvances', newAdvance.id), cleanDocForFirestore(newAdvance)).catch(() => {});
  };

  const cancelEmployeeAdvance = (id: string) => {
    setEmployeeAdvances(prev => prev.map(a => {
      if (a.id === id) {
        const updated = { ...a, status: 'cancelled' as const };
        setDoc(doc(db, 'employeeAdvances', id), cleanDocForFirestore(updated)).catch(() => {});
        return updated;
      }
      return a;
    }));
  };

  const addEmployeeDeduction = (employeeId: string, amount: number, date: string, reason: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const newDed: EmployeeDeduction = {
      id: 'ded-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      date,
      amount,
      reason,
      status: 'pending'
    };

    setEmployeeDeductions(prev => [newDed, ...prev]);
    setDoc(doc(db, 'employeeDeductions', newDed.id), cleanDocForFirestore(newDed)).catch(() => {});
  };

  const cancelEmployeeDeduction = (id: string) => {
    setEmployeeDeductions(prev => prev.map(d => {
      if (d.id === id) {
        const updated = { ...d, status: 'cancelled' as const };
        setDoc(doc(db, 'employeeDeductions', id), cleanDocForFirestore(updated)).catch(() => {});
        return updated;
      }
      return d;
    }));
  };

  const addEmployeeIncentive = (employeeId: string, amount: number, date: string, reason: string) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    const newInc: EmployeeIncentive = {
      id: 'inc-' + Date.now(),
      employeeId,
      employeeName: emp.name,
      date,
      amount,
      reason,
      status: 'pending'
    };

    setEmployeeIncentives(prev => [newInc, ...prev]);
    setDoc(doc(db, 'employeeIncentives', newInc.id), cleanDocForFirestore(newInc)).catch(() => {});
  };

  const cancelEmployeeIncentive = (id: string) => {
    setEmployeeIncentives(prev => prev.map(i => {
      if (i.id === id) {
        const updated = { ...i, status: 'cancelled' as const };
        setDoc(doc(db, 'employeeIncentives', id), cleanDocForFirestore(updated)).catch(() => {});
        return updated;
      }
      return i;
    }));
  };

  const createDraftPayrollSheet = (
    sheetData: Omit<PayrollSheet, 'id' | 'sheetNumber' | 'createdAt' | 'status'>
  ): PayrollSheet => {
    const id = 'prs-' + Date.now();
    const count = payrollSheets.length + 1;
    const year = new Date().getFullYear();
    const sheetNumber = `PR-${year}-${String(count).padStart(4, '0')}`;
    const createdAt = new Date().toISOString().split('T')[0];

    const newSheet: PayrollSheet = {
      ...sheetData,
      id,
      sheetNumber,
      createdAt,
      status: 'draft'
    };

    setPayrollSheets(prev => [newSheet, ...prev]);
    setDoc(doc(db, 'payrollSheets', newSheet.id), cleanDocForFirestore(newSheet)).catch(() => {});
    return newSheet;
  };

  const updateDraftPayrollSheet = (id: string, updated: Partial<PayrollSheet>) => {
    let finalSheet: PayrollSheet | null = null;
    setPayrollSheets(prev =>
      prev.map(sheet => {
        if (sheet.id === id && sheet.status === 'draft') {
          finalSheet = { ...sheet, ...updated };
          return finalSheet;
        }
        return sheet;
      })
    );
    if (finalSheet) {
      setDoc(doc(db, 'payrollSheets', id), cleanDocForFirestore(finalSheet)).catch(() => {});
    }
  };

  const deleteDraftPayrollSheet = (id: string) => {
    setPayrollSheets(prev => prev.filter(s => !(s.id === id && s.status === 'draft')));
    deleteDoc(doc(db, 'payrollSheets', id)).catch(() => {});
  };

  const unapprovePayrollSheet = (id: string): { success: boolean; message?: string } => {
    const sheet = payrollSheets.find(s => s.id === id);
    if (!sheet) return { success: false, message: 'كشف الرواتب غير موجود' };
    if (sheet.status !== 'approved') return { success: false, message: 'الكشف ليس معتمداً' };

    const voucherNumber = sheet.voucherNumber;
    if (!voucherNumber) return { success: false, message: 'رقم السند غير موجود، لا يمكن إلغاء الاعتماد' };
    
    // Find the voucher
    const voucher = vouchers.find(v => v.voucherNumber === voucherNumber);
    
    if (voucher) {
      // 1. Delete voucher
      setVouchers(prev => prev.filter(v => v.id !== voucher.id));
      
      // 2. Delete Journal Entries
      setJournalEntries(prev => prev.filter(j => j.referenceId !== voucher.id));
      
      // 3. Delete Treasury Movements and restore balance
      const movements = vouchers.filter(m => m.referenceId === voucher.id);
      
      setAccounts(prev => prev.map(acc => {
         const movementForAcc = movements.find(m => m.accountId === acc.code || m.treasuryId === acc.code);
         if (movementForAcc) {
            let revertAmount = 0;
            if (movementForAcc.type === 'withdrawal' || movementForAcc.type === 'transfer_out') revertAmount = movementForAcc.amount;
            else if (movementForAcc.type === 'deposit' || movementForAcc.type === 'transfer_in') revertAmount = -movementForAcc.amount;
            
            return { ...acc, balance: acc.balance + revertAmount };
         }
         return acc;
      }));

      // setTreasuryMovements(prev => prev.filter(m => m.referenceId !== voucher.id));
    }

    // 4. Update the sheet status back to draft
    setPayrollSheets(prev =>
      prev.map(s =>
        s.id === id
          ? {
              ...s,
              status: 'draft',
              disbursedAt: undefined,
              voucherNumber: undefined,
              treasuryAccountCode: '',
              treasuryName: ''
            }
          : s
      )
    );
    
    // 5. Restore employee advances to 'approved' status
    const includedEmployeeIds = sheet.items.filter(item => item.isIncluded).map(item => item.employeeId);
    setEmployeeAdvances(prev => 
      prev.map(a => 
        (includedEmployeeIds.includes(a.employeeId) && a.status === 'deducted' && a.amount <= sheet.totalAdvances)
          ? { ...a, status: 'approved' } 
          : a
      )
    );

    return { success: true, message: 'تم إلغاء الاعتماد بنجاح وإعادة الكشف لحالة المسودة. يمكنك الآن تعديله.' };
  };

  const approveAndDisbursePayrollSheet = (id: string, treasuryAccountCodeOverride?: string): { success: boolean; message?: string } => {
    const sheet = payrollSheets.find(s => s.id === id);
    if (!sheet) return { success: false, message: 'كشف الرواتب غير موجود' };
    if (sheet.status === 'approved') return { success: false, message: 'كشف الرواتب معتمد ومصروف مسبقاً' };

    const treasuryCode = treasuryAccountCodeOverride || sheet.treasuryAccountCode || '1101';
    const treasuryAcc = accounts.find(a => a.code === treasuryCode);
    const treasuryName = treasuryAcc ? treasuryAcc.name : (treasuryCode === '1101' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)');

    // Check treasury balance
    if (treasuryAcc && treasuryAcc.balance < sheet.totalNet) {
      return {
        success: false,
        message: `رصيد ${treasuryName} الحالي (${treasuryAcc.balance.toLocaleString()} ر.س) غير كافٍ لصرف إجمالي صافي الرواتب (${sheet.totalNet.toLocaleString()} ر.س). يرجى تغذية الخزينة أو اختيار الخزينة الأخرى.`
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const voucherNumber = `PV-SAL-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(4, '0')}`;

    // 1. Create Payment Voucher for the batch
    const newVoucher: PaymentVoucher = {
      id: 'vch-' + Date.now(),
      voucherNumber,
      type: 'payment',
      date: today,
      partyId: 'payroll-batch',
      partyName: sheet.title,
      amount: sheet.totalNet,
      paymentMethod: treasuryCode === '1101' ? 'cash' : 'bank_transfer',
      accountCode: '5201',
      description: `صرف كشف رواتب ${sheet.sheetNumber}: ${sheet.title} - مسحوب من ${treasuryName} لعدد ${sheet.employeesCount} موظف`
    };
    setVouchers(prev => [newVoucher, ...prev]);

    // 2. Generate Journal Entry
    // Gross expense = totalBasic + totalAllowances + totalIncentives - totalDeductions
    const grossExpense = sheet.totalBasic + sheet.totalAllowances + sheet.totalIncentives - sheet.totalDeductions;
    
    const lines = [
      {
        accountCode: '5201',
        accountName: 'مصروفات الرواتب والأجور',
        debit: grossExpense,
        credit: 0,
        description: `إجمالي استحقاق كشف رواتب ${sheet.sheetNumber} (${sheet.title})`
      }
    ];

    if (sheet.totalAdvances > 0) {
      lines.push({
        accountCode: '1104',
        accountName: 'سلف ومستحقات الموظفين',
        debit: 0,
        credit: sheet.totalAdvances,
        description: `تسوية واقتطاع سلف موظفين من كشف ${sheet.sheetNumber}`
      });
    }

    lines.push({
      accountCode: treasuryCode,
      accountName: treasuryName,
      debit: 0,
      credit: sheet.totalNet,
      description: `صرف صافي الرواتب من ${treasuryName}`
    });

    addJournalEntry({
      date: today,
      description: `قيد اعتماد وصرف كشف رواتب ${sheet.sheetNumber} (${sheet.title}) - سند ${voucherNumber}`,
      referenceType: 'payment',
      referenceId: newVoucher.id,
      lines
    });

    // 2.1 Update Treasury actual balance
    adjustTreasuryBalance(
      treasuryCode,
      -sheet.totalNet,
      `صرف صافي كشف رواتب ${sheet.sheetNumber}: ${sheet.title}`,
      'payroll',
      newVoucher.id,
      {
        currency: 'ILS',
        currencySymbol: '₪',
        exchangeRate: 1.0,
        voucherNumber,
        partyName: 'فريق العمل والموظفون',
        date: today
      }
    );

    // 3. Update the sheet status to approved
    setPayrollSheets(prev =>
      prev.map(s =>
        s.id === id
          ? {
              ...s,
              status: 'approved',
              disbursedAt: today,
              treasuryAccountCode: treasuryCode,
              treasuryName,
              voucherNumber
            }
          : s
      )
    );

    // 4. Update included employee advances to deducted
    const includedEmployeeIds = sheet.items.filter(item => item.isIncluded).map(item => item.employeeId);

    setEmployeeAdvances(prev =>
      prev.map(adv =>
        includedEmployeeIds.includes(adv.employeeId) && adv.status === 'pending'
          ? {
              ...adv,
              status: 'deducted',
              payrollSheetId: sheet.id,
              payrollSheetTitle: sheet.title,
              deductedAt: today
            }
          : adv
      )
    );

    // 5. Update included deductions to deducted
    setEmployeeDeductions(prev =>
      prev.map(ded =>
        includedEmployeeIds.includes(ded.employeeId) && ded.status === 'pending'
          ? {
              ...ded,
              status: 'deducted',
              payrollSheetId: sheet.id,
              payrollSheetTitle: sheet.title,
              deductedAt: today
            }
          : ded
      )
    );

    // 6. Update included incentives to paid
    setEmployeeIncentives(prev =>
      prev.map(inc =>
        includedEmployeeIds.includes(inc.employeeId) && inc.status === 'pending'
          ? {
              ...inc,
              status: 'paid',
              payrollSheetId: sheet.id,
              payrollSheetTitle: sheet.title,
              paidAt: today
            }
          : inc
      )
    );

    // 7. Update employees payment history
    setEmployees(prev =>
      prev.map(emp => {
        const item = sheet.items.find(i => i.employeeId === emp.id && i.isIncluded);
        if (!item) return emp;

        const newRecord: SalaryPaymentRecord = {
          id: 'sp-' + Date.now() + '-' + emp.id,
          date: today,
          amount: item.netSalary,
          type: 'salary',
          period: `${sheet.title} (${sheet.period})`,
          paymentMethod: treasuryCode === '1101' ? 'cash' : 'bank_transfer',
          voucherNumber,
          notes: `أساسي: ${item.basicSalary} + بدلات: ${item.allowances} + حوافز: ${item.incentives} - خصومات: ${item.deductions} - سلف: ${item.advancesDeducted} = صافي ${item.netSalary} ر.س`
        };

        return {
          ...emp,
          paymentHistory: [newRecord, ...(emp.paymentHistory || [])]
        };
      })
    );

    return {
      success: true,
      message: `تم اعتماد وصرف كشف الرواتب ${sheet.sheetNumber} بنجاح، وخُصم المبلغ (${sheet.totalNet.toLocaleString()} ر.س) من ${treasuryName}.`
    };
  };

  // Create POS Sale
  const createPosSale = (
    items: Array<{
      item: InventoryItem;
      quantity: number;
      discount?: number;
      unitPrice?: number;
      itemName?: string;
      description?: string;
      notes?: string;
      hasDimensions?: boolean;
      length?: number;
      width?: number;
      count?: number;
      unit?: string;
      tax?: number;
      taxRate?: number;
      attachments?: LineAttachment[];
      imageThumbnail?: string;
    }>,
    customerName: string,
    paymentMethod: PaymentMethod,
    customerId?: string,
    notes?: string,
    extraOptions?: {
      invoiceNumber?: string;
      date?: string;
      additionalCharges?: number;
      overallDiscount?: number;
      taxRate?: number;
      paidAmount?: number;
      representative?: string;
      branch?: string;
      warehouse?: string;
      customCustomerText?: string;
      subCustomerId?: string;
      subCustomerName?: string;
      subCustomerPhone?: string;
      treasuryAccountCode?: string;
      currency?: string;
      currencySymbol?: string;
      exchangeRate?: number;
      cashPaidAmount?: number;
      cashCurrency?: string;
      cashExchangeRate?: number;
      cashTreasuryCode?: string;
      bankPaidAmount?: number;
      bankCurrency?: string;
      bankExchangeRate?: number;
      bankTreasuryCode?: string;
      workflowStatus?: PosInvoiceWorkflowStatus;
      paymentStatus?: InvoicePaymentStatus;
      branchId?: string;
      userId?: string;
      userName?: string;
      editingInvoiceId?: string;
      paymentNotes?: string;
    }
  ): Invoice => {
    // ربط العميل النقدي برمز CUST-0001
    if (!customerId || customerName === 'عميل كاشير نقدي' || customerName === 'عميل نقدي' || customerName === 'زبون عام' || customerId === 'pt-cust-1') {
      const defaultCashCust = parties.find(p => p.code === 'CUST-0001');
      if (defaultCashCust) {
        customerId = defaultCashCust.id;
        customerName = defaultCashCust.name;
      }
    }

    // 1. التحقق الفوري ومنع التكرار نهائياً لأي معرف عملية (Transaction ID)
    let invId = extraOptions?.editingInvoiceId;
    if (!invId) {
      invId = 'inv-pos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      // التأكد من عدم وجود معرف عملية مطاط أو مكرر بنفس المعرف في الفواتير الحالية
      let attempts = 0;
      while (invoices.some(inv => inv.id === invId) && attempts < 10) {
        invId = 'inv-pos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        attempts++;
      }
    }

    
    // If editing, find the old invoice and reverse its effects
    const oldInvoice = extraOptions?.editingInvoiceId ? invoices.find(inv => inv.id === extraOptions.editingInvoiceId) : undefined;
    if (oldInvoice && oldInvoice.isAccountingPosted) {
      // 1. Reverse Stock
      setInventory(prevInv => prevInv.map(invItem => {
        const sold = oldInvoice.items.find(i => i.itemId === invItem.id);
        if (sold && invItem.category !== 'copy_scan') {
          return { ...invItem, stockQuantity: invItem.stockQuantity + sold.quantity };
        }
        return invItem;
      }));
      // 2. Reverse Treasury (Cash/Bank)
      if (oldInvoice.cashPaidAmount && oldInvoice.cashPaidAmount > 0) {
        adjustTreasuryBalance(oldInvoice.cashTreasuryCode || '1101', -oldInvoice.cashPaidAmount, `عكس (تعديل) فاتورة ${oldInvoice.invoiceNumber}`, 'pos_sale', oldInvoice.id);
      }
      if (oldInvoice.bankPaidAmount && oldInvoice.bankPaidAmount > 0) {
        adjustTreasuryBalance(oldInvoice.bankTreasuryCode || '1102', -oldInvoice.bankPaidAmount, `عكس (تعديل) فاتورة ${oldInvoice.invoiceNumber}`, 'pos_sale', oldInvoice.id);
      }
      if (!oldInvoice.cashPaidAmount && !oldInvoice.bankPaidAmount && oldInvoice.paidAmount > 0) {
        adjustTreasuryBalance(oldInvoice.treasuryAccountCode || (oldInvoice.paymentMethod === 'card' ? '1102' : '1101'), -oldInvoice.paidAmount, `عكس (تعديل) فاتورة ${oldInvoice.invoiceNumber}`, 'pos_sale', oldInvoice.id);
      }
      // 3. Reverse Customer Balance
      const oldBaseRemain = oldInvoice.remainingAmount * (oldInvoice.exchangeRate || 1);
      if (oldBaseRemain > 0) {
        setParties(prevParties => prevParties.map(p => {
          let pUpdated = { ...p };
          if (oldInvoice.subCustomerId && p.id === oldInvoice.subCustomerId) {
            pUpdated.balance = Number((pUpdated.balance - oldBaseRemain).toFixed(2));
          } else if (!oldInvoice.subCustomerId && oldInvoice.customerId && p.id === oldInvoice.customerId) {
            pUpdated.balance = Number((pUpdated.balance - oldBaseRemain).toFixed(2));
          }
          return pUpdated;
        }));
      }
    }

    // 2. الفحص الصارم لرقم الفاتورة ومنع تكرار أي رقم فاتورة مطلقاً
    let invoiceNumber = oldInvoice ? oldInvoice.invoiceNumber : extraOptions?.invoiceNumber;
    if (!invoiceNumber) {
      let maxNum = 0;
      invoices.forEach(inv => {
        if (inv.invoiceNumber) {
          const matched = inv.invoiceNumber.match(/\d+/g);
          if (matched && matched.length > 0) {
            const num = parseInt(matched[matched.length - 1], 10);
            if (!isNaN(num) && num > maxNum && num < 1000000) {
              maxNum = num;
            }
          }
        }
      });
      invoiceNumber = `INV-${String(maxNum + 1).padStart(4, '0')}`;
    }

    // التحقق النهائي من عدم وجود أي فاتورة سابقة تحمل نفس رقم الفاتورة للعمليات الجديدة
    if (!oldInvoice) {
      const isNumDuplicate = invoices.some(inv => inv.invoiceNumber && inv.invoiceNumber.trim() === invoiceNumber.trim() && inv.id !== invId);
      if (isNumDuplicate) {
        let maxNum = 0;
        invoices.forEach(inv => {
          if (inv.invoiceNumber) {
            const matched = inv.invoiceNumber.match(/\d+/g);
            if (matched && matched.length > 0) {
              const num = parseInt(matched[matched.length - 1], 10);
              if (!isNaN(num) && num > maxNum && num < 1000000) {
                maxNum = num;
              }
            }
          }
        });
        invoiceNumber = `INV-${String(maxNum + 1).padStart(4, '0')}`;
      }
    }
    const today = extraOptions?.date || new Date().toISOString().split('T')[0];
    const appliedTaxRate = extraOptions?.taxRate !== undefined ? extraOptions.taxRate : settings.vatRate;
    const additionalFees = extraOptions?.additionalCharges || 0;

    let subtotal = 0;
    let discountTotal = extraOptions?.overallDiscount || 0;
    let totalCogs = 0;
    let deliveryFeeTotal = 0;

    const invoiceItems = items.map(line => {
      const unitP = line.unitPrice !== undefined ? line.unitPrice : line.item.sellingPrice;
      const length = Number(line.length) || 0;
      const width = Number(line.width) || 0;
      const count = Number(line.count) || 1;
      const hasDimensions = Boolean(
        line.hasDimensions !== undefined
          ? line.hasDimensions
          : (length > 0 && width > 0 && (length !== 1 || width !== 1 || count > 1))
      );

      // حساب الأبعاد
      // إذا كان الصنف يحتاج أبعاداً: الكمية = الطول × العرض × العدد
      // أما الصنف العادي فيستخدم كمية مباشرة
      const quantity = (hasDimensions && length > 0 && width > 0)
        ? Number((length * width * count).toFixed(3))
        : (Number(line.quantity) || 1);

      const lineSubtotal = quantity * unitP;
      const lineDiscount = Number(line.discount) || 0;
      const lineNet = Math.max(0, lineSubtotal - lineDiscount);
      const lineTaxRate = line.taxRate !== undefined ? line.taxRate : appliedTaxRate;
      const lineTax = Number(((lineNet * lineTaxRate) / 100).toFixed(2));
      const lineTotal = Number((lineNet + lineTax).toFixed(2));

      const isDeliveryItem = line.item.id === 'srv-delivery' || line.item.id === 'srv-delivery-mobile' || line.item.barcode === 'DELIVERY' || line.item.name === 'خدمة توصيل' || line.item.name?.trim().startsWith('توصيل');

      subtotal += lineSubtotal;
      discountTotal += lineDiscount;

      // خدمة التوصيل: خدمة خدماتية لا تتطلب مخازن وهي خالية من المرابح تماماً (التكلفة = سعر البيع للزبون = ما يحاسب به عامل التوصيل)
      // ولا تدخل ضمن تكلفة البضاعة المباعة (COGS) للمخازن ولا قيود أرباح المنشأة
      if (isDeliveryItem) {
        deliveryFeeTotal += lineNet;
      } else if (line.item.category !== 'services' && line.item.category !== 'copy_scan') {
        const itemCost = line.item.purchasePrice || 0;
        totalCogs += itemCost * quantity;
      }

      return {
        itemId: line.item.id,
        itemCode: line.item.code || '',
        itemName: line.itemName || line.item.name,
        category: line.item.category,
        quantity,
        unitPrice: unitP,
        discount: lineDiscount,
        tax: lineTax,
        taxRate: lineTaxRate,
        total: lineTotal,
        description: line.description || '',
        notes: line.notes || '',
        hasDimensions,
        length,
        width,
        count,
        unit: line.unit || line.item.unit || 'قطعة',
        attachments: line.attachments || [],
        barcode: line.item.barcode,
        imageThumbnail: line.imageThumbnail || ''
      };
    });

    const netBeforeTax = subtotal - discountTotal;
    const taxAmount = Number(((netBeforeTax * appliedTaxRate) / 100).toFixed(2));
    const totalAmount = Number((netBeforeTax + taxAmount + additionalFees).toFixed(2));
    const paidAmount = extraOptions?.paidAmount !== undefined
      ? extraOptions.paidAmount
      : (paymentMethod === 'credit' ? 0 : totalAmount);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    // Multi-Currency conversions (العملة الأساسية: الشيكل الفلسطيني ₪)
    const transactionCurrency = extraOptions?.currency || settings.baseCurrencyCode || 'ILS';
    const transactionCurrencySymbol = extraOptions?.currencySymbol || settings.currency || '₪';
    const exchangeRate = extraOptions?.exchangeRate || 1.0;
    const baseTotalAmount = Number((totalAmount * exchangeRate).toFixed(2));
    const baseNetBeforeTax = Number((netBeforeTax * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((taxAmount * exchangeRate).toFixed(2));
    const basePaidAmount = Number((paidAmount * exchangeRate).toFixed(2));
    const baseRemainingAmount = Number((remainingAmount * exchangeRate).toFixed(2));
    const baseDeliveryFee = Number((deliveryFeeTotal * exchangeRate).toFixed(2));
    const baseMerchandiseRevenue = Math.max(0, Number((baseNetBeforeTax - baseDeliveryFee).toFixed(2)));

    // Sub-customer resolution & persistence (الزبون الفرعي / الدين المؤقت)
    let resolvedSubCustId = extraOptions?.subCustomerId;
    let resolvedSubCustName = extraOptions?.subCustomerName;
    let resolvedSubCustPhone = extraOptions?.subCustomerPhone;

    // If subCustomer info wasn't directly supplied, parse customCustomerText
    if (!resolvedSubCustName && extraOptions?.customCustomerText) {
      const rawText = extraOptions.customCustomerText.trim();
      if (rawText && rawText !== customerName) {
        const phoneMatch = rawText.match(/(05\d{8}|01\d{8,9}|\+?\d{9,12})/);
        resolvedSubCustPhone = phoneMatch ? phoneMatch[0] : '';
        resolvedSubCustName = rawText.replace(resolvedSubCustPhone, '').trim() || rawText;
      }
    }

    let newlyCreatedSubParty: Party | null = null;
    const debtAmountToAdd = paymentMethod === 'credit' ? baseTotalAmount : (remainingAmount > 0 ? baseRemainingAmount : 0);

    if (resolvedSubCustName && resolvedSubCustName.trim()) {
      const cleanName = resolvedSubCustName.trim();
      // Normalize Arabic diacritics and letters for grouping identical names
      const normQuery = cleanName
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[يى]/g, 'ي')
        .trim();

      // Verify that this name does NOT belong to an existing main customer (main customers cannot be sub-customers)
      const isMainCustomer = parties.some(p => {
        if (p.isSubCustomer) return false;
        const normMain = (p.name || '')
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[إأآا]/g, 'ا')
          .replace(/ة/g, 'ه')
          .replace(/[يى]/g, 'ي')
          .trim();
        return normMain === normQuery;
      });

      if (!isMainCustomer) {
        const existingSub = parties.find(p => {
          if (!p.isSubCustomer) return false;
          if (resolvedSubCustId && p.id === resolvedSubCustId) return true;
          const normExisting = (p.name || '')
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[يى]/g, 'ي')
            .trim();
          return normExisting === normQuery;
        });

        if (existingSub) {
          resolvedSubCustId = existingSub.id;
          resolvedSubCustName = existingSub.name;
          if (!resolvedSubCustPhone && existingSub.phone) {
            resolvedSubCustPhone = existingSub.phone;
          }
        } else {
          // Auto-create new sub-customer connected to main customer
          const subId = 'pt-sub-' + Date.now();
          const subCode = generateSequentialPartyCode('customer', parties, true);
          newlyCreatedSubParty = {
            id: subId,
            code: subCode,
            type: 'customer',
            name: cleanName,
            phone: resolvedSubCustPhone || '',
            parentPartyId: customerId,
            isSubCustomer: true,
            balance: debtAmountToAdd,
            openingBalance: 0,
            openingBalanceDate: today,
            openingBalanceType: 'debit',
            notes: `زبون فرعي / دين مؤقت متصل بالعميل الرئيسي: ${customerName || ''}`
          };
          resolvedSubCustId = subId;
        }
      } else {
        // Name belongs to a registered main customer; cannot be treated or saved as sub-customer
        resolvedSubCustId = undefined;
        resolvedSubCustName = undefined;
        resolvedSubCustPhone = undefined;
      }
    }

    const wfStatus: PosInvoiceWorkflowStatus = extraOptions?.workflowStatus || 'new';
    const isAccountingEligible = isInvoiceAccountingEligible(wfStatus);
    const isQuotation = wfStatus === 'quotation';

    // In quotation: no payments accepted ("هي فقط كعرض سعر لزبون معين دون أن يتم خصم أو استلام أي شي")
    const effectivePaidAmount = isQuotation ? 0 : paidAmount;
    const effectiveRemainingAmount = isQuotation ? totalAmount : remainingAmount;
    const effectiveBasePaidAmount = isQuotation ? 0 : basePaidAmount;
    const effectiveBaseRemainingAmount = isQuotation ? baseTotalAmount : baseRemainingAmount;

    // Calculate separated payment status
    const computedPayStatus = computeInvoicePaymentStatus({
      paymentMethod,
      totalAmount,
      paidAmount: effectivePaidAmount,
      remainingAmount: effectiveRemainingAmount,
      cashPaidAmount: isQuotation ? 0 : extraOptions?.cashPaidAmount,
      bankPaidAmount: isQuotation ? 0 : extraOptions?.bankPaidAmount,
      explicitPaymentStatus: extraOptions?.paymentStatus
    });

    const newInvoice: Invoice = {
      id: invId,
      invoiceNumber,
      date: today,
      customerId,
      customerName: customerName || 'عميل كاشير نقدي',
      type: 'pos',
      items: invoiceItems,
      subtotal: Number(subtotal.toFixed(2)),
      discountTotal: Number(discountTotal.toFixed(2)),
      taxRate: appliedTaxRate,
      taxAmount,
      totalAmount,
      paidAmount: effectivePaidAmount,
      remainingAmount: effectiveRemainingAmount,
      paymentMethod,
      status: paymentMethod === 'credit' ? 'unpaid' : (effectiveRemainingAmount > 0 ? 'partial' : 'paid'),
      paymentStatus: computedPayStatus,
      workflowStatus: wfStatus,
      statusHistory: [
        {
          id: 'st-init-' + Date.now(),
          userName: extraOptions?.userName || currentUser?.fullName || 'كاشير',
          userId: extraOptions?.userId || currentUser?.id,
          date: today,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          previousStatus: wfStatus,
          newStatus: wfStatus,
          notes: extraOptions?.workflowStatus === 'quotation'
            ? 'إنشاء وتوثيق عرض سعر في النظام'
            : 'إنشاء الفاتورة وتثبيتها في النظام',
          createdAt: new Date().toISOString()
        }
      ],
      notes,
      additionalCharges: additionalFees,
      representative: extraOptions?.representative,
      branch: extraOptions?.branch || 'الفرع الرئيسي',
      branchId: extraOptions?.branchId,
      userId: extraOptions?.userId,
      userName: extraOptions?.userName,
      warehouse: extraOptions?.warehouse || 'المخزن الرئيسي',
      customCustomerText: extraOptions?.customCustomerText || (resolvedSubCustName ? `${resolvedSubCustName}${resolvedSubCustPhone ? ` ${resolvedSubCustPhone}` : ''}` : undefined),
      subCustomerId: resolvedSubCustId,
      subCustomerName: resolvedSubCustName,
      subCustomerPhone: resolvedSubCustPhone,
      currency: transactionCurrency,
      currencySymbol: transactionCurrencySymbol,
      exchangeRate,
      baseTotalAmount,
      basePaidAmount: effectiveBasePaidAmount,
      cashPaidAmount: isQuotation ? 0 : extraOptions?.cashPaidAmount,
      bankPaidAmount: isQuotation ? 0 : extraOptions?.bankPaidAmount,
      cashTreasuryCode: extraOptions?.cashTreasuryCode,
      bankTreasuryCode: extraOptions?.bankTreasuryCode,
      paymentNotes: extraOptions?.paymentNotes,
      isAccountingPosted: isAccountingEligible,
      postedAt: isAccountingEligible ? new Date().toISOString() : undefined
    };

    // 1. Deduct stock for physical items ONLY if invoice is accounting eligible (بيع/جديد - جاهز للتسليم - تم التسليم)
    if (isAccountingEligible) {
      const movementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      setInventory(prev => prev.map(invItem => {
        const sold = items.find(i => i.item.id === invItem.id);
        const isDeliveryOrService = invItem.category === 'copy_scan' || invItem.category === 'services' || invItem.id === 'srv-delivery' || invItem.id === 'srv-delivery-mobile' || invItem.barcode === 'DELIVERY' || invItem.name === 'خدمة توصيل' || invItem.name?.trim().startsWith('توصيل');
        if (sold && !isDeliveryOrService) {
          const oldQty = invItem.stockQuantity;
          const newQty = Math.max(0, oldQty - sold.quantity);
          addStockMovement({
            itemId: invItem.id,
            itemCode: invItem.code,
            itemName: invItem.name,
            category: invItem.category,
            date: today,
            time: movementTime,
            type: 'out_sale',
            quantity: sold.quantity,
            balanceBefore: oldQty,
            balanceAfter: newQty,
            unitPrice: invItem.purchasePrice,
            totalValue: sold.quantity * invItem.purchasePrice,
            referenceType: 'pos_invoice',
            referenceNumber: invoiceNumber,
            reason: `مبيعات كاشير (${customerName || 'عميل نقدي'})`,
            performedBy: extraOptions?.representative || 'كاشير'
          });
          return {
            ...invItem,
            stockQuantity: newQty,
            lastMovementDate: today
          };
        }
        return invItem;
      }));
    }

    // 2. Treasury updates and collections:
    // "في حال وجود دفع في أي حالة من الحالات السابقة تدخل ضمن احتساب الصندوق حسب تحديد الصندوق في الفاتورة والمبلغ المدفوع
    // ولكن الفاتورة تضل ضمن حالتها دون دخلوها القيود المحاسبية للمخازن وما يتعلق بالأصناف إلا بعد تحويلها لجاهزة للتسليم"
    const cashVal = isQuotation ? 0 : (extraOptions?.cashPaidAmount || 0);
    const cashCurr = extraOptions?.cashCurrency || transactionCurrency || 'ILS';
    const cashCurrInfo = currencies.find(c => c.code === cashCurr);
    const cashRate = extraOptions?.cashExchangeRate !== undefined ? extraOptions.cashExchangeRate : (cashCurr === 'ILS' ? 1.0 : (cashCurrInfo?.rateAgainstBase || 1.0));
    const cashSymbol = cashCurr === 'ILS' ? '₪' : (cashCurrInfo?.symbol || cashCurr);
    const cashBase = Number((cashVal * cashRate).toFixed(2));

    const bankVal = isQuotation ? 0 : (extraOptions?.bankPaidAmount || 0);
    const bankCurr = extraOptions?.bankCurrency || transactionCurrency || 'ILS';
    const bankCurrInfo = currencies.find(c => c.code === bankCurr);
    const bankRate = extraOptions?.bankExchangeRate !== undefined ? extraOptions.bankExchangeRate : (bankCurr === 'ILS' ? 1.0 : (bankCurrInfo?.rateAgainstBase || 1.0));
    const bankSymbol = bankCurr === 'ILS' ? '₪' : (bankCurrInfo?.symbol || bankCurr);
    const bankBase = Number((bankVal * bankRate).toFixed(2));

    if (!isQuotation) {
      if (cashVal > 0) {
        const cCode = extraOptions?.cashTreasuryCode || '1101';
        adjustTreasuryBalance(
          cCode,
          cashVal,
          `تحصيل نقدي - فاتورة مبيعات رقم ${invoiceNumber} (${customerName || 'عميل نقدي'})`,
          'pos_sale',
          invId,
          {
            currency: cashCurr,
            currencySymbol: cashSymbol,
            exchangeRate: cashRate,
            voucherNumber: invoiceNumber,
            partyName: customerName || 'عميل نقدي',
            date: today
          }
        );
      }
      if (bankVal > 0) {
        const bCode = extraOptions?.bankTreasuryCode || '1102';
        adjustTreasuryBalance(
          bCode,
          bankVal,
          `تحصيل شبكة / بنكي - فاتورة مبيعات رقم ${invoiceNumber} (${customerName || 'عميل نقدي'})`,
          'pos_sale',
          invId,
          {
            currency: bankCurr,
            currencySymbol: bankSymbol,
            exchangeRate: bankRate,
            voucherNumber: invoiceNumber,
            partyName: customerName || 'عميل نقدي',
            date: today
          }
        );
      }
      if (cashVal === 0 && bankVal === 0 && effectivePaidAmount > 0) {
        const tCode = extraOptions?.treasuryAccountCode || (paymentMethod === 'card' ? '1102' : '1101');
        adjustTreasuryBalance(
          tCode,
          effectivePaidAmount,
          `تحصيل فوري - فاتورة مبيعات رقم ${invoiceNumber} (${customerName || 'عميل نقدي'})`,
          'pos_sale',
          invId,
          {
            currency: transactionCurrency,
            currencySymbol: transactionCurrencySymbol,
            exchangeRate,
            voucherNumber: invoiceNumber,
            partyName: customerName || 'عميل نقدي',
            date: today
          }
        );
      }

      // Record formal receipt payment voucher (سند قبض رسمي)
      if (effectiveBasePaidAmount > 0) {
        const receiptVoucherId = `vch-inv-${invId}`;
        const receiptVoucherNumber = `RCT-INV-${invoiceNumber.replace('INV-', '')}`;
        const newReceiptVoucher: PaymentVoucher = {
          id: receiptVoucherId,
          voucherNumber: receiptVoucherNumber,
          type: 'receipt',
          date: today,
          partyId: customerId,
          partyName: customerName || 'عميل نقدي',
          amount: effectiveBasePaidAmount,
          paymentMethod: paymentMethod === 'credit' ? 'cash' : (paymentMethod as any),
          accountCode: '1201',
          description: `سند تحصيل فوري لفاتورة مبيعات رقم ${invoiceNumber}`
        };
        setVouchers(prev => [newReceiptVoucher, ...prev]);
      }
    }

    // 3. Accounting journal entries
    if (isAccountingEligible) {
      // Full sales entry in Base Currency
      const journalDebitLines: Array<{
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        description?: string;
      }> = [];

      if (cashBase > 0) {
        const cCode = extraOptions?.cashTreasuryCode || '1101';
        const cAcc = accounts.find(a => a.code === cCode);
        journalDebitLines.push({
          accountCode: cCode,
          accountName: cAcc?.name || 'الصندوق النقدي',
          debit: cashBase,
          credit: 0,
          description: `تحصيل نقدي لفاتورة ${invoiceNumber}`
        });
      }

      if (bankBase > 0) {
        const bCode = extraOptions?.bankTreasuryCode || '1102';
        const bAcc = accounts.find(a => a.code === bCode);
        journalDebitLines.push({
          accountCode: bCode,
          accountName: bAcc?.name || 'البنك / الشبكة',
          debit: bankBase,
          credit: 0,
          description: `تحصيل بنكي / شبكة لفاتورة ${invoiceNumber}`
        });
      }

      if (effectiveBaseRemainingAmount > 0) {
        journalDebitLines.push({
          accountCode: '1201',
          accountName: 'العملاء والذمم المدينة',
          debit: effectiveBaseRemainingAmount,
          credit: 0,
          description: `المتبقي آجل / ذمم لفاتورة ${invoiceNumber}`
        });
      }

      if (journalDebitLines.length === 0) {
        const treasuryCode = extraOptions?.treasuryAccountCode || (paymentMethod === 'cash' ? '1101' : paymentMethod === 'card' ? '1102' : '1201');
        const treasuryAcc = accounts.find(a => a.code === treasuryCode);
        const paymentAccountCode = paymentMethod === 'credit' ? '1201' : treasuryCode;
        const paymentAccountName = paymentMethod === 'credit' ? 'العملاء والذمم المدينة' : (treasuryAcc?.name || 'الصندوق النقدي');
        journalDebitLines.push({
          accountCode: paymentAccountCode,
          accountName: paymentAccountName,
          debit: baseTotalAmount,
          credit: 0,
          description: `تحصيل فاتورة ${paymentMethod === 'credit' ? 'آجل' : 'نقداً/شبكة'} (${transactionCurrencySymbol} ${totalAmount} = ${baseTotalAmount} ₪)`
        });
      }

      addJournalEntry({
        date: today,
        description: `فاتورة مبيعات رقم ${invoiceNumber} - ${customerName || 'كاشير'}${transactionCurrency !== 'ILS' ? ` (${totalAmount} ${transactionCurrencySymbol} @ ${exchangeRate} = ${baseTotalAmount} ₪)` : ''}`,
        referenceType: 'pos_invoice',
        referenceId: invId,
        lines: [
          ...journalDebitLines,
          ...(baseMerchandiseRevenue > 0 ? [{
            accountCode: '4101',
            accountName: 'إيرادات مبيعات المكتبة والقرطاسية',
            debit: 0,
            credit: baseMerchandiseRevenue,
            description: 'صافي مبيعات البضاعة والمطبوعات (محول للشيكل)'
          }] : []),
          ...(baseDeliveryFee > 0 ? [{
            accountCode: '2104',
            accountName: 'أمانات ومستحقات خدمة التوصيل (عمال وشركات التوصيل)',
            debit: 0,
            credit: baseDeliveryFee,
            description: `أمانات ومستحقات خدمة توصيل لعامل التوصيل (خالية المرابح تماماً - ${transactionCurrencySymbol} ${deliveryFeeTotal})`
          }] : []),
          ...(baseTaxAmount > 0 ? [{
            accountCode: '2103',
            accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
            debit: 0,
            credit: baseTaxAmount,
            description: `ضريبة مخرجات ${appliedTaxRate}% (محولة للشيكل)`
          }] : [])
        ]
      });

      // Cost of Goods Sold (COGS) Journal Entry
      if (totalCogs > 0) {
        const roundedCogs = Number(totalCogs.toFixed(2));
        addJournalEntry({
          date: today,
          description: `قيد إثبات تكلفة البضاعة المباعة لفاتورة مبيعات رقم ${invoiceNumber} وتخفيض المخزون`,
          referenceType: 'cogs',
          referenceId: invId,
          lines: [
            {
              accountCode: '5101',
              accountName: 'تكلفة مبيعات القرطاسية والكتب',
              debit: roundedCogs,
              credit: 0,
              description: `تكلفة مبيعات أصناف فاتورة ${invoiceNumber}`
            },
            {
              accountCode: '1301',
              accountName: 'مخزون الكتب والقرطاسية',
              debit: 0,
              credit: roundedCogs,
              description: `صرف مخزني لقيمة البضاعة المباعة بفاتورة ${invoiceNumber}`
            }
          ]
        });
      }

      // Update customer and sub-customer balances
      if (debtAmountToAdd > 0 || newlyCreatedSubParty) {
        setParties(prev => {
          let list = [...prev];
          if (newlyCreatedSubParty) {
            list.push(newlyCreatedSubParty);
          }
          return list.map(p => {
            let updated = { ...p };
            
            // If sub-customer exists, apply debt ONLY to sub-customer. Otherwise, apply to main customer.
            if (resolvedSubCustId) {
              if (p.id === resolvedSubCustId && debtAmountToAdd > 0 && (!newlyCreatedSubParty || newlyCreatedSubParty.id !== p.id)) {
                updated.balance = Number((updated.balance + debtAmountToAdd).toFixed(2));
              }
            } else {
              if (customerId && p.id === customerId && debtAmountToAdd > 0) {
                updated.balance = Number((updated.balance + debtAmountToAdd).toFixed(2));
              }
            }
            
            return updated;
          });
        });
      }
    } else if (!isQuotation && effectiveBasePaidAmount > 0) {
      // Payment received on a non-accounting invoice (advance deposit on design/print order)
      addJournalEntry({
        date: today,
        description: `دفعة مقدمة / عربون لفاتورة قيد التشغيل رقم ${invoiceNumber} - ${customerName || 'كاشير'}`,
        referenceType: 'pos_invoice',
        referenceId: invId,
        lines: [
          ...(cashBase > 0 ? [{
            accountCode: extraOptions?.cashTreasuryCode || '1101',
            accountName: 'الصندوق النقدي',
            debit: cashBase,
            credit: 0,
            description: `قبض نقدي لفاتورة ${invoiceNumber}`
          }] : []),
          ...(bankBase > 0 ? [{
            accountCode: extraOptions?.bankTreasuryCode || '1102',
            accountName: 'البنك / الشبكة',
            debit: bankBase,
            credit: 0,
            description: `قبض بنكي لفاتورة ${invoiceNumber}`
          }] : []),
          {
            accountCode: '1201',
            accountName: 'العملاء والذمم المدينة',
            debit: 0,
            credit: effectiveBasePaidAmount,
            description: `دفعة مقدمة على حساب العميل لفاتورة ${invoiceNumber}`
          }
        ]
      });
    }

    if (extraOptions?.editingInvoiceId) {
      console.log('UPDATING INVOICE', extraOptions.editingInvoiceId);
      setInvoices(prev => prev.map(inv => inv.id === extraOptions.editingInvoiceId ? newInvoice : inv));
    } else {
      console.log('CREATING NEW INVOICE', newInvoice.id);
      setInvoices(prev => [newInvoice, ...prev]);
    }
    
    // Direct immediate cloud save for multi-user synchronization
    setDoc(doc(db, 'invoices', newInvoice.id), cleanDocForFirestore(newInvoice)).catch(err => {
      console.warn('Direct cloud save invoice notice:', err);
    });

    // Telegram Notification - Send ONLY: Name, Item(s), Amount without journal entries or extra info
    try {
      const itemsList = (newInvoice.items || [])
        .map(it => `${it.itemName || (it as any).name || 'صنف'}${it.quantity > 1 ? ` (${it.quantity})` : ''}`)
        .join('، ') || 'بدون أصناف';
      const currencySymbol = newInvoice.currencySymbol || settings.currency || '₪';
      const msg = `🧾 <b>فاتورة مبيعات (${newInvoice.invoiceNumber})</b>\n👤 <b>الاسم:</b> ${newInvoice.customerName || 'عميل نقدي'}\n📦 <b>الصنف:</b> ${itemsList}\n💰 <b>المبلغ:</b> ${newInvoice.totalAmount} ${currencySymbol}`;
      TelegramService.sendMessage(msg, settings);
    } catch(e) {}

    return newInvoice;
  };

  const updateInvoice = (
    id: string,
    updates: Partial<Invoice>,
    statusMeta?: { notes?: string; userName?: string; userId?: string }
  ) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== id) return inv;
      const updated: Invoice = { ...inv, ...updates };

      // Track workflow status change in statusHistory:
      // كل تغيير في حالة الفاتورة يسجل في النظام: المستخدم، التاريخ، الوقت، الحالة السابقة، الحالة الجديدة، الملاحظة
      if (updates.workflowStatus && updates.workflowStatus !== inv.workflowStatus) {
        const prevStatus = inv.workflowStatus || 'new';
        const newStatus = updates.workflowStatus;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });

        const newLogEntry: InvoiceStatusLog = {
          id: 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          userName: statusMeta?.userName || (updates as any).statusChangeUserName || currentUser?.fullName || 'المستخدم',
          userId: statusMeta?.userId || (updates as any).statusChangeUserId || currentUser?.id,
          date: dateStr,
          time: timeStr,
          previousStatus: prevStatus,
          newStatus: newStatus,
          notes: statusMeta?.notes || (updates as any).statusChangeNotes || '',
          createdAt: now.toISOString()
        };

        updated.statusHistory = [
          ...(inv.statusHistory || []),
          newLogEntry
        ];

        // If status changed to delivered, record delivery timestamp and user, and adopt invoice status as delivered
        if (newStatus === 'delivered' || updates.status === 'delivered') {
          updated.deliveredAt = updated.deliveredAt || now.toISOString();
          updated.deliveredBy = updated.deliveredBy || statusMeta?.userName || (updates as any).statusChangeUserName || currentUser?.fullName || 'فني الورشة';
          updated.status = 'delivered'; // يتم اعتماد حالة الفاتورة أنه تم التسليم
          updated.workflowStatus = 'delivered';
        }
      }

      // Recompute payment status if financial fields or paymentMethod are updated
      if (
        updates.paidAmount !== undefined ||
        updates.remainingAmount !== undefined ||
        updates.paymentMethod !== undefined ||
        updates.cashPaidAmount !== undefined ||
        updates.bankPaidAmount !== undefined ||
        updates.paymentStatus !== undefined
      ) {
        updated.paymentStatus = updates.paymentStatus || computeInvoicePaymentStatus({
          paymentMethod: updated.paymentMethod,
          totalAmount: updated.totalAmount,
          paidAmount: updated.paidAmount,
          remainingAmount: updated.remainingAmount,
          cashPaidAmount: updated.cashPaidAmount,
          bankPaidAmount: updated.bankPaidAmount
        });
        updated.status = updated.paymentMethod === 'credit'
          ? 'unpaid'
          : (updated.remainingAmount > 0 ? 'partial' : 'paid');
      }

      // إذا كانت الفاتورة مسلمة يتم دائماً تثبيت واعتماد حالتها كـ تم التسليم
      if (updated.workflowStatus === 'delivered' || updates.status === 'delivered') {
        updated.status = 'delivered';
        updated.workflowStatus = 'delivered';
      }

      // Check transition to accounting eligible status (ready or delivered)
      const becameEligible = !inv.isAccountingPosted && updates.workflowStatus && isInvoiceAccountingEligible(updates.workflowStatus);
      if (becameEligible) {
        updated.isAccountingPosted = true;
        updated.postedAt = new Date().toISOString();

        const today = new Date().toISOString().split('T')[0];
        const movementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

        // 1. Deduct stock movements for physical items
        setInventory(prevInv => prevInv.map(invItem => {
          const sold = inv.items.find(i => i.itemId === invItem.id);
          if (sold && invItem.category !== 'copy_scan') {
            const oldQty = invItem.stockQuantity;
            const newQty = Math.max(0, oldQty - sold.quantity);
            addStockMovement({
              itemId: invItem.id,
              itemCode: invItem.code,
              itemName: invItem.name,
              category: invItem.category,
              date: today,
              time: movementTime,
              type: 'out_sale',
              quantity: sold.quantity,
              balanceBefore: oldQty,
              balanceAfter: newQty,
              unitPrice: invItem.purchasePrice,
              totalValue: sold.quantity * invItem.purchasePrice,
              referenceType: 'pos_invoice',
              referenceNumber: inv.invoiceNumber,
              reason: `اعتماد تسليم فاتورة كاشير (${inv.customerName})`,
              performedBy: inv.representative || 'كاشير'
            });
            return {
              ...invItem,
              stockQuantity: newQty,
              lastMovementDate: today
            };
          }
          return invItem;
        }));

        // 2. Post Sales Journal Entry for unbilled portion
        const exRate = inv.exchangeRate || 1.0;
        const baseNet = Number(((inv.subtotal - inv.discountTotal) * exRate).toFixed(2));
        const baseTax = Number((inv.taxAmount * exRate).toFixed(2));
        const baseRemain = Number((inv.remainingAmount * exRate).toFixed(2));

        if (baseRemain > 0) {
          addJournalEntry({
            date: today,
            description: `ترحيل قيود فاتورة مبيعات رقم ${inv.invoiceNumber} إلى الحسابات (حالة: ${updates.workflowStatus === 'ready' ? 'جاهز للتسليم' : 'تم التسليم'})`,
            referenceType: 'pos_invoice',
            referenceId: inv.id,
            lines: [
              {
                accountCode: '1201',
                accountName: 'العملاء والذمم المدينة',
                debit: baseRemain,
                credit: 0,
                description: `المتبقي آجل / ذمم لفاتورة ${inv.invoiceNumber}`
              },
              {
                accountCode: '4101',
                accountName: 'إيرادات مبيعات المكتبة والقرطاسية',
                debit: 0,
                credit: baseNet,
                description: 'صافي مبيعات الفاتورة (محول للشيكل)'
              },
              ...(baseTax > 0 ? [{
                accountCode: '2103',
                accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
                debit: 0,
                credit: baseTax,
                description: `ضريبة مخرجات (محولة للشيكل)`
              }] : [])
            ]
          });

          // 3. Update customer and sub-customer balance
          setParties(prevParties => prevParties.map(p => {
            let pUpdated = { ...p };
            
            if (inv.subCustomerId) {
              if (p.id === inv.subCustomerId) {
                pUpdated.balance = Number((pUpdated.balance + baseRemain).toFixed(2));
              }
            } else {
              if (inv.customerId && p.id === inv.customerId) {
                pUpdated.balance = Number((pUpdated.balance + baseRemain).toFixed(2));
              }
            }
            
            return pUpdated;
          }));
        }
      }

      // Link invoice workflow status with print & workshop orders
      if (updates.workflowStatus) {
        const mappedPrintStatus: PrintJobOrder['status'] =
          updates.workflowStatus === 'design' || updates.workflowStatus === 'designing' ? 'design'
          : updates.workflowStatus === 'pending_approval' ? 'pending_approval'
          : updates.workflowStatus === 'print_external' || updates.workflowStatus === 'in_progress_external' ? 'in_progress_external'
          : updates.workflowStatus === 'print_internal' || updates.workflowStatus === 'in_progress_internal' || updates.workflowStatus === 'in_progress' ? 'in_progress_internal'
          : updates.workflowStatus === 'ready' ? 'ready'
          : updates.workflowStatus === 'delivered' ? 'delivered'
          : 'new';

        setPrintOrders(pOrders => pOrders.map(po => {
          if (
            (inv.printJobId && po.id === inv.printJobId) ||
            po.associatedInvoiceId === id ||
            po.orderNumber === inv.invoiceNumber
          ) {
            return { ...po, status: mappedPrintStatus };
          }
          return po;
        }));
      }

      // Sync financial collection with linked print order
      if (updates.paidAmount !== undefined || updates.remainingAmount !== undefined) {
        setPrintOrders(pOrders => pOrders.map(po => {
          if (
            (inv.printJobId && po.id === inv.printJobId) ||
            po.associatedInvoiceId === id ||
            po.orderNumber === inv.invoiceNumber
          ) {
            const newDeposit = updates.paidAmount !== undefined ? updates.paidAmount : po.depositPaid;
            const newRemaining = updates.remainingAmount !== undefined ? updates.remainingAmount : Math.max(0, po.totalPrice - newDeposit);
            return {
              ...po,
              depositPaid: newDeposit,
              remainingBalance: newRemaining
            };
          }
          return po;
        }));
      }

      return updated;
    }));

    setTimeout(() => {
      const target = invoices.find(inv => inv.id === id);
      if (target) {
        setDoc(doc(db, 'invoices', id), cleanDocForFirestore({ ...target, ...updates })).catch(err => {
          console.warn('Direct cloud update invoice notice:', err);
        });
      }
    }, 100);
  };

  const deleteInvoice = (id: string, reason?: string) => {
    const target = invoices.find(inv => inv.id === id);
    const now = new Date();
    const nowStr = now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    const deletedSnapshot: Invoice = target ? {
      ...target,
      deletedAt: nowStr,
      deletedBy: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
      deletedByUserId: currentUser?.id,
      deletionReason: reason || 'حذف يدوي من قبل المستخدم'
    } : {
      id,
      invoiceNumber: `INV-${id}`,
      date: new Date().toISOString().split('T')[0],
      customerName: 'عميل',
      type: 'pos',
      items: [],
      subtotal: 0,
      discountTotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
      paymentMethod: 'cash',
      status: 'unpaid',
      deletedAt: nowStr,
      deletedBy: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
      deletionReason: reason || 'حذف يدوي'
    };

    // 1. حفظ في سلة المحذوفات في Firestore
    setDoc(doc(db, 'deletedInvoices', id), cleanDocForFirestore(deletedSnapshot)).catch(err => {
      console.warn('Notice saving to deletedInvoices collection:', err);
    });
    setDeletedInvoices(prev => [deletedSnapshot, ...prev.filter(d => d.id !== id)]);

    // 2. الحذف من الفواتير النشطة في Firestore
    setInvoices(prev => prev.filter(inv => inv.id !== id));
    registerDeletedDoc('invoices', id);
    deleteDoc(doc(db, 'invoices', id)).catch(err => console.warn('Direct cloud delete invoice notice:', err));

    // 3. التوثيق في مجموعة auditLog بقاعدة بيانات Firestore
    try {
      const auditEntry: AuditLogEntry = {
        id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        action: 'delete',
        entityType: 'invoice',
        invoiceId: id,
        invoiceNumber: target?.invoiceNumber || id,
        user: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
        userId: currentUser?.id,
        timestamp: nowStr,
        reason: reason || 'حذف الفاتورة من قبل المستخدم',
        details: target ? {
          customerName: target.customerName,
          totalAmount: target.totalAmount,
          itemsCount: target.items?.length || 0,
          date: target.date
        } : undefined,
        createdAt: now.toISOString()
      };
      setDoc(doc(db, 'auditLog', auditEntry.id), cleanDocForFirestore(auditEntry)).catch(e => {
        console.warn('Notice writing to auditLog collection:', e);
      });
    } catch (e) {
      console.warn('Audit log write exception:', e);
    }
  };

  const restoreDeletedInvoice = async (id: string): Promise<Invoice | null> => {
    const target = deletedInvoices.find(inv => inv.id === id);
    if (!target) return null;

    const cleanRestored: Invoice = { ...target };
    delete cleanRestored.deletedAt;
    delete cleanRestored.deletedBy;
    delete cleanRestored.deletedByUserId;
    delete cleanRestored.deletionReason;

    // 1. حذف من سلة المحذوفات في Firestore
    deleteDoc(doc(db, 'deletedInvoices', id)).catch(() => {});
    setDeletedInvoices(prev => prev.filter(d => d.id !== id));

    // 2. إزالة المعرف من سجل الحذف المحظور
    try {
      const rawDel = localStorage.getItem(`${STORAGE_KEY}_deleted_docs_registry`);
      if (rawDel) {
        const arr = JSON.parse(rawDel);
        if (Array.isArray(arr)) {
          const filtered = arr.filter((x: string) => x !== `invoices_${id}` && x !== id);
          localStorage.setItem(`${STORAGE_KEY}_deleted_docs_registry`, JSON.stringify(filtered));
        }
      }
    } catch {}

    // 3. إعادة الحفظ في الفواتير النشطة في Firestore
    setDoc(doc(db, 'invoices', id), cleanDocForFirestore(cleanRestored)).catch(err => {
      console.warn('Error writing restored invoice to Firestore:', err);
    });
    setInvoices(prev => [cleanRestored, ...prev.filter(i => i.id !== id)]);

    // 4. التوثيق في سجل التدقيق
    try {
      const now = new Date();
      const auditEntry: AuditLogEntry = {
        id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        action: 'restore',
        entityType: 'invoice',
        invoiceId: id,
        invoiceNumber: target.invoiceNumber,
        user: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
        userId: currentUser?.id,
        timestamp: now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        reason: 'استعادة الفاتورة المحذوفة إلى النظام وإلغاء حذفها',
        details: {
          customerName: target.customerName,
          totalAmount: target.totalAmount,
          itemsCount: target.items?.length || 0
        },
        createdAt: now.toISOString()
      };
      setDoc(doc(db, 'auditLog', auditEntry.id), cleanDocForFirestore(auditEntry)).catch(() => {});
    } catch {}

    return cleanRestored;
  };

  const permanentlyDeleteInvoice = async (id: string): Promise<void> => {
    deleteDoc(doc(db, 'deletedInvoices', id)).catch(() => {});
    setDeletedInvoices(prev => prev.filter(d => d.id !== id));
  };

  const getInvoiceDeleteAuditLogs = async (invoiceId: string = '29'): Promise<AuditLogEntry[]> => {
    const searchTarget = (invoiceId || '').trim();
    try {
      const snapshot = await getDocs(collection(db, 'auditLog'));
      const rawLogs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as AuditLogEntry));

      const filtered = rawLogs.filter(log => {
        if (!searchTarget) return true;
        const logInvId = String(log.invoiceId || '').toLowerCase();
        const logInvNum = String(log.invoiceNumber || '').toLowerCase();
        const targetClean = searchTarget.toLowerCase();
        const targetDigits = targetClean.replace(/\D/g, '');

        const matchesExact = logInvId === targetClean || logInvNum === targetClean;
        const matchesContains = logInvId.includes(targetClean) || logInvNum.includes(targetClean);
        const matchesDigits = targetDigits && (logInvId.includes(targetDigits) || logInvNum.includes(targetDigits));

        return matchesExact || matchesContains || matchesDigits;
      });

      filtered.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp).getTime() || 0;
        const timeB = new Date(b.createdAt || b.timestamp).getTime() || 0;
        return timeB - timeA;
      });

      return filtered;
    } catch (err) {
      console.warn('Error querying auditLog collection from Firestore:', err);
      return [];
    }
  };

  const addInvoiceTechnicalNote = (invoiceId: string, text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const newNote: InvoiceTechnicalNote = {
      id: 'tn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      userName: currentUser?.fullName || currentUser?.username || 'فني الورشة',
      userId: currentUser?.id,
      text: text.trim(),
      createdAt: now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      return {
        ...inv,
        technicalNotes: [...(inv.technicalNotes || []), newNote]
      };
    }));
  };

  const addInvoiceItemAttachment = (
    invoiceId: string,
    itemIndexOrId: string | number,
    attachment: LineAttachment
  ) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updatedItems = inv.items.map((item, idx) => {
        const matches = typeof itemIndexOrId === 'number' ? idx === itemIndexOrId : (item.itemId === itemIndexOrId || String(idx) === String(itemIndexOrId));
        if (!matches) return item;
        return {
          ...item,
          attachments: [...(item.attachments || []), attachment]
        };
      });
      return { ...inv, items: updatedItems };
    }));
  };

  const removeInvoiceItemAttachment = (
    invoiceId: string,
    itemIndexOrId: string | number,
    attachmentId: string
  ): { success: boolean; message?: string } => {
    let result = { success: true, message: 'تم حذف المرفق بنجاح' };
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const updatedItems = inv.items.map((item, idx) => {
        const matches = typeof itemIndexOrId === 'number' ? idx === itemIndexOrId : (item.itemId === itemIndexOrId || String(idx) === String(itemIndexOrId));
        if (!matches) return item;
        const targetAttachment = item.attachments?.find(a => a.id === attachmentId);
        if (targetAttachment?.driveFileId) {
          deleteFileFromGoogleDrive(targetAttachment.driveFileId).catch(err => {
            console.warn('Drive deletion note:', err);
          });
        }
        return {
          ...item,
          attachments: (item.attachments || []).filter(a => a.id !== attachmentId)
        };
      });
      return { ...inv, items: updatedItems };
    }));
    return result;
  };

  const startInvoicePrinting = (invoiceId: string) => {
    const now = new Date();
    const nowStr = now.toISOString();
    const user = currentUser?.fullName || currentUser?.username || 'فني الطباعة';
    updateInvoice(
      invoiceId,
      {
        workflowStatus: 'print_internal',
        printStartedAt: nowStr,
        printStartedBy: user
      },
      {
        notes: `بدء أعمال وسحب الطباعة بالورشة بواسطة ${user}`,
        userName: user,
        userId: currentUser?.id
      }
    );
  };

  const finishInvoicePrinting = (invoiceId: string) => {
    const now = new Date();
    const nowStr = now.toISOString();
    const user = currentUser?.fullName || currentUser?.username || 'فني الطباعة';
    updateInvoice(
      invoiceId,
      {
        workflowStatus: 'ready',
        printFinishedAt: nowStr,
        printFinishedBy: user
      },
      {
        notes: `اكتمال أعمال الطباعة والتجهيز - الطلبية جاهزة للتسليم بواسطة ${user}`,
        userName: user,
        userId: currentUser?.id
      }
    );
  };

  const deliverInvoice = (invoiceId: string, notes?: string) => {
    const now = new Date();
    const nowStr = now.toISOString();
    const user = currentUser?.fullName || currentUser?.username || 'فني الورشة';
    updateInvoice(
      invoiceId,
      {
        workflowStatus: 'delivered',
        deliveredAt: nowStr,
        deliveredBy: user
      },
      {
        notes: notes || `اعتماد تسليم الفاتورة للعميل (تم التسليم) وخروجها من شاشة أوامر الورشة بواسطة ${user}`,
        userName: user,
        userId: currentUser?.id
      }
    );
  };

  // Create Print Order
  const createPrintOrder = (orderData: Omit<PrintJobOrder, 'id' | 'orderNumber' | 'createdAt'>): string => {
    const id = 'job-' + Date.now();
    const orderNumber = `JOB-${new Date().getFullYear()}-${String(printOrders.length + 1).padStart(4, '0')}`;
    const today = new Date().toISOString().split('T')[0];

    const newOrder: PrintJobOrder = {
      ...orderData,
      id,
      orderNumber,
      createdAt: today
    };

    setPrintOrders(prev => [newOrder, ...prev]);

    // Save directly to Firestore for real-time multi-user syncing
    setDoc(doc(db, 'printOrders', newOrder.id), cleanDocForFirestore(newOrder)).catch(err => {
      console.warn('Direct cloud save print order notice:', err);
    });

    // If deposit was paid, record journal entry for deposit (skip if already accounted for by an invoice)
    if (orderData.depositPaid > 0 && !orderData.associatedInvoiceId) {
      addJournalEntry({
        date: today,
        description: `عربون أمر طباعة ${orderNumber} - العميل: ${orderData.customerName}`,
        referenceType: 'print_order',
        referenceId: id,
        lines: [
          {
            accountCode: '1101',
            accountName: 'الصندوق النقدي (الكاشير)',
            debit: orderData.depositPaid,
            credit: 0,
            description: `استلام عربون نقدي لأمر شغل ${orderNumber}`
          },
          {
            accountCode: '4102',
            accountName: 'إيرادات أعمال ومطبوعات المطبعة',
            debit: 0,
            credit: orderData.depositPaid,
            description: `إيراد طباعة مقدم`
          }
        ]
      });
    }

    // Update customer balance if order remaining balance exists (skip if already handled by an invoice)
    if (orderData.customerId && orderData.remainingBalance > 0 && !orderData.associatedInvoiceId) {
      setParties(prev => prev.map(p => p.id === orderData.customerId ? { ...p, balance: p.balance + orderData.remainingBalance } : p));
    }

    return id;
  };

  const updatePrintOrder = (id: string, updates: Partial<PrintJobOrder>) => {
    setPrintOrders(prev => prev.map(job => {
      if (job.id !== id) return job;
      const updated = { ...job, ...updates };

      // Link print order status with invoice workflow status
      if (updates.status) {
        const mappedInvoiceWorkflow: PosInvoiceWorkflowStatus =
          updates.status === 'new' ? 'new'
          : updates.status === 'design' ? 'designing'
          : updates.status === 'pending_approval' ? 'pending_approval'
          : updates.status === 'in_progress_external' ? 'in_progress_external'
          : updates.status === 'in_progress_internal' ? 'in_progress_internal'
          : updates.status === 'printing' || updates.status === 'finishing' ? 'in_progress_internal'
          : updates.status === 'ready' ? 'ready'
          : updates.status === 'delivered' ? 'delivered'
          : 'new';

        setInvoices(invs => invs.map(inv => {
          if (
            inv.printJobId === id ||
            inv.id === job.associatedInvoiceId ||
            inv.invoiceNumber === job.orderNumber
          ) {
            if (inv.workflowStatus === mappedInvoiceWorkflow) return inv;
            const now = new Date();
            const logEntry: InvoiceStatusLog = {
              id: 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
              userName: currentUser?.fullName || 'قسم الإنتاج والمطبعة',
              userId: currentUser?.id,
              date: now.toISOString().split('T')[0],
              time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
              previousStatus: inv.workflowStatus || 'new',
              newStatus: mappedInvoiceWorkflow,
              notes: `تحديث آلي من قسم الإنتاج (أمر مطبعة #${job.orderNumber} - حالة: ${updates.status})`,
              createdAt: now.toISOString()
            };
            return {
              ...inv,
              workflowStatus: mappedInvoiceWorkflow,
              statusHistory: [...(inv.statusHistory || []), logEntry]
            };
          }
          return inv;
        }));
      }

      return updated;
    }));

    setTimeout(() => {
      const target = printOrders.find(j => j.id === id);
      if (target) {
        setDoc(doc(db, 'printOrders', id), cleanDocForFirestore({ ...target, ...updates })).catch(err => {
          console.warn('Direct cloud update print order notice:', err);
        });
      }
    }, 100);
  };

  const updatePrintOrderStatus = (id: string, newStatus: PrintJobOrder['status']) => {
    updatePrintOrder(id, { status: newStatus });
  };

  const collectPrintOrderPayment = (id: string, amount: number, paymentMethod: PaymentMethod) => {
    setPrintOrders(prev => prev.map(job => {
      if (job.id === id) {
        const newPaid = job.depositPaid + amount;
        const newRemaining = Math.max(0, job.totalPrice - newPaid);
        const today = new Date().toISOString().split('T')[0];

        // Journal entry for collection
        const paymentAccountCode = paymentMethod === 'cash' ? '1101' : paymentMethod === 'card' ? '1102' : '1102';
        const paymentAccountName = paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

        addJournalEntry({
          date: today,
          description: `تحصيل دفعة أمر طباعة ${job.orderNumber} - العميل: ${job.customerName}`,
          referenceType: 'print_order',
          referenceId: job.id,
          lines: [
            {
              accountCode: paymentAccountCode,
              accountName: paymentAccountName,
              debit: amount,
              credit: 0,
              description: `سداد قيمة أمر الشغل ${job.orderNumber}`
            },
            {
              accountCode: '4102',
              accountName: 'إيرادات أعمال ومطبوعات المطبعة',
              debit: 0,
              credit: amount,
              description: `إيراد مطبوعات مستلم`
            }
          ]
        });

        // Update party balance if customer exists
        if (job.customerId) {
          setParties(pList => pList.map(p => p.id === job.customerId ? { ...p, balance: Math.max(0, p.balance - amount) } : p));
        }

        return {
          ...job,
          depositPaid: newPaid,
          remainingBalance: newRemaining
        };
      }
      return job;
    }));
  };

  const createPurchaseInvoice = (invoiceData: Omit<PurchaseInvoice, 'id' | 'invoiceNumber'>) => {
    const id = 'pur-' + Date.now();
    const invoiceNumber = `PUR-${new Date().getFullYear()}-${String(purchases.length + 1).padStart(4, '0')}`;
    
    // Multi-currency handling for purchases
    const exchangeRate = invoiceData.exchangeRate || 1.0;
    const baseTotalAmount = Number((invoiceData.totalAmount * exchangeRate).toFixed(2));
    const baseSubtotal = Number((invoiceData.subtotal * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((invoiceData.taxAmount * exchangeRate).toFixed(2));
    const basePaidAmount = Number((invoiceData.paidAmount * exchangeRate).toFixed(2));

    const newPur: PurchaseInvoice = {
      ...invoiceData,
      id,
      invoiceNumber,
      currency: invoiceData.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: invoiceData.currencySymbol || settings.currency || '₪',
      exchangeRate,
      baseTotalAmount
    };

    setPurchases(prev => [newPur, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'purchases', newPur.id), cleanDocForFirestore(newPur)).catch(err => {
      console.warn('Direct cloud save purchase notice:', err);
    });

    // Increase inventory (convert unit price to base Shekel if foreign currency was used)
    const purMovementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    setInventory(prev => prev.map(it => {
      const match = invoiceData.items.find(i => i.itemId === it.id);
      if (match) {
        const unitCostInBase = Number((match.unitPrice * exchangeRate).toFixed(2));
        const oldQty = it.stockQuantity;
        const newQty = oldQty + match.quantity;
        addStockMovement({
          itemId: it.id,
          itemCode: it.code,
          itemName: it.name,
          category: it.category,
          date: invoiceData.date,
          time: purMovementTime,
          type: 'in_purchase',
          quantity: match.quantity,
          balanceBefore: oldQty,
          balanceAfter: newQty,
          unitPrice: unitCostInBase,
          totalValue: match.quantity * unitCostInBase,
          referenceType: 'purchase',
          referenceNumber: invoiceNumber,
          reason: `توريد مشتريات من المورد (${invoiceData.supplierName})`,
          performedBy: 'قسم المشتريات'
        });
        const updatedItem = {
          ...it,
          stockQuantity: newQty,
          purchasePrice: unitCostInBase,
          lastMovementDate: invoiceData.date
        };
        setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));

    // Post to Journal in BASE CURRENCY (Palestinian Shekel ₪ / ILS)
    const isPaid = invoiceData.paidAmount >= invoiceData.totalAmount;
    const remainingToSupplier = invoiceData.totalAmount - invoiceData.paidAmount;
    const baseRemainingToSupplier = Number((remainingToSupplier * exchangeRate).toFixed(2));

    const journalLines = [
      {
        accountCode: '1302',
        accountName: 'مخزون خامات وأوراق المطبعة',
        debit: baseSubtotal,
        credit: 0,
        description: `شراء مواد خام ومستلزمات فاتورة ${invoiceNumber}`
      },
      {
        accountCode: '2103',
        accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
        debit: baseTaxAmount,
        credit: 0,
        description: `ضريبة مدخلات مشتريات (محولة للشيكل)`
      }
    ];

    if (basePaidAmount > 0) {
      journalLines.push({
        accountCode: invoiceData.paymentMethod === 'cash' ? '1101' : '1102',
        accountName: invoiceData.paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)',
        debit: 0,
        credit: basePaidAmount,
        description: `سداد قيمة فاتورة مشتريات (بالشيكل)`
      });

      const pTreasuryCode = invoiceData.paymentMethod === 'cash' ? '1101' : '1102';
      adjustTreasuryBalance(
        pTreasuryCode,
        -basePaidAmount,
        `سداد فاتورة مشتريات رقم ${invoiceNumber} للمورد (${invoiceData.supplierName})`,
        'manual',
        id
      );

      const payVoucherId = `vch-pur-${id}`;
      const payVoucherNumber = `PAY-PUR-${invoiceNumber.replace('PUR-', '')}`;
      const newPayVoucher: PaymentVoucher = {
        id: payVoucherId,
        voucherNumber: payVoucherNumber,
        type: 'payment',
        date: invoiceData.date,
        partyId: invoiceData.supplierId,
        partyName: invoiceData.supplierName,
        amount: basePaidAmount,
        paymentMethod: invoiceData.paymentMethod === 'cash' ? 'cash' : 'bank_transfer',
        accountCode: '2101',
        description: `سند صرف وسداد لفاتورة مشتريات رقم ${invoiceNumber}`
      };
      setVouchers(prev => [newPayVoucher, ...prev]);
      setDoc(doc(db, 'vouchers', payVoucherId), cleanDocForFirestore(newPayVoucher)).catch(() => {});
    }

    if (baseRemainingToSupplier > 0) {
      journalLines.push({
        accountCode: '2101',
        accountName: 'الموردون والذمم الدائنة',
        debit: 0,
        credit: baseRemainingToSupplier,
        description: `مستحق لمورد ${invoiceData.supplierName} (محول للشيكل)`
      });

      // Update supplier balance (credit) in BASE CURRENCY
      setParties(prev => prev.map(p => {
        if (p.id === invoiceData.supplierId) {
          const updatedP = { ...p, balance: p.balance - baseRemainingToSupplier };
          setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
          return updatedP;
        }
        return p;
      }));
    }

    addJournalEntry({
      date: invoiceData.date,
      description: `فاتورة مشتريات ${invoiceNumber} من المورد ${invoiceData.supplierName}`,
      referenceType: 'purchase',
      referenceId: id,
      lines: journalLines
    });
  };

  const createPaymentVoucher = (voucherData: Omit<PaymentVoucher, 'id' | 'voucherNumber'>) => {
    const id = 'vch-' + Date.now();
    const prefix = voucherData.type === 'receipt' ? 'RCT' : 'PAY';
    const currentYear = new Date().getFullYear();
    const yearPrefix = `${prefix}-${currentYear}-`;
    let maxSeq = 0;
    vouchers.forEach(v => {
      if (v.voucherNumber && v.voucherNumber.startsWith(yearPrefix)) {
        const seq = parseInt(v.voucherNumber.substring(yearPrefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    let nextSeq = Math.max(vouchers.length + 1, maxSeq + 1);
    let voucherNumber = `${yearPrefix}${String(nextSeq).padStart(4, '0')}`;
    while (vouchers.some(v => v.voucherNumber === voucherNumber)) {
      nextSeq++;
      voucherNumber = `${yearPrefix}${String(nextSeq).padStart(4, '0')}`;
    }

    const curr = voucherData.currency || 'ILS';
    const currInfo = currencies.find(c => c.code === curr);
    const rate = voucherData.exchangeRate !== undefined
      ? voucherData.exchangeRate
      : (curr === 'ILS' ? 1.0 : (currInfo?.rateAgainstBase || 1.0));
    const symbol = voucherData.currencySymbol || (curr === 'ILS' ? '₪' : (currInfo?.symbol || curr));
    const actualAmount = voucherData.amount;
    const baseAmount = voucherData.baseAmount !== undefined
      ? voucherData.baseAmount
      : Number((actualAmount * rate).toFixed(2));

    const newVoucher: PaymentVoucher = {
      ...voucherData,
      id,
      voucherNumber,
      currency: curr,
      currencySymbol: symbol,
      exchangeRate: rate,
      baseAmount
    };

    setVouchers(prev => [newVoucher, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'vouchers', newVoucher.id), cleanDocForFirestore(newVoucher)).catch(err => {
      console.warn('Direct cloud save voucher notice:', err);
    });

    const cashBankCode = voucherData.treasuryAccountCode || (voucherData.paymentMethod === 'cash' ? '1101' : '1102');
    const targetTreasury = treasuries.find(t => t.accountCode === cashBankCode || t.id === cashBankCode);
    const cashBankName = targetTreasury ? targetTreasury.name : (voucherData.paymentMethod === 'cash' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)');
    const effectiveAccountCode = voucherData.accountCode || (voucherData.type === 'receipt' ? '1201' : '2101');

    if (voucherData.type === 'receipt') {
      // Receipt voucher: Debit Cash/Bank, Credit Account / Customer (in base currency ILS)
      addJournalEntry({
        date: voucherData.date,
        description: `سند قبض ${voucherNumber} من ${voucherData.partyName} (${actualAmount.toLocaleString()} ${symbol} معادل ${baseAmount.toLocaleString()} ₪)`,
        referenceType: 'receipt',
        referenceId: id,
        lines: [
          {
            accountCode: cashBankCode,
            accountName: cashBankName,
            debit: baseAmount,
            credit: 0,
            description: voucherData.description || `سند قبض نقدي`
          },
          {
            accountCode: effectiveAccountCode,
            accountName: 'العملاء والذمم المدينة',
            debit: 0,
            credit: baseAmount,
            description: `تسديد من العميل ${voucherData.partyName}`
          }
        ]
      });

      // Update Treasury actual currency balance!
      adjustTreasuryBalance(
        cashBankCode,
        actualAmount,
        `سند قبض ${voucherNumber} من ${voucherData.partyName}`,
        'receipt',
        id,
        {
          currency: curr,
          currencySymbol: symbol,
          exchangeRate: rate,
          voucherNumber,
          partyName: voucherData.partyName,
          date: voucherData.date
        }
      );

      // Decrease customer debit balance (in base currency ILS)
      if (voucherData.partyId) {
        setParties(prev => prev.map(p => {
          if (p.id === voucherData.partyId) {
            const updatedP = { ...p, balance: Number((p.balance - baseAmount).toFixed(2)) };
            setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
            return updatedP;
          }
          return p;
        }));
      }
    } else {
      // Payment voucher: Debit Expense / Supplier, Credit Cash/Bank (in base currency ILS)
      addJournalEntry({
        date: voucherData.date,
        description: `سند صرف ${voucherNumber} إلى ${voucherData.partyName} (${actualAmount.toLocaleString()} ${symbol} معادل ${baseAmount.toLocaleString()} ₪)`,
        referenceType: 'payment',
        referenceId: id,
        lines: [
          {
            accountCode: effectiveAccountCode,
            accountName: effectiveAccountCode.startsWith('5') ? 'مصروفات تشغيلية' : 'الموردون والذمم الدائنة',
            debit: baseAmount,
            credit: 0,
            description: voucherData.description || `سند صرف`
          },
          {
            accountCode: cashBankCode,
            accountName: cashBankName,
            debit: 0,
            credit: baseAmount,
            description: `صرف من ${cashBankName}`
          }
        ]
      });

      // Update Treasury actual currency balance!
      adjustTreasuryBalance(
        cashBankCode,
        -actualAmount,
        `سند صرف ${voucherNumber} إلى ${voucherData.partyName}`,
        'payment',
        id,
        {
          currency: curr,
          currencySymbol: symbol,
          exchangeRate: rate,
          voucherNumber,
          partyName: voucherData.partyName,
          date: voucherData.date
        }
      );

      // If supplier, adjust supplier balance (increases toward 0, reducing debt in ILS)
      if (voucherData.partyId) {
        setParties(prev => prev.map(p => {
          if (p.id === voucherData.partyId) {
            const updatedP = { ...p, balance: Number((p.balance + baseAmount).toFixed(2)) };
            setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
            return updatedP;
          }
          return p;
        }));
      }
    }
  };

  const updatePaymentVoucher = (id: string, updates: Partial<PaymentVoucher>) => {
    let finalVoucher: PaymentVoucher | null = null;
    setVouchers(prev => prev.map(v => {
      if (v.id !== id) return v;
      // Do not allow changing unique voucherNumber
      const { voucherNumber: _ignored, ...allowed } = updates;
      finalVoucher = { ...v, ...allowed };
      return finalVoucher;
    }));
    if (finalVoucher) {
      setDoc(doc(db, 'vouchers', id), cleanDocForFirestore(finalVoucher)).catch(() => {});
    }
  };

  const deletePaymentVoucher = (id: string) => {
    setVouchers(prev => prev.filter(v => v.id !== id));
    registerDeletedDoc('vouchers', id);
    deleteDoc(doc(db, 'vouchers', id)).catch(() => {});
  };

  const deletePurchaseInvoice = (id: string) => {
    setPurchases(prev => prev.filter(p => p.id !== id));
    registerDeletedDoc('purchases', id);
    deleteDoc(doc(db, 'purchases', id)).catch(() => {});
  };

  const createPurchaseReturn = (returnData: Omit<PurchaseReturn, 'id' | 'returnNumber' | 'createdAt'>): PurchaseReturn => {
    const id = 'prn-' + Date.now();
    const returnNumber = `PRN-${new Date().getFullYear()}-${String(purchaseReturns.length + 1).padStart(4, '0')}`;
    const today = returnData.date || new Date().toISOString().split('T')[0];
    const exchangeRate = returnData.exchangeRate || 1.0;
    const baseTotalAmount = Number((returnData.totalAmount * exchangeRate).toFixed(2));
    const baseSubtotal = Number((returnData.subtotal * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((returnData.taxAmount * exchangeRate).toFixed(2));

    const newReturn: PurchaseReturn = {
      ...returnData,
      id,
      returnNumber,
      date: today,
      createdAt: today,
      currency: returnData.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: returnData.currencySymbol || settings.currency || '₪',
      exchangeRate
    };

    setPurchaseReturns(prev => [newReturn, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'purchaseReturns', newReturn.id), cleanDocForFirestore(newReturn)).catch(err => {
      console.warn('Direct cloud save purchase return notice:', err);
    });

    // 1. Deduct stock quantity from inventory (returning goods to supplier)
    const retMovementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    setInventory(prev => prev.map(it => {
      const match = returnData.items.find(i => i.itemId === it.id);
      if (match) {
        const oldQty = it.stockQuantity;
        const newQty = Math.max(0, oldQty - match.quantity);
        addStockMovement({
          itemId: it.id,
          itemCode: it.code,
          itemName: it.name,
          category: it.category,
          date: today,
          time: retMovementTime,
          type: 'out_return',
          quantity: match.quantity,
          balanceBefore: oldQty,
          balanceAfter: newQty,
          unitPrice: it.purchasePrice,
          totalValue: match.quantity * it.purchasePrice,
          referenceType: 'return',
          referenceNumber: returnNumber,
          reason: `مردودات مشتريات إلى المورد (${returnData.supplierName})`,
          performedBy: 'أمين المستودع'
        });
        const updatedItem = {
          ...it,
          stockQuantity: newQty,
          lastMovementDate: today
        };
        setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));

    // 2. Adjust supplier balance or treasury
    const cashBankCode = returnData.settlementType === 'cash_refund' ? '1101' : '1102';
    const cashBankName = returnData.settlementType === 'cash_refund' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

    const journalLines = [
      {
        accountCode: returnData.settlementType === 'credit_balance' ? '2101' : cashBankCode,
        accountName: returnData.settlementType === 'credit_balance' ? 'الموردون والذمم الدائنة' : cashBankName,
        debit: baseTotalAmount,
        credit: 0,
        description: returnData.settlementType === 'credit_balance'
          ? `تخفيض مديونية المورد ${returnData.supplierName} بموجب مردودات مشتريات ${returnNumber}`
          : `استرداد نقدي/بنكي لقيمة مردودات مشتريات ${returnNumber}`
      },
      {
        accountCode: '1302',
        accountName: 'مخزون خامات وأوراق المطبعة',
        debit: 0,
        credit: baseSubtotal,
        description: `رد خامات إلى المورد بموجب مرتجع ${returnNumber}`
      },
      ...(baseTaxAmount > 0 ? [{
        accountCode: '2103',
        accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
        debit: 0,
        credit: baseTaxAmount,
        description: `عكس ضريبة مدخلات مشتريات مردودة`
      }] : [])
    ];

    if (returnData.settlementType === 'credit_balance') {
      // Reduce supplier debt (supplier balance is negative, so adding increases it toward 0)
      setParties(prev => prev.map(p => {
        if (p.id === returnData.supplierId) {
          const updatedP = { ...p, balance: p.balance + baseTotalAmount };
          setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
          return updatedP;
        }
        return p;
      }));
    } else {
      // Refund to cash/bank treasury
      adjustTreasuryBalance(
        returnData.treasuryAccountCode || cashBankCode,
        baseTotalAmount,
        `استرداد مرتجع مشتريات ${returnNumber} من المورد ${returnData.supplierName}`,
        'manual',
        id
      );
    }

    addJournalEntry({
      date: today,
      description: `إشعار مدين / مردودات مشتريات رقم ${returnNumber} للمورد ${returnData.supplierName}`,
      referenceType: 'purchase_return',
      referenceId: id,
      lines: journalLines
    });

    return newReturn;
  };

  const deletePurchaseReturn = (id: string) => {
    setPurchaseReturns(prev => prev.filter(r => r.id !== id));
    registerDeletedDoc('purchaseReturns', id);
    deleteDoc(doc(db, 'purchaseReturns', id)).catch(() => {});
  };

  const createSalesReturn = (returnData: Omit<SalesReturn, 'id' | 'returnNumber' | 'createdAt'>): SalesReturn => {
    const id = 'srn-' + Date.now();
    const returnNumber = `SR-${new Date().getFullYear()}-${String(salesReturns.length + 1).padStart(4, '0')}`;
    const today = returnData.date || new Date().toISOString().split('T')[0];
    const exchangeRate = returnData.exchangeRate || 1.0;
    const baseTotalAmount = Number((returnData.totalAmount * exchangeRate).toFixed(2));
    const baseSubtotal = Number((returnData.subtotal * exchangeRate).toFixed(2));
    const baseTaxAmount = Number((returnData.taxAmount * exchangeRate).toFixed(2));

    const newReturn: SalesReturn = {
      ...returnData,
      id,
      returnNumber,
      date: today,
      createdAt: today,
      currency: returnData.currency || settings.baseCurrencyCode || 'ILS',
      currencySymbol: returnData.currencySymbol || settings.currency || '₪',
      exchangeRate,
      branchId: returnData.branchId || activeBranchId
    };

    setSalesReturns(prev => [newReturn, ...prev]);

    // Direct cloud save
    setDoc(doc(db, 'salesReturns', newReturn.id), cleanDocForFirestore(newReturn)).catch(err => {
      console.warn('Direct cloud save sales return notice:', err);
    });

    // 1. Return stock quantity back to inventory (adding returned goods to stock)
    const retMovementTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    setInventory(prev => prev.map(it => {
      const match = returnData.items.find(i => i.itemId === it.id);
      if (match) {
        const oldQty = it.stockQuantity;
        const newQty = oldQty + match.quantity;
        addStockMovement({
          itemId: it.id,
          itemCode: it.code,
          itemName: it.name,
          category: it.category,
          date: today,
          time: retMovementTime,
          type: 'in_return',
          quantity: match.quantity,
          balanceBefore: oldQty,
          balanceAfter: newQty,
          unitPrice: it.price,
          totalValue: match.quantity * it.price,
          referenceType: 'return',
          referenceNumber: returnNumber,
          reason: `مردودات مبيعات من العميل (${returnData.customerName})`,
          performedBy: currentUser?.fullName || 'الكاشير'
        });
        const updatedItem = {
          ...it,
          stockQuantity: newQty,
          lastMovementDate: today
        };
        setDoc(doc(db, 'inventory', it.id), cleanDocForFirestore(updatedItem)).catch(() => {});
        return updatedItem;
      }
      return it;
    }));

    // 2. Adjust customer balance or refund from treasury
    const cashBankCode = returnData.settlementType === 'cash_refund' ? '1101' : '1102';
    const cashBankName = returnData.settlementType === 'cash_refund' ? 'الصندوق النقدي (الكاشير)' : 'الحساب البنكي (شيكات وحوالات)';

    const journalLines = [
      {
        accountCode: '4101',
        accountName: 'مردودات ومسموحات المبيعات',
        debit: baseSubtotal,
        credit: 0,
        description: `إثبات مردودات مبيعات بموجب مرتجع ${returnNumber} للعميل ${returnData.customerName}`
      },
      ...(baseTaxAmount > 0 ? [{
        accountCode: '2103',
        accountName: 'أمانات ضريبة القيمة المضافة المستحقة (VAT)',
        debit: baseTaxAmount,
        credit: 0,
        description: `عكس ضريبة مخرجات مبيعات مردودة`
      }] : []),
      {
        accountCode: returnData.settlementType === 'credit_balance' ? '1201' : cashBankCode,
        accountName: returnData.settlementType === 'credit_balance' ? 'العملاء والمدينون' : cashBankName,
        debit: 0,
        credit: baseTotalAmount,
        description: returnData.settlementType === 'credit_balance'
          ? `تخفيض مديونية العميل ${returnData.customerName} بموجب إشعار دائن ${returnNumber}`
          : `استرداد نقدي/بنكي للعميل بموجب مرتجع مبيعات ${returnNumber}`
      }
    ];

    if (returnData.settlementType === 'credit_balance') {
      setParties(prev => prev.map(p => {
        if (p.id === returnData.customerId) {
          const updatedP = { ...p, balance: Number((p.balance - baseTotalAmount).toFixed(2)) };
          setDoc(doc(db, 'parties', p.id), cleanDocForFirestore(updatedP)).catch(() => {});
          return updatedP;
        }
        return p;
      }));
    } else {
      adjustTreasuryBalance(
        returnData.treasuryAccountCode || cashBankCode,
        -baseTotalAmount,
        `استرداد مرتجع مبيعات ${returnNumber} للعميل ${returnData.customerName}`,
        'manual',
        id
      );
    }

    addJournalEntry({
      date: today,
      description: `إشعار دائن / مردودات مبيعات رقم ${returnNumber} للعميل ${returnData.customerName}`,
      referenceType: 'sales_return',
      referenceId: id,
      lines: journalLines
    });

    return newReturn;
  };

  const deleteSalesReturn = (id: string) => {
    setSalesReturns(prev => prev.filter(r => r.id !== id));
    registerDeletedDoc('salesReturns', id);
    deleteDoc(doc(db, 'salesReturns', id)).catch(() => {});
  };

  const [lastBackupInfo, setLastBackupInfo] = useState<{ timestamp: string; filename: string } | null>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_last_backup_info`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const exportDataJSON = () => {
    const fullBackup = {
      settings,
      accounts,
      journalEntries,
      inventory,
      stockMovements,
      parties,
      employees,
      employeeAdvances,
      employeeDeductions,
      employeeIncentives,
      payrollSheets,
      printOrders,
      invoices,
      purchases,
      purchaseReturns,
      salesReturns,
      vouchers,
      treasuries,
      companies,
      branches,
      warehouses,
      warehouseOperations,
      roles,
      users,
      debtClearings,
      expenses,
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser?.fullName || currentUser?.username || 'مدير النظام'
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const nowIso = new Date().toISOString();
    const datePart = nowIso.split('T')[0];
    const timePart = nowIso.split('T')[1].replace(/[:.]/g, '-').slice(0, 8);
    const filename = `backup_alnoor_press_${datePart}_${timePart}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    const backupRecord = {
      timestamp: nowIso,
      filename
    };
    setLastBackupInfo(backupRecord);
    try {
      localStorage.setItem(`${STORAGE_KEY}_last_backup_info`, JSON.stringify(backupRecord));
    } catch (e) {
      console.warn('Could not save last_backup_info to localStorage', e);
    }
  };

  const performDatabaseZeroing = (options: DatabaseZeroingOptions): ZeroingExecutionResult => {
    // 1. Restriction to System Admin only ("التصفير مقيد بمدير النظام فقط")
    const isSystemAdmin =
      currentUser?.roleId === 'role-admin' ||
      currentUser?.roleName === 'مدير النظام' ||
      currentUser?.username === 'admin' ||
      (currentUser?.email && auth.currentUser?.email === currentUser.email);

    if (!isSystemAdmin) {
      return {
        success: false,
        message: 'عفواً، عملية تصفير قاعدة البيانات مقيدة بصلاحية مدير النظام فقط!',
        summary: {
          deletedInvoices: 0,
          deletedPurchases: 0,
          deletedSalesReturns: 0,
          deletedPurchaseReturns: 0,
          deletedVouchers: 0,
          deletedJournalEntries: 0,
          deletedPrintOrders: 0,
          deletedStockMovements: 0,
          deletedWarehouseOperations: 0,
          deletedDebtClearings: 0,
          deletedExpenses: 0,
          deletedEmployees: 0,
          deletedPayrollSheets: 0,
          deletedEmployeeAdvances: 0,
          deletedEmployeeDeductions: 0,
          deletedEmployeeIncentives: 0,
          deletedPayrollRecords: 0,
          deletedManualParties: 0,
          zeroedPartyBalances: 0,
          zeroedInventoryStocks: 0,
          deletedManualItems: 0,
          deletedManualWarehouses: 0,
          zeroedTreasuries: 0,
          deletedManualTreasuries: 0,
          zeroedAccounts: 0
        },
        executedAt: new Date().toISOString(),
        executedBy: currentUser?.fullName || currentUser?.username || 'مستخدم'
      };
    }

    const isTargetDate = (dateStr?: string) => {
      if (options.scope === 'all') return true;
      if (!dateStr) return true;
      const clean = dateStr.split('T')[0];
      if (options.scope === 'from_date') {
        return clean >= (options.fromDate || options.cutoffDate);
      }
      if (options.scope === 'date_range') {
        return clean >= (options.fromDate || '1900-01-01') && clean <= options.cutoffDate;
      }
      return clean <= options.cutoffDate;
    };

    const summary = {
      deletedInvoices: 0,
      deletedPurchases: 0,
      deletedSalesReturns: 0,
      deletedPurchaseReturns: 0,
      deletedVouchers: 0,
      deletedJournalEntries: 0,
      deletedPrintOrders: 0,
      deletedStockMovements: 0,
      deletedWarehouseOperations: 0,
      deletedDebtClearings: 0,
      deletedExpenses: 0,
      deletedEmployees: 0,
      deletedPayrollSheets: 0,
      deletedEmployeeAdvances: 0,
      deletedEmployeeDeductions: 0,
      deletedEmployeeIncentives: 0,
      deletedPayrollRecords: 0,
      deletedManualParties: 0,
      zeroedPartyBalances: 0,
      zeroedInventoryStocks: 0,
      deletedManualItems: 0,
      deletedManualWarehouses: 0,
      zeroedTreasuries: 0,
      deletedManualTreasuries: 0,
      zeroedAccounts: 0
    };

    // Track all deleted IDs across collections to purge from Firestore
    const deletedDocMap: Record<string, string[]> = {
      invoices: [],
      purchases: [],
      salesReturns: [],
      purchaseReturns: [],
      vouchers: [],
      journalEntries: [],
      printOrders: [],
      stockMovements: [],
      warehouseOperations: [],
      payrollSheets: [],
      employeeAdvances: [],
      employeeDeductions: [],
      employeeIncentives: [],
      employees: [],
      debtClearings: [],
      expenses: [],
      parties: [],
      inventory: [],
      warehouses: [],
      treasuries: []
    };

    // 1. Invoices (فواتير المبيعات ونقاط البيع)
    if (options.resetInvoices) {
      setInvoices(prev => {
        const toKeep: Invoice[] = [];
        prev.forEach(inv => {
          if (isTargetDate(inv.date)) {
            deletedDocMap.invoices.push(inv.id);
          } else {
            toKeep.push(inv);
          }
        });
        summary.deletedInvoices = deletedDocMap.invoices.length;
        return toKeep;
      });
    }

    // 2. Purchases (فواتير المشتريات ومشتريات الخامات)
    if (options.resetPurchases) {
      setPurchases(prev => {
        const toKeep: PurchaseInvoice[] = [];
        prev.forEach(pur => {
          if (isTargetDate(pur.date)) {
            deletedDocMap.purchases.push(pur.id);
          } else {
            toKeep.push(pur);
          }
        });
        summary.deletedPurchases = deletedDocMap.purchases.length;
        return toKeep;
      });
    }

    // 3. Sales Returns (مردودات المبيعات)
    if (options.resetSalesReturns) {
      setSalesReturns(prev => {
        const toKeep: SalesReturn[] = [];
        prev.forEach(r => {
          if (isTargetDate(r.date)) {
            deletedDocMap.salesReturns.push(r.id);
          } else {
            toKeep.push(r);
          }
        });
        summary.deletedSalesReturns = deletedDocMap.salesReturns.length;
        return toKeep;
      });
    }

    // 4. Purchase Returns (مردودات المشتريات)
    if (options.resetPurchaseReturns) {
      setPurchaseReturns(prev => {
        const toKeep: PurchaseReturn[] = [];
        prev.forEach(r => {
          if (isTargetDate(r.date)) {
            deletedDocMap.purchaseReturns.push(r.id);
          } else {
            toKeep.push(r);
          }
        });
        summary.deletedPurchaseReturns = deletedDocMap.purchaseReturns.length;
        return toKeep;
      });
    }

    // 5. Vouchers (سندات القبض والصرف)
    if (options.resetVouchers) {
      setVouchers(prev => {
        const toKeep: PaymentVoucher[] = [];
        prev.forEach(v => {
          if (isTargetDate(v.date)) {
            deletedDocMap.vouchers.push(v.id);
          } else {
            toKeep.push(v);
          }
        });
        summary.deletedVouchers = deletedDocMap.vouchers.length;
        return toKeep;
      });
    }

    // 6. Journal Entries (قيود اليومية وحركات الحسابات)
    if (options.resetJournalEntries) {
      setJournalEntries(prev => {
        const toKeep: JournalEntry[] = [];
        prev.forEach(je => {
          if (isTargetDate(je.date)) {
            deletedDocMap.journalEntries.push(je.id);
          } else {
            toKeep.push(je);
          }
        });
        summary.deletedJournalEntries = deletedDocMap.journalEntries.length;
        return toKeep;
      });
    }

    // 7. Print Orders (أوامر تشغيل المطبعة والورشة)
    if (options.resetPrintOrders) {
      setPrintOrders(prev => {
        const toKeep: PrintJobOrder[] = [];
        prev.forEach(po => {
          if (isTargetDate(po.createdAt || po.deliveryDate)) {
            deletedDocMap.printOrders.push(po.id);
          } else {
            toKeep.push(po);
          }
        });
        summary.deletedPrintOrders = deletedDocMap.printOrders.length;
        return toKeep;
      });
    }

    // 8. Stock Movements (حركات المخزون: صرف، قبض/توريد، جرد وتعديل، بيع وشراء، تبديل ومناقلات)
    if (options.resetStockMovements) {
      setStockMovements(prev => {
        const toKeep: StockMovement[] = [];
        prev.forEach(sm => {
          if (isTargetDate(sm.date)) {
            deletedDocMap.stockMovements.push(sm.id);
          } else {
            toKeep.push(sm);
          }
        });
        summary.deletedStockMovements = deletedDocMap.stockMovements.length;
        return toKeep;
      });
    }

    // 9. Warehouse Operations (عمليات وأذونات المستودعات)
    if (options.resetWarehouseOperations) {
      setWarehouseOperations(prev => {
        const toKeep: WarehouseOperation[] = [];
        prev.forEach(wo => {
          if (isTargetDate(wo.date)) {
            deletedDocMap.warehouseOperations.push(wo.id);
          } else {
            toKeep.push(wo);
          }
        });
        summary.deletedWarehouseOperations = deletedDocMap.warehouseOperations.length;
        return toKeep;
      });
    }

    // 9.5. Debt Clearings (المقاصات وتسوية الديون)
    if (options.resetDebtClearings !== false) {
      setDebtClearings(prev => {
        const toKeep: DebtClearingRecord[] = [];
        prev.forEach(dc => {
          if (isTargetDate(dc.date || dc.createdAt)) {
            deletedDocMap.debtClearings.push(dc.id);
          } else {
            toKeep.push(dc);
          }
        });
        summary.deletedDebtClearings = deletedDocMap.debtClearings.length;
        return toKeep;
      });
    }

    // 9.6. Expenses & Operating Costs (المصروفات والمصاريف التشغيلية)
    if (options.resetExpenses !== false) {
      setExpenses(prev => {
        const toKeep: ExpenseItem[] = [];
        prev.forEach(exp => {
          if (isTargetDate(exp.date || exp.createdAt)) {
            deletedDocMap.expenses.push(exp.id);
          } else {
            toKeep.push(exp);
          }
        });
        summary.deletedExpenses = deletedDocMap.expenses.length;
        return toKeep;
      });
    }

    // 10. Payroll, Advances, Deductions & Incentives (مسيرات الرواتب، السلف، الخصومات والمكافآت)
    if (options.resetPayroll) {
      setPayrollSheets(prev => {
        const toKeep: PayrollSheet[] = [];
        prev.forEach(ps => {
          if (isTargetDate(ps.createdAt)) {
            deletedDocMap.payrollSheets.push(ps.id);
          } else {
            toKeep.push(ps);
          }
        });
        summary.deletedPayrollSheets = deletedDocMap.payrollSheets.length;
        summary.deletedPayrollRecords += summary.deletedPayrollSheets;
        return toKeep;
      });

      setEmployeeAdvances(prev => {
        const toKeep: EmployeeAdvance[] = [];
        prev.forEach(ea => {
          if (isTargetDate(ea.date)) {
            deletedDocMap.employeeAdvances.push(ea.id);
          } else {
            toKeep.push(ea);
          }
        });
        summary.deletedEmployeeAdvances = deletedDocMap.employeeAdvances.length;
        summary.deletedPayrollRecords += summary.deletedEmployeeAdvances;
        return toKeep;
      });

      setEmployeeDeductions(prev => {
        const toKeep: EmployeeDeduction[] = [];
        prev.forEach(ed => {
          if (isTargetDate(ed.date)) {
            deletedDocMap.employeeDeductions.push(ed.id);
          } else {
            toKeep.push(ed);
          }
        });
        summary.deletedEmployeeDeductions = deletedDocMap.employeeDeductions.length;
        summary.deletedPayrollRecords += summary.deletedEmployeeDeductions;
        return toKeep;
      });

      setEmployeeIncentives(prev => {
        const toKeep: EmployeeIncentive[] = [];
        prev.forEach(ei => {
          if (isTargetDate(ei.date)) {
            deletedDocMap.employeeIncentives.push(ei.id);
          } else {
            toKeep.push(ei);
          }
        });
        summary.deletedEmployeeIncentives = deletedDocMap.employeeIncentives.length;
        summary.deletedPayrollRecords += summary.deletedEmployeeIncentives;
        return toKeep;
      });
    }

    // 10.5. Employees (أسماء وسجلات الموظفين بالكامل)
    if (options.resetEmployees) {
      setEmployees(prev => {
        const toKeep: Employee[] = [];
        prev.forEach(emp => {
          if (isTargetDate(emp.joinDate || emp.createdAt || '2000-01-01')) {
            deletedDocMap.employees.push(emp.id);
          } else {
            toKeep.push(emp);
          }
        });
        summary.deletedEmployees = deletedDocMap.employees.length;
        return toKeep;
      });
    }

    // 11. Parties (العملاء والموردين)
    if (options.resetManualParties || options.zeroPartyBalances) {
      setParties(prev => {
        const kept: Party[] = [];
        prev.forEach(p => {
          // العميل النقدي لا يمسح
          if (p.code === 'CUST-0001' || p.name === 'عميل نقدي' || p.name === 'عميل كاشير نقدي' || p.name === 'زبون عام') {
            kept.push(p);
            return;
          }
          const partyDate = p.openingBalanceDate || (p as any).createdAt || '2000-01-01';
          if (options.resetManualParties && isTargetDate(partyDate)) {
            deletedDocMap.parties.push(p.id);
            summary.deletedManualParties++;
          } else {
            kept.push(p);
          }
        });
        // تصفير المبالغ والذمم المدينة والدائنة
        return kept.map(p => {
          if (options.zeroPartyBalances && p.balance !== 0) summary.zeroedPartyBalances++;
          return options.zeroPartyBalances ? { ...p, balance: 0, openingBalance: 0 } : p;
        });
      });
    }

    // 12. Inventory & Stock Cards (الأصناف والكرتات المخزنية والكميات)
    setInventory(prev => {
      const kept: InventoryItem[] = [];
      prev.forEach(item => {
        const itemDate = item.lastMovementDate || (item as any).createdAt || '2000-01-01';
        if (options.resetManualInventoryItems && isTargetDate(itemDate)) {
          deletedDocMap.inventory.push(item.id);
          summary.deletedManualItems++;
        } else {
          kept.push(item);
        }
      });
      // تصفير كميات المخزون بالكامل في كافة المستودعات
      if (options.zeroInventoryStock) {
        return kept.map(item => {
          if (item.stockQuantity !== 0) summary.zeroedInventoryStocks++;
          return {
            ...item,
            stockQuantity: 0,
            warehouseStocks: {}
          };
        });
      }
      return kept;
    });

    // 13. Warehouses (المستودعات الإضافية)
    setWarehouses(prev => {
      const kept: Warehouse[] = [];
      prev.forEach(w => {
        // المستودع الرئيسي لا يمسح
        if (w.id === 'wh-1' || w.name.includes('الرئيسي') || w.code === 'WH-01') {
          kept.push(w);
          return;
        }
        const wDate = w.createdAt || '2000-01-01';
        if (isTargetDate(wDate)) {
          deletedDocMap.warehouses.push(w.id);
          summary.deletedManualWarehouses++;
        } else {
          kept.push(w);
        }
      });
      return kept;
    });

    // 14. Treasuries (الصناديق والخزنات)
    setTreasuries(prev => {
      const kept: Treasury[] = [];
      prev.forEach(t => {
        // الصندوق النقدي لا يمسح ولكن يصفر
        if (t.id === 'treasury-cash-main' || t.name.includes('النقدي') || t.accountCode === '1101') {
          kept.push(t);
          return;
        }
        const tDate = t.createdAt || '2000-01-01';
        if (isTargetDate(tDate)) {
          deletedDocMap.treasuries.push(t.id);
          summary.deletedManualTreasuries++;
        } else {
          kept.push(t);
        }
      });

      return kept.map(t => {
        if (t.id === 'treasury-cash-main' || t.name.includes('النقدي') || t.accountCode === '1101') {
          summary.zeroedTreasuries++;
          return {
            ...t,
            balance: 0,
            currencyBalances: { ILS: 0, USD: 0, JOD: 0 },
            transactions: []
          };
        }
        return t;
      });
    });

    // 15. Accounts (شجرة الحسابات)
    setAccounts(prev => {
      summary.zeroedAccounts = prev.length;
      return prev.map(a => ({ ...a, balance: 0 }));
    });

    // Execute direct Firestore deletion batch for all removed document IDs & persist cutoffs
    try {
      // 1. Persist in accounting_deleted_docs so any future hydration filters them out permanently
      const existingDel = JSON.parse(localStorage.getItem('accounting_deleted_docs') || '[]');
      for (const [colName, ids] of Object.entries(deletedDocMap)) {
        for (const id of ids) {
          existingDel.push({ col: colName, id: String(id), time: Date.now() });
        }
      }
      localStorage.setItem('accounting_deleted_docs', JSON.stringify(existingDel.slice(-10000)));

      // 2. Persist zeroed cutoffs
      const currentCutoffs = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_zeroed_cutoffs`) || '{}');
      for (const colName of Object.keys(deletedDocMap)) {
        currentCutoffs[colName] = {
          scope: options.scope,
          cutoffDate: options.cutoffDate || new Date().toISOString().split('T')[0],
          timestamp: Date.now()
        };
      }
      localStorage.setItem(`${STORAGE_KEY}_zeroed_cutoffs`, JSON.stringify(currentCutoffs));
    } catch (e) {
      console.warn('Error saving zeroing deleted docs to storage:', e);
    }

    (async () => {
      try {
        let deleteCount = 0;
        let deleteBatch = writeBatch(db);
        const batchPromises: Promise<void>[] = [];

        for (const [colName, ids] of Object.entries(deletedDocMap)) {
          for (const id of ids) {
            deleteBatch.delete(doc(db, colName, String(id)));
            deleteCount++;
            if (deleteCount % 400 === 0) {
              batchPromises.push(deleteBatch.commit());
              deleteBatch = writeBatch(db);
            }
          }
        }
        if (deleteCount % 400 !== 0 && deleteCount > 0) {
          batchPromises.push(deleteBatch.commit());
        }
        await Promise.all(batchPromises);

        // Also query Firestore directly for any collections zeroed with scope === 'all' to delete orphaned documents
        if (options.scope === 'all') {
          for (const colName of ['invoices', 'printOrders', 'salesReturns', 'stockMovements']) {
            try {
              const snap = await getDocs(collection(db, colName));
              if (!snap.empty) {
                let purgeBatch = writeBatch(db);
                let purgeCount = 0;
                for (const d of snap.docs) {
                  purgeBatch.delete(d.ref);
                  purgeCount++;
                  if (purgeCount % 400 === 0) {
                    await purgeBatch.commit();
                    purgeBatch = writeBatch(db);
                  }
                }
                if (purgeCount % 400 !== 0 && purgeCount > 0) {
                  await purgeBatch.commit();
                }
              }
            } catch (err) {
              console.warn(`Purge leftover in ${colName} notice:`, err);
            }
          }
        }
      } catch (err) {
        console.warn('Direct Firestore delete batch note:', err);
      }
    })();

    // Invalidate local synced hashes so Firebase accepts the zeroed state on all collections
    try {
      localStorage.removeItem('accounting_synced_hashes');
      localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
      localStorage.setItem(`${STORAGE_KEY}_last_zeroed_at`, new Date().toISOString());
    } catch (e) {
      console.error('Error updating zeroing storage flags:', e);
    }

    // Trigger immediate cloud synchronization to Firestore
    setTimeout(() => {
      if (syncToFirebaseRef.current) {
        syncToFirebaseRef.current(true).catch(err => {
          console.error('Firebase sync after zeroing failed:', err);
        });
      }
    }, 100);

    return {
      success: true,
      message: 'تم تصفير الأصناف وفواتير المبيعات وكافة العمليات المرتبطة بها بنجاح وتحديث قاعدة البيانات سحابياً ومحلياً.',
      summary,
      executedAt: new Date().toISOString(),
      executedBy: currentUser?.fullName || currentUser?.username || 'مدير النظام'
    };
  };

  const importDataJSON = async (jsonString: string, includeSettings = true, keepTelegramSettings = true, keepFacilitySettings = true): Promise<boolean> => {
    try {
      const data = JSON.parse(jsonString);
      if (data.accounts && data.inventory && data.settings) {
        let finalSettings = { ...settings };
        if (!keepFacilitySettings && data.settings) {
            finalSettings = { ...data.settings };
            if (keepTelegramSettings) {
              finalSettings.telegramConfig = settings.telegramConfig;
            }
            setSettings(finalSettings);
        } else if (keepFacilitySettings && data.settings && keepTelegramSettings === false) {
           finalSettings = { ...settings };
           finalSettings.telegramConfig = data.settings.telegramConfig;
           setSettings(finalSettings);
        }

        if (includeSettings) {
          if (data.roles) setRoles(data.roles);
          if (data.users) setUsers(data.users);
          if (data.companies) setCompanies(data.companies);
          if (data.branches) setBranches(data.branches);
          if (data.warehouses) setWarehouses(data.warehouses);
        }
        if (data.accounts) setAccounts(data.accounts);
        if (data.journalEntries) setJournalEntries(data.journalEntries);
        if (data.inventory) setInventory(data.inventory);
        if (data.stockMovements) setStockMovements(data.stockMovements);
        if (data.parties) setParties(data.parties);
        if (data.employees) setEmployees(data.employees);
        if (data.employeeAdvances) setEmployeeAdvances(data.employeeAdvances);
        if (data.employeeDeductions) setEmployeeDeductions(data.employeeDeductions);
        if (data.employeeIncentives) setEmployeeIncentives(data.employeeIncentives);
        if (data.payrollSheets) setPayrollSheets(data.payrollSheets);
        if (data.printOrders) setPrintOrders(data.printOrders);
        if (data.invoices) setInvoices(data.invoices);
        if (data.purchases) setPurchases(data.purchases);
        if (data.purchaseReturns) setPurchaseReturns(data.purchaseReturns);
        if (data.salesReturns) setSalesReturns(data.salesReturns);
        if (data.vouchers) setVouchers(data.vouchers);
        if (data.debtClearings) setDebtClearings(data.debtClearings);
        if (data.expenses) setExpenses(data.expenses);
        if (data.warehouseOperations) setWarehouseOperations(data.warehouseOperations);
        if (data.treasuries) setTreasuries(data.treasuries);

        // Synchronously write all imported records to localStorage
        localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(finalSettings));
        if (includeSettings) {
          if (data.roles) localStorage.setItem(`${STORAGE_KEY}_roles`, JSON.stringify(data.roles));
          if (data.users) localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(data.users));
          if (data.companies) localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(data.companies));
          if (data.branches) localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(data.branches));
          if (data.warehouses) localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(data.warehouses));
        }

        if (data.accounts) localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(data.accounts));
        if (data.journalEntries) localStorage.setItem(`${STORAGE_KEY}_journals`, JSON.stringify(data.journalEntries));
        if (data.inventory) localStorage.setItem(`${STORAGE_KEY}_inventory`, JSON.stringify(data.inventory));
        if (data.stockMovements) localStorage.setItem(`${STORAGE_KEY}_stockMovements`, JSON.stringify(data.stockMovements));
        if (data.parties) localStorage.setItem(`${STORAGE_KEY}_parties`, JSON.stringify(data.parties));
        if (data.employees) localStorage.setItem(`${STORAGE_KEY}_employees`, JSON.stringify(data.employees));
        if (data.employeeAdvances) localStorage.setItem(`${STORAGE_KEY}_advances`, JSON.stringify(data.employeeAdvances));
        if (data.employeeDeductions) localStorage.setItem(`${STORAGE_KEY}_deductions`, JSON.stringify(data.employeeDeductions));
        if (data.employeeIncentives) localStorage.setItem(`${STORAGE_KEY}_incentives`, JSON.stringify(data.employeeIncentives));
        if (data.payrollSheets) localStorage.setItem(`${STORAGE_KEY}_payrollSheets`, JSON.stringify(data.payrollSheets));
        if (data.printOrders) localStorage.setItem(`${STORAGE_KEY}_printOrders`, JSON.stringify(data.printOrders));
        if (data.invoices) localStorage.setItem(`${STORAGE_KEY}_invoices`, JSON.stringify(data.invoices));
        if (data.purchases) localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(data.purchases));
        if (data.purchaseReturns) localStorage.setItem(`${STORAGE_KEY}_purchaseReturns`, JSON.stringify(data.purchaseReturns));
        if (data.salesReturns) localStorage.setItem(`${STORAGE_KEY}_salesReturns`, JSON.stringify(data.salesReturns));
        if (data.vouchers) localStorage.setItem(`${STORAGE_KEY}_vouchers`, JSON.stringify(data.vouchers));
        if (data.debtClearings) localStorage.setItem(`${STORAGE_KEY}_debt_clearings`, JSON.stringify(data.debtClearings));
        if (data.expenses) localStorage.setItem(`${STORAGE_KEY}_expenses`, JSON.stringify(data.expenses));
        if (data.warehouseOperations) localStorage.setItem(`${STORAGE_KEY}_warehouse_operations`, JSON.stringify(data.warehouseOperations));
        if (data.treasuries) localStorage.setItem(`${STORAGE_KEY}_treasuries`, JSON.stringify(data.treasuries));

        // Clear previous deletion tracking so imported items are never purged
        localStorage.removeItem('accounting_deleted_docs');

        // Direct push to Firestore cloud database in chunked batches
        try {
          const collectionsToPush: Record<string, any[]> = {
            accounts: data.accounts || [],
            treasuries: data.treasuries || [],
            parties: data.parties || [],
            employees: data.employees || [],
            invoices: data.invoices || [],
            purchases: data.purchases || [],
            purchaseReturns: data.purchaseReturns || [],
            salesReturns: data.salesReturns || [],
            vouchers: data.vouchers || [],
            printOrders: data.printOrders || [],
            journalEntries: data.journalEntries || [],
            employeeAdvances: data.employeeAdvances || [],
            employeeDeductions: data.employeeDeductions || [],
            employeeIncentives: data.employeeIncentives || [],
            payrollSheets: data.payrollSheets || [],
            inventory: data.inventory || [],
            stockMovements: data.stockMovements || [],
            debtClearings: data.debtClearings || [],
            expenses: data.expenses || [],
            warehouseOperations: data.warehouseOperations || []
          };

          if (includeSettings) {
            if (data.roles) collectionsToPush.roles = data.roles;
            if (data.users) collectionsToPush.users = data.users;
            if (data.companies) collectionsToPush.companies = data.companies;
            if (data.branches) collectionsToPush.branches = data.branches;
            if (data.warehouses) collectionsToPush.warehouses = data.warehouses;
          }

          const newHashes: Record<string, string> = {};
          let currentBatch = writeBatch(db);
          let opCount = 0;

          for (const [colName, items] of Object.entries(collectionsToPush)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
              if (!item || !item.id) continue;
              const cleanItem = cleanDocForFirestore(item);
              const itemHash = JSON.stringify(cleanItem);
              const hashKey = `${colName}_${item.id}`;
              
              currentBatch.set(doc(db, colName, String(item.id)), cleanItem);
              newHashes[hashKey] = itemHash;
              opCount++;

              if (opCount % 400 === 0) {
                await currentBatch.commit();
                currentBatch = writeBatch(db);
              }
            }
          }

          if (finalSettings) {
            const cleanSettings = cleanDocForFirestore(finalSettings);
            currentBatch.set(doc(db, 'settings', 'global'), cleanSettings);
            newHashes['settings_global'] = JSON.stringify(cleanSettings);
            opCount++;
          }

          if (opCount % 400 !== 0 && opCount > 0) {
            await currentBatch.commit();
          }

          localStorage.setItem('accounting_synced_hashes', JSON.stringify(newHashes));
          localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'false');
          const timeStr = new Date().toLocaleTimeString('en-US');
          setLastFirebaseSyncTime(timeStr);
          setLastSyncTime(timeStr);
          setHasUnsyncedChanges(false);
          setPendingSyncCount(0);
          localStorage.setItem(`${STORAGE_KEY}_last_sync`, timeStr);
        } catch (cloudErr) {
          console.warn('Direct cloud push after import caught notice, marking for sync:', cloudErr);
          localStorage.setItem(`${STORAGE_KEY}_has_unsynced`, 'true');
        }

        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const resetAllData = () => {
    if (window.confirm('هل أنت متأكد من إعادة ضبط البرنامج للبيانات الافتراضية؟ سيتم استرجاع السجلات الأصلية.')) {
      setSettings(initialSettings);
      setAccounts(initialAccounts);
      setJournalEntries(initialJournalEntries);
      setInventory(initialInventory);
      setStockMovements(initialStockMovements);
      setParties(initialParties);
      setEmployees(initialEmployees);
      setEmployeeAdvances(initialEmployeeAdvances);
      setEmployeeDeductions(initialEmployeeDeductions);
      setEmployeeIncentives(initialEmployeeIncentives);
      setPayrollSheets(initialPayrollSheets);
      setPrintOrders(initialPrintOrders);
      setInvoices(initialInvoices);
      setPurchases(initialPurchases);
      setPurchaseReturns(initialPurchaseReturns);
      setSalesReturns(initialSalesReturns);
      setVouchers(initialVouchers);
      setDebtClearings([]);
      setExpenses(initialExpenses);
      // Reset users and roles
      setRoles(DEFAULT_ROLES);
      setUsers(DEFAULT_SYSTEM_USERS);
      const hashes = localStorage.getItem('accounting_synced_hashes');
      localStorage.clear();
      if (hashes) {
        localStorage.setItem('accounting_synced_hashes', hashes);
      }
      setTimeout(() => {
         if (syncToFirebaseRef.current) {
            syncToFirebaseRef.current(true);
         }
      }, 500);
    }
  };

  // Calculate live stats
  const cashAcc = accounts.find(a => a.code === '1101');
  const bankAcc = accounts.find(a => a.code === '1102');
  const customerAcc = accounts.find(a => a.code === '1201');
  const supplierAcc = accounts.find(a => a.code === '2101');

  const totalRevAccs = accounts.filter(a => a.type === 'revenue').reduce((acc, a) => acc + a.balance, 0);
  const totalExpAccs = accounts.filter(a => a.type === 'expense').reduce((acc, a) => acc + a.balance, 0);

  const printRevAcc = accounts.find(a => a.code === '4102')?.balance || 0;
  const bookRevAcc = (accounts.find(a => a.code === '4101')?.balance || 0) + (accounts.find(a => a.code === '4103')?.balance || 0);

  const inventoryTotalValue = inventory.reduce((acc, it) => acc + (it.stockQuantity * it.purchasePrice), 0);
  const lowStockCount = inventory.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity).length;
  const pendingPrintJobs = invoices.filter(inv => {
    if (inv.workflowStatus === 'delivered' || inv.status === 'delivered' || inv.workflowStatus === 'completed') return false;
    const s = inv.workflowStatus;
    return s === 'design' || s === 'designing' || s === 'pending_approval' || s === 'print_external' || s === 'in_progress_external' || s === 'print_internal' || s === 'in_progress_internal' || s === 'in_progress' || s === 'printing' || s === 'finishing' || s === 'ready';
  }).length;

  const activeEmployees = employees.filter(e => e.status === 'active');
  const estimatedMonthlyPayroll = activeEmployees.reduce((sum, e) => {
    const totalWage = (e.salaryAmount || 0) + (e.allowances || 0);
    if (e.salaryType === 'monthly') return sum + totalWage;
    if (e.salaryType === 'weekly') return sum + Math.round(totalWage * 4.33);
    if (e.salaryType === 'daily') return sum + Math.round(totalWage * 26);
    return sum + totalWage;
  }, 0);

  const pendingAdvancesTotal = employeeAdvances.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0);
  const pendingDeductionsTotal = employeeDeductions.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount, 0);
  const pendingIncentivesTotal = employeeIncentives.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
  const exceededCreditLimitCount = parties.filter(p => p.type !== 'supplier' && p.creditLimit && p.balance > p.creditLimit).length;

  const todayIsoDate = new Date().toISOString().split('T')[0];
  const todaySales = invoices
    .filter(inv => inv?.date && inv.date.startsWith(todayIsoDate))
    .reduce((sum, inv) => sum + (inv.totalAmount || (inv as any).total || 0), 0);

  const stats = {
    totalRevenue: totalRevAccs,
    printRevenue: printRevAcc,
    bookstoreRevenue: bookRevAcc,
    netProfit: totalRevAccs - totalExpAccs,
    cashBalance: cashAcc ? cashAcc.balance : 0,
    bankBalance: bankAcc ? bankAcc.balance : 0,
    customerReceivables: customerAcc ? customerAcc.balance : 0,
    supplierPayables: supplierAcc ? supplierAcc.balance : 0,
    inventoryTotalValue: Math.round(inventoryTotalValue),
    pendingPrintJobs,
    lowStockCount,
    totalEmployeesCount: employees.length,
    activeEmployeesCount: activeEmployees.length,
    estimatedMonthlyPayroll,
    pendingAdvancesTotal,
    pendingDeductionsTotal,
    pendingIncentivesTotal,
    payrollSheetsCount: payrollSheets.length,
    draftPayrollSheetsCount: payrollSheets.filter(s => s.status === 'draft').length,
    totalTreasuriesBalance: treasuries.reduce((sum, t) => sum + (t.balance || 0), 0),
    treasuriesCount: treasuries.length,
    exceededCreditLimitCount,
    purchaseReturnsCount: purchaseReturns.length,
    salesReturnsCount: salesReturns.length,
    todaySales
  };

  return (
    <AccountingContext.Provider
      value={{
        settings,
        updateSettings,
        accounts,
        addAccount,
        updateAccount,
        treasuries,
        addTreasury,
        updateTreasury,
        deleteTreasury,
        transferBetweenTreasuries,
        depositIntoTreasury,
        withdrawFromTreasury,
        executeTreasuryOperation,
        adjustTreasuryBalance,
        journalEntries,
        addJournalEntry,
        inventory,
        addInventoryItem,
        deleteInventoryItem,
        updateInventoryItem,
        adjustStock,
        stockMovements,
        addStockMovement,
        parties,
        addParty,
        updateParty,
        deleteParty,
        selectedPartyForStatement,
        setSelectedPartyForStatement,
        selectedEmployeeForStatement,
        setSelectedEmployeeForStatement,
        debtClearings,
        addDebtClearing,
        updateDebtClearing,
        deleteDebtClearing,
        expenses,
        addExpense,
        deleteExpense,
        employees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        payEmployeeSalary,
        employeeAdvances,
        addEmployeeAdvance,
        cancelEmployeeAdvance,
        employeeDeductions,
        addEmployeeDeduction,
        cancelEmployeeDeduction,
        employeeIncentives,
        addEmployeeIncentive,
        cancelEmployeeIncentive,
        payrollSheets,
        createDraftPayrollSheet,
        updateDraftPayrollSheet,
        deleteDraftPayrollSheet,
        approveAndDisbursePayrollSheet,
        unapprovePayrollSheet,
        selectedPayrollSheetForPrint,
        setSelectedPayrollSheetForPrint,
        printOrders,
        createPrintOrder,
        updatePrintOrderStatus,
        updatePrintOrder,
        collectPrintOrderPayment,
        invoices,
        createPosSale,
        updateInvoice,
        deleteInvoice,
        deletedInvoices,
        restoreDeletedInvoice,
        permanentlyDeleteInvoice,
        getInvoiceDeleteAuditLogs,
        addInvoiceTechnicalNote,
        addInvoiceItemAttachment,
        removeInvoiceItemAttachment,
        startInvoicePrinting,
        finishInvoicePrinting,
        deliverInvoice,
        purchases,
        createPurchaseInvoice,
        deletePurchaseInvoice,
        selectedPurchaseForPrint,
        setSelectedPurchaseForPrint,
        purchaseReturns,
        createPurchaseReturn,
        deletePurchaseReturn,
        selectedReturnForPrint,
        setSelectedReturnForPrint,
        salesReturns,
        createSalesReturn,
        deleteSalesReturn,
        selectedSalesReturnForPrint,
        setSelectedSalesReturnForPrint,
        vouchers,
        createPaymentVoucher,
        updatePaymentVoucher,
        deletePaymentVoucher,
        selectedVoucherForPrint,
        setSelectedVoucherForPrint,
        currencies,
        updateCurrencies,
        updateCurrencyRate,
        fetchLiveRates,
        sqlServerConfig,
        updateSqlServerConfig,
        generateSqlBackup,
        downloadSqlBackup,
        syncToServer,
        isOnline,
        lastSyncTime,
        isFirebaseSyncing,
        lastFirebaseSyncTime,
        hasUnsyncedChanges,
        pendingSyncCount,
        lastLocalSaveTime,
        syncToFirebase,
        forceSyncNow,
        activeTab,
        setActiveTab,
        goBack,
        canGoBack,
        editingPosInvoiceId,
        setEditingPosInvoiceId,
        selectedInvoiceForPrint,
        setSelectedInvoiceForPrint,
        directPrintOptions,
        setDirectPrintOptions,
        selectedInvoiceForLifecycle,
        setSelectedInvoiceForLifecycle,
        selectedJobForPrint,
        setSelectedJobForPrint,
        lastBackupInfo,
        exportDataJSON,
        importDataJSON,
        resetAllData,
        performDatabaseZeroing,
        companies,
        activeCompanyId,
        setActiveCompanyId,
        addCompany,
        updateCompany,
        deleteCompany,
        branches,
        activeBranchId,
        setActiveBranchId,
        addBranch,
        updateBranch,
        deleteBranch,
        getActiveBranch,
        warehouses,
        activeWarehouseId,
        setActiveWarehouseId,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        getWarehousesForBranch,
        getWarehouseStock,
        warehouseOperations,
        addWarehouseOperation,
        roles,
        addRole,
        updateRole,
        deleteRole,
        users,
        currentUserId,
        setCurrentUserId,
        currentUser,
        getCurrentUser,
        addUser,
        updateUser,
        deleteUser,
        hasPermission,
        canAccessBranch,
        getAllowedBranchesForUser,
        getItemPriceForCustomer,
        getCurrentUserPricePolicy,
        dailyEntrySheets,
        getDailyEntrySheet,
        saveDailyEntrySheet,
        saveDailyEntryRow,
        deleteDailyEntrySheet,
        getAllDailyEntryDates,
        markDailyEntryRowsApproved,
        acquireDailyEntryRowLock,
        releaseDailyEntryRowLock,
        forceReleaseDailyEntryRowLock,
        stats
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return context;
};
