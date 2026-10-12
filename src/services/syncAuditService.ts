// Sync Audit and Transfer Tracking Service
// سجل وتدقيق تفاصيل المزامنة والربط مع السيرفر الرئيسي

export interface SyncAuditItem {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  direction: 'push' | 'pull' | 'full_sync' | 'check';
  directionLabel: string;
  entity: string;
  entityLabel: string;
  op: 'upsert' | 'delete' | 'sync' | 'ping';
  opLabel: string;
  status: 'success' | 'failed' | 'pending';
  documentId?: string;
  documentNumber?: string;
  details: string;
  seq?: number;
}

export interface SyncConnectionIssue {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  endpoint: string;
  errorType: 'network_offline' | 'connection_refused' | 'server_error' | 'timeout' | 'other';
  errorTypeLabel: string;
  message: string;
  statusCode?: number;
  recoveryNote: string;
}

const STORAGE_KEY_AUDIT = 'lobnan_accounting_sync_audit_logs_v1';
const STORAGE_KEY_ISSUES = 'lobnan_accounting_sync_connection_issues_v1';
const MAX_LOG_COUNT = 300;

export const ENTITY_ARABIC_NAMES: Record<string, string> = {
  invoices: 'فواتير المبيعات',
  parties: 'العملاء والجهات',
  inventory: 'الأصناف والمخزون',
  vouchers: 'سندات القبض والصرف',
  printOrders: 'أوامر وتشغيل الطباعة',
  purchases: 'فواتير المشتريات',
  purchaseReturns: 'مرتجع المشتريات',
  salesReturns: 'مرتجع المبيعات',
  accounts: 'شجرة ودليل الحسابات',
  treasuries: 'الصناديق والخزائن',
  employees: 'الموظفون والعاملين',
  employeeAdvances: 'سلف الموظفين',
  employeeDeductions: 'استقطاعات الموظفين',
  employeeIncentives: 'حوافز ومكافآت الموظفين',
  payrollSheets: 'مسيرات الرواتب',
  stockMovements: 'حركات المخزون',
  companies: 'الشركات',
  branches: 'الفروع',
  warehouses: 'المستودعات والمخازن',
  warehouseOperations: 'عمليات المستودعات',
  roles: 'الأدوار والصلاحيات',
  users: 'المستخدمون',
  debtClearings: 'مقاصة الذمم',
  expenses: 'المصروفات',
  journalEntries: 'قيود اليومية',
  settings: 'إعدادات النظام',
  dailyEntrySheets: 'كشف الإدخال اليومي'
};

export const syncAuditService = {
  // Get all recorded sync logs
  getAuditLogs: (): SyncAuditItem[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_AUDIT);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  },

  // Record a synchronization event (push or pull)
  logEvent: (item: Omit<SyncAuditItem, 'id' | 'timestamp' | 'date' | 'time' | 'directionLabel' | 'opLabel' | 'entityLabel'>) => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('ar-SA');

      const directionLabel =
        item.direction === 'push'
          ? 'نقل وإرسال للسيرفر ➡️'
          : item.direction === 'pull'
          ? 'جلب واستيعاب من السيرفر ⬅️'
          : item.direction === 'full_sync'
          ? 'مزامنة شاملة ثنائية 🔄'
          : 'فحص الاتصال 🩺';

      const opLabel =
        item.op === 'upsert'
          ? 'إضافة / تعديل'
          : item.op === 'delete'
          ? 'حذف'
          : item.op === 'sync'
          ? 'مطابقة بيانات'
          : 'فحص استجابة';

      const entityLabel = ENTITY_ARABIC_NAMES[item.entity] || item.entity;

      const newEntry: SyncAuditItem = {
        id: 'sync-ev-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: now.toISOString(),
        date: dateStr,
        time: timeStr,
        directionLabel,
        opLabel,
        entityLabel,
        ...item
      };

      const existing = syncAuditService.getAuditLogs();
      const updated = [newEntry, ...existing].slice(0, MAX_LOG_COUNT);
      localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(updated));
    } catch {}
  },

  // Get all recorded connection issues
  getConnectionIssues: (): SyncConnectionIssue[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ISSUES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  },

  // Record a connection issue or sync failure
  logIssue: (issue: {
    endpoint: string;
    errorType: 'network_offline' | 'connection_refused' | 'server_error' | 'timeout' | 'other';
    message: string;
    statusCode?: number;
    recoveryNote?: string;
  }) => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('ar-SA');

      const errorTypeLabel =
        issue.errorType === 'network_offline'
          ? 'انقطاع الإنترنت / غير متصل'
          : issue.errorType === 'connection_refused'
          ? 'تعذر الوصول للمنفذ / السيرفر مغلق'
          : issue.errorType === 'server_error'
          ? 'استجابة خطأ من السيرفر'
          : issue.errorType === 'timeout'
          ? 'مهلة الانتظار انتهت (بطء الاستجابة)'
          : 'خطأ اتصال عام';

      const recoveryNote = issue.recoveryNote || 'تم حفظ الحركة محلياً بنجاح في الذاكرة وسيتم إرسالها تلقائياً عند توفر السيرفر.';

      const newIssue: SyncConnectionIssue = {
        id: 'issue-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: now.toISOString(),
        date: dateStr,
        time: timeStr,
        errorTypeLabel,
        recoveryNote,
        ...issue
      };

      const existing = syncAuditService.getConnectionIssues();
      const updated = [newIssue, ...existing].slice(0, MAX_LOG_COUNT);
      localStorage.setItem(STORAGE_KEY_ISSUES, JSON.stringify(updated));
    } catch {}
  },

  // Clear audit log
  clearAuditLogs: () => {
    try {
      localStorage.removeItem(STORAGE_KEY_AUDIT);
    } catch {}
  },

  // Clear connection issues
  clearConnectionIssues: () => {
    try {
      localStorage.removeItem(STORAGE_KEY_ISSUES);
    } catch {}
  }
};
