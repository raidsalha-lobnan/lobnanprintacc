const fs = require('fs');

function fixExact(filePath) {
  if (!fs.existsSync(filePath)) return;
  console.log('Fixing exact treasury codes in:', filePath);
  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const treasuries = snap.treasuries || [];

  treasuries.forEach(t => {
    if (!t) return;
    if (t.id === 'treasury-cash-main' || t.name.includes('الخزينة الرئيسية')) {
      t.accountCode = '1101';
      t.isDefault = true;
    } else if (t.id === 'treasury-1791395958513' || (t.name.includes('رائد صالحة') && !t.name.includes('ماهر صالحة'))) {
      t.accountCode = '1103';
      t.type = 'digital_wallet';
    } else if (t.id === 'treasury-1791324119020' || t.name.includes('بال باي')) {
      t.accountCode = '1104';
      t.type = 'digital_wallet';
    } else if (t.id === 'treasury-1790639512764' || t.name.includes('بنك فلسطين')) {
      t.accountCode = '1105';
      t.type = 'bank_account';
    }
  });

  snap.treasuries = treasuries;
  fs.writeFileSync(filePath, JSON.stringify(snap, null, 2), 'utf8');
}

fixExact('master_drive_database_snapshot.json');
fixExact('public/master_drive_database_snapshot.json');
