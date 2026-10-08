const fs = require('fs');
let text = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

// 1. Add states
const stateRegex = /const \[crNumber, setCrNumber\] = useState\(settings\.crNumber \|\| ''\);/;
const stateReplacement = `const [crNumber, setCrNumber] = useState(settings.crNumber || '');
  const [showTaxNumberInPrints, setShowTaxNumberInPrints] = useState<boolean>(settings.showTaxNumberInPrints !== false); // default true
  const [showCrNumberInPrints, setShowCrNumberInPrints] = useState<boolean>(settings.showCrNumberInPrints !== false); // default true`;
text = text.replace(stateRegex, stateReplacement);

// 2. Add to handleSave
const handleSaveRegex = /crNumber,/;
const handleSaveReplacement = `crNumber,
      showTaxNumberInPrints,
      showCrNumberInPrints,`;
text = text.replace(handleSaveRegex, handleSaveReplacement);

// 3. Remove required from taxNumber and crNumber, and add toggles
const uiRegex = /<div>\s*<label className="block text-slate-700 font-semibold mb-1 text-\[11px\]">الرقم الضريبي الرسمي \(VAT\):<\/label>[\s\S]*?<\/div>\s*<\/div>/;
const uiReplacement = `<div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">الرقم الضريبي الرسمي (VAT):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={e => setTaxNumber(e.target.value)}
                    placeholder="اختياري"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 font-semibold bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg shrink-0">
                    <input type="checkbox" checked={showTaxNumberInPrints} onChange={e => setShowTaxNumberInPrints(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    عرض في الطباعة
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">رقم السجل التجاري / الترخيص:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={crNumber}
                    onChange={e => setCrNumber(e.target.value)}
                    placeholder="اختياري"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 font-semibold bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg shrink-0">
                    <input type="checkbox" checked={showCrNumberInPrints} onChange={e => setShowCrNumberInPrints(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    عرض في الطباعة
                  </label>
                </div>
              </div>
            </div>`;

text = text.replace(uiRegex, uiReplacement);

// 4. Also pass them to overrideSettings
text = text.replace(/crNumber,(\s+)logoUrl,/g, 'crNumber,\n                      showTaxNumberInPrints,\n                      showCrNumberInPrints,$1logoUrl,');

fs.writeFileSync('src/components/SettingsView.tsx', text);
