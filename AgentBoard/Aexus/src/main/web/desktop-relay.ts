import type {IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import {randomUUID} from 'node:crypto'
import {WebSocket,WebSocketServer,createWebSocketStream} from 'ws'
import {listHostDesktops} from '../host-connections'
import type {WebSession} from './auth'

type Grant={viewId:string;session:WebSession;desktopId:string;hostId:string;upstream:string;sockets:Set<WebSocket>}
/** Only Core-created VNC connections can be relayed. Never accept an arbitrary URL. */
export function createDesktopRelay(validSession:(session:WebSession)=>boolean){
  const grants=new Map<string,Grant>(),keys=new Map<string,string>()
  const server=new WebSocketServer({noServer:true,maxPayload:4*1024*1024,perMessageDeflate:false})
  const current=(grant:Grant)=>listHostDesktops(grant.hostId).find(item=>item.id===grant.desktopId&&item.state==='ready'&&item.wsUrl===grant.upstream)
  const valid=(grant:Grant)=>validSession(grant.session)&&!!current(grant)
  const drop=(ticket:string)=>{const grant=grants.get(ticket);if(!grant)return;grants.delete(ticket);keys.delete(grant.viewId+':'+grant.desktopId);for(const socket of grant.sockets)socket.terminate()}
  function project(value:any,viewId:string,session:WebSession,origin:string):any{
    if(Array.isArray(value))return value.map(item=>project(item,viewId,session,origin))
    if(!value||typeof value!=='object')return value
    if(value.id&&value.hostId&&['rdp','vnc'].includes(value.protocol)){
      const actual=listHostDesktops(String(value.hostId)).find(item=>item.id===value.id)
      if(!actual)return value
      if(actual.protocol==='rdp')return {...value,nativeLaunchAllowed:false,browserNote:'RDP 使用浏览器所在电脑的系统客户端。此配置地址属于 Core 的网络；若为 Core 回环地址，需先建立客户端 SSH 转发。Web 页面不会在服务器上启动桌面应用。'}
      if(actual.state!=='ready'||!actual.wsUrl)return value
      const url=new URL(actual.wsUrl)
      if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1')throw Error('Invalid internal desktop relay')
      const key=viewId+':'+actual.id
      let ticket=keys.get(key),grant=ticket?grants.get(ticket):undefined
      if(!grant||grant.upstream!==actual.wsUrl||grant.session!==session){
        if(ticket)drop(ticket)
        ticket=randomUUID();grant={viewId,session,desktopId:actual.id,hostId:actual.hostId,upstream:actual.wsUrl,sockets:new Set()};grants.set(ticket,grant);keys.set(key,ticket)
      }
      return {...value,wsUrl:origin.replace(/^http/,'ws')+'/api/desktop/'+ticket,webRelay:true}
    }
    if(value.result!==undefined)return {...value,result:project(value.result,viewId,session,origin)}
    return value
  }
  return {
    project,
    prune(){for(const [ticket,grant] of grants)if(!valid(grant))drop(ticket)},
    revokeView(viewId:string){for(const [ticket,grant] of grants)if(grant.viewId===viewId)drop(ticket)},
    upgrade(req:IncomingMessage,socket:Duplex,head:Buffer,origin:string){
      const url=new URL(req.url??'/',origin)
      if(!url.pathname.startsWith('/api/desktop/'))return false
      const ticket=url.pathname.slice('/api/desktop/'.length),grant=grants.get(ticket)
      if(!grant||!valid(grant)||String(req.headers.host??'').toLowerCase()!==new URL(origin).host.toLowerCase()||!['null',origin].includes(String(req.headers.origin??''))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return true}
      server.handleUpgrade(req,socket,head,downstream=>{
        const upstream=new WebSocket(grant.upstream,{maxPayload:4*1024*1024,perMessageDeflate:false})
        grant.sockets.add(downstream);grant.sockets.add(upstream)
        // Register revocation checks before the stream message handlers.
        downstream.on('message',()=>{if(!valid(grant))close()});upstream.on('message',()=>{if(!valid(grant))close()})
        const a=createWebSocketStream(downstream),b=createWebSocketStream(upstream)
        let closed=false
        const close=()=>{if(closed)return;closed=true;grant.sockets.delete(downstream);grant.sockets.delete(upstream);a.destroy();b.destroy();downstream.terminate();upstream.terminate()}
        a.on('error',close);b.on('error',close);a.on('close',close);b.on('close',close)
        a.pipe(b).pipe(a)
      })
      return true
    },
    close(){for(const ticket of grants.keys())drop(ticket);server.close()}
  }
}
