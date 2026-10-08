const fs = require('fs');

let content = fs.readFileSync('src/components/settings/DatabaseZeroingSettings.tsx', 'utf-8');

// Add forceSyncNow
content = content.replace(
  "    performDatabaseZeroing,",
  "    performDatabaseZeroing,\n    forceSyncNow,"
);

// Update execute
content = content.replace(
  "const handleExecuteZeroing = () => {",
  "const handleExecuteZeroing = async () => {"
);

content = content.replace(
  "      const res = performDatabaseZeroing(options);\n      setExecutionResult(res);\n      setShowResultModal(true);\n      setConfirmInput('');",
  "      const res = performDatabaseZeroing(options);\n      await new Promise(resolve => setTimeout(resolve, 800)); // wait for react state to settle\n      await forceSyncNow(); // ensure the deletions are committed to firebase before showing success\n      setExecutionResult(res);\n      setShowResultModal(true);\n      setConfirmInput('');"
);

fs.writeFileSync('src/components/settings/DatabaseZeroingSettings.tsx', content);
