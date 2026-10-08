const fs = require('fs');
let text = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

const replacement = `
  const allCategories = useMemo(() => {
    return settings.categories || [];
  }, [settings.categories]);
`;

text = text.replace(/const allCategories = useMemo\(\(\) => \{[\s\S]*?\}, \[settings\.categories\]\);/m, replacement);
fs.writeFileSync('src/components/InventoryView.tsx', text);
