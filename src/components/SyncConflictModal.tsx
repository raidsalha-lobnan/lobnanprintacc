import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  HardDrive,
  Database,
  X,
  FileText,
  ShieldAlert,
  ChevronRight,
  Eye
} from 'lucide-react';
import { SyncCommand } from '../sync-next/types';
import { assessLocalStorageHealth } from '../sync-next/storageHealth';
import { useAccounting } from '../context/AccountingContext';

interface SyncConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({ isOpen, onClose }) => {
  const { unifiedRepository, syncCoordinatorState, isOnline } = useAccounting();
  const [conflicts, setConflicts] = useState<SyncCommand[]>([]);
  const [pendingCommands, setPendingCommands] = useState<SyncCommand[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<SyncCommand | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [storageHealth, setStorageHealth] = useState<{
    idbAvailable: boolean;
    persistent: boolean | null;
    quotaBytes: number | null;
    usageBytes: number | null;
  } | null>(null);

  const loadData = async () => {
    if (!unifiedRepository) return;
    try {
      const localDb = unifiedRepository.getLocalDb();
      const allPending = await localDb.pending();
      setPendingCommands(allPending);
      setConflicts(allPending.filter(c => c.status === 'conflict' || c.status === 'rejected'));
      const health = await assessLocalStorageHealth();
      setStorageHealth(health);
    } catch (err) {
      console.warn('Error loading sync conflict data:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, unifiedRepository]);

  if (!isOpen) return null;

  const handleRetry = async (commandId: string) => {
    if (!unifiedRepository) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      await unifiedRepository.retryCommand(commandId);
      setFeedback('تمت إعادة إدراج العملية في طابور الإرسال للتزامن مع أحدث نسخة سحابية 🔄');
      await loadData();
    } catch (err: any) {
      setFeedback(`فشلت إعادة المحاولة: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async (commandId: string) => {
    if (!unifiedRepository) return;
    if (!window.confirm('هل أنت متأكد من استبعاد هذه الحركة المعلقة نهائياً من الطابور؟ لا يمكن التراجع.')) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      await unifiedRepository.discardCommand(commandId);
      setFeedback('تم استبعاد الحركة من طابور التزامن المحلي 🗑️');
      setSelectedCommand(null);
      await loadData();
    } catch (err: any) {
      setFeedback(`فشل الاستبعاد: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes || bytes <= 0) return 'غير متاح';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const getEntityLabel = (entity: string) => {
    const map: Record<string, string> = {
      invoices: 'فاتورة مبيعات',
      vouchers: 'سند مالي',
      purchases: 'فاتورة مشتريات',
      parties: 'عميل / مورد',
      inventory: 'صنف مخزني',
      journalEntries: 'قيد محاسبي',
      treasuries: 'صندوق / خزينة',
      treasuryTransactions: 'حركة خزينة',
      expenses: 'مصروف',
      stockMovements: 'حركة مخزون',
      printOrders: 'أمر شغل مطبعة'
    };
    return map[entity] || entity;
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden text-slate-100 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                لوحة فحص طابور المزامنة وإدارة التعارضات
                {conflicts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    {conflicts.length} بحاجة لمعالجة
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                متابعة العمليات المعلقة وحالات عدم التطابق بين نسخ الأجهزة والسيرفر السحابي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Banners */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-400">طابور الانتظار المحلي</div>
                <div className="text-sm font-bold text-white">{pendingCommands.length} عملية</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-400">حالات التعارض / الرفض</div>
                <div className="text-sm font-bold text-amber-300">{conflicts.length} عملية</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-400">تخزين المتصفح المحلي</div>
                <div className="text-sm font-bold text-emerald-300">
                  {storageHealth?.usageBytes ? formatBytes(storageHealth.usageBytes) : 'نشط ومستقر'}
                </div>
              </div>
            </div>
          </div>

          {feedback && (
            <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-500/40 text-xs text-blue-200">
              {feedback}
            </div>
          )}

          {/* Conflict List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              قائمة العمليات التي تتطلب مراجعة
            </h3>

            {conflicts.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                <h4 className="text-sm font-bold text-slate-200">لا توجد أي تعارضات معلقة</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  جميع القيود والفواتير والسجلات متطابقة ومتزامنة مع سحابة Firebase بنجاح تام وفق النواة المحاسبية الآمنة.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {conflicts.map(cmd => (
                  <div
                    key={cmd.id}
                    className="p-4 rounded-xl bg-slate-800/80 border border-amber-500/30 hover:border-amber-500/60 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {cmd.status === 'conflict' ? 'تعارض نسخة (Version Conflict)' : 'رفض من السيرفر'}
                          </span>
                          <span className="text-xs font-mono text-slate-400">ID: {cmd.id}</span>
                        </div>
                        <div className="text-xs font-bold text-white mt-1">
                          الكيانات المتأثرة:{' '}
                          {cmd.changes.map(c => getEntityLabel(c.entity)).join('، ')}
                        </div>
                        <div className="text-[11px] text-rose-300 mt-1 font-mono">
                          الخطأ: {cmd.error || 'تم اكتشاف تعديل مسبق للنسخة على جهاز آخر'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={() => setSelectedCommand(selectedCommand?.id === cmd.id ? null : cmd)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 font-medium transition flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>معاينة</span>
                        </button>

                        <button
                          onClick={() => handleRetry(cmd.id)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>إعادة المحاولة مع التحديث</span>
                        </button>

                        <button
                          onClick={() => handleDiscard(cmd.id)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-xs text-rose-200 font-medium transition flex items-center gap-1.5 disabled:opacity-50"
                          title="استبعاد الحركة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {selectedCommand?.id === cmd.id && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <div className="text-[11px] font-bold text-slate-300">تفاصيل التغييرات داخل المعاملة الذرية:</div>
                        <pre className="p-3 rounded-lg bg-slate-950 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-48 border border-slate-800">
                          {JSON.stringify(cmd.changes, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Queue Summary */}
          {pendingCommands.filter(c => c.status === 'pending').length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                حركات قيد الإرسال والتزامن السحابي ({pendingCommands.filter(c => c.status === 'pending').length})
              </h4>
              <p className="text-[11px] text-slate-400">
                تُحفظ العمليات محلياً وفورياً داخل IndexedDB على هذا الجهاز، وترسل إلى سحابة Firebase تلقائياً فور توفر الاتصال.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>حالة الشبكة: {isOnline ? 'متصل بالإنترنت' : 'غير متصل (يعمل محلياً بالكامل)'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث القائمة</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
