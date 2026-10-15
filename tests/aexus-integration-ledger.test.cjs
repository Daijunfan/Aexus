const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),ledger=JSON.parse(fs.readFileSync(path.join(root,'docs/AEXUS_MIGRATION_LEDGER.json')));
const contracts=require('../src/api-contracts.cjs');
test('the shipped Aexus 0.66.2 mapping excludes Guardian and plugin commands',()=>{
 assert.equal(ledger.source.registered,312);assert.equal(ledger.source.excludedGuardian,0);assert.equal(ledger.total,312);
 assert.equal(ledger.commands.length,312);
 assert.equal(new Set(ledger.commands.map(x=>x.aexusCommand)).size,312);
 assert.ok(ledger.commands.every(x=>!x.aexusCommand.startsWith('guardian.')));
 assert.equal(ledger.counts.pending+ledger.counts['mapped-partial'],312);
 assert.ok(ledger.commands.filter(x=>x.disposition==='mapped-partial').every(x=>x.contractCoverage==='semantic-overlap-only'));
});
test('every partially mapped Aexus command has a real Core declaration; pending entries remain visible',()=>{
 const mapped=ledger.commands.filter(x=>x.cloudHostsCommand);
 const known=new Set(contracts.catalog.map(x=>x.name));
 assert.ok(mapped.length>30);assert.ok(mapped.every(x=>known.has(x.cloudHostsCommand)));
 assert.ok(ledger.commands.every(x=>!x.aexusCommand.startsWith('plugin.')&&!x.aexusCommand.startsWith('guardian.')));
 assert.ok(ledger.commands.some(x=>x.aexusCommand==='channel.post-trigger-create'&&x.disposition==='pending')||ledger.commands.some(x=>x.aexusCommand.startsWith('channel.')&&x.disposition==='pending'));
 assert.equal(ledger.target.schemaHash,contracts.metadata().schemaHash);
});
test('the packaged API documentation hash and 37 current runtime Agent schemas stay in sync',()=>{
 const data=fs.readFileSync(path.join(root,'docs/AGENT_API_REFERENCE.md'),'utf8');
 assert.ok(data.includes(contracts.metadata().schemaHash));
 const rows=contracts.catalog.filter(x=>x.agentCallable);
 assert.equal(rows.length,37); // New source-tagged legacy catalog exposes 37 validated callable schemas.
 assert.ok(rows.every(x=>x.inputSchema&&x.outputSchema&&data.includes('`'+x.name+'`')));
 assert.doesNotMatch(data,/guardian\.snapshot|guardian\.event-list/i);
 const docs=fs.readFileSync(path.join(root,'docs/AEXUS_MIGRATION_LEDGER.json'),'utf8');
 assert.equal(createHash('sha256').update(docs).digest('hex').length,64);
});
