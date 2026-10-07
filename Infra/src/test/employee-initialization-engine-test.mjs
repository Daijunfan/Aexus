// Actual Codex/Claude binaries, authenticated Core documentation tools, deterministic loopback provider.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..'),engine=process.argv[2]??'codex',mode=process.argv[3]??'build',isolation=process.argv[4]??'trusted'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-private-init-engine-'))),received=[],documentation='mcp__agents_company__agents_company_documentation'
let fixtureError,employee,service,ended,modelCount=0,initializing=true
const model=http.createServer(async(req,res)=>{
 try{
  let raw='';for await(const part of req)raw+=part
  if(req.url?.includes('count_tokens')){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":1}');return}
  const codex=req.url?.endsWith('/responses'),claude=req.url?.includes('/messages');if(!codex&&!claude){res.writeHead(404).end();return}
  const body=JSON.parse(raw);received.push(body);const count=modelCount++,operation=initializing?['identity','index'][count]:undefined,serialized=JSON.stringify(body)
  if(count===0){assert.match(serialized,/Aexus private initialization/);assert.match(serialized,/agents_company_documentation/);assert.doesNotMatch(serialized,/\.agents-company\/employees\//)}
  if(initializing&&count===1)assert.ok(serialized.includes(employee.id),'identity came back from the real employee-bound tool')
  if(initializing&&count===2){assert.match(serialized,/API 文档索引/);assert.match(serialized,/Plan.*Core/);assert.doesNotMatch(serialized,/### card\.create/,'full API is not autoloaded')}
  const replyText=initializing?'OK':'VISIBLE_AFTER_INIT'
  if(codex){
   assert.equal(body.model,'gpt-6-luna');assert.equal(body.reasoning?.effort,'low')
   const code='const doc=ALL_TOOLS.find(x=>x.name.includes("agents_company_documentation"));if(!doc)throw Error("Documentation tool missing");text(await tools[doc.name]('+JSON.stringify({operation})+'));'
   const item=operation?{type:'custom_tool_call',id:'fc_'+count,call_id:'call_'+count,name:'exec',input:code}:{type:'message',id:'reply_'+count,role:'assistant',content:[{type:'output_text',text:replyText}]}
   res.writeHead(200,{'content-type':'text/event-stream'});for(const event of [{type:'response.created',response:{id:'r'+count,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r'+count,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');res.end()
  }else{
   const content=operation?{type:'tool_use',id:'tool_'+count,name:documentation,input:{operation}}:{type:'text',text:replyText},message={id:'m'+count,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}
   if(body.stream){res.writeHead(200,{'content-type':'text/event-stream'});for(const event of [{type:'message_start',message},{type:'content_block_start',index:0,content_block:operation?{...content,input:{}}:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:operation?{type:'input_json_delta',partial_json:JSON.stringify(content.input)}:{type:'text_delta',text:replyText}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:operation?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'}])res.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');res.end()}else res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...message,content:[content],stop_reason:operation?'tool_use':'end_turn'}))
  }
 }catch(error){fixtureError=error;res.writeHead(500).end('Local fixture assertion failed')}
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'Infra/src/resources/plugins'),CODEX_HOME:path.join(temp,'codex-home'),CLAUDE_CONFIG_DIR:path.join(temp,'claude-home'),CLAUDE_BIN:require.resolve('@anthropic-ai/claude-agent-sdk-'+process.platform+'-'+process.arch+'/'+(process.platform==='win32'?'claude.exe':'claude')),ANTHROPIC_BASE_URL:'http://127.0.0.1:'+model.address().port,ANTHROPIC_API_KEY:'fixture-only',ANTHROPIC_AUTH_TOKEN:'',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key)||key.startsWith('ANTHROPIC_DEFAULT_'))delete env[key]
for(const folder of [env.CODEX_HOME,env.CLAUDE_CONFIG_DIR,env.AGENTS_COMPANY_HOME])fs.mkdirSync(folder,{recursive:true})
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const codex=process.env.AGENTS_TEST_CODEX_BIN||process.env.AGENTS_COMPANY_TEST_CODEX||path.join(os.homedir(),'.npm-global/bin/codex'),wrapper=path.join(temp,'codex-fixture'),entry=path.join(temp,'daemon.cjs')
const extras=['-c','model_provider="bootstrap_fixture"','-c','model_providers.bootstrap_fixture.name="bootstrap_fixture"','-c','model_providers.bootstrap_fixture.base_url="http://127.0.0.1:'+model.address().port+'"','-c','model_providers.bootstrap_fixture.wire_api="responses"','-c','model_providers.bootstrap_fixture.requires_openai_auth=false','-c','model_providers.bootstrap_fixture.request_max_retries=0','-c','model_providers.bootstrap_fixture.stream_max_retries=0','--disable','memories','--disable','apps','--disable','plugins']
fs.writeFileSync(wrapper,'#!/usr/bin/env node\nconst {spawn}=require("node:child_process");const child=spawn('+JSON.stringify(codex)+',[...'+JSON.stringify(extras)+',...process.argv.slice(2)],{stdio:["pipe","pipe","pipe"]});process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on("exit",code=>process.exitCode=code??1);process.on("SIGTERM",()=>child.kill("SIGTERM"));\n',{mode:0o755});env.CODEX_BIN=wrapper
let log=''
const cli=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8*1024*1024})).stdout);assert.ok(response.ok,response.error);return response.data}
const until=async(check,label)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){if(fixtureError)throw fixtureError;const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('Timeout '+label)}
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 service=spawn(process.execPath,[entry],{env,stdio:['ignore','ignore','pipe']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-12000));await until(()=>cli('status').catch(()=>false),'Core')
 await cli('group','add','Ordinary Team','--mode',mode,...(mode==='work'?['--plugin','mininotion']:[]));employee=await cli('card','create','--title','Manager','--group','Ordinary Team','--engine',engine,'--management-role','manager','--access-mode',isolation,'--model',engine==='codex'?'gpt-6-luna':'claude-sonnet-4-6','--effort','low')
 await until(async()=>{const status=(await cli('session','status','--employee',employee.id))[0];if(status.initialization.status==='failed')throw Error(status.initialization.error);return status.initialization.status==='ready'},'real private documentation initialization')
 assert.equal(modelCount,3);assert.ok(!fs.existsSync(path.join(employee.cwd,'.agents-company')));assert.equal((await cli('session','transcript',employee.id)).items.length,0);assert.equal((await cli('session','status','--employee',employee.id))[0].lastReply,undefined);assert.equal((await cli('session','list')).sessions.length,1)
 initializing=false;const opened=await cli('session','open',employee.id);await cli('session','send',opened.sessionId,'请开始正式工作。');await until(async()=>!(await cli('session','status','--employee',employee.id))[0].busy,'visible work')
 const transcript=await cli('session','transcript',employee.id);assert.match(transcript.text,/VISIBLE_AFTER_INIT/);assert.doesNotMatch(transcript.text,/private initialization|API 文档索引|^OK$/m);assert.match(JSON.stringify(received.at(-1)),/API 文档索引/);assert.equal(modelCount,4)
 const reply=(await cli('session','status','--employee',employee.id))[0].lastReply;assert.ok(reply?.id);assert.equal(reply.readAt,undefined)
 fs.mkdirSync(path.join(root,'.aexus/artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'.aexus/artifacts/private-initialization-'+engine+'-'+mode+'.json'),JSON.stringify({passed:true,engine,mode,isolation,requests:modelCount,initialOperations:['identity','index'],publicTranscript:transcript.items,workspaceCopies:false,provider:'local deterministic HTTP fixture'},null,2));console.log('PASS real '+engine+' / '+mode+': native identity/index tool reads, no workspace copies, hidden OK and retained native context; no paid calls')
}catch(error){console.error(log);throw error}finally{service?.kill('SIGTERM');if(ended)await ended;model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
