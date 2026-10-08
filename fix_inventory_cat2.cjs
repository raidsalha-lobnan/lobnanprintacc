const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

const regex = /<select\s+value=\{formCategory\}\s+onChange=\{e => handleCategoryChange\(e\.target\.value as ItemCategory\)\}\s+className="[^"]+"\s*>[\s\S]*?<\/select>/;

const newSelect = `<select
                    value={formCategory}
                    onChange={e => handleCategoryChange(e.target.value as ItemCategory)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    {allCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} ({cat.prefix})</option>
                    ))}
                  </select>`;

text = text.replace(regex, newSelect);
fs.writeFileSync('src/components/InventoryView.tsx', text);
