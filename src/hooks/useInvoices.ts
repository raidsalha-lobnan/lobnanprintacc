import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import type { Invoice } from '../types';

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Live Firestore synchronization for all screens and devices
    const q = query(collection(db, 'invoices'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      items.sort((a, b) => {
        const dateA = a.date || a.createdAt || '';
        const dateB = b.date || b.createdAt || '';
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '');
      });
      setInvoices(items);
      setLoading(false);
    }, (err) => {
      console.error('Firestore useInvoices sync error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { 
    invoices, 
    loading, 
    count: invoices.length,
    totalSales: invoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0),
    totalPaid: invoices.reduce((sum, inv) => sum + (Number(inv.paidAmount) || 0), 0),
    totalRemaining: invoices.reduce((sum, inv) => sum + (Number(inv.remainingAmount) || 0), 0)
  };
}
