const fs = require('fs');

let content = fs.readFileSync('src/context/AccountingContext.tsx', 'utf-8');

content = content.replace(
  "    return {\n      success: true,\n      message: 'تم تصفير قاعدة البيانات بنجاح وفق المعايير والخيارات المحددة.',\n      summary,\n      executedAt: new Date().toISOString(),\n      executedBy: currentUser?.fullName || currentUser?.username || 'مدير النظام'\n    };\n  };",
  "    setTimeout(() => {\n       if (syncToFirebaseRef.current) {\n          syncToFirebaseRef.current(true);\n       }\n    }, 500);\n\n    return {\n      success: true,\n      message: 'تم تصفير قاعدة البيانات بنجاح وفق المعايير والخيارات المحددة.',\n      summary,\n      executedAt: new Date().toISOString(),\n      executedBy: currentUser?.fullName || currentUser?.username || 'مدير النظام'\n    };\n  };"
);

fs.writeFileSync('src/context/AccountingContext.tsx', content);
