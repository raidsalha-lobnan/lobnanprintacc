const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove the modal
const modalTarget = `      {/* Daily Invoices & Statuses Drawer Modal */}
      {isDailyInvoicesOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-start bg-black/40 backdrop-blur-xs"
          onClick={() => setIsDailyInvoicesOpen(false)}
        >
          <div onClick={e => e.stopPropagation()} className="h-full">
            <PosDailyInvoicesSidebar
              isOpen={isDailyInvoicesOpen}
              onClose={() => setIsDailyInvoicesOpen(false)}
              onSelectInvoiceToLoad={(inv) => {
                loadInvoiceToScreen(inv);
                setIsDailyInvoicesOpen(false);
              }}
              onPrintInvoice={(inv) => {
                setSelectedInvoiceForPrint(inv);
              }}
              className="h-full shadow-2xl"
            />
          </div>
        </div>
      )}`;

content = content.replace(modalTarget, "");

// 2. Insert into the main workspace
const workspaceTarget = `        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch w-full lg:h-full min-h-0">
          {/* المفضلة في الكاشير: قائمة تظهر بالجانب الأيمن وتمتد لأعلى مقابل رقم الفاتورة وعلى كامل الارتفاع */}`;

const workspaceReplacement = `        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch w-full lg:h-full min-h-0">
          
          {isDailyInvoicesOpen && (
            <div className="shrink-0 w-full lg:w-[700px] xl:w-[900px] order-first flex flex-col lg:h-full min-h-[500px] lg:min-h-0 border border-slate-300 rounded-xl overflow-hidden shadow-2xs z-10 bg-white">
              <PosDailyInvoicesSidebar
                isOpen={isDailyInvoicesOpen}
                onClose={() => setIsDailyInvoicesOpen(false)}
                onSelectInvoiceToLoad={(inv) => {
                  loadInvoiceToScreen(inv);
                  setIsDailyInvoicesOpen(false);
                }}
                onPrintInvoice={(inv) => {
                  setSelectedInvoiceForPrint(inv);
                }}
                className="w-full h-full"
              />
            </div>
          )}

          {/* المفضلة في الكاشير: قائمة تظهر بالجانب الأيمن وتمتد لأعلى مقابل رقم الفاتورة وعلى كامل الارتفاع */}`;

content = content.replace(workspaceTarget, workspaceReplacement);

fs.writeFileSync(file, content);
