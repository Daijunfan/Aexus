// Real Claude Code CLI and SDK permission flow; deterministic local model, no inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import assert from 'node:assert/strict'

const run=promisify(execFile),require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-claude-'))
const manager=path.join(temp,'Agents-Managers'),staff=path.join(manager,'Claude-Director'),config=path.join(temp,'claude')
fs.mkdirSync(staff,{recursive:true});fs.mkdirSync(config)
fs.writeFileSync(path.join(manager,'API.md'),'Manager agent test')
fs.writeFileSync(path.join(manager,'agents'),`#!/bin/sh\nexec node '${root}/bin/agents' "$@"\n`,{mode:0o755})
const received=[]
const model=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part
  if(req.url?.includes('count_tokens')){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":1}');return}
  if(!req.url?.includes('/messages')){res.writeHead(404).end();return}
  const body=JSON.parse(raw);received.push(body)
  const tool=received.length===1,input={command:'agents group add Claude-managed --mode build --json',description:'Create a Team through the documented host CLI'}
  const content=tool?{type:'tool_use',id:'tool_manager',name:'Bash',input}:{type:'text',text:'MANAGER_DONE'}
  const message={id:'msg_'+received.length,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}
  if(body.stream){
    res.writeHead(200,{'content-type':'text/event-stream'})
    const events=[{type:'message_start',message},{type:'content_block_start',index:0,content_block:tool?{...content,input:{}}:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(input)}:{type:'text_delta',text:'MANAGER_DONE'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'}]
    for(const event of events)res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    res.end()
  }else res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...message,content:[content],stop_reason:tool?'tool_use':'end_turn'}))
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),CLAUDE_CONFIG_DIR:config,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',ANTHROPIC_BASE_URL:`http://127.0.0.1:${model.address().port}`,ANTHROPIC_API_KEY:'fixture-only',ANTHROPIC_AUTH_TOKEN:''}
Object.assign(process.env,env)
fs.mkdirSync(env.AGENTS_COMPANY_HOME)
const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=path.join(temp,'core.cjs')
await build({stdin:{contents:"export {buildOptions} from './src/main/sessions'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,alias:{'@anthropic-ai/claude-agent-sdk':sdk},external:[sdk],logLevel:'silent'})
const {buildOptions}=require(bundle),{query}=await import('@anthropic-ai/claude-agent-sdk')
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),daemonDone=new Promise(resolve=>daemon.once('exit',resolve))
let q,approvalRequests=0
try{
  for(let i=0;i<100;i++){try{if(JSON.parse((await run(process.execPath,[root+'/bin/agents','status','--json'],{env,timeout:2000})).stdout).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  const options=buildOptions({cwd:staff,permissionMode:'acceptEdits',thinking:false,model:'claude-sonnet-4-6'})
  assert.deepEqual(options.allowedTools,['Bash(agents *)'])
  const ordinary=buildOptions({cwd:temp,permissionMode:'acceptEdits',thinking:false})
  assert.equal(ordinary.allowedTools,undefined,'Normal Build Team must not inherit Manager CLI approval')
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000)
  q=query({prompt:'Create a Team with the agents CLI.',options:{...options,abortController:controller,canUseTool:async()=>{approvalRequests++;return {behavior:'deny',message:'Manager CLI rule did not preapprove command'}}}})
  const output=[]
  try{for await(const message of q)output.push(message)}finally{clearTimeout(timer);q.close();q=undefined}
  assert.equal(approvalRequests,0,'Manager CLI unexpectedly required interactive approval')
  assert.ok(received.length>=2,'Claude did not receive a CLI tool result')
  const result=JSON.parse((await run(process.execPath,[root+'/bin/agents','group','list','--json'],{env})).stdout)
  assert.ok(result.ok&&result.data.includes('Claude-managed'),'Claude Manager command did not create the Team')
  assert.ok(output.some(message=>message.type==='result'&&message.subtype==='success'),JSON.stringify(output).slice(-2000))
  console.log('PASS Claude Code Manager employee executed host CLI without a prompt; ordinary Build Team has no Manager allowance; fixture only')
}finally{q?.close();daemon.kill('SIGTERM');await daemonDone;await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
