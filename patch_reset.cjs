const fs = require('fs');
let text = fs.readFileSync('src/context/AccountingContext.tsx', 'utf8');

const search = `setVouchers(initialVouchers);
      localStorage.clear();
    }
  };`;

const replacement = `setVouchers(initialVouchers);
      const hashes = localStorage.getItem('accounting_synced_hashes');
      localStorage.clear();
      if (hashes) {
        localStorage.setItem('accounting_synced_hashes', hashes);
      }
      setTimeout(() => {
         if (syncToFirebaseRef.current) {
            syncToFirebaseRef.current(true);
         }
      }, 500);
    }
  };`;

text = text.replace(search, replacement);
fs.writeFileSync('src/context/AccountingContext.tsx', text);
