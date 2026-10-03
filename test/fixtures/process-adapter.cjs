#!/usr/bin/env node
// Protocol fixture for Cline ACP and Pi RPC. No model/network requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process')
if(process.argv.includes('--version')){console.log('fixture-1');process.exit(0)}
const acp=process.argv.includes('--acp'),arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1]},dir=acp?arg('--config'):process.env.PI_CODING_AGENT_DIR
fs.mkdirSync(dir,{recursive:true});let sid=acp?Date.now()+'_fixture_cli':crypto.randomUUID(),current,timer,permission,mcpServers=[],ackPolicy
const saved=acp?path.join(dir,'fixture-state.json'):arg('--session')||path.join(dir,'sessions',sid+'.jsonl')
if(!path.resolve(saved).startsWith(path.resolve(dir)+path.sep))throw Error('Fixture session path must remain inside its disposable profile')
if(fs.existsSync(saved)){try{sid=JSON.parse(fs.readFileSync(saved)).id}catch{}}
const send=value=>process.stdout.write(JSON.stringify(value)+'\n'),result=(r,data)=>send(acp?{jsonrpc:'2.0',id:r.id,result:data}:{id:r.id,type:'response',command:r.type,success:true,data})
const update=value=>send({jsonrpc:'2.0',method:'session/update',params:{sessionId:sid,update:value}})
const control=process.env.AC_INIT_FIXTURE,employee=process.env.AGENTS_COMPANY_EMPLOYEE
const note=(kind,value)=>{if(control&&employee)fs.writeFileSync(path.join(control,employee+'-'+kind+'.json'),JSON.stringify(value))}
async function companyMcp(name,input,callId){
 const descriptor=mcpServers.find(server=>server.name==='tunnel');if(!descriptor)throw Error('Native Cline received no discussion MCP descriptor')
 const child=spawn(descriptor.command,descriptor.args??[],{env:{...process.env,...Object.fromEntries((descriptor.env??[]).map(item=>[item.name,item.value]))},stdio:['pipe','pipe','ignore']}),pending=new Map();let buffer=''
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line)continue;const message=JSON.parse(line),receive=pending.get(message.id);if(receive){pending.delete(message.id);receive.resolve(message)}}})
 child.on('error',error=>{for(const call of pending.values())call.reject(error);pending.clear()});child.on('exit',()=>{for(const call of pending.values())call.reject(Error('Native MCP process closed'));pending.clear()})
 const call=(method,params,id)=>new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})
 try{await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'native-fixture',version:'1'}},callId+'-init');child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const list=await call('tools/list',{},callId+'-list');if(!list.result?.tools?.some(tool=>tool.name===name))throw Error('Discussion tool was not exposed');return await call('tools/call',{name,arguments:input},callId)}finally{child.stdin.end();child.kill('SIGTERM')}
}
async function nativeTool(name,input,callId='fixture-tool-'+crypto.randomUUID()){
   let result
   if(acp)update({sessionUpdate:'tool_call',toolCallId:callId,title:'tunnel__'+name,kind:'other',status:'pending',rawInput:input});else send({type:'tool_execution_start',toolCallId:callId,toolName:name,args:input})
   if(acp){const allowed=await new Promise(resolve=>{permission={id:callId+'-permit',discussionPermission:true,receive:resolve};send({jsonrpc:'2.0',id:permission.id,method:'session/request_permission',params:{sessionId:sid,toolCall:{toolCallId:callId,title:'tunnel__'+name,kind:'other',rawInput:input},options:[{optionId:'allow_once',kind:'allow_once'},{optionId:'reject_once',kind:'reject_once'}]}})});note(name==='agents_company_documentation'?'documentation-permission':'discussion-permission',{allowed});if(!allowed)throw Error('Native discussion tool was denied');result=await companyMcp(name,input,callId)}
   else{const allowed=await new Promise(resolve=>{permission={id:callId+'-permit',discussionPermission:true,receive:resolve};send({type:'extension_ui_request',id:permission.id,method:'confirm',title:'Agents Company tool permission',message:JSON.stringify({toolName:name,toolCallId:callId,input})})});note(name==='agents_company_documentation'?'documentation-permission':'discussion-permission',{allowed});if(!allowed)throw Error('Native discussion tool was denied');result=await new Promise(resolve=>{permission={id:callId,discussion:true,receive:resolve};send({type:'extension_ui_request',id:callId,method:'input',title:name==='agents_company_documentation'?'Agents Company documentation':'Agents Company discussion',placeholder:JSON.stringify({toolCallId:callId,input})})})}
   note(name==='agents_company_documentation'?'documentation-tool':'discussion-tool',{input,result,callId,at:Date.now()})
   if(acp)update({sessionUpdate:'tool_call_update',toolCallId:callId,title:'tunnel__'+name,status:result.error||result.result?.isError?'failed':'completed',rawOutput:JSON.stringify(result)});else send({type:'tool_execution_end',toolCallId:callId,toolName:name,result,isError:!!result.isError})
 return result
}
async function initialize(request){
 const file=suffix=>path.join(control,employee+suffix)
 while(current===request&&!fs.existsSync(file('.release'))&&!fs.existsSync(path.join(control,'release-all')))await new Promise(resolve=>setTimeout(resolve,20))
 if(current!==request)return
 try{const operations=fs.existsSync(file('.init-skip-docs'))?[]:fs.existsSync(file('.init-identity-only'))?['identity']:['identity','index'],results={}
  for(const operation of operations){const reply=await nativeTool('agents_company_documentation',{operation});if(reply.error||reply.isError||reply.result?.isError)throw Error(reply.error?.message??reply.error??reply.result?.content?.[0]?.text??'Documentation tool failed');results[operation]=acp?JSON.parse(reply.result.content.find(item=>item.type==='text').text):reply.result}
  note('read',{operations,identity:results.identity,index:results.index,bytes:operations.map(operation=>JSON.stringify(results[operation]).length)});finish(fs.existsSync(file('.bad-ok'))?'NOT_READY':'OK',false,fs.existsSync(file('.fail'))?'fixture initialization failure':undefined)
 }catch(error){if(current===request)finish('',false,error.message)}
}
async function finishAck(text){
 const request=current,file=suffix=>path.join(control,employee+suffix);note('ack-response',{text})
 if(fs.existsSync(file('.ack-preface.txt'))){const prefix=fs.readFileSync(file('.ack-preface.txt'),'utf8');if(acp)update({sessionUpdate:'agent_message_chunk',content:{type:'text',text:prefix}});else{send({type:'message_start',message:{role:'assistant'}});send({type:'message_update',assistantMessageEvent:{type:'text_delta',contentIndex:0,delta:prefix}})}}
 while(current===request&&fs.existsSync(file('.hold-ack')))await new Promise(resolve=>setTimeout(resolve,20))
 if(current!==request)return
 try{
  const explicit=fs.existsSync(file('.ack-tool.json')),raw=fs.existsSync(file('.ack-output.txt'))
  if(explicit){
   const input={conversationType:ackPolicy.conversationType,conversationId:ackPolicy.conversationId,messageId:ackPolicy.messageId,text:null,...(explicit?JSON.parse(fs.readFileSync(file('.ack-tool.json'),'utf8')):{})},callId='fixture-discussion-'+crypto.randomUUID()
   await nativeTool('agents_company_discussion_post',input,callId)
  }
  if(current!==request)return
  if(fs.existsSync(file('.ack-thinking.txt'))){const thinking=fs.readFileSync(file('.ack-thinking.txt'),'utf8');if(acp)update({sessionUpdate:'agent_thought_chunk',content:{type:'text',text:thinking}});else send({type:'message_update',assistantMessageEvent:{type:'thinking_delta',contentIndex:0,delta:thinking}})}
  finish(text,false,fs.existsSync(file('.ack-fail'))?'Fixture acknowledgment failure':undefined)
 }catch(error){if(current===request)finish(text,false,error.message)}
}
const models=()=>({models:{currentModelId:'deepseek-flash',availableModels:[{modelId:'deepseek-flash',name:'DeepSeek Flash'},{modelId:'deepseek-v4-pro',name:'DeepSeek V4 Pro'}]},sessionId:sid,modes:{currentModeId:'act',availableModes:[]}})
function finish(text='山海皆可平',cancel=false,failure){
 if(!current)return;clearInterval(timer);const r=current;current=undefined;permission=undefined
 if(!cancel){fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,JSON.stringify({id:sid}));if(text){if(acp)update({sessionUpdate:'agent_message_chunk',content:{type:'text',text}});else{send({type:'message_start',message:{role:'assistant'}});send({type:'message_update',assistantMessageEvent:{type:'text_delta',contentIndex:0,delta:text}})}}if(!acp&&(text||failure))send({type:'message_end',message:{role:'assistant',stopReason:failure?'error':'stop',...(failure?{errorMessage:failure}:{})}})}
 if(acp){if(failure)send({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:failure}});else result(r,{stopReason:cancel?'cancelled':'end_turn'})}else send({type:'agent_settled'})
}
async function prompt(r,text){
 current=r;if(!acp)result(r,{})
 const marker=text.includes('[Agents Company channel acknowledgment]\n')?'[Agents Company channel acknowledgment]\n':'[Agents Company group acknowledgment]\n',at=text.indexOf(marker),hidden=text.includes('[Agents Company private initialization]')
 note(at>=0?'ack':hidden?'initializing':'work',{text,sessionId:sid,at:Date.now()})
 if(hidden){await initialize(r);return}
 if(at>=0){
  const policy=ackPolicy=JSON.parse(text.slice(at+marker.length).split('\n')[0]),override=control&&employee?path.join(control,employee+'.ack-output.txt'):undefined
  const response=override&&fs.existsSync(override)?fs.readFileSync(override,'utf8'):'Fixture acknowledgment stage complete.'
  if(text.includes('ACK_TOOL_FIXTURE')){
   permission={id:'ack-permit-'+crypto.randomUUID(),file:path.join(process.cwd(),'ack-forbidden.txt'),ack:response};const input={path:permission.file,content:'must not run'}
   if(acp)send({jsonrpc:'2.0',id:permission.id,method:'session/request_permission',params:{sessionId:sid,toolCall:{toolCallId:permission.id,title:'Write: ack-forbidden.txt',kind:'edit',rawInput:input},options:[{optionId:'allow_once',kind:'allow_once'},{optionId:'reject_once',kind:'reject_once'}]}})
   else send({type:'extension_ui_request',id:permission.id,method:'confirm',title:'Agents Company tool permission',message:JSON.stringify({toolName:'write',toolCallId:permission.id,input})})
  }else finishAck(response)
  return
 }
 const post=control&&employee?workPostArgs(text,control,employee):undefined
 if(post)try{const result=await nativeTool('agents_company_discussion_post',post);note('work-publication',{input:post,result});if(result.error||result.result?.isError||result.isError)throw Error('Publication failed')}catch(error){finish('',false,error.message);return}
 if(acp&&text.includes('[agents-company-image:')){
  // Load the real TypeScript module through the same bundling boundary as Core.
  const compiled=path.join(dir,'fixture-cline-compat.cjs'),sdk=require.resolve('@anthropic-ai/claude-agent-sdk')
  if(!fs.existsSync(compiled))require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../../src/main/engines/cline-compat.ts')],outfile:compiled,bundle:true,platform:'node',format:'cjs',alias:{'@anthropic-ai/claude-agent-sdk':sdk},external:[sdk,'electron'],logLevel:'silent'})
  const {projectClineRequest}=require(compiled)
  const projected=projectClineRequest({messages:[{role:'user',content:[{type:'text',text}]}],tools:[]},path.join(dir,'company-images'))
  const images=projected.messages[0].content.filter(p=>p.type==='image_url')
  fs.writeFileSync(path.join(dir,'fixture-image-request.json'),JSON.stringify(projected));finish('IMAGE_RECEIVED '+images.length);return
 }
 if(!acp&&text.includes('TUNNEL_FIXTURE ')){
  const request=JSON.parse(text.slice(text.lastIndexOf('TUNNEL_FIXTURE ')+15))
  permission={id:'permit-'+crypto.randomUUID(),request};send({type:'extension_ui_request',id:permission.id,method:'confirm',title:'Agents Company tool permission',message:JSON.stringify({...request,toolCallId:permission.id})});return
 }
 if(!acp&&text.includes('UNAPPROVED_TUNNEL_FIXTURE')){permission={id:'unapproved',tunnelReply:true};send({type:'extension_ui_request',id:permission.id,method:'input',title:'Agents Company Tunnel',placeholder:JSON.stringify({toolName:'tunnel__execute',toolCallId:'unapproved',input:{command:'echo must-not-run'}})});return}

 if(text.includes('FAIL_FIXTURE')){current=undefined;if(acp)send({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'Fixture model failure'}});else {send({type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'Fixture model failure'}});send({type:'agent_settled'})}return}
 if(text.includes('WRITE_FIXTURE')){
  permission={id:'permit-'+crypto.randomUUID(),file:path.join(process.cwd(),'approval.txt')};const input={path:permission.file,content:'approved'}
  if(acp)send({jsonrpc:'2.0',id:permission.id,method:'session/request_permission',params:{sessionId:sid,toolCall:{toolCallId:permission.id,title:'Write: approval.txt',kind:'edit',rawInput:input},options:[{optionId:'allow_once',kind:'allow_once'},{optionId:'reject_once',kind:'reject_once'}]}})
  else send({type:'extension_ui_request',id:permission.id,method:'confirm',title:'Agents Company tool permission',message:JSON.stringify({toolName:'write',toolCallId:permission.id,input})})
  return
 }
 if(text.includes('HOLD_FIXTURE'))return
 timer=setTimeout(()=>finish(text.includes('[Agents Company private initialization]')?'OK':text.includes('UNICODE_FIXTURE')?'春\u2028雨\u2029秋':'山海皆可平'),text.includes('QUEUE_FIXTURE')?700:30)
}
let buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line)continue;const r=JSON.parse(line),method=r.method||r.type,p=r.params||r
 if(permission&&r.id===permission.id){
  if(permission.discussionPermission){const receive=permission.receive;permission=undefined;receive(acp?r.result?.outcome?.optionId==='allow_once':!!r.confirmed);continue}
  if(permission.discussion){const receive=permission.receive;permission=undefined;let value;try{value=JSON.parse(r.value)}catch{value={error:r.value??'Missing discussion response'}}receive(value);continue}
  if(permission.tunnelReply){finish(r.value??'cancelled');continue}
  const allow=acp?r.result?.outcome?.optionId==='allow_once':r.confirmed;if(permission.ack!==undefined){const reply=permission.ack;note('ack-tool-result',{allowed:!!allow});if(allow)fs.writeFileSync(permission.file,'must not run');permission=undefined;finishAck(reply);continue}if(permission.request){if(allow){permission.tunnelReply=true;send({type:'extension_ui_request',id:permission.id,method:'input',title:'Agents Company Tunnel',placeholder:JSON.stringify({...permission.request,toolCallId:permission.id})})}else finish('denied');continue}if(allow)fs.writeFileSync(permission.file,'approved');finish(allow?'approved':'denied');continue}
 if(method==='initialize')result(r,{protocolVersion:1,agentInfo:{name:'cline-fixture',version:'3.0.65'},agentCapabilities:{loadSession:true}})
 else if(method==='session/load'&&!fs.existsSync(saved))send({jsonrpc:'2.0',id:r.id,error:{code:-32002,message:'Resource not found: '+p.sessionId}})
 else if(method==='session/new'||method==='session/load'){if(p.sessionId)sid=p.sessionId;mcpServers=p.mcpServers??[];result(r,models())}
 else if(['session/set_config_option','session/set_mode','set_thinking_level','set_model'].includes(method))result(r,{})
 else if(method==='get_state')result(r,{sessionId:sid,sessionFile:saved,thinkingLevel:'off',model:{id:'deepseek-flash',provider:'deepseek'},isStreaming:!!current})
 else if(method==='get_available_models')result(r,{models:[{id:'deepseek-flash',provider:'deepseek',name:'DeepSeek Flash'}]})
 else if(method==='session/prompt'||method==='prompt')prompt(r,acp?p.prompt.map(x=>x.text||'').join(''):p.message)
 else if(method==='session/cancel'||method==='abort'){finish('',true);if(!acp)result(r,{})}
 else if(method==='steer')result(r,{})
}})
process.stdin.on('end',()=>process.exit(0));process.on('SIGTERM',()=>process.exit(0))

function workPostArgs(text,control,employee){
 const file=path.join(control,employee+'.work-post.json');if(!fs.existsSync(file))return
 const marker=text.includes('[Group request]\n')?'[Group request]\n':text.includes('[Channel context]\n')?'[Channel context]\n':undefined
 if(!marker)return
 const context=JSON.parse(text.split(marker)[1].split('\n')[0])
 return {conversationType:context.conversationType,conversationId:context.conversationId,messageId:context.messageId??context.entryId,...JSON.parse(fs.readFileSync(file,'utf8'))}
}
