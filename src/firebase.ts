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
  onSnapshot
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

// Silence non-fatal internal SDK connection warnings (e.g. 10s backend unreachable notice)
try {
  setLogLevel('error');
} catch {}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

console.log("Firebase initialized.");

export const auth = getAuth(app);

// Initialize Firestore with auto-detect long-polling for high stability in iframes & sandboxes
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
  onSnapshot
};
