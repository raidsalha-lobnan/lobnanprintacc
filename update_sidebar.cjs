const fs = require('fs');
const file = 'src/components/pos/PosDailyInvoicesSidebar.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Hide Invoice Number column (th and td)
content = content.replace('<th className="p-2 whitespace-nowrap">رقم الفاتورة</th>', '{/* رقم الفاتورة مخفي */}');
content = content.replace(/<td className="p-2 font-mono font-black text-blue-900 align-middle">[\s\S]*?<\/td>/, '{/* رقم الفاتورة مخفي */}');
// Using regex might be risky because of global vs single match. Let's do it carefully.
