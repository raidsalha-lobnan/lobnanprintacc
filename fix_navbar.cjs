const fs = require('fs');
const file = 'src/components/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

// replace the select with a span and add logout button
const replacement = `              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white max-w-[120px] truncate">
                  {currentUser.fullName}
                </span>
                <button
                  onClick={() => {
                    import('../firebase').then(({ auth }) => auth.signOut());
                  }}
                  className="mr-2 text-[10px] bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded"
                  title="تسجيل الخروج"
                >
                  خروج
                </button>
              </div>`;

content = content.replace(/<div className="flex items-center gap-1">\s*<select[\s\S]*?<\/select>\s*<\/div>/, replacement);

fs.writeFileSync(file, content);
