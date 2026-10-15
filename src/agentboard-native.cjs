'use strict';
// Explicit host-side native capability whitelist, invoked only via the
// authenticated CloudHosts RPC origin. No arbitrary shell or filesystem API.
const path=require('node:path');
const fs=require('node:fs');
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {shared}=require('./agentboard-supervisor.cjs');
const VALID=new Set(['file.pick','folder.pick','file.reveal','external.open','clipboard.write','clipboard.read']);
const fail=(message,code)=>Object.assign(Error(message),{code});
const safePath=async value=>{
  if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0'))throw fail('Absolute file path required','PATH_INVALID');
  // Core authorizes reveal endpoints; a picker grants the path the operator
  // actually selected, including temporary folders and external volumes.
  return fs.promises.realpath(value);
};
async function clipboardWrite(text){
  return new Promise((resolve,reject)=>{
    const child=spawn('pbcopy',[],{stdio:['pipe','ignore','pipe']});let diagnostic='';
    child.stderr.on('data',part=>diagnostic=(diagnostic+part).slice(0,500));
    child.on('error',reject);
    child.on('close',code=>code===0?resolve({ok:true}):reject(fail('Clipboard write failed','NATIVE_FAILURE')));
    child.stdin.end(text);
  });
}
async function request({instanceId,capability,payload={},requestId,windowId,clientId}={}){
  const supervisor=shared();
  if(supervisor.status!=='ready'||instanceId!==supervisor.instanceId)throw fail('Aexus Core instance mismatch','INSTANCE_MISMATCH');
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(String(requestId))||
     !/^[a-zA-Z0-9_-]{8,80}$/.test(String(windowId))||
     !/^[a-zA-Z0-9_-]{8,80}$/.test(String(clientId))||
     !VALID.has(capability)||!payload||typeof payload!=='object'||Array.isArray(payload)||
     JSON.stringify(payload).length>16384)throw fail('Unknown or invalid native capability','NATIVE_DENIED');
  if(capability==='external.open'){
    const url=new URL(String(payload.url||''));
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw fail('Unsafe external URL','NATIVE_DENIED');
    const executable=process.platform==='darwin'?'open':process.platform==='linux'?'xdg-open':null;
    if(!executable)throw fail('External URL open is not supported on this platform','PLATFORM_UNSUPPORTED');
    await exec(executable,[url.href],{timeout:8000});return {ok:true};
  }
  if(process.platform!=='darwin')throw fail('This native action requires macOS','PLATFORM_UNSUPPORTED');
  if(capability==='clipboard.write'){
    const value=String(payload.text??'');
    if(value.length>256*1024)throw fail('Clipboard payload too large','NATIVE_DENIED');
    return clipboardWrite(value);
  }
  if(capability==='clipboard.read'){
    const {stdout}=await exec('pbpaste',[],{timeout:4000,maxBuffer:256*1024});
    return {text:stdout};
  }
  if(capability==='file.reveal'){
    const file=await safePath(payload.path);
    await exec('open',['-R',file],{timeout:8000});return {ok:true};
  }
  const type=capability==='folder.pick'?'folder':'file';
  const quote=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
  let initial='';
  if(typeof payload.path==='string'&&path.isAbsolute(payload.path)&&fs.existsSync(payload.path)&&fs.statSync(payload.path).isDirectory())
    initial=' default location (POSIX file '+quote(payload.path)+')';
  const code='POSIX path of (choose '+type+' with prompt '+quote(type==='folder'?'选择工作文件夹':'选择文件')+initial+')';
  let stdout;
  try{({stdout}=await exec('osascript',['-e',code],{timeout:120000,maxBuffer:8192}))}
  catch(error){if(/\(-128\)|User canceled/.test(error.stderr||error.message))return {path:null};throw error}
  const filename=stdout.trim();
  if(!filename)throw fail('No file selected','PICKER_CANCELLED');
  return {path:await safePath(filename),kind:type};
}
module.exports={request};
