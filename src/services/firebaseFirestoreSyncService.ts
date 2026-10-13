import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  collection,
  getDocs,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { syncAuditService, SyncAuditItem, SyncConnectionIssue } from './syncAuditService';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Multiple tabs open, persistence enabled in first tab only.');
    } else if (err.code === 'unimplemented') {
        console.warn('Browser does not support offline persistence.');
    }
});

const DB_COLLECTION = 'lobnan_accounting_db';
const AUDIT_COLLECTION = 'lobnan_accounting_sync_audit_logs';
const ISSUES_COLLECTION = 'lobnan_accounting_sync_connection_issues';
const TESTS_COLLECTION = 'lobnan_accounting_sync_tests';

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

/**
 * Saves a single entity's list of items to Firestore
 */
export async function saveEntityToFirestore(entityName: string, items: any[]): Promise<boolean> {
  try {
    const docRef = doc(db, DB_COLLECTION, entityName);
    await setDoc(docRef, {
      items: items || [],
      updatedAt: new Date().toISOString(),
      count: (items || []).length
    }, { merge: true });

    syncAuditService.logEvent({
      direction: 'push',
      entity: entityName,
      op: 'upsert',
      status: 'success',
      details: `تم حفظ ${items.length} عنصر في سحابة Firebase Firestore بنجاح 🟢`
    });

    return true;
  } catch (error: any) {
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
  try {
    const promises = ALL_ENTITIES.map(async (ent) => {
      const items = Array.isArray(fullSnapshot[ent]) ? fullSnapshot[ent] : [];
      const docRef = doc(db, DB_COLLECTION, ent);
      return setDoc(docRef, {
        items,
        updatedAt: new Date().toISOString(),
        count: items.length || 0
      }, { merge: true });
    });

    await Promise.all(promises);

    syncAuditService.logEvent({
      direction: 'push',
      entity: 'master_db',
      op: 'full_sync',
      status: 'success',
      details: 'تم رفع قاعدة البيانات الشاملة بالكامل إلى سحابة Firebase Firestore مجاناً وبدون قيود ✅'
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error pushing full DB to Firestore:', err);
    return { success: false, error: err?.message || 'فشل مزامنة Firestore' };
  }
}

/**
 * Fetches all entity snapshots from Firestore once
 */
export async function fetchFullDatabaseFromFirestore(): Promise<Record<string, any[]> | null> {
  try {
    const snapshot: Record<string, any[]> = {};
    const promises = ALL_ENTITIES.map(async (ent) => {
      const docRef = doc(db, DB_COLLECTION, ent);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.items)) {
          snapshot[ent] = data.items;
        }
      }
    });

    await Promise.all(promises);
    return snapshot;
  } catch (err) {
    console.error('Error fetching full DB from Firestore:', err);
    return null;
  }
}

/**
 * Subscribes to live real-time Firestore snapshot updates for a single entity
 */
export function subscribeToSingleEntity(
  entityName: string,
  onUpdate: (items: any[]) => void
): () => void {
  const docRef = doc(db, DB_COLLECTION, entityName);
  return onSnapshot(docRef, (snap) => {
    console.log(`Firestore update for ${entityName}:`, snap.exists() ? `${snap.data()?.items?.length || 0} items` : 'does not exist');
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.items)) {
        onUpdate(data.items);
      }
    }
  }, (err) => {
    console.error(`Firestore snapshot error for ${entityName}:`, err);
  });
}

/**
 * Subscribes to live real-time Firestore snapshot updates across all devices
 */
export function subscribeToFirestoreLiveSync(
  onEntityUpdated: (entityName: string, items: any[]) => void
): () => void {
  const unsubscribes: (() => void)[] = [];

  ALL_ENTITIES.forEach((ent) => {
    const unsub = subscribeToSingleEntity(ent, (items) => onEntityUpdated(ent, items));
    unsubscribes.push(unsub);
  });

  return () => {
    unsubscribes.forEach((fn) => fn());
  };
}

/**
 * Saves a sync audit log item directly to Firestore
 */
export async function saveAuditLogToFirestore(item: SyncAuditItem): Promise<boolean> {
  try {
    const docRef = doc(db, AUDIT_COLLECTION, item.id);
    await setDoc(docRef, item, { merge: true });
    return true;
  } catch (err) {
    console.warn('Error saving audit log to Firestore:', err);
    return false;
  }
}

/**
 * Saves a sync connection issue item directly to Firestore
 */
export async function saveConnectionIssueToFirestore(issue: SyncConnectionIssue): Promise<boolean> {
  try {
    const docRef = doc(db, ISSUES_COLLECTION, issue.id);
    await setDoc(docRef, issue, { merge: true });
    return true;
  } catch (err) {
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
  const colRef = collection(db, AUDIT_COLLECTION);
  return onSnapshot(colRef, (snapshot) => {
    const logs: SyncAuditItem[] = [];
    snapshot.forEach((d) => {
      logs.push(d.data() as SyncAuditItem);
    });
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(logs);
  }, (err) => {
    console.warn('Audit logs snapshot listener error:', err);
  });
}

/**
 * Subscribes to live connection issues from Firestore across all devices
 */
export function subscribeToConnectionIssuesFromFirestore(
  callback: (issues: SyncConnectionIssue[]) => void
): () => void {
  const colRef = collection(db, ISSUES_COLLECTION);
  return onSnapshot(colRef, (snapshot) => {
    const issues: SyncConnectionIssue[] = [];
    snapshot.forEach((d) => {
      issues.push(d.data() as SyncConnectionIssue);
    });
    issues.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(issues);
  }, (err) => {
    console.warn('Connection issues snapshot listener error:', err);
  });
}

/**
 * Clears audit logs from Firestore
 */
export async function clearAuditLogsFromFirestore(): Promise<boolean> {
  try {
    const colRef = collection(db, AUDIT_COLLECTION);
    const snap = await getDocs(colRef);
    const promises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.warn('Error clearing audit logs in Firestore:', err);
    return false;
  }
}

/**
 * Clears connection issues from Firestore
 */
export async function clearConnectionIssuesFromFirestore(): Promise<boolean> {
  try {
    const colRef = collection(db, ISSUES_COLLECTION);
    const snap = await getDocs(colRef);
    const promises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.warn('Error clearing connection issues in Firestore:', err);
    return false;
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
    const testPayload = {
      id: testId,
      createdAt: new Date().toISOString(),
      pingTest: true,
      status: 'success',
      details: 'اختبار إرسال واستقبال مباشر وسريع في قاعدة بيانات Firebase Firestore السحابية'
    };

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
      message: `فشل اختبار المزامنة في Firebase Firestore: ${err?.message || err}`
    };
  }
}
