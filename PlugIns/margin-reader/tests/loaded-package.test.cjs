'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FILES,inspect}=require('../scripts/check-loaded.cjs');
async function packages(t){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mr-loaded-check-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const expected=path.join(temp,'expected'),loaded=path.join(temp,'loaded');
 for(const root of [expected,loaded]){
  for(const file of FILES){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),'fixture script');}
  await fs.writeFile(path.join(root,'agents-company.plugin.json'),JSON.stringify({id:'margin-reader',version:'0.7.0'}));
  await fs.writeFile(path.join(root,'schema.json'),JSON.stringify({commands:[{method:'study.card.activate'}]}));
 }
 return {expected,loaded};
}
test('deployment checks detect different builds even when both report the same plugin version, without writes or host mutations',async t=>{
 const p=await packages(t);await fs.writeFile(path.join(p.loaded,'ui/study-map.js'),'old single click selects only');
 const before=await fs.readFile(path.join(p.loaded,'ui/study-map.js')),commands=[];
 const result=await inspect({expectedRoot:p.expected,call:async args=>{commands.push(args);return args[1]==='list'?[{id:'margin-reader',directory:p.loaded}]:[];}});
 assert.deepEqual(commands,[['plugin','list'],['plugin','windows']]);assert.equal(result.matching,false);assert.equal(result.needsUpdate,true);assert.equal(result.applicationChanged,false);
 assert.deepEqual(result.differingFiles,['ui/study-map.js']);assert.equal(result.registered.version,result.expected.version);assert.deepEqual(await fs.readFile(path.join(p.loaded,'ui/study-map.js')),before);
});
test('matching deployment requires matching executable source files, and a missing registry entry fails explicitly',async t=>{
 const p=await packages(t);const result=await inspect({expectedRoot:p.expected,call:async args=>args[1]==='list'?[{id:'margin-reader',directory:p.loaded}]:[]});
 assert(result.matching&&!result.needsUpdate);assert.equal(result.registered.hasCardActivation,true);assert(result.workspaceMappingMatches);
 await fs.writeFile(path.join(p.expected,'source-location.json'),JSON.stringify({source:'/fixture/source-location'}));
 const differentScope=await inspect({expectedRoot:p.expected,call:async args=>args[1]==='list'?[{id:'margin-reader',directory:p.loaded}]:[]});
 assert(differentScope.matching);assert.equal(differentScope.workspaceMappingMatches,false,'Identical software must not hide a changed default workspace mapping');
 await assert.rejects(inspect({expectedRoot:p.expected,call:async()=>[]}),/not registered/);
});
