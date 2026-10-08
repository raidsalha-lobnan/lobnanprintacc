const fs = require('fs');
const file = 'src/components/pos/PosDailyInvoicesSidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

const startTarget = "{/* Table Content */}";
const endTarget = "{/* Status Change & Audit History Modal */}";

const startIdx = content.indexOf(startTarget);
const endIdx = content.indexOf(endTarget);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `{/* List Content */}
      <div className="flex-1 overflow-auto bg-slate-50 p-2">
        {filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <p className="font-bold text-sm">لا توجد فواتير مطابقة للبحث أو الفلتر في هذا اليوم</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pb-10">
            {filteredInvoices.map((inv) => {
              const pMeta = getInvoicePaymentStatusMeta(inv.paymentStatus || computeInvoicePaymentStatus({
                paymentMethod: inv.paymentMethod,
                totalAmount: inv.totalAmount,
                paidAmount: inv.paidAmount,
                remainingAmount: inv.remainingAmount,
                cashPaidAmount: inv.cashPaidAmount,
                bankPaidAmount: inv.bankPaidAmount
              }));
              
              const methodStr = inv.paymentMethod === 'cash' ? 'نقدي' : inv.paymentMethod === 'card' ? 'بطاقة' : inv.paymentMethod === 'credit' ? 'آجل' : 'متعدد';
              const wMeta = getInvoiceWorkflowStatusMeta(inv.workflowStatus || 'new');

              return (
                <div key={inv.id} className="bg-white border border-slate-200 hover:border-blue-400 transition-colors rounded-lg p-2 shadow-xs flex flex-col gap-1.5 group">
                  {/* Line 1: Customer ::: Totals */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-800 text-[13px] truncate flex-1 leading-none pt-0.5">
                      {inv.customerName || 'عميل نقدي'}{inv.subCustomerName ? \` / \${inv.subCustomerName}\` : ''}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 text-xs font-mono bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5" dir="ltr">
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
                    </div>
                  </div>

                  {/* Line 2: Payment Method - Notes ::: Actions & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 text-[11px] text-slate-600 truncate">
                      <span className={\`font-black px-1.5 py-0.5 rounded border \${pMeta.bgColor} \${pMeta.color} \${pMeta.borderColor} shrink-0 leading-none\`}>
                        {methodStr}
                      </span>
                      <span className="truncate max-w-[200px] sm:max-w-[300px]">
                        {[inv.notes, inv.paymentNotes].filter(Boolean).join(' - ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Status Dropdown (Auto-saves on change) */}
                      <select
                        value={inv.workflowStatus || 'new'}
                        onChange={e => handleChangeStatus(inv, e.target.value)}
                        className={\`text-[10px] font-black px-1.5 py-1 rounded border cursor-pointer focus:outline-none \${wMeta.bgColor} \${wMeta.color} \${wMeta.borderColor}\`}
                        title="تغيير الحالة تلقائياً"
                      >
                        {WORKFLOW_STATUS_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => onSelectInvoiceToLoad(inv)}
                        className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                        title="تعديل"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      
                      {inv.remainingAmount > 0 && (
                        <button
                          onClick={() => handleOpenCollection(inv)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded transition-colors"
                          title="تحصيل"
                        >
                          <Coins className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      `;
  
  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
  fs.writeFileSync(file, content);
  console.log("Replaced successfully.");
} else {
  console.log("Targets not found.");
}
