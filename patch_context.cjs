const fs = require('fs');
let text = fs.readFileSync('src/context/AccountingContext.tsx', 'utf8');

if (!text.includes('localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(settings));')) {
  console.log("Settings is not being saved properly!");
} else {
  console.log("Settings is saved properly.");
}

