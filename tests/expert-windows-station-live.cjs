// Opt-in Windows SSH integration: only a uniquely named disposable Temp folder.
// Does not touch existing CloudHosts users, terminals or production files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const {randomUUID}=require('node:crypto');
const id=randomUUID().slice(0,12),remote=`C:\\Users\\djf\\AppData\\Local\\Temp\\ch-audit-${id}`;
const home=fs.mkdtempSync(path.join(os.tmpdir(),'ch-expert-windows-station-'));
process.env.CLOUD_HOSTS_HOME=path.join(home,'data');
const registry=require('../src/registry.cjs'),station=require('../src/station.cjs');
const ps=s=>`powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(s,'utf16le').toString('base64')}`;
function invoke(code){
 const res=spawnSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=12','-J','bupt208','DJF-Windows',ps(code)],{encoding:'utf8',timeout:45000});
 if(res.status!==0)throw Error('Windows isolated fixture command failed: '+(res.stderr||res.stdout));return res.stdout.trim();
}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const wait=async id=>{const stop=Date.now()+105000;while(Date.now()<stop){const job=station.list().jobs.find(x=>x.id===id);if(job?.state!=='running'&&job){assert.equal(job.state,'done',job.error);return job.result}await new Promise(r=>setTimeout(r,125))}throw Error('Transfer timeout')};
async function main(){
 const setup=`$p=${quote(remote)};New-Item -ItemType Directory -Force -Path $p,($p+'\\bundle'),($p+'\\bundle\\.git'),($p+'\\bundle\\empty'),($p+'\\bundle\\HiddenByAttribute'),($p+'\\destination')|Out-Null;[IO.File]::WriteAllText(($p+'\\bundle\\.env'),'SECRET=EXPERT-TEST');[IO.File]::WriteAllText(($p+'\\bundle\\.git\\HEAD'),'ref: refs/heads/main');[IO.File]::WriteAllBytes(($p+'\\bundle\\visible.bin'),[byte[]](1,2,0,255));& attrib.exe +h ($p+'\\bundle\\HiddenByAttribute');[IO.File]::WriteAllText(($p+'\\bundle\\HiddenByAttribute\\secret.txt'),'hidden-attribute-content');Write-Output 'WINDOWS_SOURCE_SETUP_OK'`;
 try{
  assert.match(invoke(setup),/WINDOWS_SOURCE_SETUP_OK/);
  const host=registry.create({name:'Windows isolated hidden transfer',host:'DJF-Windows',jump:'bupt208',os:'windows',defaultDirectory:remote});
  const fetched=await wait(station.fetchFile(host.id,remote,'bundle').id);
  const stationFolder=station.file(fetched.id);
  for(const relative of ['.env','.git/HEAD','visible.bin','HiddenByAttribute/secret.txt'])assert.ok(fs.existsSync(path.join(stationFolder,relative)),relative);
  assert.ok(fs.statSync(path.join(stationFolder,'empty')).isDirectory());
  console.log('WINDOWS_REAL_SSH_HIDDEN_FOLDER_FETCH=PASS');
  await wait(station.sendFile(fetched.id,host.id,remote+'\\destination','restored').id);
  const verify=`$p=${quote(remote)};$a=Join-Path $p 'bundle';$b=Join-Path $p 'destination\\restored';$list=@('.env','.git\\HEAD','visible.bin','HiddenByAttribute\\secret.txt');foreach($file in $list){if(!(Test-Path -LiteralPath (Join-Path $b $file))){throw ('Missing '+$file)};$original=(Get-FileHash -LiteralPath (Join-Path $a $file)).Hash;$copy=(Get-FileHash -LiteralPath (Join-Path $b $file)).Hash;if($original -ne $copy){throw ('Hash mismatch '+$file)}};if(!(Test-Path -LiteralPath (Join-Path $b 'empty'))){throw 'Empty folder omitted'};Write-Output 'WINDOWS_HIDDEN_AND_NORMAL_BYTES_MATCH'`;
  assert.match(invoke(verify),/WINDOWS_HIDDEN_AND_NORMAL_BYTES_MATCH/);
  console.log('WINDOWS_REAL_SSH_HIDDEN_ATTRIBUTE_AND_EMPTY_DIR_ROUNDTRIP=PASS');
 }finally{
  try{invoke(`$p=${quote(remote)};if($p -like 'C:\\Users\\djf\\AppData\\Local\\Temp\\ch-audit-*' -and (Test-Path -LiteralPath $p)){Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop};Write-Output 'ISOLATED_WINDOWS_TEST_CLEANUP_OK'`)}catch(e){console.error('TEMP_CLEANUP_FAILED',e.message);process.exitCode=1}
  fs.rmSync(home,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
