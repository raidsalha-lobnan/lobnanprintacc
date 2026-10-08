const fs = require('fs');

let content = fs.readFileSync('src/components/Navbar.tsx', 'utf-8');

content = content.replace(
  /className=\{`text-\[8px\] mt-0\.5 leading-tight line-clamp-2 \$\{/g,
  "className={`text-[8px] mt-0.5 truncate whitespace-nowrap ${"
);

fs.writeFileSync('src/components/Navbar.tsx', content);
