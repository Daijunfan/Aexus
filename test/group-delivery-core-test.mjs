// Source-built Core: broadcast snapshots, authenticated acknowledgments and timed publication mutes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {effectiveChatMute} from '../src/shared/chat-groups.ts'

assert.equal(effectiveChatMute({},'a',100),undefined)
assert.equal(effectiveChatMute({mutes:{all:200,a:300}},'a',100),300)
assert.equal(effectiveChatMute({mutes:{all:200,a:300}},'a',300),undefined)
assert.equal(effectiveChatMute({mutes:{all:null,a:300}},'a',100),null)
assert.equal(effectiveChatMute({mutes:{all:200,a:null}},'a',100),null)
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-group-delivery-'))),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry)
 const rpc=async(cmd,args={},token=null)=>{const result=await f.request(token,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const deny=async(cmd,args,token=null,pattern)=>{const result=await f.request(token,cmd,args);assert.equal(result.ok,false,cmd+' must reject');if(pattern)assert.match(result.error,pattern)}
 await f.cli('group','add','Studio');const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Studio'),c=await f.create('Later member','Studio'),manager=await f.create('Manager','Studio','manager'),governor=await f.create('Governor','Studio','governor')
 const tokens=new Map();for(const employee of [a,b,c,manager,governor])tokens.set(employee.id,await f.token(employee.id))
 const holdAck=(...employees)=>{for(const employee of employees)fs.writeFileSync(path.join(f.control,employee+'.hold-ack'),'')},releaseAck=employee=>fs.rmSync(path.join(f.control,employee+'.hold-ack'),{force:true})
 const group=await f.cli('chat','create','--name','Delivery room','--members',JSON.stringify([a.id,b.id])),history=()=>rpc('chat.history',{id:group.id,limit:100}),message=id=>history().then(value=>value.messages.find(item=>item.id===id)),delivery=(id,employee)=>message(id).then(value=>value.deliveries.find(item=>item.employeeId===employee)),context=(id,employee)=>rpc('chat.context',{id:group.id,messageId:id},tokens.get(employee))
 const readReceipt=async(id,employee)=>{releaseAck(employee);const d=await f.until(async()=>{const current=await delivery(id,employee);return current.readAt&&current},'native reading completes');return {acknowledged:true,groupId:group.id,messageId:id,employeeId:employee,deliveredAt:d.deliveredAt,readAt:d.readAt,...(d.ackMessageId?{ackMessageId:d.ackMessageId}:{})}}
 const visible=async(id,employee,key)=>{const result=await rpc('chat.post',{id:group.id,replyTo:id,text:'Received; I will handle my part.',clientMessageId:key},tokens.get(employee));releaseAck(employee);return result}
 const complete=id=>f.until(async()=>{const current=await message(id);if(current.deliveries.some(item=>['failed','interrupted'].includes(item.status)))throw Error('Routed fixture failed: '+JSON.stringify(current.deliveries));return current.deliveries.every(item=>item.status==='completed')},'routed work completes')
 // A genuine pre-upgrade persisted record remains nonrouting on retry; new post calls do notify.
 await f.stop();const legacy={id:'gm_'+randomUUID(),sequence:1,createdAt:Date.now(),author:{kind:'operator'},authorName:'You',text:'Legacy reference',kind:'message',mentions:[],deliveries:[],clientMessageId:'legacy-note',fingerprint:createHash('sha256').update(JSON.stringify(['Legacy reference',[],'message',null,null])).digest('hex')};fs.writeFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'chats',group.id+'.json'),JSON.stringify([legacy]));await f.start()
 assert.deepEqual(await rpc('chat.send',{id:group.id,text:legacy.text,clientMessageId:'legacy-note'}),legacy,'old records are never retroactively dispatched')
 const plain=await rpc('chat.post',{id:group.id,kind:'message',text:'A published reference for everyone',clientMessageId:'public-note'});assert.deepEqual(plain.deliveries.map(value=>[value.employeeId,value.mode]),[[a.id,'awareness'],[b.id,'awareness']]);await complete(plain.id)
 for(const employee of [a,b])assert.deepEqual((await f.cli('session','transcript',employee.id)).items,[],'awareness does not create private work messages')
 await deny('chat.post',{id:group.id,kind:'message',text:'Agent cannot use operator publication'},tokens.get(a.id))

 holdAck(a.id,b.id);const broadcastArgs={id:group.id,text:'BROADCAST_TO_CURRENT_MEMBERS',clientMessageId:'broadcast-once'},broadcast=await rpc('chat.send',broadcastArgs)
 assert.equal(broadcast.broadcast,true);assert.deepEqual(broadcast.mentions,[]);assert.deepEqual(broadcast.deliveries.map(item=>[item.employeeId,item.mode]),[[a.id,'work'],[b.id,'work']])
 const firstPolicy=(await context(broadcast.id,a.id)).acknowledgment;assert.equal(firstPolicy.required,'silent-only');assert.equal(firstPolicy.acknowledged,false);assert.equal((await delivery(broadcast.id,a.id)).readAt,undefined)
 const beforeAck=await rpc('chat.get',{id:group.id}),beforeCount=(await history()).messages.length,ack=await readReceipt(broadcast.id,a.id)
 assert.equal(ack.acknowledged,true);assert.ok(ack.readAt>=ack.deliveredAt);assert.equal(ack.ackMessageId,undefined);assert.deepEqual(await readReceipt(broadcast.id,a.id),ack)
 assert.equal((await history()).messages.length,beforeCount);const afterAck=await rpc('chat.get',{id:group.id});assert.equal(afterAck.lastIncomingSequence,beforeAck.lastIncomingSequence);assert.equal(afterAck.readSequence,beforeAck.readSequence);assert.deepEqual(afterAck.lastMessage,beforeAck.lastMessage)
 assert.equal((await f.raw(tokens.get(b.id),'chat','post',group.id,'--reply-to',broadcast.id,'--silent')).ok,false);await readReceipt(broadcast.id,b.id);await complete(broadcast.id)
 assert.equal((await f.status(a.id)).lastReply?.readAt,undefined)
 for(const employee of [a,b])assert.equal((await f.cli('session','transcript',employee.id)).items.filter(item=>item.role==='user'&&item.text===broadcastArgs.text).length,1)
 await rpc('chat.update',{id:group.id,members:[a.id,b.id,c.id]});const again=await rpc('chat.send',broadcastArgs);assert.deepEqual(again.deliveries.map(item=>item.employeeId),[a.id,b.id]);assert.equal((await f.cli('session','transcript',c.id)).items.filter(item=>item.role==='user').length,0)
 await deny('chat.send',{...broadcastArgs,mentions:'all'},null,/different content/);await deny('chat.send',{...broadcastArgs,text:'Changed retry'},null,/different content/)
 const agentReply=await rpc('chat.send',{id:group.id,text:'An employee update reaches the other members.',clientMessageId:'employee-no-mentions'},tokens.get(a.id));assert.deepEqual(agentReply.deliveries.map(item=>[item.employeeId,item.mode]),[[b.id,'awareness'],[c.id,'awareness']]);await complete(agentReply.id)
 await deny('chat.post',{id:group.id,replyTo:broadcast.id,text:null},null,/Null publication/);await deny('chat.post',{id:group.id,replyTo:broadcast.id,text:null},tokens.get(c.id),/Null publication/);await deny('chat.post',{id:group.id,replyTo:legacy.id,text:null},tokens.get(a.id),/Null publication/)

 holdAck(a.id,b.id,c.id);const target=await rpc('chat.send',{id:group.id,text:'TARGETED_REQUEST',mentions:[a.id],clientMessageId:'targeted-once'});assert.deepEqual(target.mentions,[a.id]);assert.deepEqual(target.deliveries.map(item=>[item.employeeId,item.mode]),[[a.id,'work'],[b.id,'awareness'],[c.id,'awareness']]);assert.equal((await context(target.id,a.id)).acknowledgment.required,'silent-only')
 const firstRead=await readReceipt(target.id,a.id);const acknowledgment=await visible(target.id,a.id,'target-ack'),read=await delivery(target.id,a.id);assert.equal(read.ackMessageId,acknowledgment.id);assert.equal(read.readAt,firstRead.readAt);assert.deepEqual(acknowledgment.deliveries.map(item=>[item.employeeId,item.mode]),[[b.id,'awareness'],[c.id,'awareness']])
 for(const employee of [b,c])await readReceipt(target.id,employee.id);await complete(target.id);await complete(acknowledgment.id);assert.equal((await visible(target.id,a.id,'target-ack')).id,acknowledgment.id);assert.equal((await readReceipt(target.id,a.id)).readAt,read.readAt)
 const reply=await rpc('chat.send',{id:group.id,text:'REPLY_CONVERSATION_UNION',replyTo:acknowledgment.id,mentions:[b.id],clientMessageId:'reply-union'});assert.deepEqual(reply.deliveries.map(item=>[item.employeeId,item.mode]),[[a.id,'work'],[b.id,'work'],[c.id,'awareness']]);await complete(reply.id)
 const prompt=JSON.parse(fs.readFileSync(path.join(f.control,a.id+'-work.json'),'utf8')).text;assert.ok(prompt.includes(acknowledgment.text));assert.ok(prompt.includes(a.id),'Core supplies the actual reply author, not a guessed display-name match')
 const originalDeliverySnapshot=(await message(acknowledgment.id)).deliveries
 const offices=await rpc('conversation.policy',{conversation:'group:'+group.id});await rpc('conversation.role',{conversation:'group:'+group.id,employee:b.id,role:'owner',expectedRevision:offices.revision})
 await rpc('chat.update',{id:group.id,members:[b.id,c.id]})
 const departedReply=await rpc('chat.send',{id:group.id,text:'REPLY_TO_FORMER_MEMBER',replyTo:acknowledgment.id,clientMessageId:'reply-former-member'})
 assert.equal(departedReply.broadcast,true,'a former member is not a current dialogue target, so an unmentioned user reply keeps default group work')
 assert.deepEqual(departedReply.deliveries.map(item=>[item.employeeId,item.mode]),[[b.id,'work'],[c.id,'work']]);await complete(departedReply.id)
 assert.deepEqual((await message(acknowledgment.id)).deliveries,originalDeliverySnapshot,'membership changes do not rewrite the accepted recipient snapshot')
 const departedDeliverySnapshot=(await message(departedReply.id)).deliveries
 await rpc('chat.update',{id:group.id,members:[a.id,b.id,c.id]})
 assert.deepEqual((await rpc('chat.send',{id:group.id,text:'REPLY_TO_FORMER_MEMBER',replyTo:acknowledgment.id,clientMessageId:'reply-former-member'})).deliveries,departedDeliverySnapshot,'retry after rejoining does not add a new reply recipient')
 await deny('chat.post',{id:group.id,text:'Cannot forge internal acknowledgment',acknowledgmentOf:target.id},tokens.get(a.id),/Unknown chat field/)
 holdAck(a.id,b.id,c.id);const allArgs={id:group.id,text:'EXPLICIT_ALL_SNAPSHOT',mentions:'all',clientMessageId:'all-once'},all=await rpc('chat.send',allArgs);assert.deepEqual(all.mentions,[a.id,b.id,c.id]);assert.ok(all.deliveries.every(item=>item.mode==='work'))
 for(const employee of [a,b,c])await readReceipt(all.id,employee.id);await complete(all.id)
 await rpc('chat.update',{id:group.id,members:[a.id,b.id,c.id,manager.id]});assert.deepEqual((await rpc('chat.send',allArgs)).deliveries.map(item=>item.employeeId),[a.id,b.id,c.id])
 console.log('PASS whole-group work/awareness snapshots, employee publication without self-echo, tool-free native receipt, legacy retries and unchanged operator read receipts')

 const muted=await f.cli('chat','mute',group.id,'--member',a.id);assert.equal(muted.mutes[a.id],null);assert.equal(muted.members.find(member=>member.id===a.id).mutedUntil,null)
 for(const cmd of ['chat.send','chat.post'])await deny(cmd,{id:group.id,text:'Muted publication',clientMessageId:'muted-'+cmd},tokens.get(a.id),/muted/)
 assert.ok((await rpc('chat.history',{id:group.id},tokens.get(a.id))).messages.length)
 holdAck(a.id);const mutedRequest=await rpc('chat.send',{id:group.id,text:'MUTED_EMPLOYEE_STILL_WORKS',mentions:[a.id],clientMessageId:'muted-request'});const mutedPolicy=(await context(mutedRequest.id,a.id)).acknowledgment;assert.equal(mutedPolicy.muted,true);assert.equal(mutedPolicy.required,'silent-only');await readReceipt(mutedRequest.id,a.id);await complete(mutedRequest.id)
 await f.cli('chat','mute',group.id,'--member','all');await f.cli('chat','mute',group.id,'--member',a.id,'--off');assert.equal((await rpc('chat.get',{id:group.id})).members.find(member=>member.id===a.id).mutedUntil,null,'all mute still applies after a member-level unmute')
 await rpc('chat.update',{id:group.id,members:[a.id,b.id,c.id,manager.id,governor.id]});assert.equal((await rpc('chat.get',{id:group.id})).members.find(member=>member.id===governor.id).mutedUntil,null,'all mute covers newly joined employees')
 const operatorNotice=await rpc('chat.post',{id:group.id,kind:'message',text:'The operator can still publish while employees are muted.'});await complete(operatorNotice.id);await f.cli('chat','mute',group.id,'--member','all','--off')
 const timed=await f.cli('chat','mute',group.id,'--member',b.id,'--for','1'),until=timed.mutes[b.id];assert.ok(until>Date.now());await deny('chat.post',{id:group.id,text:'Wait for expiry',clientMessageId:'expiry-post'},tokens.get(b.id),/muted/)
 await f.until(()=>Date.now()>=until,'timed mute expires');const afterExpiry=await rpc('chat.post',{id:group.id,text:'Wait for expiry',clientMessageId:'expiry-post'},tokens.get(b.id));assert.equal(afterExpiry.author.employeeId,b.id);await complete(afterExpiry.id);assert.equal((await rpc('chat.get',{id:group.id})).members.find(member=>member.id===b.id).mutedUntil,undefined)
 for(const employee of [a,manager,governor]){await deny('chat.mute',{id:group.id,member:'all',muted:true},tokens.get(employee.id),/Owner\/Admin/);assert.ok((await f.call(tokens.get(employee.id),'api','list')).some(item=>item.name==='chat.mute'))}
 for(const args of [{member:'unknown'},{durationSeconds:0},{durationSeconds:1.5},{muted:false,durationSeconds:1},{muted:'true'}])await deny('chat.mute',{id:group.id,member:a.id,muted:true,...args})
 await deny('chat.post',{id:group.id,replyTo:target.id,text:null,files:[]},tokens.get(a.id));await deny('chat.post',{id:group.id,replyTo:target.id,text:null,clientMessageId:7},tokens.get(a.id))
 const schema=await f.cli('api','describe','chat.post');assert.equal(schema.inputSchema.properties.text.type,'string');assert.ok(schema.inputSchema.properties.kind.enum.includes('message'));assert.equal((await f.cli('api','describe','chat.mute')).permission,'chat')
 await f.cli('chat','mute',group.id,'--member',a.id);const finalHistory=await history();await f.stop();await f.start();assert.deepEqual(await history(),finalHistory);assert.equal((await rpc('chat.get',{id:group.id})).members.find(member=>member.id===a.id).mutedUntil,null);assert.equal((await rpc('chat.send',broadcastArgs)).id,broadcast.id);assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS indefinite/member/all/future-member/timed mutes, muted reading/work, no visible publication, conversation-role control with shared discovery, nonempty publication CLI/API contract and durable restart state')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
