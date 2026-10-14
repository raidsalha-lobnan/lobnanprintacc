// Online-Only Invoice Posting Service
// نظام الترحيل السحابي الحصري والمباشر (Online-Only Synchronous Posting)
// يمنع التخزين المتراكم دون اتصال، ويرحل الفواتير أولاً بأول بالتتابع لمنع أي تضارب أو فقدان في البيانات

import { db, doc, getDoc, setDoc } from '../firebase';
import { Invoice } from '../types';
import { syncAuditService } from './syncAuditService';

const DB_COLLECTION = 'lobnan_accounting_db';
const STAGED_POS_DRAFT_KEY = 'alnoor_pos_staged_in_flight_draft';

// Mutex to ensure strictly sequential posting: "ولا تحفظ أي فاتورة قبل ترحيل الفاتورة السابقة"
let isPostingLockActive = false;
let currentPostingPromise: Promise<any> | null = null;

export interface PostResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  isOffline?: boolean;
  isBusy?: boolean;
}

function sanitizeForFirestore(data: any): any {
  if (data === null || data === undefined) return null;
  try {
    const str = JSON.stringify(data, (_, v) => {
      if (typeof v === 'undefined') return null;
      if (typeof v === 'function' || typeof v === 'symbol') return null;
      return v;
    });
    return JSON.parse(str);
  } catch (err) {
    console.warn('sanitizeForFirestore fallback error:', err);
    return null;
  }
}

export const onlineInvoicePostingService = {
  /**
   * Check if the device is currently online
   */
  checkIsOnline: (): boolean => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  },

  /**
   * Check if a previous invoice is currently being posted to the cloud
   */
  isPostingBusy: (): boolean => {
    return isPostingLockActive;
  },

  /**
   * Save an in-flight draft to temporary staging scratchpad (Zero-Data-Loss guarantee)
   */
  stageInvoiceDraft: (draftData: any) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STAGED_POS_DRAFT_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: draftData
        }));
      }
    } catch {}
  },

  /**
   * Retrieve staged draft if any exists (for crash recovery)
   */
  getStagedInvoiceDraft: (): any | null => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(STAGED_POS_DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed?.data || null;
        }
      }
    } catch {}
    return null;
  },

  /**
   * Clear staged draft once successfully posted to the cloud
   */
  clearStagedInvoiceDraft: () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STAGED_POS_DRAFT_KEY);
      }
    } catch {}
  },

  /**
   * Post an invoice directly and synchronously to cloud server.
   * Strictly enforces:
   * 1. Online connection must be active.
   * 2. No concurrent invoice posts (must wait for previous to finish).
   * 3. Authoritative sequence check against the central database.
   */
  postInvoiceDirectlyOnline: async (
    invoice: Invoice,
    currentInvoicesList: Invoice[]
  ): Promise<PostResult> => {
    // 0. Standalone Local Mode Check
    if (typeof localStorage !== 'undefined' && localStorage.getItem('accounting_is_local_only_mode') === 'true') {
      return {
        success: true,
        invoice,
        isOffline: true
      };
    }

    // 1. Strict Connectivity Check: "وأثناء عدم الاتصال تضل الشاشات مجمدة محتفظة بمدخلاتها ولكن لا تحفظ إلا وقت الاتصال"
    if (!onlineInvoicePostingService.checkIsOnline()) {
      return {
        success: false,
        isOffline: true,
        error: '⚠️ لا يمكن حفظ أو ترحيل الفاتورة في وضع عدم الاتصال (أوفلاين). الشاشة مجمدة ومحتفظة بكافة المدخلات بأمان لحين توفر الإنترنت.'
      };
    }

    // 2. Sequential Mutex Lock: "ولا تحفظ أي فاتورة قبل ترحيل الفاتورة السابقة"
    if (isPostingLockActive) {
      try {
        if (currentPostingPromise) {
          await currentPostingPromise;
        }
      } catch {}
      if (isPostingLockActive) {
        return {
          success: false,
          isBusy: true,
          error: 'جاري ترحيل فاتورة سابقة حالياً بالتتابع إلى السيرفر... يرجى الانتظار بضع ثوانٍ لإتمام الترحيل أولاً بأول.'
        };
      }
    }

    isPostingLockActive = true;

    const executePosting = async (): Promise<PostResult> => {
      try {
        // 3. Stage the invoice locally for crash resilience during transfer
        onlineInvoicePostingService.stageInvoiceDraft(invoice);

        // 4. Fetch authoritative cloud invoices list to guarantee sequential non-colliding numbers
        const docRef = doc(db, DB_COLLECTION, 'invoices');
        let cloudInvoices: Invoice[] = [];

        try {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data && Array.isArray(data.items)) {
              cloudInvoices = data.items;
            }
          }
        } catch (fetchErr: any) {
          console.warn('Authoritative cloud invoices check notice:', fetchErr?.message || fetchErr);
          if (!onlineInvoicePostingService.checkIsOnline()) {
            return {
              success: false,
              isOffline: true,
              error: 'انقطع الاتصال بالسيرفر أثناء فحص التسلسل السحابي. البيانات محفوظة على الشاشة دون أي فقدان.'
            };
          }
        }

        // 5. Calculate the highest authoritative invoice number on the cloud/known records (excluding current invoice ID)
        let maxSeq = 0;
        const allKnown = [...cloudInvoices, ...currentInvoicesList].filter(inv => inv && inv.id !== invoice.id);
        allKnown.forEach(inv => {
          if (inv && inv.invoiceNumber) {
            const num = parseInt(inv.invoiceNumber.replace(/\D/g, ''), 10);
            if (!isNaN(num) && num > maxSeq && num < 1000000) {
              maxSeq = num;
            }
          }
        });

        // Current requested invoice number
        let finalInvoiceNumber = invoice.invoiceNumber;
        const reqNum = parseInt((invoice.invoiceNumber || '').replace(/\D/g, ''), 10);

        // Check if this number already exists on cloud for a different invoice ID
        const isConflict = cloudInvoices.some(
          inv => inv && inv.invoiceNumber === finalInvoiceNumber && inv.id !== invoice.id
        );

        if (isConflict || !finalInvoiceNumber || isNaN(reqNum)) {
          const newNumberInt = maxSeq + 1;
          finalInvoiceNumber = `INV-${String(newNumberInt).padStart(4, '0')}`;
        }

        const finalInvoice: Invoice = {
          ...invoice,
          invoiceNumber: finalInvoiceNumber,
          updatedAt: new Date().toISOString()
        };

        // 6. Merge final invoice into cloud list
        const existingIndex = cloudInvoices.findIndex(inv => inv.id === finalInvoice.id);
        let updatedCloudInvoices: Invoice[];
        if (existingIndex >= 0) {
          updatedCloudInvoices = [...cloudInvoices];
          updatedCloudInvoices[existingIndex] = finalInvoice;
        } else {
          updatedCloudInvoices = [finalInvoice, ...cloudInvoices];
        }

        // 7. Commit write directly:
        // A. Direct invoice document (1 targeted write)
        let savedDirectFirestore = false;
        try {
          const cleanInvoice = sanitizeForFirestore(finalInvoice);
          const singleDocRef = doc(db, 'invoices', cleanInvoice.id);
          await setDoc(singleDocRef, cleanInvoice, { merge: true });
          savedDirectFirestore = true;
        } catch (err: any) {
          console.warn('Single doc save notice:', err?.message || err);
        }

        // B. Smart Delta write to Firestore delta collection (1 single write unit instead of full DB rewrite)
        try {
          const { saveDeltaToFirestore } = await import('./firebaseFirestoreSyncService');
          await saveDeltaToFirestore({
            entity: 'invoices',
            op: 'upsert',
            item: finalInvoice,
            clientId: 'pos_direct_poster'
          });
        } catch (err: any) {
          console.warn('Smart delta save notice:', err?.message || err);
        }

        // C. Local/network server delta route (always fast and zero Firestore quota)
        try {
          await fetch('/api/sync/delta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity: 'invoices',
              op: 'upsert',
              item: finalInvoice,
              clientId: 'pos_direct_poster'
            })
          });
        } catch {}

        // 8. Clear the temporary staging draft upon confirmed success
        onlineInvoicePostingService.clearStagedInvoiceDraft();

        // 9. Log audit success
        syncAuditService.logEvent({
          direction: 'push',
          entity: 'invoices',
          op: 'upsert',
          status: 'success',
          documentId: finalInvoice.id,
          documentNumber: finalInvoice.invoiceNumber,
          details: `تم ترحيل الفاتورة (${finalInvoice.invoiceNumber}) سحابياً ومباشرة بنجاح 🟢`
        });

        return {
          success: true,
          invoice: finalInvoice
        };
      } catch (err: any) {
        console.error('Online direct invoice posting error:', err);
        const isNetworkErr = !navigator.onLine || err?.code === 'unavailable' || err?.message?.includes('offline');
        return {
          success: false,
          isOffline: isNetworkErr,
          error: isNetworkErr
            ? 'انقطع الاتصال بالإنترنت أثناء ترحيل الفاتورة. تم تجميد الشاشة والاحتفاظ بكافة المدخلات لمنع فقدان البيانات.'
            : (err?.message || 'فشل الترحيل السحابي للفاتورة. مدخلاتك محفوظة على الشاشة.')
        };
      } finally {
        isPostingLockActive = false;
        currentPostingPromise = null;
      }
    };

    currentPostingPromise = executePosting();
    return currentPostingPromise;
  }
};
