const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Add imports
content = content.replace(
  "import React, { useEffect } from 'react';", 
  "import React, { useEffect } from 'react';\nimport { OfflineIndicator } from './components/OfflineIndicator';"
);

// Add to MainLayout render
content = content.replace(
  "<TransactionLifecycleModal />",
  "<TransactionLifecycleModal />\n      <OfflineIndicator />"
);

fs.writeFileSync('src/App.tsx', content);
