const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { doc, onSnapshot }')) {
  content = content.replace(
    "import { onAuthStateChanged, User } from 'firebase/auth';",
    "import { onAuthStateChanged, User } from 'firebase/auth';\nimport { doc, onSnapshot } from 'firebase/firestore';\nimport { db } from './firebase';"
  );
}

const target = `  const isAuth = !!firebaseUser || !!localUserId;

  if (!isAuth) {`;

const replacement = `  const isAuth = !!firebaseUser || !!localUserId;

  React.useEffect(() => {
    if (!isAuth) return;

    const sessionDocId = firebaseUser?.email ? firebaseUser.email.toLowerCase() : localUserId;
    if (!sessionDocId) return;

    const unsub = onSnapshot(doc(db, 'userSessions', sessionDocId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const activeLocalSession = localStorage.getItem('active_session_id');
        
        // If there's an active session in Firestore and it doesn't match this device's session
        if (data.sessionId && activeLocalSession && data.sessionId !== activeLocalSession) {
          alert('عذراً، تم تسجيل الدخول إلى هذا الحساب من جهاز آخر. سيتم تسجيل خروجك الآن لضمان أمان حسابك.');
          if (firebaseUser) {
            import('./firebase').then(({ auth }) => auth.signOut());
          }
          localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');
          localStorage.removeItem('active_session_id');
          setLocalUserId(null);
          setFirebaseUser(null);
        }
      }
    });

    return () => unsub();
  }, [isAuth, firebaseUser, localUserId]);

  if (!isAuth) {`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
