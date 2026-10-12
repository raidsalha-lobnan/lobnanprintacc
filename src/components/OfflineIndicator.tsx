import React, { useEffect, useState, useRef } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const { isOnline, pendingSyncCount, forceSyncNow, hasUnsyncedChanges } = useAccounting();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      setShowRestoredNotice(true);
      const timer = setTimeout(() => setShowRestoredNotice(false), 4500);
      return () => clearTimeout(timer);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      await forceSyncNow();
    } finally {
      setIsRetrying(false);
    }
  };

  if (showRestoredNotice) {
    return (
      <div 
        dir="rtl"
        className="fixed bottom-4 left-4 z-[200] flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in border border-emerald-400/40"
      >
        <Wifi className="w-4 h-4 text-emerald-100 shrink-0" />
        <span>تمت استعادة الاتصال ومزامنة البيانات مع السيرفر تلقائياً!</span>
        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
      </div>
    );
  }

  if (isOnline) return null;

  return (
    <div 
      dir="rtl"
      className="fixed bottom-4 left-4 z-[200] flex flex-wrap items-center gap-2.5 rounded-xl bg-slate-900/95 border border-amber-500/50 px-3.5 py-2.5 text-xs font-medium text-white shadow-2xl backdrop-blur-md animate-fade-in"
    >
      <div className="flex items-center gap-2 text-amber-400 font-bold shrink-0">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>وضع عدم الاتصال (Offline)</span>
      </div>

      <span className="text-slate-300 text-[11px] hidden sm:inline">
        تُحفظ كافة الفواتير والعمليات تلقائياً على هذا الجهاز.
      </span>

      {pendingSyncCount > 0 && (
        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold">
          {pendingSyncCount} حركة بانتظار المزامنة
        </span>
      )}

      <button
        onClick={handleManualRetry}
        disabled={isRetrying}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold transition shadow-xs cursor-pointer ml-auto disabled:opacity-50"
        title="فحص الاتصال وإرسال الحركات المعلقة الآن"
      >
        <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
        <span>{isRetrying ? 'جاري الفحص...' : 'فحص الاتصال الآن'}</span>
      </button>
    </div>
  );
};
