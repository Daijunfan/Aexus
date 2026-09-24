import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'

const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-chatter-'))
const site=http.createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'})
  if(req.url==='/sign_in/'){res.end('<title>Sign in</title>');return}
  res.end(`<title>Chat fixture</title><textarea></textarea><script>document.querySelector('textarea').addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const answer=document.createElement('div');answer.className='ds-markdown';answer.textContent='WEB:'+e.target.value;document.body.append(answer)})</script>`)
})
await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve))
const base=`http://127.0.0.1:${site.address().port}/`
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:process.env.AGENTS_COMPANY_TEST_PLUGINS||path.join(root,'build/plugins'),AGENTS_COMPANY_CHAT_TEST_URL_DEEPSEEK:base,AGENTS_COMPANY_CHAT_TEST_URL_DOUBAO:base,AGENTS_COMPANY_CHAT_TEST_URL_CHATGPT:base}
const daemon=spawn(process.execPath,[path.join(root,'bin/agents'),'serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>daemon.once('exit',resolve))
const cli=async(...args)=>{const stdout=(await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:45000})).stdout;const result=JSON.parse(stdout);assert.ok(result.ok,result.error);return result.data}
try{
  let ready=false;for(let n=0;n<100;n++){try{await cli('status');ready=true;break}catch{await new Promise(resolve=>setTimeout(resolve,100))}}assert.ok(ready,'windowless service starts')
  await cli('group','add','Local')
  const card=await cli('card','create','--title','DeepSeek Chat','--group','Local','--kind','chatter','--chat-provider','deepseek')
  assert.equal(card.kind,'chatter');assert.equal(card.chatProvider,'deepseek')
  assert.equal((await cli('chatter','status',card.id)).authenticated,true)
  const opened=await cli('session','open',card.id);assert.equal(opened.sessionId,card.id)
  assert.equal((await cli('session','info',card.id)).provider,'deepseek')
  assert.equal((await cli('session','send',card.id,'hello')).sent,true)
  const transcript=await cli('session','transcript',card.id);assert.match(transcript.text,/WEB:hello/)
  assert.equal((await cli('session','snapshot',card.id)).items.length,2)
  const web=await cli('card','create','--title','ChatGPT Chat','--group','Local','--kind','chatter','--chat-provider','chatgpt')
  await cli('session','open',web.id)
  assert.equal((await cli('session','send',web.id,'web ping')).sent,true)
  assert.match((await cli('session','transcript',web.id)).text,/WEB:web ping/)
  assert.equal((await cli('chatter','current',web.id)).provider,'chatgpt')
  assert.equal((await cli('commands','list',card.id)).length,0)
  const clone=await cli('card','clone',card.id,'--title','Clone Chat');assert.equal(clone.kind,'chatter');assert.equal(clone.chatProvider,'deepseek')
  await assert.rejects(()=>cli('card','update',card.id,'--chat-provider','doubao'))
  await assert.rejects(()=>cli('config','engine',card.id,'claude'))
  await cli('session','close',card.id)
  await cli('card','remove',card.id);await cli('card','remove',clone.id);await cli('card','remove',web.id)
  assert.equal((await cli('session','list')).sessions.length,0)
  console.log('PASS Chatter create, status, open, website reply, transcript, clone, restrictions and deletion through host CLI with no visible window')
}finally{daemon.kill('SIGTERM');await done;await new Promise(resolve=>site.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
