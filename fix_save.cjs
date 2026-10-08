const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    if (savedInvoice) {
      setLastSavedInvoiceNotice(savedInvoice);
    }

    // Reset to a fresh blank invoice with sequential non-repeating sequence
    const currentNum = parseInt(invoiceSeqNumber, 10) || 1;`;

const replaceStr = `    if (savedInvoice) {
      setLastSavedInvoiceNotice(savedInvoice);
    }

    if (editingPosInvoiceId) {
      // Do not clear the screen or exit editing mode. Just show a brief success indicator if needed.
      return;
    }

    // Reset to a fresh blank invoice with sequential non-repeating sequence
    const currentNum = parseInt(invoiceSeqNumber, 10) || 1;`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replaceStr);
  fs.writeFileSync(file, content);
  console.log("Saved fixed");
} else {
  console.log("Target not found!");
}
