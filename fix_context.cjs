const fs = require('fs');
const file = 'src/context/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf8');

// add auth import
if (!content.includes("import { auth } from '../firebase';")) {
  content = content.replace("import React, { createContext, useContext, useState, useEffect } from 'react';", "import React, { createContext, useContext, useState, useEffect } from 'react';\nimport { auth } from '../firebase';");
}

// modify currentUserId state
const usersRegex = /const \[users, setUsers\] = useState<SystemUser\[\]>\(\(\) => \{\n\s*return safeLoadArray\(`\$\{STORAGE_KEY\}_users`, DEFAULT_SYSTEM_USERS\);\n\s*\}\);/;

const newUsersStr = `const [users, setUsers] = useState<SystemUser[]>(() => {
    return safeLoadArray(\`\${STORAGE_KEY}_users\`, DEFAULT_SYSTEM_USERS);
  });

  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem(\`\${STORAGE_KEY}_current_user_id\`) || 'user-admin';
  });

  // Sync Firebase user to System User
  useEffect(() => {
    const fUser = auth.currentUser;
    if (fUser && fUser.email) {
      const existingUser = users.find(u => u.email === fUser.email || u.username === fUser.email);
      if (existingUser) {
        if (currentUserId !== existingUser.id) {
           setCurrentUserId(existingUser.id);
        }
      } else {
        // Create new user for this email with basic permissions if not exists
        const newUser: SystemUser = {
          id: 'user-' + Date.now(),
          companyId: 'comp-1',
          username: fUser.email,
          email: fUser.email,
          fullName: fUser.displayName || fUser.email.split('@')[0],
          roleId: 'role-cashier', // Default role for new users
          defaultBranchId: 'branch-1',
          allowedBranchIds: ['branch-1'],
          status: 'active'
        };
        setUsers(prev => {
          const updated = [...prev, newUser];
          localStorage.setItem(\`\${STORAGE_KEY}_users\`, JSON.stringify(updated));
          return updated;
        });
        setCurrentUserId(newUser.id);
      }
    }
  }, [auth.currentUser?.email, users]);`;

content = content.replace(/const \[users, setUsers\] = useState<SystemUser\[\]>\(\(\) => \{\n\s*return safeLoadArray\(`\$\{STORAGE_KEY\}_users`, DEFAULT_SYSTEM_USERS\);\n\s*\}\);\n\s*const \[currentUserId, setCurrentUserId\] = useState<string>\(\(\) => \{\n\s*return localStorage\.getItem\(`\$\{STORAGE_KEY\}_current_user_id`\) \|\| 'user-admin';\n\s*\}\);/m, newUsersStr);

fs.writeFileSync(file, content);
