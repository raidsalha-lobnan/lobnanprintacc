const fs = require('fs');
const file = 'src/components/UsersPermissionsView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update state form to include password
content = content.replace(
  "        email: user.email || '',",
  "        email: user.email || '',\n        password: user.password || '',"
);
content = content.replace(
  "        email: '',",
  "        email: '',\n        password: '',"
);

// Update payload mapping
content = content.replace(
  "      email: userForm.email.trim() || undefined,",
  "      email: userForm.email.trim() || undefined,\n      password: userForm.password || undefined,"
);

// Add password input UI
const emailRegex = /<div>\s*<label[^>]*>البريد الإلكتروني<\/label>[\s\S]*?<\/div>/;
const passInputStr = `                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
                  <input
                    type="text"
                    value={userForm.password || ''}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono text-left"
                    placeholder="******"
                    dir="ltr"
                  />
                </div>`;

content = content.replace(emailRegex, function(match) {
  return match + "\n" + passInputStr;
});

fs.writeFileSync(file, content);
