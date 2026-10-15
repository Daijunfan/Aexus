#!/usr/bin/env node
// Development-only snapshot: Aexus source is never a CloudHosts runtime dependency.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
// The historical legacy ledger reads the vendored original Aexus inventory,
// never the developer's separate checkout or any running service.
const original=path.resolve(__dirname,'../AgentBoard/Aexus/docs/managers/commands.json');
const dest=path.resolve(__dirname,'../docs/AEXUS_MIGRATION_LEDGER.json');
const source=JSON.parse(fs.readFileSync(original,'utf8'));
const contracts=require('../src/api-contracts.cjs');
const available=new Set(contracts.catalog.map(x=>x.name));
const count=new Set(source.map(x=>x.name));
if(count.size!==source.length)throw Error('Aexus registration contains duplicate names');
const mapping={
 'auth.whoami':'api.info','api.list':'api.list','api.describe':'api.describe','api.docs':'api.document',
 'plan.query':'plan.query','plan.calendar':'plan.calendar','plan.timeline':'plan.timeline',
 'plan.analytics':'plan.analytics','plan.feed':'plan.feed','plan.schema':'plan.schema',
 'plan.views':'plan.views','plan.view-create':'plan.view-create','plan.view-update':'plan.view-update','plan.view-delete':'plan.view-delete',
 'chat.list':'messages.list','chat.get':'messages.get','chat.history':'messages.history',
 'chat.create':'messages.create','chat.update':'messages.update','chat.post':'messages.publish',
 'schedule.list':'plan.list','schedule.get':'plan.get','schedule.create':'plan.create',
 'schedule.update':'plan.update','schedule.delete':'plan.archive',
 'schedule.history':'plan.history','schedule.preview':'plan.preview','schedule.cancel':'plan.cancel','schedule.run':'plan.run',
 'group.list':'company.teams','group.add':'company.createTeam','group.configure':'company.updateTeam',
};
const retired=new Set(['api.list-legacy']); // Reserved for explicitly verified retired commands only.
const records=source.filter(x=>!x.name.startsWith('guardian.')).map(entry=>{
 const candidate=mapping[entry.name]||(entry.name.startsWith('host.')?'hosts.'+entry.name.slice(5):null);
 const resolved=candidate&&available.has(candidate)?candidate:null;
 const partial=Boolean(resolved);
 const description=entry.summary||entry.description||'';
 return {
  aexusCommand:entry.name,
  sourceVersion:'0.66.2',
  domain:entry.name.split('.')[0],
  summary:description,
  disposition:retired.has(entry.name)?'retired-needs-review':partial?'mapped-partial':'pending',
  cloudHostsCommand:resolved,
  contractCoverage:partial?'semantic-overlap-only':'not-migrated',
  review:partial?'Require parameter, permission, behavior, UI, persistence and scenario parity tests before marking migrated.':'No verified CloudHosts equivalent yet; preserve the real Aexus handler as migration source.',
 };
});
if(source.length!==312||source.length!==records.length||source.some(x=>x.name.startsWith('plugin.')||x.name.startsWith('guardian.')))
 throw Error('Unexpected Aexus inventory; review current source before updating ledger');
if(records.some(x=>x.cloudHostsCommand&&!available.has(x.cloudHostsCommand)))throw Error('Ledger targets an unregistered command');
const counts={};
for(const row of records)counts[row.disposition]=(counts[row.disposition]||0)+1;
const result={
 source:{project:'Aexus',version:'0.66.2',file:'docs/managers/commands.json',
   sha256:createHash('sha256').update(fs.readFileSync(original)).digest('hex'),
   registered:source.length,excludedGuardian:source.length-records.length},
 target:{project:'CloudHosts',version:require('../package.json').version,
   apiVersion:contracts.metadata().apiVersion,schemaHash:contracts.metadata().schemaHash},
 total:records.length,counts,
 completionPolicy:'Historical CloudHosts legacy mapping only. All 312 original Aexus non-plugin/non-Guardian handlers run in the separately embedded original Aexus Core. Do not use the partial mapping for migrated identities.',
 commands:records,
};
const output=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')){
 if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==output)throw Error('Aexus migration ledger is outdated. Run node scripts/sync-aexus-ledger.cjs');
}else fs.writeFileSync(dest,output);
console.log(JSON.stringify({total:records.length,counts,sourceSha256:result.source.sha256.slice(0,12)}));
