const fs = require('fs');
const file = 'src/context/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update syncToFirebase
const oldSync = `      const stateToSave = {
        settings,
        accounts,
        treasuries,
        parties,
        employees,
        invoices,
        purchases,
        purchaseReturns,
        salesReturns,
        vouchers,
        printOrders,
        journalEntries,
        employeeAdvances,
        employeeDeductions,
        employeeIncentives,
        payrollSheets,
        inventory,
        stockMovements,
        companies,
        branches,
        warehouses,
        warehouseOperations,
        roles,
        users,
        debtClearings,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'appState', 'accountingState'), stateToSave);`;

const newSync = `      const nowStrIso = new Date().toISOString();
      const chunks = {
        settings, accounts, treasuries, parties, employees, invoices,
        purchases, purchaseReturns, salesReturns, vouchers, printOrders,
        journalEntries, employeeAdvances, employeeDeductions, employeeIncentives,
        payrollSheets, inventory, stockMovements, companies, branches,
        warehouses, warehouseOperations, roles, users, debtClearings
      };
      
      const promises = Object.entries(chunks).map(([key, value]) => 
        setDoc(doc(db, 'appState', \`accountingState_\${key}\`), { data: value, updatedAt: nowStrIso })
      );
      
      // Also update the main document for backwards compatibility / simple checking
      promises.push(setDoc(doc(db, 'appState', 'accountingState_meta'), { updatedAt: nowStrIso, chunked: true }));
      
      await Promise.all(promises);`;

content = content.replace(oldSync, newSync);


// 2. Update initCloudSync
const oldLoad = `      try {
        const snap = await getDoc(doc(db, 'appState', 'accountingState'));
        if (isMounted && snap.exists()) {
          const data = snap.data();
          if (hadUnsynced) {
            console.log('Preserving offline local changes: syncing to cloud database...');
            await syncToFirebaseRef.current?.(true);
          } else if (data) {`;

const newLoad = `      try {
        // Backwards compatibility check
        const oldSnap = await getDoc(doc(db, 'appState', 'accountingState'));
        const metaSnap = await getDoc(doc(db, 'appState', 'accountingState_meta'));
        
        let data = null;
        let exists = false;

        if (metaSnap.exists() && metaSnap.data().chunked) {
          exists = true;
          data = {};
          const keys = [
            'settings', 'accounts', 'treasuries', 'parties', 'employees',
            'invoices', 'purchases', 'purchaseReturns', 'salesReturns',
            'vouchers', 'printOrders', 'journalEntries', 'employeeAdvances',
            'employeeDeductions', 'employeeIncentives', 'payrollSheets',
            'inventory', 'stockMovements', 'companies', 'branches',
            'warehouses', 'warehouseOperations', 'roles', 'users', 'debtClearings'
          ];
          const promises = keys.map(k => getDoc(doc(db, 'appState', \`accountingState_\${k}\`)));
          const snaps = await Promise.all(promises);
          
          snaps.forEach((snap, idx) => {
            if (snap.exists()) {
              data[keys[idx]] = snap.data().data;
            }
          });
        } else if (oldSnap.exists()) {
          exists = true;
          data = oldSnap.data();
        }

        if (isMounted && exists) {
          if (hadUnsynced) {
            console.log('Preserving offline local changes: syncing to cloud database...');
            await syncToFirebaseRef.current?.(true);
          } else if (data) {`;

content = content.replace(oldLoad, newLoad);

// 3. Fix the else block for not exists
const oldElse = `        } else if (isMounted && !snap.exists()) {
          await syncToFirebaseRef.current?.(true);
        }`;

const newElse = `        } else if (isMounted && !exists) {
          await syncToFirebaseRef.current?.(true);
        }`;

content = content.replace(oldElse, newElse);

fs.writeFileSync(file, content);
console.log('AccountingContext.tsx patched successfully');
