// Authenticated Mac Codex -> remote work host creation, without any model turn.
// Executes only against temporary directories and isolated CloudHosts metadata.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process');
if(process.platform!=='darwin')throw Error('Run this controller-origin test on Mac');
const kind=process.argv[2]||'gpu';if(!['gpu','windows'].includes(kind))throw Error('Choose gpu or windows');
const windows=kind==='windows';const id=randomUUID().slice(0,8),home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-origin-smoke-'));
process.env.CLOUD_HOSTS_HOME=path.join(home,'app');
const directory=windows?`C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-origin-${id}`:`/tmp/cloudhosts-origin-${id}`;
const hostName=windows?'DJF-Windows':'bupt208';
const ps=script=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
function ssh(command){
 const parts=['-o','BatchMode=yes','-o','ConnectTimeout=10',...(windows?['-J','bupt208']:[]),hostName,command];
 const result=spawnSync('ssh',parts,{encoding:'utf8',timeout:35000});
 if(result.status!==0)throw Error(result.stderr||result.stdout||'SSH failed');
}
const registry=require('../src/registry.cjs'),agents=require('../src/agent-sessions.cjs'),hosts=require('../src/agent-hosts.cjs');
(async()=>{
 ssh(windows?ps(`New-Item -ItemType Directory -Force -Path '${directory}'|Out-Null`):`mkdir -p -- ${quote(directory)}`);
 let opened;
 try{
  const record=registry.create({name:'Isolated test target '+kind,host:hostName,os:windows?'windows':'linux',jump:windows?'bupt208':undefined,defaultDirectory:directory});
  const support=await hosts.capabilities('local',record.id);
  assert.equal(support.engines.codex,true);assert.equal(support.routingVerified,true,support.routingNote);
  assert.equal(support.transparentRouting.codex,true);
  opened=await agents.open({engineHostId:'local',targetHostId:record.id,engine:'codex',directory,name:'Temporary Native Codex From Mac',permission:'ask',creationId:'live-smoke-'+id});
  assert.equal(opened.engineHostId,'local');assert.equal(opened.targetHostId,record.id);
  assert.equal(opened.routeMode,'controller-remote');assert.equal(opened.transport,'native');
  assert.equal(opened.running,true);assert.equal(opened.status,'idle');
  assert.equal(opened.nativePendingThread,true,'Fresh TUI must create its own exact Codex thread');
  const session=agents.sessions(record.id).find(v=>v.id===opened.id);
  assert.equal(session?.id,opened.id);
  console.log('REAL_MAC_CODEX_TO_'+kind.toUpperCase()+'_CREATION=PASS');
  console.log('ENGINE_LOCATION=LOCAL_MAC; WORK_LOCATION='+kind.toUpperCase()+'; NATIVE_ROUTED_PROTOCOL=VERIFIED; MODEL_MESSAGES=0');
 }finally{
  try{if(opened){await agents.close({id:opened.targetHostId,session:opened.id});await agents.remove({id:opened.targetHostId,session:opened.id,confirm:true})}}catch(e){console.error('Smoke session close:',e.message)}
  await agents.shutdown();
  try{ssh(windows?ps(`Remove-Item -LiteralPath '${directory}' -Recurse -Force -ErrorAction Stop`):`rm -rf -- ${quote(directory)}`)}catch(e){console.error('Smoke directory cleanup:',e.message)}
  fs.rmSync(home,{recursive:true,force:true});
 }
})().catch(e=>{console.error('CROSSHOST_SMOKE_ERROR',e.message);process.exitCode=1});
