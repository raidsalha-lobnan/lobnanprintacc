const fs = require('fs');

let content = fs.readFileSync('src/components/HomeScreenView.tsx', 'utf-8');

// add imports
if (!content.includes('MobileHomeScreen')) {
    content = content.replace(
        "import React, { useState } from 'react';",
        "import React, { useState } from 'react';\nimport { MobileHomeScreen } from './MobileHomeScreen';\nimport { useIsMobile } from '../hooks/useIsMobile';"
    );
}

// Update component
content = content.replace(
    "const recentInvoices = (invoices || []).slice(0, 4);\n  const recentPrintJobs = (printOrders || []).slice(0, 3);\n\n  return (",
    "const recentInvoices = (invoices || []).slice(0, 4);\n  const recentPrintJobs = (printOrders || []).slice(0, 3);\n\n  const isMobile = useIsMobile();\n\n  if (isMobile) {\n    return <MobileHomeScreen />;\n  }\n\n  return ("
);

fs.writeFileSync('src/components/HomeScreenView.tsx', content);
