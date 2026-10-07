// Source-built authenticated Core and deterministic native protocol; no real accounts or model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {reuseDraft} from '../shared/message-drafts.ts'
import {messageSourceView} from '../shared/message-source.ts'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-source-'))),out=path.join(root,'.aexus/artifacts/message-source'),checks=[]
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');fs.mkdirSync(out,{recursive:true});let f
const report={passed:false,checks,providerCalls:0}
try{
 for(const value of ['company','messages','plan',undefined])assert.equal(messageSourceView(value),value)
 for(const value of [null,'Company','message','',{},['messages'],false])assert.throws(()=>messageSourceView(value),/sourceView/)
 const previous={text:'Same intent',clientMessageId:'frozen',viewId:'team-view',sourceView:'company'}
 assert.equal(reuseDraft({text:' Same intent '},previous).sourceView,'company');assert.equal(reuseDraft({text:'Same intent'},previous).clientMessageId,'frozen');assert.equal(reuseDraft({text:'Changed intent'},previous).sourceView,undefined);assert.notEqual(reuseDraft({text:'Changed intent'},previous).clientMessageId,'frozen')
 const entry=path.join(temp,'daemon.cjs');await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'});f=await fixtureCore({},entry)
 const rpc=async(cmd,args={},auth=null)=>{const value=await f.request(auth,cmd,args);assert.ok(value.ok,cmd+': '+value.error);return value.data},deny=async(cmd,args,pattern,auth=null)=>{const value=await f.request(auth,cmd,args);assert.equal(value.ok,false,cmd);if(pattern)assert.match(value.error,pattern);return value}
 const users=async id=>(await rpc('session.transcript',{employee:id})).items.filter(item=>item.role==='user'),hold=id=>fs.writeFileSync(path.join(f.control,id+'.hold-user'),''),release=id=>fs.rmSync(path.join(f.control,id+'.hold-user'),{force:true}),work=id=>JSON.parse(fs.readFileSync(path.join(f.control,id+'-work.json'),'utf8')).text,source=text=>JSON.parse(text.match(/\[Aexus message source\]\n([^\n]+)/)[1]).sourceView
 const idle=id=>f.until(async()=>{const value=await f.status(id);return !value.busy&&(!value.sessionId||!(await rpc('session.queue',{id:value.sessionId})).length)},'native idle')
 await rpc('group.add',{name:'Source context'});const people={};for(const role of ['secretary','manager','governor','employee'])people[role]=await f.create(role,'Source context',role)
 const taskView=await rpc('team-view.create',{name:'Independent target scope',teams:['Source context']})
 for(const [role,person] of Object.entries(people))for(const origin of ['company','messages','plan']){
  const text='SOURCE_'+role+'_'+origin,args={employee:person.id,text,sourceView:origin,clientMessageId:text,...(role==='governor'?{viewId:taskView.id}:{})};hold(person.id)
  const receipt=await rpc('session.send',args);await f.until(()=>fs.existsSync(path.join(f.control,person.id+'-work.json'))&&work(person.id).includes(text),'captured native source')
  assert.equal(source(work(person.id)),origin);assert.ok(work(person.id).includes('"managementRole":"'+role+'"'));const task=(await f.status(person.id)).currentTask;assert.equal(task.sourceView,origin);assert.equal(task.viewId,role==='governor'?taskView.id:undefined)
  if(origin==='messages')assert.ok(work(person.id).includes('chat.list')&&work(person.id).includes('不要仅因来源而建群或群发'))
  assert.ok(work(person.id).includes('先遵循正文中的明确要求'))
  assert.equal((await rpc('session.enqueue',args)).messageId,receipt.messageId);await deny('session.send',{...args,sourceView:origin==='company'?'messages':'company'},/different private message/)
  const item=(await users(person.id)).find(item=>item.text===text);assert.equal(item.sourceView,origin);assert.deepEqual(item.author,{kind:'operator'});assert.equal(item.text,text);assert.equal((await users(person.id)).filter(item=>item.text===text).length,1)
  release(person.id);await idle(person.id)
 }
 checks.push('All four roles receive independent Company/Messages/Plan context in actual native input; raw history, authors and Governor target view remain intact; changed-origin retries reject without duplicate work')
 const person=people.secretary,worker=people.employee,block={employee:person.id,text:'SOURCE_QUEUE_BLOCKER',sourceView:'company'};hold(person.id);await rpc('session.send',block)
 const queued=await rpc('session.enqueue',{employee:person.id,text:'QUEUED_MESSAGES_ORIGIN',sourceView:'messages',clientMessageId:'queued-source'}),sessionId=(await f.status(person.id)).sessionId
 assert.equal((await rpc('session.queue',{id:sessionId})).find(item=>item.id===queued.queueId).sourceView,'messages')
 await rpc('view.select',{id:'plan'});release(person.id);await idle(person.id);assert.equal(source(work(person.id)),'messages');assert.equal((await users(person.id)).find(item=>item.text==='QUEUED_MESSAGES_ORIGIN').sourceView,'messages')
 await rpc('view.select',{id:'messages'});await rpc('session.send',{employee:person.id,text:'NO_SOURCE_IS_UNKNOWN',clientMessageId:'unknown-source'});await idle(person.id);assert.equal(source(work(person.id)),null);assert.equal((await users(person.id)).find(item=>item.text==='NO_SOURCE_IS_UNKNOWN').sourceView,undefined)
 await deny('session.send',{employee:person.id,text:'NO_SOURCE_IS_UNKNOWN',clientMessageId:'unknown-source',sourceView:'company'},/different private message/)
 const secretaryToken=await f.token(person.id),workerToken=await f.token(worker.id);await rpc('session.send',{employee:worker.id,text:'DELEGATION_DOES_NOT_INHERIT_SCREEN'},secretaryToken);await idle(worker.id);assert.equal(source(work(worker.id)),null);assert.deepEqual((await users(worker.id)).at(-1).author,{kind:'agent',employeeId:person.id})
 await deny('session.send',{employee:person.id,text:'NO_UPWARD_AUTHORITY',sourceView:'company'},/Forbidden|not authorized|permission|Only|control/i,workerToken)
 checks.push('Queued origin survives later UI navigation; absent CLI/Agent origin stays explicitly unknown and never inherits another turn; declaring a view does not authorize upward control')
 // Source metadata composes with the ordinary reply, attachment and CLI contracts.
 const target=(await users(worker.id))[0];fs.writeFileSync(path.join(worker.cwd,'source-note.txt'),'Source attachment')
 await f.cli('session','send','--employee',worker.id,'--text','CLI_WITH_REFERENCE','--source-view','messages','--files','["source-note.txt"]','--reply-to',target.id);await idle(worker.id)
 let item=(await users(worker.id)).at(-1);assert.equal(item.sourceView,'messages');assert.equal(item.reply.id,target.id);assert.equal(item.files[0].name,'source-note.txt');assert.equal(item.text,'CLI_WITH_REFERENCE')
 const live=(await f.status(worker.id)).sessionId;await f.cli('session','send',live,'POSITIONAL_SOURCE','--source-view','company');await idle(worker.id);assert.equal((await users(worker.id)).at(-1).sourceView,'company')
 for(const command of ['send','enqueue','steer'])assert.equal((await f.raw(null,'session',command,live,'bad','--source-view','bad')).ok,false)
 await rpc('messenger.draft',{conversation:'employee:'+worker.id,text:'Durable source draft',clientMessageId:'durable-draft',sourceView:'messages'})
 const draftState=await rpc('messenger.state');await deny('messenger.draft',{conversation:'employee:'+worker.id,text:'Invalid draft',sourceView:'bad'},/sourceView/);assert.deepEqual((await rpc('messenger.state')).drafts,draftState.drafts)
 await rpc('session.close',{id:live});for(const value of ['bad',null,{},17])await deny('session.send',{employee:worker.id,text:'Invalid source must not start a session',sourceView:value},/sourceView/);assert.equal((await f.status(worker.id)).sessionId,undefined)
 checks.push('Positional and employee CLI forms, replies and attachments retain correct origin; bad metadata rejects before startup or draft replacement')
 // Upgrade compatibility: old accepted receipts keep their old hash and absent provenance.
 const legacyArgs={employee:worker.id,text:'LEGACY_ACCEPTED',clientMessageId:'legacy-receipt'};const legacy=await rpc('session.send',legacyArgs);await idle(worker.id)
 const journalFile=path.join(f.env.AGENTS_COMPANY_HOME,'message-receipts',worker.id+'.json'),journal=JSON.parse(fs.readFileSync(journalFile,'utf8'));delete Object.values(journal).find(value=>value.clientMessageId===legacyArgs.clientMessageId).sourceView;fs.writeFileSync(journalFile,JSON.stringify(journal))
 const count=(await users(worker.id)).length;await f.stop();await f.start();assert.equal((await rpc('session.send',{...legacyArgs,sourceView:'messages'})).messageId,legacy.messageId);assert.equal((await f.status(worker.id)).sessionId,undefined);assert.equal((await users(worker.id)).length,count);assert.equal((await users(worker.id)).at(-1).sourceView,undefined)
 assert.equal((await rpc('messenger.state')).drafts['employee:'+worker.id].sourceView,'messages');assert.equal((await users(person.id)).find(item=>item.text==='QUEUED_MESSAGES_ORIGIN').sourceView,'messages')
 assert.deepEqual(await rpc('chat.list'),[]);assert.deepEqual(await rpc('terminal.list'),[])
 checks.push('Core restart preserves original source and drafts; legacy accepted journal confirms without replay or invented provenance; source context alone never creates a group or terminal')
 report.passed=true;console.log('PASS message source: '+checks.join('; '))
}catch(error){report.error=error.message;throw error}finally{await f?.close();fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify(report,null,2));fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
