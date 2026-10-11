import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {quoteText,validateQuote} from '../src/shared/message-quotes.ts'
import {fixtureCore} from './fixtures/headless-core.mjs'
const source='A **clear** [choice](https://example.org).\n\nRepeat this. Repeat this.\n\n- One idea\n- Another idea\n\n```js\nconst answer = 42;\n```\n\n中文 😀 也可以精准引用。'
const canonical=quoteText(source),selected='Repeat this.',quote={text:selected,offset:canonical.lastIndexOf(selected)}
assert.equal(quoteText('A **clear** [choice](https://example.org).'),'A clear choice.')
assert.equal(quoteText('- one\n- two'),'one two')
assert.equal(quoteText('| name | count |\n|---|---|\n| A | 2 |'),'name count A 2')
assert.equal(quoteText('```js\nconst answer = 42;\n```'),'const answer = 42;')
assert.deepEqual(validateQuote(source,quote),quote)
assert.throws(()=>validateQuote(source,{text:'invented',offset:0}),/no longer matches/)
assert.throws(()=>validateQuote('😀',{text:'\ud83d',offset:0}),/no longer matches/)
assert.throws(()=>validateQuote(source,{text:'Repeat this.',offset:-1}),/valid text offset/)
const f=await fixtureCore(),rpc=async(cmd,args)=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
try{
 await f.cli('group','add','Studio');const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Studio')
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),source);await f.cli('session','send','--employee',a.id,'--text','Original source.');await f.until(async()=>!(await f.status(a.id)).busy,'source completed')
 const original=(await f.cli('session','transcript','--employee',a.id)).items.at(-1),live=(await f.status(a.id)).sessionId
 await f.cli('session','close',live)
 const before=(await rpc('session.list',{live:true})).map(item=>item.id)
 for(const args of [{replyTo:original.id,replyQuote:{text:'invented',offset:0}},{replyQuote:quote},{replyTo:original.id,replyQuote:{text:selected,offset:quote.offset+1}}])assert.equal((await f.request(null,'session.send',{employee:a.id,text:'Must not run.',...args})).ok,false)
 assert.deepEqual((await rpc('session.list',{live:true})).map(item=>item.id),before,'invalid selections do not open an engine')
 await f.cli('messenger','draft','employee:'+a.id,'--data',JSON.stringify({text:'A precise response.',replyTo:original.id,replyQuote:quote}));await f.stop();await f.start();assert.deepEqual((await f.cli('messenger','state')).drafts['employee:'+a.id].replyQuote,quote)
 await f.cli('session','send','--employee',a.id,'--text','The second occurrence.','--reply-to',original.id,'--reply-quote',JSON.stringify(quote));await f.until(async()=>!(await f.status(a.id)).busy,'selected reply')
 const reply=(await f.cli('session','transcript','--employee',a.id)).items.find(item=>item.text==='The second occurrence.');assert.deepEqual(reply.reply.quote,quote);assert.equal(reply.reply.text,selected);assert.equal(reply.reply.truncated,undefined)
 const received=JSON.parse(fs.readFileSync(path.join(f.control,a.id+'-user.json'),'utf8')).text;assert.ok(received.includes(JSON.stringify(quote)));assert.ok(!received.includes('Another idea'),'only the selected quote is introduced as reference context')
 const group=await rpc('chat.create',{name:'Quote workshop',members:[a.id,b.id]}),first=await rpc('chat.post',{id:group.id,kind:'message',text:source,clientMessageId:'source'})
 const posted=await f.cli('chat','post',group.id,'--kind','message','--text','Focus on this sentence.','--reply-to',first.id,'--reply-quote',JSON.stringify(quote),'--client-message-id','selected')
 assert.deepEqual(posted.replyQuote,quote);assert.deepEqual(posted.mentions,[])
 assert.equal((await rpc('chat.post',{id:group.id,kind:'message',text:'Focus on this sentence.',replyTo:first.id,replyQuote:quote,clientMessageId:'selected'})).id,posted.id)
 await assert.rejects(()=>rpc('chat.post',{id:group.id,kind:'message',text:'Focus on this sentence.',replyTo:first.id,replyQuote:{text:selected,offset:canonical.indexOf(selected)},clientMessageId:'selected'}),/different content/)
 const invalid=await f.request(null,'chat.send',{id:group.id,text:'Do not route this.',mentions:[b.id],replyTo:first.id,replyQuote:{text:'private invented text',offset:0},clientMessageId:'invalid'});assert.equal(invalid.ok,false);assert.equal(fs.existsSync(path.join(f.control,b.id+'-user.json')),false)
 const routed=await rpc('chat.send',{id:group.id,text:'Please discuss this selected line.',mentions:[b.id],replyTo:first.id,replyQuote:quote,clientMessageId:'routed'})
 await f.until(()=>fs.existsSync(path.join(f.control,b.id+'-user.json')),'mentioned recipient');assert.ok(JSON.parse(fs.readFileSync(path.join(f.control,b.id+'-user.json'),'utf8')).text.includes(JSON.stringify(quote)));await f.until(async()=>!(await f.status(b.id)).busy,'routed quote finishes')
 const token=await f.token(a.id),memberPost=await f.call(token,'chat','post',group.id,'--kind','summary','--text','A member can quote the shared source.','--reply-to',first.id,'--reply-quote',JSON.stringify(quote),'--client-message-id','member-quote');assert.deepEqual(memberPost.replyQuote,quote)
 const groupHistory=(await f.cli('chat','history',group.id)).messages;assert.equal(groupHistory.length,4);const confirmed=groupHistory.find(item=>item.id===routed.id).deliveries.find(item=>item.employeeId===b.id);assert.equal(confirmed.mode,'work');assert.ok(confirmed.readAt);assert.equal(confirmed.ackMessageId,undefined,'a directly addressed recipient may acknowledge silently');assert.equal(routed.replyTo,first.id)
 await f.stop();await f.start();assert.deepEqual((await f.cli('session','transcript','--employee',a.id)).items.find(item=>item.id===reply.id).reply.quote,quote);assert.deepEqual((await f.cli('chat','history',group.id)).messages.find(item=>item.id===posted.id).replyQuote,quote)
 assert.equal((await f.cli('api','describe','session.send')).inputSchema.properties.replyQuote.properties.offset.type,'integer');assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS precise quotes Core/CLI: Markdown/GFM projection, duplicate offsets, Unicode bounds, forged/stale/orphan rejection before execution, persistent private/group quotes, retry fingerprint and explicit mention context; local fixtures only')
}finally{await f.close()}
