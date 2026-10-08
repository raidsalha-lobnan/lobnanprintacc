const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

// Inside component, create allCategories
const addAllCats = `
  const allCategories = useMemo(() => {
    const builtIn = Object.values(CATEGORY_DEFINITIONS);
    const custom = settings.categories || [];
    return [...builtIn, ...custom];
  }, [settings.categories]);

  const getCategoryDetails = (catId: string) => {
    return allCategories.find(c => c.id === catId) || CATEGORY_DEFINITIONS['stationery'];
  };

  const getCategoryBadge = (cat: ItemCategory) => {
    const details = getCategoryDetails(cat);
    if (details && details.color) {
      return { label: details.name, class: details.color };
    }
    // Fallbacks
    switch (cat) {
      case 'books':
        return { label: 'كتب وروايات', class: 'bg-emerald-50 text-emerald-700' };
      case 'stationery':
        return { label: 'قرطاسية ومكتبية', class: 'bg-sky-50 text-sky-700' };
      case 'print_raw':
        return { label: 'خامات مطبعة', class: 'bg-indigo-50 text-indigo-700' };
      case 'copy_scan':
        return { label: 'خدمات تصوير', class: 'bg-purple-50 text-purple-700' };
      default:
        return { label: details?.name || 'أخرى', class: 'bg-slate-50 text-slate-700' };
    }
  };
`;

text = text.replace(/const getCategoryBadge = \(cat: ItemCategory\) => \{[\s\S]*?return \{ label: 'أخرى', class: 'bg-slate-50 text-slate-700' \};\n    \}\n  \};/, addAllCats);

// Replace hardcoded dropdown for filter:
const oldFilterSelect = `
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-transparent border-0 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all">كافة التصنيفات ({inventory.length})</option>
                <option value="stationery">قرطاسية ومكتبية (STAT)</option>
                <option value="books">كتب وروايات ومناهج (BOOK)</option>
                <option value="print_raw">خامات ومواد مطبعة (RAW)</option>
                <option value="copy_scan">خدمات تصوير وتجليد (CPY)</option>
                <option value="shields_gifts">دروع وهدايا تذكارية (GFT)</option>
              </select>`;

const newFilterSelect = `
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-transparent border-0 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all">كافة التصنيفات ({inventory.length})</option>
                {allCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name} ({cat.prefix})</option>
                ))}
              </select>`;

text = text.replace(oldFilterSelect, newFilterSelect);

// Replace hardcoded dropdown for Add Modal:
const oldModalSelect = `
                  <select
                    value={formCategory}
                    onChange={e => handleCategoryChange(e.target.value as ItemCategory)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="stationery">قرطاسية وأدوات مكتبية ومدرسية (STAT)</option>
                    <option value="books">كتب وروايات ومراجع ومناهج (BOOK)</option>
                    <option value="print_raw">خامات ومواد مطبعة ورولات وأحبار (RAW)</option>
                    <option value="print_service">خدمات تصميم ومونتاج وطباعة خارجية (SRV)</option>
                    <option value="copy_scan">خدمات تصوير مستندات وسكان وطباعة فورية (CPY)</option>
                    <option value="shields_gifts">دروع تكريم وهدايا تذكارية وأختام (GFT)</option>
                  </select>`;

const newModalSelect = `
                  <select
                    value={formCategory}
                    onChange={e => handleCategoryChange(e.target.value as ItemCategory)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    {allCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} ({cat.prefix})</option>
                    ))}
                  </select>`;

text = text.replace(oldModalSelect, newModalSelect);

// Replace CATEGORY_DEFINITIONS[formCategory] accesses
text = text.replace(/CATEGORY_DEFINITIONS\[formCategory\]\?/g, "getCategoryDetails(formCategory)?");
text = text.replace(/CATEGORY_DEFINITIONS\[formCategory\]\?/g, "getCategoryDetails(formCategory)?");

fs.writeFileSync('src/components/InventoryView.tsx', text);
