const fs = require('fs');
let text = fs.readFileSync('src/components/PurchasePrintModal.tsx', 'utf8');

const regex = /\{\/\* Signatures \*\/\}[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);\s*\};\s*$/;
const replacement = `{/* Signatures */}
          <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
            <div className="space-y-2">
              <span className="font-bold text-slate-700 block">أمين المستودع</span>
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
              <span className="font-bold text-slate-700 block">توقيع الإدارة / المحاسب</span>
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
              <span className="font-bold text-slate-700 block">مندوب المورد</span>
              <div className="h-16 flex items-end justify-center">
                <div className="border-b border-dashed border-slate-400 w-24 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
`;

text = text.replace(regex, replacement);
fs.writeFileSync('src/components/PurchasePrintModal.tsx', text);
