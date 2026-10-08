const fs = require('fs');
const file = 'src/components/LoginView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Change export const LoginView: React.FC = () => {
content = content.replace(
  "export const LoginView: React.FC = () => {",
  "export const LoginView: React.FC<{ onLocalLogin?: (id: string) => void }> = ({ onLocalLogin }) => {"
);

// Add local login submit handler
const localSubmitCode = `
  const handleLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Fetch local users
    const localData = localStorage.getItem('alnoor_press_accounting_v1_users');
    let users = [];
    try {
      users = localData ? JSON.parse(localData) : [];
    } catch(e) {}
    
    const user = users.find((u: any) => (u.email === email || u.username === email) && u.password === password);
    if (user) {
      localStorage.setItem('alnoor_press_accounting_v1_current_user_id', user.id);
      if (onLocalLogin) {
        onLocalLogin(user.id);
      } else {
        window.location.reload();
      }
    } else {
      setError('البريد الإلكتروني/اسم المستخدم أو كلمة المرور غير صحيحة');
    }
  };
`;

content = content.replace("const handleSubmit = async (e: React.FormEvent) => {", localSubmitCode + "\n  const handleSubmit = async (e: React.FormEvent) => {");

// Replace the <div className="space-y-4"> block in LoginView with the dual form
const newForm = `
        <form onSubmit={handleLocalSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">اسم المستخدم / البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-2.5 h-5 w-5 text-slate-400" />
              <input
                type="text"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left outline-none font-mono"
                placeholder="email@example.com"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">كلمة المرور</label>
            <div className="relative">
              <KeyRound className="absolute right-3 top-2.5 h-5 w-5 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-left outline-none font-mono"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <LogIn className="w-5 h-5" />
            <span>تسجيل الدخول للموظفين</span>
          </button>
          
          <div className="relative flex items-center py-4">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-semibold">أو للمدير فقط</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-lg">دخول المدير (Google)</span>
              </>
            )}
          </button>
        </form>
`;

content = content.replace(/<div className="space-y-4">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, newForm + "\n      </div>\n    </div>");

fs.writeFileSync(file, content);
