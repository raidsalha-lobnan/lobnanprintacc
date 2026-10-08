const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

const oldStr = `            {/* Primary Add Button */}
            <button
              type="button"
              onClick={() => handleOpenAdd()}`;

const newBtn = `            {/* Manage Categories Button */}
            <button
              type="button"
              onClick={() => setShowCategoriesModal(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>إدارة التصنيفات</span>
            </button>
            {/* Primary Add Button */}
            <button
              type="button"
              onClick={() => handleOpenAdd()}`;

text = text.replace(oldStr, newBtn);
fs.writeFileSync('src/components/InventoryView.tsx', text);
