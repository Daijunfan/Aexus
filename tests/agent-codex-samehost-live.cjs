// Opt-in true SSH integration: Codex engine AND native work directory reside
// on one remote host. Mac is only the control client, no exec-server routing.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto'),assert=require('node:assert/strict');
const target=process.argv[2];if(!['gpu','windows'].includes(target))throw Error('Usage: node tests/agent-codex-samehost-live.cjs gpu|windows');
const windows=target==='windows',tag=randomUUID().slice(0,8);
const dir=windows?`C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-codex-samehost-${tag}`:`/tmp/cloudhosts-codex-samehost-${tag}`;
const envDir=windows?`${dir}\\codex-home`:`${dir}/codex-home`;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-direct-'));
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const ps=script=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64');
function remote(win,linux){
 const args=['-o','BatchMode=yes','-o','ConnectTimeout=10',...(windows?['-J','bupt208']:[]),windows?'DJF-Windows':'bupt208',windows?ps(win):linux];
 const result=spawnSync('ssh',args,{encoding:'utf8',timeout:25000});
 if(result.status!==0)throw Error((result.stderr||result.stdout).slice(-1400));
}
process.env.CLOUD_HOSTS_HOME=path.join(tmp,'core');
(async()=>{
 remote(`New-Item -ItemType Directory -Force -Path '${dir}','${envDir}'|Out-Null`,`mkdir -p ${quote(envDir)}`);
 const registry=require('../src/registry.cjs'),hosts=require('../src/agent-hosts.cjs'),route=require('../src/agent-route.cjs'),native=require('../src/agent-native.cjs');
 const host=registry.create({name:'Isolated Same-host Native Codex',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:dir});
 const original=hosts.processOn,openRoute=route.open;let invocation=null,proxies=0,client;
 hosts.processOn=(entry,engine,args,opts={})=>{
  invocation={hostId:entry.id,engine,args,opts};
  return original(entry,engine,args,{...opts,environment:{...opts.environment,CODEX_HOME:envDir}});
 };
 route.open=()=>{proxies++;throw Error('Forbidden remote same-host exec-server route')};
 const role={id:randomUUID(),name:'Remote native Codex',engine:'codex',engineHostId:host.id,targetHostId:host.id,cwd:dir,permission:'ask'};
 try{
  client=await native.open(role,()=>{},{deferThread:true});
  assert.equal(client.mode,'same-host');assert.equal(client.routed,false);
  assert.equal(client.route,undefined);
  assert.equal(client.controlCwd,dir);
  assert.ok(!client.threadOptions.environments);
  assert.ok(!Object.hasOwn(client.threadOptions,'sandbox'),'The native profile owns same-host sandbox settings');
  assert.ok(!Object.hasOwn(client.threadOptions,'approvalPolicy'),'The native profile owns same-host approval settings');
  assert.equal(proxies,0);
  assert.equal(invocation.hostId,host.id);
  assert.ok(invocation.args.includes('app-server'));
  assert.ok(!invocation.args.includes('exec-server'));
  assert.ok(!('CODEX_EXEC_SERVER_URL' in invocation.opts.environment));
  assert.equal(client.role.nativePendingThread,true);
  assert.equal(client.role.threadId,undefined);
  assert.equal(client.read(0).events.filter(event=>event.kind==='user').length,0);
  console.log('PASS_REMOTE_SAMEHOST_NATIVE='+target+'; engine_and_tools_on_target=YES; extra_exec_route=NONE; model_requests=0');
 }finally{
  await client?.close();hosts.processOn=original;route.open=openRoute;
  try{remote(`Remove-Item -LiteralPath '${dir}' -Force -Recurse -ErrorAction SilentlyContinue`,`rm -rf -- ${quote(dir)}`)}catch(error){console.error('Cleanup error:',error.message)}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
