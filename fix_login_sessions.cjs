const fs = require('fs');
const file = 'src/components/LoginView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('firebase/firestore')) {
  content = content.replace(
    "import { Lock, Mail, KeyRound, ArrowRight, UserPlus, LogIn, AlertCircle } from 'lucide-react';",
    "import { Lock, Mail, KeyRound, ArrowRight, UserPlus, LogIn, AlertCircle } from 'lucide-react';\nimport { db } from '../firebase';\nimport { doc, setDoc } from 'firebase/firestore';"
  );
}

// Update handleGoogleSignIn
const googleTarget = `      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {`;
const googleReplacement = `      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      if (res.user && res.user.email) {
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        localStorage.setItem('active_session_id', sessionId);
        await setDoc(doc(db, 'userSessions', res.user.email.toLowerCase()), { sessionId, timestamp: Date.now() });
      }
    } catch (err: any) {`;
content = content.replace(googleTarget, googleReplacement);

// Update handleLocalSubmit
const localSubmitTarget = `  const handleLocalSubmit = (e: React.FormEvent) => {`;
const localSubmitReplacement = `  const handleLocalSubmit = async (e: React.FormEvent) => {`;
content = content.replace(localSubmitTarget, localSubmitReplacement);

const localSuccessTarget = `    if (user) {
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', user.id);
      if (onLocalLogin) {`;
const localSuccessReplacement = `    if (user) {
      const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem('active_session_id', sessionId);
      try {
        await setDoc(doc(db, 'userSessions', user.id), { sessionId, timestamp: Date.now() });
      } catch(e) { console.error("Firestore session error:", e); }
      
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', user.id);
      if (onLocalLogin) {`;
content = content.replace(localSuccessTarget, localSuccessReplacement);

fs.writeFileSync(file, content);
