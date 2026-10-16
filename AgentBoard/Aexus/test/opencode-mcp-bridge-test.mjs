// OpenCode ACP is exercised through a stub binary that records `session/new` params and
// drives the real Core-owned MCP bridge. No DeepSeek calls, no native OpenCode install,
// no real host changes: the employee documentation/API tools run against the real Core.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-opencode-mcp-')))
const nativeHome=path.join(temp,'native-home'),resultsFile=path.join(temp,'opencode-results.json')
fs.mkdirSync(path.join(nativeHome,'.config','opencode'),{recursive:true});fs.mkdirSync(path.join(nativeHome,'.local','share','opencode'),{recursive:true})
// Native reuse reads the same two files the CLI/IDE read; the fake key never leaves this temp home.
fs.writeFileSync(path.join(nativeHome,'.config','opencode','opencode.json'),JSON.stringify({model:'deepseek/deepseek-v4-pro',small_model:'deepseek/deepseek-flash'}))
fs.writeFileSync(path.join(nativeHome,'.local','share','opencode','auth.json'),JSON.stringify({deepseek:{type:'api',key:'sk-test-fake-key'}}))
const stubPath=path.join(temp,'opencode-stub'),entry=path.join(temp,'daemon.cjs')
const stub=`#!/usr/bin/env node
const readline=require('node:readline'),{spawn}=require('node:child_process'),fs=require('node:fs')
const CONFIG_OPTIONS=[
 {id:'model',options:[{value:'deepseek/deepseek-v4-pro',name:'DeepSeek V4 Pro'},{value:'deepseek/deepseek-flash',name:'DeepSeek Flash'}],currentValue:'deepseek/deepseek-v4-pro'},
 {id:'effort',options:[{value:'low'},{value:'high'},{value:'max'},{value:'default'}],currentValue:'default'},
 {id:'mode',options:[{value:'build'},{value:'plan'}],currentValue:'build'}
]
let seq=0,promptCount=0,mcpSeq=0,mcpShim=null
const mcpPending=new Map(),permissionPending=new Map()
let recordedMCP=null,results={prompts:0,promptBlocks:[],mcpServers:null,tools:null,permission:[],identity:null,index:null,api:null}
const write=()=>{if(process.env.AGENTS_TEST_RESULTS)fs.writeFileSync(process.env.AGENTS_TEST_RESULTS,JSON.stringify(results))}
const fail=e=>{results.error=String(e&&e.message||e);write();throw e}
function send(o){process.stdout.write(JSON.stringify(o)+'\\n')}
function mcpRequest(method,params){return new Promise((resolve,reject)=>{const id=++mcpSeq;mcpPending.set(id,{resolve,reject});mcpShim.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\\n')})}
async function mcpInit(){
 await mcpRequest('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'opencode-test-stub',version:'1'}})
 mcpShim.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',params:{}})+'\\n')
 const list=await mcpRequest('tools/list',{});results.tools=list.tools.map(t=>t.name);return list
}
async function mcpCall(name,args){return mcpRequest('tools/call',{name,arguments:args})}
function permission(toolCallId,title,kind,rawInput){
 const id=++seq
 return new Promise((resolve,reject)=>{
  permissionPending.set(id,{resolve,reject})
  send({jsonrpc:'2.0',id,method:'session/request_permission',params:{
   sessionId:'oc-session',
   toolCall:{toolCallId,title,kind,rawInput},
   options:[{optionId:'allow_once',kind:'allow_once'},{optionId:'reject_once',kind:'reject_once'}]
  }})
 })
}
async function turn(params){
 promptCount++;results.prompts=promptCount;results.promptBlocks.push(params&&params.prompt)
 if(promptCount===1){
  if(!Array.isArray(recordedMCP)||recordedMCP.length!==1)fail(new Error('expected one tunnel MCP server, got '+JSON.stringify(recordedMCP)))
  const s=recordedMCP[0]
  if(s.name!=='tunnel'||!s.command||!Array.isArray(s.args)||s.args.length!==1||!Array.isArray(s.env))fail(new Error('unexpected mcpServers shape: '+JSON.stringify(s)))
  mcpShim=spawn(s.command,s.args,{env:{...process.env,...Object.fromEntries((s.env||[]).map(e=>[e.name,e.value]))},stdio:['pipe','pipe','pipe']})
  const rl=readline.createInterface({input:mcpShim.stdout})
  rl.on('line',line=>{let m;try{m=JSON.parse(line)}catch{return}if(m.id!==undefined&&mcpPending.has(m.id)){const p=mcpPending.get(m.id);mcpPending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}})
  mcpShim.on('error',e=>{for(const p of mcpPending.values())p.reject(e)})
  await mcpInit()
  for(const t of ['agents_company_documentation','agents_company_api','agents_company_discussion_post'])if(!results.tools.includes(t))fail(new Error('missing '+t+' in '+JSON.stringify(results.tools)))
  const p1=await permission('tool-doc-1','mcp__tunnel__agents_company_documentation','mcp',{operation:'identity'});results.permission.push(p1)
  if(!(p1&&p1.outcome&&p1.outcome.outcome==='selected'&&p1.outcome.optionId==='allow_once'))fail(new Error('identity permission not allowed: '+JSON.stringify(p1)))
  const identity=await mcpCall('agents_company_documentation',{operation:'identity'});results.identity=identity
  const idText=identity&&identity.content&&identity.content[0]&&identity.content[0].text
  if(typeof idText!=='string'||!idText.includes('employee'))fail(new Error('identity missing employee: '+idText))
  const p2=await permission('tool-doc-2','tunnel__agents_company_documentation','mcp',{operation:'index'});results.permission.push(p2)
  if(!(p2&&p2.outcome&&p2.outcome.outcome==='selected'))fail(new Error('index permission not allowed'))
  const index=await mcpCall('agents_company_documentation',{operation:'index'});results.index=index
  const idxText=index&&index.content&&index.content[0]&&index.content[0].text
  if(typeof idxText!=='string'||!idxText.includes('API'))fail(new Error('index missing API'))
  send({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'OK'}}}})
 }else if(promptCount===2){
  const p3=await permission('tool-api','tunnel__agents_company_api','mcp',{command:'workspace.catalog',args:{}});results.permission.push(p3)
  if(!(p3&&p3.outcome&&p3.outcome.outcome==='selected'))fail(new Error('api permission not allowed: '+JSON.stringify(p3)))
  const api=await mcpCall('agents_company_api',{command:'workspace.catalog',args:{}});results.api=api
  const apiText=api&&api.content&&api.content[0]&&api.content[0].text
  let parsed;try{parsed=JSON.parse(apiText)}catch{parsed=null}
  if(!parsed||parsed.ok!==true)fail(new Error('api tool did not return ok: '+apiText))
  let discussionRejected=false
  try{await mcpCall('agents_company_discussion_post',{conversationType:'group',conversationId:'g1',messageId:'m1',text:'hi'})}catch(error){discussionRejected=/Publication is unavailable/.test(String(error&&error.message||error))}
  results.discussionRejected=discussionRejected
  if(!discussionRejected)fail(new Error('discussion tool must be rejected without an active shared response stage'))
  send({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'VISIBLE_AFTER_INIT'}}}})
 }else{
  send({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'IMAGE_TURN_OK'}}}})
 }
 write();return {stopReason:'end_turn'}
}
const rl=readline.createInterface({input:process.stdin})
rl.on('line',line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.id!==undefined&&msg.method===undefined){const p=permissionPending.get(msg.id);if(!p)return;permissionPending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);return}
 if(!(msg.method&&msg.id!==undefined))return
 Promise.resolve().then(async()=>{
  if(msg.method==='initialize')return {protocolVersion:1,agentInfo:{name:'opencode',version:'1.19.0-test'},agentCapabilities:{mcpCapabilities:{http:true,sse:true}},configOptions:CONFIG_OPTIONS}
  if(msg.method==='session/new'){recordedMCP=msg.params&&msg.params.mcpServers;results.mcpServers=recordedMCP;return {sessionId:'oc-session',configOptions:CONFIG_OPTIONS}}
  if(msg.method==='session/load'){recordedMCP=msg.params&&msg.params.mcpServers;results.mcpServers=recordedMCP;return {}}
  if(msg.method==='session/set_config_option')return {}
  if(msg.method==='session/prompt')return turn(msg.params)
  if(msg.method==='session/cancel')return {}
  return {}
 }).then(result=>send({jsonrpc:'2.0',id:msg.id,result})).catch(e=>send({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:String(e&&e.message||e)}}))
})
`
fs.writeFileSync(stubPath,stub,{mode:0o755})
const env={...process.env,HOME:nativeHome,AGENTS_COMPANY_EMBEDDED:'1',AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),OPENCODE_BIN:stubPath,AGENTS_TEST_RESULTS:resultsFile}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key))delete env[key]
for(const folder of [env.AGENTS_COMPANY_HOME])fs.mkdirSync(folder,{recursive:true})
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const cli=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8*1024*1024})).stdout);assert.ok(response.ok,response.error);return response.data}
const until=async(check,label)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('Timeout '+label)}
let service,ended,log='',employee
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 service=spawn(process.execPath,[entry],{env,stdio:['ignore','ignore','pipe']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-12000));await until(()=>cli('status').catch(()=>false),'Core')
 await cli('group','add','OpenCode Team','--mode','build')
 employee=await cli('card','create','--title','OpenCode Worker','--group','OpenCode Team','--engine','opencode','--model','deepseek/deepseek-v4-pro','--effort','low')
 await until(async()=>{const status=(await cli('session','status','--employee',employee.id))[0];if(status.initialization.status==='failed')throw Error(status.initialization.error);return status.initialization.status==='ready'},'OpenCode private documentation initialization')
 const results=JSON.parse(fs.readFileSync(resultsFile,'utf8'))
 assert.ok(Array.isArray(results.mcpServers)&&results.mcpServers.length===1,'session/new must wire one tunnel MCP server, got '+JSON.stringify(results.mcpServers))
 assert.equal(results.mcpServers[0].name,'tunnel')
 assert.ok(Array.isArray(results.mcpServers[0].env)&&results.mcpServers[0].env.length>0,'shim env must map ELECTRON_RUN_AS_NODE')
 for(const tool of ['agents_company_documentation','agents_company_api','agents_company_discussion_post'])assert.ok(results.tools.includes(tool),'bridge tool missing: '+tool)
 assert.ok(!results.tools.includes('execute'),'build mode must not expose tunnel workspace tools')
 const identity=JSON.parse(results.identity.content[0].text);assert.equal(identity.employee.id,employee.id,'documentation identity must be the real employee')
 assert.match(results.index.content[0].text,/API/)
 assert.ok(!fs.existsSync(path.join(employee.cwd,'.agents-company')),'no workspace copies during initialization')
 assert.equal((await cli('session','transcript',employee.id)).items.length,0,'private initialization stays out of the public transcript')
 // Visible turn exercises the read-only API tool through the same Core-owned bridge.
 const opened=await cli('session','open',employee.id);await cli('session','send',opened.sessionId,'请开始正式工作。');await until(async()=>!(await cli('session','status','--employee',employee.id))[0].busy,'visible work')
 const transcript=await cli('session','transcript',employee.id);assert.match(transcript.text,/VISIBLE_AFTER_INIT/);assert.doesNotMatch(transcript.text,/private initialization|API 文档索引|^OK$/m)
 const after=JSON.parse(fs.readFileSync(resultsFile,'utf8'));assert.equal(after.prompts,2);assert.ok(after.api&&JSON.parse(after.api.content[0].text).ok===true,'API tool must return ok:true');assert.equal(after.discussionRejected,true,'discussion tool must be rejected without an active shared task')
 // N1 image handoff: a real PNG attachment must travel as an ACP image block with its
 // base64 bytes intact — never as a '[image] path' text note. deepseek-flash is the
 // multimodal DeepSeek model, so the per-model input gate admits it; v4-pro stays text-only.
 await cli('config','model',opened.sessionId,'deepseek/deepseek-flash')
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')
 const imageName='ac-opencode-image.png'
 fs.writeFileSync(path.join(employee.cwd,imageName),png)
 await cli('session','send',opened.sessionId,'Describe the attached image.','--images',JSON.stringify([imageName]))
 await until(async()=>!(await cli('session','status','--employee',employee.id))[0].busy,'image turn')
 const imageAfter=JSON.parse(fs.readFileSync(resultsFile,'utf8'))
 assert.equal(imageAfter.prompts,3,'image attachment must be a third prompt')
 const blocks=imageAfter.promptBlocks[2]
 assert.ok(Array.isArray(blocks)&&blocks.length===2,'image turn must carry a text block plus an image block, got '+JSON.stringify(blocks).slice(0,200))
 const textBlock=blocks.find((b)=>b&&b.type==='text'),imageBlock=blocks.find((b)=>b&&b.type==='image')
 assert.ok(textBlock,'image turn must keep the text block')
 assert.ok(imageBlock,'image turn must carry an ACP image block, got '+JSON.stringify(blocks).slice(0,200))
 assert.equal(imageBlock.mimeType,'image/png','image block must preserve mimeType')
 assert.equal(imageBlock.data,png.toString('base64'),'image block must preserve the exact base64 data')
 assert.ok(!JSON.stringify(blocks).includes('[image] '),'no path-only image text fallback')
 console.log('PASS OpenCode MCP bridge: session/new wires tunnel MCP, documentation identity/index and read-only API tool run through the real Core; discussion tool stays closed without a shared task; real PNG attachments travel as ACP image blocks; no paid calls')
}catch(error){console.error(log);throw error}finally{service?.kill('SIGTERM');if(ended)await ended;fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
