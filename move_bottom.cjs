const fs = require('fs');
const file = 'src/components/PosView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetPoint = `                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>

      {/* Quick Shortcuts Bar (Customizable Buttons) */}`;

const splitIndex = content.indexOf(targetPoint);
if (splitIndex === -1) {
    console.log("Could not find target point.");
    process.exit(1);
}

// The content we want to move is everything from `{/* Quick Shortcuts Bar` to the second to last `</div>`.
// Wait, an easier way is to just grab the chunk and replace it.

const startOfMove = content.indexOf(`      {/* Quick Shortcuts Bar (Customizable Buttons) */}`);
if (startOfMove === -1) {
    console.log("Could not find start of move.");
    process.exit(1);
}

// Find the last closing div.
const endOfFile = content.lastIndexOf(`  );
};`);

if (endOfFile === -1) {
    console.log("Could not find end of file.");
    process.exit(1);
}

// Let's find the closing `</div>` of the whole container just before `);`
const beforeReturn = content.substring(startOfMove, endOfFile);
const lastDivIndex = beforeReturn.lastIndexOf(`</div>`);

const movedContent = beforeReturn.substring(0, lastDivIndex).trimEnd();

// We need to inject movedContent BEFORE `    </div>\n  </div>\n\n      {/* Quick Shortcuts Bar`
const newStructure = `                )}
              </div>
            </div>
          )}
        </div>
      </div>

` + movedContent + `

    </div>
  </div>`;

// Wait, let's be absolutely sure about the div count.
// Let's print out the exact string we're replacing.
