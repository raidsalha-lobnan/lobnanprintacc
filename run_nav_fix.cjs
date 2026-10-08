const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Replace the old functions
const startMatch = "  const handleNavFirst = () => {";
const endMatch = "  // Clear / Void Invoice (إلغاء)";
const startIdx = content.indexOf(startMatch);
const endIdx = content.indexOf(endMatch);

if (startIdx !== -1 && endIdx !== -1) {
  const newLogic = `  const invoicesForDate = useMemo(() => {
    return invoices
      .filter(inv => inv.date === invoiceDate)
      .sort((a, b) => (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''));
  }, [invoices, invoiceDate]);

  const currentInvoiceIndexForDate = useMemo(() => {
    if (!editingPosInvoiceId) return -1;
    return invoicesForDate.findIndex(inv => inv.id === editingPosInvoiceId);
  }, [invoicesForDate, editingPosInvoiceId]);

  const handleNavFirst = () => {
    if (invoicesForDate.length === 0) return;
    loadInvoiceToScreen(invoicesForDate[0]);
  };

  const handleNavPrev = () => {
    if (invoicesForDate.length === 0) return;
    const idx = Math.max(0, currentInvoiceIndexForDate - 1);
    loadInvoiceToScreen(invoicesForDate[idx]);
  };

  const handleNavNext = () => {
    if (invoicesForDate.length === 0) return;
    const idx = currentInvoiceIndexForDate === -1 ? 0 : Math.min(invoicesForDate.length - 1, currentInvoiceIndexForDate + 1);
    loadInvoiceToScreen(invoicesForDate[idx]);
  };

  const handleNavLast = () => {
    if (invoicesForDate.length === 0) return;
    loadInvoiceToScreen(invoicesForDate[invoicesForDate.length - 1]);
  };

`;
  
  content = content.substring(0, startIdx) + newLogic + content.substring(endIdx);
} else {
  console.log("Could not find functions to replace");
}

// 2. Inject UI next to the invoice number
const uiTarget = `                  <Lock className={\`w-3 h-3 text-blue-200\`} />
                  <span>#{invoiceSeqNumber.padStart(4, '0')}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-semibold hidden sm:inline">(تسلسلي موحد)</span>
              </div>`;

const newUi = `                  <Lock className={\`w-3 h-3 text-blue-200\`} />
                  <span>#{invoiceSeqNumber.padStart(4, '0')}</span>
                </div>
                
                {/* Navigation inside header */}
                <div className="flex items-center bg-white border border-slate-300 rounded shadow-xs ml-2 overflow-hidden" dir="ltr">
                  <button onClick={handleNavFirst} className="p-1 hover:bg-slate-100 text-slate-600 transition-colors" title="الأول">
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleNavPrev} className="p-1 border-l border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors" title="السابق">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div className="px-2 py-0.5 font-mono text-[11px] font-black text-slate-800 border-x border-slate-200 min-w-[40px] text-center bg-slate-50">
                    {invoicesForDate.length > 0 ? (currentInvoiceIndexForDate !== -1 ? currentInvoiceIndexForDate + 1 : '-') : 0} / {invoicesForDate.length}
                  </div>
                  <button onClick={handleNavNext} className="p-1 border-r border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors" title="التالي">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleNavLast} className="p-1 hover:bg-slate-100 text-slate-600 transition-colors" title="الأخير">
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>`;

if (content.includes(uiTarget)) {
  content = content.replace(uiTarget, newUi);
} else {
  console.log("Could not find UI target");
}

fs.writeFileSync(file, content);
console.log("Done");
