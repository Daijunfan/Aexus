// Isolated source-built Core and real CLI/socket routing; native engines are deterministic fixtures.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-chat-edit-'))),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent',plugins:[{name:'hold-group-copy',setup(build){build.onLoad({filter:/src\/main\/server\.ts$/},args=>{const source=fs.readFileSync(args.path,'utf8'),signature="async function copyGroupAttachments(employee:string,group:string,message:import('../shared/chat-groups').ChatMessage){";assert.ok(source.includes(signature));return {contents:source.replace(signature,signature+"\n  while(existsSync(process.env.AC_INIT_FIXTURE+'/'+employee+'.hold-copy'))await new Promise(resolve=>setTimeout(resolve,20))"),loader:'ts'}})}}]})
 f=await fixtureCore({AC_CHAT_ACK_MANUAL:'0'},entry)
 const rpc=async(cmd,args={},token=null)=>{const result=await f.request(token,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const reject=async(cmd,args,pattern,token=null)=>{const result=await f.request(token,cmd,args);assert.equal(result.ok,false);if(pattern)assert.match(result.error,pattern);return result}
 const history=id=>rpc('chat.history',{id,limit:100}),get=(id,messageId)=>history(id).then(page=>page.messages.find(message=>message.id===messageId))
 // Shared publications now deliver context asynchronously. Compare edits only after those
 // unrelated notices settle; deliberately held work is asserted separately below.
 const settle=message=>f.until(async()=>{const current=await get(group.id,message.id);for(const delivery of current.deliveries)assert.ok(!['failed','interrupted'].includes(delivery.status),JSON.stringify(delivery));return current.deliveries.every(delivery=>delivery.status==='completed'&&delivery.readAt!==undefined)&&current},'shared publication acknowledged')
 const note=async(args,token=null)=>{const posted=await rpc('chat.post',args,token);assert.ok(posted.deliveries.every(item=>item.mode==='awareness'));return settle(posted)}
 const delivery=(message,id)=>message.deliveries.find(item=>item.employeeId===id)
 const otherRecipientsComplete=(message,held)=>message.deliveries.filter(item=>item.employeeId!==held).every(item=>item.status==='completed'&&item.readAt!==undefined)
 const unchanged=(actual,original)=>{const {text,editRevision,editedAt,...rest}=actual,{text:beforeText,editRevision:beforeRevision,editedAt:beforeEdited,...before}=original;assert.deepEqual(rest,before)}
 await f.cli('group','add','Studio');const worker=await f.create('Worker','Studio'),fanout=await f.create('Fanout','Studio'),manager=await f.create('Manager','Studio','manager'),governor=await f.create('Governor','Studio','governor')
 const group=await f.cli('chat','create','--name','Correction room','--members',JSON.stringify([worker.id,fanout.id,manager.id,governor.id])),baseArgs={id:group.id,text:'Original shared note',clientMessageId:'note-once'}
 const original=await note({...baseArgs,kind:'message'})
 const indexFile=path.join(f.env.AGENTS_COMPANY_HOME,'chats/groups.json'),historyFile=path.join(f.env.AGENTS_COMPANY_HOME,'chats',group.id+'.json'),beforeGroup=await rpc('chat.get',{id:group.id})
 assert.deepEqual(beforeGroup.lastMessage.author,{kind:'operator'});const legacyIndex=JSON.parse(fs.readFileSync(indexFile,'utf8'));delete legacyIndex.groups.find(item=>item.id===group.id).lastMessage.author;fs.writeFileSync(indexFile,JSON.stringify(legacyIndex));assert.equal((await rpc('chat.get',{id:group.id})).lastMessage.author,undefined,'legacy preview authors are not guessed from their names')
 const edited=await f.cli('chat','edit',group.id,'--message',original.id,'--text','Corrected shared note','--expected-revision','0')
 assert.equal(edited.editRevision,1);assert.ok(edited.editedAt>=original.createdAt);unchanged(edited,original)
 const currentGroup=await rpc('chat.get',{id:group.id});assert.equal(currentGroup.lastMessage.text,edited.text);assert.deepEqual(currentGroup.lastMessage.author,{kind:'operator'});assert.equal(currentGroup.lastMessage.createdAt,beforeGroup.lastMessage.createdAt);assert.equal(currentGroup.updatedAt,beforeGroup.updatedAt);assert.equal(currentGroup.readSequence,beforeGroup.readSequence);assert.equal(currentGroup.lastIncomingSequence,beforeGroup.lastIncomingSequence)
 const stableHistory=fs.readFileSync(historyFile,'utf8'),stableIndex=fs.readFileSync(indexFile,'utf8')
 assert.deepEqual(await rpc('chat.edit',{id:group.id,messageId:original.id,text:edited.text,expectedRevision:0}),edited)
 assert.equal(fs.readFileSync(historyFile,'utf8'),stableHistory);assert.equal(fs.readFileSync(indexFile,'utf8'),stableIndex)
 assert.deepEqual(await rpc('chat.send',baseArgs),edited);await reject('chat.send',{...baseArgs,text:edited.text},/different content/)
 await reject('chat.edit',{id:group.id,messageId:original.id,text:'Stale correction',expectedRevision:0},/Message changed; reload before saving/)
 const concurrent=await Promise.all(['First correction','Second correction'].map(text=>f.request(null,'chat.edit',{id:group.id,messageId:original.id,text,expectedRevision:1})))
 assert.equal(concurrent.filter(result=>result.ok).length,1);assert.equal(concurrent.find(result=>result.ok).data.editRevision,2);assert.match(concurrent.find(result=>!result.ok).error,/Message changed/)
 for(const args of [{expectedRevision:-1},{expectedRevision:1.5},{expectedRevision:'2'},{expectedRevision:undefined},{text:' '},{text:' surrounding '},{text:''},{text:7},{text:undefined},{text:'x'.repeat(16001)},{mentions:[worker.id]},{author:{kind:'operator'}}])await reject('chat.edit',{id:group.id,messageId:original.id,text:'Invalid',expectedRevision:2,...args})
 await reject('chat.edit',{id:group.id,messageId:'missing',text:'Missing',expectedRevision:0},/Unknown group message/)
 const unicode='😀'.repeat(16000),long=await rpc('chat.edit',{id:group.id,messageId:original.id,text:unicode,expectedRevision:2});assert.equal(Array.from(long.text).length,16000);await reject('chat.edit',{id:group.id,messageId:original.id,text:unicode+'😀',expectedRevision:3},/exceeds 16000/)
 const api=await f.cli('api','describe','chat.edit');assert.equal(api.permission,'operator');assert.equal(api.inputSchema.properties.expectedRevision.minimum,0);assert.deepEqual(api.inputSchema.required,['id','messageId','text','expectedRevision'])
 for(const employee of [worker,manager,governor]){const token=await f.token(employee.id);await reject('chat.edit',{id:group.id,messageId:original.id,text:'Not allowed',expectedRevision:3},/Only the user/,token);assert.ok(!(await f.call(token,'api','list')).some(command=>command.name==='chat.edit'));await reject('api.describe',{name:'chat.edit'},undefined,token)}
 const agentToken=await f.token(worker.id),post=await note({id:group.id,text:'Employee publication',clientMessageId:'worker-post'},agentToken);assert.deepEqual((await rpc('chat.get',{id:group.id})).lastMessage.author,{kind:'agent',employeeId:worker.id});await reject('chat.edit',{id:group.id,messageId:post.id,text:'No impersonation',expectedRevision:0},/authored by the user/)
 const oldIndex=fs.readFileSync(indexFile,'utf8');await rpc('chat.edit',{id:group.id,messageId:original.id,text:'Older corrected note',expectedRevision:3});assert.equal(fs.readFileSync(indexFile,'utf8'),oldIndex,'editing an older message does not replace preview or receipts')
 const bytes=Buffer.from('A real attachment'),upload=await rpc('messenger.upload-begin',{conversation:'group:'+group.id,name:'Notes.txt',bytes:bytes.length});await rpc('transfer.upload-chunk',{id:upload.id,offset:0,data:bytes.toString('base64')});const destination=(await rpc('transfer.upload-commit',{id:upload.id})).destination
 const attachment=await note({id:group.id,kind:'message',text:'Original caption',files:[destination],clientMessageId:'caption-once'}),captionFile=path.join(temp,'caption.txt');fs.writeFileSync(captionFile,'Corrected caption')
 const caption=await f.cli('chat','edit',group.id,'--message',attachment.id,'--file',captionFile,'--expected-revision','0');assert.equal(caption.text,'Corrected caption');unchanged(caption,attachment)
 const empty=await rpc('chat.edit',{id:group.id,messageId:attachment.id,text:'',expectedRevision:1});assert.deepEqual(empty.attachments,attachment.attachments);assert.equal((await rpc('chat.get',{id:group.id})).lastMessage.text,'Notes.txt')
 assert.deepEqual(await rpc('chat.send',{id:group.id,text:'Original caption',files:[destination],clientMessageId:'caption-once'}),empty)
 console.log('PASS editing contract, Unicode/captions, CAS/idempotent retry, original send fingerprint, all-role authority and unchanged recency/read state')

 // Hold the existing attachment preparation boundary while the original mention fan-out is routing.
 const opening=path.join(f.control,fanout.id+'.hold-copy');fs.writeFileSync(opening,'')
 const routedArgs={id:group.id,text:'ORIGINAL_FANOUT_TASK',mentions:[fanout.id],files:[destination],clientMessageId:'held-fanout'},sending=rpc('chat.send',routedArgs)
 const routing=await f.until(async()=>{const message=(await history(group.id)).messages.find(message=>message.clientMessageId==='held-fanout');if(message?.deliveries.some(item=>item.status==='failed'))throw Error(JSON.stringify(message.deliveries));return message&&delivery(message,fanout.id)?.status==='routing'&&otherRecipientsComplete(message,fanout.id)&&message},'fanout awaiting attachment copy')
 assert.equal(delivery(routing,fanout.id).mode,'work');assert.equal(delivery(routing,fanout.id).readAt,undefined)
 const routingEdit=await rpc('chat.edit',{id:group.id,messageId:routing.id,text:'PUBLIC_FANOUT_CORRECTION',expectedRevision:0});unchanged(routingEdit,routing);await rpc('chat.post',{id:group.id,replyTo:routing.id,text:'Received before work.'},await f.token(fanout.id));fs.unlinkSync(opening)
 assert.equal((await sending).text,routingEdit.text);await f.until(async()=>delivery(await get(group.id,routing.id),fanout.id).status==='completed','fanout completes with original prompt')
 const fanoutNative=JSON.parse(fs.readFileSync(path.join(f.control,fanout.id+'-user.json'),'utf8')).text;assert.ok(fanoutNative.includes(routedArgs.text));assert.ok(!fanoutNative.includes(routingEdit.text))
 const fanoutTranscript=await f.cli('session','transcript',fanout.id);assert.equal(fanoutTranscript.items.filter(item=>item.role==='user'&&item.text===routedArgs.text).length,1);assert.equal((await rpc('chat.send',routedArgs)).id,routing.id);assert.deepEqual(await f.cli('session','transcript',fanout.id),fanoutTranscript)

 // A queued quoted task retains both its submitted prompt and accepted quote after source correction.
 const quoteSource=await note({id:group.id,kind:'message',text:'Accepted quote remains.',clientMessageId:'quote-source'}),quote={text:'Accepted quote',offset:0},hold=path.join(f.control,worker.id+'.hold-user');fs.writeFileSync(hold,'')
 await f.cli('session','send','--employee',worker.id,'--text','PRIVATE_BUSY_TASK');await f.until(async()=>(await f.status(worker.id)).busy,'worker held busy')
 const queuedArgs={id:group.id,text:'ORIGINAL_QUEUED_REQUEST',mentions:[worker.id],replyTo:quoteSource.id,replyQuote:quote,clientMessageId:'queued-quote'},submitted=await rpc('chat.send',queuedArgs),queued=await f.until(async()=>{const message=await get(group.id,submitted.id);for(const item of message.deliveries)assert.notEqual(item.status,'failed',JSON.stringify(item));return delivery(message,worker.id).status==='queued'&&otherRecipientsComplete(message,worker.id)&&message},'queued work held while other recipients acknowledge');assert.equal(delivery(queued,worker.id).status,'queued');assert.equal(delivery(queued,worker.id).mode,'work');assert.equal(delivery(queued,worker.id).readAt,undefined)
 const queueBefore=await f.cli('session','queue','--employee',worker.id),nativeBefore=fs.readFileSync(path.join(f.control,worker.id+'-user.json'),'utf8'),privateBefore=await f.cli('session','transcript',worker.id)
 await rpc('chat.edit',{id:group.id,messageId:quoteSource.id,text:'Published source is corrected.',expectedRevision:0})
 const queuedEdit=await rpc('chat.edit',{id:group.id,messageId:queued.id,text:'PUBLIC_QUEUED_CORRECTION',expectedRevision:0});unchanged(queuedEdit,queued);assert.deepEqual(await f.cli('session','queue','--employee',worker.id),queueBefore);assert.equal(fs.readFileSync(path.join(f.control,worker.id+'-user.json'),'utf8'),nativeBefore);assert.deepEqual(await f.cli('session','transcript',worker.id),privateBefore)
 await reject('chat.send',{id:group.id,text:'Invalid new quote',replyTo:quoteSource.id,replyQuote:quote,clientMessageId:'stale-new-quote'},/no longer matches/)
 await rpc('chat.post',{id:group.id,replyTo:queued.id,text:'Received before queued work.'},await f.token(worker.id));fs.unlinkSync(hold);await f.until(async()=>delivery(await get(group.id,queued.id),worker.id).status==='completed','accepted queued quote completes')
 const dispatched=JSON.parse(fs.readFileSync(path.join(f.control,worker.id+'-user.json'),'utf8')).text;assert.ok(dispatched.includes(queuedArgs.text));assert.ok(dispatched.includes(JSON.stringify(quote)));assert.ok(!dispatched.includes(queuedEdit.text));assert.ok(!dispatched.includes('Published source is corrected.'))
 const transcript=await f.cli('session','transcript',worker.id);assert.equal(transcript.items.filter(item=>item.role==='user'&&item.text===queuedArgs.text).length,1);assert.equal((await rpc('chat.send',queuedArgs)).id,queued.id);assert.deepEqual(await f.cli('session','transcript',worker.id),transcript)
 for(const message of (await history(group.id)).messages)await settle(message)
 const finalHistory=await history(group.id),finalGroup=await rpc('chat.get',{id:group.id});await f.stop();await f.start();assert.deepEqual(await history(group.id),finalHistory);assert.deepEqual(await rpc('chat.get',{id:group.id}),finalGroup);assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS held fan-out + queued quote corrections preserve accepted prompt, quote, native history, queue, retry identity and restart persistence; deterministic native fixtures, no model/network calls')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
