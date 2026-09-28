import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import {randomUUID} from 'node:crypto'
import type {ImageInput} from '../../shared/types'
import type {RemoteLaunch} from '../tunnel'

export type ClineMcpBridge={tools:{name:string;description:string;inputSchema:Record<string,unknown>}[];call:(name:string,args:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>;close:()=>void}

const cloudTools=['execute','read_file','write_file','edit_file','list_files'].map(name=>'tunnel__'+name)
const readJson=(file:string)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{}
const writeJson=(file:string,value:unknown)=>{const temporary=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,file)}

/** Cline 3.0.65 ACP discards images. Project only approved attachment references
 * into the native Chat Completions request; preserve every other model field. */
export function projectClineRequest(body:any,directory:string,remote=false){
  for(const message of body.messages??[]){
    if(message.role!=='user')continue
    const parts=typeof message.content==='string'?[{type:'text',text:message.content}]:message.content
    if(!Array.isArray(parts))continue
    let changed=false
    const content=parts.flatMap((part:any)=>{
      if(part.type!=='text'||typeof part.text!=='string')return [part]
      const images:any[]=[]
      const text=part.text.replace(/\[agents-company-image:([a-f0-9-]{36})\]/g,(_marker:string,id:string)=>{
        const attachment=readJson(path.join(directory,id+'.json'))
        if(!Array.isArray(attachment)||!attachment.length||attachment.length>16)throw Error('Cline image attachment is missing or invalid')
        for(const image of attachment){
          if(!['image/png','image/jpeg','image/gif','image/webp'].includes(image.mimeType)||typeof image.data!=='string')throw Error('Invalid Cline image content')
          images.push({type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data}`}})
        }
        fs.writeFileSync(path.join(directory,id+'.applied'),'',{mode:0o600});changed=true
        return '[Attached image]'
      })
      return [{...part,text},...images]
    })
    if(changed)message.content=content
  }
  if(remote&&Array.isArray(body.tools))body.tools=body.tools.filter((tool:any)=>cloudTools.includes(tool.function?.name))
  return body
}

/** Employee-local compatibility relay. No extra inference, binary patch, global
 * Cline configuration, external proxy service, credentials in URLs, or workspace file reads.
 * The random loopback route is private; only the configured provider is reachable. */
export async function prepareClineCompatibility(directory:string,remote?:RemoteLaunch,bridge?:ClineMcpBridge){
  if(remote&&!bridge)throw Error('Cloud Cline requires the Core-owned Tunnel transport')
  const images=path.join(directory,'company-images'),settings=path.join(directory,'data','settings')
  fs.mkdirSync(images,{recursive:true,mode:0o700});fs.mkdirSync(settings,{recursive:true,mode:0o700})
  const file=path.join(settings,'providers.json'),upstreamFile=path.join(directory,'company-upstream.json')
  const config=readJson(file),provider=config.providers?.deepseek?.settings??{}
  const prior=typeof provider.baseUrl==='string'&&!provider.baseUrl.includes('/agents-company-relay/')?provider.baseUrl:readJson(upstreamFile).baseUrl
  const target=new URL(prior||'https://api.deepseek.com')
  // The application supports the official provider. Loopback is for deterministic native tests.
  if(target.username||target.password||target.search||target.hash||!(target.protocol==='https:'&&target.hostname==='api.deepseek.com'||target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)))throw Error('Unsupported Cline provider endpoint')
  const prefix='/agents-company-relay/'+randomUUID(),active=new Set<http.ClientRequest>(),mcpRequests=new Map<unknown,AbortController>()
  const server=http.createServer(async(request,response)=>{
    const mcp=!!bridge&&request.url===prefix+'/mcp'
    if(request.headers.origin||request.method!=='POST'||request.url!==prefix+'/chat/completions'&&!mcp){
      response.writeHead(403);response.end();return
    }
    let upstream:http.ClientRequest|undefined
    const cancel=()=>{if(!response.writableEnded)upstream?.destroy()}
    response.on('close',cancel)
    try{
      let bytes=0;const chunks:Buffer[]=[]
      for await(const chunk of request){bytes+=chunk.length;if(bytes>256*1024*1024)throw Error('Cline request exceeds the local transport limit');chunks.push(chunk)}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if(mcp){
        let result:unknown,controller:AbortController|undefined
        try{
          if(input.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'tunnel',version:'1'},instructions:remote?.instructions}
          else if(input.method==='tools/list')result={tools:bridge!.tools}
          else if(input.method==='ping'||input.method==='notifications/initialized')result={}
          else if(input.method==='notifications/cancelled'){mcpRequests.get(input.params?.requestId)?.abort();result={}}
          else if(input.method==='tools/call'){
            controller=new AbortController();mcpRequests.set(input.id,controller)
            response.once('close',()=>{if(!response.writableEnded)controller!.abort()})
            result=await bridge!.call(input.params.name,input.params.arguments??{},controller.signal)
          }else throw Error('Unsupported Tunnel MCP method')
          response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:input.id,result}))
        }catch(error){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:input.id,error:{code:-32000,message:error instanceof Error?error.message:'Tunnel request failed'}}))}
        finally{if(controller&&mcpRequests.get(input.id)===controller)mcpRequests.delete(input.id)}
        return
      }
      const body=projectClineRequest(input,images,!!remote)
      const payload=Buffer.from(JSON.stringify(body)),url=new URL(target.toString().replace(/\/$/,'')+'/chat/completions')
      const headers={...request.headers,host:url.host,'content-length':String(payload.length),'content-type':'application/json','accept-encoding':'identity'}
      delete headers.connection;delete headers['transfer-encoding']
      upstream=(url.protocol==='https:'?https:http).request(url,{method:'POST',headers},result=>{
        response.writeHead(result.statusCode??502,result.headers);result.pipe(response)
        result.on('error',()=>response.destroy())
      })
      active.add(upstream);upstream.once('close',()=>active.delete(upstream!))
      upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'content-type':'application/json'});if(!response.destroyed)response.end(JSON.stringify({error:{message:'Cline provider connection failed'}}))})
      upstream.end(payload)
    }catch(error){if(!response.headersSent)response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:error instanceof Error?error.message:'Invalid Cline request'}}))}
  })
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const baseUrl=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}${prefix}`
  const mcpServer=remote?{command:remote.server.command,args:[path.join(directory,'company-mcp.py')]}:undefined
  try{
    writeJson(upstreamFile,{baseUrl:target.toString().replace(/\/$/,'')})
    config.version??=1;config.providers??={};config.providers.deepseek??={};config.providers.deepseek.settings={...provider,provider:'deepseek',baseUrl}
    writeJson(file,config)
    if(remote){
      // The stdio shim only transports MCP JSON to this employee's Core route.
      // SSH and cancellation remain owned by Core, not the native Cline process.
      fs.writeFileSync(mcpServer!.args[0],`import sys,json,urllib.request,threading,concurrent.futures
url=${JSON.stringify(baseUrl+'/mcp')}
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
lock=threading.Lock()
def invoke(message):
 try:
  request=urllib.request.Request(url,json.dumps(message).encode('utf-8'),{'Content-Type':'application/json'})
  with opener.open(request,timeout=620) as response: result=json.load(response)
 except Exception:
  result={'jsonrpc':'2.0','id':message.get('id'),'error':{'code':-32000,'message':'Core Tunnel connection closed; local execution is disabled'}}
 if 'id' in message:
  with lock: print(json.dumps(result),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
 for line in sys.stdin:
  if line.strip(): executor.submit(invoke,json.loads(line))
`,{mode:0o600})
      writeJson(path.join(settings,'cline_mcp_settings.json'),{mcpServers:{tunnel:mcpServer}})
      writeJson(path.join(settings,'global-settings.json'),{autoUpdateEnabled:false,telemetryOptOut:true,disabledTools:['read_files','search_codebase','run_commands','fetch_web_content','apply_patch','editor','skills','spawn_agent'],tools:{web_search:{enabled:false}}})
    }
  }catch(error){server.closeAllConnections();server.close();throw error}
  let closing:Promise<void>|undefined
  return {
    mcpServer,
    stage(input:ImageInput[]){
      if(!input.length)return undefined
      const id=randomUUID();writeJson(path.join(images,id+'.json'),input.map(({mimeType,data})=>({mimeType,data})))
      return {marker:`[agents-company-image:${id}]`,verify(){if(!fs.existsSync(path.join(images,id+'.applied')))throw Error('Cline did not deliver the image to its provider request')}}
    },
    close(){return closing??=(async()=>{
      for(const controller of mcpRequests.values())controller.abort()
      bridge?.close()
      for(const request of active)request.destroy()
      server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))
      // Preserve model/other native settings written while the session was running.
      if(fs.existsSync(file)){const current=readJson(file);if(current.providers?.deepseek?.settings?.baseUrl===baseUrl){current.providers.deepseek.settings.baseUrl=target.toString().replace(/\/$/,'');writeJson(file,current)}}
    })()}
  }
}
