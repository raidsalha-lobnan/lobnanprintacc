const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
if (!content.includes('import { LoginView }')) {
  content = content.replace("import { ErrorBoundary } from './components/ErrorBoundary';", "import { ErrorBoundary } from './components/ErrorBoundary';\nimport { LoginView } from './components/LoginView';\nimport { auth } from './firebase';\nimport { onAuthStateChanged, User } from 'firebase/auth';");
}

// Modify App function
const newAppStr = `export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100" dir="rtl">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <AccountingProvider firebaseUser={user}>
      <MainLayout />
    </AccountingProvider>
  );
}`;

content = content.replace(/export default function App\(\) \{\n\s*return \(\n\s*<AccountingProvider>\n\s*<MainLayout \/>\n\s*<\/AccountingProvider>\n\s*\);\n\}/, newAppStr);

fs.writeFileSync(file, content);
