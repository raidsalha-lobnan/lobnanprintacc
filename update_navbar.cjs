const fs = require('fs');

let content = fs.readFileSync('src/components/Navbar.tsx', 'utf-8');

// Add import
content = content.replace(
  "import React, { useState, useRef, useEffect } from 'react';", 
  "import React, { useState, useRef, useEffect } from 'react';\nimport { PWAInstallButton } from './PWAInstallButton';"
);

// Add button
content = content.replace(
  "{/* Right / Fast Action Toolbar & User */}\n        <div className=\"flex items-center gap-2\">",
  "{/* Right / Fast Action Toolbar & User */}\n        <div className=\"flex items-center gap-2\">\n          <PWAInstallButton />"
);

fs.writeFileSync('src/components/Navbar.tsx', content);
