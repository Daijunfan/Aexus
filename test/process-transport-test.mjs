import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-process-transport-')),require=createRequire(import.meta.url),relays=[]
let received,upstreamCancelled=false
const upstream=http.createServer(async(req,res)=>{
 let text='';for await(const chunk of req)text+=chunk;received=JSON.parse(text)
 if(received.hold){res.on('close',()=>upstreamCancelled=true);return}
 res.writeHead(received.fail?429:200,{'content-type':'text/event-stream','x-fixture':'preserved'});res.end('data: fixture-response\n\n')
})
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${upstream.address().port}/v1`
try{
 const outfile=path.join(temp,'helpers.cjs')
 await build({stdin:{contents:"export {prepareClineCompatibility,projectClineRequest} from './src/main/engines/cline-compat';export {preparePiTunnel} from './src/main/engines/pi-tunnel'",resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'cjs'})
 const {prepareClineCompatibility,projectClineRequest,preparePiTunnel}=require(outfile)
 const open=async(name,remote)=>{
  const directory=path.join(temp,name),file=path.join(directory,'data/settings/providers.json');fs.mkdirSync(path.dirname(file),{recursive:true})
  fs.writeFileSync(file,JSON.stringify({version:1,providers:{deepseek:{settings:{baseUrl:endpoint,model:'deepseek-flash'}}}}))
  const relay=await prepareClineCompatibility(directory,remote,remote?{tools:[],call:async()=>({content:[]}),close(){}}:undefined);relays.push(relay)
  const url=JSON.parse(fs.readFileSync(file)).providers.deepseek.settings.baseUrl+'/chat/completions'
  return {directory,file,relay,url,post:(body,extra={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),...extra})}
 }
 const local=await open('local'),image={path:'approved.png',mimeType:'image/png',data:'fixture-base64'},attachment=local.relay.stage([image,image])
 const body={model:'deepseek-flash',stream:true,reasoning_effort:'none',messages:[{role:'user',content:'Inspect '+attachment.marker}],tools:[{type:'function',function:{name:'read_files'}}]}
 const response=await local.post(body);assert.equal(await response.text(),'data: fixture-response\n\n');assert.equal(response.headers.get('x-fixture'),'preserved');attachment.verify()
 assert.equal(received.messages[0].content.filter(p=>p.type==='image_url').length,2)
 assert.equal(received.messages[0].content[1].image_url.url,'data:image/png;base64,fixture-base64')
 assert.equal(received.reasoning_effort,'none');assert.equal(received.stream,true);assert.deepEqual(received.tools,body.tools)
 const before=JSON.stringify(received);await local.post(body);assert.equal(JSON.stringify(received),before,'native history references resolve identically on later requests')
 assert.equal((await local.post({...body,fail:true})).status,429,'provider errors are not hidden')
 const unavailable=local.relay.stage([image]);assert.throws(()=>unavailable.verify(),/did not deliver/)
 assert.throws(()=>projectClineRequest({messages:[{role:'user',content:'[agents-company-image:00000000-0000-0000-0000-000000000000]'}]},path.join(local.directory,'company-images')),/missing/)
 assert.equal((await fetch(local.url)).status,403);assert.equal((await local.post(body,{headers:{Origin:'http://untrusted.example'}})).status,403)
 const controller=new AbortController(),held=local.post({hold:true},{signal:controller.signal});void held.catch(()=>{})
 for(let i=0;i<50&&!received.hold;i++)await new Promise(r=>setTimeout(r,10));controller.abort();await assert.rejects(held)
 for(let i=0;i<50&&!upstreamCancelled;i++)await new Promise(r=>setTimeout(r,10));assert.ok(upstreamCancelled,'closing native request cancels upstream')
 await local.relay.close();assert.equal(JSON.parse(fs.readFileSync(local.file)).providers.deepseek.settings.baseUrl,endpoint);assert.equal(JSON.parse(fs.readFileSync(local.file)).providers.deepseek.settings.model,'deepseek-flash')
 const reopened=await prepareClineCompatibility(local.directory);relays.push(reopened)
 const reopenedUrl=JSON.parse(fs.readFileSync(local.file)).providers.deepseek.settings.baseUrl+'/chat/completions'
 await fetch(reopenedUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(received.messages[0].content[1].image_url.url,'data:image/png;base64,fixture-base64')
 const launch={cwd:temp,args:[],server:{command:'fixture',args:[]},instructions:'Cloud workspace'},cloud=await open('cloud',launch)
 await cloud.post({messages:[],tools:[{function:{name:'read_files'}},{function:{name:'tunnel__execute'}},{function:{name:'spawn_agent'}}]})
 assert.deepEqual(received.tools,[{function:{name:'tunnel__execute'}}])
 const tools=[{name:'read_file',description:'Read remote file',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}}]
 const events={},registered=[],api={registerTool:t=>registered.push(t),on:(e,h)=>events[e]=h,setActiveTools:n=>{api.active=n}}
 const extension=(await import(pathToFileURL(preparePiTunnel(temp,tools)))).default;extension(api);events.session_start()
 assert.deepEqual(api.active,['tunnel__read_file']);assert.equal(events.tool_call({toolName:'bash'}).block,true)
 let forwarded
 const result=await registered[0].execute('id',{path:'remote.txt'},new AbortController().signal,null,{ui:{input:async(title,placeholder)=>{forwarded={title,...JSON.parse(placeholder)};return JSON.stringify({content:[{type:'text',text:'remote bytes'}]})}}})
 assert.equal(forwarded.title,'Agents Company Tunnel');assert.equal(forwarded.toolName,'tunnel__read_file');assert.equal(forwarded.toolCallId,'id');assert.equal(result.content[0].text,'remote bytes')
 console.log('PASS Cline compatibility transport: actual image bytes, native resume, unchanged thinking/stream/errors, private route, cancellation and cloud tool filtering; Pi extension/Core bridge')
}finally{for(const relay of relays)await relay.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
