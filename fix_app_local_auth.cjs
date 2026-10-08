const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// We need to add local user state.
const newAppStr = `export default function App() {
  const [firebaseUser, setFirebaseUser] = React.useState<User | null>(null);
  const [localUserId, setLocalUserId] = React.useState<string | null>(localStorage.getItem('alnoor_press_accounting_v1_current_user_id'));
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
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

  const isAuth = !!firebaseUser || !!localUserId;

  if (!isAuth) {
    return <LoginView onLocalLogin={(id) => setLocalUserId(id)} />;
  }

  return (
    <AccountingProvider firebaseUser={firebaseUser} localUserId={localUserId}>
      <MainLayout />
    </AccountingProvider>
  );
}`;

content = content.replace(/export default function App\(\) \{[\s\S]*\}\n*$/, newAppStr + "\n");

fs.writeFileSync(file, content);
