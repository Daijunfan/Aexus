// Cloud Hosts interactive services. All entry points are authorized by host.* Core dispatch.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import {randomUUID} from 'node:crypto'
import {spawn,execFile,type ChildProcess} from 'node:child_process'
import {promisify} from 'node:util'
import {WebSocketServer,createWebSocketStream} from 'ws'
import {APP_HOME} from '../shared/protocol'
import {cloudHostTarget,getCloudHost} from './cloud-hosts'
import {tunnelConfig} from './tunnel'
import {childEnv} from './exec'
import {openTerminal,listTerminals,closeEmployeeTerminals,terminalOwner} from './terminals'

const owner=(id:string)=>'host:'+id
export function hostTerminals(id:string){getCloudHost(id);return listTerminals(owner(id))}
export function openHostTerminal(id:string,directory?:string,cols=100,rows=28){return openTerminal({id:owner(id),cwd:APP_HOME,remote:cloudHostTarget(id,directory)},cols,rows)}
export function requireHostTerminal(id:string,terminal:string){if(terminalOwner(terminal)!==owner(id))throw Error('终端不属于此云主机');return terminal}

type Desktop={id:string;hostId:string;protocol:'rdp'|'vnc';state:'connecting'|'ready'|'disconnected';address:string;port:number;createdAt:number;error?:string;wsUrl?:string;profile?:string;file?:string;child?:ChildProcess;server?:http.Server;wss?:WebSocketServer;sockets:Set<net.Socket>;cancelled?:boolean;closing?:Promise<void>}
const desktops=new Map<string,Desktop>()
const info=({child,server,wss,sockets,file,cancelled,closing,...value}:Desktop)=>value
export const listHostDesktops=(hostId?:string)=>[...desktops.values()].filter(d=>!hostId||d.hostId===hostId).map(info)
function desktop(id:string,session:string){const value=desktops.get(session);if(!value||value.hostId!==id)throw Error('桌面连接不存在或不属于此主机');return value}
const listen=(server:net.Server)=>new Promise<number>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve((server.address() as net.AddressInfo).port))})
const reachable=(address:string,port:number)=>new Promise<void>((resolve,reject)=>{const socket=net.connect({host:address,port});socket.setTimeout(2000,()=>socket.destroy(Error('桌面端口连接超时')));socket.once('error',reject);socket.once('connect',()=>{socket.destroy();resolve()})})
function rdpProfile(address:string,port:number,username=''){
  const endpoint=address.includes(':')&&!address.startsWith('[')?'['+address+']':address
  return [`full address:s:${endpoint}:${port}`,`username:s:${username}`,'screen mode id:i:2','session bpp:i:32','use multimon:i:0','dynamic resolution:i:1','smart sizing:i:1','networkautodetect:i:1','bandwidthautodetect:i:1','compression:i:1','bitmapcachepersistenable:i:1','authentication level:i:2','enablecredsspsupport:i:1','redirectclipboard:i:0','redirectprinters:i:0','drivestoredirect:s:','audiomode:i:0'].join('\r\n')+'\r\n'
}
export async function openHostDesktop(hostId:string){
  const host=getCloudHost(hostId),profile=host.desktop
  if(!profile)throw Error('请先配置此主机的远程桌面')
  // A single shared transport per host, reused by CLI and UI. Reopening a dead connection replaces it.
  const existing=listHostDesktops(hostId).find(d=>d.state==='ready');if(existing)return existing
  for(const item of listHostDesktops(hostId))await closeHostDesktop(hostId,item.id)
  const value:Desktop={id:randomUUID(),hostId,protocol:profile.protocol,state:'connecting',address:profile.address,port:profile.port,createdAt:Date.now(),sockets:new Set()}
  desktops.set(value.id,value)
  try{
    if(profile.viaHostId){
      const target=cloudHostTarget(profile.viaHostId),config=tunnelConfig(target),reserve=net.createServer(),port=await listen(reserve)
      await new Promise<void>(r=>reserve.close(()=>r()))
      if(value.cancelled)throw Error('桌面连接已取消')
      const args=['-N','-T','-o','ExitOnForwardFailure=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2']
      for(const [field,flag] of [['port','-p'],['identity_file','-i'],['known_hosts','-o'],['ssh_config','-F'],['proxy_jump','-J']])if(config[field])args.push(flag,field==='known_hosts'?'UserKnownHostsFile='+config[field]:String(config[field]))
      const remoteAddress=profile.address.includes(':')&&!profile.address.startsWith('[')?'['+profile.address+']':profile.address
      args.push('-L',`127.0.0.1:${port}:${remoteAddress}:${profile.port}`,target.host)
      const env=childEnv();if(config.askpass)Object.assign(env,{SSH_ASKPASS:config.askpass,SSH_ASKPASS_REQUIRE:'force',DISPLAY:'agents-company'})
      const child=spawn('ssh',args,{env,stdio:['ignore','ignore','pipe']});value.child=child
      let failure='',exited=false
      child.stderr!.on('data',data=>failure=(failure+data).slice(-3000))
      child.on('error',error=>{failure=error.message;exited=true;value.state='disconnected';value.error=failure})
      child.on('exit',()=>{exited=true;value.state='disconnected';value.error=failure.trim()||'SSH 桌面通道已断开';for(const socket of value.sockets)socket.destroy();for(const client of value.wss?.clients??[])client.close(1011,'SSH disconnected')})
      let ready=false
      for(let i=0;i<100&&!exited&&!value.cancelled;i++){try{await reachable('127.0.0.1',port);ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}
      if(value.cancelled)throw Error('桌面连接已取消')
      if(!ready||exited)throw Error(failure.trim()||'SSH 桌面通道未能建立')
      value.address='127.0.0.1';value.port=port
    }else await reachable(value.address.replace(/^\[|\]$/g,''),value.port)
    if(value.cancelled)throw Error('桌面连接已取消')
    if(profile.protocol==='rdp'){
      value.profile=rdpProfile(value.address,value.port,profile.username)
      const dir=path.join(APP_HOME,'cloud-hosts','desktops');fs.mkdirSync(dir,{recursive:true,mode:0o700})
      value.file=path.join(dir,value.id+'.rdp');fs.writeFileSync(value.file,value.profile,{mode:0o600})
    }else{
      const ticket=randomUUID(),server=http.createServer((_req,res)=>{res.writeHead(404);res.end()}),wss=new WebSocketServer({noServer:true,maxPayload:4*1024*1024,perMessageDeflate:false})
      value.server=server;value.wss=wss
      server.on('connection',socket=>{value.sockets.add(socket);socket.on('close',()=>value.sockets.delete(socket))})
      server.on('upgrade',(req,socket,head)=>{
        const origin=req.headers.origin
        let allowed=!origin||origin==='null'
        try{if(origin){const url=new URL(origin);allowed=['127.0.0.1','localhost','[::1]'].includes(url.hostname)}}catch{}
        if(req.url!=='/'+ticket||!allowed){socket.destroy();return}
        wss.handleUpgrade(req,socket,head,ws=>{
          const tcp=net.connect({host:value.address.replace(/^\[|\]$/g,''),port:value.port}),stream=createWebSocketStream(ws)
          value.sockets.add(tcp);tcp.setNoDelay(true)
          tcp.on('close',()=>{value.sockets.delete(tcp);stream.destroy()});tcp.on('error',()=>stream.destroy());stream.on('error',()=>tcp.destroy());stream.on('close',()=>tcp.destroy())
          stream.pipe(tcp).pipe(stream)
        })
      })
      value.wsUrl=`ws://127.0.0.1:${await listen(server)}/${ticket}`
    }
    if(value.cancelled)throw Error('桌面连接已取消')
    if(value.state==='disconnected')throw Error(value.error||'SSH 桌面通道已断开')
    value.state='ready';return info(value)
  }catch(error){await disposeDesktop(value);throw error}
}
const opening=new Map<string,Promise<ReturnType<typeof info>>>()
export async function connectHostDesktop(id:string){let pending=opening.get(id);if(!pending){pending=openHostDesktop(id);opening.set(id,pending)}try{return await pending}finally{opening.delete(id)}}
export async function launchHostDesktop(id:string,session:string){
  const value=desktop(id,session)
  if(value.protocol!=='rdp'||value.state!=='ready'||!value.file)throw Error('请先建立 RDP 连接')
  const run=promisify(execFile)
  // Only launch the OS's native client. No password or certificate bypass in argv/profile.
  if(process.platform==='darwin')await run('/usr/bin/open',['-b','com.microsoft.rdc.macos',value.file],{timeout:10000})
  else if(process.platform==='win32'){const child=spawn('mstsc.exe',[value.file],{detached:true,stdio:'ignore'});await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref()}
  else await run('xdg-open',[value.file],{timeout:10000})
  return {launched:true,id:value.id,authenticated:false}
}
function disposeDesktop(value:Desktop){
  if(value.closing)return value.closing
  value.cancelled=true;value.state='disconnected'
  value.closing=(async()=>{
    for(const socket of value.sockets)socket.destroy()
    for(const client of value.wss?.clients??[])client.terminate()
    value.wss?.close();if(value.server)await new Promise<void>(resolve=>value.server!.close(()=>resolve()))
    if(value.child&&value.child.exitCode===null&&value.child.signalCode===null){const child=value.child;await new Promise<void>(resolve=>{const timer=setTimeout(()=>child.kill('SIGKILL'),2000);child.once('close',()=>{clearTimeout(timer);resolve()});child.kill('SIGTERM')})}
    if(value.file)fs.rmSync(value.file,{force:true})
    desktops.delete(value.id)
  })()
  return value.closing
}
export async function closeHostDesktop(id:string,session:string){
  const value=desktop(id,session);value.cancelled=true;value.state='disconnected'
  value.child?.kill('SIGTERM')
  // Let pending creation observe cancellation before its resources can be published.
  const pending=opening.get(id);if(pending)try{await pending}catch{}
  await disposeDesktop(value)
  return {closed:true}
}
export function assertHostIdle(id:string){
  if(hostTerminals(id).some(t=>t.running)||listHostDesktops().some(d=>d.state!=='disconnected'&&(d.hostId===id||getCloudHost(d.hostId).desktop?.viaHostId===id))||opening.has(id))throw Error('此主机仍有交互连接，请先关闭终端与远程桌面再修改或删除')
}
export async function closeHostConnections(){await Promise.all(listHostDesktops().map(item=>closeHostDesktop(item.hostId,item.id)))}
export const closeHostTerminals=(id:string)=>closeEmployeeTerminals(owner(id))
