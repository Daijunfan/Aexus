import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),transcript=id=>f.cli('session','transcript','--employee',id),input=id=>JSON.parse(fs.readFileSync(path.join(f.control,id+'-user.json'),'utf8')).text
const rpc=async(cmd,args)=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
try{
 await f.cli('group','add','Studio');await f.cli('group','add','Other')
 const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Other'),manager=await f.create('Lead','Studio','manager'),managerToken=await f.token(manager.id)
 const directory=path.join(f.env.AGENTS_COMPANY_HOME,'transcripts');fs.mkdirSync(directory,{recursive:true})
 const legacy=[{role:'user',id:'u1700000000000',text:'An earlier question.'},{role:'assistant',id:'old-answer',blocks:[{kind:'thinking',text:'PRIVATE_REASONING_SENTINEL',done:true},{kind:'tool',id:'old-tool',name:'read',input:{secret:'PRIVATE_TOOL_SENTINEL'},result:'PRIVATE_TOOL_SENTINEL',running:false},{kind:'text',text:'A public answer worth discussing.'}]},{role:'assistant',id:'private-only',blocks:[{kind:'thinking',text:'PRIVATE_ONLY_SENTINEL',done:true}]},{role:'notice',id:'old-notice',text:'A status notice.',tone:'info'}]
 fs.writeFileSync(path.join(directory,a.id+'.json'),JSON.stringify(legacy))
 const before=await f.cli('session','list'),t0=Date.now()
 await f.cli('session','send','--employee',a.id,'--text','Let’s discuss that answer.','--reply-to','old-answer');await f.until(async()=>!(await f.status(a.id)).busy,'first linked reply')
 let history=(await transcript(a.id)).items,reply=history.find(item=>item.text==='Let’s discuss that answer.')
 assert.equal(reply.reply.id,'old-answer');assert.equal(reply.reply.text,'A public answer worth discussing.');assert.deepEqual(reply.author,{kind:'operator'});assert.ok(reply.createdAt>=t0);assert.ok(history.at(-1).createdAt>=reply.createdAt)
 assert.deepEqual(history.slice(0,legacy.length),legacy,'old timestamps, metadata and private blocks remain untouched')
 assert.ok(input(a.id).includes('A public answer worth discussing.'));assert.ok(input(a.id).includes('Let’s discuss that answer.'));assert.ok(!/PRIVATE_(REASONING|TOOL|ONLY)_SENTINEL/.test(input(a.id)),'only public text is sent as quote context')
 assert.ok((await transcript(a.id)).text.includes('[Reply to old-answer]'))
 await f.cli('session','send','--employee',b.id,'--text','Another conversation.');await f.until(async()=>!(await f.status(b.id)).busy,'other source');const foreign=(await transcript(b.id)).items.at(-1).id
 const live=(await f.cli('session','info','--employee',a.id)).id;await f.cli('session','close',live)
 const liveBefore=(await rpc('session.list',{live:true})).map(item=>item.id).sort(),priorInput=input(a.id)
 for(const target of [foreign,'private-only','old-notice','missing'])await assert.rejects(()=>f.cli('session','send','--employee',a.id,'--text','Must not execute.','--reply-to',target),/public message/)
 assert.deepEqual((await rpc('session.list',{live:true})).map(item=>item.id).sort(),liveBefore,'invalid references do not open an employee')
 assert.equal(input(a.id),priorInput);await assert.rejects(()=>f.cli('session','send','--employee',a.id,'--text','/status','--reply-to','old-answer'),/regular message/)
 assert.equal((await f.raw(managerToken,'session','send','--employee',b.id,'--text','Unauthorized reply.','--reply-to',foreign)).ok,false)
 // A draft can preserve a chosen source before any text is typed, across a restart.
 await f.cli('messenger','draft','employee:'+a.id,'--data',JSON.stringify({text:'',replyTo:'old-answer'}));await f.stop();await f.start();assert.equal((await f.cli('messenger','state')).drafts['employee:'+a.id].replyTo,'old-answer')
 assert.deepEqual((await transcript(a.id)).items,history,'timestamps and linked excerpts survive restart unchanged')
 const opened=await f.cli('session','open',a.id)
 // Live-ID CLI syntax has the same semantics; callers cannot forge the resolved quote.
 await f.cli('session','send',opened.sessionId,'Reply using a live ID.','--reply-to',reply.id);await f.until(async()=>!(await f.status(a.id)).busy,'positional reply')
 let quoted=(await transcript(a.id)).items.find(item=>item.text==='Reply using a live ID.');assert.equal(quoted.reply.id,reply.id);assert.deepEqual(quoted.reply.author,{kind:'operator'})
 const hold=path.join(f.control,a.id+'.hold-user'),stream=path.join(f.control,a.id+'.stream.txt');fs.writeFileSync(hold,'');fs.writeFileSync(stream,'A reply in progress.')
 await f.cli('session','send','--employee',a.id,'--text','Keep working.');await f.until(async()=>(await transcript(a.id)).text.includes('A reply in progress.'),'stream begins')
 const streaming=(await transcript(a.id)).items.at(-1),createdAt=streaming.createdAt
 fs.writeFileSync(stream,'A reply in progress.\n\nA second recorded detail.');await f.until(async()=>(await transcript(a.id)).text.includes('A second recorded detail.'),'stream grows');assert.equal((await transcript(a.id)).items.at(-1).createdAt,createdAt,'streaming does not move creation time')
 const queued=await f.call(managerToken,'session','enqueue','--employee',a.id,'--text','A queued reply from Lead.','--reply-to','old-answer');assert.equal(queued.replyTo,'old-answer');assert.equal((await f.cli('session','queue',opened.sessionId))[0].replyTo,'old-answer')
 fs.unlinkSync(hold);fs.unlinkSync(stream);await f.until(()=>input(a.id).includes('A queued reply from Lead.'),'queued reference reaches existing engine');await f.until(async()=>!(await f.status(a.id)).busy,'queued reply completes')
 const managerReply=(await transcript(a.id)).items.find(item=>item.text==='A queued reply from Lead.');assert.deepEqual(managerReply.author,{kind:'agent',employeeId:manager.id});assert.equal(managerReply.reply.id,'old-answer');const fromTeam=await f.cli('messenger','search','--conversation','employee:'+a.id,'--query','A queued reply from Lead.','--author','employee');assert.equal(fromTeam.messages[0].author,'Lead');assert.deepEqual(fromTeam.messages[0].authorIdentity,{kind:'agent',employeeId:manager.id});assert.equal((await f.cli('messenger','search','--conversation','employee:'+a.id,'--query','A queued reply from Lead.','--author','you')).total,0)
 await rpc('session.send',{employee:a.id,text:'Reply to the real sender.',replyTo:managerReply.id,reply:{id:foreign,text:'FORGED_EXCERPT'},author:{kind:'agent',employeeId:b.id}});await f.until(async()=>!(await f.status(a.id)).busy,'resolved sender reply')
 const actual=(await transcript(a.id)).items.find(item=>item.text==='Reply to the real sender.');assert.deepEqual(actual.author,{kind:'operator'});assert.deepEqual(actual.reply.author,managerReply.author);assert.equal(actual.reply.text,managerReply.text);assert.ok(!input(a.id).includes('FORGED_EXCERPT'))
 // The public excerpt is bounded by Unicode characters, without cutting surrogate pairs.
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'界😀'.repeat(900));await f.cli('session','send','--employee',a.id,'--text','A longer public message.');await f.until(async()=>!(await f.status(a.id)).busy,'long source')
 const large=(await transcript(a.id)).items.at(-1);await f.cli('session','send','--employee',a.id,'--text','Discuss the long message.','--reply-to',large.id);await f.until(async()=>!(await f.status(a.id)).busy,'bounded reply')
 const bounded=(await transcript(a.id)).items.find(item=>item.text==='Discuss the long message.').reply;assert.equal(Array.from(bounded.text).length,1200);assert.ok(bounded.text.endsWith('😀'));assert.equal(bounded.truncated,true)
 await assert.rejects(()=>f.cli('session','steer',opened.sessionId,'No ignored option.','--reply-to','old-answer'),/supported by session send/)
 history=(await transcript(a.id)).items;assert.equal(new Set(history.map(item=>item.id)).size,history.length)
 const exported=JSON.parse((await rpc('session.export',{id:a.id,format:'json'})).content);assert.deepEqual(exported,history)
 const dates=(await f.cli('messenger','search','--conversation','employee:'+a.id,'--query','public answer')).messages;assert.equal(dates.find(item=>item.id==='old-answer').createdAt,null,'no inferred timestamp for old assistant history')
 await f.stop();await f.start();assert.deepEqual((await transcript(a.id)).items,history)
 const after=await f.cli('session','list');for(const person of before.sessions){const saved=after.sessions.find(item=>item.id===person.id);for(const field of ['id','engine','group','cwd','managementRole','permissionMode'])assert.equal(saved[field],person[field])}
 assert.ok((await f.cli('api','describe','session.send')).args.includes('--reply-to'));assert.equal((await f.cli('api','describe','session.enqueue')).inputSchema.properties.replyTo.type,'string');assert.deepEqual(await f.cli('terminal','list'),[])
 // A queued context reset invalidates an older reply; the next ordinary task still runs.
 fs.writeFileSync(hold,'');fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'Recovered safely.')
 await f.cli('session','send','--employee',a.id,'--text','Hold before a context change.')
 await f.cli('session','enqueue','--employee',a.id,'--text','/clear')
 await f.cli('session','enqueue','--employee',a.id,'--text','STALE_REPLY_MUST_NOT_EXECUTE','--reply-to',large.id)
 await f.cli('session','enqueue','--employee',a.id,'--text','Continue after the rejected reference.')
 fs.unlinkSync(hold);await f.until(()=>input(a.id).includes('Continue after the rejected reference.'),'queue recovers after stale source');await f.until(async()=>!(await f.status(a.id)).busy,'recovery completes')
 assert.ok(!(await transcript(a.id)).items.some(item=>item.text==='STALE_REPLY_MUST_NOT_EXECUTE'))
 console.log('PASS linked replies Core/CLI: same-conversation public references, preflight before opening, original permissions and sender, queue dispatch, no private block leakage, Unicode excerpts, real stable timestamps, old-history preservation, export and restart')
}catch(error){
 console.error(error.stack?.split('\n').filter(line=>/^\s+at /.test(line)).join('\n'))
 if(Array.isArray(error.actual)&&Array.isArray(error.expected))for(let i=0;i<Math.max(error.actual.length,error.expected.length);i++){const a=error.actual[i],b=error.expected[i];if(JSON.stringify(a)!==JSON.stringify(b))console.error(JSON.stringify({index:i,actual:{id:a?.id,role:a?.role,createdAt:a?.createdAt,textLength:a?.text?.length,blocks:a?.blocks?.map(block=>({kind:block.kind,length:block.text?.length,tail:block.text?.slice(-70)}))},expected:{id:b?.id,role:b?.role,createdAt:b?.createdAt,textLength:b?.text?.length,blocks:b?.blocks?.map(block=>({kind:block.kind,length:block.text?.length,tail:block.text?.slice(-70)}))}}))}
 throw Error(error.message.split('\n')[0])
}finally{await f.close()}
