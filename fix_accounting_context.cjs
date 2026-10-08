const fs = require('fs');
let text = fs.readFileSync('src/context/AccountingContext.tsx', 'utf8');

const replacement = `
    const sqlServerConfig = loaded.sqlServerConfig || initialSettings.sqlServerConfig || {
      enabled: false,
      serverUrl: 'http://localhost:3000/api/sync',
      dbType: 'postgres',
      dbName: 'alnoor_press_db',
      autoSync: false,
      syncIntervalMinutes: 30
    };
    
    // Ensure categories exists (if undefined, set from initialSettings)
    const categories = loaded.categories !== undefined ? loaded.categories : initialSettings.categories;

    return {
      ...loaded,
      currency,
      baseCurrencyCode,
      currencies,
      sqlServerConfig,
      categories
    };
`;

text = text.replace(/const sqlServerConfig = loaded\.sqlServerConfig[\s\S]*?return \{[\s\S]*?\};/m, replacement);
fs.writeFileSync('src/context/AccountingContext.tsx', text);
