import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {randomUUID,createHash} from 'node:crypto'
import {WebSocket} from 'ws'
import {fixtureCore} from './fixtures/headless-core.mjs'
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
const url='http://127.0.0.1:'+port
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_HOST:'127.0.0.1',AGENTS_COMPANY_WEB_PORT:String(port)})
let checks=0;const pass=(label)=>{checks++;console.log('PASS '+label)},sockets=[]
async function login(client=randomUUID()){
  const token=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()
  const res=await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:JSON.stringify({token})}),reply=await res.json()
  assert.equal(res.status,200,JSON.stringify(reply));assert.ok(reply.data.csrf);assert.ok(!JSON.stringify(reply).includes(token));assert.match(res.headers.get('set-cookie'),/HttpOnly/);assert.match(res.headers.get('set-cookie'),/SameSite=Strict/)
  return {cookie:res.headers.get('set-cookie').split(';')[0],csrf:reply.data.csrf,client}
}
async function request(identity,cmd,args,id=randomUUID(),extra={}){
  const res=await fetch(url+'/api/rpc',{method:'POST',headers:{Origin:url,Cookie:identity.cookie,'content-type':'application/json','x-agents-csrf':identity.csrf,'x-agents-client':identity.client,'x-request-id':id,...extra},body:JSON.stringify({cmd,args})})
  return {status:res.status,body:await res.json()}
}
async function call(identity,cmd,args,id){const result=await request(identity,cmd,args,id);assert.equal(result.status,200,JSON.stringify(result));assert.ok(result.body.ok,JSON.stringify(result));return result.body.data}
try{
  await f.until(async()=>fetch(url+'/api/health').then(r=>r.ok).catch(()=>false),'HTTP service')
  assert.equal((await fetch(url+'/api/bootstrap')).status,401);pass('browser requires authentication')
  const a=await login(),b=await login();pass('login exchanges token for HttpOnly session; no token response')
  const newsSource=await call(a,'channel.source-add',{plugin:'x',locator:'web_fixture'}),news=await call(a,'channel.publish',{sourceId:newsSource.id,externalId:'web-news',publishedAt:Date.now(),title:'External news',body:'Keep the source URL.',url:'https://example.test/story'})
  const savedNews=await call(a,'channel.save',{id:news.id,saved:true}),readNews=await call(a,'channel.post',{id:news.id})
  assert.equal(savedNews.url,'https://example.test/story');assert.equal(readNews.plugin,'x');assert.equal(readNews.attached,undefined);pass('news plugin/source fields never create an internal plugin-view grant or rewrite its URL')
  const readingRequest=randomUUID(),timelineRequest=randomUUID(),allRequest=randomUUID(),readingArgs={id:newsSource.channelId,entryIds:[news.id]},timelineArgs={id:newsSource.channelId,kind:'news',limit:10}
  assert.equal((await call(a,'channel.read-state',readingArgs,readingRequest)).entries[0].state,'unread')
  assert.equal((await call(a,'channel.timeline',timelineArgs,timelineRequest)).entries.length,1)
  await call(a,'channel.acknowledge',{id:newsSource.channelId,all:true},allRequest)
  assert.equal((await call(a,'channel.read-state',readingArgs,readingRequest)).entries[0].state,'read','completed read requests are not replayed from an old snapshot')
  await call(a,'channel.publish',{sourceId:newsSource.id,externalId:'web-later-news',publishedAt:Date.now()-1000,title:'Later delivery',body:'A second retained item.'})
  assert.equal((await call(a,'channel.timeline',timelineArgs,timelineRequest)).entries.length,2,'timeline retries execute fresh history reads')
  await call(a,'channel.acknowledge',{id:newsSource.channelId,all:true},allRequest)
  assert.equal((await call(a,'channel.read-state',{id:newsSource.channelId,entryIds:[]})).unreadCount,1,'replaying a completed explicit mark-all cannot consume later arrivals')
  const contextRequest=randomUUID(),contextArgs={id:newsSource.channelId,entryId:news.id};assert.equal((await call(a,'channel.context',contextArgs,contextRequest)).entry.post.title,'External news')
  await call(a,'channel.publish',{sourceId:newsSource.id,externalId:'web-news',publishedAt:readNews.publishedAt,title:'Updated source title',body:'The latest retained source.'})
  assert.equal((await call(a,'channel.context',contextArgs,contextRequest)).entry.post.title,'Updated source title','context reads also resolve current content on replay')
  pass('channel history/read-state remain fresh while read mutations retain request replay protection')
  assert.equal((await request(a,'status',{},undefined,{'x-agents-csrf':''})).status,403)
  assert.equal((await request(a,'status',{},undefined,{Origin:'https://untrusted.example'})).status,403)
  const http=await import('node:http');const badHost=await new Promise((resolve,reject)=>{const req=http.get(url+'/api/health',{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject)});assert.equal(badHost,403);pass('CSRF, Origin and Host validation')
  const duplicate=randomUUID();await call(a,'group.add',{name:'A'},duplicate);await call(a,'group.add',{name:'A'},duplicate)
  assert.equal((await f.cli('group','list')).filter(name=>name==='A').length,1)
  assert.equal((await request(a,'group.add',{name:'B'},duplicate)).status,409);pass('mutation retries deduplicate by request ID')
  await call(a,'group.add',{name:'B'})
  const one=await call(a,'team-view.create',{name:'View A',teams:['A']})
  assert.equal((await call(a,'team-view.list')).activeId,one.id);assert.equal((await call(b,'team-view.list')).activeId,'all')
  await call(a,'canvas.set',{viewId:one.id,x:91,y:42,zoom:.8})
  assert.deepEqual(await call(a,'canvas.view',{viewId:one.id}),{x:91,y:42,zoom:.8})
  assert.notDeepEqual(await call(b,'canvas.view',{viewId:one.id}),{x:91,y:42,zoom:.8});pass('browser tabs have independent view selection and cameras')
  await call(a,'view.open',{kind:'settings'});assert.equal((await call(b,'view.get')).kind,'home');pass('presentation navigation is per client')
  const events=[]
  const ws=new WebSocket(url.replace('http','ws')+'/api/events?client='+a.client,{headers:{Origin:url,Cookie:a.cookie}});sockets.push(ws)
  ws.on('message',data=>{const event=JSON.parse(data.toString());events.push(event);if(event.type==='ui:request')ws.send(JSON.stringify({type:'ui:response',id:event.id,data:{flushed:true}}))});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
  await f.until(()=>events.some(e=>e.channel==='store:changed'),'initial stream resync')
  await call(b,'group.add',{name:'C'});await f.until(()=>events.filter(e=>e.channel==='store:changed').length>=2,'state update')
  assert.ok(events.filter(e=>e.channel==='store:changed').every(e=>!e.payload.sessions));pass('persistent stream emits lightweight state invalidations')
  const employee=await f.create('Worker','A')
  assert.equal((await f.cli('session','list')).sessions.find(c=>c.id===employee.id).permissionMode,'default');pass('fresh employees use safe default; existing permissions are not elevated')
  const token=await f.token(employee.id)
  const denied=await fetch(url+'/api/rpc',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({cmd:'engine.install',args:{engine:'codex',confirm:true}})})
  assert.equal((await denied.json()).ok,false);pass('employee tokens cannot install software')
  const sendId=randomUUID();await call(a,'session.send',{employee:employee.id,text:'visible test'},sendId);await call(a,'session.send',{employee:employee.id,text:'visible test'},sendId)
  await f.until(async()=>!(await f.status(employee.id)).busy,'task completion')
  const transcript=await f.cli('session','transcript','--employee',employee.id)
  assert.equal(transcript.items.filter(item=>item.role==='user').length,1)
  assert.ok(JSON.stringify(transcript).includes('VISIBLE_REPLY'));pass('shared engine adapter sends exactly one user turn')
  const content=Buffer.alloc(700000,97),destination={employee:employee.id,path:'.'}
  const upload=await call(a,'transfer.upload-begin',{to:destination,name:'browser.txt',bytes:content.length})
  assert.equal((await request(b,'transfer.upload-chunk',{id:upload.id,offset:0,data:'YQ=='})).body.ok,false)
  for(let offset=0;offset<content.length;offset+=upload.chunkBytes)await call(a,'transfer.upload-chunk',{id:upload.id,offset,data:content.subarray(offset,offset+upload.chunkBytes).toString('base64')})
  await call(a,'transfer.upload-commit',{id:upload.id})
  assert.deepEqual(fs.readFileSync(path.join(employee.cwd,'browser.txt')),content)
  assert.equal((await request(a,'transfer.upload-begin',{to:destination,name:'../escape',bytes:0})).body.ok,false)
  assert.equal((await request(a,'transfer.upload-begin',{to:destination,name:'browser.txt',bytes:0})).body.ok,false);pass('bounded uploads preserve bytes, client ownership, traversal and overwrite protections')
  const download=new URL('/api/download',url);download.searchParams.set('client',a.client);download.searchParams.set('from',JSON.stringify({employee:employee.id,path:'browser.txt'}))
  const response=await fetch(download,{headers:{Cookie:a.cookie}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),content);pass('streamed browser download preserves content')
  await call(a,'engine.configure',{engine:'claude',patch:{apiKey:'fixture-secret-not-a-real-key'}})
  const settings=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'engines/settings.json'),'utf8')
  assert.ok(!settings.includes('fixture-secret-not-a-real-key'));assert.ok(!JSON.stringify(await call(a,'engine.list')).includes('fixture-secret-not-a-real-key'));pass('provider secrets stay out of browser projections and plaintext settings')
  await call(a,'engine.configure',{engine:'claude',patch:{apiKey:''}})
  const view=await call(a,'plugin.open',{id:'cloud-hosts'})
  assert.ok(view.url.startsWith(url+'/'))
  const plugin=await fetch(new URL('rpc',view.url),{method:'POST',headers:{Origin:'null','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'hosts.list',params:{}})})
  assert.equal(plugin.status,403,'a plugin page URL cannot grant RPC authority')
  const pluginReply=await call(a,'plugin.call',{id:'cloud-hosts',workspace:view.workspace,viewId:view.id,method:'hosts.list',params:{},raw:true})
  assert.equal(pluginReply.jsonrpc,'2.0');assert.ok(!pluginReply.error)
  assert.equal((await request(b,'plugin.call',{id:'cloud-hosts',workspace:view.workspace,viewId:view.id,method:'hosts.list',params:{},raw:true})).status,403)
  assert.match(await (await fetch(view.url,{headers:{Origin:'null'}})).text(),/_agents-bridge\.js/)
  pass('plugin page has an isolated parent bridge; only the authenticated owning client can execute RPC')
  // Keep an engine turn and both HTTP streaming paths open while revoking login.
  fs.writeFileSync(path.join(f.control,employee.id+'.hold-user'),'')
  await call(a,'session.send',{employee:employee.id,text:'held turn survives browser logout'})
  const follow=await fetch(url+'/api/follow',{method:'POST',headers:{Origin:url,Cookie:a.cookie,'content-type':'application/json','x-agents-csrf':a.csrf,'x-agents-client':a.client},body:JSON.stringify({cmd:'session.follow',args:{employee:employee.id}})})
  assert.equal(follow.status,200)
  let followed='',followEnded=false,pluginEnded=false
  const consumeFollow=(async()=>{try{for await(const chunk of follow.body)followed+=Buffer.from(chunk).toString()}catch{}finally{followEnded=true}})()
  const stream=await fetch(new URL('events',view.url),{headers:{Origin:'null'}})
  assert.equal(stream.status,200)
  const consumePlugin=(async()=>{try{for await(const _ of stream.body){}}catch{}finally{pluginEnded=true}})()
  await f.until(()=>followed.includes('following'),'HTTP follow snapshot')
  const logout=await fetch(url+'/api/logout',{method:'POST',headers:{Origin:url,Cookie:a.cookie,'content-type':'application/json','x-agents-csrf':a.csrf,'x-agents-client':a.client},body:'{}'});assert.equal(logout.status,200)
  assert.equal((await fetch(view.url,{headers:{Origin:'null'}})).status,401);await f.until(()=>ws.readyState===WebSocket.CLOSED,'logout closes stream');pass('logout immediately revokes HTTP, WebSocket and plugin view access')
  await f.until(()=>followEnded&&pluginEnded,'logout closes active HTTP follow and plugin SSE')
  await Promise.all([consumeFollow,consumePlugin])
  assert.equal((await f.status(employee.id)).busy,true,'Logging out must not cancel backend work')
  fs.rmSync(path.join(f.control,employee.id+'.hold-user'))
  await f.until(async()=>!(await f.status(employee.id)).busy,'backend work completes without browser')
  pass('logout revokes existing HTTP streams without cancelling the backend task')
  const tokenCLI=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util')
  const remote=await promisify(execFile)(process.execPath,[path.join(f.root,'bin/agents'),'status','--json'],{env:{...f.env,AGENTS_COMPANY_URL:url,AGENTS_COMPANY_TOKEN:tokenCLI},timeout:15000})
  assert.equal(JSON.parse(remote.stdout).ok,true);pass('remote CLI uses the same authenticated HTTP Core')
  console.log(`WEB SERVER: ${checks} checks passed; no external model or user-state mutation`)
}finally{for(const ws of sockets)ws.terminate();await f.close()}
