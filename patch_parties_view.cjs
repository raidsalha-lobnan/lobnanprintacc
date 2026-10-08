const fs = require('fs');
let text = fs.readFileSync('src/components/PartiesView.tsx', 'utf8');

// 1. Remove phone requirement from validation
text = text.replace(/if \(\!name\.trim\(\) \|\| \!phone\.trim\(\)\) return;/, 'if (!name.trim()) return;');

// 2. Remove required and asterisk from phone input
const phoneRegex = /رقم الجوال \/ الهاتف <span className="text-rose-500">\*<\/span>\s*<\/label>\s*<input\s*type="text"\s*required/m;
const phoneReplacement = `رقم الجوال / الهاتف
                  </label>
                  <input
                    type="text"`;
text = text.replace(phoneRegex, phoneReplacement);

fs.writeFileSync('src/components/PartiesView.tsx', text);
