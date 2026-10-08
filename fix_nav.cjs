const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const navLogicFind = `  const handleNavFirst = () => {`;

const newNavLogic = `  const invoicesForDate = useMemo(() => {
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
  };`;

// Replace the old nav logic (from handleNavFirst to the end of handleNavLast)
// Let's use regex or split to replace exactly those 4 functions.
