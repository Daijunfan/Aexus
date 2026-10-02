// Source-built channel projections; isolated SQLite/operator state and a recorded forwarding dispatch.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-channel-messenger-')),home=path.join(temp,'home'),entry=path.join(temp,'test.cjs'),require=createRequire(import.meta.url),before=process.env.AGENTS_COMPANY_HOME,clock=Date.now
let core,now=clock();process.env.AGENTS_COMPANY_HOME=home;fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
try{
 await build({stdin:{contents:"export * from './src/main/channels';export * from './src/main/messenger';export {forwardMessages} from './src/main/message-forwarding';export {run} from './src/main/channel-store';export {withCaller,operatorContext} from './src/main/authorization'",resolveDir:root,sourcefile:'channel-messenger-test.ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=require(entry);Date.now=()=>now
 const op=fn=>core.withCaller(core.operatorContext(),fn),channel=(name,args={})=>op(()=>core.channelRequest('channel.'+name,args)),messenger=(name,args={})=>op(()=>core.messengerRequest('messenger.'+name,args))
 const source=channel('source-add',{plugin:'x',locator:'@projection'}),other=channel('create',{name:'Other channel'}),ref='channel:'+source.channelId,collector=channel('collector-add',{name:'Fixture',sourceIds:[source.id]})
 const publish=(id,body)=>core.channelCollectorRequest(collector.token,'channel.publish',{sourceId:source.id,externalId:id,publishedAt:now,title:'News',body})
 const news=publish('one','News projection needle'),messages=[]
 for(let i=0;i<130;i++){now++;messages.push(channel('message-send',{id:source.channelId,text:(i===0?'Oldest needle ':i===129?'Latest needle ':'Discussion ')+i,clientMessageId:'message-'+i}))}
 const agent=messages[60];core.run('UPDATE channel_messages SET author=?,author_name=? WHERE id=?',JSON.stringify({kind:'agent',employeeId:'aster'}),'Aster',agent.id)
 assert.equal(messenger('search',{conversation:ref,limit:20}).total,131)
 const first=messenger('search',{conversation:ref,limit:20}),second=messenger('search',{conversation:ref,offset:20,limit:20});assert.ok(second.messages.every(message=>!first.messages.some(item=>item.id===message.id)))
 assert.equal(messenger('search',{query:'needle'}).total,3,'global search combines source news and all discussion pages')
 assert.equal(messenger('search',{conversation:ref,author:'you'}).total,129);assert.equal(messenger('search',{conversation:ref,author:'employee'}).messages[0].author,'Aster')
 const oldest=messages[0];messenger('message',{conversation:ref,id:oldest.id,patch:{saved:true,pinned:true,reaction:'💡'}})
 assert.equal(messenger('search',{conversation:ref,filter:'saved'}).messages[0].id,oldest.id);assert.equal(messenger('search',{conversation:ref,filter:'pinned'}).total,1)
 const sourceReply=messenger('reference',{conversation:ref,id:oldest.id});assert.equal(sourceReply.author.kind,'operator');assert.equal(sourceReply.text,oldest.text)
 const agentReply=messenger('reference',{conversation:ref,id:agent.id});assert.equal(agentReply.author.employeeId,'aster');assert.equal(agentReply.authorName,'Aster')
 assert.throws(()=>messenger('reference',{conversation:'channel:'+other.id,id:oldest.id}),/Unknown channel message/)
 messenger('draft',{conversation:ref,text:'Draft **format**',mentions:['aster'],replyTo:oldest.id});assert.equal(messenger('state').drafts[ref].replyTo,oldest.id)
 for(const extra of [{images:['unavailable.png']},{replyConversation:'employee:aster',replyTo:'other'},{replyQuote:{text:'Oldest',offset:0}}])assert.throws(()=>messenger('draft',{conversation:ref,text:'Unsupported draft',...extra}),/Channel drafts support/)
 assert.equal(messenger('state').drafts[ref].text,'Draft **format**','unsupported fields cannot replace a valid draft')
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({sessions:[{id:'aster',title:'Aster',engine:'codex',kind:'worker',group:'Studio',cwd:temp,initialization:{status:'ready'}}],groups:['Studio'],rooms:{}}))
 const dispatch=[],forward={messages:[{conversation:ref,id:oldest.id},{conversation:ref,id:agent.id}],to:'employee:aster',clientMessageId:'forward-fixture'}
 const forwarded=await op(()=>core.forwardMessages(forward,async(command,args)=>{dispatch.push({command,args});return {id:'controlled-queue'}}));assert.equal(forwarded.count,2);assert.equal(dispatch.length,1);assert.equal(dispatch[0].command,'session.enqueue');assert.ok(dispatch[0].args.text.includes('Forwarded from Aster'));assert.ok(dispatch[0].args.text.includes(oldest.text));assert.equal(dispatch[0].args.employee,'aster')
 assert.deepEqual(await op(()=>core.forwardMessages(forward,async()=>assert.fail('duplicate must not dispatch'))),forwarded)
 messenger('message',{conversation:ref,id:oldest.id,patch:{hidden:true}});assert.equal(messenger('search',{conversation:ref,filter:'pinned'}).total,0);assert.throws(()=>messenger('reference',{conversation:ref,id:oldest.id}),/unavailable or hidden/)
 await assert.rejects(op(()=>core.forwardMessages({...forward,clientMessageId:'hidden-forward'},async()=>assert.fail('hidden must not dispatch'))),/unavailable or hidden/)
 assert.equal(channel('history',{id:source.channelId,around:oldest.id}).messages[0].text,oldest.text,'personal preferences never rewrite discussion')
 messenger('message',{conversation:ref,id:news.id,patch:{saved:true}});assert.throws(()=>messenger('message',{conversation:ref,id:news.id,patch:{hidden:true}}),/Use news actions/)
 now+=49*3600000;core.pruneChannelNews(now);assert.equal(messenger('search',{conversation:ref,filter:'saved'}).messages[0].id,news.id,'news save remains the retention authority')
 messenger('message',{conversation:ref,id:news.id,patch:{saved:false}});assert.throws(()=>messenger('reference',{conversation:ref,id:news.id}),/deleted or expired/)
 core.closeChannels();assert.equal(messenger('state').drafts[ref].text,'Draft **format**');assert.equal(messenger('search',{conversation:ref}).total,129)
 messenger('draft',{conversation:ref,text:''});assert.equal(messenger('state').drafts[ref],undefined)
 for(const name of ['state','search','draft','message'])assert.throws(()=>core.withCaller({principal:{kind:'agent',employeeId:'aster'},requestId:'test'},()=>core.messengerRequest('messenger.'+name,{conversation:ref})),/Only the user/)
 console.log('PASS channel Messenger projections: all-page search/author filters, mixed pagination, canonical forwarding + dedupe, scope checks, preferences, durable drafts, unchanged discussion and news TTL; no model calls')
}finally{Date.now=clock;core?.closeChannels();if(before===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=before;fs.rmSync(temp,{recursive:true,force:true})}
