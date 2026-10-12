import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { syncAuditService } from './syncAuditService';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

const DB_COLLECTION = 'lobnan_accounting_db';

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
    syncAuditService.logConnectionIssue({
      endpoint: `Firestore/${entityName}`,
      statusCode: 500,
      errorMessage: error?.message || 'فشل الحفظ في Firestore',
      contextInfo: `حفظ ${entityName}`
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
      const items = fullSnapshot[ent] || [];
      const docRef = doc(db, DB_COLLECTION, ent);
      return setDoc(docRef, {
        items,
        updatedAt: new Date().toISOString(),
        count: items.length
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
 * Subscribes to live real-time Firestore snapshot updates across all devices
 */
export function subscribeToFirestoreLiveSync(
  onEntityUpdated: (entityName: string, items: any[]) => void
): () => void {
  const unsubscribes: (() => void)[] = [];

  ALL_ENTITIES.forEach((ent) => {
    const docRef = doc(db, DB_COLLECTION, ent);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.items)) {
          onEntityUpdated(ent, data.items);
          syncAuditService.logEvent({
            direction: 'pull',
            entity: ent,
            op: 'live_snapshot',
            status: 'success',
            details: `استقبال تحديث حي لمجموعة ${ent} (${data.items.length} عنصر) من Firebase Firestore ⚡`
          });
        }
      }
    }, (err) => {
      console.error(`Firestore snapshot error for ${ent}:`, err);
    });
    unsubscribes.push(unsub);
  });

  return () => {
    unsubscribes.forEach((fn) => fn());
  };
}
