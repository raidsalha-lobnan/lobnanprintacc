const fs = require('fs');
let text = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

// 1. Handlers
const handlerCode = `
  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setStampUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setSignatureUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
`;

text = text.replace(/\/\/ Multiple Addresses handlers/, handlerCode + '\n  // Multiple Addresses handlers');

// 2. UI
const uiCode = `
                {/* Stamp & Signature Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* Stamp Upload */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>3. ختم المنشأة الرسمي</span>
                      </span>
                      {stampUrl && (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                          مرفوع ✓
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                      يتم طباعة هذا الختم أسفل كافة الكشوفات، الفواتير، والسندات الرسمية الموجهة للعملاء.
                    </p>
                    <div className="flex items-center gap-3">
                      {stampUrl ? (
                        <div className="relative w-20 h-20 bg-white border border-slate-300 rounded-lg p-1.5 flex items-center justify-center shadow-xs shrink-0 group">
                          <img
                            src={stampUrl}
                            alt="Stamp Preview"
                            className="max-w-full max-h-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setStampUrl('')}
                            className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 border border-red-200 opacity-0 group-hover:opacity-100 transition shadow-xs hover:bg-red-200 hover:text-red-700"
                            title="إزالة الختم"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-white border border-slate-300 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 shrink-0">
                          <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                          <span className="text-[9px] font-bold">بدون ختم</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="inline-flex items-center justify-center gap-1.5 w-full bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg px-3 py-2 text-xs shadow-2xs transition cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>{stampUrl ? 'تغيير الختم' : 'رفع ختم الشركة (PNG)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleStampUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Signature Upload */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>4. توقيع المدير / المخول</span>
                      </span>
                      {signatureUrl && (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded">
                          مرفوع ✓
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                      يظهر بجوار الختم الرسمي لاعتماد الفواتير والسندات في المعاملات الرسمية.
                    </p>
                    <div className="flex items-center gap-3">
                      {signatureUrl ? (
                        <div className="relative w-20 h-20 bg-white border border-slate-300 rounded-lg p-1.5 flex items-center justify-center shadow-xs shrink-0 group">
                          <img
                            src={signatureUrl}
                            alt="Signature Preview"
                            className="max-w-full max-h-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setSignatureUrl('')}
                            className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 border border-red-200 opacity-0 group-hover:opacity-100 transition shadow-xs hover:bg-red-200 hover:text-red-700"
                            title="إزالة التوقيع"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 bg-white border border-slate-300 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 shrink-0">
                          <ImageIcon className="w-5 h-5 mb-1 opacity-50" />
                          <span className="text-[9px] font-bold">بدون توقيع</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <label className="inline-flex items-center justify-center gap-1.5 w-full bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-lg px-3 py-2 text-xs shadow-2xs transition cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>{signatureUrl ? 'تغيير التوقيع' : 'رفع التوقيع (PNG)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSignatureUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>`;

const searchStr = `</label>
                    </div>
                  </div>
                </div>`;

// We inject it right after the headerImageUrl div closes
const replaceIndex = text.indexOf(searchStr);
if (replaceIndex > -1) {
    const splitIndex = replaceIndex + searchStr.length;
    text = text.substring(0, splitIndex) + '\\n' + uiCode + '\\n' + text.substring(splitIndex);
}

fs.writeFileSync('src/components/SettingsView.tsx', text);
