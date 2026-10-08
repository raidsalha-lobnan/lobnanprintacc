const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `        userName: currentUser?.fullName || currentUser?.username,
        editingInvoiceId: editingPosInvoiceId || undefined,
        customCustomerText,`;

const replaceStr = `        userName: currentUser?.fullName || currentUser?.username,
        editingInvoiceId: editingPosInvoiceId || undefined,
        customCustomerText,`;

if (content.includes(targetStr)) {
  console.log("Found it!");
}
