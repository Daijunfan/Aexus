// Actual SDK-paired Claude CLI and in-process MCP, with only a deterministic loopback model.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-discussion-claude-native-'))),out=path.join(root,'artifacts/discussion-claude-native')
const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),binary=require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${process.platform==='win32'?'claude.exe':'claude'}`)
const toolName='mcp__agents_company__agents_company_discussion_post',documentationName='mcp__agents_company__agents_company_documentation',marker=path.join(temp,'forbidden-write'),privateFile=path.join(temp,'private-read.txt'),privateContents='FIXTURE_READ_CONTENT_MUST_STAY_PRIVATE'
const cases=new Map([['initialization',{step:0}]]),requests=[],results=new Map(),workRequests=[],checks=[]
let f,fixtureError,requestNumber=0
fs.writeFileSync(privateFile,privateContents)
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const textOf=content=>typeof content==='string'?content:(content??[]).filter(item=>item.type==='text').map(item=>item.text).join('\n')
const model=http.createServer(async(req,res)=>{
 try{
  let raw='';for await(const chunk of req)raw+=chunk
  if(req.url?.includes('count_tokens')){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":1}');return}
  if(!req.url?.includes('/messages')){res.writeHead(404).end();return}
  const body=JSON.parse(raw),prompt=[...body.messages].reverse().filter(item=>item.role==='user').map(item=>textOf(item.content)).find(text=>text.includes('ACK_NATIVE_CLAUDE_CASE=')||text.includes('[Agents Company private initialization]'))
  assert.ok(prompt,'Only a named isolated test turn may reach the loopback provider')
  const initializing=prompt.includes('[Agents Company private initialization]'),label=initializing?'initialization':prompt.match(/ACK_NATIVE_CLAUDE_CASE=([a-z-]+)/)?.[1],test=cases.get(label)
  assert.ok(test,'Known isolated scenario: '+label)
  const ackMarker='[Agents Company group acknowledgment]\n',ack=prompt.includes(ackMarker),scope=ack?JSON.parse(prompt.slice(prompt.indexOf(ackMarker)+ackMarker.length).split('\n')[0]):null,entry=scope?.messageId
  const received=body.messages.flatMap(message=>Array.isArray(message.content)?message.content.filter(item=>item.type==='tool_result'):[])
  for(const result of received)results.set(result.tool_use_id,result)
  assert.ok(!JSON.stringify(received).includes(privateContents),'Read must not disclose the fixture file')
  requests.push({label,stage:initializing?'initialization':ack?'reading':'work',tools:(body.tools??[]).map(tool=>tool.name).filter(Boolean),toolResultIds:received.map(item=>item.tool_use_id)})
  let content,stop='end_turn'
  if(initializing){
   const step=test.step++,operation=['identity','index'][step-2]
   if(step===0){content=[{type:'tool_use',id:'tool_initialization_bash',name:'Bash',input:{command:`printf FORBIDDEN > '${marker}'`,description:'Synthetic forbidden initialization write'}}];stop='tool_use'}
   else if(step===1){content=[{type:'tool_use',id:'tool_initialization_read',name:'Read',input:{file_path:privateFile}}];stop='tool_use'}
   else if(operation){content=[{type:'tool_use',id:'tool_initialization_'+operation,name:documentationName,input:{operation}}];stop='tool_use'}
   else content=[{type:'text',text:'OK'}]
  }
  else if(!ack){
   if(!test.workRecorded){workRequests.push({label,at:Date.now()});test.workRecorded=true}
   if(label==='public'&&!test.posted){test.posted=true;const current=JSON.parse(prompt.split('[Group request]\n')[1].split('\n')[0]),id='tool_work_'+label;test.toolCall={id,messageId:current.messageId,text:test.text,at:Date.now()};content=[{type:'tool_use',id,name:toolName,input:{conversationType:'group',conversationId:current.groupId,messageId:current.messageId,text:test.text}}];stop='tool_use'}
   else content=[{type:'text',text:'WORK_COMPLETED_'+label}]
  }
  else if(label==='output-only')content=[{type:'text',text:'{"text":"ACK_PRIVATE_JSON_MUST_NOT_PUBLISH"}'}]
  else{
   assert.ok(entry,'Native reading prompt includes exact bound message ID')
   const step=test.step++,callId='tool_'+label+'_'+step
   if(step===0){content=[{type:'text',text:'{"text":"ACK_PRIVATE_PLAN_MUST_NOT_PUBLISH"}'},{type:'tool_use',id:callId,name:'Bash',input:{command:`printf FORBIDDEN > '${marker}'`,description:'Synthetic forbidden ACK write'}}];stop='tool_use'}
   else if(step===1){content=[{type:'tool_use',id:callId,name:'Read',input:{file_path:privateFile}}];stop='tool_use'}
   else if(step===2){test.readingToolCall={id:callId,messageId:entry,text:test.text,at:Date.now()};content=[{type:'tool_use',id:callId,name:toolName,input:{conversationType:scope.conversationType,conversationId:scope.conversationId,messageId:entry,text:test.text}}];stop='tool_use'}
   else content=[{type:'text',text:'{"text":"ACK_PRIVATE_FINAL_MUST_NOT_PUBLISH"}'}]
  }
  const message={id:'fixture-message-'+(++requestNumber),type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}
  if(!body.stream){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...message,content,stop_reason:stop}));return}
  res.writeHead(200,{'content-type':'text/event-stream'})
  const events=[{type:'message_start',message}]
  content.forEach((block,index)=>events.push({type:'content_block_start',index,content_block:block.type==='tool_use'?{...block,input:{}}:{type:'text',text:''}},{type:'content_block_delta',index,delta:block.type==='tool_use'?{type:'input_json_delta',partial_json:JSON.stringify(block.input)}:{type:'text_delta',text:block.text}},{type:'content_block_stop',index}))
  events.push({type:'message_delta',delta:{stop_reason:stop,stop_sequence:null},usage:{output_tokens:1}},{type:'message_stop'})
  for(const event of events)res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  res.end()
 }catch(error){fixtureError=error;res.writeHead(500).end('Isolated fixture assertion failed')}
})
const evidence={passed:false,scope:'Actual Claude SDK/CLI with source Core and loopback model; no provider inference, real employee state or SDK mocks.',sdkVersion:JSON.parse(fs.readFileSync(path.join(path.dirname(sdk),'package.json'),'utf8')).version,checks,requests}
try{
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
 const home=path.join(temp,'home'),profile=path.join(temp,'claude');fs.mkdirSync(home);fs.mkdirSync(profile)
 const env={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(temp,'config'),CLAUDE_CONFIG_DIR:profile,CLAUDE_BIN:binary,ANTHROPIC_BASE_URL:`http://127.0.0.1:${model.address().port}`,ANTHROPIC_API_KEY:'isolated-loopback-only',ANTHROPIC_AUTH_TOKEN:'',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CLAUDE_CODE_USE_BEDROCK:'0',CLAUDE_CODE_USE_VERTEX:'0',CLAUDE_CODE_USE_FOUNDRY:'0',NO_PROXY:'127.0.0.1,localhost'}
 for(const key of Object.keys(process.env))if(key.startsWith('ANTHROPIC_')&&!(key in env))env[key]=''
 evidence.cliVersion=(await promisify(execFile)(binary,['--version'],{env:{...process.env,...env},timeout:10000})).stdout.trim()
 const entry=path.join(temp,'daemon.cjs')
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore(env,entry)
 const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
 const wait=async(check,label)=>{const deadline=Date.now()+45000;while(Date.now()<deadline){if(fixtureError)throw fixtureError;const value=await check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,80))}throw Error('Timeout '+label)}
 await rpc('group.add',{name:'Native Claude ACK'})
 const card=await rpc('card.create',{title:'Isolated Claude reader',group:'Native Claude ACK',engine:'claude',model:'claude-sonnet-4-6',thinking:false,permissionMode:'bypassPermissions'})
 await wait(async()=>{const value=await f.status(card.id);if(value.initialization?.status==='failed')throw Error(value.initialization.error);return value.initialization?.status==='ready'},'actual documentation initialization')
 for(const operation of ['bash','read']){
  const result=results.get('tool_initialization_'+operation);assert.ok(result?.is_error,JSON.stringify(result));assert.match(JSON.stringify(result.content),/denied|blocked|only.*tool|initialization/i)
 }
 assert.equal(fs.existsSync(marker),false)
 for(const operation of ['identity','index']){
  const result=results.get('tool_initialization_'+operation);assert.ok(result&&!result.is_error,JSON.stringify(result))
  const data=JSON.parse(result.content.find(item=>item.type==='text').text)
  if(operation==='identity')assert.ok(JSON.stringify(data).includes(card.id))
  else{assert.equal(data.document,'index');assert.ok(data.markdown.length<6000);assert.match(data.markdown,/Plan 是 Core 视图，不是 MiniNotion/);assert.doesNotMatch(data.markdown,/### card\.create/)}
 }
 assert.equal(cases.get('initialization').step,5);assert.equal((await rpc('session.transcript',{employee:card.id})).items.length,0)
 checks.push('Ordinary Employee initialization denies actual native Bash/Read even with bypass permission, then accepts documentation identity/index tools and OK; no file leakage, full manuals or public transcript')
 const group=await rpc('chat.create',{name:'Explicit native MCP',members:[card.id]})
 const history=async()=>(await rpc('chat.history',{id:group.id,limit:100})).messages
 const delivery=async messageId=>(await history()).find(message=>message.id===messageId)?.deliveries[0]
 const nativeIds=[(await rpc('session.info',{employee:card.id})).claudeSessionId]
 for(const [label,text] of [['public','A deliberate reply through the native MCP tool.'],['silent',null],['output-only',undefined]]){
  const scenario={step:0,text};cases.set(label,scenario)
  const before=(await history()).length,beforeWork=workRequests.length
  const message=await rpc('chat.send',{id:group.id,text:'ACK_NATIVE_CLAUDE_CASE='+label,mentions:[card.id],clientMessageId:'native-claude-'+label})
  const done=await wait(async()=>{const d=await delivery(message.id);return ['completed','failed','interrupted'].includes(d?.status)&&d},label+' delivery')
  assert.equal(done.status,'completed',JSON.stringify(done));assert.ok(done.readAt&&done.deliveredAt);assert.equal(workRequests.length,beforeWork+1);assert.ok(workRequests.at(-1).at>=done.readAt)
  if(label!=='output-only'){
   for(const step of [0,1,2]){const result=results.get('tool_'+label+'_'+step);assert.ok(result?.is_error,JSON.stringify(result));assert.match(JSON.stringify(result.content),/denied|blocked|only|reading|unavailable/i)}
   assert.equal(fs.existsSync(marker),false)
  }
  if(label==='public'){
   const result=results.get(scenario.toolCall.id);assert.ok(result&&!result.is_error,JSON.stringify(result));assert.ok(JSON.stringify(result.content).includes(text));assert.equal(scenario.toolCall.messageId,message.id)
   const reply=(await history()).find(item=>item.id===done.ackMessageId);assert.equal(reply.text,text);assert.equal(reply.replyTo,message.id);assert.equal(reply.acknowledgmentOf,undefined);assert.deepEqual(reply.author,{kind:'agent',employeeId:card.id});assert.equal((await history()).length,before+2)
  }else{assert.equal(done.ackMessageId,undefined);assert.equal((await history()).length,before+1)}
  await wait(async()=>!(await f.status(card.id)).busy,label+' idle');nativeIds.push((await rpc('session.info',{employee:card.id})).claudeSessionId)
  assert.equal((await f.status(card.id)).lastReply,undefined,'shared work never creates private unread');assert.ok((await history()).every(item=>!item.text.includes('ACK_PRIVATE_')));assert.ok(!(await rpc('session.transcript',{employee:card.id})).text.includes('ACK_PRIVATE_'))
  checks.push(label+': native reading cannot use Bash/Read/publisher, ordinary output stays private, native success releases work, only deliberate response-stage publication is public')
  console.log('PASS actual Claude '+label)
 }

 assert.ok(nativeIds.every(id=>id&&id===nativeIds[0]),'Reading, work and later requests retain one native session')
 const transcript=await rpc('session.transcript',{employee:card.id});assert.equal(transcript.items.filter(item=>item.role==='user').length,3)
 const source=(await rpc('session.list')).sessions.find(item=>item.id===card.id);assert.equal(source.permissionMode,'bypassPermissions')
 evidence.sameNativeSession=true;evidence.nativeSessionId=nativeIds[0];evidence.toolResults=[...results.values()].map(({tool_use_id,is_error,content})=>({toolUseId:tool_use_id,isError:!!is_error,content}));evidence.passed=true
 console.log('PASS actual Claude native discussion MCP, no automatic text publication, isolated local provider only')
}catch(error){evidence.error=error.message;throw error}
finally{
 await f?.close();model.closeAllConnections();await new Promise(resolve=>model.close(resolve))
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(evidence,null,2))
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
