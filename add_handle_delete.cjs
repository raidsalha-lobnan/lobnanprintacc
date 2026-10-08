const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

const newFn = `
  const handleDeleteItem = (it: InventoryItem) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف الصنف: ' + it.name + '؟')) {
      const res = deleteInventoryItem(it.id);
      if (res.success) {
         alert(res.message);
      } else {
         alert(res.message);
      }
    }
  };

  const handleOpenEdit = `;

text = text.replace('  const handleOpenEdit = ', newFn);
fs.writeFileSync('src/components/InventoryView.tsx', text);
