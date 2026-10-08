const fs = require('fs');
let text = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

const importCode = "import { resizeAndCompressImage } from '../utils/imageCompress';\n";
text = importCode + text;

text = text.replace(/const reader = new FileReader\(\);\n\s*reader\.onload = \(event\) => \{\n\s*setLogoUrl\(event\.target\?\.result as string\);\n\s*\};\n\s*reader\.readAsDataURL\(file\);/, 
  "resizeAndCompressImage(file, 400, 400).then(setLogoUrl).catch(console.error);");

text = text.replace(/const reader = new FileReader\(\);\n\s*reader\.onload = \(event\) => \{\n\s*setHeaderImageUrl\(event\.target\?\.result as string\);\n\s*\};\n\s*reader\.readAsDataURL\(file\);/, 
  "resizeAndCompressImage(file, 1200, 300).then(setHeaderImageUrl).catch(console.error);");

text = text.replace(/const reader = new FileReader\(\);\n\s*reader\.onload = \(event\) => \{\n\s*setStampUrl\(event\.target\?\.result as string\);\n\s*\};\n\s*reader\.readAsDataURL\(file\);/, 
  "resizeAndCompressImage(file, 300, 300).then(setStampUrl).catch(console.error);");

text = text.replace(/const reader = new FileReader\(\);\n\s*reader\.onload = \(event\) => \{\n\s*setSignatureUrl\(event\.target\?\.result as string\);\n\s*\};\n\s*reader\.readAsDataURL\(file\);/, 
  "resizeAndCompressImage(file, 300, 300).then(setSignatureUrl).catch(console.error);");

fs.writeFileSync('src/components/SettingsView.tsx', text);
