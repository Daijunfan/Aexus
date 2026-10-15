const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const registry=require('./registry.cjs');
const run=promisify(execFile);
function helperForPlatform(platform=process.platform){
 if(platform==='win32')return path.join(__dirname,'../Windows/RdpCredentials.exe');
 if(platform==='darwin')return path.join(__dirname,'../Runtime/rdp-credentials');
 return null;
}
function keychain(request){
 const helper=process.env.CLOUD_HOSTS_RDP_CREDENTIAL_HELPER||helperForPlatform();
 if(!helper)return Promise.resolve({found:false});
 return new Promise((resolve,reject)=>{
  let settled=false,output='';
  const finish=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value)};
  const child=spawn(helper,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  child.on('error',finish);
  child.stdout.on('data',d=>{output+=d;if(output.length>65536){child.kill();finish(Error('RDP 凭据响应超出限制'))}});
  child.on('close',code=>{if(settled)return;try{const value=JSON.parse(output);if(value.error)finish(Error(value.error));else if(code!==0)finish(Error('系统凭据服务失败'));else finish(null,value)}catch{finish(Error('系统凭据服务不可用'))}});
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify(request));
 });
}
async function legacy(host){
 if(process.platform!=='darwin')return null;
 const file=path.join(os.homedir(),'Library/Containers/com.microsoft.rdc.macos/Data/Library/Application Support/com.microsoft.rdc.macos/com.microsoft.rdc.application-data.sqlite');
 if(!fs.existsSync(file))return null;
 const script="import sqlite3,json,sys;c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);c.row_factory=sqlite3.Row;print(json.dumps([dict(r) for r in c.execute('SELECT B.ZFRIENDLYNAME AS name,B.ZHOSTNAME AS hostname,C.ZUSERNAME AS username,C.ZID AS credentialId FROM ZBOOKMARKENTITY B LEFT JOIN ZCREDENTIALENTITY C ON B.ZCREDENTIAL=C.Z_PK')]))";
 const {stdout}=await run('python3',['-c',script,file]);const rows=JSON.parse(stdout);
 const username=host.desktop?.username||(host.info?.system?.hostname&&host.host.includes('@')?host.info.system.hostname+'\\'+host.host.split('@')[0]:'');
 return rows.find(row=>row.credentialId&&username&&row.username?.toLowerCase()===username.toLowerCase())||rows.find(row=>row.credentialId&&row.name?.toLowerCase()===host.name.toLowerCase())||null;
}
async function get(id,{importExisting=true}={}){
 const host=registry.get(id);if(process.platform!=='darwin'&&process.platform!=='win32')return {found:false};
 const saved=await keychain({action:'get',account:host.id});if(saved.found||!importExisting||process.platform==='win32')return saved;
 const source=await legacy(host);if(!source)return saved;
 const result=await keychain({action:'get',service:'com.microsoft.rdc.macos',account:source.credentialId});
 if(!result.found||!result.password)return {found:false};
 await set(host.id,source.username,result.password);
 return {found:true,username:source.username,password:result.password,source:'Windows App'};
}
async function set(id,username,password){return keychain({action:'set',account:registry.get(id).id,username,password});}
async function status(id){const value=await get(id);return {hasSavedCredential:!!value.found,username:value.username||'',source:value.source||(process.platform==='win32'?'Windows Credential Manager':'钥匙串')};}
module.exports={get,set,status,helperForPlatform};
