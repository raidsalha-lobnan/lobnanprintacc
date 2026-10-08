const fs = require('fs');
let text = fs.readFileSync('src/components/AccountStatementModal.tsx', 'utf8');

// Patch 1: Official Signatures Section (Customer/Supplier)
const regex1 = /\{\/\* Official Signatures Section \*\/\}[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*\)\}\s*\{\/\* Statements for Employees \*\/\}$/m;
// Actually I don't know if the boundary is exactly that. Let's do it safer.

const replacement1 = `{/* Official Signatures Section */}
              <div className="pt-6 border-t border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">إعداد وتدقيق المحاسب</span>
                  <div className="h-16 flex items-end justify-center">
                    <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">الختم الرسمي</span>
                  {settings.stampUrl ? (
                    <div className="h-16 flex items-center justify-center opacity-90">
                      <img src={settings.stampUrl} alt="Stamp" className="max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-16 flex items-end justify-center">
                      <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">اعتماد المدير المالي</span>
                  {settings.signatureUrl ? (
                    <div className="h-16 flex items-end justify-center">
                      <img src={settings.signatureUrl} alt="Signature" className="max-h-full object-contain mix-blend-multiply opacity-80" />
                    </div>
                  ) : (
                    <div className="h-16 flex items-end justify-center">
                      <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">توقيع وإقرار العميل بالمطابقة</span>
                  <div className="h-16 flex items-end justify-center">
                    <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                  </div>
                </div>
              </div>`;

text = text.replace(/\{\/\* Official Signatures Section \*\/\}[\s\S]*?(?=\s*<\/div>\s*<\/div>\s*\)\}\s*\{\/\* Statement for Employee)/m, replacement1);

// Patch 2: Signatures for Employee Statement
const replacement2 = `{/* Signatures for Employee Statement */}
              <div className="pt-6 border-t border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">إعداد وتدقيق قسم الرواتب</span>
                  <div className="h-16 flex items-end justify-center">
                    <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">الختم الرسمي</span>
                  {settings.stampUrl ? (
                    <div className="h-16 flex items-center justify-center opacity-90">
                      <img src={settings.stampUrl} alt="Stamp" className="max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-16 flex items-end justify-center">
                      <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">اعتماد الإدارة / التوقيع</span>
                  {settings.signatureUrl ? (
                    <div className="h-16 flex items-end justify-center">
                      <img src={settings.signatureUrl} alt="Signature" className="max-h-full object-contain mix-blend-multiply opacity-80" />
                    </div>
                  ) : (
                    <div className="h-16 flex items-end justify-center">
                      <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-700 block">توقيع وإقرار الموظف بالمطابقة</span>
                  <div className="h-16 flex items-end justify-center">
                    <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
                  </div>
                </div>
              </div>`;

text = text.replace(/\{\/\* Signatures for Employee Statement \*\/\}[\s\S]*?(?=\s*<\/div>\s*\)\}\s*\{\/\* Footer Official Notice \*\/)/m, replacement2);

fs.writeFileSync('src/components/AccountStatementModal.tsx', text);
