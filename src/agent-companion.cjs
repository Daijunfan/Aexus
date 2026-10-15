// Native protocol companion: isolated conversation identity per Agent.
// The existing Claude/Pi/Cline interactive PTY is never injected with task text.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const registry=require('./registry.cjs'),hosts=require('./agent-hosts.cjs'),journal=require('./session-journal.cjs');
const tools=require('./collaboration-mcp.cjs'),{JsonLines}=require('./agent-companion-protocol.cjs');
const apiApprovals=require('./api-approvals.cjs');
class Companion {
 constructor(role,changed){
  if(!['claude','pi','cline'].includes(role.engine)||!/^[\w-]{1,128}$/.test(role.id))throw Error('Invalid companion engine or Agent ID');
  this.role=role;this.changed=changed;this.busy=false;this.active=null;this.approvals=new Map();this.cursor=0;this.events=[];
  this.dead=false;this.failed=null;this.ready=null;this.transport=null;this.endpoint=null;
  role.collaborationSessionId??=randomUUID();role.collaborationMode='independent';
  this.threadId=role.collaborationSessionId;this.toolScope=null;
 }
 view(){return {busy:this.busy,turnId:this.active?.id||null,running:!!this.transport&&!this.transport.closed,status:this.busy?'busy':this.failed?'error':'idle',
  approvals:[...this.approvals.values()].map(({wireId,...request})=>request)}}
 read(cursor=0){if(!Number.isSafeInteger(cursor)||cursor<0)throw Error('Invalid cursor');return {...this.view(),cursor:this.cursor,events:this.events.filter(row=>row.seq>cursor)}}
 emit(kind,text='',extra={}){const event={kind,text,seq:++this.cursor,time:Date.now(),...extra};this.events.push(event);if(this.events.length>240)this.events.shift();return event}
 trace(kind,id,data={}){
  const base={threadId:this.threadId,turnId:id};
  const event=kind==='start'?{method:'turn/started',params:{threadId:this.threadId,turn:{id}}}
   :kind==='end'?{method:'turn/completed',params:{threadId:this.threadId,turn:{id,status:data.status||'completed',...(data.error?{error:{message:data.error}}:{})}}}
   :{method:'item/completed',params:{...base,item:{id:'reply-'+id,type:'agentMessage',text:data.text||''}}};
  journal.observe({id:this.role.id,threadId:this.threadId},event);
 }
 workspace(){const dir=path.join(registry.home,'agent-companion',this.role.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});return dir}
 machine(){return hosts.get(this.role.engineHostId)}
 async ensure(){if(this.role.engine==='claude')return;if(this.transport&&!this.transport.closed)return;if(this.ready)return this.ready;
  this.ready=this.open().finally(()=>this.ready=null);return this.ready}
 async open(){
  if(this.dead)throw Error('Companion is closed');
  const machine=this.machine();
  if(machine.id!=='local')throw Error('Structured '+this.role.engine+' requires a controller-local engine; remote PTY remains available');
  const dir=this.workspace(),cwd=this.role.cwd;
  await hosts.checkDirectory(hosts.get(this.role.targetHostId),cwd);
  this.endpoint??=await tools.open(this);
  if(this.role.engine==='pi'){
   const extension=path.join(dir,'tools.mjs'),spec=JSON.stringify(tools.definitions),names=JSON.stringify(tools.definitions.map(def=>def.name));
   fs.writeFileSync(extension,'export default function(pi){\n'+
    'pi.on("tool_call",async(e,ctx)=>{if('+names+'.includes(e.toolName))return;'+
    'const accepted=await ctx.ui.confirm("CloudHosts approval",JSON.stringify({toolName:e.toolName,toolCallId:e.toolCallId,input:e.input}));'+
    'if(!accepted)return {block:true,reason:"CloudHosts approval declined"};});'+
    'for(const spec of '+spec+'){pi.registerTool({name:spec.name,label:spec.name,description:spec.description,parameters:spec.inputSchema,'+
    'async execute(callId,input,signal,_update,ctx){if(signal?.aborted)throw Error("Interrupted");'+
    'const answer=await ctx.ui.input("CloudHosts collaboration",JSON.stringify({name:spec.name,input,toolCallId:callId}));'+
    'if(!answer)throw Error("Collaboration call cancelled");const r=JSON.parse(answer);if(r.error)throw Error(r.error);'+
    'return {content:[{type:"text",text:JSON.stringify(r.value)}]};}})}}\n',{mode:0o600});
   this.transport=new JsonLines(hosts.processOn(machine,'pi',['--mode','rpc','--session-id',this.threadId,'--offline','--no-extensions','--no-skills','--no-prompt-templates','--no-themes','--no-approve','--extension',extension],{cwd}),
    event=>this.onPi(event));
   try{const state=await this.transport.request('get_state',{},'pi',18000);
    if(state.sessionId&&state.sessionId!==this.threadId)throw Error('Pi returned wrong exact conversation ID');
    this.changed();return;
   }catch(error){await this.transport.close();this.transport=null;throw error}
  }
  const dirCline=path.join(dir,'cline');fs.mkdirSync(dirCline,{recursive:true,mode:0o700});
  this.transport=new JsonLines(hosts.processOn(machine,'cline',['--acp','--auto-approve','false','--config',dirCline,'--data-dir',path.join(dirCline,'data')],{cwd}),
   event=>this.onCline(event));
  try{
   await this.transport.request('initialize',{protocolVersion:1,clientInfo:{name:'cloudhosts',version:'3'},clientCapabilities:{}},'acp',18000);
   const existing=this.role.collaborationAcpSessionId;
   const result=await this.transport.request(existing?'session/load':'session/new',{cwd,...(existing?{sessionId:existing}:{}),
    mcpServers:[{name:'cloudhosts_core',type:'http',url:this.endpoint.url}]},'acp',24000);
   if(!result?.sessionId&&!existing||existing&&result?.sessionId&&result.sessionId!==existing)throw Error('Exact Cline ACP conversation changed');
   this.role.collaborationAcpSessionId=existing||result.sessionId;this.changed();
  }catch(error){await this.transport.close();this.transport=null;throw error}
 }
 onPi(event){
  if(event.type==='extension_ui_request'){
   if(event.method==='input'&&event.title==='CloudHosts collaboration'){
    void (async()=>{let response;try{const call=JSON.parse(event.placeholder);
     response={value:await tools.invoke(this,call.name,call.input,call.toolCallId,{threadId:this.threadId,turnId:this.active?.id})};
    }catch(error){response={error:error.message}}
    this.transport?.write({type:'extension_ui_response',id:event.id,value:JSON.stringify(response)});})();return;
   }
   if(event.method==='confirm'&&event.title==='CloudHosts approval'){
    try{this.requestApproval('pi',event.id,JSON.parse(event.message))}catch{this.transport?.write({type:'extension_ui_response',id:event.id,cancelled:true})}
    return;
   }
   this.transport?.write({type:'extension_ui_response',id:event.id,cancelled:true});return;
  }
  if(!this.active)return;
  const update=event.assistantMessageEvent;
  if(event.type==='message_update'&&update?.type==='text_delta'){const text=update.delta||'';this.active.output+=text;this.emit('delta',text,{turnId:this.active.id})}
  if(event.type==='message_update'&&update?.type==='text_end'&&update.content&&this.active.output.length<update.content.length)this.active.output=update.content;
  // Pi's agent_settled has no error field: the authoritative assistant
  // message and exhausted auto-retry events determine success or failure.
  if(event.type==='message_end'&&event.message?.role==='assistant'){
   const message=event.message;
   const answer=(message.content||[]).filter(item=>item.type==='text').map(item=>item.text||'').join('\n');
   if(answer)this.active.output=answer;
   if(['error','aborted'].includes(message.stopReason))
    this.active.providerError=message.errorMessage||'Pi model stopped: '+message.stopReason;
   else if(message.stopReason&&message.stopReason!=='pending')this.active.providerError=null;
  }
  if(event.type==='auto_retry_end'&&event.success===false)this.active.providerError=event.finalError||'Pi retry attempts exhausted';
  if(event.type==='extension_error')this.active.providerError=event.error||'Pi extension failed';
  if(event.type==='tool_execution_start')this.emit('tool',event.toolName,{turnId:this.active.id,toolCallId:event.toolCallId});
  if(event.type==='agent_settled')this.finish(this.active.providerError?'failed':'completed',this.active.providerError||null);
  if(event.type==='transport_error')this.finish('failed',event.error);
 }
 onCline(event){
  if(event.method==='session/request_permission'&&event.id!==undefined){this.requestApproval('cline',event.id,event.params?.toolCall||{},event.params?.options||[]);return}
  if(event.method==='session/update'&&this.active){
   const update=event.params?.update||{};
   if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){const text=update.content.text||'';this.active.output+=text;this.emit('delta',text,{turnId:this.active.id})}
   if(update.sessionUpdate==='tool_call')this.emit('tool',update.title||'',{turnId:this.active.id,toolCallId:update.toolCallId});
  }
  if(event.type==='transport_error')this.finish('failed',event.error);
 }
 requestApproval(engine,wireId,detail,choices=[]){
  if(!this.active)return;
  const id='approval_'+randomUUID(),request={id,engine,wireId,detail,choices,turnId:this.active.id,sessionId:this.role.id,createdAt:Date.now()};
  this.approvals.set(id,request);this.emit('approval',JSON.stringify({id,engine,name:detail.toolName||detail.title||detail.kind||'Agent tool'}),{turnId:this.active.id,requestId:id});this.changed();
  require('./core-events.cjs').publish('approval',{agentId:this.role.id,turnId:this.active.id});
 }
 approveApi(input){return apiApprovals.request(this,input)}
 async respond({requestId,decision}){
  if(apiApprovals.respond(this,{requestId,decision}))return {accepted:true};
  const req=this.approvals.get(requestId);
  if(!req||!this.active||req.turnId!==this.active.id)throw Error('Approval is no longer pending');
  if(!['accept','decline'].includes(decision))throw Error('Choose accept or decline');
  if(req.engine==='pi')this.transport.write({type:'extension_ui_response',id:req.wireId,confirmed:decision==='accept'});
  else{const option=req.choices.find(item=>item.kind===(decision==='accept'?'allow_once':'reject_once'));
   this.transport.write({jsonrpc:'2.0',id:req.wireId,result:{outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}})}
  this.approvals.delete(requestId);this.emit('approval-resolved','',{turnId:this.active.id,requestId});require('./core-events.cjs').publish('approval',{agentId:this.role.id,turnId:this.active.id});return {accepted:true};
 }
 async send(text,scope){
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>65536)throw Error('Task must be nonempty and at most 64 KiB');
  if(this.busy||this.active)throw Error('Native task is already active');
  if(this.dead)throw Error('Companion has stopped');
  await this.ensure();
  const id=randomUUID();this.active={id,output:'',completed:false,child:null};this.toolScope=scope?{...scope,turnId:id,agentId:this.role.id}:{source:'private',turnId:id,agentId:this.role.id};
  this.busy=true;this.failed=null;this.emit('turn','',{turnId:id,status:'running'});this.trace('start',id);this.changed();
  try{
   if(this.role.engine==='claude'){
    const machine=this.machine();if(machine.id!=='local')throw Error('Claude structured execution requires local engine');
    this.endpoint??=await tools.open(this);
    const config={mcpServers:{cloudhosts_core:{type:'http',url:this.endpoint.url}}};
    const configFile=path.join(this.workspace(),'claude-mcp.json');
    fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});
    const allowed=tools.definitions.map(tool=>'mcp__cloudhosts_core__'+tool.name).join(',');
    const args=['--print','--output-format','stream-json','--verbose','--strict-mcp-config','--mcp-config',configFile,
     '--allowedTools',allowed,'--permission-mode',this.role.permission==='full'?'bypassPermissions':'dontAsk'];
    if(this.role.collaborationStarted)args.push('--resume',this.threadId);else args.push('--session-id',this.threadId);
    args.push('--',text);
    const child=hosts.processOn(machine,'claude',args,{cwd:this.role.cwd});
    this.active.child=child;this.transport=new JsonLines(child,event=>this.onClaude(event));
    if(!child.pid)await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
   }else if(this.role.engine==='pi'){
    this.transport.request('prompt',{message:text},'pi',30000).catch(error=>this.finish('failed',error.message));
   }else{
    this.transport.request('session/prompt',{sessionId:this.role.collaborationAcpSessionId,prompt:[{type:'text',text}]},'acp',0)
     .then(result=>this.finish(result?.stopReason==='cancelled'?'interrupted':'completed',
      result?.stopReason==='cancelled'?'Cline cancelled':null)).catch(error=>this.finish('failed',error.message));
   }
   journal.accepted({id:this.role.id,threadId:this.threadId},id,text);
   return {accepted:true,turnId:id,sessionId:this.role.id,engineSessionId:this.threadId};
  }catch(error){this.finish('failed',error.message);throw error}
 }
 onClaude(event){
  if(!this.active)return;
  if(event.type==='system'&&event.subtype==='init'&&event.session_id){
   if(event.session_id!==this.threadId){this.finish('failed','Exact Claude session changed');void this.transport?.close();return}
   this.role.collaborationStarted=true;this.changed();
  }
  if(event.type==='assistant'){
   const text=(event.message?.content||[]).filter(block=>block.type==='text').map(block=>block.text||'').join('\n');
   if(text){this.active.output=text;this.emit('message',text,{turnId:this.active.id})}
  }
  if(event.type==='result'){
   if(event.session_id&&event.session_id!==this.threadId){this.finish('failed','Claude returned a different session ID');return}
   if(event.result&&!this.active.output)this.active.output=String(event.result);
   this.role.collaborationStarted=true;this.changed();
   this.finish(event.is_error||event.subtype!=='success'?'failed':'completed',
    event.is_error?String(event.errors?.join('; ')||event.subtype):null);
  }
  if(event.type==='transport_error')this.finish('failed',event.error);
 }
 finish(status,error){
  const turn=this.active;if(!turn||turn.completed)return;
  turn.completed=true;const output=turn.output.slice(0,16000);
  if(output)this.trace('message',turn.id,{text:output});
  this.trace('end',turn.id,{status,error});this.busy=false;apiApprovals.abort(this);this.toolScope=null;this.failed=error||null;this.active=null;
  for(const [id,req] of this.approvals){
   try{if(req.engine==='pi')this.transport?.write({type:'extension_ui_response',id:req.wireId,cancelled:true});
    else this.transport?.write({jsonrpc:'2.0',id:req.wireId,result:{outcome:{outcome:'cancelled'}}})}catch{}
   this.approvals.delete(id);
  }
  this.emit(error?'error':'status',error||'Native task completed',{turnId:turn.id,status});this.changed();
  if(this.role.engine==='claude'){const transport=this.transport;this.transport=null;void transport?.close()}
 }
 async interrupt(){
  if(!this.active)return {interrupted:false};
  if(this.role.engine==='pi')this.transport?.write({type:'abort'});
  else if(this.role.engine==='cline')this.transport?.write({jsonrpc:'2.0',method:'session/cancel',params:{sessionId:this.role.collaborationAcpSessionId}});
  else this.active.child?.kill('SIGTERM');
  this.finish('interrupted','Interrupted by operator');return {interrupted:true};
 }
 async close(){this.dead=true;if(this.active)this.finish('interrupted','Companion closed');await this.transport?.close();this.transport=null;await this.endpoint?.close();this.endpoint=null}
}
module.exports={Companion};
