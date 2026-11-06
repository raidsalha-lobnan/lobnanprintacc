// Read-only reconciliation report. Does NOT alter any accounting data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const snapshotPath = path.join(root, 'master_drive_database_snapshot.json');
const snapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : {};
const all = ['accounts','treasuries','parties','inventory','vouchers','invoices','purchases',
  'purchaseReturns','salesReturns','journalEntries','expenses','stockMovements'];
const result = { auditedAt: new Date().toISOString(), status: 'read-only', entities: {}, mismatches: [] };
for(const entity of all){
 const a = Array.isArray(snapshot[entity]) ? snapshot[entity] : [];
 const syncPath = path.join(root, '.sync_data', `${entity}.json`);
 const b = fs.existsSync(syncPath) ? JSON.parse(fs.readFileSync(syncPath,'utf8')) : [];
 const fromServer = Array.isArray(b) ? b : [];
 result.entities[entity] = { snapshotCount: a.length, serverCount: fromServer.length };
 if(!fs.existsSync(syncPath))continue;
 const byId = new Map(a.filter(v=>v?.id != null).map(v=>[String(v.id),v]));
 const second = new Map(fromServer.filter(v=>v?.id != null).map(v=>[String(v.id),v]));
 for(const [id, first] of byId){
   if(!second.has(id)){result.mismatches.push({entity,id,type:'missing_from_server'});continue;}
   const other=second.get(id);
   for(const field of ['balance','accountCode','name','code','totalAmount','status']){
     if(Object.hasOwn(first,field)||Object.hasOwn(other,field)){
       if(JSON.stringify(first[field]??null)!==JSON.stringify(other[field]??null)){
         result.mismatches.push({entity,id,type:'field_mismatch',field,
           snapshotValue:first[field]??null,serverValue:other[field]??null});
       }
     }
   }
 }
 for(const id of second.keys()) if(!byId.has(id)) result.mismatches.push({entity,id,type:'missing_from_snapshot'});
}
const out=path.join(root, 'reconciliation_report.json');
fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(`Read-only reconciliation: ${result.mismatches.length} differences; report: ${out}`);
if(result.mismatches.length)process.exitCode=2;
