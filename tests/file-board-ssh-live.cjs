// Explicit opt-in real SSH test. Uses only fresh temporary directories on the
// target; no stored CloudHosts roles or user project files are accessed.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const platform=process.argv[2];if(!['linux','windows'].includes(platform))throw Error('Usage: node tests/file-board-ssh-live.cjs linux|windows');
const windows=platform==='windows',tag=randomUUID().slice(0,8);
const rootDir=windows?`C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-file-board-${tag}`:`/tmp/cloudhosts-file-board-${tag}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ch-fileboard-ssh-'));
const ps=s=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(s,'utf16le').toString('base64');
function remote(script){
 const args=['-o','BatchMode=yes','-o','ConnectTimeout=10',...(windows?['-J','bupt208']:[]),windows?'DJF-Windows':'bupt208',script];
 const r=spawnSync('ssh',args,{encoding:'utf8',timeout:25000});
 if(r.status!==0)throw Error('Remote SSH: '+(r.stderr||r.stdout));
}
process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs');
(async()=>{
 remote(windows?ps(`New-Item -ItemType Directory -Force -Path '${rootDir}' | Out-Null`):`mkdir -p '${rootDir}'`);
 try{
  const host=registry.create({name:'File Board transient SSH test',host:windows?'DJF-Windows':'bupt208',os:platform,jump:windows?'bupt208':undefined,defaultDirectory:rootDir});
  const op=(operation,args)=>ssh.files(host.id,'workspace',{operation,args},rootDir);
  await op('mkdir',{path:'docs'});
  await op('write',{path:'docs/hello.md',content:'Hello '+platform+'\n安全编辑',create:true});
  const before=await op('read',{path:'docs/hello.md'});
  assert.equal(before.content,'Hello '+platform+'\n安全编辑');
  await op('write',{path:'docs/hello.md',content:'Edited on '+platform,hash:before.hash});
  await assert.rejects(op('write',{path:'docs/hello.md',content:'Stale overwrite',hash:before.hash}),/其他操作修改/);
  assert.equal((await op('read',{path:'docs/hello.md'})).content,'Edited on '+platform);
  await op('move',{path:'docs/hello.md',to:'docs/renamed.md'});
  const row=(await op('list',{path:'docs',hidden:true})).entries.find(item=>item.name==='renamed.md');
  assert.ok(row&&!row.directory);
  const recycle=await op('trash',{path:'docs/renamed.md'});
  assert.equal((await op('list',{path:'docs'})).entries.length,0);
  await op('restore',{path:'.',id:recycle.id});
  assert.equal((await op('read',{path:'docs/renamed.md'})).content,'Edited on '+platform);
  console.log('REAL_FILE_BOARD_SSH_'+platform.toUpperCase()+'=PASS; create/UTF8/read/atomic-conflict/rename/trash/restore=PASS');
 }finally{
  try{remote(windows?ps(`Remove-Item -LiteralPath '${rootDir}' -Recurse -Force -ErrorAction Stop`):`rm -rf -- '${rootDir}'`)}catch(error){console.error('Fixture cleanup:',error.message)}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
