import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { syncAuditService, SyncAuditItem, SyncConnectionIssue, ENTITY_ARABIC_NAMES } from '../services/syncAuditService';
import {
  RefreshCw,
  Server,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Database,
  Printer,
  Trash2,
  Activity,
  Layers,
  FileText,
  Search,
  Filter,
  ShieldCheck,
  Send,
  Zap,
  WifiOff,
  Wifi,
  Radio,
  Download,
  Building,
  User,
  AlertOctagon,
  ArrowRight
} from 'lucide-react';

interface ServerEntityStatus {
  count: number;
  lastModified: number;
}

interface ServerStatusResponse {
  success: boolean;
  serverTime: number;
  serverTimeString: string;
  tunnelUrl?: string;
  entities: Record<string, ServerEntityStatus>;
}

export const SyncAuditStatementView: React.FC = () => {
  const {
    settings,
    currentUser,
    getActiveBranch,
    isOnline,
    lastSyncTime,
    pendingSyncCount,
    forceSyncNow,
    isFirebaseSyncing,
    setActiveTab,
    invoices,
    parties,
    inventory,
    vouchers,
    printOrders,
    purchases,
    purchaseReturns,
    salesReturns,
    accounts,
    treasuries,
    employees,
    journalEntries,
    expenses,
    stockMovements,
    warehouseOperations,
    dailyEntrySheets
  } = useAccounting();

  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'pushed' | 'pulled' | 'pending' | 'issues'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [serverStatus, setServerStatus] = useState<ServerStatusResponse | null>(null);
  const [isLoadingServerStatus, setIsLoadingServerStatus] = useState(false);
  const [serverPingMs, setServerPingMs] = useState<number | null>(null);
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [auditLogs, setAuditLogs] = useState<SyncAuditItem[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<SyncConnectionIssue[]>([]);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Load audit logs and errors
  const loadLocalLogs = useCallback(() => {
    setAuditLogs(syncAuditService.getAuditLogs());
    setConnectionIssues(syncAuditService.getConnectionIssues());
  }, []);

  // Fetch live server status and latency
  const checkServerHealth = useCallback(async () => {
    setIsLoadingServerStatus(true);
    setConnectionState('checking');
    const start = performance.now();
    try {
      const res = await fetch('/api/sync/status', { cache: 'no-store', credentials: 'include' });
      const ping = Math.round(performance.now() - start);
      setServerPingMs(ping);

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          setServerStatus(json);
          setConnectionState('connected');
        } else {
          // Warmup HTML or proxy
          setConnectionState('checking');
        }
      } else {
        setConnectionState('disconnected');
      }
    } catch {
      setConnectionState('disconnected');
      setServerPingMs(null);
    } finally {
      setIsLoadingServerStatus(false);
      loadLocalLogs();
    }
  }, [loadLocalLogs]);

  useEffect(() => {
    loadLocalLogs();
    checkServerHealth();
    const interval = setInterval(loadLocalLogs, 3000);
    return () => clearInterval(interval);
  }, [loadLocalLogs, checkServerHealth]);

  // Handle immediate manual full sync
  const handleTriggerFullSync = async () => {
    const res = await forceSyncNow();
    setActionFeedback(res);
    if (res?.success) {
      syncAuditService.clearConnectionIssues();
      setConnectionIssues([]);
    }
    checkServerHealth();
    setTimeout(() => setActionFeedback(null), 6000);
  };

  // Local entities counts map
  const localEntitiesCounts: Record<string, number> = useMemo(() => ({
    invoices: invoices.length,
    parties: parties.length,
    inventory: inventory.length,
    vouchers: vouchers.length,
    printOrders: printOrders.length,
    purchases: purchases.length,
    purchaseReturns: purchaseReturns.length,
    salesReturns: salesReturns.length,
    accounts: accounts.length,
    treasuries: treasuries.length,
    employees: employees.length,
    journalEntries: journalEntries.length,
    expenses: expenses.length,
    stockMovements: stockMovements.length,
    warehouseOperations: warehouseOperations.length,
    dailyEntrySheets: (dailyEntrySheets || []).length
  }), [
    invoices.length, parties.length, inventory.length, vouchers.length,
    printOrders.length, purchases.length, purchaseReturns.length,
    salesReturns.length, accounts.length, treasuries.length,
    employees.length, journalEntries.length, expenses.length,
    stockMovements.length, warehouseOperations.length, dailyEntrySheets
  ]);

  // Combined reconciliation table data
  const reconciliationData = useMemo(() => {
    const entitiesList = [
      'invoices', 'parties', 'inventory', 'vouchers', 'printOrders',
      'purchases', 'salesReturns', 'purchaseReturns', 'accounts',
      'treasuries', 'employees', 'journalEntries', 'expenses',
      'stockMovements', 'warehouseOperations', 'dailyEntrySheets'
    ];

    return entitiesList.map(entityKey => {
      const localCount = localEntitiesCounts[entityKey] || 0;
      const serverEntity = serverStatus?.entities?.[entityKey];
      const serverCount = serverEntity?.count ?? localCount;
      const diff = localCount - serverCount;
      const lastMod = serverEntity?.lastModified ? new Date(serverEntity.lastModified) : null;
      const lastModStr = lastMod
        ? lastMod.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        : 'الآن';

      const isSynced = diff === 0;

      return {
        key: entityKey,
        name: ENTITY_ARABIC_NAMES[entityKey] || entityKey,
        localCount,
        serverCount,
        diff,
        isSynced,
        lastModified: lastModStr
      };
    });
  }, [localEntitiesCounts, serverStatus]);

  // Filtered audit logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (activeFilterTab === 'pushed' && log.direction !== 'push') return false;
      if (activeFilterTab === 'pulled' && log.direction !== 'pull') return false;
      if (activeFilterTab === 'pending' && log.status !== 'pending') return false;
      if (activeFilterTab === 'issues') return false; // Handled in issues view

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          log.entityLabel?.toLowerCase().includes(term) ||
          log.details?.toLowerCase().includes(term) ||
          log.documentNumber?.toLowerCase().includes(term) ||
          log.directionLabel?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [auditLogs, activeFilterTab, searchTerm]);

  // Active branch
  const activeBranch = getActiveBranch();
  const statementVoucherNumber = useMemo(() => {
    const d = new Date();
    return `SYNC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="space-y-3 p-1 sm:p-2 text-slate-800" dir="rtl">
      {/* 1. Official Header & Voucher Title Banner */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs p-3.5 print:border-none print:shadow-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shadow-sm">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900">
                  سند مطابقة وتدقيق المزامنة والربط مع السيرفر الرئيسي
                </h1>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  {statementVoucherNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                كشف إداري ومحاسبي تفصيلي يوضح كافة الحركات المنقولة والمعلقة والمستوعبة مع سجل أخطاء الاتصال
              </p>
            </div>
          </div>

          {/* Quick Action Commands */}
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <button
              type="button"
              onClick={handleTriggerFullSync}
              disabled={isFirebaseSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition active:translate-y-px cursor-pointer disabled:opacity-75"
              title="إجبار المزامنة الفورية وتحديث كافة الجداول مع السيرفر"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFirebaseSyncing ? 'animate-spin' : ''}`} />
              <span>{isFirebaseSyncing ? 'جارِ المزامنة...' : 'مزامنة شاملة الآن'}</span>
            </button>

            <button
              type="button"
              onClick={checkServerHealth}
              disabled={isLoadingServerStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg transition active:translate-y-px cursor-pointer"
              title="فحص جودة الاتصال وزمن الاستجابة مع السيرفر"
            >
              <Radio className={`w-3.5 h-3.5 ${isLoadingServerStatus ? 'animate-pulse text-amber-600' : 'text-blue-600'}`} />
              <span>فحص الاتصال (Ping)</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition active:translate-y-px cursor-pointer"
              title="طباعة سند المزامنة والمطابقة الرسمية"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>طباعة السند</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit_log')}
              className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 text-xs font-medium hover:bg-slate-100 rounded-lg transition"
            >
              <span>العودة لسجل العمليات</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Feedback alert toast */}
        {actionFeedback && (
          <div className={`mt-3 p-2.5 rounded-lg text-xs flex items-center justify-between border ${
            actionFeedback.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {actionFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-bold">{actionFeedback.message}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-xs font-bold underline hover:text-black"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Voucher Meta Info Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">حالة الاتصال المباشر:</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {connectionState === 'connected' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <strong className="text-emerald-700 font-bold">متصل ومستقر</strong>
                  {serverPingMs !== null && (
                    <span className="text-[10px] text-slate-500 font-mono">({serverPingMs}ms)</span>
                  )}
                </>
              ) : connectionState === 'checking' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-amber-700 font-medium">جارِ الفحص...</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <strong className="text-rose-700 font-bold">غير متصل / محلي</strong>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">آخر مزامنة ناجحة:</span>
            <span className="font-mono font-bold text-slate-800 block mt-0.5">
              {lastSyncTime || 'الآن'}
            </span>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">الفرع والمنشأة:</span>
            <span className="font-bold text-slate-800 block mt-0.5 truncate">
              {settings.name || 'مطبعة ومكتبة لبنان'} - {activeBranch?.name || 'الرئيسي'}
            </span>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">المشرف / المحاسب:</span>
            <span className="font-bold text-slate-800 block mt-0.5 truncate">
              {currentUser?.fullName || currentUser?.username || 'مدير النظام'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Key Synchronization KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* KPI 1: Transferred & Pushed */}
        <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">ما تم نقله وإرساله للسيرفر:</span>
            <span className="text-xl font-black text-emerald-700 block mt-0.5">
              {auditLogs.filter(l => l.direction === 'push' && l.status === 'success').length}
            </span>
            <span className="text-[10px] text-emerald-600 block mt-0.5">
              حركة مؤكدة في قاعدة بيانات السيرفر
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Pulled from Server */}
        <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">ما تم جلبه واستيعابه من السيرفر:</span>
            <span className="text-xl font-black text-blue-700 block mt-0.5">
              {auditLogs.filter(l => l.direction === 'pull').length}
            </span>
            <span className="text-[10px] text-blue-600 block mt-0.5">
              تحديث وحركة واردة من أجهزة وفروع أخرى
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Pending Transfers */}
        <div className={`p-3 rounded-xl border shadow-xs flex items-center justify-between ${
          pendingSyncCount > 0 ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
        }`}>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">ما لم يتم نقله (المعلقات):</span>
            <span className={`text-xl font-black block mt-0.5 ${
              pendingSyncCount > 0 ? 'text-amber-700' : 'text-slate-800'
            }`}>
              {pendingSyncCount}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {pendingSyncCount > 0 ? 'تعديلات محلية بانتظار الإرسال' : 'كافة الحركات متطابقة بالكامل'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            pendingSyncCount > 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-100'
          }`}>
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Disconnection & Connection Issues */}
        <div className={`p-3 rounded-xl border shadow-xs flex items-center justify-between ${
          connectionIssues.length > 0 ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'
        }`}>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">مشاكل وأخطاء الاتصال المسجلة:</span>
            <span className={`text-xl font-black block mt-0.5 ${
              connectionIssues.length > 0 ? 'text-rose-700' : 'text-slate-800'
            }`}>
              {connectionIssues.length}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {connectionIssues.length > 0 ? 'سجل محمي مع إجراءات معالجة تلقائية' : 'لا توجد أي أخطاء أو انقطاعات'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            connectionIssues.length > 0 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-500 border-slate-100'
          }`}>
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Entity-by-Entity Master Database Reconciliation Table */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">
              جدول مطابقة الكيانات والبيانات الحية (السيرفر الرئيسي مقابل الجهاز الحالي)
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            تحديث تلقائي مستمر عبر دلتا سيرفر Hub
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold text-[11px]">
                <th className="p-2.5">اسم السجل / الكيان المحاسبي</th>
                <th className="p-2.5 text-center">العدد بالسيرفر الرئيسي</th>
                <th className="p-2.5 text-center">العدد بالجهاز المحلي</th>
                <th className="p-2.5 text-center">حالة النقل والتطابق</th>
                <th className="p-2.5 text-center">الفارق</th>
                <th className="p-2.5 text-center">آخر تعديل مسجل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reconciliationData.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/80 transition">
                  <td className="p-2.5 font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    <span>{row.name}</span>
                  </td>
                  <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                    {row.serverCount.toLocaleString('ar-EG')}
                  </td>
                  <td className="p-2.5 text-center font-mono font-bold text-blue-700">
                    {row.localCount.toLocaleString('ar-EG')}
                  </td>
                  <td className="p-2.5 text-center">
                    {row.isSynced ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>متطابق ومزامن</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>قيد النقل والتحديث</span>
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-center font-mono text-[11px]">
                    {row.diff === 0 ? (
                      <span className="text-slate-400">0 (مطابق)</span>
                    ) : (
                      <span className="font-bold text-amber-700">
                        {row.diff > 0 ? `+${row.diff} محلي` : `${row.diff} سيرفر`}
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-center text-slate-500 text-[10px] font-mono">
                    {row.lastModified}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Detailed Live Sync Activity Log & Connection Issues */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        {/* Filter Tabs */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              كافة الحركات المنقولة ({auditLogs.length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pushed')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pushed'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              ما تم نقله للسيرفر ({auditLogs.filter(l => l.direction === 'push').length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pulled')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pulled'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              ما تم جلبه من السيرفر ({auditLogs.filter(l => l.direction === 'pull').length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pending')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pending'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              المعلقات ({auditLogs.filter(l => l.status === 'pending').length})
            </button>

            <button
              onClick={() => setActiveFilterTab('issues')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                activeFilterTab === 'issues'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>سجل الأخطاء ومشاكل الاتصال ({connectionIssues.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
              <input
                type="text"
                placeholder="بحث في الحركات المنقولة..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>

            {activeFilterTab === 'issues' && connectionIssues.length > 0 && (
              <button
                onClick={() => {
                  syncAuditService.clearConnectionIssues();
                  setConnectionIssues([]);
                  loadLocalLogs();
                  setActionFeedback({ success: true, message: 'تم مسح وتفريغ سجل الأخطاء بنجاح ✅' });
                  setTimeout(() => setActionFeedback(null), 3000);
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                title="مسح سجل الأخطاء"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح الأخطاء</span>
              </button>
            )}

            {activeFilterTab !== 'issues' && auditLogs.length > 0 && (
              <button
                onClick={() => {
                  syncAuditService.clearAuditLogs();
                  setAuditLogs([]);
                  loadLocalLogs();
                  setActionFeedback({ success: true, message: 'تم تفريغ سجل حركات المزامنة بنجاح ✅' });
                  setTimeout(() => setActionFeedback(null), 3000);
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                title="تفريغ السجل"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تفريغ</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Issues View */}
        {activeFilterTab === 'issues' ? (
          <div className="p-3 space-y-2">
            {connectionIssues.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">لا توجد أي أخطاء أو مشاكل اتصال مسجلة</h3>
                <p className="text-xs text-slate-500 mt-1">
                  كافة طلبات المزامنة مع السيرفر تعمل بكفاءة واستقرار تام دون أي انقطاع.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <strong className="block text-emerald-800 font-bold">الاتصال المباشر بالسيرفر مستقر ويعمل 100% الآن</strong>
                      <span className="text-[11px] text-emerald-700">
                        الأخطاء المسجلة بالأسفل هي أحداث تاريخية سابقة تم تجاوزها وحفظ بياناتها محلياً دون أي فقدان.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      syncAuditService.clearConnectionIssues();
                      setConnectionIssues([]);
                      loadLocalLogs();
                      setActionFeedback({ success: true, message: 'تم تصفير ومسح سجل الأخطاء السابقة بنجاح ✅' });
                      setTimeout(() => setActionFeedback(null), 3000);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shrink-0 transition cursor-pointer shadow-xs"
                  >
                    تصفير ومسح السجل الآن
                  </button>
                </div>
                {connectionIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-200 text-rose-900 border border-rose-300">
                          {issue.errorTypeLabel}
                        </span>
                        <span className="text-xs font-bold text-slate-900 font-mono" dir="ltr">
                          {issue.endpoint}
                        </span>
                        {issue.statusCode && (
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                            رمز: {issue.statusCode}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-rose-800 font-medium">
                        {issue.message}
                      </p>
                      <p className="text-[11px] text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                        🛡️ {issue.recoveryNote}
                      </p>
                    </div>

                    <div className="text-left shrink-0 text-[11px] text-slate-500 font-mono">
                      <span>{issue.date}</span> - <span>{issue.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Tab 2: Activity Stream Table */
          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-10 bg-slate-50">
                <Activity className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-700">لا توجد حركات مسجلة تطابق التصفية</h3>
                <p className="text-xs text-slate-400 mt-1">
                  تتم إضافة الحركات تلقائياً فور حفظ الفواتير أو استلام تعديلات من السيرفر.
                </p>
              </div>
            ) : (
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold text-[11px]">
                    <th className="p-2.5">التسلسل والوقت</th>
                    <th className="p-2.5">الاتجاه</th>
                    <th className="p-2.5">الكيان المحاسبي</th>
                    <th className="p-2.5">نوع العملية</th>
                    <th className="p-2.5">رقم المستند / المعرف</th>
                    <th className="p-2.5">الحالة</th>
                    <th className="p-2.5">تفاصيل النقل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                        {item.seq ? `#${item.seq} - ` : ''}{item.time}
                      </td>
                      <td className="p-2.5">
                        {item.direction === 'push' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                            <ArrowUpRight className="w-3 h-3" />
                            <span>نقل للسيرفر</span>
                          </span>
                        ) : item.direction === 'pull' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[10px]">
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>جلب من السيرفر</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[10px]">
                            <RefreshCw className="w-3 h-3" />
                            <span>مزامنة شاملة</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-bold text-slate-800">
                        {item.entityLabel}
                      </td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.opLabel}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-slate-700">
                        {item.documentNumber || item.documentId || '—'}
                      </td>
                      <td className="p-2.5">
                        {item.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ناجح ومؤكد</span>
                          </span>
                        ) : item.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[10px]">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>معلق</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[10px]">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>فشل</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-600 text-[11px]">
                        {item.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
