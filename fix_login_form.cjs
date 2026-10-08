const fs = require('fs');
const file = 'src/components/LoginView.tsx';
let content = fs.readFileSync(file, 'utf8');

// The user is getting "To manage sign-in methods, ask a project owner for the necessary permission"
// This implies they can't even open the Firebase console because they are not the project owner, or it's an AI Studio managed project where they don't have IAM permissions to add email/password.
// Since it's a managed project (rich-web-kq6d2), they literally cannot add Email/Password.
// The ONLY valid login method is Google Auth.
// I MUST remove the Email/Password fields entirely to prevent them from hitting this error again.

const formStart = `<form onSubmit={handleSubmit} className="space-y-4">`;
const formEnd = `</form>`;

const newForm = `
        <div className="space-y-4">
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
                <span className="text-lg">تسجيل الدخول باستخدام جوجل</span>
              </>
            )}
          </button>
        </div>
`;

content = content.replace(/<form onSubmit=\{handleSubmit\} className="space-y-4">[\s\S]*?<\/form>/, newForm);

// Also remove the "Don't have an account" toggle at the bottom since Google Sign In handles both
const toggleSection = `<div className="mt-8 text-center text-sm">
          <span className="text-slate-500">
            {isLogin ? 'ليس لديك حساب بعد؟' : 'لديك حساب بالفعل؟'}
          </span>
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="mr-2 font-bold text-blue-600 hover:text-blue-800"
          >
            {isLogin ? 'إنشاء حساب' : 'تسجيل الدخول'}
          </button>
        </div>`;

content = content.replace(toggleSection, '');

fs.writeFileSync(file, content);
