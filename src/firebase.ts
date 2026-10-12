// Firebase completely disconnected per user request.
// Database & Auth are now 100% local + Google Drive cloud sync exclusively.
// Providing mock implementations for auth and firestore functions to prevent runtime errors.

export const db = {} as any;

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

export const signInWithPopup = async () => ({ user: { email: 'raid.salha@gmail.com' } });
export const signInWithEmailAndPassword = async () => ({ user: { email: 'raid.salha@gmail.com' } });
export const createUserWithEmailAndPassword = async () => ({ user: { email: 'raid.salha@gmail.com' } });
export const sendPasswordResetEmail = async () => {};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  const localId = localStorage.getItem('alnoor_press_accounting_v1_current_user_id');
  if (localId) {
    callback({ email: 'raid.salha@gmail.com', uid: localId });
  } else {
    callback(null);
  }
  return () => {};
};

export const doc = (...args: any[]) => ({}) as any;
export const getDoc = async (...args: any[]) => ({ exists: () => false, data: () => null }) as any;
export const setDoc = async (...args: any[]) => {};
export const deleteDoc = async (...args: any[]) => {};
export const writeBatch = (...args: any[]) => ({
  set: () => {},
  delete: () => {},
  commit: async () => {}
}) as any;
export const collection = (...args: any[]) => ({}) as any;
export const getDocs = async (...args: any[]) => ({ docs: [] }) as any;
export const onSnapshot = (docRef: any, callback: (snap: any) => void) => {
  callback({ exists: () => false, data: () => null });
  return () => {};
};
