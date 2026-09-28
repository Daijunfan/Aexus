#!/usr/bin/env node
// Protocol fixture for Cline ACP and Pi RPC. No model/network requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
if(process.argv.includes('--version')){console.log('fixture-1');process.exit(0)}
const acp=process.argv.includes('--acp'),arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1]},dir=acp?arg('--config'):process.env.PI_CODING_AGENT_DIR
fs.mkdirSync(dir,{recursive:true});let sid=acp?Date.now()+'_fixture_cli':crypto.randomUUID(),current,timer,permission
const saved=acp?path.join(dir,'fixture-state.json'):arg('--session')||path.join(dir,'sessions',sid+'.jsonl')
if(!path.resolve(saved).startsWith(path.resolve(dir)+path.sep))throw Error('Fixture session path must remain inside its disposable profile')
if(fs.existsSync(saved)){try{sid=JSON.parse(fs.readFileSync(saved)).id}catch{}}
const send=value=>process.stdout.write(JSON.stringify(value)+'\n'),result=(r,data)=>send(acp?{jsonrpc:'2.0',id:r.id,result:data}:{id:r.id,type:'response',command:r.type,success:true,data})
const update=value=>send({jsonrpc:'2.0',method:'session/update',params:{sessionId:sid,update:value}})
const models=()=>({models:{currentModelId:'deepseek-flash',availableModels:[{modelId:'deepseek-flash',name:'DeepSeek Flash'},{modelId:'deepseek-v4-pro',name:'DeepSeek V4 Pro'}]},sessionId:sid,modes:{currentModeId:'act',availableModes:[]}})
function finish(text='山海皆可平',cancel=false){
 if(!current)return;clearInterval(timer);const r=current;current=undefined;permission=undefined
 if(!cancel){fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,JSON.stringify({id:sid}));if(acp)update({sessionUpdate:'agent_message_chunk',content:{type:'text',text}});else {send({type:'message_start',message:{role:'assistant'}});send({type:'message_update',assistantMessageEvent:{type:'text_delta',contentIndex:0,delta:text}});send({type:'message_end',message:{role:'assistant',stopReason:'stop'}})}}
 if(acp)result(r,{stopReason:cancel?'cancelled':'end_turn'});else send({type:'agent_settled'})
}
async function prompt(r,text){
 current=r;if(!acp)result(r,{})
 if(acp&&text.includes('[agents-company-image:')){
  const {projectClineRequest}=await import(require('node:url').pathToFileURL(path.join(__dirname,'../../src/main/engines/cline-compat.ts')))
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
  if(permission.tunnelReply){finish(r.value??'cancelled');continue}
  const allow=acp?r.result?.outcome?.optionId==='allow_once':r.confirmed;if(permission.request){if(allow){permission.tunnelReply=true;send({type:'extension_ui_request',id:permission.id,method:'input',title:'Agents Company Tunnel',placeholder:JSON.stringify({...permission.request,toolCallId:permission.id})})}else finish('denied');continue}if(allow)fs.writeFileSync(permission.file,'approved');finish(allow?'approved':'denied');continue}
 if(method==='initialize')result(r,{protocolVersion:1,agentInfo:{name:'cline-fixture',version:'3.0.65'},agentCapabilities:{loadSession:true}})
 else if(method==='session/load'&&!fs.existsSync(saved))send({jsonrpc:'2.0',id:r.id,error:{code:-32002,message:'Resource not found: '+p.sessionId}})
 else if(method==='session/new'||method==='session/load'){if(p.sessionId)sid=p.sessionId;result(r,models())}
 else if(['session/set_config_option','session/set_mode','set_thinking_level','set_model'].includes(method))result(r,{})
 else if(method==='get_state')result(r,{sessionId:sid,sessionFile:saved,thinkingLevel:'off',model:{id:'deepseek-flash',provider:'deepseek'},isStreaming:!!current})
 else if(method==='get_available_models')result(r,{models:[{id:'deepseek-flash',provider:'deepseek',name:'DeepSeek Flash'}]})
 else if(method==='session/prompt'||method==='prompt')prompt(r,acp?p.prompt.map(x=>x.text||'').join(''):p.message)
 else if(method==='session/cancel'||method==='abort'){finish('',true);if(!acp)result(r,{})}
 else if(method==='steer')result(r,{})
}})
process.stdin.on('end',()=>process.exit(0));process.on('SIGTERM',()=>process.exit(0))
