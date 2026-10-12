// Firebase completely disconnected per user request.
// Database & Auth are now 100% local + Google Drive cloud sync exclusively.
// Providing mock implementations for auth and firestore functions to prevent runtime errors.

export const db = {
  type: 'mock-firestore',
  app: { name: '[DEFAULT]' }
} as any;

export const auth = {
  currentUser: null,
  signOut: async () => {
    localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');
    localStorage.removeItem('active_session_id');
    localStorage.removeItem('auth_type');
  }
} as any;

export class GoogleAuthProvider {
  addScope() { return this; }
  setCustomParameters() { return this; }
  static credentialFromResult(result: any) {
    return { accessToken: result?.accessToken };
  }
}

export const signInWithPopup = async (..._args: any[]) => ({ user: { email: 'raid.salha@gmail.com' } });
export const signInWithEmailAndPassword = async (..._args: any[]) => ({ user: { email: 'raid.salha@gmail.com' } });
export const createUserWithEmailAndPassword = async (..._args: any[]) => ({ user: { email: 'raid.salha@gmail.com' } });
export const sendPasswordResetEmail = async (..._args: any[]) => {};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  const localId = localStorage.getItem('alnoor_press_accounting_v1_current_user_id');
  if (localId) {
    callback({ email: 'raid.salha@gmail.com', uid: localId });
  } else {
    callback(null);
  }
  return () => {};
};

export const doc = (...args: any[]) => {
  const id = String(args[args.length - 1] || 'mock-id');
  return {
    id,
    path: args.slice(1).join('/'),
    type: 'document'
  } as any;
};

export const collection = (...args: any[]) => {
  const colName = String(args[args.length - 1] || 'mock-col');
  return {
    id: colName,
    path: colName,
    type: 'collection'
  } as any;
};

export const getDoc = async (docRef?: any) => ({
  exists: () => false,
  data: () => null,
  id: docRef?.id || ''
}) as any;

export const getDocs = async (_colRef?: any) => ({
  empty: true,
  docs: [] as any[],
  size: 0,
  forEach: (_cb: any) => {}
}) as any;

export const setDoc = async (..._args: any[]) => Promise.resolve();
export const deleteDoc = async (..._args: any[]) => Promise.resolve();

export const writeBatch = (_db?: any) => ({
  set: () => {},
  delete: () => {},
  commit: async () => Promise.resolve()
}) as any;

export const onSnapshot = (...args: any[]): (() => void) => {
  const callback = typeof args[1] === 'function' ? args[1] : (typeof args[2] === 'function' ? args[2] : null);
  if (callback) {
    try {
      callback({
        exists: () => false,
        data: () => null,
        empty: true,
        docs: [] as any[]
      });
    } catch {}
  }
  return () => {};
};
