// Run in the staged Windows release, never against the user's installed home.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const base=process.env.CLOUD_HOSTS_TEST_APP_ROOT||path.resolve(__dirname,'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-win-host-copy-'));
process.env.CLOUD_HOSTS_HOME=path.join(scratch,'isolated-core');
const station=require(path.join(base,'backend/src/station.cjs'));
const from=path.join(scratch,'source'),to=path.join(scratch,'target');
fs.mkdirSync(from);fs.mkdirSync(to);fs.mkdirSync(path.join(to,'drop'));
const wait=async job=>{
 for(let i=0;i<900;i++){
  const row=station.list().jobs.find(entry=>entry.id===job.id);
  if(row&&row.state!=='running')return row;
  await new Promise(resolve=>setTimeout(resolve,40));
 }
 throw Error('Staged Windows copy did not terminate');
};
(async()=>{
 try{
  fs.mkdirSync(path.join(from,'MyFolder/.cache'),{recursive:true});fs.mkdirSync(path.join(from,'MyFolder/empty'));
  fs.writeFileSync(path.join(from,'MyFolder/.cache/config'),'kept');
  fs.writeFileSync(path.join(from,'MyFolder/a.bin'),Buffer.from([0,255,78,0,13]));
  fs.writeFileSync(path.join(from,'MyFolder/hidden-attribute.txt'),'hidden content');
  const attrs=spawnSync('attrib.exe',['+h',path.join(from,'MyFolder','hidden-attribute.txt')],{encoding:'utf8',windowsHide:true});
  assert.equal(attrs.status,0,attrs.stderr);
  const copy=()=>station.copyBetweenHosts({sourceHost:'local',sourceDirectory:from,path:'MyFolder',host:'local',directory:to,to:'drop/MyFolder'});
  const first=await wait(copy());
  assert.equal(first.state,'done',first.error);
  assert.deepEqual(fs.readFileSync(path.join(to,'drop/MyFolder/a.bin')),Buffer.from([0,255,78,0,13]));
  assert.equal(fs.readFileSync(path.join(to,'drop/MyFolder/.cache/config'),'utf8'),'kept');
  assert.equal(fs.readFileSync(path.join(to,'drop/MyFolder/hidden-attribute.txt'),'utf8'),'hidden content');
  assert.ok(fs.statSync(path.join(to,'drop/MyFolder/empty')).isDirectory());
  assert.ok(fs.existsSync(path.join(from,'MyFolder/a.bin')));
  const second=await wait(copy());
  assert.equal(second.state,'failed');assert.match(second.error,/exists|目标已有/);
  assert.equal(fs.readdirSync(to).filter(name=>name.startsWith('.cloud-hosts-transfer-')||name.startsWith('.cloud-hosts-copy-lock-')).length,0);
  console.log('WIN_STAGED_HOST_COPY_FOLDER_HIDDEN_BINARY_ATOMIC_NO_OVERWRITE=PASS');
 }finally{
  fs.rmSync(scratch,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
