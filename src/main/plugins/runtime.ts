import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { requirePlugin, pluginFile } from './registry'
import { openMailbox } from './mailbox'
import type { PluginDescriptor, PluginFactory, PluginRuntime, PluginRequest, PluginResponse } from '../../shared/plugins'

const requireModule=createRequire(__filename)
const instances=new Map<string,Promise<{plugin:PluginDescriptor;runtime:PluginRuntime}>>()
const views=new Map<string,{server:http.Server;close:()=>Promise<void>}>()
const mailboxes=new Map<string,Promise<()=>void>>()
export async function prepareWorkspacePlugins(workspace:string,pluginId:string) {
  workspace=fs.realpathSync(workspace)
  const plugin=requirePlugin(pluginId)
    const directory=path.join(workspace,'.agents-company','ipc',plugin.id)
    let ancestor=directory;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor)
    if(!fs.realpathSync(ancestor).startsWith(workspace+path.sep))throw new Error('Plugin mailbox escapes workspace')
    if(!mailboxes.has(directory)) {
      const opened=pluginRuntime(plugin.id,workspace).then(({runtime})=>openMailbox(directory,runtime,workspace))
      mailboxes.set(directory,opened);opened.catch(()=>mailboxes.delete(directory))
    }
    await mailboxes.get(directory)
}
export async function releaseWorkspacePlugins(workspace:string) {
  for(const [directory,opened] of mailboxes)if(directory===workspace||directory.startsWith(workspace+path.sep)){(await opened)();mailboxes.delete(directory)}
}
export async function pluginRuntime(id:string,workspace:string) {
  workspace=fs.realpathSync(workspace)
  const plugin=requirePlugin(id),key=`${plugin.directory}:${plugin.version}:${workspace}`
  let instance=instances.get(key)
  if(!instance){instance=(async()=>{
    const factory=requireModule(pluginFile(plugin.directory,plugin.runtime)) as PluginFactory
    if(typeof factory.createPlugin!=='function')throw new Error('Plugin must export createPlugin(context)')
    const core=await factory.createPlugin({workspace,pluginRoot:plugin.directory,executable:process.execPath})
    if(typeof core.request!=='function')throw new Error('Plugin must implement request()')
    const schema=JSON.parse(fs.readFileSync(pluginFile(plugin.directory,plugin.schema),'utf8')),methods=new Set(schema.commands.map((command:{method:string})=>command.method))
    // CLI, renderer HTTP and employee mailboxes all pass through this same boundary.
    const runtime:PluginRuntime={
      request:async request=>methods.has(request.method)?core.request(request):{jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method is not declared in the plugin CLI schema: '+request.method}},
      subscribe:core.subscribe?.bind(core),readAsset:core.readAsset?.bind(core),close:core.close?.bind(core)
    }
    return {plugin,runtime}
  })();instances.set(key,instance);instance.catch(()=>instances.delete(key))}
  return instance
}
export async function callPlugin(id:string,workspace:string,method:string,params:Record<string,unknown>={}) {
  const {runtime}=await pluginRuntime(id,workspace)
  const reply=await runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params})
  if(reply.error)throw new Error(`${reply.error.message} (${reply.error.code})`)
  return reply.result
}
const mime=(file:string)=>({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.map':'application/json'}[path.extname(file)]||'application/octet-stream')
export async function openPluginView(id:string,workspace:string) {
  const {plugin,runtime}=await pluginRuntime(id,workspace)
  const token=randomUUID(),base=`/${token}/`,uiRoot=path.dirname(pluginFile(plugin.directory,plugin.renderer))
  const clients=new Set<http.ServerResponse>(),sockets=new Set<import('node:net').Socket>()
  let unsubscribe:(()=>void)|undefined
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/','http://localhost')
      if(!url.pathname.startsWith(base)){res.writeHead(404);res.end();return}
      const target=decodeURIComponent(url.pathname.slice(base.length))
      if(target==='rpc'&&req.method==='POST') {
        req.setEncoding('utf8')
        let body='';for await(const part of req){body+=part;if(body.length>64*1024*1024)throw new Error('Request too large')}
        const request=JSON.parse(body) as PluginRequest
        if(request.jsonrpc!=='2.0'||typeof request.method!=='string')throw new Error('Invalid JSON RPC request')
        const reply=await runtime.request(request)
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(reply));return
      }
      if(req.method!=='GET'){res.writeHead(405);res.end();return}
      if(target==='events') {
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive'});res.write(': connected\n\n');clients.add(res)
        req.on('close',()=>clients.delete(res));return
      }
      if(target.startsWith('data/')) {
        if(!runtime.readAsset)throw new Error('This plugin has no asset reader')
        const asset=await runtime.readAsset(target.slice(5))
        res.writeHead(200,{'content-type':asset.mimeType,'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});res.end(Buffer.from(asset.bytes));return
      }
      const relative=target||path.basename(plugin.renderer),file=pluginFile(uiRoot,relative)
      res.writeHead(200,{'content-type':mime(file),'cache-control':'no-cache','x-content-type-options':'nosniff'});fs.createReadStream(file).pipe(res)
    }catch(error){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:-32000,message:String((error as Error).message)}}))}
  })
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))})
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  try {unsubscribe=await runtime.subscribe?.(event=>{for(const client of clients)client.write(`data: ${JSON.stringify(event)}\n\n`)})}
  catch(error){server.close();throw error}
  const port=(server.address() as import('node:net').AddressInfo).port
  const close=async()=>{unsubscribe?.();for(const client of clients)client.end();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()))}
  views.set(token,{server,close})
  return {id:token,plugin:plugin.id,name:plugin.name,workspace,url:`http://127.0.0.1:${port}${base}${path.basename(plugin.renderer)}?hosted=1`}
}
export async function closePluginView(id:string) {const view=views.get(id);if(view){views.delete(id);await view.close()}return {closed:true}}
export async function closePlugins() {for(const value of mailboxes.values())try{(await value)()}catch{};mailboxes.clear();for(const id of [...views.keys()])await closePluginView(id);for(const value of instances.values()){try{await (await value).runtime.close?.()}catch{}}instances.clear()}
