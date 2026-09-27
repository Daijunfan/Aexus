// Real Codex/Claude processes, real tool execution and authenticated Core; local model fixtures only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const engine=process.argv[2]??'codex',mode=process.argv[3]??'build',isolation=process.argv[4]??'trusted'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-private-init-engine-'))),received=[]
let commands=[],fixtureError,cli,employee,service,ended,modelCount=0
const model=http.createServer(async(req,res)=>{
 try{
  let raw='';for await(const part of req)raw+=part
  if(req.url?.includes('count_tokens')){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":1}');return}
  const codex=req.url?.endsWith('/responses'),claude=req.url?.includes('/messages')
  if(!codex&&!claude){res.writeHead(404).end();return}
  const body=JSON.parse(raw);received.push(body)
  const serialized=JSON.stringify(body)
  if(modelCount===0){assert.match(serialized,/Agents Company private initialization/);assert.match(serialized,/card create/);assert.match(serialized,/Manager/);assert.ok(serialized.includes(employee.id));if(mode==='work')assert.match(serialized,/mininotion/)}
  if(modelCount===1)assert.match(serialized,/# Agents Company CLI 操作手册/)
  const command=commands[modelCount++],tool=!!command,replyText=modelCount<=2?'OK':'VISIBLE_AFTER_INIT'
  if(codex){
   assert.equal(body.model,'gpt-6-luna');assert.equal(body.reasoning?.effort,'low')
   const tools=[...(body.tools??[]),...(body.input??[]).filter(item=>item.type==='additional_tools').flatMap(item=>item.tools??[])],names=tools.flatMap(t=>t.type==='namespace'?t.tools.map(x=>x.name):[t.name]),params={cmd:command,workdir:employee.cwd,max_output_tokens:14000}
   const item=tool?(names.includes('exec_command')?{type:'function_call',id:'fc_'+modelCount,call_id:'call_'+modelCount,name:'exec_command',arguments:JSON.stringify(params)}:{type:'custom_tool_call',id:'fc_'+modelCount,call_id:'call_'+modelCount,name:'exec',input:`const result=await tools.exec_command(${JSON.stringify(params)});text(result)`}):{type:'message',id:'reply_'+modelCount,role:'assistant',content:[{type:'output_text',text:replyText}]}
   res.writeHead(200,{'content-type':'text/event-stream'});for(const event of [{type:'response.created',response:{id:'r'+modelCount,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r'+modelCount,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);res.end()
  }else{
   const input={command,description:'Use this employee’s authenticated Agents Company CLI'},content=tool?{type:'tool_use',id:'tool_'+modelCount,name:'Bash',input}:{type:'text',text:replyText},message={id:'m'+modelCount,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}
   if(body.stream){res.writeHead(200,{'content-type':'text/event-stream'});for(const event of [{type:'message_start',message},{type:'content_block_start',index:0,content_block:tool?{...content,input:{}}:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(input)}:{type:'text_delta',text:replyText}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);res.end()}
   else res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...message,content:[content],stop_reason:tool?'tool_use':'end_turn'}))
  }
 }catch(error){fixtureError=error;res.writeHead(500).end(String(error))}
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_HOME:path.join(temp,'codex-home'),CLAUDE_CONFIG_DIR:path.join(temp,'claude-home'),CLAUDE_BIN:require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${process.platform==='win32'?'claude.exe':'claude'}`),ANTHROPIC_BASE_URL:`http://127.0.0.1:${model.address().port}`,ANTHROPIC_API_KEY:'fixture-only',ANTHROPIC_AUTH_TOKEN:'',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key)||key.startsWith('ANTHROPIC_DEFAULT_'))delete env[key]
for(const folder of [env.CODEX_HOME,env.CLAUDE_CONFIG_DIR,env.AGENTS_COMPANY_HOME])fs.mkdirSync(folder,{recursive:true})
const codex=process.env.AGENTS_TEST_CODEX_BIN||path.join(os.homedir(),'.npm-global/bin/codex'),wrapper=path.join(temp,'codex-fixture')
fs.writeFileSync(wrapper,`#!/usr/bin/env node
const {spawn}=require('node:child_process');const extras=['-c','model_provider="bootstrap_fixture"','-c','model_providers.bootstrap_fixture.name="bootstrap_fixture"','-c','model_providers.bootstrap_fixture.base_url="http://127.0.0.1:${model.address().port}"','-c','model_providers.bootstrap_fixture.wire_api="responses"','-c','model_providers.bootstrap_fixture.requires_openai_auth=false','-c','model_providers.bootstrap_fixture.request_max_retries=0','-c','model_providers.bootstrap_fixture.stream_max_retries=0','--disable','memories','--disable','apps','--disable','plugins'];const child=spawn(${JSON.stringify(codex)},[...extras,...process.argv.slice(2)],{stdio:['pipe','pipe','pipe']});process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('exit',code=>process.exitCode=code??1);process.on('SIGTERM',()=>child.kill('SIGTERM'));
`,{mode:0o755});env.CODEX_BIN=wrapper
let log=''
cli=async(...args)=>{try{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8*1024*1024})).stdout);assert.ok(reply.ok,reply.error);return reply.data}catch(error){throw new Error(error.stdout||error.message)}}
try{
 service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-12000))
 for(let i=0;i<100;i++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,40))}}
 await cli('group','add','Ordinary Team','--mode',mode,...(mode==='work'?['--plugin','mininotion']:[]))
 employee=await cli('card','create','--title','Manager','--group','Ordinary Team','--engine',engine,'--management-role','manager','--access-mode',isolation,'--model',engine==='codex'?'gpt-6-luna':'claude-sonnet-4-6','--effort','low')
 const folder=path.join(employee.cwd,'.agents-company/employees',employee.id)
 assert.ok(!fs.existsSync(path.join(employee.cwd,'AGENTS.md')));assert.ok(!fs.existsSync(path.join(employee.cwd,'CLAUDE.md')))
 assert.match(fs.readFileSync(path.join(folder,'API.md'),'utf8'),/### card.create/)
 // Put the handbook heading first: Claude persists large Bash output and only sends a preview.
 const files=['API.md','AGENTS.md','PERMISSIONS.md'].map(name=>path.join(folder,name));if(mode==='work')files.push(path.join(employee.cwd,'.agents-company/plugins/mininotion/API.md'))
 commands=['cat '+files.map(value=>"'"+value.replaceAll("'","'\\''")+"'").join(' ')]
 const until=async(check,label)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){if(fixtureError)throw fixtureError;const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,150))}throw Error('Timeout '+label)}
 await until(async()=>{const status=(await cli('session','status','--employee',employee.id))[0];if(status.initialization.status==='failed')throw Error(status.initialization.error);return status.initialization.status==='ready'},'private initialization')
 assert.equal(modelCount,2)
 assert.equal((await cli('session','status','--employee',employee.id))[0].lastReply,undefined,'private OK does not produce unread status')
 assert.equal((await cli('session','transcript',employee.id)).items.length,0)
 assert.equal((await cli('session','list')).sessions.length,1,'reading examples must not create employees')
 const opened=await cli('session','open',employee.id)
 await cli('session','send',opened.sessionId,'请开始正式工作。')
 await until(async()=>!(await cli('session','status','--employee',employee.id))[0].busy,'first visible turn')
 const transcript=await cli('session','transcript',employee.id)
 assert.match(transcript.text,/VISIBLE_AFTER_INIT/);assert.doesNotMatch(transcript.text,/private initialization|^OK$|cat .*API.md/m)
 assert.match(JSON.stringify(received.at(-1)),/OK/);assert.match(JSON.stringify(received.at(-1)),/# Agents Company CLI 操作手册/)
 assert.equal(modelCount,3)
 const reply=(await cli('session','status','--employee',employee.id))[0].lastReply
 assert.ok(reply?.id);assert.match(reply.text,/VISIBLE_AFTER_INIT/);assert.equal(reply.readAt,undefined)
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,`artifacts/private-initialization-${engine}-${mode}.json`),JSON.stringify({passed:true,engine,mode,requests:modelCount,publicTranscript:transcript.items,hiddenReadFiles:files.map(file=>path.relative(employee.cwd,file))},null,2))
 console.log(`PASS real ${engine} / ${mode}: automatic hidden turn read physical role+plugin guides, replied OK, retained native knowledge, and first user sees only their own conversation; local model fixture`)
}catch(error){console.error(log);throw error}finally{service?.kill('SIGTERM');if(ended)await ended;await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
