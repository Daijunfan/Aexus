#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const api=require('../src/api-contracts.cjs');
const targets=[
 ['../docs/AGENT_API_REFERENCE.md',()=>{
 const info=api.metadata(),rows=api.catalog.filter(x=>x.agentCallable),groups=new Map();
 for(const item of rows){const key=item.name.split('.')[0];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
 return [
 '# CloudHosts Agent API (generated from executable Core contracts)','',
 'API version: '+info.apiVersion,
 'Schema SHA-256: '+info.schemaHash,
 'Product version: '+info.productVersion,'',
 '> These commands describe source-tagged CloudHosts legacy sessions. Agent Board Company/Messages/Plan use the original embedded Aexus Core, whose complete original API documentation is at AgentBoard/Aexus/docs/managers/API.md. Guardian and plugin products are excluded.',
 '',
 '## Native Agent call flow','',
 '1. `cloud_docs`: `{"operation":"identity"}` — real Agent, action-scoped management targets, host/workspace and allowed members.',
 '2. `cloud_docs`: `{"operation":"search","search":"plan","agentOnly":true}` — filter registered methods.',
 '3. `cloud_docs`: `{"operation":"describe","command":"plan.create"}` — read precise input/output schemas.',
 '4. `cloud_api`: `{"command":"plan.create","args":{...}}` — Core authorizes this native Agent and returns a structured result.',
 '5. Read the saved object through `cloud_api`. Retain the original call ID for uncertain transport outcomes; do not blindly reissue writes.','',
 'Only `cloud_reply` publishes the result of the current assigned group turn. Legacy `cloud_group_reply`, `cloud_delegate`, `cloud_task_status`, and `cloud_plan_create` remain compatible adapters.',
 '',
 '## CLI','',
 '`cloud-hosts api info`',
 '`cloud-hosts api list --prefix plan.`',
 '`cloud-hosts api describe plan.create`',
 '`cloud-hosts api docs scenario/weekly-verification`',
 '`cloud-hosts api call plan.list --data "{}"`',
 '',
 'CLI uses the operator-owned Core endpoint; the Agent tool applies additional authenticated Agent policies and cannot call host credentials or privileged management APIs.',
 '',
 '## Supported Agent business commands','',
 ...[...groups].flatMap(([group,items])=>[
  '### '+group,'',
  '| Core command | Effect | Description |',
  '| --- | --- | --- |',
  ...items.map(item=>'| `'+item.name+'` | '+item.effect+' | '+item.summary.replaceAll('|','\\|')+' |'),
  '',
 ]),
 '## Contract and runtime boundary','',
 'Every Agent-callable command declares a machine-readable input schema and output schema. The same dispatcher is used by the native App, Web, CLI and MCP tool. Writes require Full or a current per-call human approval; exact native Agent identity, current membership, role, target workspace, task source and current turn are rechecked by Core. A stable call ID records mutating calls in SQLite; ambiguous calls must be inspected, never blindly replayed.',
 '',
 'Scheduled Agent-created Plans retain a creator identity and recheck authority before dispatch. Fixed-text notices never invoke the model. Group Agent publications create public notes and do not fan out fresh Agent tasks.',
 '',
 'The CloudHosts CodeX engine uses its exact native thread ID; Claude/Pi/Cline companion conversations still have independent collaboration history. These cannot be represented as the same native conversation until supported seamless resume is verified.',
 '',
 'The command registry also includes operator/legacy Core commands marked non-Agent-callable. A schema listing does not grant permission or imply that Aexus full business behavior is implemented.',
 '',
 '## Scenarios','',
 ...['team-discussion','weekly-verification','delegated-work','session-history','plan-saved-view','plan-query'].map(x=>'- `cloud_docs {"operation":"document","document":"scenario/'+x+'"}`'),
 '',
 '## Saved Plan views','',
 'Run `cloud_docs` with `{"operation":"document","document":"scenario/plan-saved-view"}` to discover the complete versioned create/update/delete flow. Views are metadata owned by the authenticated creator, support the ten Aexus layout identifiers and optimistic revisions, and never create or replay scheduled tasks.',
 '',
 '## Complete Aexus command tracking','',
 'See [AEXUS_MIGRATION_LEDGER.json](AEXUS_MIGRATION_LEDGER.json) for the historical CloudHosts legacy API mapping: 312 non-product entries. The original complete Aexus Core is now embedded under AgentBoard/Aexus; the old partial mapping is no longer the implementation route. Guardian-only and plugin products remain disabled.',
 ''
 ].join('\n')}]
];
for(const [relative,render] of targets){
 const target=path.resolve(__dirname,relative),content=render();
 if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw Error('API reference is outdated: '+target);
 }else fs.writeFileSync(target,content);
 console.log(relative,content.length);
}
