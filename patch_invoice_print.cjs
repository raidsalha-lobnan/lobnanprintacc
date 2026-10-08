const fs = require('fs');
let text = fs.readFileSync('src/components/InvoicePrintModal.tsx', 'utf8');

const regex = /<div className="flex justify-between items-center mt-6 text-\[10px\] text-slate-500 border-t border-slate-200 pt-3">/;
const replacement = `
          {/* Signatures & Stamp */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] font-bold text-slate-700 mb-2">توقيع المستلم</div>
              <div className="h-16 border-b border-dashed border-slate-400 w-32 mx-auto"></div>
            </div>
            
            <div className="flex flex-col items-center justify-center">
              {settings.stampUrl ? (
                <div className="h-20 flex items-center justify-center opacity-90">
                  <img src={settings.stampUrl} alt="Stamp" className="max-h-full object-contain" />
                </div>
              ) : (
                <div className="h-20"></div>
              )}
              <div className="text-[10px] font-bold text-slate-700 mt-2">الختم الرسمي</div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="text-[10px] font-bold text-slate-700 mb-2">توقيع المحاسب / الإدارة</div>
              {settings.signatureUrl ? (
                <div className="h-16 flex items-end justify-center">
                  <img src={settings.signatureUrl} alt="Signature" className="max-h-full object-contain mix-blend-multiply opacity-80" />
                </div>
              ) : (
                <div className="h-16 border-b border-dashed border-slate-400 w-32 mx-auto"></div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center mt-6 text-[10px] text-slate-500 border-t border-slate-200 pt-3">`;

if (text.includes('الختم الرسمي')) {
   // Already patched?
} else {
   text = text.replace(regex, replacement);
   fs.writeFileSync('src/components/InvoicePrintModal.tsx', text);
}
