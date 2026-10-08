const fs = require('fs');
const file = 'src/context/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update imports
content = content.replace(
  "import { doc, getDoc, setDoc } from 'firebase/firestore';",
  "import { doc, getDoc, setDoc, writeBatch, collection, getDocs } from 'firebase/firestore';"
);

// 2. Rewrite syncToFirebase
const oldSyncStart = `      const nowStrIso = new Date().toISOString();`;
const oldSyncEnd = `      await Promise.all(promises);`;

const newSync = `      const collectionsToSync = {
        accounts, treasuries, parties, employees, invoices,
        purchases, purchaseReturns, salesReturns, vouchers, printOrders,
        journalEntries, employeeAdvances, employeeDeductions, employeeIncentives,
        payrollSheets, inventory, stockMovements, companies, branches,
        warehouses, warehouseOperations, roles, users, debtClearings
      };
      
      const syncedHashes = JSON.parse(localStorage.getItem('accounting_synced_hashes') || '{}');
      const newHashes = { ...syncedHashes };
      
      let writeCount = 0;
      const batchWrites = [];
      let currentBatch = writeBatch(db);
      
      const hashItem = (item) => JSON.stringify(item);
      const currentKeys = new Set();
      
      for (const [colName, items] of Object.entries(collectionsToSync)) {
         for (const item of items) {
            if (!item || !item.id) continue;
            
            const itemHash = hashItem(item);
            const hashKey = \`\${colName}_\${item.id}\`;
            currentKeys.add(hashKey);
            
            if (syncedHashes[hashKey] !== itemHash) {
               const docRef = doc(db, colName, item.id);
               currentBatch.set(docRef, item);
               newHashes[hashKey] = itemHash;
               writeCount++;
               
               if (writeCount % 400 === 0) {
                  batchWrites.push(currentBatch.commit());
                  currentBatch = writeBatch(db);
               }
            }
         }
      }
      
      const settingsHash = hashItem(settings);
      currentKeys.add('settings_global');
      if (syncedHashes['settings_global'] !== settingsHash) {
         currentBatch.set(doc(db, 'settings', 'global'), settings);
         newHashes['settings_global'] = settingsHash;
         writeCount++;
      }
      
      // Handle deletions
      for (const hashKey of Object.keys(newHashes)) {
         if (!currentKeys.has(hashKey)) {
             const parts = hashKey.split('_');
             const colName = parts[0];
             const id = parts.slice(1).join('_');
             if (colName && id) {
                 currentBatch.delete(doc(db, colName, id));
                 delete newHashes[hashKey];
                 writeCount++;
                 if (writeCount % 400 === 0) {
                    batchWrites.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                 }
             }
         }
      }
      
      if (writeCount % 400 !== 0 && writeCount > 0) {
         batchWrites.push(currentBatch.commit());
      }
      
      await Promise.all(batchWrites);
      localStorage.setItem('accounting_synced_hashes', JSON.stringify(newHashes));`;

// Regex or indexOf replacement for syncToFirebase body
const syncStartIndex = content.indexOf(oldSyncStart);
const syncEndIndex = content.indexOf(oldSyncEnd) + oldSyncEnd.length;

if (syncStartIndex !== -1 && syncEndIndex !== -1) {
  content = content.substring(0, syncStartIndex) + newSync + content.substring(syncEndIndex);
} else {
  console.log("Could not find old syncToFirebase body!");
}

// 3. Rewrite initCloudSync
const oldInitStart = `        // Backwards compatibility check`;
const oldInitEnd = `        } else if (oldSnap.exists()) {
          exists = true;
          data = oldSnap.data();
        }`;

const newInit = `        const collectionsToFetch = [
          'accounts', 'treasuries', 'parties', 'employees', 'invoices',
          'purchases', 'purchaseReturns', 'salesReturns', 'vouchers', 'printOrders',
          'journalEntries', 'employeeAdvances', 'employeeDeductions', 'employeeIncentives',
          'payrollSheets', 'inventory', 'stockMovements', 'companies', 'branches',
          'warehouses', 'warehouseOperations', 'roles', 'users', 'debtClearings'
        ];
        
        let exists = false;
        let data = {};
        
        const promises = collectionsToFetch.map(async (colName) => {
            try {
              const querySnapshot = await getDocs(collection(db, colName));
              if (!querySnapshot.empty) {
                  exists = true;
                  data[colName] = querySnapshot.docs.map(doc => doc.data());
              }
            } catch(e) {
               console.warn(\`Could not fetch \${colName}\`, e);
            }
        });
        
        try {
            const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
            if (settingsSnap.exists()) {
                exists = true;
                data.settings = settingsSnap.data();
            }
        } catch(e) {
            console.warn('Could not fetch settings', e);
        }
        
        await Promise.all(promises);
        
        // Build hashes on initial load so it doesn't immediately overwrite
        if (exists) {
            const newHashes = {};
            for (const [colName, items] of Object.entries(data)) {
                if (Array.isArray(items)) {
                    for (const item of items) {
                        if (item && item.id) {
                            newHashes[\`\${colName}_\${item.id}\`] = JSON.stringify(item);
                        }
                    }
                }
            }
            if (data.settings) {
                newHashes['settings_global'] = JSON.stringify(data.settings);
            }
            localStorage.setItem('accounting_synced_hashes', JSON.stringify(newHashes));
        }

        // Migrate old chunked data if exists is false
        if (!exists) {
            const oldSnap = await getDoc(doc(db, 'appState', 'accountingState'));
            const metaSnap = await getDoc(doc(db, 'appState', 'accountingState_meta'));
            
            if (metaSnap.exists() && metaSnap.data().chunked) {
              exists = true;
              data = {};
              const keys = collectionsToFetch;
              const migratePromises = keys.map(k => getDoc(doc(db, 'appState', \`accountingState_\${k}\`)));
              const snaps = await Promise.all(migratePromises);
              
              snaps.forEach((snap, idx) => {
                if (snap.exists()) {
                  data[keys[idx]] = snap.data().data;
                }
              });
            } else if (oldSnap.exists()) {
              exists = true;
              data = oldSnap.data();
            }
        }`;

const initStartIndex = content.indexOf(oldInitStart);
const initEndIndex = content.indexOf(oldInitEnd) + oldInitEnd.length;

if (initStartIndex !== -1 && initEndIndex !== -1) {
  content = content.substring(0, initStartIndex) + newInit + content.substring(initEndIndex);
} else {
  console.log("Could not find old initCloudSync body!");
}

fs.writeFileSync(file, content);
console.log('AccountingContext.tsx migrated to Collections');
