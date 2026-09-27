import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {WebSocket} from 'ws'
import {fixtureCore} from './fixtures/headless-core.mjs'
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r))
const tcpSockets=new Set(),echo=net.createServer(socket=>{tcpSockets.add(socket);socket.on('close',()=>tcpSockets.delete(socket));socket.on('error',()=>{});socket.pipe(socket)})
await new Promise(r=>echo.listen(0,'127.0.0.1',r))
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),url='http://127.0.0.1:'+port
let viewer
try{
  const token=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()
  const login=await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:JSON.stringify({token})})
  const credentials=(await login.json()).data,cookie=login.headers.get('set-cookie').split(';')[0],client=randomUUID()
  const headers={Origin:url,Cookie:cookie,'content-type':'application/json','x-agents-csrf':credentials.csrf,'x-agents-client':client}
  const call=async(cmd,args)=>{const res=await fetch(url+'/api/rpc',{method:'POST',headers,body:JSON.stringify({cmd,args})}),result=await res.json();assert.ok(result.ok,JSON.stringify(result));return result.data}
  const host=await call('host.create',{name:'VNC fixture',host:'fixture',os:'linux',defaultDirectory:'/tmp',desktop:{protocol:'vnc',address:'127.0.0.1',port:echo.address().port}})
  const view=await call('plugin.open',{id:'cloud-hosts'})
  const plugin=async(method,params)=>{const data=await call('plugin.call',{id:'cloud-hosts',workspace:view.workspace,viewId:view.id,method,params,raw:true});assert.ok(!data.error,JSON.stringify(data));return data.result}
  const connection=await plugin('hosts.desktop-open',{id:host.id})
  assert.equal(connection.webRelay,true);assert.ok(connection.wsUrl.startsWith(url.replace('http','ws')+'/api/desktop/'))
  assert.equal((await plugin('hosts.desktop-list',{id:host.id}))[0].wsUrl,connection.wsUrl,'same view reuses its ticket')
  const rejected=new WebSocket(connection.wsUrl,{origin:'https://untrusted.example'});rejected.on('error',()=>{});await new Promise(r=>rejected.once('close',r))
  viewer=new WebSocket(connection.wsUrl,{origin:'null'});viewer.on('error',()=>{});await once(viewer,'open')
  const received=once(viewer,'message');viewer.send(Buffer.from('VNC_BINARY_中文'))
  assert.equal((await received)[0].toString(),'VNC_BINARY_中文')
  const closed=once(viewer,'close')
  const logout=await fetch(url+'/api/logout',{method:'POST',headers,body:'{}'});assert.equal(logout.status,200)
  await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Desktop relay was not revoked')),3000))])
  const invalid=new WebSocket(connection.wsUrl,{origin:'null'});invalid.on('error',()=>{});await new Promise(r=>invalid.once('close',r))
  assert.equal((await f.request(null,'host.desktop-close',{id:host.id,session:connection.id})).ok,true)
  console.log('PASS Web plugin VNC URL projects to the public origin; binary stream round-trip, reused ticket, foreign origin denied, logout closes live desktop and revokes reconnect')
}finally{viewer?.terminate();await f.close();for(const socket of tcpSockets)socket.destroy();await new Promise(r=>echo.close(r))}
