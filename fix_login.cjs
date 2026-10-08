const fs = require('fs');
const file = 'src/components/LoginView.tsx';
let content = fs.readFileSync(file, 'utf8');

// I will add an errorCode state to allow conditional rendering of the link.
content = content.replace("const [error, setError] = useState('');", "const [error, setError] = useState('');\n  const [errorCode, setErrorCode] = useState('');");

content = content.replace("setError('');\n    setLoading(true);", "setError('');\n    setErrorCode('');\n    setLoading(true);");

content = content.replace("} catch (err: any) {\n      console.error(err);", "} catch (err: any) {\n      console.error(err);\n      setErrorCode(err.code);");

const specificErrorLogic = `if (err.code === 'auth/operation-not-allowed') {
         setError('تسجيل الدخول بالبريد غير مفعل في Firebase. يرجى تفعيله من لوحة التحكم.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {`;

content = content.replace(/if \(err\.code === 'auth\/invalid-credential' \|\| err\.code === 'auth\/user-not-found' \|\| err\.code === 'auth\/wrong-password'\) \{/, specificErrorLogic);

const errorDisplayReplacement = `{error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-semibold rounded-lg flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            {errorCode === 'auth/operation-not-allowed' && (
              <a 
                href="https://console.firebase.google.com/project/rich-web-kq6d2/authentication/providers" 
                target="_blank" 
                rel="noreferrer"
                className="text-xs bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 mt-1 inline-block"
              >
                اضغط هنا لفتح إعدادات Firebase وتفعيلها
              </a>
            )}
          </div>
        )}`;

content = content.replace(/\{error && \([\s\S]*?<\span>\{error\}<\/span>[\s\S]*?<\/div>\n\s*\)\}/, errorDisplayReplacement);

fs.writeFileSync(file, content);
