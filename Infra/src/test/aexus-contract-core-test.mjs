// Real CLI -> Contract -> original Core. All state and native engines use disposable fixtures.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {createNodeClient} from '../../../Contract/node-client.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/aexus-architecture'),checks=[]
const f=await fixtureCore({},path.join(root,'.aexus/out/main/daemon.js'))
const rpc=async(cmd,args={},token=null)=>{const r=await f.request(token,cmd,args);assert.ok(r.ok,cmd+': '+r.error);return r.data}
const ok=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
try{
 const client=createNodeClient({env:f.env})
 const info=await client.info();assert.equal(info.contractVersion,'1.0.0');assert.equal(info.authority,'original caller')
 const descriptions=await client.describe();assert.ok(descriptions.commands.length>100);assert.ok(!descriptions.commands.some(c=>c.name.startsWith('plugin.')||c.name.startsWith('contract.')))
 ok(true,'Independent Contract version/catalog exclude plugins and recursive wrappers')
 const old=await f.request(null,'contract.call',{version:'99.0.0',command:'group.add',args:{name:'Should not exist'}});assert.equal(old.ok,false);assert.equal(old.code,'CONTRACT_VERSION_UNSUPPORTED')
 assert.ok(!(await rpc('group.list')).includes('Should not exist'))
 const nested=await f.request(null,'contract.call',{version:'1.0.0',command:'plugin.call',args:{}});assert.equal(nested.ok,false);assert.equal(nested.code,'CONTRACT_COMMAND_UNAVAILABLE')
 for(const args of [{version:'1.0.0',command:'group.add',args:null},{version:'1.0.0',command:'group.add',args:[]}])assert.equal((await f.request(null,'contract.call',args)).code,'CONTRACT_REQUEST_INVALID')
 const secret=await f.request(null,'contract.call',{version:'1.0.0',command:'host.list',args:{credentials:true}});assert.equal(secret.code,'CONTRACT_COMMAND_UNAVAILABLE')
 assert.equal((await f.request(null,'contract.describe',{domain:'plugins'})).code,'CONTRACT_REQUEST_INVALID')
 ok(true,'Unsupported versions and undeclared operations fail before side effects')
 await client.invoke('group.add',{name:'Research',mode:'build'});await client.invoke('group.add',{name:'Other',mode:'build'})
 const alice=await f.create('Alice','Research'),bob=await f.create('Bob','Other'),token=await f.token(alice.id)
 await rpc('workspace.write',{employee:alice.id,path:'plan.txt',content:'Keep identities stable',create:true})
 const identity=await rpc('contract.call',{version:'1.0.0',command:'auth.whoami',args:{}},token)
 const directIdentity=await rpc('auth.whoami',{},token);assert.deepEqual(identity.data,directIdentity)
 const unauthorized=await f.request(token,'contract.call',{version:'1.0.0',command:'workspace.read',args:{employee:bob.id,path:'private.txt'}});assert.equal(unauthorized.ok,false)
 assert.equal((await f.request(token,'workspace.read',{employee:bob.id,path:'private.txt'})).ok,false)
 ok(true,'Engine forwarding retains the exact employee identity and cross-Team permission checks')
 const group=await client.invoke('chat.create',{name:'Review room',members:[alice.id]})
 const workspace=await client.invoke('conversation.workspace',{conversation:'group:'+group.id})
 await client.invoke('conversation.file',{conversation:'group:'+group.id,operation:'write',path:'original.md',content:'User original',create:true})
 const forbidden=await f.request(token,'contract.call',{version:'1.0.0',command:'conversation.file',args:{conversation:'group:'+group.id,operation:'write',path:'original.md',content:'No'}});assert.equal(forbidden.ok,false)
 assert.equal((await rpc('conversation.file',{conversation:'group:'+group.id,operation:'read',path:'original.md'})).content,'User original')
 ok(true,'Group originals and member folder authorization remain effective through Contract')
 const engines=await client.engines();assert.ok(engines.engines.some(e=>e.id==='workspace-audit'));assert.deepEqual(engines.errors,[])
 const target=path.join(f.temp,'audit.json')
 const result=await promisify(execFile)(process.execPath,[path.join(root,'Engine/workspace-audit/cli.mjs'),'--input',JSON.stringify({team:'Research'}),'--output',target],{env:f.env,timeout:30000,maxBuffer:16e6})
 const report=JSON.parse(result.stdout);assert.ok(report.ok);assert.equal(report.data.workspaces.length,2);assert.ok(report.data.acceptance.passed);assert.deepEqual(JSON.parse(fs.readFileSync(target)),report.data)
 assert.ok(report.data.workspaces.some(w=>w.employeeId===alice.id&&w.entries.some(e=>e.name==='plan.txt')))
 ok(true,'Reference Engine CLI produces a saved delivery with real workspace entries and acceptance evidence')
 const payload='Large stdin payload · 数据\n'.repeat(18000);await client.invoke('workspace.write',{employee:alice.id,path:'large.txt',content:payload,create:true});assert.equal((await client.invoke('workspace.read',{employee:alice.id,path:'large.txt'})).content,payload)
 const events=[];for await(const event of client.follow(alice.id))events.push(event);assert.ok(events.some(event=>event.type==='snapshot'&&typeof event.following==='string'&&Array.isArray(event.transcript)),'The original CLI emits a snapshot and then closes an idle stream; EOF does not invent a completed task')
 await assert.rejects(client.invoke('session.follow',{employee:alice.id}),e=>e.code==='CONTRACT_STREAM_REQUIRED')
 ok(true,'Large JSON travels over stdin and the finite original session stream has a distinct, validated transport')
 const layer=await rpc('view.layer',{layer:'engine',engineId:'workspace-audit'});assert.equal(layer.layer,'engine');assert.equal(layer.engineId,'workspace-audit')
 await rpc('view.select',{id:'messages'});assert.equal((await rpc('view.get')).layer??'infra','infra')
 await rpc('view.layer',{layer:'engine'});await rpc('view.layer',{layer:'infra'});assert.equal((await rpc('view.get')).kind,'messages')
 ok(true,'Layer navigation preserves Infra state and existing navigation returns to Infra')
 const domain=await rpc('infra.api',{domain:'plan'});assert.ok(domain.commands.some(c=>c.name==='schedule.create'));assert.ok(domain.commands.every(c=>!c.name.startsWith('plugin.')))
 const oldCLI=await f.cli('group','list');assert.deepEqual(oldCLI,await client.invoke('group.list'))
 ok(true,'Employee-facing Infra discovery stays separate; legacy agents CLI reads the same store')
 await f.stop();await f.start();assert.equal((await client.invoke('session.list')).sessions.find(s=>s.id===alice.id).cwd,alice.cwd)
 assert.equal((await rpc('conversation.workspace',{conversation:'group:'+group.id})).root,workspace.root)
 ok(true,'Restart retains employee and conversation workspace identities')
 fs.writeFileSync(path.join(out,'contract-core.json'),JSON.stringify({passed:true,checks,commands:descriptions.commands.length,paidModels:0,productionDataUsed:false},null,2))
}finally{await f.close()}
