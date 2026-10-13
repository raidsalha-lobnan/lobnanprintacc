import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { AlertOctagon, RefreshCw, CheckCircle } from 'lucide-react';

export const FirebaseConnectionDiagnostic: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const checkConnection = async () => {
    setStatus('checking');
    try {
      // Test by accessing a known collection 'invoices'
      await getDocs(collection(db, 'invoices'));
      setStatus('success');
      setErrorMessage('');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.code + ': ' + err.message);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  if (status === 'success') {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-2">
        <CheckCircle className="w-5 h-5" />
        <span className="text-xs font-bold">الاتصال بقاعدة البيانات سليم ومستقر 🟢</span>
      </div>
    );
  }

  return (
    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-2">
      <div className="flex items-center gap-2">
        <AlertOctagon className="w-5 h-5" />
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
