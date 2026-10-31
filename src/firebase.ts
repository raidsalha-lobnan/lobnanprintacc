import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

// Silence non-fatal internal SDK connection warnings (e.g. 10s backend unreachable notice)
try {
  setLogLevel('error');
} catch {}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

console.log("Firebase initialized.");

export const auth = getAuth(app);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    try {
      firestoreInstance = initializeFirestore(app, {
        experimentalForceLongPolling: true
      }, firebaseConfig.firestoreDatabaseId);
    } catch {
      firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = firestoreInstance;

console.log("Firestore initialized with persistent local cache & database ID:", firebaseConfig.firestoreDatabaseId || '(default)');

import { firebaseQuotaTracker } from './services/firebaseQuotaTracker';

// Tracked wrappers for real-time accurate quota metering with preserved TypeScript overloaded signatures
const trackedGetDoc = (async (...args: any[]) => {
  const snapshot = await (getDoc as any)(...args);
  if (snapshot && snapshot.metadata?.fromCache !== true) {
    firebaseQuotaTracker.trackRead(1);
  }
  return snapshot;
}) as typeof getDoc;

const trackedGetDocFromServer = ((...args: any[]) => {
  firebaseQuotaTracker.trackRead(1);
  return (getDocFromServer as any)(...args);
}) as typeof getDocFromServer;

const trackedGetDocs = (async (...args: any[]) => {
  const snapshot = await (getDocs as any)(...args);
  if (snapshot) {
    const fromCache = snapshot.metadata?.fromCache === true;
    if (!fromCache) {
      if (snapshot.docs) {
        firebaseQuotaTracker.trackRead(snapshot.docs.length || 1);
      } else {
        firebaseQuotaTracker.trackRead(1);
      }
    }
  }
  return snapshot;
}) as typeof getDocs;

const trackedSetDoc = ((...args: any[]) => {
  firebaseQuotaTracker.trackWrite(1);
  return (setDoc as any)(...args);
}) as typeof setDoc;

const trackedDeleteDoc = ((...args: any[]) => {
  firebaseQuotaTracker.trackDelete(1);
  return (deleteDoc as any)(...args);
}) as typeof deleteDoc;

const trackedOnSnapshot = ((...args: any[]) => {
  // Find listener callback function in arguments
  let callbackIndex = -1;
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] === 'function') {
      callbackIndex = i;
      break;
    }
  }

  if (callbackIndex !== -1) {
    const originalCallback = args[callbackIndex];
    args[callbackIndex] = (snapshot: any) => {
      if (snapshot) {
        // If snapshot data is served from local IndexedDB cache, 0 cloud quota is consumed!
        const fromCache = snapshot.metadata?.fromCache === true;
        if (!fromCache) {
          if (typeof snapshot.docChanges === 'function') {
            const changes = snapshot.docChanges();
            if (changes && changes.length > 0) {
              const serverChanges = changes.filter((c: any) => !c.doc?.metadata?.hasPendingWrites);
              if (serverChanges.length > 0) {
                firebaseQuotaTracker.trackRead(serverChanges.length);
              }
            }
          } else if (snapshot.docs) {
            firebaseQuotaTracker.trackRead(snapshot.docs.length);
          }
        }
      }
      return originalCallback(snapshot);
    };
  }

  return (onSnapshot as any)(...args);
}) as typeof onSnapshot;

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  doc,
  collection,
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
  trackedSetDoc as setDoc,
  trackedDeleteDoc as deleteDoc,
  writeBatch,
  trackedOnSnapshot as onSnapshot,
  query,
  where,
  orderBy,
  limit,
  trackedGetDocFromServer as getDocFromServer
};
