const fs = require('fs');
const file = 'src/components/settings/DatabaseZeroingSettings.tsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = "      {/* Step 3: Granular Item Selection */}";
const endStr = "      {/* Step 4: Final Confirmation Lock & Execution */}";

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
  const newStep3 = `      {/* Step 3: Granular Item Selection */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="font-bold text-xs text-rose-900">
                الخطوة الثالثة: نطاق المسح الشامل (مهم جداً)
              </h3>
              <p className="text-[10px] text-rose-700">جميع البيانات ستمسح نهائياً، باستثناء أساسيات النظام.</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-rose-900 mb-1">
                سيتم مسح البيانات التالية نهائياً في النطاق الزمني المحدد:
              </h4>
              <ul className="list-disc list-inside text-xs text-rose-800 space-y-1">
                <li>فواتير المبيعات ونقاط البيع ومردوداتها</li>
                <li>فواتير المشتريات ومردوداتها</li>
                <li>حركات وسندات القبض والصرف المالي</li>
                <li>قيود اليومية وأوامر الطباعة</li>
                <li>العملاء والموردين المضافين (مسح نهائي)</li>
                <li>الأصناف والمخزون والمستودعات الإضافية (مسح نهائي)</li>
                <li>مسيرات الرواتب والموظفين والصناديق الإضافية (مسح نهائي)</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-white border border-rose-100 rounded-lg">
            <h4 className="font-bold text-xs text-emerald-700 mb-2">ما سيتم الإبقاء عليه وتصفير أرصدته فقط:</h4>
            <ul className="list-disc list-inside text-[11px] text-emerald-600 space-y-1">
              <li>العميل النقدي الافتراضي (CUST-0001) - تصفير المبالغ فقط</li>
              <li>الخزينة النقدية الرئيسية الافتراضية - تصفير الرصيد فقط</li>
              <li>المستودع الرئيسي - تصفير الكميات فقط</li>
              <li>شجرة الحسابات والدليل المحاسبي - تصفير الأرصدة فقط</li>
              <li>المستخدمين الأساسيين للنظام (لن يتأثروا)</li>
            </ul>
          </div>
        </div>
      </div>

`;
  
  content = content.substring(0, startIdx) + newStep3 + content.substring(endIdx);
  fs.writeFileSync(file, content);
  console.log('Successfully patched Step 3');
} else {
  console.log('Could not find boundaries');
}
