import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNodeClient} from '../../../Contract/node-client.mjs';
import {nativeProvider} from './native-provider.mjs';
export const engine=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(engine,'../..'),evidence=path.join(engine,'test-artifacts/infra');
fs.mkdirSync(evidence,{recursive:true});
export const exec=(bin,args,options={})=>new Promise((resolve,reject)=>execFile(bin,args,{maxBuffer:32*1024*1024,...options},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve(stdout)));
export async function waitFor(fn,label,timeout=45000){let last;const until=Date.now()+timeout;while(Date.now()<until){try{const value=await fn();if(value)return value;}catch(e){if(e.fatal)throw e;last=e;}await new Promise(r=>setTimeout(r,180));}throw Error(label+' timed out'+(last?': '+last.message:''));}
/** Black-box test setup uses documented builds and the public operator CLI, never imports Infra. */
export async function application(){
 if(process.env.PPT_MAKER_TEST_APPLICATION)return {root:process.env.PPT_MAKER_TEST_APPLICATION,dispose(){}};
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-ppt-application-')));
 for(const name of fs.readdirSync(repo))if(!name.startsWith('.')&&fs.statSync(path.join(repo,name)).isFile())fs.copyFileSync(path.join(repo,name),path.join(root,name));
 for(const name of ['Infra','Contract','Engine'])fs.cpSync(path.join(repo,name),path.join(root,name),{recursive:true,mode:fs.constants.COPYFILE_FICLONE,filter:src=>!src.split(path.sep).some(part=>['node_modules','.git','.aexus','test-artifacts','artifacts','workspaces','coverage'].includes(part))});
 fs.symlinkSync(path.join(repo,'node_modules'),path.join(root,'node_modules'),'dir');
 for(const name of fs.readdirSync(path.join(repo,'Engine')))if(fs.existsSync(path.join(root,'Engine',name))&&fs.existsSync(path.join(repo,'Engine',name,'node_modules')))fs.symlinkSync(path.join(repo,'Engine',name,'node_modules'),path.join(root,'Engine',name,'node_modules'),'dir');
 try{const log=await exec(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{cwd:root,timeout:180000,env:{...process.env,AGENTS_COMPANY_RELEASE:'0'}});fs.writeFileSync(path.join(evidence,'build.log'),log);}catch(e){fs.writeFileSync(path.join(evidence,'build.log'),String(e.stdout)+'\n'+String(e.stderr));fs.rmSync(root,{recursive:true,force:true});throw e;}
 return {root,dispose(){if(!process.env.PPT_MAKER_KEEP_TEST_APP)fs.rmSync(root,{recursive:true,force:true});}};
}
export async function coreFixture(app,{withModel=true}={}){
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-ppt-core-'))),home=path.join(temp,'home');fs.mkdirSync(home);
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('AGENTS_COMPANY_')||k.startsWith('AEXUS_')||['ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','PI_CODING_AGENT_DIR','CODEX_HOME','CLAUDE_CONFIG_DIR'].includes(k))delete env[k];
 Object.assign(env,{HOME:home,USER:process.env.USER??'djf',LOGNAME:process.env.LOGNAME??'djf',AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),AGENTS_COMPANY_SHARED:path.join(temp,'shared'),CODEX_HOME:path.join(temp,'codex'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),PI_CODING_AGENT_DIR:path.join(temp,'pi')});
 const cli=path.join(app.root,'Infra/src/cli/aexus'),client=createNodeClient({cli,env,timeout:45000,maxBuffer:32*1024*1024}),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 let child,fd,provider;
 const start=async()=>{fd=fs.openSync(path.join(temp,'core.log'),'a');child=spawn(process.execPath,[cli,'serve','--web','--port',String(port)],{cwd:temp,env,stdio:['ignore',fd,fd],detached:process.platform!=='win32'});await waitFor(()=>client.info(),'isolated Core startup');};
 const stop=async()=>{if(child&&child.exitCode===null){const ended=new Promise(r=>child.once('close',r));try{process.platform==='win32'?child.kill('SIGTERM'):process.kill(-child.pid,'SIGTERM');}catch{}await Promise.race([ended,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null)try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}}if(fd!==undefined){fs.closeSync(fd);fd=undefined;}};
 const admin=(command,args={})=>new Promise((resolve,reject)=>{const p=execFile(process.execPath,[cli,'api','call',command,'--args','@-','--json'],{cwd:temp,env,maxBuffer:32*1024*1024,timeout:45000},(error,stdout,stderr)=>{let v;try{v=JSON.parse(stdout);}catch{return reject(Error(stderr||error?.message||'Invalid public CLI reply'));}v.ok?resolve(v.data):reject(Object.assign(Error(v.error),{code:v.code}));});p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify(args));});
 try{
  await start();
  if(withModel){provider=await nativeProvider();let executable=process.env.PPT_MAKER_TEST_PI_BIN;
   if(!executable){const install=await admin('engine.install',{engine:'pi',confirm:true});await waitFor(async()=>{const s=await admin('engine.install-status',{id:install.id});if(s.state==='failed')throw Object.assign(Error(s.error),{fatal:true});return s.state==='succeeded';},'isolated official Pi installation',120000);executable=(await admin('engine.check',{engine:'pi',force:true})).path;}
   await exec(process.execPath,[cli,'engine','configure','--engine','pi','--data',JSON.stringify({path:executable,baseUrl:provider.url,model:'ppt-fixture',apiKey:'ppt-fixture-no-paid-provider'}),'--json'],{cwd:temp,env});
  }
 }catch(e){fs.writeFileSync(path.join(evidence,'setup-error.log'),fs.existsSync(path.join(temp,'core.log'))?fs.readFileSync(path.join(temp,'core.log')):String(e));await stop();await provider?.close();fs.rmSync(temp,{recursive:true,force:true});throw e;}
 return {temp,env,cli,client,admin,provider,port,start,stop,log:()=>fs.readFileSync(path.join(temp,'core.log'),'utf8'),webToken:async()=>(await exec(process.execPath,[cli,'web','token'],{cwd:temp,env})).trim(),async close(){await stop();await provider?.close();fs.rmSync(temp,{recursive:true,force:true});}};
}
