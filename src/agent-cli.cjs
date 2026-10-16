// Native session allocation and lifecycle metadata, without a model prompt.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),registry=require('./registry.cjs');
const {randomUUID}=require('node:crypto');
const source=name=>['cline_sdk.mjs',...(name==='cline_exec.mjs'?['cline_checkpoint.mjs']:[]),name].map(file=>
 fs.readFileSync(path.join(__dirname,'../Runtime',file),'utf8').replace(/import \{[^}]+\} from '\.\/cline_sdk\.mjs';/g,'')
  .replace("import {checkpointOperation} from './cline_checkpoint.mjs';",'')).join('\n');
async function createClineSession(host,cwd,sessionId,knownHasInput){
 const worker=new (require('./native-executor.cjs').NativeExecutor)(host.id,cwd,source('cline_session.mjs'));
 try{return await worker.request('session',[{sessionId,knownHasInput}])}finally{worker.close()}
}
// Bind OpenCode's native session identity through its official ACP server, on
// the same host where the TUI will run (local or same-host cloud). A fresh role
// allocates one exact session; a resumed role verifies its stored id still
// loads. No model prompt is submitted and the key stays in OpenCode's store.
async function createOpenCodeSession(host,cwd,sessionId,recover=false){
 if(recover&&!sessionId)throw Error('Exact OpenCode session ID is missing; refusing unrelated recovery.');
 const hosts=require('./agent-hosts.cjs'),{JsonLines}=require('./agent-companion-protocol.cjs');
 const transport=new JsonLines(hosts.processOn(host,'opencode',['acp'],{cwd}),()=>{});
 try{
  await transport.request('initialize',{protocolVersion:1,clientInfo:{name:'cloudhosts-native-session',version:'1'},clientCapabilities:{}},'acp',20000);
  if(sessionId){await transport.request('session/load',{cwd,sessionId,mcpServers:[]},'acp',30000);return {sessionId}}
  const created=await transport.request('session/new',{cwd,mcpServers:[]},'acp',30000);
  if(!created?.sessionId)throw Error('OpenCode did not return a session identity');
  return {sessionId:created.sessionId};
 }finally{await transport.close()}
}
// OpenCode has no native tool-approval flag. The official per-process
// OPENCODE_CONFIG_CONTENT override is the enforcement point for a same-host Ask
// role: dangerous tools become "ask", so the TUI's own approval UI or the ACP
// session/request_permission event fires. Full is never overridden and keeps
// the host's native default (global opencode.json stays Full). The user's
// global config and credentials are untouched.
const OPENCODE_ASKED_TOOLS=['edit','bash','task','external_directory','todowrite','webfetch','websearch'];
function opencodePermissionEnvironment(permission){
 if(permission==='full')return {};
 const asked=Object.fromEntries(OPENCODE_ASKED_TOOLS.map(tool=>[tool,'ask']));
 return {OPENCODE_CONFIG_CONTENT:JSON.stringify({permission:asked,agent:{build:{permission:asked},plan:{permission:asked},general:{permission:asked},explore:{permission:asked}}})};
}
async function codexTuiTokenFile(host,token){
 const ssh=require('./ssh.cjs'),worker=new ssh.Workspace(host.id);
 try{
  const ready=await worker.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'native-tui',version:'1'}});
  const paths=host.os==='windows'?path.win32:path.posix;
  const dir=paths.join(ready.environment.home,'.local','share','cloud-hosts','native-tui');
  const file=paths.join(dir,randomUUID()+'.token');
  await worker.call('native_io',{operation:'mkdir',args:{path:dir}});
  await worker.call('native_io',{operation:'write',args:{path:file,data:Buffer.from(token+'\n').toString('base64'),private:true}});
  return {file,cleanup:()=>ssh.execute(host.id,host.os==='windows'?'Remove-Item -LiteralPath '+ssh.psquote(file)+' -Force -ErrorAction SilentlyContinue':'rm -f -- '+ssh.quote(file),host.defaultDirectory,15).catch(()=>{})};
 }finally{worker.close()}
}
async function withSessionState(role,callback){
 const hosts=require('./agent-hosts.cjs'),ssh=require('./ssh.cjs'),host=hosts.get(role.engineHostId);
 let worker;
 try{
  let root;
  if(host.id==='local')root=path.join(registry.home,'native-clients',role.id,'session-state');
  else{
   worker=new ssh.Workspace(host.id,host.defaultDirectory);
   const ready=await worker.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'native-session-state',version:'1'}});
   root=(host.os==='windows'?path.win32:path.posix).join(ready.environment.home,'.local','share','cloud-hosts','native-sessions',role.id);
  }
  const paths=host.os==='windows'?path.win32:path.posix,file=paths.join(root,'state.json');
  const mkdir=async dir=>worker?worker.call('native_io',{operation:'mkdir',args:{path:dir}}):fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const write=async(name,text)=>worker?worker.call('native_io',{operation:'write',args:{path:name,data:Buffer.from(text).toString('base64')}}):fs.writeFileSync(name,text,{mode:0o600});
  const exists=async name=>worker?(await worker.call('native_io',{operation:'stat',args:{path:name}})).exists:fs.existsSync(name);
  const read=async name=>worker?Buffer.from((await worker.call('native_io',{operation:'read',args:{path:name}})).data,'base64').toString():fs.readFileSync(name,'utf8');
  await mkdir(root);return await callback({host,root,paths,file,mkdir,write,exists,read});
 }finally{worker?.close()}
}
async function prepareClaudeSession(role,{recover=false}={}){
 return withSessionState(role,async({host,root,paths,file,mkdir,write,exists,read})=>{
  await mkdir(paths.join(root,'.claude-plugin'));await mkdir(paths.join(root,'hooks'));
  let state={sessionId:role.nativeSessionId,hasInput:recover};
  if(await exists(file))state=JSON.parse(await read(file));
  if(!/^[a-f0-9-]{36}$/i.test(state.sessionId||''))throw Error('Invalid native Claude session identity');
  role.nativeSessionId=state.sessionId;role.nativeHasInput=state.hasInput;role.nativeStateFile=file;
  await write(file,JSON.stringify(state));
  const hook=paths.join(root,'hooks','session.cjs');
  await write(hook,fs.readFileSync(path.join(__dirname,'../Runtime/claude_session_state.cjs'),'utf8'));
  // Exec-form hooks bypass shell wrappers: lifecycle state belongs to the
  // engine host, while the routed Bash wrapper executes only work commands.
  const entry=[{hooks:[{type:'command',command:host.id==='local'?process.execPath:'node',args:[hook,file]}]}];
  await write(paths.join(root,'.claude-plugin','plugin.json'),JSON.stringify({name:'native-session-state',version:'1.0.0'}));
  await write(paths.join(root,'hooks','hooks.json'),JSON.stringify({hooks:{SessionStart:entry,UserPromptSubmit:entry,Stop:entry}}));
  const saved=state.hasInput||state.transcriptPath&&await exists(state.transcriptPath);
  return [saved?'--resume':'--session-id',state.sessionId,'--plugin-dir',root];
 });
}
async function preparePiSession(role){
 return withSessionState(role,async({root,paths,file,write,exists,read})=>{
  const state=await exists(file)?JSON.parse(await read(file)):{sessionId:role.nativeSessionId};
  if(!/^[a-f0-9-]{36}$/i.test(state.sessionId||''))throw Error('Invalid native Pi session identity');
  role.nativeSessionId=state.sessionId;role.nativeStateFile=file;
  await write(file,JSON.stringify(state));
  const extension=paths.join(root,'pi-session-state.mjs');
  await write(extension,fs.readFileSync(path.join(__dirname,'../Runtime/pi_session_state.mjs'),'utf8'));
  const argv=['--session-id',state.sessionId,'--extension',extension];
  // Same-host cloud ask mounts the native tool-approval gate. Full, local and
  // routed Pi are untouched (routed keeps its own pi_route.mjs adapter), and no
  // tools are removed: approval is the real pi.on("tool_call") + ctx.ui.confirm hook.
  if(role.permission==='ask'&&role.targetHostId!=='local'&&role.engineHostId===role.targetHostId){
    const gate=paths.join(root,'pi-permission.mjs');
    await write(gate,fs.readFileSync(path.join(__dirname,'../Runtime/pi_permission.mjs'),'utf8'));
    argv.push('--extension',gate);
  }
  return argv;
 });
}
function trustClaudeController(cwd){
 const file=process.env.CLAUDE_CONFIG_DIR?path.join(process.env.CLAUDE_CONFIG_DIR,'.claude.json'):path.join(os.homedir(),'.claude.json');
 const directory=fs.realpathSync(cwd),settings=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 if(settings.projects?.[directory]?.hasTrustDialogAccepted)return;
 // Only the application's own empty controller directory is trusted here.
 // User projects, permissions, provider settings and credentials are untouched.
 const parent=fs.realpathSync(path.join(registry.home,'native-clients'));
 if(!directory.startsWith(parent+path.sep))throw Error('Claude controller trust is restricted to app-owned session directories');
 if(fs.existsSync(file)){
  const backup=path.join(registry.home,'native-backups','claude-pre-routing.json');fs.mkdirSync(path.dirname(backup),{recursive:true,mode:0o700});
  if(!fs.existsSync(backup)){fs.copyFileSync(file,backup);fs.chmodSync(backup,0o600)}
 }
 settings.projects={...settings.projects,[directory]:{...settings.projects?.[directory],hasTrustDialogAccepted:true}};
 fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.cloudhosts-tmp';
 fs.writeFileSync(temporary,JSON.stringify(settings,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);
}
module.exports={createClineSession,createOpenCodeSession,codexTuiTokenFile,prepareClaudeSession,preparePiSession,source,trustClaudeController,opencodePermissionEnvironment};
