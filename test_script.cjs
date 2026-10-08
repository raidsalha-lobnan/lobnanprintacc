const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const mainFlex1Start = '<div className="flex-1 min-w-0 flex flex-col gap-2 lg:h-full lg:min-h-0">';

// Find the position of mainFlex1Start
const pos = content.indexOf(mainFlex1Start);
console.log("mainFlex1Start found at:", pos);
