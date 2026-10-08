const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetClosingDivs = `                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>

      {/* Quick Shortcuts Bar (Customizable Buttons) */}`;

const splitContent = content.split(targetClosingDivs);
if (splitContent.length === 2) {
    console.log("Found the target closing divs!");
    // The top part is splitContent[0] + the closing divs.
    // Wait, let's look closer at those closing divs.
} else {
    console.log("Could not find the target closing divs. Length:", splitContent.length);
}
