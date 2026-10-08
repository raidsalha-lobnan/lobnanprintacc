import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from 'fs';

const raw = fs.readFileSync('firebase-applet-config.json', 'utf-8');
const config = JSON.parse(raw);

const app = initializeApp(config.firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDoc(doc(db, 'settings', 'global'));
  if (snap.exists()) {
    console.log("Settings exist:", snap.data());
  } else {
    console.log("Settings DO NOT exist in Firebase!");
  }
}
check();
