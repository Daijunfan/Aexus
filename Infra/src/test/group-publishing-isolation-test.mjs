// Reproduce a multi-member greeting through the real Core/native queue, with deterministic explicit publication.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),out=path.join(f.root,'.aexus/artifacts/group-conversation-fix'),checks=[]
const rpc=async(cmd,args={},auth=null)=>{const result=await f.request(auth,cmd,args);assert.ok(result.ok,result.error);return result.data}
try{
 await f.cli('group','add','Greeting studio');await f.cli('group','add','Other team')
 const a=await f.create('Alex','Greeting studio','manager'),b=await f.create('Alex','Other team'),c=await f.create('Observer','Greeting studio'),people=[a,b,c],tokens=new Map(await Promise.all(people.map(async p=>[p.id,await f.token(p.id)])))
 const group=await rpc('chat.create',{name:'Good morning room',members:people.map(p=>p.id)}),history=()=>rpc('chat.history',{id:group.id,limit:100}),transcript=p=>rpc('session.transcript',{employee:p.id}),states=()=>Promise.all(people.map(p=>f.status(p.id)))
 const idle=()=>f.until(async()=>{const messages=(await history()).messages;const failed=messages.flatMap(m=>m.deliveries).find(d=>d.status==='failed'||d.status==='interrupted');if(failed)throw Error(JSON.stringify(failed));return messages.every(m=>m.deliveries.every(d=>d.status==='completed'))&&(await states()).every(s=>!s.busy&&!(s.pendingMessages?.length))},'finite delivery wave completes')
 // Existing private unread must survive shared work; existing read replies must stay read.
 for(const p of people){await rpc('session.send',{employee:p.id,text:'Private baseline for '+p.id});await f.received(p.id,'Private baseline for '+p.id);await f.until(async()=>!(await f.status(p.id)).busy,'baseline work finished')}
 for(const p of [a,c]){const s=await f.status(p.id);await rpc('session.acknowledge',{employee:p.id,replyId:s.lastReply.id})}
 const baseline=new Map(await Promise.all(people.map(async p=>[p.id,{reply:(await f.status(p.id)).lastReply,native:(await rpc('session.list')).sessions.find(s=>s.id===p.id).threadId}])));
 for(const [i,p] of people.entries()){
  fs.writeFileSync(path.join(f.control,p.id+'.ack-output.txt'),i===0?'null':i===1?'{"text":null}':'I do not need to say anything publicly.')
  fs.writeFileSync(path.join(f.control,p.id+'.work-post.json'),JSON.stringify({text:'Good morning from '+p.id}))
  fs.writeFileSync(path.join(f.control,p.id+'.reply.txt'),'Complete private work log for the shared greeting.')
 }
 const args={id:group.id,text:'Good morning',clientMessageId:'greeting-once'},sent=await rpc('chat.send',args);await idle()
 assert.equal(sent.broadcast,true);assert.ok(sent.deliveries.every(d=>d.mode==='work'))
 let messages=(await history()).messages;assert.equal(messages.length,4);assert.equal(messages[0].text,'Good morning')
 for(const p of people){assert.equal(messages.filter(m=>m.author.kind==='agent'&&m.author.employeeId===p.id).length,1);assert.deepEqual((await f.status(p.id)).lastReply,baseline.get(p.id).reply);assert.equal((await transcript(p)).items.filter(item=>item.role==='user'&&item.text==='Good morning').length,1);assert.ok((await transcript(p)).text.includes('Complete private work log'));assert.equal((await rpc('session.list')).sessions.find(s=>s.id===p.id).threadId,baseline.get(p.id).native)}
 assert.ok(messages.slice(1).every(m=>!m.acknowledgmentOf&&m.deliveries.every(d=>d.mode==='awareness'&&d.readAt&&d.status==='completed')))
 assert.ok(!messages.some(m=>/^(null|undefined)$/.test(m.text)||m.text.includes('do not need')))
 const settled=JSON.stringify(messages);await new Promise(resolve=>setTimeout(resolve,900));assert.equal(JSON.stringify((await history()).messages),settled,'no further public messages or delivery churn after one awareness wave')
 assert.equal((await rpc('chat.send',args)).id,sent.id);await idle();assert.equal((await history()).messages.length,4)
 checks.push('Three employees each explicitly publish once; no-mention broadcast does not produce recursive replies or null messages; duplicate request is not redispatched')
 // Both direct API and CLI refuse the old sentinel/empty publication paths.
 for(const text of [null,'',' ','null','undefined']){const result=await f.request(tokens.get(a.id),'chat.post',{id:group.id,text,replyTo:sent.id,clientMessageId:'invalid-'+String(text)});assert.equal(result.ok,false);assert.equal((await history()).messages.length,4)}
 const rejected=await f.raw(tokens.get(a.id),'chat','post',group.id,'--reply-to',sent.id,'--silent');assert.equal(rejected.ok,false);assert.match(rejected.error,/Silent publication is removed/)
 checks.push('Null, whitespace, placeholder strings and --silent cannot create a message, delivery wave or unread change')
 // Group/user read and private/user read are independent in both directions.
 assert.equal((await rpc('chat.get',{id:group.id})).unread,true)
 await rpc('session.acknowledge',{employee:b.id,replyId:baseline.get(b.id).reply.id});assert.equal((await rpc('chat.get',{id:group.id})).unread,true)
 await rpc('chat.acknowledge',{id:group.id,messageId:messages.at(-1).id});assert.equal((await rpc('chat.get',{id:group.id})).unread,false)
 for(const p of people)assert.ok((await f.status(p.id)).lastReply.readAt)
 for(const p of people)fs.rmSync(path.join(f.control,p.id+'.work-post.json'))
 await rpc('session.send',{employee:b.id,text:'New private question'});await f.received(b.id,'New private question');await f.until(async()=>!(await f.status(b.id)).busy,'new private response')
 const privateUnread=(await f.status(b.id)).lastReply;assert.equal(privateUnread.readAt,undefined);assert.equal((await rpc('chat.get',{id:group.id})).unread,false)
 const explicit=await rpc('chat.post',{id:group.id,text:'One deliberate useful group update.',replyTo:sent.id,clientMessageId:'explicit-update'},tokens.get(a.id));await idle();assert.equal((await rpc('chat.get',{id:group.id})).unread,true);assert.deepEqual((await f.status(b.id)).lastReply,privateUnread)
 await rpc('chat.acknowledge',{id:group.id,messageId:explicit.id});assert.deepEqual((await f.status(b.id)).lastReply,privateUnread)
 checks.push('Group reads cannot clear private unread, private reads cannot clear group unread, and shared work preserves previous private reply identity')
 // Mentions still control formal work; non-targets only learn the shared context.
 const before=new Map(await Promise.all(people.map(async p=>[p.id,(await transcript(p)).items.length])))
 const targeted=await rpc('chat.send',{id:group.id,text:'Only the Manager should perform this task.',mentions:[a.id],clientMessageId:'targeted'});await idle()
 assert.deepEqual(targeted.deliveries.map(d=>[d.employeeId,d.mode]),[[a.id,'work'],[b.id,'awareness'],[c.id,'awareness']])
 for(const p of [b,c])assert.equal((await transcript(p)).items.length,before.get(p.id));assert.deepEqual((await f.status(b.id)).lastReply,privateUnread)
 const forbidden=await f.request(tokens.get(b.id),'chat.send',{id:group.id,text:'Cannot control Manager',mentions:[a.id]});assert.equal(forbidden.ok,false)
 checks.push('Explicit @ targets and existing management authority remain intact; awareness creates no formal work or private unread')
 const beforeRestart=(await history()).messages;await f.stop();await f.start();assert.deepEqual((await history()).messages,beforeRestart);assert.deepEqual((await f.status(b.id)).lastReply,privateUnread)
 checks.push('Restart retains public history, settled deliveries, native identities and the independent private unread record')
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'group-isolation.json'),JSON.stringify({passed:true,checks,modelCalls:0,employees:people.length},null,2));console.log('PASS '+checks.join('; '))
}finally{await f.close()}
