// Claude's own tool runtime. A private endpoint guards startup until its
// tool-only module attaches; the module prevents the main model loop.
// `pluginSource` is supplied by the transport, never by a model or remote page.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
let cli=typeof executable==='string'?executable:'claude';
if(process.platform==='win32'){
 const launcher=path.isAbsolute(cli)?cli:execFileSync('where.exe',[cli],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).find(file=>/\.(exe|cmd)$/i.test(file));
 if(launcher&&/\.cmd$/i.test(launcher)){
  // npm's command shim points to this installed original native executable.
  // Node cannot execFile/spawn a .cmd without another command interpreter.
  const native=path.join(path.dirname(launcher),'node_modules','@anthropic-ai','claude-code','bin','claude.exe');
  if(!fs.existsSync(native))throw Error('The Claude npm launcher has no installed native executable');
  cli=native;
 }else if(launcher)cli=launcher;
}
const version=execFileSync(cli,['--version'],{encoding:'utf8',timeout:12000}).match(/(\d+)\.(\d+)\.(\d+)/);
if(!version||Number(version[1])<2||Number(version[1])===2&&(Number(version[2])<1||Number(version[2])===1&&Number(version[3])<287))throw Error('Claude Code 2.1.287 or newer is required for native tool execution');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'native-claude-tools-')),plugin=path.join(folder,'plugin');
fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true,mode:0o700});fs.mkdirSync(path.join(plugin,'hooks'));
fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'native-executor',version:'0.0.1'}));
fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.js']}));
fs.writeFileSync(path.join(plugin,'hooks/register.js'),pluginSource);
const token=randomBytes(32).toString('hex'),queue=[],pending=new Set();
let waiting,info,child,closing=false,diagnostic='',blockedInference=0;
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const ready=new Promise(resolve=>info=resolve);
const dispatch=()=>{if(waiting&&queue.length){const reply=waiting;waiting=undefined;reply.end(JSON.stringify(queue.shift()))}};
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/disabled-provider')){blockedInference++;res.writeHead(403).end('Inference is disabled for this native tool worker');return}
 if(req.headers.origin||req.headers.authorization!=='Bearer '+token){res.writeHead(403).end();return}
 if(req.url==='/next'){
  waiting=res;const timer=setTimeout(()=>{if(waiting===res){waiting=undefined;res.end('{}')}},15000);
  res.on('close',()=>{clearTimeout(timer);if(waiting===res)waiting=undefined});dispatch();return;
 }
 try{
  let body='';for await(const chunk of req)body+=chunk;
  const value=JSON.parse(body);
  if(req.url==='/ready')info({cwd:process.cwd(),home:os.homedir(),platform:process.platform,hostname:os.hostname(),osVersion:os.type()+' '+os.release(),version:version[0],
   tools:value.tools,memoryDirectory:value.memoryDirectory,shell:value.shell.split(/[\\/]/).at(-1),isGit:value.isGit});
  if(req.url==='/result'){pending.delete(value.id);send(value)}
  res.end('{}');
 }catch(error){res.writeHead(400).end(error.message)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const settings={env:{ANTHROPIC_BASE_URL:url+'/disabled-provider',ANTHROPIC_API_KEY:'native-tools-only',ANTHROPIC_AUTH_TOKEN:'native-tools-only'}};
const originalEnv=Object.fromEntries(['ANTHROPIC_BASE_URL','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN'].map(name=>[name,process.env[name]??null]));
child=spawn(cli,['-p','/native-executor','--plugin-dir',plugin,'--no-session-persistence','--permission-mode','default','--settings',JSON.stringify(settings),'--allowedTools','Read,Write,Edit,Bash,NotebookEdit'],
 {env:{...process.env,CLOUD_HOSTS_EXEC_URL:url,CLOUD_HOSTS_EXEC_TOKEN:token,CLOUD_HOSTS_EXEC_ORIGINAL_ENV:JSON.stringify(originalEnv)},stdio:['ignore','pipe','pipe'],windowsHide:true});
child.stdout.on('data',data=>diagnostic=(diagnostic+data).slice(-2000));child.stderr.on('data',data=>diagnostic=(diagnostic+data).slice(-2000));
const done=new Promise(resolve=>child.once('close',resolve));
const timer=setTimeout(()=>{process.stderr.write('Native Claude tool worker did not attach\n'+diagnostic);void close()},20000);
ready.then(()=>clearTimeout(timer));
async function close(){
 if(closing)return;closing=true;clearTimeout(timer);
 for(const id of pending)send({id,error:{message:'Native Claude execution connection closed'}});
 if(process.platform==='win32'&&child.pid){
  const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
  await new Promise(resolve=>{killer.once('error',()=>{child.kill();resolve()});killer.once('close',resolve)});
  await done;
 }else{child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),1500);await done;clearTimeout(kill)}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(folder,{recursive:true,force:true});process.exit(0);
}
child.once('error',error=>{process.stderr.write(error.message+'\n');void close()});
child.once('close',()=>{if(!closing){process.stderr.write(diagnostic||'Native Claude tool runtime exited');void close()}});
const input=createInterface({input:process.stdin});
input.on('line',line=>{
 const request=JSON.parse(line);
 if(request.method==='cancel'){if(pending.has(request.id))void close();return}
 if(request.method==='initialize'){void ready.then(value=>send({id:request.id,result:{...value,blockedInference}}));return}
 if(request.method!=='call'){send({id:request.id,error:{message:'Unsupported native Claude executor operation'}});return}
 pending.add(request.id);queue.push({id:request.id,tool:request.args[0]});dispatch();
});
input.on('close',()=>void close());process.on('SIGTERM',()=>void close());process.on('SIGHUP',()=>void close());
