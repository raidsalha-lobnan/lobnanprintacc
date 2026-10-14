import { db, doc, setDoc, getDoc, deleteDoc, onSnapshot, collection, getDocs, query, where, orderBy, limit } from '../firebase';
import { syncAuditService, SyncAuditItem, SyncConnectionIssue } from './syncAuditService';

const DB_COLLECTION = 'lobnan_accounting_db';
const DELTAS_COLLECTION = 'lobnan_accounting_deltas';
const AUDIT_COLLECTION = 'lobnan_accounting_sync_audit_logs';
const ISSUES_COLLECTION = 'lobnan_accounting_sync_connection_issues';
const TESTS_COLLECTION = 'lobnan_accounting_sync_tests';

export interface FirestoreDeltaPayload {
  id?: string;
  entity: string;
  op: 'upsert' | 'delete' | 'sync';
  item?: any;
  items?: any[];
  clientId?: string;
  timestamp: number;
  isoTime?: string;
}

export const ALL_ENTITIES = [
  'invoices',
  'parties',
  'inventory',
  'vouchers',
  'purchases',
  'purchaseReturns',
  'salesReturns',
  'accounts',
  'treasuries',
  'employees',
  'journalEntries',
  'expenses',
  'stockMovements',
  'warehouseOperations',
  'dailyEntrySheets',
  'settings'
];

// Quota state tracking for Firebase Firestore
let quotaExceededUntil = 0;
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('accounting_quota_exceeded_until');
    if (saved) quotaExceededUntil = parseInt(saved, 10) || 0;
  }
} catch {}

let hasLoggedQuotaWarning = false;

export function isFirestoreQuotaExceeded(): boolean {
  return Date.now() < quotaExceededUntil;
}

export function markQuotaExceeded(durationMs: number = 3600000) {
  quotaExceededUntil = Date.now() + durationMs;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('accounting_quota_exceeded_until', String(quotaExceededUntil));
    }
  } catch {}
  if (!hasLoggedQuotaWarning) {
    console.warn('⚠️ تم بلوغ الحد اليومي المجاني للكتابة في Firebase Firestore. تم تفعيل الحفظ والعمل المحلي الآمن مؤقتاً.');
    hasLoggedQuotaWarning = true;
  }
}

export function resetQuotaExceeded() {
  quotaExceededUntil = 0;
  hasLoggedQuotaWarning = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('accounting_quota_exceeded_until');
    }
  } catch {}
}

export function sanitizeForFirestore(data: any): any {
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

/**
 * SMART INCREMENTAL DELTA PUSH:
 * Pushes ONLY a single changed operation (delta) to Firestore.
 * Consumes exactly 1 write unit instead of re-uploading entire collections or full databases!
 */
export async function saveDeltaToFirestore(delta: {
  entity: string;
  op?: 'upsert' | 'delete' | 'sync';
  item?: any;
  items?: any[];
  clientId?: string;
}): Promise<boolean> {
  if (isFirestoreQuotaExceeded()) return false;
  try {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 7);
    const docId = `delta_${timestamp}_${delta.clientId || 'c'}_${rand}`;
    const cleanDelta = sanitizeForFirestore({
      id: docId,
      entity: delta.entity,
      op: delta.op || 'upsert',
      item: delta.item || null,
      items: delta.items || null,
      clientId: delta.clientId || 'default',
      timestamp,
      isoTime: new Date(timestamp).toISOString()
    });

    const docRef = doc(db, DELTAS_COLLECTION, docId);
    await setDoc(docRef, cleanDelta);

    syncAuditService.logEvent({
      direction: 'push',
      entity: delta.entity,
      op: delta.op || 'upsert',
      status: 'success',
      documentId: delta.item?.id || delta.items?.[0]?.id,
      documentNumber: delta.item?.invoiceNumber || delta.item?.code || delta.item?.voucherNumber,
      details: `تم رفع الحركة الجديدة فقط (${delta.entity}) كـ Delta خفيف لسحابة Firestore بنجاح ⚡ (1 Write Unit)`
    });

    return true;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted') {
      markQuotaExceeded();
      return false;
    }
    console.warn('saveDeltaToFirestore error:', err);
    return false;
  }
}

/**
 * SMART INCREMENTAL DELTA PULL:
 * Subscribes to live delta updates since a given timestamp from Firestore.
 * Listens to ONLY new transactions as they occur across devices (Zero Full-DB Reads).
 */
export function subscribeToFirestoreLiveDeltas(
  sinceTimestamp: number,
  onDeltaReceived: (delta: FirestoreDeltaPayload) => void
): () => void {
  if (isFirestoreQuotaExceeded()) {
    return () => {};
  }
  try {
    const q = query(
      collection(db, DELTAS_COLLECTION),
      where('timestamp', '>', sinceTimestamp),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const delta = change.doc.data() as FirestoreDeltaPayload;
          if (delta && delta.entity) {
            onDeltaReceived(delta);
          }
        }
      });
    }, (err) => {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        markQuotaExceeded();
        return;
      }
      console.warn('Firestore live deltas listener notice:', err?.message || err);
    });
  } catch {
    return () => {};
  }
}

/**
 * Saves a single entity's list of items to Firestore
 */
export async function saveEntityToFirestore(entityName: string, items: any[]): Promise<boolean> {
  if (isFirestoreQuotaExceeded()) {
    return false;
  }
  try {
    const cleanItems = sanitizeForFirestore(items || []) || [];
    const docRef = doc(db, DB_COLLECTION, entityName);
    const docPayload = sanitizeForFirestore({
      items: cleanItems,
      updatedAt: new Date().toISOString(),
      count: cleanItems.length
    });
    await setDoc(docRef, docPayload, { merge: true });

    syncAuditService.logEvent({
      direction: 'push',
      entity: entityName,
      op: 'upsert',
      status: 'success',
      details: `تم حفظ ${cleanItems.length} عنصر في سحابة Firebase Firestore بنجاح 🟢`
    });

    return true;
  } catch (error: any) {
    if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota limit exceeded')) {
      markQuotaExceeded();
      return false;
    }
    console.error(`Error saving ${entityName} to Firestore:`, error);
    syncAuditService.logIssue({
      endpoint: `Firestore/${entityName}`,
      errorType: 'server_error',
      statusCode: error?.code || 500,
      message: `فشل الحفظ في Firestore: ${error?.message || 'خطأ غير معروف'}`,
      recoveryNote: 'يرجى التأكد من صلاحيات قاعدة البيانات والاتصال بالإنترنت'
    });
    return false;
  }
}

/**
 * Pushes the full master database snapshot to Firestore
 */
export async function pushFullDatabaseToFirestore(fullSnapshot: Record<string, any[]>): Promise<{ success: boolean; error?: string }> {
  if (isFirestoreQuotaExceeded()) {
    return { success: false, error: 'تم بلوغ الحد اليومي المجاني للكتابة في Firebase مؤقتاً. بياناتك محفوظة محلياً بالكامل.' };
  }
  try {
    const promises = ALL_ENTITIES.map(async (ent) => {
      const rawItems = Array.isArray(fullSnapshot[ent]) ? fullSnapshot[ent] : [];
      const items = sanitizeForFirestore(rawItems) || [];
      const docRef = doc(db, DB_COLLECTION, ent);
      const docPayload = sanitizeForFirestore({
        items,
        updatedAt: new Date().toISOString(),
        count: items.length || 0
      });
      return setDoc(docRef, docPayload, { merge: true });
    });

    await Promise.all(promises);

    syncAuditService.logEvent({
      direction: 'push',
      entity: 'master_db',
      op: 'sync',
      status: 'success',
      details: 'تم رفع قاعدة البيانات الشاملة بالكامل إلى سحابة Firebase Firestore بنجاح ✅'
    });

    return { success: true };
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
      markQuotaExceeded();
      return { success: false, error: 'تم بلوغ الحد اليومي المجاني للكتابة في Firebase مؤقتاً.' };
    }
    console.warn('Error pushing full DB to Firestore:', err?.message || err);
    return { success: false, error: err?.message || 'تعذر رفع قاعدة البيانات الكاملة' };
  }
}

/**
 * Subscribes to live sync updates across all entities from Firestore
 */
export function subscribeToFirestoreLiveSync(
  onEntityUpdated: (entityName: string, items: any[]) => void
): () => void {
  const unsubscribes: (() => void)[] = [];

  for (const ent of ALL_ENTITIES) {
    try {
      const docRef = doc(db, DB_COLLECTION, ent);
      const unsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data && Array.isArray(data.items)) {
            onEntityUpdated(ent, data.items);
          }
        }
      }, (err) => {
        if (err?.code === 'resource-exhausted') {
          markQuotaExceeded();
        }
      });
      unsubscribes.push(unsub);
    } catch {}
  }

  return () => {
    unsubscribes.forEach(u => {
      try { u(); } catch {}
    });
  };
}

/**
 * Subscribes to a single entity document changes in Firestore
 */
export function subscribeToSingleEntity(
  entityName: string,
  onUpdated: (items: any[]) => void
): () => void {
  try {
    const docRef = doc(db, DB_COLLECTION, entityName);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.items)) {
          onUpdated(data.items);
        }
      }
    }, (err) => {
      if (err?.code === 'resource-exhausted') {
        markQuotaExceeded();
      }
    });
  } catch {
    return () => {};
  }
}

/**
 * Saves a sync audit log item directly to Firestore
 */
export async function saveAuditLogToFirestore(item: SyncAuditItem): Promise<boolean> {
  if (isFirestoreQuotaExceeded()) return false;
  try {
    const cleanItem = sanitizeForFirestore(item);
    const docRef = doc(db, AUDIT_COLLECTION, cleanItem.id);
    await setDoc(docRef, cleanItem, { merge: true });
    return true;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted') {
      markQuotaExceeded();
      return false;
    }
    console.warn('Error saving audit log to Firestore:', err);
    return false;
  }
}

/**
 * Saves a sync connection issue item directly to Firestore
 */
export async function saveConnectionIssueToFirestore(issue: SyncConnectionIssue): Promise<boolean> {
  if (isFirestoreQuotaExceeded()) return false;
  try {
    const cleanIssue = sanitizeForFirestore(issue);
    const docRef = doc(db, ISSUES_COLLECTION, cleanIssue.id);
    await setDoc(docRef, cleanIssue, { merge: true });
    return true;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted') {
      markQuotaExceeded();
      return false;
    }
    console.warn('Error saving connection issue to Firestore:', err);
    return false;
  }
}

/**
 * Subscribes to live audit logs from Firestore across all devices
 */
export function subscribeToSyncAuditLogsFromFirestore(
  callback: (logs: SyncAuditItem[]) => void
): () => void {
  try {
    const colRef = collection(db, AUDIT_COLLECTION);
    return onSnapshot(colRef, (snap) => {
      const logs: SyncAuditItem[] = [];
      snap.forEach(d => {
        const data = d.data() as SyncAuditItem;
        if (data) logs.push(data);
      });
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(logs.slice(0, 500));
    }, () => {});
  } catch {
    return () => {};
  }
}

/**
 * Subscribes to live connection issues from Firestore across all devices
 */
export function subscribeToSyncConnectionIssuesFromFirestore(
  callback: (issues: SyncConnectionIssue[]) => void
): () => void {
  try {
    const colRef = collection(db, ISSUES_COLLECTION);
    return onSnapshot(colRef, (snap) => {
      const issues: SyncConnectionIssue[] = [];
      snap.forEach(d => {
        const data = d.data() as SyncConnectionIssue;
        if (data) issues.push(data);
      });
      issues.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      callback(issues.slice(0, 200));
    }, () => {});
  } catch {
    return () => {};
  }
}

/**
 * Tests direct live send and receive (ping test) with Firebase Firestore
 */
export async function runLiveFirestorePingTest(): Promise<{
  success: boolean;
  ms: number;
  message: string;
  docId: string;
}> {
  const start = performance.now();
  const testId = 'firestore-ping-' + Date.now();
  try {
    const testDocRef = doc(db, TESTS_COLLECTION, testId);
    const testPayload = sanitizeForFirestore({
      id: testId,
      createdAt: new Date().toISOString(),
      pingTest: true,
      status: 'success',
      details: 'اختبار إرسال واستقبال مباشر وسريع في قاعدة بيانات Firebase Firestore السحابية'
    });

    // 1. Send/Write to Firestore
    await setDoc(testDocRef, testPayload);

    // 2. Read/Receive back from Firestore
    const readSnap = await getDoc(testDocRef);
    const ms = Math.round(performance.now() - start);

    if (readSnap.exists()) {
      return {
        success: true,
        ms,
        docId: testId,
        message: `تم إرسال واستقبال الحركة بنجاح في قاعدة بيانات Firebase Firestore خلال ${ms}ms ⚡`
      };
    } else {
      throw new Error('لم يتم العثور على القيد المسجل بعد الإرسال');
    }
  } catch (err: any) {
    const ms = Math.round(performance.now() - start);
    return {
      success: false,
      ms,
      docId: testId,
      message: `فشل اختبار الاتصال السحابي: ${err?.message || 'خطأ غير معروف'}`
    };
  }
}

/**
 * Fetches the full master database snapshot from Firestore
 */
export async function fetchFullDatabaseFromFirestore(): Promise<Record<string, any[]> | null> {
  if (isFirestoreQuotaExceeded()) return null;
  try {
    const data: Record<string, any[]> = {};
    for (const ent of ALL_ENTITIES) {
      const docRef = doc(db, DB_COLLECTION, ent);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d && Array.isArray(d.items)) {
          data[ent] = d.items;
        }
      }
    }
    return data;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
    return null;
  }
}

export const subscribeToConnectionIssuesFromFirestore = subscribeToSyncConnectionIssuesFromFirestore;

export async function clearAuditLogsFromFirestore(): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  try {
    const snap = await getDocs(collection(db, AUDIT_COLLECTION));
    const promises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (e: any) {
    if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota limit exceeded')) {
      markQuotaExceeded();
      return;
    }
    console.warn('clearAuditLogsFromFirestore notice:', e?.message || e);
  }
}

export async function clearConnectionIssuesFromFirestore(): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;
  try {
    const snap = await getDocs(collection(db, ISSUES_COLLECTION));
    const promises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (e: any) {
    if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota limit exceeded')) {
      markQuotaExceeded();
      return;
    }
    console.warn('clearConnectionIssuesFromFirestore notice:', e?.message || e);
  }
}
