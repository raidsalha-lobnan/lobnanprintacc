const fs = require('fs');
const file = 'src/components/settings/DatabaseZeroingSettings.tsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = '          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">';
const endStr = '        {/* Confirmation Input & Action Button */}';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
  const newSummary = `          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="bg-slate-700/80 px-2 py-1 rounded border border-slate-600">
              سيتم مسح كافة البيانات المسجلة ضمن النطاق الزمني المحدد باستثناء أساسيات النظام (العميل النقدي، الخزينة الرئيسية، المستودع الرئيسي).
            </span>
          </div>
        </div>

`;
  
  content = content.substring(0, startIdx) + newSummary + content.substring(endIdx);
  fs.writeFileSync(file, content);
  console.log('Successfully patched Step 4 summary');
} else {
  console.log('Could not find boundaries');
}
