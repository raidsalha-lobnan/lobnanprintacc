const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const anchor = `                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>`;

const parts = content.split(anchor);
if (parts.length === 2) {
    const topPart = parts[0];
    const bottomPartAndEnd = parts[1]; // this contains the shortcuts, payment console, and the final `</div>\n  );\n};`

    // Find the last </div> before `);`
    const lastDivIndex = bottomPartAndEnd.lastIndexOf('</div>');
    
    // Everything up to that last </div> is what we want to move
    const contentToMove = bottomPartAndEnd.substring(0, lastDivIndex);
    const veryEnd = bottomPartAndEnd.substring(lastDivIndex);

    // We inject `contentToMove` inside the main flex-1.
    // The anchor contains 4 closing divs:
    // </div> (left action/table flex-row wrapper)
    // </div> (table outer wrapper)
    // </div> (main invoice flex-1 wrapper)
    // </div> (lg:flex-row wrapper)

    // So we need to put `contentToMove` before the last two `</div>`s of the anchor!
    // Let's refine the anchor's meaning:
    /*
        </div> // closes flex-1 flex flex-col md:flex-row (middle workspace)
      </div> // closes ... wait, let's look at the actual code
    */

    const newMiddle = `                )}
              </div>
            </div>
          )}
        </div>
      </div>
` + contentToMove + `
    </div>
  </div>`;

    const newContent = topPart + newMiddle + veryEnd;
    fs.writeFileSync(file, newContent);
    console.log("Successfully moved bottom sections inside the main workspace!");
} else {
    console.log("Anchor not found or multiple found.");
}
