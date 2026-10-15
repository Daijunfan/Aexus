// Opt-in integration: only creates/removes unique temporary fixtures on registered test hosts.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const tag=randomUUID().slice(0,8),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-fileboard-dnd-'));
process.env.CLOUD_HOSTS_HOME=path.join(tmp,'registry');
const rootMac=path.join(tmp,'mac'),destinationMac=path.join(tmp,'returned');
const rootLinux='/tmp/cloudhosts-fileboard-dnd-'+tag,rootWindows=`C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-fileboard-dnd-${tag}`;
fs.mkdirSync(rootMac);fs.mkdirSync(destinationMac);fs.mkdirSync(path.join(destinationMac,'return'));
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const ps=script=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64');
function ssh(host,command){
 const cmd=['-o','BatchMode=yes','-o','ConnectTimeout=12','-o','ServerAliveInterval=8','-o','ServerAliveCountMax=3',...(host==='windows'?['-J','bupt208']:[]),host==='windows'?'DJF-Windows':'bupt208',command];
 const out=spawnSync('ssh',cmd,{encoding:'utf8',timeout:40000});
 if(out.status!==0)throw Error('Failed remote fixture command: '+(out.stderr||out.stdout));
 return out.stdout;
}
const registry=require('../src/registry.cjs'),station=require('../src/station.cjs'),sshFiles=require('../src/ssh.cjs');
const linux=registry.create({name:'Ephemeral Linux File Board',host:'bupt208',os:'linux',defaultDirectory:rootLinux});
const windows=registry.create({name:'Ephemeral Windows File Board',host:'DJF-Windows',os:'windows',jump:'bupt208',defaultDirectory:rootWindows});
const wait=async job=>{
 for(let i=0;i<900;i++){
  const current=station.list().jobs.find(item=>item.id===job.id);
  if(current?.state!=='running'&&current)return current;
  await new Promise(resolve=>setTimeout(resolve,180));
 }
 throw Error('Host-to-host copy exceeded 162s: '+job.id);
};
const begin=params=>station.copyBetweenHosts(params);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
 ssh('linux','mkdir -p -- '+quote(rootLinux+'/incoming'));
 ssh('windows',ps("New-Item -ItemType Directory -Force -Path '"+rootWindows+"\\incoming' | Out-Null"));
 const binary=Buffer.alloc(293007);for(let i=0;i<binary.length;i++)binary[i]=i%251;
 fs.mkdirSync(path.join(rootMac,'MyFolder/.git'),{recursive:true});fs.mkdirSync(path.join(rootMac,'MyFolder/empty'));
 fs.writeFileSync(path.join(rootMac,'MyFolder/.env'),'fixture-key-not-secret\n');
 fs.writeFileSync(path.join(rootMac,'MyFolder/.git/HEAD'),'ref: refs/heads/main\n');
 fs.writeFileSync(path.join(rootMac,'MyFolder/archive.bin'),binary);
 try{
  const toLinux=await wait(begin({sourceHost:'local',sourceDirectory:rootMac,path:'MyFolder',host:linux.id,directory:rootLinux,to:'incoming/MyFolder'}));
  assert.equal(toLinux.state,'done',toLinux.error);
  assert.equal(toLinux.result.bytes,binary.length+Buffer.byteLength('fixture-key-not-secret\n')+Buffer.byteLength('ref: refs/heads/main\n'));
  const linuxList=await sshFiles.files(linux.id,'workspace',{operation:'list',args:{path:'incoming/MyFolder',hidden:true}},rootLinux);
  assert.ok(linuxList.entries.some(e=>e.name==='.git'&&e.directory));
  assert.ok(linuxList.entries.some(e=>e.name==='empty'&&e.directory));
  console.log('PASS_REAL_FILE_BOARD_MAC_TO_LINUX_HIDDEN_BINARY_EMPTY=YES');
  const toWindows=await wait(begin({sourceHost:linux.id,sourceDirectory:rootLinux,path:'incoming/MyFolder',host:windows.id,directory:rootWindows,to:'incoming/GpuProject'}));
  assert.equal(toWindows.state,'done',toWindows.error);
  const wHash=await sshFiles.files(windows.id,'workspace',{operation:'copy-info',args:{path:'incoming/GpuProject/archive.bin',hash:true}},rootWindows);
  assert.equal(wHash.sha256,digest(binary));
  const wList=await sshFiles.files(windows.id,'workspace',{operation:'list',args:{path:'incoming/GpuProject',hidden:true}},rootWindows);
  assert.ok(wList.entries.some(e=>e.name==='.env'));
  console.log('PASS_REAL_FILE_BOARD_LINUX_TO_WINDOWS_DIRECT_CONTROLLER_STREAM=YES');
  const toMac=await wait(begin({sourceHost:windows.id,sourceDirectory:rootWindows,path:'incoming/GpuProject',host:'local',directory:destinationMac,to:'return/FromWindows'}));
  assert.equal(toMac.state,'done',toMac.error);
  assert.deepEqual(fs.readFileSync(path.join(destinationMac,'return/FromWindows/archive.bin')),binary);
  assert.equal(fs.readFileSync(path.join(destinationMac,'return/FromWindows/.git/HEAD'),'utf8'),'ref: refs/heads/main\n');
  assert.ok(fs.statSync(path.join(destinationMac,'return/FromWindows/empty')).isDirectory());
  console.log('PASS_REAL_FILE_BOARD_WINDOWS_TO_MAC_FULL_FOLDER=YES');
  const duplicate=await wait(begin({sourceHost:linux.id,sourceDirectory:rootLinux,path:'incoming/MyFolder',host:windows.id,directory:rootWindows,to:'incoming/GpuProject'}));
  assert.equal(duplicate.state,'failed');assert.match(duplicate.error,/already exists|目标已有/);
  const unchanged=await sshFiles.files(windows.id,'workspace',{operation:'copy-info',args:{path:'incoming/GpuProject/archive.bin',hash:true}},rootWindows);
  assert.equal(unchanged.sha256,digest(binary));
  console.log('PASS_REAL_FILE_BOARD_DUPLICATE_NEVER_OVERWRITES=YES');
  ssh('windows',ps("New-Item -ItemType Directory -Force -Path '"+rootWindows+"\\WinHidden' | Out-Null; New-Item -ItemType File -Force -Path '"+rootWindows+"\\WinHidden\\attribute.txt' | Out-Null; attrib.exe +h '"+rootWindows+"\\WinHidden\\attribute.txt'"));
  const hidden=await wait(begin({sourceHost:windows.id,sourceDirectory:rootWindows,path:'WinHidden',host:linux.id,directory:rootLinux,to:'incoming/WinHidden'}));
  assert.equal(hidden.state,'done',hidden.error);
  const hiddenList=await sshFiles.files(linux.id,'workspace',{operation:'list',args:{path:'incoming/WinHidden',hidden:true}},rootLinux);
  assert.ok(hiddenList.entries.some(e=>e.name==='attribute.txt'));
  console.log('PASS_REAL_FILE_BOARD_WINDOWS_HIDDEN_ATTRIBUTE_TO_LINUX=YES');
 }finally{
  try{ssh('windows',ps("Remove-Item -LiteralPath '"+rootWindows+"' -Recurse -Force -ErrorAction Stop"))}catch(e){console.error('Windows fixture cleanup',e.message)}
  try{ssh('linux','rm -rf -- '+quote(rootLinux))}catch(e){console.error('Linux fixture cleanup',e.message)}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
