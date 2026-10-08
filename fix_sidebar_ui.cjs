const fs = require('fs');
const file = 'src/components/pos/PosDailyInvoicesSidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `<div className="flex flex-col gap-2 pb-10">`;
const replacement = `<div className="flex flex-col gap-2 pb-10">
            {/* Table Header Row */}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-200/70 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-600 shadow-xs mb-1">
              <div className="flex-1 text-right">اسم العميل</div>
              <div className="flex items-center justify-between shrink-0 text-center" style={{ width: '135px' }} dir="rtl">
                <div className="w-[45px]">الإجمالي</div>
                <div className="w-[45px]">المدفوع</div>
                <div className="w-[45px]">الباقي</div>
              </div>
            </div>
`;
content = content.replace(target, replacement);

const itemTarget = `<div className="flex items-center gap-2.5 shrink-0 text-xs font-mono bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5" dir="ltr">
                      <div className="flex items-center gap-1">
                        <span className="font-black text-rose-700">{inv.remainingAmount > 0 ? inv.remainingAmount.toFixed(2) : '0.00'}</span>
                        <span className="text-[9px] text-slate-400 font-sans font-bold">باقي</span>
                      </div>
                      <span className="text-slate-200">|</span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-emerald-700">{inv.paidAmount.toFixed(2)}</span>
                        <span className="text-[9px] text-slate-400 font-sans font-bold">مدفوع</span>
                      </div>
                      <span className="text-slate-200">|</span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-800">{inv.totalAmount.toFixed(2)}</span>
                        <span className="text-[9px] text-slate-400 font-sans font-bold">إجمالي</span>
                      </div>
                    </div>`;
                    
const itemReplacement = `<div className="flex items-center justify-between shrink-0 text-xs font-mono bg-slate-50 border border-slate-100 rounded px-1 py-0.5" style={{ width: '135px' }} dir="rtl">
                      <div className="w-[45px] text-center font-bold text-slate-800 shrink-0">{inv.totalAmount.toFixed(2)}</div>
                      <div className="w-[45px] text-center font-bold text-emerald-700 shrink-0">{inv.paidAmount.toFixed(2)}</div>
                      <div className="w-[45px] text-center font-black text-rose-700 shrink-0">{inv.remainingAmount > 0 ? inv.remainingAmount.toFixed(2) : '0.00'}</div>
                    </div>`;

content = content.replace(itemTarget, itemReplacement);

fs.writeFileSync(file, content);
console.log("Replaced");
