// One authenticated local connection from the original Codex TUI to the native
// app-server. Neither view disposal nor a transient transport failure changes
// the bound thread identity or creates a second engine session.
const {WebSocketServer}=require('ws');
const {randomBytes}=require('node:crypto');

async function open(agent) {
  if(!agent.role.threadId&&!agent.role.nativePendingThread)
    throw Error('Exact Codex thread ID unavailable; refusing to switch sessions.');
  if(!agent.initialization)throw Error('Codex app-server has not initialized.');
  const token=randomBytes(32).toString('hex');
  const connections=new Set(),requests=new Map(),serverRequests=new Map(),initializedClients=new WeakSet(),boundClients=new WeakSet();
  let closing=false,sequence=0,generation=0,creatingThread=false,lastDiagnostic=null;
  const record=(reason,elapsedMs=0)=>{
    const entry={roleId:agent.role.id,generation,reason,connections:connections.size,elapsedMs:Math.round(elapsedMs),at:Date.now()};
    lastDiagnostic=entry;
    // No authorization token, model messages, work directory or credentials.
    if(reason!=='connected')console.error('CLOUDHOSTS_TUI_BRIDGE '+JSON.stringify(entry));
  };
  const server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:32*1024*1024,
    verifyClient:({req},done)=>{
      const started=Date.now();
      const reason=closing?'closing':req.url!=='/'?'invalid_path':req.headers.origin?'invalid_origin':
        req.headers.authorization!=='Bearer '+token?'invalid_token':connections.size>0?'occupied':null;
      if(reason){record(reason,Date.now()-started);done(false,reason==='occupied'?409:reason==='closing'?503:reason==='invalid_token'?401:403,reason);return}
      done(true);
    }});
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  const send=(socket,payload)=>{if(socket?.readyState===1)socket.send(JSON.stringify(payload))};
  const reject=(socket,id,message)=>send(socket,{id,error:{code:-32000,message}});
  const forwardToServer=packet=>agent.child.stdin.write(JSON.stringify(packet)+'\n');
  const sessionRequests=new Set(['thread/resume','thread/read','thread/compact','thread/rollback','thread/archive','thread/unarchive','turn/start','turn/interrupt','turn/steer']);
  const releaseSocket=socket=>{
    connections.delete(socket);
    // A submitted turn may be accepted by app-server just after the native
    // TUI window closes. Retain that one pending response long enough to
    // record its exact native turn ID and text in the read-only session log;
    // the disconnected UI must never trigger a second submission.
    for(const [id,request] of requests)
      if(request.socket===socket&&!request.creating&&!request.turnText)requests.delete(id);
    // Detaching the view must not deny a pending native approval. Keep the
    // original app-server request ID and replay it to the next authenticated
    // instance of this exact TUI. The model remains blocked until approved.
    for(const request of serverRequests.values())if(request.socket===socket)request.socket=null;
  };
  server.on('connection',socket=>{
    connections.add(socket);generation++;record('connected');
    // The original Codex TUI sends initialize followed by initialized. Hold
    // detached approvals until that protocol handshake completes, so an
    // uninitialized new TUI cannot lose a replay sent too early.
    const replayApprovals=()=>{
      for(const [id,request] of serverRequests)if(!request.socket){
        request.socket=socket;send(socket,{...request.event,id});
      }
    };
    socket.on('message',data=>{
      let message;try{message=JSON.parse(data.toString())}catch{socket.close(1007,'Malformed JSON');return}
      if(!message||typeof message!=='object')return;
      // Server-origin approval / user-input response: never drop JSON-RPC
      // packets lacking a method; translate proxy ID back to the exact call.
      if(typeof message.method!=='string'){
        if(!('id' in message))return;
        const pending=serverRequests.get(String(message.id));
        if(!pending||pending.socket!==socket)return;
        serverRequests.delete(String(message.id));
        forwardToServer({...message,id:pending.id});return;
      }
      const {id,method}=message;
      if(method==='initialize'){if(id!==undefined)send(socket,{id,result:agent.initialization});return}
      if(method==='initialized'){initializedClients.add(socket);replayApprovals();return;}
      const threadId=agent.role.threadId;
      if(method==='config/read'){
        // Resolve configuration on the engine host, in its native cwd.
        // The TUI and app-server use the same host and native installation.
        message.params={...message.params,cwd:agent.controlCwd};
      }
      if(method==='thread/start'||method==='thread/fork'){
        if(method==='thread/start'&&(message.params?.ephemeral||message.params?.threadSource&&message.params.threadSource!=='user')){
          if(id!==undefined)reject(socket,id,'This view keeps the native user conversation, not an auxiliary thread.');return;
        }
        // A resuming stock TUI may first attempt an empty startup thread.
        // Only after it has loaded this card's history can /new or /fork
        // intentionally replace the current recovery cursor.
        if(threadId&&!boundClients.has(socket)){if(id!==undefined)reject(socket,id,'Resume the bound Codex thread before starting another session.');return;}
        if(id===undefined||(!threadId&&!agent.role.nativePendingThread)||creatingThread){
          if(id!==undefined)reject(socket,id,'Native Codex thread creation is pending or its identity is unavailable.');return;
        }
        if(method==='thread/fork'&&(!threadId||message.params?.threadId!==threadId)){reject(socket,id,'Codex thread ID mismatch; refusing an unrelated fork.');return;}
        creatingThread=true;
        message.params={...message.params,...agent.threadOptions,...(method==='thread/start'?{dynamicTools:agent.dynamicTools}:{})};
      }else if(method==='thread/resume'){
        // Native app-server accepts dynamicTools on thread/start, not resume.
        // Keep the exact work route and permissions while preserving the bound ID.
        message.params={...message.params,...agent.threadOptions,threadId:message.params?.threadId};
        delete message.params.dynamicTools;
      }else if(['thread/delete','thread/import','thread/archive','thread/unarchive'].includes(method)){
        if(id!==undefined)reject(socket,id,'This Coding Agent is bound to one Codex thread.');return;
      }
      if(sessionRequests.has(method)&&(!threadId||message.params?.threadId!==threadId)){
        if(id!==undefined)reject(socket,id,'Codex thread ID mismatch; refusing to switch sessions.');return;
      }
      if(method==='turn/start'){
        const p=message.params||{};
        message.params={...p,...agent.threadOptions,threadId};
      }
      if(id!==undefined){
        const proxyId='cloud-tui-'+(++sequence);
        requests.set(proxyId,{socket,id,threadId,resuming:method==='thread/resume',creating:['thread/start','thread/fork'].includes(method),forking:method==='thread/fork',
          turnText:method==='turn/start'&&Array.isArray(message.params?.input)?message.params.input.filter(entry=>entry.type==='text').map(entry=>entry.text).join('\n'):null});message.id=proxyId;
      }
      agent.child.stdin.write(JSON.stringify(message)+'\n',error=>{
        if(!error||id===undefined)return;
        const pending=requests.get(message.id);requests.delete(message.id);
        if(pending?.creating)creatingThread=false;
        reject(socket,id,error.message);
      });
    });
    socket.on('close',()=>releaseSocket(socket));
    socket.on('error',()=>{releaseSocket(socket);socket.terminate()});
  });
  return {
    url:`ws://127.0.0.1:${server.address().port}`,token,
    get diagnostic(){return lastDiagnostic},get generation(){return generation},
    get activeConnections(){return connections.size},get creatingThread(){return creatingThread},
    releaseStale(){for(const socket of [...connections]){releaseSocket(socket);socket.terminate()}},
    handle(event){
      if(typeof event.id==='string'&&requests.has(event.id)){
        const request=requests.get(event.id);requests.delete(event.id);
        if(request.turnText&&event.result?.turn?.id)agent.onTurnAccepted?.(event.result.turn.id,request.turnText,request.threadId);
        if(request.creating){
          creatingThread=false;
          if(event.result?.thread?.id){
            agent.role.threadId=event.result.thread.id;
            agent.role.nativePendingThread=false;
            agent.role.nativeHasInput=request.forking;
            boundClients.add(request.socket);
            agent.changed();
          }
        }
        if(request.resuming&&event.result?.thread?.id===agent.role.threadId)boundClients.add(request.socket);
        send(request.socket,{...event,id:request.id});return true;
      }
      // Bidirectional native JSON-RPC: server requests (approval/question)
      // include id+method and MUST reach the single authenticated native TUI.
      if(event.method&&event.id!==undefined){
        if(closing)return false;
        if(serverRequests.size>=64){
          forwardToServer({id:event.id,error:{code:-32000,message:'Too many pending native approvals'}});
          return true;
        }
        const socket=[...connections].find(value=>value.readyState===1&&initializedClients.has(value))||null;
        const id='cloud-server-'+(++sequence);
        serverRequests.set(id,{id:event.id,socket,event});
        if(socket)send(socket,{...event,id});
        return true;
      }
      if(event.method&&event.id===undefined)for(const socket of connections)send(socket,event);
      return false;
    },
    async close(){
      if(closing)return;closing=true;
      for(const socket of [...connections]){releaseSocket(socket);socket.terminate()}
      requests.clear();serverRequests.clear();
      await new Promise(resolve=>server.close(resolve));
    }
  };
}
module.exports={open};
