import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { 
  Database, 
  HardDrive, 
  Download, 
  Upload, 
  CheckCircle2, 
  ShieldCheck, 
  AlertTriangle, 
  FileText, 
  Users, 
  Boxes, 
  Receipt, 
  RefreshCw,
  X,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ServerOff,
  Cloud
} from 'lucide-react';

interface LocalDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocalDatabaseModal: React.FC<LocalDatabaseModalProps> = ({ isOpen, onClose }) => {
  const {
    isLocalOnlyMode,
    toggleLocalOnlyMode,
    invoices,
    parties,
    inventory,
    accounts,
    treasuries,
    vouchers,
    purchases,
    dailyEntries,
    seedLocalDatabaseDemo,
    exportLocalDatabaseJSON,
    importLocalDatabaseJSON
  } = useAccounting();

  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleSeed = () => {
    const res = seedLocalDatabaseDemo();
    setFeedback({ message: res.message, success: res.success });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleExport = () => {
    exportLocalDatabaseJSON();
    setFeedback({ message: 'تم تصدير نسخة احتياطية كاملة من قاعدة البيانات المحلية بنجاح!', success: true });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      const res = await importLocalDatabaseJSON(jsonData);
      setFeedback(res);
    } catch (err: any) {
      setFeedback({ message: 'فشل قراءة الملف: ' + err.message, success: false });
    } finally {
      setIsImporting(false);
      e.target.value = '';
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 font-sans" dir="rtl">
      <div className="bg-white border-2 border-emerald-600 rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white px-5 py-3.5 flex items-center justify-between border-b border-emerald-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600/40 rounded-md border border-emerald-400/30">
              <HardDrive className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-wide">إدارة واستقلال قاعدة البيانات المحلية (Offline Local Mode)</h2>
              <p className="text-xs text-emerald-100/90 font-medium">العمل المحلي الخالص 100% وحماية الفواتير والمدخلات من أي حذف أو مزامنة سحابية</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-emerald-600/50 rounded-md text-emerald-100 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {/* Feedback Alert */}
          {feedback && (
            <div className={`p-3.5 rounded-md border text-xs font-bold flex items-center gap-2.5 ${
              feedback.success 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* STANDALONE LOCAL MODE TOGGLE CARD */}
          <div className={`p-4 rounded-lg border-2 transition-all ${
            isLocalOnlyMode 
              ? 'bg-emerald-50/90 border-emerald-500 shadow-md' 
              : 'bg-amber-50/80 border-amber-400'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-full ${isLocalOnlyMode ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                  {isLocalOnlyMode ? <ServerOff className="w-6 h-6" /> : <Cloud className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {isLocalOnlyMode 
                      ? '🟢 وضع العمل المحلي الخالص (مُفعل 100%)' 
                      : '🌐 وضع المزامنة السحابية (مستمر)'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-md leading-relaxed">
                    {isLocalOnlyMode 
                      ? 'تم إيقاف كافة الاتصالات الخارجية والمزامنة الخلفية مع السيرفر والفايربيس. كل الفواتير والمدخلات محفوظة محلياً فوراً وبأمان مطلق دون أي إمكانية للحذف أو التحديث السحابي.'
                      : 'النظام يقوم بمزامنة الفواتير والبيانات مع السيرفر السحابي. اضغط للتفعيل إذا كنت ترغب في العمل أوفلاين محلياً بالكامل دون أي تواصل خارجي.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleLocalOnlyMode()}
                className={`px-4 py-2.5 rounded-md font-extrabold text-xs flex items-center gap-2 transition shadow-md cursor-pointer shrink-0 ${
                  isLocalOnlyMode 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700' 
                    : 'bg-slate-700 hover:bg-slate-800 text-white border border-slate-800'
                }`}
              >
                {isLocalOnlyMode ? (
                  <>
                    <ToggleRight className="w-5 h-5 text-emerald-300" />
                    <span>تعطيل الوضع المحلي</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5 text-amber-300" />
                    <span>تفعيل الوضع المحلي الخالص</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* CURRENT LOCAL DATABASE STATS */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>إحصائيات وحجم البيانات المحفوظة محلياً بمتصفحك:</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <FileText className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">فواتير المبيعات</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">{invoices?.length || 0}</strong>
              </div>

              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <Users className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">العملاء والموردين</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">{parties?.length || 0}</strong>
              </div>

              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <Boxes className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">أصناف المخزون</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">{inventory?.length || 0}</strong>
              </div>

              <div className="bg-white p-3 rounded-md border border-slate-200 shadow-2xs">
                <Receipt className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <span className="block text-[11px] text-slate-500 font-medium">السندات والمشتريات</span>
                <strong className="text-base font-extrabold text-slate-900 font-mono">
                  {(vouchers?.length || 0) + (purchases?.length || 0) + (dailyEntries?.length || 0)}
                </strong>
              </div>
            </div>
          </div>

          {/* LOCAL DATABASE ACTION TOOLS */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>أدوات الحفظ والنسخ الاحتياطي المحلي:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* EXPORT BACKUP JSON */}
              <button
                type="button"
                onClick={handleExport}
                className="p-3 bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-500 rounded-lg flex items-center gap-3 transition shadow-2xs cursor-pointer text-right group"
              >
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-800">تصدير نسخة احتياطية (JSON)</span>
                  <span className="block text-[10.5px] text-slate-500">حفظ نسخة كاملة من كل البيانات كملف محلي على كمبيوترك</span>
                </div>
              </button>

              {/* IMPORT BACKUP JSON */}
              <label className="p-3 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-500 rounded-lg flex items-center gap-3 transition shadow-2xs cursor-pointer text-right group">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-md group-hover:bg-blue-600 group-hover:text-white transition">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-xs font-extrabold text-slate-800">
                    {isImporting ? 'جاري الاستعادة...' : 'استعادة قاعدة البيانات من ملف (JSON)'}
                  </span>
                  <span className="block text-[10.5px] text-slate-500">رفع واستعادة بيانات سابقة مباشرة إلى المتصفح</span>
                </div>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileUpload} 
                  disabled={isImporting} 
                  className="hidden" 
                />
              </label>
            </div>

            {/* SEED INITIAL READY DATABASE */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSeed}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition shadow-xs cursor-pointer border border-slate-900"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>تجهيز/تأكيد قاعدة البيانات المحلية الجاهزة للعمل الفوري</span>
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-600 font-medium">
            برنامج الأيهم المحاسبي - إصدار التشغيل المحلي المستقل v1.0
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-md transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
