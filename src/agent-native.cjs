// Native Codex protocol adapted from Aexus codex-native.ts / codex-executor.ts.
// GPL-3.0-only. No Company initialization, management tools or routing prompts.
const {createInterface} = require('node:readline');
const hosts = require('./agent-hosts.cjs');
const routeTransport = require('./agent-route.cjs');
const tuiBridge = require('./agent-tui-bridge.cjs');
const journal = require('./session-journal.cjs');
const FLAGS = ['-c','mcp_servers={}','-c','skills.include_instructions=false','-c','skills.bundled.enabled=false',
  '-c','include_apps_instructions=false','-c','memories.use_memories=false','-c','memories.generate_memories=false',
  '--disable','memories','--disable','apps','--disable','hooks','--disable','plugins','--disable','chronicle','--disable','multi_agent'];
const APPROVALS = new Set(['item/commandExecution/requestApproval','item/fileChange/requestApproval']);
const collaborationMcp=require('./collaboration-mcp.cjs');
const apiApprovals=require('./api-approvals.cjs');
class NativeAgent {
  constructor(role, changed, options = {}) {
    this.requireResume=options.requireResume===true;this.deferThread=options.deferThread===true;this.role = role; this.changed = changed; this.sequence = 0; this.cursor = 0;
    this.pending = new Map(); this.approvals = new Map(); this.events = []; this.apiApprovalCallbacks=new Map();
    this.bytes = 0; this.busy = false; this.dead = false; this.failed = false; this.accepting = false; this.stderr = ''; this.toolScope=null; this.dynamicTools=[];
  }
  emit(event) {
    const value = {...event,seq:++this.cursor,time:Date.now()};
    const bytes = Buffer.byteLength(JSON.stringify(value));
    this.events.push({value,bytes}); this.bytes += bytes;
    while (this.bytes > 512*1024 && this.events.length > 1) this.bytes -= this.events.shift().bytes;
  }
  status(status, patch = {}) {Object.assign(this.role,patch,{status,busy:this.busy});this.changed();}
  observe(event){try{journal.observe(this.role,event)}catch(error){console.error('CloudHosts native event journal:',error.message)}}
  onTurnAccepted(turnId,text,threadId=this.role.threadId){
    if(threadId===this.role.threadId){this.role.nativeHasInput=true;this.changed()}
    try{journal.accepted({...this.role,threadId},turnId,text)}catch(error){console.error('CloudHosts native journal accepted turn:',error.message)}
  }
  call(method,params) {
    if (this.dead) return Promise.reject(Error('原生引擎连接已关闭'));
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {this.pending.delete(id);reject(Error(method + ' 响应超时；请求不会自动重发'));},30000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,method,params})+'\n',error => {if (!error) return;clearTimeout(timer);this.pending.delete(id);reject(error);});
    });
  }
  fail(error) {
    if (this.dead) return;
    this.dead = true;this.busy = false;
    for (const request of this.pending.values()) {clearTimeout(request.timer);request.reject(error);}
    this.pending.clear();this.approvals.clear();
    if (!this.closing) {this.failed = true;this.emit({kind:'error',text:error.message});this.status('error',{running:false,error:error.message});void this.close();}
  }
  async handleGroupTool(event){
    const params=event.params||{};
    let result;
    try{
      const input=typeof params.arguments==='string'?JSON.parse(params.arguments):params.arguments;
      const value=await collaborationMcp.invoke(this,params.tool,input,String(params.callId||event.id),
        {threadId:params.threadId,turnId:params.turnId});
      result={success:true,contentItems:[{type:'inputText',text:JSON.stringify(value)}]};
    }catch(error){result={success:false,contentItems:[{type:'inputText',text:error.message}]}}
    this.child.stdin.write(JSON.stringify({id:event.id,result})+'\n');
  }
  notification(event) {
    if (event.id !== undefined && event.method) {
      if(event.method==='item/tool/call'){void this.handleGroupTool(event);return}
      if (APPROVALS.has(event.method) || ['item/tool/requestUserInput','tool/requestUserInput'].includes(event.method)) {
        const request = {id:String(event.id),wireId:event.id,method:event.method,params:event.params || {}};
        this.approvals.set(request.id,request);
        this.emit({kind:'approval',requestId:request.id,method:request.method,params:request.params});
        this.status('approval');
      } else this.child.stdin.write(JSON.stringify({id:event.id,error:{code:-32601,message:'This operation is not supported by CloudHosts'}})+'\n');
      return;
    }
    const waiter = this.pending.get(event.id);
    if (waiter) {this.pending.delete(event.id);clearTimeout(waiter.timer);event.error ? waiter.reject(Error(event.error.message)) : waiter.resolve(event.result);return;}
    const p = event.params || {}, item = p.item;
    if (p.threadId && this.role.threadId && p.threadId !== this.role.threadId) return;
    if (event.method === 'serverRequest/resolved') {this.approvals.delete(String(p.requestId));this.emit({kind:'approval-resolved',requestId:String(p.requestId)});this.status(this.approvals.size ? 'approval' : this.busy ? 'busy' : 'idle');}
    if (event.method === 'turn/started') {this.turnId = p.turn.id;if(this.toolScope&&!this.toolScope.turnId)this.toolScope.turnId=p.turn.id;this.busy = true;this.status('busy');}
    if (event.method === 'item/agentMessage/delta') this.emit({kind:'delta',itemId:p.itemId,text:p.delta});
    if (event.method === 'item/commandExecution/outputDelta') this.emit({kind:'tool-delta',itemId:p.itemId,text:p.delta});
    if (event.method === 'item/started' && ['commandExecution','fileChange'].includes(item?.type)) this.emit({kind:'tool',itemId:item.id,text:item.command || '文件修改',tool:item.type});
    if (event.method === 'item/completed' && item?.type === 'agentMessage') this.emit({kind:'message',itemId:item.id,text:item.text || ''});
    if (event.method === 'item/completed' && item?.type === 'commandExecution') this.emit({kind:'tool-result',itemId:item.id,text:item.aggregatedOutput || '',exitCode:item.exitCode});
    if (event.method === 'item/completed' && item?.type === 'fileChange') this.emit({kind:'tool-result',itemId:item.id,text:JSON.stringify(item.changes || []),status:item.status});
    if (event.method === 'turn/completed') {
      this.busy = false;apiApprovals.abort(this);this.toolScope=null;this.approvals.clear();
      const error = p.turn?.error?.message;
      this.emit({kind:error ? 'error' : 'status',text:error || (p.turn?.status === 'interrupted' ? '任务已中止' : '本轮完成')});
      this.status(error ? 'error' : 'idle',{error:error || undefined});
    }
    if (event.method === 'error' && !p.willRetry) {this.busy = false;this.emit({kind:'error',text:p.error?.message || '引擎请求失败'});this.status('error',{error:p.error?.message});}
  }
  async start() {
    const source = hosts.get(this.role.engineHostId), target = hosts.get(this.role.targetHostId);
    // Same-host Codex is a direct native app-server on the actual work host.
    // The controller never starts an exec-server, reverse SSH or model proxy
    // for this common path. Only Core-local Codex -> remote host is offered
    // as a new routed role. Old cross-cloud roles remain legible and resumable.
    this.routed = source.id !== target.id;
    this.mode = this.routed ? source.id === 'local' ? 'controller-remote' : 'legacy-crosshost' : 'same-host';
    this.controlCwd = this.routed ? source.defaultDirectory : this.role.cwd;
    this.environments = this.routed ? [{environmentId:'remote',cwd:this.role.cwd,runtimeWorkspaceRoots:[this.role.cwd]}] : [];
    // Cloud targets carry a deterministic policy from the role's permission:
    // full -> no prompts, restricted -> on-request. The local Mac keeps its own
    // native profile (no prompt injection), so same-host local runs untouched.
    this.threadOptions = {cwd:this.controlCwd,
      ...(target.id !== 'local' ? {approvalPolicy:this.role.permission === 'full' ? 'never' : 'on-request',sandbox:this.role.permission === 'full' ? 'danger-full-access' : 'workspace-write'} : {}),
      ...(this.routed ? {environments:this.environments}: {})};
    // Bind the persistent thread to its actual engine account and CODEX_HOME.
    // Existing legacy IDs are associated only after the old thread really
    // resumes; conflicting identity always fails without trying another ID.
    const identity=await hosts.identity(source);
    const targetPath=target.os==='windows'?require('node:path').win32.normalize(this.role.cwd).toLowerCase():require('node:path').posix.normalize(this.role.cwd);
    const expected={...identity,workHostId:target.id,workHostAddress:target.id==='local'?require('node:os').hostname():target.host,workDir:targetPath};
    if(this.role.engineIdentity){
      for(const field of ['sourceId','address','os','account','dataDir','workHostId','workHostAddress','workDir'])
        if(this.role.engineIdentity[field]!==expected[field])
          throw Error('Exact Codex environment changed ('+field+'). Keep the original thread and verify its source host, account, CODEX_HOME and work directory before reconnecting.');
    }
    this.identity=expected;
    await hosts.checkDirectory(target,this.role.cwd);
    // Agent Board never installs application collaboration tools or prompts.
    // Role Board's isolated Aexus Core owns those capabilities and sessions.
    if(this.routed)this.route = await routeTransport.open(source,target,this.role.cwd);
    try {
      this.child = hosts.processOn(source,'codex',[...(this.routed ? FLAGS : []),'app-server','--listen','stdio://'],
        {cwd:this.controlCwd,environment:this.routed ? {CODEX_EXEC_SERVER_URL:this.route.url} : {}});
      this.route?.onDisconnect(error => this.fail(error));
      this.lines = createInterface({input:this.child.stdout});
      this.lines.on('line',line => {let event;try {event = JSON.parse(line);} catch {return;}this.observe(event);if(event.method==='item/tool/call'){this.notification(event);return}if(this.tui?.handle(event))return;this.notification(event);});
      this.child.stderr.on('data',data => {this.stderr = (this.stderr + data).slice(-4000);});
      this.child.on('error',error => this.fail(error));this.child.stdin.on('error',error => this.fail(error));
      this.child.once('close',code => this.fail(Error(this.route?.error() || this.stderr.trim() || '原生引擎已退出（' + code + '）')));
      this.initialization = await this.call('initialize',{clientInfo:{name:'cloud_hosts',version:'1'},capabilities:{experimentalApi:true}});
      this.child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
      // The remote execution environment is only used by the explicit
      // Mac-controller Codex mode or by untouched legacy routed roles.
      if(this.routed)await this.call('environment/info',{environmentId:'remote'});
      const options = {...this.threadOptions,...(this.dynamicTools.length?{dynamicTools:this.dynamicTools}:{})};
      // A role is bound to its exact Codex thread. A missing rollout is a hard
      // recovery error: NEVER create a fresh thread under the old role ID.
      // Reconnecting other threads (including "--last") would silently load
      // unrelated instructions and corrupt the user's session context.
      if (this.requireResume && !this.role.threadId && !this.role.nativePendingThread)
        throw Error('Exact Codex thread ID is missing; this role cannot be resumed safely.');
      const requestedId = this.role.threadId;
      if(!requestedId)this.role.nativeHasInput=false;
      // Fresh GUI roles belong to the ORIGINAL TUI. Let that TUI create its
      // own first thread, and record the exact ID returned by app-server.
      // An existing ID must always resume precisely that thread.
      if (!requestedId && (this.deferThread || this.role.nativePendingThread)) {
        this.role.nativePendingThread=true;
      } else {
        let result;
        try{result=requestedId
          ? await this.call('thread/resume',{...this.threadOptions,threadId:requestedId})
          : await this.call('thread/start',options)}
        catch(error){
          if(this.role.nativeHasInput!==false||!/no rollout found|thread.{0,80}not found/i.test(error.message))throw error;
          // Codex does not save a rollout until the first real turn. Let its
          // original TUI open a fresh empty thread; never fabricate a prompt.
          delete this.role.threadId;this.role.nativePendingThread=true;this.changed();
        }
        if(result){
        if (requestedId && result.thread?.id !== requestedId)
          throw Error('Codex returned a different thread ID. Refusing to switch sessions.');
        if (!result.thread?.id) throw Error('Codex did not return a thread ID.');
        this.role.threadId=result.thread.id;
        try{journal.imported(this.role,result.thread)}catch(error){console.error('CloudHosts native transcript import:',error.message)}
        if (Array.isArray(result.thread.turns)) for (const turn of result.thread.turns) for (const item of turn.items || []) {
          if (item.type === 'agentMessage') this.emit({kind:'message',itemId:item.id,text:item.text || ''});
          if (item.type === 'userMessage') this.emit({kind:'user',text:(item.content || []).map(c => c.text || '').join('\n')});
        }
        }
      }
      if(!this.role.engineIdentity){this.role.engineIdentity=this.identity;this.changed();}
      this.status('idle',{running:true,error:undefined});
      return this;
    } catch (error) {await this.close();throw error;}
  }
  async tuiEndpoint(){
    if(this.dead||this.closing||!this.role.running)throw Error('Codex session is not running.');
    if(!this.tui)this.tui=await tuiBridge.open(this);
    const source=hosts.get(this.role.engineHostId);
    if(source.id==='local')return {url:this.tui.url,token:this.tui.token};
    if(!this.tuiForward||this.tuiForward.child.exitCode!==null||this.tuiForward.child.signalCode!==null){
      await routeTransport.stop(this.tuiForward?.child);
      this.tuiForward=await routeTransport.reverseForward(source,Number(new URL(this.tui.url).port));
    }
    return {url:'ws://127.0.0.1:'+this.tuiForward.port,token:this.tui.token};
  }
  async send(text,scope) {
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 256*1024) throw Error('消息不能为空，且不得超过 256 KiB');
    if (this.dead || this.closing) throw Error('会话已停止，请重新启动');
    if (this.busy || this.accepting) throw Error('当前任务尚未完成，请先中止或等待结束');
    if(!this.role.threadId){
      if(!this.role.nativePendingThread)throw Error('Exact Codex thread ID missing; refusing to use another session.');
      const result=await this.call('thread/start',{...this.threadOptions,dynamicTools:this.dynamicTools});
      if(!result.thread?.id)throw Error('Codex failed to create the requested new thread.');
      this.role.threadId=result.thread.id;this.role.nativePendingThread=false;this.changed();
    }
    this.accepting = true;this.busy = true;this.toolScope=scope?{...scope,agentId:this.role.id,turnId:null}:{source:'private',agentId:this.role.id,turnId:null};this.status('busy');
    this.emit({kind:'user',text});
    try {
      // Only the exact submitted text becomes user input. Transport data stays outside the model context.
      const result = await this.call('turn/start',{...this.threadOptions,threadId:this.role.threadId,input:[{type:'text',text}]});
      this.turnId = result.turn.id;if(this.toolScope)this.toolScope.turnId=this.turnId;this.onTurnAccepted(this.turnId,text);return {accepted:true,turnId:this.turnId};
    } catch (error) {this.emit({kind:'error',text:error.message});this.toolScope=null;this.status('uncertain',{error:error.message});throw error;}
    finally {this.accepting = false;}
  }
  read(cursor = 0) {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw Error('Invalid Agent cursor');
    return {events:this.events.filter(e => cursor > this.cursor || e.value.seq > cursor).map(e => e.value),cursor:this.cursor,reset:cursor > this.cursor || cursor > 0 && cursor < (this.events[0]?.value.seq || 1)-1,
      running:!this.dead,busy:this.busy,turnId:this.busy?this.turnId:null,status:this.role.status,approvals:[...this.approvals.values()].map(({wireId,...request}) => request)};
  }
  approveApi(input){return apiApprovals.request(this,input)}
  async respond(args) {
    if(apiApprovals.respond(this,args))return {accepted:true};
    const request = this.approvals.get(String(args.requestId));
    if (!request) throw Error('此确认请求已失效');
    let result;
    if (APPROVALS.has(request.method)) {
      if (!['accept','decline','cancel'].includes(args.decision)) throw Error('Invalid approval decision');
      const available = request.params.availableDecisions;
      if (Array.isArray(available) && !available.includes(args.decision)) throw Error('引擎未提供此确认选项');
      result = {decision:args.decision};
    } else {
      const questions = request.params.questions || [];
      if (!args.answers || typeof args.answers !== 'object' || Array.isArray(args.answers) || questions.some(q => !Array.isArray(args.answers[q.id]?.answers) || args.answers[q.id].answers.some(v => typeof v !== 'string'))) throw Error('请回答引擎提出的问题');
      result = {answers:args.answers};
    }
    await new Promise((resolve,reject) => this.child.stdin.write(JSON.stringify({id:request.wireId,result})+'\n',error => error ? reject(error) : resolve()));
    this.approvals.delete(request.id);this.emit({kind:'approval-resolved',requestId:request.id});this.status(this.approvals.size ? 'approval' : 'busy');return true;
  }
  interrupt() {
    if (!this.busy) return Promise.resolve({interrupted:false});
    if (!this.turnId) throw Error('任务正在提交，尚未返回编号；可使用“停止会话”关闭该会话');
    return this.call('turn/interrupt',{threadId:this.role.threadId,turnId:this.turnId});
  }
  close() {
    if (this.closing) return this.closing;
    this.closing = Promise.resolve().then(async () => {
      apiApprovals.abort(this);this.fail(Error('会话已停止'));this.lines?.close();
      await Promise.all([this.tui?.close(),routeTransport.stop(this.child),this.route?.close(),routeTransport.stop(this.tuiForward?.child)]);
      this.busy = false;this.toolScope=null;this.status(this.failed ? 'error' : 'stopped',{running:false});
    });
    return this.closing;
  }
}
module.exports = {NativeAgent,FLAGS,open:async (role,changed,options) => new NativeAgent(role,changed,options).start()};
