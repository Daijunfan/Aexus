import http from 'node:http'
import {randomBytes} from 'node:crypto'
import {DISCUSSION_TOOL,invokeDiscussionTool} from './discussion-tool'
import {DOCUMENTATION_TOOL,invokeDocumentationTool} from './documentation-tool'
import type {Live} from './sessions'

/** Per-session native tools. Discovery is read-only; publication remains bound to its reading stage. */
export async function openDiscussionMcp(state:Live){
 const route='/discussion/'+randomBytes(24).toString('hex')
 const server=http.createServer(async(request,response)=>{
  if(request.method!=='POST'||request.url!==route||request.headers.origin){response.writeHead(403);response.end();return}
  const controller=new AbortController();response.on('close',()=>controller.abort())
  let input:any
  try{
   const chunks:Buffer[]=[];let bytes=0
   for await(const chunk of request){bytes+=chunk.length;if(bytes>16*1024){response.writeHead(413);response.end();return}chunks.push(chunk)}
   input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
   if(input.jsonrpc!=='2.0'||typeof input.method!=='string')throw Error('Invalid discussion tool request')
   if(input.method==='notifications/initialized'){response.writeHead(202);response.end();return}
   let result:unknown
   if(input.method==='initialize')result={protocolVersion:input.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'agents-company-discussion',version:'1'}}
   else if(input.method==='ping')result={}
   else if(input.method==='tools/list')result={tools:[DISCUSSION_TOOL,DOCUMENTATION_TOOL]}
   else if(input.method==='tools/call'){
    try{
     const invoke=input.params?.name===DISCUSSION_TOOL.name?invokeDiscussionTool:input.params?.name===DOCUMENTATION_TOOL.name?invokeDocumentationTool:undefined
     if(!invoke)throw Error('Unknown Agents Company tool')
     if(input.id===undefined)throw Error('Discussion tool calls require a request ID')
     const value=await invoke(state,input.params.arguments,String(input.id),controller.signal)
     result={content:[{type:'text',text:JSON.stringify(value)}]}
    }catch(error){result={isError:true,content:[{type:'text',text:(error as Error).message}]}}
   }else throw Error('Unsupported discussion MCP method')
   response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:input.id,result}))
  }catch(error){if(!response.headersSent){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:input?.id??null,error:{code:-32600,message:(error as Error).message}}))}}
 })
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 let closing:Promise<void>|undefined
 return {url:`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}${route}`,close:()=>closing??=(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})()}
}
