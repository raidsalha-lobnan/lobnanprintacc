const fs = require('fs');
let text = fs.readFileSync('src/types/index.ts', 'utf8');

const replacement = `  logoUrl?: string;           // صورة لوقو المنشأة (Base64 أو رابط)
  headerImageUrl?: string;    // صورة هيدر كامل لكافة الكشوفات والأوراق المطبوعة
  stampUrl?: string;          // ختم المنشأة (Base64 أو رابط)
  signatureUrl?: string;      // توقيع المدير/المخول (Base64 أو رابط)`;

text = text.replace(/logoUrl\?: string;[\s\S]*?headerImageUrl\?: string;[^\n]*\n/, replacement + '\n');
fs.writeFileSync('src/types/index.ts', text);
