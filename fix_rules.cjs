const fs = require('fs');
const file = 'firestore.rules';
let content = fs.readFileSync(file, 'utf8');

const target = `    match /appState/{stateId} {
      allow read, write: if true;
    }
  }
}`;

const replacement = `    match /appState/{stateId} {
      allow read, write: if true;
    }

    match /userSessions/{userId} {
      allow read, write: if true;
    }
  }
}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
