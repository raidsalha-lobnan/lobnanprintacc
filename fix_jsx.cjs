const fs = require('fs');
const file = 'src/components/LoginView.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `{error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-semibold rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}`;

const replacement = `{error && (
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

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
