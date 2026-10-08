const fs = require('fs');
let text = fs.readFileSync('src/components/Navbar.tsx', 'utf8');

// 1. Rename المحاسب الذكي to برنامج الأيهم المحاسبي and change the font/layout slightly
text = text.replace(
  /<span className="font-extrabold text-white tracking-tight text-sm">\s*المحاسب الذكي\s*<\/span>/,
  '<span className="font-extrabold text-white tracking-tight text-sm">برنامج الأيهم المحاسبي</span>'
);

// Remove "ERP v2.5"
text = text.replace(
  /<span className="text-\[11px\] text-blue-400 font-semibold bg-blue-950\/60 px-1\.5 py-0\.5 rounded border border-blue-800\/50">\s*ERP v2\.5\s*<\/span>/,
  ''
);

// Remove CR Number section
text = text.replace(
  /\{settings\.crNumber && \(\s*<span className="bg-slate-800 text-slate-300 px-1\.5 py-0\.5 rounded border border-slate-700 font-mono text-\[10px\]">\s*س\.ت: \{settings\.crNumber\}\s*<\/span>\s*\)\}/,
  ''
);

// Move user info under program name
text = text.replace(
  /<p className="text-\[11px\] text-slate-400 truncate max-w-\[180px\] sm:max-w-xs">\s*\{settings\.businessName\}\s*<\/p>/,
  `<div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[11px] text-slate-400 truncate max-w-[150px] sm:max-w-xs">
                  {settings.businessName}
                </p>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 rounded-sm border border-slate-700/50 hidden sm:inline-block">
                  {currentUser.fullName} - {currentUser.roleName}
                </span>
                <button
                  onClick={() => {
                    import('../firebase').then(({ auth }) => auth.signOut());
                    localStorage.removeItem('alnoor_press_accounting_v1_current_user_id');
                    localStorage.removeItem('active_session_id');
                    window.location.reload();
                  }}
                  className="text-[10px] bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  title="تسجيل الخروج"
                >
                  خروج
                </button>
              </div>`
);

// Delete user info from right section
const userInfoRegex = /<div className="hidden sm:flex items-center gap-2 pr-2 border-r border-slate-700 mr-1">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/header>)/;
text = text.replace(userInfoRegex, '');

// Remove New Invoice button
text = text.replace(
  /<button\s*onClick=\{\(\) => setActiveTab\('pos'\)\}\s*className="flex items-center gap-1\.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1\.5 rounded-md text-xs font-bold transition-colors cursor-pointer shadow-xs"\s*title="فتح كاشير المبيعات لإنشاء فاتورة جديدة"\s*>[\s\S]*?<\/button>/,
  ''
);

// Remove Home button
text = text.replace(
  /<button\s*onClick=\{\(\) => setActiveTab\('home'\)\}\s*className="flex items-center gap-1\.5 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1\.5 rounded-md text-xs font-bold transition-colors cursor-pointer shadow-xs"\s*title="الشاشة الرئيسية"\s*>[\s\S]*?<\/button>/,
  ''
);

// Remove Sync Button
text = text.replace(
  /<button\s*onClick=\{forceSyncNow\}[\s\S]*?<\/button>/,
  ''
);

// Remove Export Button
text = text.replace(
  /<button\s*onClick=\{exportDataJSON\}[\s\S]*?<\/button>/,
  ''
);

// Remove Reset Button
text = text.replace(
  /<button\s*onClick=\{resetAllData\}[\s\S]*?<\/button>/,
  ''
);

fs.writeFileSync('src/components/Navbar.tsx', text);
