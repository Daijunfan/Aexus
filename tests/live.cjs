const {rpc}=require('../cli.cjs');
const fs=require('fs'),path=require('path');
(async()=>{
 const hosts=await rpc('hosts.list');const root=hosts.find(h=>h.name==='GPU-server');const other=hosts.find(h=>h.name==='Windows-target1');
 const t=await rpc('hosts.terminal-open',{id:root.id,cols:100,rows:28});let cursor=0,output='';
 async function readUntil(marker){const end=Date.now()+20000;while(Date.now()<end){const r=await rpc('hosts.terminal-read',{id:root.id,terminal:t.id,cursor,waitMs:1000});cursor=r.cursor;output+=r.output;if(output.includes(marker))return;}throw Error('Missing PTY output: '+marker+'; '+output.slice(-700));}
 try{
  await rpc('hosts.terminal-input',{id:root.id,terminal:t.id,data:"export CLOUD_HOSTS_MARK=CLI_SESSION_OK; cd /home/djf; printf '\\nREADY_%s\\n' \"$CLOUD_HOSTS_MARK\"\r"});
  await readUntil('READY_CLI_SESSION_OK');
  await rpc('hosts.terminal-resize',{id:root.id,terminal:t.id,cols:120,rows:32});
  await rpc('hosts.terminal-input',{id:root.id,terminal:t.id,data:"printf '\\nPERSIST_%s_%s\\n' \"$CLOUD_HOSTS_MARK\" \"$PWD\"; stty size\r"});
  await readUntil('PERSIST_CLI_SESSION_OK_/home/djf');await readUntil('32 120');
  let denied=false;try{await rpc('hosts.terminal-read',{id:other.id,terminal:t.id,cursor:0});}catch{denied=true;}if(!denied)throw Error('Cross-host PTY access was allowed');
  await rpc('hosts.terminal-input',{id:root.id,terminal:t.id,data:'sleep 30\r'});await new Promise(r=>setTimeout(r,600));
  await rpc('hosts.terminal-input',{id:root.id,terminal:t.id,data:'\u0003'});await rpc('hosts.terminal-input',{id:root.id,terminal:t.id,data:"printf '\\nINTERRUPT_OK\\n'\r"});await readUntil('INTERRUPT_OK');
 }finally{await rpc('hosts.terminal-close',{id:root.id,terminal:t.id});}
 const linux=await rpc('hosts.files',{id:root.id,operation:'read_file',arguments:{path:'/etc/hostname'}});
 const windows=await rpc('hosts.files',{id:other.id,operation:'list_files',arguments:{path:'.'}});
 const bad=await rpc('hosts.exec',{id:root.id,directory:'/path-that-does-not-exist-cloud-hosts',command:'echo NEVER_LOCAL'});
 if(!bad.exit_code||bad.stdout.includes('NEVER_LOCAL'))throw Error('Invalid remote directory incorrectly fell back');
 const result={hostCount:hosts.length,persistentPTY:true,resize:true,ctrlC:true,crossHostIsolation:true,linuxFileRead:linux.content.trim(),windowsFileList:windows.length,noLocalFallback:true};
 fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../artifacts/live-cli-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
