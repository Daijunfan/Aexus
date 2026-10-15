// Opt-in macOS SSH end-to-end test of real Linux/Windows directory hidden-file handling.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const name=process.argv[2];if(!['linux','windows'].includes(name))throw Error('Usage: node tests/file-hidden-live.cjs linux|windows');
const windows=name==='windows',tag=randomUUID().slice(0,8);
const remoteDir=windows?`C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-file-hidden-${tag}`:`/tmp/cloudhosts-file-hidden-${tag}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-hidden-'));
const ps=s=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(s,'utf16le').toString('base64');
function command(script){
 const argv=['-o','BatchMode=yes','-o','ConnectTimeout=10',...(windows?['-J','bupt208']:[]),windows?'DJF-Windows':'bupt208',script];
 const result=spawnSync('ssh',argv,{encoding:'utf8',timeout:25000});
 if(result.status)throw Error(result.stderr||result.stdout);
}
const creation=windows?ps(`$p='${remoteDir}';New-Item -ItemType Directory -Force -Path $p,($p+'\\.internal'),($p+'\\docs'),($p+'\\HiddenFolder')|Out-Null;Set-Content -LiteralPath ($p+'\\.secret') -Value 'test';& attrib.exe +h ($p+'\\HiddenFolder')`):`mkdir -p '${remoteDir}/.internal' '${remoteDir}/docs' && touch '${remoteDir}/.secret'`;
const removal=windows?ps(`Remove-Item -LiteralPath '${remoteDir}' -Recurse -Force -ErrorAction Stop`):`rm -rf -- '${remoteDir}'`;
process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs');
(async()=>{
 command(creation);
 try{
  const host=registry.create({name:'File hidden fixture',host:windows?'DJF-Windows':'bupt208',os:windows?'windows':'linux',jump:windows?'bupt208':undefined,defaultDirectory:remoteDir});
  const listing=hidden=>ssh.files(host.id,'workspace',{operation:'list',args:{path:'.',hidden}},remoteDir);
  const normal=await listing(false),all=await listing(true);
  assert.ok(normal.entries.some(item=>item.name==='docs'));
  assert.ok(!normal.entries.some(item=>item.name==='.internal'||item.name==='.secret'));
  assert.ok(all.entries.some(item=>item.name==='.internal'&&item.hidden===true));
  assert.ok(all.entries.some(item=>item.name==='.secret'&&item.hidden===true));
  if(windows){
   assert.ok(!normal.entries.some(item=>item.name==='HiddenFolder'),'Windows hidden attribute must be excluded');
   assert.ok(all.entries.some(item=>item.name==='HiddenFolder'&&item.hidden===true));
  }
  console.log('PASS_REAL_SSH_HIDDEN_FILES='+name+'; hidden_default=OFF; eye=WORKING; hidden_windows_attribute='+windows);
 }finally{
  try{command(removal)}catch(error){console.error('Fixture cleanup:',error.message)}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
