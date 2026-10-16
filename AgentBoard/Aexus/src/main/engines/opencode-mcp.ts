import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {randomUUID} from 'node:crypto'
import type {RemoteLaunch} from '../tunnel'

export type OpenCodeMcpBridge={tools:{name:string;description:string;inputSchema:Record<string,unknown>}[];call:(name:string,args:Record<string,unknown>,signal:AbortSignal,callId?:string)=>Promise<unknown>;close:()=>void}

/** Employee-local stdio-to-loopback MCP transport for the OpenCode ACP `mcpServers`.
 * OpenCode always runs on Core, so the same Node shim serves both local and cloud
 * workspaces; cloud file operations are owned by Core through the tunnel bridge. */
export async function prepareOpenCodeMcpBridge(directory:string,remote:RemoteLaunch|undefined,bridge:OpenCodeMcpBridge){
  const prefix='/agents-company-opencode-mcp/'+randomUUID(),mcpRequests=new Map<unknown,AbortController>()
  const server=http.createServer(async(request,response)=>{
    if(request.headers.origin||request.method!=='POST'||request.url!==prefix+'/mcp'){
      response.writeHead(403);response.end();return
    }
    try{
      let bytes=0;const chunks:Buffer[]=[]
      for await(const chunk of request){bytes+=chunk.length;if(bytes>64*1024*1024)throw Error('OpenCode MCP request exceeds the local transport limit');chunks.push(chunk)}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
      let result:unknown,controller:AbortController|undefined
      try{
        if(input.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'tunnel',version:'1'},instructions:remote?.instructions}
        else if(input.method==='tools/list')result={tools:bridge.tools}
        else if(input.method==='ping'||input.method==='notifications/initialized')result={}
        else if(input.method==='notifications/cancelled'){mcpRequests.get(input.params?.requestId)?.abort();result={}}
        else if(input.method==='tools/call'){
          if(input.id===undefined)throw Error('MCP tool calls require a request ID')
          controller=new AbortController();mcpRequests.set(input.id,controller)
          response.once('close',()=>{if(!response.writableEnded)controller!.abort()})
          result=await bridge.call(input.params.name,input.params.arguments??{},controller.signal,String(input.id))
        }else throw Error('Unsupported Tunnel MCP method')
        response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:input.id,result}))
      }catch(error){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:input.id,error:{code:-32000,message:error instanceof Error?error.message:'Tunnel request failed'}}))}
      finally{if(controller&&mcpRequests.get(input.id)===controller)mcpRequests.delete(input.id)}
    }catch(error){if(!response.headersSent)response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:error instanceof Error?error.message:'Invalid OpenCode MCP request'}}))}
  })
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const baseUrl=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}${prefix}`
  const shim=path.join(directory,'company-opencode-mcp.cjs')
  fs.writeFileSync(shim,`const http=require('node:http'),readline=require('node:readline');const url=${JSON.stringify(baseUrl+'/mcp')};readline.createInterface({input:process.stdin}).on('line',line=>{let message;try{message=JSON.parse(line)}catch{return}const request=http.request(url,{method:'POST',headers:{'content-type':'application/json'}},response=>{let data='';response.setEncoding('utf8');response.on('data',chunk=>data+=chunk);response.on('end',()=>{if(message.id!==undefined)process.stdout.write(data+'\\n')})});request.on('error',()=>{if(message.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32000,message:'Core Tunnel connection closed; local execution is disabled'}})+'\\n')});request.end(JSON.stringify(message))});\n`,{mode:0o600})
  const mcpServer={command:process.execPath,args:[shim],env:{ELECTRON_RUN_AS_NODE:'1'}}
  let closing:Promise<void>|undefined
  return {
    mcpServer,
    close(){return closing??=(async()=>{for(const controller of mcpRequests.values())controller.abort();bridge.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})()}
  }
}
