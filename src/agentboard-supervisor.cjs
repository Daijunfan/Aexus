'use strict';
/* CloudHosts-owned, single-instance Aexus supervisor. Never attaches to a
 * standalone Aexus daemon or kills any process it did not spawn. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {randomUUID,randomBytes,createHmac} = require('node:crypto');
const registry = require('./registry.cjs');
const projection = require('./agentboard-host-projection.cjs');

const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const MAX_REPLY = 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const stateOf = (status, instanceId, details={}) => ({status,instanceId,...details});
function fail(message,code='AGENTBOARD_UNAVAILABLE') {return Object.assign(Error(message),{code});}
function httpJson(url,method='GET',headers={},value,timeout=1800) {
  return new Promise((resolve,reject)=>{
    const parsed = new URL(url);
    if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1')return reject(fail('Aexus server must use 127.0.0.1','UNTRUSTED_SERVER'));
    const req=http.request(parsed,{method,headers:{...headers,...(value?{'content-type':'application/json'}:{})},timeout},res=>{
      let body='',bytes=0;
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_REPLY){req.destroy(fail('Response too large'));return}body+=chunk});
      res.on('end',()=>{try{const result=JSON.parse(body);if(res.statusCode<200||res.statusCode>=300)return reject(fail(result.error||'Aexus HTTP '+res.statusCode,result.code||'AEXUS_HTTP_ERROR'));resolve(result)}catch(error){reject(error)}});
    });
    req.on('timeout',()=>req.destroy(fail('Aexus HTTP timeout','AEXUS_TIMEOUT')));
    req.on('error',reject);req.end(value===undefined?undefined:JSON.stringify(value));
  });
}
class AgentBoardSupervisor {
  constructor({home=registry.home,packageRoot=path.resolve(__dirname,'../AgentBoard/Aexus'),nodeExecutable=process.execPath,
      childScript,spawnChild=spawn,startupTimeout=25000,shutdownTimeout=5000,retries=3}={}) {
    this.home=home;
    this.packageRoot=path.resolve(packageRoot);
    this.childScript=childScript??path.join(this.packageRoot,'out/main/daemon.js');
    this.nodeExecutable=nodeExecutable;
    this.spawnChild=spawnChild;
    this.startupTimeout=startupTimeout;
    this.shutdownTimeout=shutdownTimeout;
    this.maxRetries=retries;
    this.dataHome=path.join(home,'AgentBoard','Aexus');
    this.instanceId=randomUUID();
    this.secret=randomBytes(32).toString('hex');
    this.child=null;this.server=null;this.socketPath=null;this.webOrigin=null;this._bridgeSockets=new Set();
    this.status='stopped';this.error=null;this._startPromise=null;this._stopPromise=null;
    this._recoveryTimer=null;this._crashes=0;this._intentional=false;this._readyAt=0;this._bridgeCleanup=null;
  }
  state() {
    return stateOf(this.status,this.instanceId,{url:this.status==='ready'?this.webOrigin:null,
      error:this.error?.message||null,pid:this.child?.pid||null});
  }
  _validateFiles(){
    const pkg=JSON.parse(fs.readFileSync(path.join(this.packageRoot,'package.json'),'utf8'));
    if(!['aexus','agents-company'].includes(pkg.name))throw fail('Bundled Aexus package name is invalid','AEXUS_PACKAGE_INVALID');
    for(const file of [this.childScript,path.join(this.packageRoot,'out/renderer/index.html')])
      if(!fs.existsSync(file))throw fail('Bundled Aexus build is incomplete','AEXUS_NOT_PACKAGED');
    if(!fs.existsSync(this.nodeExecutable))throw fail('Bundled Node executable is missing','NODE_NOT_PACKAGED');
  }
  async _openBridge(){
    const id=randomBytes(12).toString('hex');
    const candidate=path.join(this.dataHome,'host-'+id+'.sock');
    this.socketPath=process.platform==='win32'?'\\\\.\\pipe\\cloudhosts-aexus-'+id:
      Buffer.byteLength(candidate)>95?path.join(os.tmpdir(),'ch-aexus-'+id+'.sock'):candidate;
    const server=net.createServer(socket=>{
      this._bridgeSockets.add(socket);
      socket.once('close',()=>this._bridgeSockets.delete(socket));
      socket.setTimeout(12000,()=>socket.destroy());
      let body='',bytes=0;
      socket.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>65536){socket.destroy();return}
        body+=chunk;
        const at=body.indexOf('\n');if(at<0)return;
        socket.pause();
        let input;
        try{input=JSON.parse(body.slice(0,at))}catch{socket.end(JSON.stringify({ok:false,error:'Invalid JSON',code:'BAD_REQUEST'})+'\n');return}
        void this._hostRequest(input).then(data=>({ok:true,data}),error=>({ok:false,error:error.message,code:error.code||'HOST_BRIDGE_FAILED'}))
          .then(result=>{if(!socket.destroyed)socket.end(JSON.stringify({requestId:input.requestId,...result})+'\n')});
      });
      socket.on('error',()=>{});
    });
    this.server=server;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.socketPath,resolve)});
    if(process.platform!=='win32')fs.chmodSync(this.socketPath,0o600);
  }
  async _closeBridge(){
    const server=this.server,socketPath=this.socketPath;
    this.server=null;this.socketPath=null;
    for(const socket of this._bridgeSockets)socket.destroy();
    if(server)await new Promise(resolve=>server.close(()=>resolve()));
    if(socketPath&&process.platform!=='win32')try{fs.rmSync(socketPath,{force:true})}catch{}
  }
  async _hostRequest(msg){
    if(!msg||msg.protocolVersion!==1||msg.instanceId!==this.instanceId||msg.secret!==this.secret||
       typeof msg.requestId!=='string'||!SAFE_ID.test(msg.requestId)||
       !msg.payload||typeof msg.payload!=='object'||Array.isArray(msg.payload))
       throw fail('Unauthorized host bridge request','HOST_BRIDGE_DENIED');
    // Aexus must already have run original authorize(cmd,args) before reaching this
    // private, child-only backend. Host registry validation is repeated by dispatch.
    const p=msg.payload,method={
      'host.create':'hosts.create','host.update':'hosts.update','host.remove':'hosts.remove',
      'host.check':'hosts.check','host.fingerprints':'hosts.fingerprints',
      'host.trust':'hosts.trust'
    }[msg.type];
    if(!method&&msg.type!=='host.credentials')throw fail('Unknown privileged host bridge type','HOST_BRIDGE_TYPE');
    if(method)return require('./core.cjs').dispatch(method,p);
    if(typeof p.id!=='string'||!p.id||p.id==='local')throw fail('Invalid host credential ID','HOST_BRIDGE_DENIED');
    const host=registry.get(p.id);
    if(host.id!==p.id)throw fail('Host ID must be stable','HOST_BRIDGE_DENIED');
    // Credential bytes never enter host lists, UI messages or model prompts.
    const result={id:host.id,password:registry.password(host.id)};
    if(p.files!==false){
      result.files={};
      for(const field of ['identityFile','knownHosts','sshConfig']){
        if(!host[field])continue;
        const file=path.resolve(host[field].replace(/^~(?=\/)/,os.homedir()));
        const st=fs.statSync(file);
        if(!st.isFile()||st.size>128*1024)throw fail('Credential file is too large','HOST_FILE_REJECTED');
        result.files[field]={path:host[field],content:fs.readFileSync(file,'utf8')};
      }
    }
    return result;
  }
  _env(){
    return {...process.env,
      AGENTS_COMPANY_HOME:this.dataHome,AGENTS_COMPANY_EMBEDDED:'1',AGENTS_COMPANY_PACKAGE_ROOT:this.packageRoot,
      AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_HOST:'127.0.0.1',AGENTS_COMPANY_WEB_PORT:'0',
      AGENTS_COMPANY_HOSTED:'1',AGENTS_COMPANY_HOST_INSTANCE_ID:this.instanceId,
      AGENTS_COMPANY_HOST_BRIDGE_SOCKET:this.socketPath,
      AGENTS_COMPANY_HOST_BRIDGE_SECRET:this.secret,
      AGENTS_COMPANY_HOST_PROJECTION_PATH:projection.filename(this.home),
      // 02 must honor this only with localhost and its hosted health/exchange gates.
      AGENTS_COMPANY_HOST_PARENT_ORIGIN:this._parentOrigin??''
    };
  }
  async start({parentOrigin}={}){
    if(parentOrigin){const url=new URL(parentOrigin);if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/'||url.search||url.hash)throw fail('Invalid CloudHosts origin','UNTRUSTED_PARENT');if(this._parentOrigin&&this._parentOrigin!==url.origin)throw fail('CloudHosts parent origin changed','UNTRUSTED_PARENT');this._parentOrigin=url.origin}
    if(this.status==='ready')return this.state();
    if(this._startPromise)return this._startPromise;
    if(this._stopPromise)await this._stopPromise;
    this._intentional=false;
    this._startPromise=this._start();
    try{return await this._startPromise}finally{this._startPromise=null}
  }
  async _start(){
    this.status='starting';this.error=null;this.webOrigin=null;
    try{
      this._validateFiles();
      fs.mkdirSync(this.dataHome,{recursive:true,mode:0o700});
      projection.publish(registry.load(),this.home);
      if(this._bridgeCleanup)await this._bridgeCleanup;
      await this._openBridge();
      const child=this.spawnChild(this.nodeExecutable,[this.childScript],{
        cwd:this.packageRoot,env:this._env(),stdio:['ignore','pipe','pipe','ipc'],windowsHide:true
      });
      this.child=child;
      let reported=null,exited=null;
      const onMessage=msg=>{
        if(msg?.type==='agents-company:hosted-ready'&&msg.instanceId===this.instanceId&&
           typeof msg.url==='string')reported=msg.url;
      };
      child.on('message',onMessage);
      child.once('error',error=>{this.error=error;exited=error});
      child.once('exit',(code,signal)=>{exited=fail('Aexus Core exited ('+(code??signal)+')','AEXUS_EXITED');this._exited(child,exited)});
      // Diagnostics are bounded in memory; never log control tokens, private
      // paths or streamed model output from the child.
      for(const stream of [child.stdout,child.stderr])stream?.on('data',()=>{});
      const deadline=Date.now()+this.startupTimeout;
      while(Date.now()<deadline){
        if(exited)throw exited;
        if(reported){
          const parsed=new URL(reported);
          if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||!Number(parsed.port))throw fail('Aexus reported an untrusted origin','UNTRUSTED_SERVER');
          const reply=await httpJson(parsed.origin+'/api/hosted/health','GET',{
            'x-agents-host-instance':this.instanceId,'x-agents-host-secret':this.secret
          }).catch(()=>null);
          if(reply?.ok===true&&reply.data?.instanceId===this.instanceId&&reply.data?.coreReady===true&&reply.data?.websocketReady===true){
            if(this.child!==child||exited)throw fail('Aexus exited before ready');
            this.webOrigin=parsed.origin;this.status='ready';this._readyAt=Date.now();return this.state();
          }
        }
        await sleep(120);
      }
      throw fail('Aexus Core readiness/HTTP/WebSocket handshake timed out','AEXUS_START_TIMEOUT');
    }catch(error){
      this.error=error;this.status='failed';
      await this._terminateOwnedChild();
      await this._closeBridge();
      throw error;
    }
  }
  _exited(child,error){
    if(this.child!==child)return;
    const wasReady=this.status==='ready';
    this.child=null;this.webOrigin=null;
    if(this._intentional)return;
    this.status='failed';this.error=error;
    // A restarted Core is a new cryptographic instance even if it selects
    // the same loopback port. Old frames/tickets may never bind to the new one.
    this.instanceId=randomUUID();this.secret=randomBytes(32).toString('hex');
    this._bridgeCleanup=this._closeBridge().catch(()=>{});
    // A child dying during startup is reported to start(); never launch an
    // overlapping replacement before the first readiness check has settled.
    if(!wasReady)return;
    if(Date.now()-this._readyAt>60000)this._crashes=0;
    if(this._crashes>=this.maxRetries)return;
    const delay=[300,900,2700][this._crashes++]??5000;
    clearTimeout(this._recoveryTimer);
    this._recoveryTimer=setTimeout(()=>{if(!this._intentional&&!this._startPromise)
      void this.start().catch(()=>{})},delay);
    this._recoveryTimer.unref?.();
  }
  async _terminateOwnedChild(){
    const child=this.child;
    if(!child)return;
    // IPC orderly shutdown is the only first-stage exit mechanism.
    if(child.connected)try{child.send({type:'agents-company:shutdown'})}catch{}
    const wait=()=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode){resolve();return}
      const timer=setTimeout(()=>{child.off('exit',finish);resolve()},this.shutdownTimeout);
      const finish=()=>{clearTimeout(timer);resolve()};child.once('exit',finish);
    });
    await wait();
    if(child.exitCode===null&&!child.signalCode){
      child.kill('SIGTERM');await wait();
    }
    if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await wait()}
    if(this.child===child)this.child=null;
  }
  async stop(){
    if(this._stopPromise)return this._stopPromise;
    this._intentional=true;clearTimeout(this._recoveryTimer);this._recoveryTimer=null;
    this._stopPromise=(async()=>{
      this.status='stopping';
      if(this._startPromise)try{await this._startPromise}catch{}
      await this._terminateOwnedChild();await this._closeBridge();
      this.status='stopped';this.webOrigin=null;this.error=null;
      this.instanceId=randomUUID();this.secret=randomBytes(32).toString('hex');this._crashes=0;
      return this.state();
    })();
    try{return await this._stopPromise}finally{this._stopPromise=null}
  }
  issueTicket({instanceId,windowId,clientId,parentOrigin}={}){
    if(this.status!=='ready'||instanceId!==this.instanceId)throw fail('Aexus instance is not ready','INSTANCE_MISMATCH');
    if(!SAFE_ID.test(String(windowId||''))||!SAFE_ID.test(String(clientId||''))||parentOrigin!==this._parentOrigin)throw fail('Invalid hosted session binding','HOSTED_BINDING_DENIED');
    const data={purpose:'hosted-embed-login',instanceId:this.instanceId,windowId,clientId,parentOrigin,
      nonce:randomBytes(18).toString('base64url'),expiresAt:Date.now()+20000};
    const encoded=Buffer.from(JSON.stringify(data)).toString('base64url');
    return {ticket:encoded+'.'+createHmac('sha256',this.secret).update(encoded).digest('base64url'),expiresAt:data.expiresAt};
  }
  async coreRead(cmd,args={}){
    if(this.status!=='ready'||!['management.topology','session.status'].includes(cmd))throw fail('Aexus read is unavailable','AEXUS_NOT_READY');
    // Private backend credential. Never expose through AgentBoard RPC.
    const token=fs.readFileSync(path.join(this.dataHome,'control.token'),'utf8').trim();
    const result=await httpJson(this.webOrigin+'/api/rpc','POST',{
      'authorization':'Bearer '+token,'x-request-id':randomUUID()
    },{cmd,args},12000);
    if(result.ok!==true)throw fail(result.error||'Aexus Core rejected request',result.code);
    return result.data;
  }
  async roster(){
    const [topology,status]=await Promise.all([this.coreRead('management.topology'),this.coreRead('session.status')]);
    if(!Array.isArray(topology?.nodes)||!Array.isArray(status))throw fail('Aexus returned invalid roster','AEXUS_ROSTER_INVALID');
    const state=new Map(status.map(value=>[value.id,value]));
    const hosts=new Set(['local',...registry.list().map(host=>host.id)]);
    return {source:'aexus',instanceId:this.instanceId,projectionRevision:projection.read(projection.filename(this.home)).projectionRevision,
      employees:topology.nodes.map(node=>{
        const session=state.get(node.id)||{},work=node.workspace||{},hostId=work.location==='cloud'?work.hostId:'local';
        return {source:'aexus',stableId:node.id,id:node.id,hostId,hostMissing:!hosts.has(hostId),
          directory:work.directory||'',name:node.title||'',team:node.group||'',engine:node.engine,
          managementRole:node.managementRole,kind:node.kind,initialization:node.initialization,
          running:!!session.sessionId,busy:!!session.busy,sessionId:session.sessionId||null};
      })};
  }
  async assertHostUnbound(id){
    if(this.status!=='ready'){
      // Before Aexus ever created a persisted roster, there are no
      // imported roles to occupy this host. Preserve CloudHosts behavior.
      // Once a roster has existed, failures must deny destructive edits.
      if(this.status==='stopped'&&!fs.existsSync(path.join(this.dataHome,'sessions.json')))return;
      throw fail('Cannot verify Aexus host occupancy','AEXUS_OCCUPANCY_UNKNOWN');
    }
    const topology=await this.coreRead('management.topology');
    const team=topology?.teams?.find(team=>team.hostId===id);
    const employee=topology?.nodes?.find(node=>node.workspace?.hostId===id);
    if(team||employee)throw fail('Aexus Team or Employee still uses this host: '+(team?.name||employee?.title),'AEXUS_HOST_IN_USE');
  }
}
let sharedSupervisor=null;
function shared(){return sharedSupervisor??=new AgentBoardSupervisor();}
module.exports={AgentBoardSupervisor,shared,httpJson};
