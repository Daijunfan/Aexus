// Native Core host status, shell and inspection. No SSH hop to itself.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {encoded}=require('./ssh.cjs');
const infoScript=path.resolve(__dirname,'../Runtime/host_info.'+(process.platform==='win32'?'ps1':'py'));
function invoke(binary,args,{cwd=os.homedir(),timeout=40,input}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill()},timeout*1000);
  child.stdout.on('data',data=>{stdout=(stdout+data).slice(-16*1024*1024)});
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-4000)});
  child.once('error',error=>{clearTimeout(timer);reject(error)});
  child.once('close',code=>{clearTimeout(timer);resolve({stdout,stderr,exit_code:timedOut?124:code??1,cwd})});
  child.stdin.end(input);
 });
}
function execute(command,directory=os.homedir(),timeout=120){
 if(typeof command!=='string'||!command.trim())throw Error('Command must not be empty');
 if(!path.isAbsolute(directory))throw Error('Local directory must be absolute');
 const shell=process.platform==='win32'?'powershell.exe':process.env.SHELL||'/bin/bash';
 const args=process.platform==='win32'?['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded(command)]:['-lc',command];
 return invoke(shell,args,{cwd:directory,timeout});
}
async function inspect(){
 const windows=process.platform==='win32';
 const result=windows?await invoke('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded(fs.readFileSync(infoScript,'utf8'))],{timeout:40}):await invoke(process.env.CLOUD_HOSTS_PYTHON||'python3',[infoScript],{timeout:40});
 if(result.exit_code)throw Error(result.stderr.trim()||'Unable to inspect local host');
 const {virtualSignals,...data}=JSON.parse(result.stdout.trim());
 const {detectVirtualization}=require('./host-info.cjs');
 return {...data,virtualization:detectVirtualization(virtualSignals),checkedAt:Date.now()};
}
module.exports={execute,inspect};
