const fs = require('fs');
const file = 'src/types/companyBranchUser.ts';
let content = fs.readFileSync(file, 'utf8');

// The first occurrence of email?: string; is in Company or Branch.
// We need to add password to SystemUser.
const target = `export interface SystemUser {
  id: string;
  companyId: string;
  username: string;
  fullName: string;
  email?: string;`;

const replacement = `export interface SystemUser {
  id: string;
  companyId: string;
  username: string;
  fullName: string;
  email?: string;
  password?: string;`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content);
