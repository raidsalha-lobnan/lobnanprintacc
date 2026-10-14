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
  limit
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
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  try {
    firestoreInstance = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = firestoreInstance;

console.log("Firestore initialized with database ID:", firebaseConfig.firestoreDatabaseId || '(default)');

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
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  limit
};
