const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

const modalHtml = `
      {/* Manage Categories Modal */}
      <ManageCategoriesModal
        isOpen={showCategoriesModal}
        onClose={() => setShowCategoriesModal(false)}
      />

      {/* Stock Movement Ledger & Stock Card Modal */}`;

text = text.replace('{/* Stock Movement Ledger & Stock Card Modal */}', modalHtml);
fs.writeFileSync('src/components/InventoryView.tsx', text);
