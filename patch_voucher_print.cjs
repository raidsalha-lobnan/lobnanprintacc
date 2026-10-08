const fs = require('fs');
let text = fs.readFileSync('src/components/VoucherPrintModal.tsx', 'utf8');

const regex = /\{\/\* Signatures Section \*\/\}[\s\S]*?\{\/\* Footer notice \*\/\}/;
const replacement = `{/* Signatures Section */}
          <div className="mt-8 pt-4 border-t border-slate-200 grid grid-cols-4 gap-4 text-center text-xs">
            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">منظم السند / المحاسب</span>
              <div className="h-16 flex items-end justify-center">
                <div className="border-b border-dotted border-slate-400 w-24 mx-auto" />
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
                  <div className="border-b border-dotted border-slate-400 w-24 mx-auto" />
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
                  <div className="border-b border-dotted border-slate-400 w-24 mx-auto" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">
                {isPayment ? 'توقيع المستلم' : 'توقيع المستلم / الدافع'}
              </span>
              <div className="h-16 flex items-end justify-center">
                <div className="border-b border-dotted border-slate-400 w-24 mx-auto" />
              </div>
            </div>
          </div>

          {/* Footer notice */}`;

text = text.replace(regex, replacement);
fs.writeFileSync('src/components/VoucherPrintModal.tsx', text);
