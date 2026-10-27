const fs = require('fs');

function fixAndRebuild(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('Fixing treasury account codes in:', filePath);
  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const treasuries = snap.treasuries || [];

  treasuries.forEach(t => {
    if (!t) return;
    const name = (t.name || '').toLowerCase();
    if (name.includes('الخزينة الرئيسية') || name.includes('الصندوق النقدي')) {
      t.accountCode = '1101';
      t.isDefault = true;
    } else if (name.includes('رائد صالحة') || name.includes('ال باي') || name.includes('مال شات')) {
      t.accountCode = '1103';
      t.type = 'digital_wallet';
    } else if (name.includes('بال باي') || name.includes('palpay') || name.includes('محفظة بال باي')) {
      t.accountCode = '1104';
      t.type = 'digital_wallet';
    } else if (name.includes('بنك فلسطين') || name.includes('ماهر صالحة')) {
      t.accountCode = '1105';
      t.type = 'bank_account';
    }
  });

  snap.treasuries = treasuries;
  fs.writeFileSync(filePath, JSON.stringify(snap, null, 2), 'utf8');
}

fixAndRebuild('master_drive_database_snapshot.json');
fixAndRebuild('public/master_drive_database_snapshot.json');
