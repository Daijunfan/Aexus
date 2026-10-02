import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const fixture=path.resolve('test/fixtures/process-adapter.cjs'),test=await fixtureCore({CLINE_BIN:fixture,PI_BIN:fixture}),{cli,until,status,request}=test
const rpc=async(cmd,args)=>{const result=await request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
try{
 await cli('group','add','A')
 assert.deepEqual((await cli('engine','list')).map(e=>e.engine).sort(),['claude','cline','codex','pi'])
 for(const engine of ['cline','pi']){
  await rpc('engine.configure',{engine,patch:{apiKey:'fixture-key-not-real'}})
  const models=await cli('engine','models','--engine',engine);assert.equal(models.defaultModel,'deepseek-flash');assert.ok(models.models.every(m=>m.supportsEffort===false))
  const card=await cli('card','create','--title',engine,'--group','A','--engine',engine)
  assert.equal(card.model,'deepseek-flash');assert.equal(card.thinking,false)
  const opened=await cli('session','open',card.id),send=async text=>{const accepted=await rpc('session.send',{employee:card.id,text});assert.ok(accepted.messageId);await until(async()=>!(await status(card.id)).busy,'turn completed');return await cli('session','transcript','--employee',card.id)}
  if(engine==='cline'){assert.equal((await cli('session','list')).sessions.find(c=>c.id===card.id).clineSessionId,undefined);await cli('session','close',opened.sessionId)}
  await send('UNICODE_FIXTURE');let transcript=await cli('session','transcript','--employee',card.id);assert.ok(JSON.stringify(transcript).includes('春 雨 秋'),'LF framing preserves Unicode paragraph characters')
  await rpc('session.send',{employee:card.id,text:'WRITE_FIXTURE'})
  let current=await status(card.id);await until(async()=>(await cli('approval','list',current.sessionId)).length,'approval pending')
  const approvals=await cli('approval','list',current.sessionId);assert.equal(approvals.length,1);assert.ok(!fs.existsSync(path.join(card.cwd,'approval.txt')))
  await rpc('approval.respond',{id:current.sessionId,requestId:approvals[0].id,decision:'deny'});await until(async()=>!(await status(card.id)).busy,'denied turn completes');assert.ok(!fs.existsSync(path.join(card.cwd,'approval.txt')))
  await rpc('session.send',{employee:card.id,text:'WRITE_FIXTURE'});await until(async()=>(await cli('approval','list',current.sessionId)).length,'approval pending');const second=(await cli('approval','list',current.sessionId))[0];await rpc('approval.respond',{id:current.sessionId,requestId:second.id,decision:'allow'});await until(async()=>!(await status(card.id)).busy,'allowed turn completes');assert.equal(fs.readFileSync(path.join(card.cwd,'approval.txt'),'utf8'),'approved')
  await rpc('session.send',{employee:card.id,text:'HOLD_FIXTURE'});assert.equal((await status(card.id)).busy,true);await rpc('session.interrupt',{employee:card.id});await until(async()=>!(await status(card.id)).busy,'cancel completes')
  await send('FAIL_FIXTURE');assert.ok((await cli('session','snapshot',(await status(card.id)).sessionId)).error.includes('Fixture model failure'))
  const before=(await cli('session','list')).sessions.find(c=>c.id===card.id),native=before[engine==='cline'?'clineSessionId':'piSessionId'];assert.ok(native)
  await cli('session','close',(await status(card.id)).sessionId);await send('after restart');const after=(await cli('session','list')).sessions.find(c=>c.id===card.id);assert.equal(after[engine==='cline'?'clineSessionId':'piSessionId'],native)
  const quoteSource=(await cli('session','transcript','--employee',card.id)).items.filter(item=>item.role==='assistant'&&item.blocks.some(block=>block.kind==='text')).at(-1);await rpc('session.send',{employee:card.id,text:'A linked follow-up.',replyTo:quoteSource.id});await until(async()=>!(await status(card.id)).busy,'linked reply completes');const linked=(await cli('session','transcript','--employee',card.id)).items.find(item=>item.text==='A linked follow-up.');assert.equal(linked.reply.id,quoteSource.id);assert.ok(linked.createdAt>0)
  const info=await cli('session','info','--employee',card.id);assert.equal(info.thinking,false);assert.equal(info.model,'deepseek-flash')
  assert.equal((await request(null,'config.thinking',{id:info.id,enabled:true})).ok,false)
  if(engine==='pi')for(const ref of (await cli('session','list')).sessions.find(c=>c.id===card.id).nativeSessions??[])assert.match(ref.id,/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,JSON.stringify(ref))
  if(engine==='pi')assert.match(before.piSessionId,/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,JSON.stringify(before.nativeSessions))
  await cli('card','remove',card.id);assert.ok(!fs.existsSync(before[engine==='cline'?'clineConfigRoot':'piConfigRoot']))
 }
 console.log('PASS Cline/Pi Core CLI: defaults, Unicode streaming, approvals deny/allow, cancellation/errors, native resume and scoped history cleanup; fixture only')
}finally{await test.close()}
