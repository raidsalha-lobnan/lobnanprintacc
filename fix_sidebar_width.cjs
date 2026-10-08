const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'lg:w-[15%] min-w-[320px] lg:min-w-0',
  'lg:w-[15%] lg:min-w-[15%] lg:max-w-[15%] min-w-[320px] overflow-x-hidden'
);

fs.writeFileSync(file, content);
console.log("Width fixed 2");
