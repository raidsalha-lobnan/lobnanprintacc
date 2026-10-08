import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { setLogLevel, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const fileConfig = (firebaseConfig as any) || {};

// الدمج الذكي بين متغيرات بيئة Vercel وملف الإعدادات الافتراضي
const resolvedFirebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fileConfig.projectId || 'gen-lang-client-0984774155',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fileConfig.appId || '',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fileConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || `${fileConfig.projectId || 'gen-lang-client-0984774155'}.firebaseapp.com`,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fileConfig.storageBucket || `${fileConfig.projectId || 'gen-lang-client-0984774155'}.firebasestorage.app`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fileConfig.messagingSenderId || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fileConfig.measurementId || '',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || 'ai-studio-remixcopyofcopyo-917f7ef2-bd2e-44c7-b6f8-f5661310c7a9'
};

const app = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);

const config = resolvedFirebaseConfig as any;

// تفعيل العمل بدون إنترنت (Offline Persistence) مع دعم فتح البرنامج في أكثر من تبويب
let firestoreDb;
setLogLevel('silent'); // Suppress verbose connection warnings in console
try {
  firestoreDb = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)' ? config.firestoreDatabaseId : undefined);
} catch (e) {
  try {
    firestoreDb = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);
  } catch (err) {
    firestoreDb = getFirestore(app);
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);

// فحص الاتصال بقاعدة بيانات Firestore للتحقق من الاتصال السحابي الحي
import { doc, getDocFromServer } from 'firebase/firestore';

async function testConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    console.log('Firebase Cloud Firestore connection active and verified.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration: client is operating in offline mode.");
    }
  }
}
testConnection();



