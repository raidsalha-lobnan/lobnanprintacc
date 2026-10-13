import React, { useState, useEffect } from 'react';
import { db, doc, getDoc } from '../firebase';
import { AlertOctagon, RefreshCw, CheckCircle, Info } from 'lucide-react';
import { isFirestoreQuotaExceeded } from '../services/firebaseFirestoreSyncService';

export const FirebaseConnectionDiagnostic: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'success' | 'quota_exceeded' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const checkConnection = async () => {
    if (isFirestoreQuotaExceeded()) {
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
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        setStatus('quota_exceeded');
        setErrorMessage('تم الوصول للحد الأقصى للعمليات اليومية في خطة Firebase المجانية (20,000 حركة/يوم).');
      } else {
        setStatus('error');
        setErrorMessage(err.code ? `${err.code}: ${err.message}` : String(err));
      }
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  if (status === 'success') {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span className="text-xs font-bold">الاتصال بقاعدة بيانات Firebase سليم ومستقر 🟢</span>
        </div>
        <button
          onClick={checkConnection}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-1 bg-emerald-100 rounded"
        >
          فحص
        </button>
      </div>
    );
  }

  if (status === 'quota_exceeded') {
    return (
      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="text-xs font-bold">تنبيه: تم استهلاك الحد اليومي المجاني لـ Firebase (20,000 حركة) ⚠️</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-800">
          يعمل النظام حالياً في <strong>وضع الحفظ المحلي الآمن (Offline-First)</strong> بنسبة 100%. كافة فواتيرك وحركاتك مسجلة ومحفوظة بأمان محلياً، وسيتم رفعها تلقائياً للسحابة بمجرد تجدد الحصة اليومية أو ترقية الخطة إلى Blaze.
        </p>
        <button 
          onClick={checkConnection}
          className="flex items-center gap-1 text-xs font-bold bg-amber-200 hover:bg-amber-300 px-3 py-1 rounded transition text-amber-900"
        >
          <RefreshCw className="w-3 h-3" />
          <span>إعادة فحص الاتصال</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-2">
      <div className="flex items-center gap-2">
        <AlertOctagon className="w-5 h-5 text-rose-600" />
        <span className="text-xs font-bold">خطأ في الاتصال بقاعدة البيانات:</span>
      </div>
      <p className="text-[10px] font-mono bg-rose-100 p-2 rounded break-all">{errorMessage}</p>
      <button 
        onClick={checkConnection}
        className="flex items-center gap-1 text-xs font-bold bg-rose-200 hover:bg-rose-300 px-3 py-1.5 rounded-lg transition"
      >
        <RefreshCw className="w-3 h-3" />
        <span>إعادة فحص الاتصال</span>
      </button>
    </div>
  );
};
