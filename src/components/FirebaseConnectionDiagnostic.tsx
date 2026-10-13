import React, { useState, useEffect } from 'react';
import { db, doc, getDoc } from '../firebase';
import { AlertOctagon, RefreshCw, CheckCircle, Info, X, ExternalLink } from 'lucide-react';
import { isFirestoreQuotaExceeded, resetQuotaExceeded } from '../services/firebaseFirestoreSyncService';

export const FirebaseConnectionDiagnostic: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'success' | 'quota_exceeded' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dismiss_firebase_quota_banner') === 'true';
    } catch {
      return false;
    }
  });

  const checkConnection = async (force: boolean = false) => {
    if (force) {
      resetQuotaExceeded();
    } else if (isFirestoreQuotaExceeded()) {
      setStatus('quota_exceeded');
      setErrorMessage('تم استهلاك الحد اليومي للكتابة في خطة Firebase المجانية.');
      return;
    }

    setStatus('checking');
    try {
      // Test read of a single small document in lobnan_accounting_db (1 read unit only)
      await getDoc(doc(db, 'lobnan_accounting_db', 'settings'));
      setStatus('success');
      setErrorMessage('');
      resetQuotaExceeded();
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        setStatus('quota_exceeded');
        setErrorMessage('تم استهلاك الحصة المجانية المؤقتة لـ Firebase. تتجدد الحصة تلقائياً كل 24 ساعة.');
      } else {
        setStatus('error');
        setErrorMessage(err.code ? `${err.code}: ${err.message}` : String(err));
      }
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('dismiss_firebase_quota_banner', 'true');
    } catch {}
  };

  if (isDismissed) {
    return (
      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            setIsDismissed(false);
            checkConnection(true);
          }}
          className="text-[11px] text-slate-500 hover:text-slate-700 underline flex items-center gap-1 py-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span>فحص حالة اتصال Firebase</span>
        </button>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span className="text-xs font-bold">الاتصال بقاعدة بيانات Firebase سليم ومستقر 🟢</span>
        </div>
        <button
          onClick={() => checkConnection(true)}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-1 bg-emerald-100 rounded cursor-pointer transition"
        >
          فحص الآن
        </button>
      </div>
    );
  }

  if (status === 'quota_exceeded') {
    return (
      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-2 relative">
        <button
          onClick={handleDismiss}
          title="إغلاق التنبيه"
          className="absolute top-2.5 left-2.5 p-1 text-amber-700 hover:text-amber-950 hover:bg-amber-200/60 rounded-full cursor-pointer transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pr-1">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="text-xs font-bold">تنبيه: تم استهلاك الحد اليومي المجاني لـ Firebase (20,000 حركة) ⚠️</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-800 pr-1">
          يعمل النظام حالياً بأمان ومستقر بالكامل. تتجدد الحصة المجانية تلقائياً كل 24 ساعة (عند منتصف ليل المحيط الهادئ / قرابة 10:00 صباحاً بتوقيت مكة المكرمة)، أو يمكنك ترقية الخطة إلى Blaze في وحدة تحكم Firebase لإلغاء أي حدود مستقبلاً.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button 
            onClick={() => checkConnection(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition text-amber-900 cursor-pointer shadow-xs active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة فحص الاتصال</span>
          </button>
          <a
            href="https://console.firebase.google.com/project/gen-lang-client-0984774155/firestore/databases/ai-studio-remixcopyofcopyo-917f7ef2-bd2e-44c7-b6f8-f5661310c7a9/data?openUpgradeDialog=true"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold bg-white border border-amber-300 hover:bg-amber-100/60 px-3 py-1.5 rounded-lg text-amber-900 transition"
          >
            <span>ترقية الخطة (Blaze)</span>
            <ExternalLink className="w-3 h-3 text-amber-700" />
          </a>
          <button
            onClick={handleDismiss}
            className="text-xs text-amber-800 hover:text-amber-950 underline px-2 py-1 mr-auto cursor-pointer"
          >
            تجاوز وإخفاء التنبيه
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-2 relative">
      <button
        onClick={handleDismiss}
        title="إغلاق التنبيه"
        className="absolute top-2.5 left-2.5 p-1 text-rose-600 hover:text-rose-900 hover:bg-rose-200/60 rounded-full cursor-pointer transition"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2">
        <AlertOctagon className="w-5 h-5 text-rose-600" />
        <span className="text-xs font-bold">خطأ في الاتصال بقاعدة البيانات:</span>
      </div>
      <p className="text-[10px] font-mono bg-rose-100 p-2 rounded break-all">{errorMessage}</p>
      <div className="flex items-center gap-2">
        <button 
          onClick={() => checkConnection(true)}
          className="flex items-center gap-1 text-xs font-bold bg-rose-200 hover:bg-rose-300 px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>إعادة فحص الاتصال</span>
        </button>
        <button
          onClick={handleDismiss}
          className="text-xs text-rose-700 hover:text-rose-900 underline px-2 py-1 mr-auto cursor-pointer"
        >
          إخفاء
        </button>
      </div>
    </div>
  );
};
