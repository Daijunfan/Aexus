import {mediaResponse} from '../media-response'
import {mediaAvailable,closeMedia} from '../media'
import {Readable as NodeReadable} from 'node:stream'
import {rendererDirectory} from '../resources'
import http from 'node:http'
import net from 'node:net'
import type {Readable} from 'node:stream'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {WebSocketServer,WebSocket} from 'ws'
import {handleRequest,engineRequestContext,setUiHandler,setViewGuard,presentationEvent} from '../server'
import {onCoreEvent} from '../core-events'
import {withCaller,requestContext} from '../request-context'
import {getView} from '../presentation'
import {managementActivity} from '../management-activity'
import {pluginWindows,setPluginWindowDriver} from '../plugins/windows'
import {runtimeInfo} from '../platform'
import {createWebAuth,type WebSession} from './auth'
import {createDesktopRelay} from './desktop-relay'
import {pluginBridge} from './plugin-bridge'
import {authenticate} from '../agent-access'
import {APP_HOME,SOCKET_PATH,type Request} from '../../shared/protocol'
import type {RequestContext} from '../../shared/management'

type Options={host?:string;port?:number;publicUrl?:string;allowInsecure?:boolean;renderer?:string}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.ico':'image/x-icon'}
const failure=(message:string,status=400,code='BAD_REQUEST')=>Object.assign(Error(message),{status,code})
async function body(req:http.IncomingMessage,limit=16*1024*1024){
  if(!req.headers['content-type']?.startsWith('application/json'))throw failure('Content-Type must be application/json',415)
  const chunks:Buffer[]=[];let size=0
  for await(const value of req){size+=value.length;if(size>limit)throw failure('Request too large',413);chunks.push(value)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw failure('Invalid JSON')}
}
function json(res:http.ServerResponse,value:unknown,status=200){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value))}

/** Optional transport over the existing Core; no model credentials reach the browser. */
export async function startWebServer(options:Options={}){
  const host=options.host??'127.0.0.1',port=options.port??5151
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid web port')
  const loopback=['127.0.0.1','::1','localhost'].includes(host)
  const configured=options.publicUrl?new URL(options.publicUrl):undefined
  if(configured&&(configured.pathname!=='/'||!['https:','http:'].includes(configured.protocol)||configured.username||configured.password))throw Error('Public URL must be an HTTP(S) origin, without credentials or a path')
  if(!loopback&&(!configured||configured.protocol!=='https:'&&!options.allowInsecure))throw Error('Remote listening requires --public-url https://… behind TLS; HTTP requires explicit --allow-insecure for a private test network')
  let origin=configured?.origin??''
  const auth=createWebAuth(configured?.protocol==='https:')
  const renderer=options.renderer??rendererDirectory()
  const peers=new Map<string,{socket:WebSocket;session:WebSession;context:RequestContext}>()
  const pending=new Map<string,{clientId:string;resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>()
  const grants=new Map<string,{session:WebSession;url:URL;plugin:string;workspace:string;clientId?:string}>()
  const desktops=createDesktopRelay(session=>auth.valid(session))
  const mediaSessions=new Map<string,{session:WebSession;context:RequestContext}>()
  const requests=new Map<string,{signature:string;reply:Promise<unknown>;at:number}>()
  const sockets=new Set<net.Socket>()
  // Revocation must close already-open HTTP streams as well as future requests.
  const streams=new Set<{valid:()=>boolean;close:()=>void}>()
  function trackStream(response:http.ServerResponse,valid:()=>boolean,close:()=>void){
    const stream={valid,close};streams.add(stream)
    response.once('close',()=>{streams.delete(stream);close()})
    return stream
  }
  function pruneStreams(){desktops.prune();for(const stream of streams)if(!stream.valid()){streams.delete(stream);stream.close()}}
  function pipeAuthorized(source:Readable,response:http.ServerResponse,valid:()=>boolean){
    source.on('data',chunk=>{
      if(response.destroyed||response.writableEnded||!valid()){source.destroy();response.end();return}
      if(!response.write(chunk)){source.pause();response.once('drain',()=>source.resume())}
    })
    source.once('end',()=>response.end());source.once('error',()=>response.destroy())
  }
  function checkOrigin(req:http.IncomingMessage,required=false){
    if(String(req.headers.host??'').toLowerCase()!==new URL(origin).host.toLowerCase())throw failure('Untrusted Host header',403)
    const value=req.headers.origin
    if(required&&!value||value&&value!==origin)throw failure('Untrusted request origin',403)
  }
  const projectPluginView=(value:any,session?:WebSession):any=>{
    if(!value||typeof value!=='object')return value
    if(Array.isArray(value))return value.map(item=>projectPluginView(item,session))
    if(typeof value.url==='string'&&typeof value.id==='string'&&value.plugin){
      const url=new URL(value.url)
      if(url.hostname!=='127.0.0.1'||url.pathname.split('/')[1]!==value.id)throw Error('Invalid internal plugin view')
      if(session)grants.set(value.id,{session,url,plugin:String(value.plugin),workspace:String(value.workspace),clientId:value.clientId})
      return {...value,attached:true,url:origin+url.pathname+url.search}
    }
    return value
  }
  const ask=(op:string,args:Record<string,unknown>={},timeout=12000)=>{
    const clientId=requestContext().clientId,peer=clientId?peers.get(clientId):undefined
    if(!clientId||!peer||peer.socket.readyState!==WebSocket.OPEN)throw failure('No connected browser for this client',409,'CLIENT_UNAVAILABLE')
    const id=randomUUID()
    return new Promise<any>((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(failure('The browser did not acknowledge '+op,409,'CLIENT_TIMEOUT'))},timeout)
      pending.set(id,{clientId,resolve,reject,timer});peer.socket.send(JSON.stringify({type:'ui:request',id,op,args}))
    })
  }
  setUiHandler((op,args)=>ask(op,args))
  setPluginWindowDriver({
    async present(){},place(){},mode(){},
    async close(state){
      const peer=state.clientId?peers.get(state.clientId):undefined
      if(peer&&peer.socket.readyState===WebSocket.OPEN)await withCaller(peer.context,()=>ask('flush'))
    }
  })

  setViewGuard(async()=>{if(requestContext().clientId&&peers.has(requestContext().clientId!))await ask('flush')})
  const server=http.createServer(async(req,res)=>{
    res.setHeader('referrer-policy','no-referrer')
    try{
      const url=new URL(req.url??'/',origin),pluginId=url.pathname.split('/')[1]
      // An opaque-origin iframe owns a view-scoped capability, never a Core cookie.
      const grant=grants.get(pluginId)
      if(grant){
        if(String(req.headers.host??'').toLowerCase()!==new URL(origin).host.toLowerCase())throw failure('Untrusted Host header',403)
        if(!auth.valid(grant.session))throw failure('Plugin view expired; reopen it',401)
        if(req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!=='null')throw failure('Invalid plugin origin',403)
        if(!['GET','HEAD','POST','OPTIONS'].includes(req.method??''))throw failure('Unsupported method',405)
        if(req.method==='POST')throw failure('Plugin RPC requires the authenticated parent Core channel',403)
        res.setHeader('access-control-allow-origin',req.headers.origin??origin)
        res.setHeader('vary','Origin');res.setHeader('access-control-allow-methods','GET, HEAD, POST, OPTIONS')
        res.setHeader('access-control-allow-headers','content-type')
        if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
        if(url.pathname===`/${pluginId}/_agents-bridge.js`){res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'});res.end(pluginBridge(pluginId));return}
        const bridgePage=req.method==='GET'&&url.pathname===grant.url.pathname
        const proxy=http.request({hostname:'127.0.0.1',port:grant.url.port,path:url.pathname+url.search,method:req.method,headers:{'content-type':req.headers['content-type']??'application/json',...(req.headers.range?{range:req.headers.range}:{}),...(req.headers['content-length']?{'content-length':req.headers['content-length']}: {})}},upstream=>{
          res.statusCode=upstream.statusCode??502
          for(const key of ['content-type','content-length','content-range','accept-ranges','cache-control','content-disposition'])if(upstream.headers[key]&&!(bridgePage&&key==='content-length'))res.setHeader(key,upstream.headers[key]!)
          res.setHeader('x-content-type-options','nosniff')
          res.setHeader('content-security-policy',"sandbox allow-scripts allow-forms allow-downloads; frame-ancestors 'self'")
          if(bridgePage){
            const chunks:Buffer[]=[];let bytes=0
            upstream.on('data',chunk=>{bytes+=chunk.length;if(bytes>16*1024*1024||!auth.valid(grant.session)){upstream.destroy();res.destroy();return}chunks.push(Buffer.from(chunk))})
            upstream.once('end',()=>{
              if(!auth.valid(grant.session)){res.destroy();return}
              const html=Buffer.concat(chunks).toString('utf8'),bridge='<script src="./_agents-bridge.js"></script>'
              res.end(/<head(?:\s[^>]*)?>/i.test(html)?html.replace(/<head(?:\s[^>]*)?>/i,head=>head+bridge):html.replace(/^(<!doctype[^>]*>)?/i,prefix=>prefix+bridge))
            })
            upstream.once('error',()=>res.destroy())
          }else pipeAuthorized(upstream,res,()=>auth.valid(grant.session))
        })
        proxy.on('error',()=>{if(!res.headersSent)json(res,{ok:false,error:'Plugin service unavailable'},502);else res.destroy()})
        trackStream(res,()=>auth.valid(grant.session),()=>{proxy.destroy();res.end()});req.pipe(proxy);return
      }
      checkOrigin(req,req.method==='POST'&&!req.headers.authorization)
      if(url.pathname==='/api/login'&&req.method==='POST'){const data=await body(req,4096);json(res,{ok:true,data:auth.login(req,res,data.token)});return}
      if(url.pathname==='/api/bootstrap'&&req.method==='GET'){const session=auth.session(req);json(res,{ok:true,data:{csrf:session.csrf,expires:session.expires,server:runtimeInfo()}});return}
      if(url.pathname==='/api/health'){json(res,{ok:true,data:{service:'agents-company',apiVersion:1}});return}
      if(url.pathname.startsWith('/api/')){
        const requestId=String(req.headers['x-request-id']??randomUUID())
        if(!/^[\w-]{1,100}$/.test(requestId))throw failure('Invalid request ID')
        if((url.pathname==='/api/download'||url.pathname.startsWith('/api/media/'))&&['GET','HEAD'].includes(req.method??''))req.headers['x-agents-client']=url.searchParams.get('client')??''
        const current=auth.context(req,requestId)
        if(url.pathname.startsWith('/api/media/')){
          const id=url.pathname.slice('/api/media/'.length),grant=mediaSessions.get(id)
          if(current.session&&grant?.session!==current.session)throw failure('Media preview does not belong to this browser session',403)
          const valid=()=>mediaAvailable(id)&&(!current.session||auth.valid(current.session)&&mediaSessions.get(id)?.session===current.session)
          const response=await mediaResponse({method:req.method??'GET',headers:new Headers(req.headers.range?{range:req.headers.range}:{})},id,(cmd,args)=>handleRequest({cmd,args},current.context),valid)
          res.setHeader('cross-origin-resource-policy','same-origin');res.writeHead(response.status,Object.fromEntries(response.headers))
          if(!response.body){res.end();return}
          const source=NodeReadable.fromWeb(response.body as any);trackStream(res,valid,()=>{source.destroy();res.end()});pipeAuthorized(source,res,valid);return
        }
        if(url.pathname==='/api/download'&&req.method==='GET'){
          if(current.context.principal.kind!=='operator')throw failure('Only the user may download a file',403)
          let from:any;try{from=JSON.parse(url.searchParams.get('from')??'null')}catch{throw failure('Invalid download source')}
          const info=await handleRequest({cmd:'transfer.download-info',args:{from}},current.context)
          const name=info.name??(String(from?.path??'download').split(/[\\/]/).pop()||'download')
          res.writeHead(200,{'content-type':'application/octet-stream','content-length':String(info.bytes),'cache-control':'no-store','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name),'x-content-type-options':'nosniff'})
          let stopped=false;res.on('close',()=>{stopped=true})
          for(let offset=0;offset<info.bytes&&!stopped;){
            if(current.session&&!auth.valid(current.session))throw failure('Login expired during download',401)
            const chunk=await handleRequest({cmd:'transfer.download-chunk',args:{from,offset,modifiedAt:info.modifiedAt}},current.context)
            const bytes=Buffer.from(chunk.data,'base64')
            if(!bytes.length)throw Error('File ended before the advertised size')
            offset+=bytes.length
            if(!res.write(bytes))await new Promise<void>(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve()};res.once('drain',done);res.once('close',done)})
          }
          res.end();return
        }

        if(url.pathname==='/api/logout'&&req.method==='POST'){
          const id=auth.logout(req,res);for(const [key,grant] of mediaSessions)if(grant.session.id===id){withCaller(grant.context,()=>{try{closeMedia(key)}catch{}});mediaSessions.delete(key)};for(const peer of peers.values())if(peer.session.id===id)peer.socket.close(4001,'Signed out');pruneStreams();json(res,{ok:true});return
        }
        if(url.pathname!=='/api/rpc'&&url.pathname!=='/api/follow'||req.method!=='POST')throw failure('Unknown endpoint',404)
        const value=await body(req,64*1024*1024),request:Request={cmd:value.cmd,args:value.args,...(Object.hasOwn(value,'engineScope')?{engineScope:value.engineScope}:{})}
        if(typeof request.cmd!=='string'||!request.cmd||request.args!==undefined&&(!request.args||Array.isArray(request.args)||typeof request.args!=='object'))throw failure('Invalid Core request')
        const pluginView=request.cmd==='plugin.call'&&request.args?.viewId?grants.get(String(request.args.viewId)):undefined
        if(request.cmd==='plugin.call'&&request.args?.viewId&&(!pluginView||pluginView.session!==current.session||pluginView.clientId!==current.context.clientId||pluginView.plugin!==request.args.id||pluginView.workspace!==request.args.workspace||!pluginWindows().some(view=>view.id===request.args!.viewId)))throw failure('Plugin view does not belong to this authenticated client',403)
        if(url.pathname==='/api/follow'){
          if(request.cmd!=='session.follow')throw failure('Only session.follow is allowed here')
          const followContext=engineRequestContext(request,current.context),followRequest={...request,...(followContext.engineScope!==undefined?{engineScope:followContext.engineScope}:{})}
          const token=req.headers.authorization?.replace(/^Bearer /,'')??fs.readFileSync(path.join(APP_HOME,'control.token'),'utf8').trim()
          const upstream=net.connect(SOCKET_PATH)
          const valid=()=>{try{if(current.session)return auth.valid(current.session)&&withCaller(current.context,()=>(getView().engineId??null)===followContext.engineScope);authenticate(token);return true}catch{return false}}
          trackStream(res,valid,()=>{upstream.destroy();res.end()})
          upstream.once('connect',()=>{
            if(!valid()){upstream.destroy();json(res,{ok:false,error:'Authentication expired'},401);return}
            res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store'})
            upstream.write(JSON.stringify({...followRequest,auth:token})+'\n')
            pipeAuthorized(upstream,res,valid)
          })
          upstream.on('error',()=>{if(!res.headersSent)json(res,{ok:false,error:'Core unavailable'},503);else res.end()});return
        }
        const key=(current.session?.id??createHash('sha256').update(req.headers.authorization??'').digest('hex'))+':'+requestId
        // Core's durable receipt rechecks live queues and current authority on every retry.
        const coreReceipt=request.cmd==='messenger.forward'||['session.send','session.enqueue'].includes(request.cmd)&&request.args?.clientMessageId!==undefined
        const signature=createHash('sha256').update(JSON.stringify(request)).digest('hex'),previous=requests.get(key)
        if(previous&&previous.signature!==signature)throw failure('Request ID was reused for a different operation',409)
        for(const [id,item] of requests)if(item.at&&Date.now()-item.at>60000)requests.delete(id)
        if(!coreReceipt&&!previous&&requests.size>=512)throw failure('Too many pending requests',429)
        const reply=(!coreReceipt?previous?.reply:undefined)??handleRequest(request,current.context)
        if(!coreReceipt&&!previous){const item={signature,reply,at:0};requests.set(key,item);void reply.then(()=>{item.at=Date.now()},()=>{item.at=Date.now()})}
        try{const result=await reply;if(request.cmd==='messenger.media-open'&&current.session)mediaSessions.set(result.id,{session:current.session,context:current.context});if(request.cmd==='messenger.media-close')mediaSessions.delete(String(request.args?.id));const projected=pluginView?.plugin==='cloud-hosts'?desktops.project(result,String(request.args!.viewId),pluginView.session,origin):result;json(res,{ok:true,data:['plugin.open','plugin.windows','plugin.place','plugin.mode','plugin.view'].includes(request.cmd)?projectPluginView(projected,current.session??peers.get(current.context.clientId??'')?.session):projected})}finally{
          // Only mutation responses need replay protection; large transcript reads are not retained.
          if(/\.(list|get|posts|post|sources|collectors|info|snapshot|transcript|layout|read|read-state|timeline|context|image|status|forward-status|activity|models|describe|docs|roles|view|queue|history|gallery|search|media-info|media-read|download-chunk)$/.test(request.cmd))requests.delete(key)
          if(['plugin.dismiss','plugin.close'].includes(request.cmd)){const id=String(request.args?.id);grants.delete(id);desktops.revokeView(id)}
        }
        return
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw failure('Method not allowed',405)
      const relative=decodeURIComponent(url.pathname),file=path.resolve(renderer,'.'+(relative==='/'?'/index.html':relative))
      if(file!==path.join(renderer,'index.html')&&!file.startsWith(renderer+path.sep))throw failure('Invalid resource path',403)
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw failure('Resource not found',404)
      const actual=fs.realpathSync(file),base=fs.realpathSync(renderer)
      if(!actual.startsWith(base+path.sep))throw failure('Resource outside renderer',403)
      res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream','cache-control':file.endsWith('index.html')?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"})
      if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res)
    }catch(error){if(!res.headersSent)json(res,{ok:false,error:(error as Error).message,code:(error as any).code??'REQUEST_FAILED'},(error as any).status??400);else res.destroy()}
  })
  server.requestTimeout=30000;server.headersTimeout=10000
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
  const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024})
  server.on('upgrade',(req,socket,head)=>{
    try{
      if(desktops.upgrade(req,socket,head,origin))return
      checkOrigin(req,true);const url=new URL(req.url??'/',origin)
      if(url.pathname!=='/api/events')throw failure('Unknown stream',404)
      const session=auth.session(req),client=String(url.searchParams.get('client')??'')
      if(!/^[a-zA-Z0-9_-]{8,80}$/.test(client))throw failure('Invalid client')
      const context:RequestContext={principal:{kind:'operator'},requestId:randomUUID(),clientId:'web-'+client}
      wss.handleUpgrade(req,socket,head,ws=>{
        const id=context.clientId!,previous=peers.get(id);previous?.socket.close(4000,'Client reconnected')
        const peer={socket:ws,session,context};peers.set(id,peer)
        const send=(data:unknown)=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>8*1024*1024){ws.close(1013,'Resync required');return};ws.send(JSON.stringify(data))}}
        const off=onCoreEvent(event=>{
          if(event.clientId&&event.clientId!==id)return
          if(!auth.valid(session)){ws.close(4001,'Session expired');return}
          const payload=event.channel==='store:changed'?{revision:event.payload?.revision,changes:event.payload?.changes}:event.channel==='plugin:windows'?projectPluginView(event.payload?.filter((v:any)=>(v.clientId??'desktop')===id)??[],session):['session:message','session:codex','session:agent'].includes(event.channel)?{sessionId:event.payload?.sessionId,cardId:event.payload?.cardId}:event.payload
          const visible=presentationEvent(event.channel,payload,id);if(visible)send({type:'event',...visible})
        })
        withCaller(context,()=>{send({type:'event',channel:'view:changed',payload:getView()});const activity=presentationEvent('management:activity',managementActivity(),id);if(activity)send({type:'event',...activity})})
        send({type:'event',channel:'plugin:windows',payload:projectPluginView(pluginWindows().filter(value=>value.clientId===id),session)})
        send({type:'event',channel:'store:changed',payload:{resync:true}})
        ws.on('message',raw=>{try{const answer=JSON.parse(raw.toString()),item=pending.get(answer.id);if(answer.type!=='ui:response'||!item||item.clientId!==id)return;clearTimeout(item.timer);pending.delete(answer.id);answer.error?item.reject(Error(String(answer.error))):item.resolve(answer.data)}catch{ws.close(1008,'Invalid response')}})
        ws.on('close',()=>{off();if(peers.get(id)===peer)peers.delete(id);for(const [key,item] of pending)if(item.clientId===id){clearTimeout(item.timer);pending.delete(key);item.reject(Error('Browser disconnected before acknowledgement'))}})
        ws.on('error',()=>{})
      })
    }catch{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')}
  })
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)})
  const bound=(server.address() as net.AddressInfo).port
  origin=configured?.origin??`http://${host==='::1'?'[::1]':host}:${bound}`
  const heartbeat=setInterval(()=>{pruneStreams();for(const [id,grant] of mediaSessions)if(!auth.valid(grant.session)||!mediaAvailable(id)){withCaller(grant.context,()=>{try{closeMedia(id)}catch{}});mediaSessions.delete(id)};for(const [id,grant] of grants)if(!auth.valid(grant.session))grants.delete(id);for(const peer of peers.values()){if(!auth.valid(peer.session))peer.socket.close(4001,'Session expired');else peer.socket.ping()}},30000);heartbeat.unref()
  return {url:origin,port:bound,async close(){clearInterval(heartbeat);auth.clear();desktops.close();for(const peer of peers.values())peer.socket.terminate();wss.close();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()))}}
}
