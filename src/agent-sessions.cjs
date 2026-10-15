// Persistent Agent roles; launch host, target host and native session identities stay independent.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const registry = require('./registry.cjs');
const terminals = require('./terminals.cjs');
const hosts = require('./agent-hosts.cjs');
const native = require('./agent-native.cjs');
const {Companion}=require('./agent-companion.cjs');
const ENGINES = hosts.ENGINES;
const labels = {codex:'Codex',claude:'Claude Code',cline:'Cline',pi:'Pi'};
const file = path.join(registry.home,'agents.json');
const records = new Map(), live = new Map(), companions=new Map(), ptyRoutes=new Map(), opening = new Set();
let loaded = false, shuttingDown = false;
const launches = new Set();
const isAgent = item => item.kind === 'agent' && ENGINES.includes(item.engine);
const activations = new Map(), creations = new Map(), tuiLaunches = new Map();
const missingSession = error => /no rollout found for thread id|unknown thread id|thread.{0,100}not found|Exact (?:Codex|Claude Code|Pi|Cline) session ID is missing|Exact Codex thread ID is missing|legacy Codex TUI role has no exact session ID/i.test(error?.message || '');
const failureState=error=>{
 const message=String(error?.message||'');
 if(/refresh token|access token|sign in|log.?in|not authenticated|authentication required|unauthorized|credential invalid/i.test(message))return 'login-required';
 if(missingSession(error)||/exact Codex environment changed|thread ID mismatch|session data directory|unverified historical/i.test(message))return 'review';
 if(/SSH|network|timeout|timed out|connection refused|ECONN|EHOST|ENET|transport|socket/i.test(message))return 'offline';
 return 'error';
};
const safeRetry=error=>failureState(error)==='offline';
// Each native TUI role keeps its own engine session identity whenever supported.
function cliArguments(item,{recover=false,fresh=false}={}){
  if(item.engine==='claude'){
    if(recover){
      if(!item.nativeSessionId)throw Error('Exact Claude Code session ID is missing. Refusing --continue, which may select another session.');
      return ['--resume',item.nativeSessionId];
    }
    if(!item.nativeSessionId)item.nativeSessionId=randomUUID();return ['--session-id',item.nativeSessionId];
  }
  if(item.engine==='pi'){
    if(recover&&!item.nativeSessionId)throw Error('Exact Pi session ID is missing; refusing unrelated recovery.');
    if(!item.nativeSessionId)item.nativeSessionId=randomUUID();
    return ['--session-id',item.nativeSessionId];
  }
  if(item.engine==='cline'){
    if(!item.nativeSessionId)throw Error('Exact Cline session ID is missing; refusing to start another conversation.');
    return ['--id',item.nativeSessionId,'--tui'];
  }
  if(item.engine==='codex'&&recover){
    if(!item.nativeSessionId)throw Error('This legacy Codex TUI role has no exact session ID. Refusing resume --last because it could open another session.');
    return ['resume',item.nativeSessionId];
  }
  return [];
}

function load() {
  if (loaded) return;
  if (fs.existsSync(file)) for (const item of JSON.parse(fs.readFileSync(file,'utf8'))) {
    records.set(item.id,{...item,terminalId:undefined,running:false,busy:false,status:'stopped'});
  }
  loaded = true;
}
function save() {
  registry.ensure();
  const rows = [...records.values()].map(({terminalId,running,busy,status,...item}) => item);
  fs.writeFileSync(file+'.tmp',JSON.stringify(rows,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);
}
function title(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100 || /[\x00-\x1f\x7f]/.test(value)) throw Error('会话名称须为 1–100 个字符，不能包含控制字符');
  return value.trim();
}
function view(item) {
  const result = {...item,hostId:item.targetHostId,kind:'agent'};
  const source=hosts.get(item.engineHostId),target=hosts.get(item.targetHostId);
  // Cached host health is independent from engine/TUI state. Unknown is never
  // represented as online, and reading a role does not initiate an SSH probe.
  const connected=host=>host.id==='local'?'online':host.status?.connected===true?'online':host.status?.connected===false?'offline':'unknown';
  result.engineHostState=connected(source);
  result.workHostState=connected(target);
  // Running app-server, session history, and attached TUI are independent.
  // The transient PTY is kept in `records`, not on this display snapshot.
  if(item.engine==='codex'&&item.transport==='native'){
    const terminal=item.terminalId&&terminals.listTerminals().find(t=>t.id===item.terminalId);
    result.engineState=opening.has(item.id)?'starting':item.running?'running':'stopped';
    result.historyState=item.threadId?'bound':item.nativePendingThread?'pending':'unavailable';
    // The PTY broker may be alive while the native TUI itself failed its
    // authenticated WS handshake. Readiness requires the actual bridge client.
    result.tuiState=terminal?.running ? live.get(item.id)?.tui?.activeConnections ? 'ready' : 'attaching'
      : item.terminalId?'disconnected':'detached';
    result.tuiGeneration=item.tuiGeneration||0;
  }
  if (item.transport === 'pty' && item.terminalId) {
    const terminal = terminals.listTerminals('host:'+item.targetHostId).find(t => t.id === item.terminalId);
    result.running = !!terminal?.running && item.running;result.exitCode = terminal?.exitCode;
    result.status = opening.has(item.id)&&!item.running ? 'starting' : result.running ? 'running' : item.error ? (item.status||failureState(Error(item.error))) : 'stopped';
  }
  const companion=companions.get(item.id);
  if(companion){const state=companion.view();result.busy=!!state.busy;result.collaborationBusy=!!state.busy;result.collaborationStatus=state.status;result.collaborationMode='independent';}
  return result;
}
function sessions(id) {
  load();
  const targetId = id ? hosts.get(id).id : undefined;
  const known = new Set([...records.values()].map(item => item.terminalId));
  const legacy = terminals.listTerminals().filter(item => isAgent(item) && !known.has(item.id)).map(({employee,...item}) => {
    const hostId = employee.slice(5), host = hosts.publicHost(hosts.get(hostId));
    return {...item,name:labels[item.engine]+' · '+item.id.slice(0,6),transport:'pty',terminalId:item.id,engineHostId:hostId,targetHostId:hostId,hostId,engineHost:host,targetHost:host,status:item.running ? 'running' : 'stopped'};
  });
  return [...records.values()].map(view).concat(legacy).filter(item => !targetId || item.targetHostId === targetId);
}
// The CLI and GUI share one persisted slot order. Dragging two tiles is a
// direct swap, never a change of target machine or engine launch location.
function orderedRoleIds(id) {
  const hostId=hosts.get(id).id;
  const visible=sessions(hostId).map(item=>item.id);
  const stored=registry.workspace().agentBoard.roleOrder?.[hostId]||[];
  return [...stored.filter(key=>visible.includes(key)), ...visible.filter(key=>!stored.includes(key))];
}
function order(args) {
  const id=hosts.get(args.id||'local').id;
  const ordered=orderedRoleIds(id);
  const byId=new Map(sessions(id).map(item=>[item.id,item]));
  return {hostId:id,order:ordered,roles:ordered.map(key=>byId.get(key))};
}
function swap(args) {
  const id=hosts.get(args.id||'local').id;
  const first=String(args.first||''),second=String(args.second||'');
  if(!first||!second||first===second)throw Error('Two distinct Agent session IDs are required');
  const ids=orderedRoleIds(id),a=ids.indexOf(first),b=ids.indexOf(second);
  if(a<0||b<0)throw Error('Both Agent sessions must work on the selected host');
  [ids[a],ids[b]]=[ids[b],ids[a]];
  const current=registry.workspace();
  registry.workspace({agentBoardPatch:{roleOrder:{...current.agentBoard.roleOrder,[id]:ids}}});
  return {hostId:id,order:ids};
}
function session(id, agent) {
  const targetId = hosts.get(id).id;
  const item = sessions().find(item => item.id === agent || item.terminalId === agent);
  if (!item || item.targetHostId !== targetId) throw Error('Agent 会话不存在或不属于该工作主机');
  return item;
}
const identify = args => session(args.id,args.session || args.terminal);
function launch(item, args = {}) {
  if (shuttingDown) return Promise.reject(Error('服务正在退出，不能再启动 Agent'));
  const task = launchRole(item,args);launches.add(task);
  task.then(() => launches.delete(task),() => launches.delete(task));return task;
}
async function launchRole(item, args = {}) {
  if (opening.has(item.id) || view(item).running) throw Error('此会话已在运行或启动中');
  const source = hosts.get(item.engineHostId), target = hosts.get(item.targetHostId);
  opening.add(item.id);item.status = 'starting';item.running=false;item.error = undefined;
  try {
    const found = await hosts.capabilities(source.id);
    if (shuttingDown) throw Error('服务正在退出，Agent 启动已取消');
    if (!found.engines[item.engine]) throw Error(source.name+' 尚未安装 '+labels[item.engine]+' CLI');
    if (item.transport === 'native') {
      const connection = await native.open(item,save,{requireResume:args.recover===true,deferThread:!item.threadId&&!args.recover});live.set(item.id,connection);
    } else {
      await hosts.checkDirectory(target,item.cwd);
      if (shuttingDown) throw Error('服务正在退出，Agent 启动已取消');
      if (item.terminalId && terminals.listTerminals().some(t => t.id === item.terminalId)) await terminals.close(item.terminalId);
      await ptyRoutes.get(item.id)?.close();ptyRoutes.delete(item.id);
      let route;
      if(source.id!==target.id){
        if(source.id!=='local'||!['pi','cline','claude'].includes(item.engine))throw Error('This native CLI has no transparent execution adapter');
        item.controlCwd ||= path.join(registry.home,'native-clients',item.id);
        fs.mkdirSync(item.controlCwd,{recursive:true,mode:0o700});save();
        if(item.engine==='claude')require('./agent-cli.cjs').trustClaudeController(item.controlCwd);
        const adapter=item.engine==='cline'?'agent-cline-route':item.engine==='claude'?'agent-claude-route':'agent-route-io';
        route=await require('./'+adapter+'.cjs').open(item,{controlCwd:item.controlCwd,save});
        if(route.nativeSessionId){item.nativeSessionId=route.nativeSessionId;item.nativeHasInput=route.nativeHasInput;save()}
        ptyRoutes.set(item.id,route);
      }
      const owner = {id:'host:'+target.id,...(route ? {cwd:item.controlCwd} : target.id === 'local' ? {cwd:item.cwd} : {remote:registry.target(target.id,item.cwd)})};
      if(item.engine==='cline'&&source.id===target.id){
        const state=await require('./agent-cli.cjs').createClineSession(target,item.cwd,item.nativeSessionId,item.nativeHasInput);
        item.nativeSessionId=state.sessionId;item.nativeHasInput=state.hasInput;
        save();
      }
      let cliArgs=cliArguments(item,{recover:args.recover===true,fresh:args.fresh===true});
      if(item.engine==='claude')cliArgs=await require('./agent-cli.cjs').prepareClaudeSession(item,{recover:args.recover===true});
      if(item.engine==='pi')cliArgs=await require('./agent-cli.cjs').preparePiSession(item);
      if(route?.args)cliArgs.push(...route.args);
      if(route&&item.engine==='pi')cliArgs.push('--no-builtin-tools','--no-extensions','--no-skills','--no-context-files','--no-prompt-templates',
        '--tools',['read',target.os==='windows'?'powershell':'bash','edit','write','ls','find','grep'].join(','),
        '--extension',path.join(__dirname,'../Runtime/pi_route.mjs'));
      const terminal = terminals.openTerminal(owner,args.cols ?? 100,args.rows ?? 28,{kind:'agent',engine:item.engine,command:item.engine,args:cliArgs,
        ...(route ? {environment:route.environment,onClose:()=>{void route.close().finally(()=>{if(ptyRoutes.get(item.id)===route)ptyRoutes.delete(item.id)})}} : {}),...(source.id === 'local' ? {executable:hosts.binary(item.engine)} : {})});
      item.terminalId = terminal.id;
      route?.onExit?.(error=>{
        item.error=error.message;item.status=failureState(error);save();
        if(terminals.listTerminals().some(t=>t.id===terminal.id))void terminals.close(terminal.id);
      });
      if(route)await route.ready();
      item.startedOnce=true;
      item.running = terminal.running;item.status = terminal.running ? 'running' : 'stopped';
    }
    save();return view(item);
  } catch (error) {
    if(ptyRoutes.has(item.id)){
      const route=ptyRoutes.get(item.id);
      if(item.terminalId&&terminals.listTerminals().some(t=>t.id===item.terminalId))await terminals.close(item.terminalId);
      await route.close();ptyRoutes.delete(item.id);item.terminalId=undefined;
    }
    item.running = false;item.busy = false;item.status = failureState(error);item.error = error.message;save();throw error;
  }
  finally {opening.delete(item.id);}
}
async function open(args) {
  load();
  const source = hosts.get(args.engineHostId || args.id || 'local');
  const target = hosts.get(args.targetHostId || args.targetId || source.id);
  const engine = args.engine;
  if (!ENGINES.includes(engine)) throw Error('不支持的 Agent 引擎');
  // New roles are limited to the straightforward same-host model, plus
  // supported native engines on the current controller working on a registered remote.
  // Existing legacy cloud-to-cloud roles are preserved, never migrated here.
  if (source.id !== target.id && !(source.id === 'local' && target.id !== 'local'))
    throw Error('Only same-host Agents or supported controller-local engines working on a remote host can be created. Existing legacy roles retain their original identities.');
  // Verify the explicit Mac/Core -> cloud native capability BEFORE saving a
  // new role. Same-host Agent launches never pay this routing probe cost.
  if(source.id!==target.id){
    const support=await hosts.capabilities(source.id,target.id,engine);
    if(!support.transparentRouting[engine]||!support.routingVerified)
      throw Error(support.routingNote||'The selected remote execution protocol is not available');
  }
  const cwd = hosts.directory(target,args.directory);
  const permission = args.permission ?? 'ask';
  if (!['ask','full'].includes(permission)) throw Error('Invalid Agent permission');
  const creationId = args.creationId;
  if (creationId !== undefined && (typeof creationId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(creationId))) throw Error('Invalid Agent creation ID');
  const previous = creationId && [...records.values()].find(item => item.creationId === creationId);
  if (previous && (previous.engine !== engine || previous.engineHostId !== source.id || previous.targetHostId !== target.id || previous.cwd !== cwd || previous.permission !== permission)) throw Error('This creation ID belongs to a different Agent request');
  if (creationId && creations.has(creationId)) return creations.get(creationId);
  if (previous && view(previous).running) return view(previous);
  const item = previous || {id:randomUUID(),creationId,name:title(args.name || labels[engine]+' '+(records.size+1)),engine,engineHostId:source.id,targetHostId:target.id,
    engineHost:hosts.publicHost(source),targetHost:hosts.publicHost(target),cwd,permission,
    routeMode:source.id===target.id?'same-host':'controller-remote',transport:engine==='codex' ? 'native' : 'pty',createdAt:Date.now(),running:false,busy:false,status:'stopped'};
  records.set(item.id,item);save();
  const task = launch(item,{...args,recover:!!(previous && (item.startedOnce || item.threadId))}).catch(error => {
    // A plain CLI retry must not accumulate roles which never created a session.
    // GUI retries carry a stable creation ID and reuse their original role.
    if (!creationId && !item.startedOnce && !item.threadId) {records.delete(item.id);save();}
    throw error;
  }).finally(() => {if (creationId) creations.delete(creationId);});
  if (creationId) creations.set(creationId,task);
  return task;
}
async function close(args) {
  const item = identify(args);
  if (opening.has(item.id)) throw Error('会话仍在启动，请待启动完成后停止');
  if (tuiLaunches.has(item.id)) await tuiLaunches.get(item.id);
  await live.get(item.id)?.close();live.delete(item.id);
  await companions.get(item.id)?.close();companions.delete(item.id);
  if (item.terminalId && terminals.listTerminals().some(t => t.id === item.terminalId)) await terminals.close(item.terminalId);
  await ptyRoutes.get(item.id)?.close();ptyRoutes.delete(item.id);
  if (records.has(item.id)) {Object.assign(records.get(item.id),{terminalId:undefined,running:false,busy:false,status:'stopped',error:undefined});save();}
  return true;
}
function rename(args) {
  const item = identify(args), name = title(args.name);
  if (!records.has(item.id)) records.set(item.id,item);
  records.get(item.id).name = name;save();return view(records.get(item.id));
}
async function activate(args){
 const item=identify(args);
 if(view(item).running)return view(item);
 if(activations.has(item.id))return activations.get(item.id);
 const task=(async()=>{
  if(!records.has(item.id))records.set(item.id,item);
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
   try{
    if(live.has(item.id)){await live.get(item.id).close();live.delete(item.id);}
    await launch(records.get(item.id),{...args,recover:true});
    if(item.transport==='pty'){
      // Retry the SAME native identity. A quick exit alone does not prove that
      // its conversation is gone; authentication and transport errors can exit too.
      for(let n=0;n<8;n++){
        await new Promise(resolve=>setTimeout(resolve,110));
        if(!view(records.get(item.id)).running)throw Error('Native Agent CLI exited during resume');
      }
    }
    return view(records.get(item.id));
   }catch(error){
    lastError=error;
    // Account login, missing history, and identity mismatch need user review,
    // never an automatic second launch that could choose another conversation.
    if(!safeRetry(error))break;
    await new Promise(resolve=>setTimeout(resolve,320*(attempt+1)));
   }
  }
  // An established role remains bound to its exact native history even after
  // an unrecoverable rollout/credential problem. Deletion is only safe for a
  // creation shell that has NEVER had an engine or native thread/session ID.
  const emptyShell=!item.startedOnce&&!item.threadId&&!item.nativeSessionId&&!item.nativePendingThread;
  if(!emptyShell){
    Object.assign(records.get(item.id),{status:failureState(lastError),error:lastError?.message,running:false,busy:false});save();
    throw lastError;
  }
  // Remove only an uninitialized display shell; preserve all project files.
  const current=records.get(item.id);
  if(current){
   if(current.terminalId&&terminals.listTerminals().some(t=>t.id===current.terminalId))await terminals.close(current.terminalId);
   await live.get(item.id)?.close();live.delete(item.id);
   records.delete(item.id);save();
  }
  return {removed:true,reason:lastError?.message||'Agent could not be restored',id:item.id};
 })().finally(()=>activations.delete(item.id));
 activations.set(item.id,task);return task;
}
async function restart(args) {
  const item = identify(args);
  if (!records.has(item.id)) records.set(item.id,item);
  if (live.has(item.id)) {if (item.running) throw Error('请先停止该会话');await live.get(item.id).close();live.delete(item.id);}
  return launch(records.get(item.id),{...args,recover:true});
}
async function remove(args) {
  const item = identify(args);
  if (opening.has(item.id) || activations.has(item.id) || item.running) throw Error('请先停止会话，再移除会话');
  if (args.confirm !== true) throw Error('移除会话需要确认');
  if (item.terminalId && terminals.listTerminals().some(t => t.id === item.terminalId)) await terminals.close(item.terminalId);
  await live.get(item.id)?.close();live.delete(item.id);
  await companions.get(item.id)?.close();companions.delete(item.id);
  records.delete(item.id);save();return {removed:true};
}
// Native Codex terminal frontend and app-server share the engine source
// host and its native installation. The
// existing private native exec-server route still executes on the work host.
// The PTY process existing does not prove that the Codex UI authenticated.
// Check that the single permitted native TUI controller actually attached,
// without sending model requests or creating a different Codex thread.
async function waitForTuiBridge(client,terminalId,timeout=9000){
  const until=Date.now()+timeout;
  while(Date.now()<until){
    if(client.tui?.activeConnections===1)return;
    const terminal=terminals.listTerminals().find(t=>t.id===terminalId);
    if(!terminal?.running)throw Error('Codex native TUI exited before connecting. Verify the installed CLI and its remote connection settings.');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const diagnostic=client.tui?.diagnostic;
  const reason=diagnostic?.reason||'native_tui_handshake_timeout';
  throw Error('Codex native TUI did not attach ('+reason+', generation '+(diagnostic?.generation||0)+'). The original thread is unchanged.');
}
async function attachTui(item,args){
  const client=live.get(item.id);
  if(!client||!item.running)throw Error('Codex engine is offline; exact recovery is required first.');
  if(!item.threadId&&!item.nativePendingThread)throw Error('Exact Codex thread ID is missing; cannot open its native TUI.');
  if(item.terminalId){
    const existing=terminals.listTerminals().find(t=>t.id===item.terminalId);
    if(existing?.running){
      try{await waitForTuiBridge(client,item.terminalId,2600);item.tuiError=undefined;return view(item)}
      catch(error){
        // No authenticated controller owns this process. Close only its TUI
        // broker; the app-server and exact native thread remain untouched.
        await terminals.close(existing.id);
      }
    }
    if(existing)await terminals.close(existing.id);
    item.terminalId=undefined;
    // The exited native TUI is the only owner of the private WS connection.
    // A closed PTY may race the WebSocket close event; release just this stale
    // instance without disabling authentication or permitting two controllers.
    client.tui?.releaseStale();
  }
  if(item.nativePendingThread&&client.tui?.creatingThread){
    // First TUI was closed before its initial thread/start reply. Keep its
    // pending transaction alive and wait for the precise thread ID to commit.
    for(let n=0;n<100&&client.tui.creatingThread;n++)
      await new Promise(resolve=>setTimeout(resolve,100));
    if(client.tui.creatingThread)throw Error('Original Codex thread creation is still pending. Reopen this session after it completes.');
  }
  const source=hosts.get(item.engineHostId),executable=source.id==='local'?hosts.binary('codex'):undefined;
  if(source.id==='local'&&!executable)throw Error('Native Codex CLI is required on the local controller to display its TUI.');
  const endpoint=await client.tuiEndpoint();
  // Codex can show an interactive "Update available" picker before it opens
  // the remote WS connection. This silently stalls the broker (generation 0),
  // even while the original app-server and thread remain healthy.
  const argsForTui=['-c','check_for_update_on_startup=false','--remote',endpoint.url,
    '--remote-auth-token-env','CLOUD_HOSTS_TUI_AUTH_TOKEN'];
  if(item.threadId)argsForTui.push('resume',item.threadId);
  const handoff=source.id==='local'?null:await require('./agent-cli.cjs').codexTuiTokenFile(source,endpoint.token);
  const owner={id:'host:'+item.targetHostId,...(handoff?{remote:registry.target(source.id,client.controlCwd)}:{cwd:os.homedir()})};
  const terminal=terminals.openTerminal(owner,args.cols??110,args.rows??34,
    {kind:'agent',engine:'codex',command:'codex',args:argsForTui,executable,...(handoff?{tuiTokenFile:handoff.file,onClose:handoff.cleanup}:{tuiToken:endpoint.token})});
  item.terminalId=terminal.id;
  item.tuiGeneration=(item.tuiGeneration||0)+1;
  save();
  // Remote PTY startup includes SSH and the host's native shell. Windows
  // guests can exceed the local nine-second budget before Codex even starts.
  try{await waitForTuiBridge(client,terminal.id,handoff?30000:9000);item.tuiError=undefined;return view(item)}
  catch(error){
    if(terminals.listTerminals().some(t=>t.id===terminal.id))await terminals.close(terminal.id);
    if(item.terminalId===terminal.id)item.terminalId=undefined;
    client.tui?.releaseStale();
    item.tuiError=error.message;
    save();throw error;
  }
}
// One in-flight attachment per persistent Agent role, shared by CLI, double
// clicks, multiple windows and automated reconnects.
async function tui(args){
  const displayed=identify(args);
  if(displayed.engine!=='codex'||displayed.transport!=='native')
    throw Error('Native Codex TUI is only available for exact Codex app-server roles');
  const item=records.get(displayed.id);
  if(!item)throw Error('Agent role is not registered; refusing to open an unrelated session.');
  if(tuiLaunches.has(item.id))return tuiLaunches.get(item.id);
  const task=attachTui(item,args).finally(()=>tuiLaunches.delete(item.id));
  tuiLaunches.set(item.id,task);return task;
}

function executionClient(args){
  const item=identify(args);
  if(item.engine==='codex'&&item.transport==='native')return connection(args);
  if(item.transport!=='pty')throw Error('Structured Agent execution requires native or supported companion transport');
  let client=companions.get(item.id);
  if(!client){const persistent=records.get(item.id);if(!persistent)throw Error('Unknown persistent Agent identity');client=new Companion(persistent,save);companions.set(item.id,client);save()}
  return client;
}
function executionIdentity(args){
  const item=identify(args);
  if(item.engine==='codex'&&item.transport==='native')return view(item);
  executionClient(args);return view(records.get(item.id));
}
function connection(args) {
  const item = identify(args), client = live.get(item.id);
  if (!client) throw Error('原生路由会话未连接，请重新启动');
  return client;
}
function assertHostIdle(id) {
  if (sessions().some(item => (item.running || opening.has(item.id)) && (item.engineHostId === id || item.targetHostId === id))) throw Error('此主机仍是 Agent 的引擎来源或工作目标，请先停止相关会话');
}
function assertHostRemovable(id) {
  assertHostIdle(id);
  if (sessions().some(item => item.engineHostId === id || item.targetHostId === id)) throw Error('此主机仍被 Agent 会话引用，请先移除相关会话，再删除主机');
}
async function shutdown() {
 shuttingDown = true;await Promise.allSettled([...tuiLaunches.values()]);await Promise.allSettled([...launches]);
 for(const id of ptyRoutes.keys()){
  const terminal=records.get(id)?.terminalId;
  if(terminal&&terminals.listTerminals().some(t=>t.id===terminal))await terminals.close(terminal);
 }
 await Promise.all([...live.values(),...companions.values(),...ptyRoutes.values()].map(client => client.close()));live.clear();companions.clear();ptyRoutes.clear();
}
module.exports = {ENGINES,capabilities:(args,targetHostId)=>typeof args==='string'?hosts.capabilities(args,targetHostId):hosts.capabilities(args.id,args.targetHostId),hosts:hosts.list,open,sessions,session,order,swap,close,rename,restart,activate,tui,remove,assertHostIdle,assertHostRemovable,shutdown,
  executionIdentity,
  read:args => executionClient(args).read(args.cursor),send:args => executionClient(args).send(args.text,args.scope),
  respond:args => executionClient(args).respond(args),interrupt:args => executionClient(args).interrupt()};
