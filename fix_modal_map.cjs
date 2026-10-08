const fs = require('fs');
let text = fs.readFileSync('src/components/ManageCategoriesModal.tsx', 'utf8');

const replacement = `
            {allCategories.map(cat => {
              const isEditing = editingId === cat.id;

              return (
                <div key={cat.id} className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2 bg-white">
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">اسم التصنيف</label>
                        <input
                          type="text"
                          value={editData.name || ''}
                          onChange={e => setEditData({...editData, name: e.target.value})}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">البادئة (Prefix)</label>
                        <input
                          type="text"
                          value={editData.prefix || ''}
                          onChange={e => setEditData({...editData, prefix: e.target.value.toUpperCase()})}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                          maxLength={4}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">الوحدة الافتراضية</label>
                        <input
                          type="text"
                          value={editData.defaultUnit || ''}
                          onChange={e => setEditData({...editData, defaultUnit: e.target.value})}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex items-end justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleSave}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700"
                        >
                          <Save className="w-3.5 h-3.5" /> حفظ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={\`px-2 py-0.5 rounded text-[10px] font-bold \${cat.color || 'bg-slate-100 text-slate-700'}\`}>
                          {cat.prefix}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">{cat.name}</h3>
                          {cat.description && <p className="text-xs text-slate-500">{cat.description}</p>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingId(cat.id); setEditData(cat); }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
`;

text = text.replace(/\{allCategories\.map\(cat => \{[\s\S]*?\}\)\}/m, replacement);
fs.writeFileSync('src/components/ManageCategoriesModal.tsx', text);
