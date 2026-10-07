// Actual CLI/Contract over authenticated HTTP and streaming socket Core. Disposable state only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createNodeClient} from '../../../Contract/node-client.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-scope-http-')),out=path.join(root,'.aexus/artifacts/launcher-local-closeout/http-'+Date.now()),checks=[]
fs.mkdirSync(out,{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'));let f
async function check(name,fn){try{await fn();checks.push({name,passed:true});console.log('PASS '+name)}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+' '+error.message)}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.every(c=>c.passed),checks},null,2))}}
try{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin='http://127.0.0.1:'+port
 await build({entryPoints:Object.fromEntries(['daemon','message-index-worker','asset-index-worker'].map(n=>[n,path.join(root,'Infra/src/main',n+'.ts')])),outdir:temp,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(temp,'daemon.js'));await f.until(()=>fetch(origin+'/api/health').then(r=>r.ok).catch(()=>false),'HTTP ready')
 const A='deep-research',B='workspace-audit',call=(engine,cmd,args={})=>f.cli('--engine-scope',engine,'api','call',cmd,'--args',JSON.stringify(args))
 await call(A,'group.add',{name:'HTTP Alpha',mode:'build'});await call(B,'group.add',{name:'HTTP Beta',mode:'build'})
 const a=await call(A,'card.create',{title:'HTTP A',group:'HTTP Alpha',engine:'codex',model:'gpt-6-luna'}),b=await call(B,'card.create',{title:'HTTP B',group:'HTTP Beta',engine:'codex',model:'gpt-6-luna'});await f.ready(a.id);await f.ready(b.id)
 const token=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim(),env={...f.env,AGENTS_COMPANY_URL:origin,AGENTS_COMPANY_TOKEN:token},cli=path.join(root,'Infra/src/cli/aexus')
 const remote=async(engine,...args)=>{try{return JSON.parse((await promisify(execFile)(process.execPath,[cli,...args,'--json'],{cwd:root,env:{...env,...(engine?{AEXUS_ENGINE_ID:engine}:{})},timeout:12000,maxBuffer:4e6})).stdout)}catch(e){if(e.stdout)return JSON.parse(e.stdout);throw e}}
 const clients=[createNodeClient({cli,env,engineId:A}),createNodeClient({cli,env,engineId:B})]
 await check('Remote CLI keeps --engine-scope and environment scope, while unscoped operator retains discovery',async()=>{
  const ra=await remote(A,'group','list');assert.equal(ra.ok,true,ra.error);assert.deepEqual(ra.data,['HTTP Alpha'])
  const rb=await remote(A,'--engine-scope',B,'group','list');assert.deepEqual(rb.data,['HTTP Beta'])
  assert.deepEqual((await remote(null,'group','list')).data.sort(),['HTTP Alpha','HTTP Beta'])
 })
 await check('Two HTTP Contract clients query concurrently without global scope drift',async()=>{const[ra,rb]=await Promise.all(clients.map(c=>c.invoke('session.list',{})));assert.deepEqual(ra.sessions.map(c=>c.id),[a.id]);assert.deepEqual(rb.sessions.map(c=>c.id),[b.id])})
 await check('HTTP-created resources retain their Engine association',async()=>{await clients[0].invoke('group.add',{name:'HTTP Alpha new',mode:'build'});assert.ok((await call(A,'group.list')).includes('HTTP Alpha new'));assert.ok(!(await call(B,'group.list')).includes('HTTP Alpha new'))})
 await check('Remote direct reads cannot use a known foreign employee ID',async()=>{await assert.rejects(clients[0].invoke('session.transcript',{employee:b.id}),e=>/scope|linked|Engine/.test(e.message));assert.equal((await remote(A,'session','transcript','--employee',b.id)).ok,false)})
 await check('Local and remote session.follow reject a foreign employee before returning its snapshot',async()=>{
  assert.equal((await f.raw(null,'--engine-scope',A,'session','follow','--employee',b.id)).ok,false)
  assert.equal((await remote(A,'session','follow','--employee',b.id)).ok,false)
 })
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify({token})}),logged=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0],client=randomUUID()
 const headers={Origin:origin,'content-type':'application/json',Cookie:cookie,'x-agents-csrf':logged.data.csrf,'x-agents-client':client}
 async function firstFollow(body,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000)
  try{const response=await fetch(origin+'/api/follow',{method:'POST',headers:options.headers??headers,body:JSON.stringify(body),signal:controller.signal}),reader=response.body.getReader();let data='';while(!data.includes('\n')){const value=await reader.read();if(value.done)break;data+=new TextDecoder().decode(value.value)}return JSON.parse(data.split('\n')[0])}finally{clearTimeout(timer);controller.abort()}
 }
 await check('Browser follow respects the unloaded homepage and selected Engine without a client-supplied scope',async()=>{
  assert.equal((await firstFollow({cmd:'session.follow',args:{employee:a.id}})).ok,false)
  const load=await fetch(origin+'/api/rpc',{method:'POST',headers,body:JSON.stringify({cmd:'view.load-engine',args:{engineId:A}})});assert.equal((await load.json()).ok,true)
  assert.equal((await firstFollow({cmd:'session.follow',args:{employee:b.id}})).ok,false)
  assert.equal((await firstFollow({cmd:'session.follow',args:{employee:a.id}})).ok,true)
 })
 await check('Existing scoped stream is revoked when its employee is unlinked; native work is not cancelled',async()=>{
  fs.writeFileSync(path.join(f.control,a.id+'.hold-user'),'');await call(A,'session.send',{employee:a.id,text:'HTTP_SCOPE_HELD',clientMessageId:'http-scope-held'});await f.until(async()=>(await f.status(a.id)).busy,'held task')
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000)
  try{
   const response=await fetch(origin+'/api/follow',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({cmd:'session.follow',args:{employee:a.id},engineScope:A}),signal:controller.signal}),reader=response.body.getReader();let buffer=''
   const line=async()=>{while(!buffer.includes('\n')){const v=await reader.read();if(v.done)throw Error('Stream closed without a terminal result');buffer+=new TextDecoder().decode(v.value)}const end=buffer.indexOf('\n'),value=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);return value}
   assert.equal((await line()).ok,true);await call(A,'infra.unbind',{engineId:A,resources:{employees:[a.id]}})
   const next=await line();assert.equal(next.type,'done');assert.match(next.error,/revoked|scope|linked/i);assert.ok((await f.status(a.id)).busy)
  }finally{clearTimeout(timer);controller.abort();fs.rmSync(path.join(f.control,a.id+'.hold-user'),{force:true})}
 })
 assert.ok(checks.every(c=>c.passed),'HTTP scope regressions failed; '+out)
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true});console.log('Evidence '+out)}
