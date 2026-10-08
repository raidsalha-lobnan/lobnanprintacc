const fs = require('fs');
const file = 'src/context/AccountingContext.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `  // Sync Firebase user to System User
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
          status: 'active',
          createdAt: new Date().toISOString()
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

const replaceStr = `  // Sync Firebase user to System User
  useEffect(() => {
    const fUser = auth.currentUser;
    if (fUser && fUser.email) {
      const isOwner = fUser.email.toLowerCase() === 'lobnanprint@gmail.com';
      const existingUser = users.find(u => u.email === fUser.email || u.username === fUser.email);
      
      if (existingUser) {
        // Automatically upgrade owner to full admin
        if (isOwner && existingUser.roleId !== 'role-admin') {
          setUsers(prev => {
            const updated = prev.map(u => u.id === existingUser.id ? { ...u, roleId: 'role-admin', allowedBranchIds: ['*'] } : u);
            localStorage.setItem(\`\${STORAGE_KEY}_users\`, JSON.stringify(updated));
            return updated;
          });
        }
        if (currentUserId !== existingUser.id) {
           setCurrentUserId(existingUser.id);
        }
      } else {
        // Create new user for this email
        const newUser: SystemUser = {
          id: 'user-' + Date.now(),
          companyId: 'comp-1',
          username: fUser.email,
          email: fUser.email,
          fullName: fUser.displayName || fUser.email.split('@')[0],
          roleId: isOwner ? 'role-admin' : 'role-cashier', 
          defaultBranchId: 'br-1',
          allowedBranchIds: isOwner ? ['*'] : ['br-1'],
          status: 'active',
          createdAt: new Date().toISOString()
        };
        setUsers(prev => {
          const updated = [...prev, newUser];
          localStorage.setItem(\`\${STORAGE_KEY}_users\`, JSON.stringify(updated));
          return updated;
        });
        setCurrentUserId(newUser.id);
      }
    }
  }, [auth.currentUser?.email, currentUserId, users.length]);`;

content = content.replace(targetStr, replaceStr);

fs.writeFileSync(file, content);
