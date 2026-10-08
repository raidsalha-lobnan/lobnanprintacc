const fs = require('fs');
let text = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

text = text.replace(/const \[crNumber,\s+showTaxNumberInPrints,\s+showCrNumberInPrints, setCrNumber\] = useState\(settings\.crNumber \|\| ''\);/g, "const [crNumber, setCrNumber] = useState(settings.crNumber || '');");

text = text.replace(/taxNumber,\n\s*crNumber,\n\s*logoUrl: logoUrl\.trim/g, "taxNumber,\n      crNumber,\n      showTaxNumberInPrints,\n      showCrNumberInPrints,\n      logoUrl: logoUrl.trim");

fs.writeFileSync('src/components/SettingsView.tsx', text);
