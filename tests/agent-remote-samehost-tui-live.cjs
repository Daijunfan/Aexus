// Real remote-source Codex, native TUI via Mac controller. No model turn.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const kind=process.argv[2];if(!['gpu','windows'].includes(kind))throw Error('gpu|windows required');
const windows=kind==='windows',tag=randomUUID().slice(0,8);
const cwd=windows?'C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-tui-native-'+tag:'/tmp/cloudhosts-tui-native-'+tag;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-remote-tui-'));
process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const quote=text=>"'"+String(text).replaceAll("'","'\\''")+"'";
const powershell=text=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(text,'utf16le').toString('base64');
const remote=(win,linux)=>{
 const cmd=windows?powershell(win):linux;
 const options=['-o','BatchMode=yes','-o','ConnectTimeout=10',...(windows?['-J','bupt208']:[]),windows?'DJF-Windows':'bupt208',cmd];
 const result=spawnSync('ssh',options,{encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error((result.stderr||result.stdout).slice(-800));
};
const agents=require('../src/agent-sessions.cjs'),registry=require('../src/registry.cjs'),terminals=require('../src/terminals.cjs');
const cli=require('../src/agent-cli.cjs'),tokenFiles=[];
const makeToken=cli.codexTuiTokenFile;
cli.codexTuiTokenFile=async(...args)=>{const handoff=await makeToken(...args);tokenFiles.push(handoff.file);return handoff};
(async()=>{
 remote("New-Item -ItemType Directory -Path '"+cwd+"' -Force|Out-Null",'mkdir -p -- '+quote(cwd));
 let role;
 try{
  const host=registry.create({name:'Remote native UI QA',host:windows?'DJF-Windows':'bupt208',
   jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:cwd});
  role=await agents.open({engineHostId:host.id,targetHostId:host.id,engine:'codex',
   directory:cwd,name:'Isolated Remote Native TUI',creationId:'qa-native-'+tag});
  assert.equal(role.running,true);
  assert.equal(role.engineHostId,role.targetHostId);
  let attached;
  try{attached=await agents.tui({id:host.id,session:role.id})}
  catch(error){console.error('REMOTE_NATIVE_TUI_ATTACH_FAILED',kind,error.message);throw error}
  assert.equal(attached.tuiState,'ready');
  const id=attached.terminalId;
  assert.ok(id);
  for(let i=0;i<80&&!agents.sessions(host.id)[0].threadId;i++)await new Promise(r=>setTimeout(r,100));
  const original=agents.sessions(host.id)[0].threadId;
  assert.ok(original,'TUI did not create native thread');
  await new Promise(resolve=>setTimeout(resolve,1600));
  const output=await terminals.read(id,0);
  assert.equal(output.running,true);
  assert.doesNotMatch(output.output,/config\/read failed|response decode error|thread\/start failed/,'The stock TUI must finish rendering after its protocol handshake');
  assert.ok(tokenFiles.length,'The token handoff stays on the actual engine host');
  for(const file of tokenFiles)assert.equal((await require('../src/ssh.cjs').files(host.id,'native_io',{operation:'stat',args:{path:file}},cwd)).exists,false,'The native TUI consumes its one-shot token file');
  await terminals.close(id);
  const second=await agents.tui({id:host.id,session:role.id});
  assert.equal(second.threadId,original);
  assert.equal(second.tuiState,'ready');
  assert.notEqual(second.terminalId,id);
  console.log('REAL_REMOTE_SAMEHOST_TUI_AND_EXACT_RECONNECT=PASS',kind,'threadPreserved=yes modelCalls=0');
 }finally{
  if(role){try{await agents.close({id:role.targetHostId,session:role.id});await agents.remove({id:role.targetHostId,session:role.id,confirm:true})}catch(error){console.error('Close failed',error.message)}}
  await agents.shutdown();await terminals.shutdown();
  try{remote("Remove-Item -LiteralPath '"+cwd+"' -Recurse -Force -ErrorAction SilentlyContinue",'rm -rf -- '+quote(cwd))}catch(error){console.error('Cleanup',error.message)}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
