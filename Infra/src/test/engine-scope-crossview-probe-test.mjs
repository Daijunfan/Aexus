// Independent black-box scope probe: real CLI/Core and file/index operations in disposable state.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/engine-launcher-scope/crossview-probe'),checks=[]
fs.mkdirSync(out,{recursive:true});const scratch=fs.mkdtempSync(path.join(out,'build-'));let f
const check=async(name,work)=>{try{await work();checks.push({name,passed:true});console.log('PASS '+name)}catch(error){checks.push({name,passed:false,error:error.stack});console.log('FAIL '+name+'\n'+error.stack)}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.every(c=>c.passed),checks},null,2))}}
try{
 await build({entryPoints:Object.fromEntries(['daemon','message-index-worker','asset-index-worker'].map(n=>[n,path.join(root,'Infra/src/main/'+n+'.ts')])),outdir:scratch,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:'undefined'},logLevel:'silent'})
 f=await fixtureCore({},path.join(scratch,'daemon.js'))
 const raw=(engine,command,args={},token=null)=>f.raw(token,'api','call',command,'--args',JSON.stringify(args),...(engine?['--engine-scope',engine]:[]))
 const call=async(engine,command,args={})=>{const result=await raw(engine,command,args);assert.ok(result.ok,command+': '+result.error);return result.data}
 const A='deep-research',B='profile-improvement';await call(A,'group.add',{name:'A-Probe',mode:'build'});await call(B,'group.add',{name:'B-Probe',mode:'build'})
 const create=async(engine,name,team)=>{const c=await call(engine,'card.create',{title:name,group:team,engine:'codex',kind:'worker',managementRole:'employee',model:'gpt-6-luna',effort:'low'});await f.ready(c.id);return c}
 const alice=await create(A,'Scope Alice','A-Probe'),bob=await create(B,'Scope Bob','B-Probe')
 const ga=await call(A,'chat.create',{name:'A-Probe-Group',members:[alice.id]}),gb=await call(B,'chat.create',{name:'B-Probe-Group',members:[bob.id]})
 const ca=await call(A,'channel.create',{name:'A-Probe-Channel',engine:{kind:'employees',employeeIds:[alice.id]}}),cb=await call(B,'channel.create',{name:'B-Probe-Channel',engine:{kind:'employees',employeeIds:[bob.id]}})
 const schedule=async(engine,employee,name)=>call(engine,'schedule.create',{spec:{name,action:{type:'agent',employeeId:employee,prompt:'Fixture only: no automatic run'},rule:{kind:'once',at:new Date(Date.now()+86400000).toISOString()},enabled:false}})
 const pa=await schedule(A,alice.id,'A-Probe-Plan'),pb=await schedule(B,bob.id,'B-Probe-Plan')
 await check('Scoped Company, groups, channels and Plan queries return only the matching live resources',async()=>{
  for(const[engine,own,foreign,team,group,channel,plan]of [[A,alice,bob,'A-Probe',ga,ca,pa],[B,bob,alice,'B-Probe',gb,cb,pb]]){
   const s=await call(engine,'session.list');assert.deepEqual(s.sessions.map(c=>c.id),[own.id]);assert.deepEqual(s.groups,[team]);assert.ok(!JSON.stringify(s).includes(foreign.id));const topology=await call(engine,'management.topology');assert.equal(topology.summary.teams,1,'Topology Team count must be scoped');assert.equal(topology.summary.employees,1,'Topology employee count must be scoped');assert.ok(!JSON.stringify(topology).includes(foreign.id))
   assert.deepEqual((await call(engine,'chat.list')).map(g=>g.id),[group.id]);assert.deepEqual((await call(engine,'channel.list')).map(c=>c.id),[channel.id]);assert.deepEqual((await call(engine,'schedule.list')).map(p=>p.id),[plan.id]);const q=await call(engine,'plan.query',{});assert.ok(JSON.stringify(q).includes(plan.id));assert.ok(!JSON.stringify(q).includes(engine===A?pb.id:pa.id))
  }
 })
 await check('Directory counts and pagination are computed after applying the Engine scope',async()=>{
  for(const[engine,employee,group,channel]of [[A,alice,ga,ca],[B,bob,gb,cb]]){
   for(const[type,id]of [['private',employee.id],['groups',group.id],['channels',channel.id]]){const d=await call(engine,'messenger.directory',{type,limit:1});assert.equal(d.total,1,JSON.stringify(d));assert.equal(d.entries.length,1);assert.ok(JSON.stringify(d.entries[0]).includes(id));const next=await call(engine,'messenger.directory',{type,offset:1,limit:1});assert.equal(next.entries.length,0);assert.equal(next.total,1)}
  }
 })
 await check('Known IDs cannot open another Engine’s private work, discussion or schedule',async()=>{
  const accepted=[];for(const[command,args]of [['session.transcript',{employee:bob.id}],['chat.history',{id:gb.id}],['channel.history',{id:cb.id}],['schedule.get',{id:pb.id}],['workspace.read',{employee:bob.id,path:'secret.md'}],['conversation.workspace',{conversation:'group:'+gb.id}],['assets.locate',{id:'employee:'+bob.id}],['view.open',{kind:'messages',chatId:gb.id}]]){const r=await raw(A,command,args);if(r.ok)accepted.push(command)};assert.deepEqual(accepted,[],'Out-of-scope commands unexpectedly accepted')
 })
 await check('New and removed employees dynamically follow a bound Team; renaming keeps ownership',async()=>{
  const added=await create(A,'Later Alice','A-Probe');assert.ok((await call(A,'session.list')).sessions.some(c=>c.id===added.id));assert.ok(!(await call(B,'session.list')).sessions.some(c=>c.id===added.id))
  await call(A,'group.rename',{name:'A-Probe',nextName:'A-Renamed'});assert.deepEqual((await call(A,'session.list')).groups,['A-Renamed']);await call(A,'card.remove',{id:added.id,deleteWorkspace:false});assert.ok(!(await call(A,'session.list')).sessions.some(c=>c.id===added.id))
 })
 await call(A,'workspace.write',{employee:alice.id,path:'scope-proof-alice.txt',content:'Alice engine file',create:true});await call(B,'workspace.write',{employee:bob.id,path:'scope-proof-bob.txt',content:'Bob engine file',create:true})
 await check('Interleaved file-tree/search queries do not show or erase the other Engine’s index view',async()=>{
  for(let i=0;i<4;i++)for(const[engine,name,foreign]of [[A,'scope-proof-alice.txt','scope-proof-bob.txt'],[B,'scope-proof-bob.txt','scope-proof-alice.txt']]){
   const tree=await call(engine,'assets.tree',{});assert.ok(!JSON.stringify(tree).includes(engine===A?bob.id:alice.id))
   let page;for(let attempt=0;attempt<60;attempt++){page=await call(engine,'assets.search',{query:'scope-proof',limit:20});if(page.entries.some(e=>e.name===name))break;await new Promise(r=>setTimeout(r,50))}
   assert.ok(page.entries.some(e=>e.name===name),JSON.stringify(page));assert.ok(!page.entries.some(e=>e.name===foreign));assert.ok(!JSON.stringify(page).includes(engine===A?bob.id:alice.id))
  }
 })
 await check('Individual linking shows only the selected employee, not unrelated colleagues in that Team',async()=>{
  await call(null,'group.add',{name:'Mixed-Probe',mode:'build'});const one=await create(null,'Linked individual','Mixed-Probe'),peer=await create(null,'Not linked','Mixed-Probe');await call(null,'infra.bind',{engineId:A,resources:{employees:[one.id]}})
  const s=await call(A,'session.list');assert.ok(s.sessions.some(c=>c.id===one.id));assert.ok(!s.sessions.some(c=>c.id===peer.id));await call(null,'workspace.write',{employee:peer.id,path:'scope-proof-peer.txt',content:'Not shared',create:true})
  const listing=await raw(A,'workspace.list',{team:'Mixed-Probe',path:'.'});assert.equal(listing.ok,false,'An individual association must not grant its entire Team file root')
  const tree=await call(A,'assets.tree',{});assert.ok(!JSON.stringify(tree).includes(peer.id));const search=await call(A,'assets.search',{query:'scope-proof-peer',limit:20});assert.equal(search.total,0,JSON.stringify(search))
 })
 await check('Unlink is non-destructive, original user CLI remains available, and restart preserves explicit exclusion',async()=>{
  await call(null,'infra.unbind',{engineId:A,resources:{employees:[alice.id]}});assert.ok(!(await call(A,'session.list')).sessions.some(c=>c.id===alice.id));assert.ok((await call(null,'session.list')).sessions.some(c=>c.id===alice.id));assert.equal((await call(null,'workspace.read',{employee:alice.id,path:'scope-proof-alice.txt'})).content,'Alice engine file')
  await f.stop();await f.start();assert.ok(!(await call(A,'session.list')).sessions.some(c=>c.id===alice.id));assert.ok((await call(B,'session.list')).sessions.some(c=>c.id===bob.id));assert.equal((await call(null,'workspace.read',{employee:alice.id,path:'scope-proof-alice.txt'})).content,'Alice engine file')
 })
 await check('Resource association controls remain human-only under a real employee credential',async()=>{
  const token=await f.token(bob.id);for(const command of ['infra.scope','infra.bind','infra.unbind'])assert.equal((await raw(B,command,{engineId:B,...(command==='infra.scope'?{}:{resources:{employees:[alice.id]}})},token)).ok,false)
 })
 assert.ok(checks.every(c=>c.passed),'One or more scope probes failed; see results.json')
}catch(error){fs.writeFileSync(path.join(out,'fatal.log'),error.stack??String(error));throw error}finally{await f?.close();fs.rmSync(scratch,{recursive:true,force:true})}
