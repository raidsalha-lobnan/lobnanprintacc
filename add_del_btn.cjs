const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

const newBtn = `
                            {/* Delete Item Button */}
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer transition"
                              title="حذف الصنف"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            </button>
                          </div>
                        </td>`;

text = text.replace(/<\/button>\s*<\/div>\s*<\/td>/, '</button>' + newBtn);

if (!text.includes('Trash2')) {
   text = text.replace(/} from 'lucide-react';/, ", Trash2 } from 'lucide-react';");
}

fs.writeFileSync('src/components/InventoryView.tsx', text);
