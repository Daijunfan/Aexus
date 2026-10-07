import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {fileURLToPath} from 'node:url'
import {spawn,execFile} from 'node:child_process'
import {createNodeClient} from '../../../Contract/node-client.mjs'
import {modelServer} from './model-server.mjs'
export const engine=path.resolve(fileURLToPath(new URL('../',import.meta.url))),repo=path.resolve(engine,'../..'),evidence=path.join(repo,'.aexus/artifacts/profile-improvement')
fs.mkdirSync(evidence,{recursive:true})
const exec=(program,args,options={})=>new Promise((resolve,reject)=>execFile(program,args,{maxBuffer:24*1024*1024,...options},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve(stdout)))
export async function waitFor(fn,label,timeout=30000){const until=Date.now()+timeout;let last;while(Date.now()<until){try{const value=await fn();if(value)return value}catch(error){if(error.fatal)throw error;last=error}await new Promise(resolve=>setTimeout(resolve,120))}throw Error(label+' timed out'+(last?': '+last.message:''))}
/** Copy a disposable application through its documented build scripts; never import Infra implementations. */
export async function application(){
 if(process.env.PROFILE_TEST_APPLICATION)return {root:process.env.PROFILE_TEST_APPLICATION,dispose(){}}
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-profile-app-')))
 for(const name of fs.readdirSync(repo))if(!name.startsWith('.')&&fs.statSync(path.join(repo,name)).isFile())fs.copyFileSync(path.join(repo,name),path.join(root,name))
 const selected=process.env.PROFILE_TEST_ENGINES?.split(',')
 for(const name of ['Infra','Contract','Engine'])fs.cpSync(path.join(repo,name),path.join(root,name),{recursive:true,mode:fs.constants.COPYFILE_FICLONE,filter:source=>{const relative=path.relative(repo,source).split(path.sep);return !(selected&&relative[0]==='Engine'&&relative[1]&&!selected.includes(relative[1]))&&!source.split(path.sep).some(part=>['node_modules','.git','.aexus','workspaces','coverage'].includes(part))}})
 fs.symlinkSync(path.join(repo,'node_modules'),path.join(root,'node_modules'),'dir')
 for(const name of fs.readdirSync(path.join(repo,'Engine')))if(fs.existsSync(path.join(root,'Engine',name))&&fs.existsSync(path.join(repo,'Engine',name,'node_modules')))fs.symlinkSync(path.join(repo,'Engine',name,'node_modules'),path.join(root,'Engine',name,'node_modules'),'dir')
 try{const log=await exec(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{cwd:root,timeout:180000,env:{...process.env,AGENTS_COMPANY_RELEASE:'0'}});fs.writeFileSync(path.join(evidence,'build.log'),log)}catch(error){fs.writeFileSync(path.join(evidence,'build.log'),String(error.stdout)+'\n'+String(error.stderr));fs.rmSync(root,{recursive:true,force:true});throw error}
 return {root,dispose(){fs.rmSync(root,{recursive:true,force:true})}}
}
export async function fixtureCore(app){
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-profile-core-'))),home=path.join(temp,'home');fs.mkdirSync(home)
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('AGENTS_COMPANY_')||k.startsWith('AEXUS_')||['ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY'].includes(k))delete env[k]
 Object.assign(env,{HOME:home,USER:'djf',LOGNAME:'djf',AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),AGENTS_COMPANY_SHARED:path.join(temp,'shared'),CODEX_HOME:path.join(temp,'codex'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),PROFILE_FIXTURE_LOG_DIR:path.join(temp,'native'),PROFILE_FIXTURE_DELAY_MS:'170'})
 const cli=path.join(app.root,'Infra/src/cli/aexus');env.PROFILE_FIXTURE_CLI=cli;const client=createNodeClient({cli,env}),probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 let child,log='',fd
 const start=async()=>{log='';fd=fs.openSync(path.join(temp,'core.log'),'a');child=spawn(process.execPath,[cli,'serve','--web','--port',String(port)],{cwd:temp,env,stdio:['ignore',fd,fd],detached:process.platform!=='win32'});await waitFor(()=>client.info(),'public Core startup',30000)}
 const stop=async()=>{if(!child||child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('close',resolve));if(process.platform==='win32')child.kill('SIGTERM');else try{process.kill(-child.pid,'SIGTERM')}catch{};await Promise.race([ended,new Promise(resolve=>setTimeout(resolve,5000))]);if(child.exitCode===null)try{process.kill(-child.pid,'SIGKILL')}catch{};if(fd!==undefined){fs.closeSync(fd);fd=undefined}}
 // Input is sent via stdin; it never becomes a shell command or a persistent credential.
 const admin=(command,args={})=>new Promise((resolve,reject)=>{const c=execFile(process.execPath,[cli,'api','call',command,'--args','@-','--json'],{env,cwd:temp,maxBuffer:24*1024*1024},(error,stdout,stderr)=>{let value;try{value=JSON.parse(stdout)}catch{return reject(Error(stderr||error?.message||'Invalid CLI reply'))}value.ok?resolve(value.data):reject(Object.assign(Error(value.error),{code:value.code}))});c.stdin.end(JSON.stringify(args))})
 try{await start()}catch(error){fs.writeFileSync(path.join(evidence,'fixture-start-error.log'),fs.readFileSync(path.join(temp,'core.log')));await stop();fs.rmSync(temp,{recursive:true,force:true});throw error}
 const model=await modelServer();let executable=process.env.PROFILE_TEST_PI_BIN
 try{
  if(!executable){const job=await admin('engine.install',{engine:'pi',confirm:true});await waitFor(async()=>{const result=await admin('engine.install-status',{id:job.id});if(result.state==='failed')throw Object.assign(Error(result.error),{fatal:true});return result.state==='succeeded'},'temporary official Pi installation',120000);executable=(await admin('engine.check',{engine:'pi',force:true})).path}
  await exec(process.execPath,[cli,'engine','configure','--engine','pi','--data',JSON.stringify({path:executable,baseUrl:model.url,model:'fixture-model',apiKey:'fixture-only-no-network'}),'--json'],{env,cwd:temp})
 }catch(error){await stop();await model.close();fs.rmSync(temp,{recursive:true,force:true});throw error}
 return {temp,home,env,cli,port,client,admin,model,start,stop,webToken:async()=>(await exec(process.execPath,[cli,'web','token'],{env,cwd:temp})).trim(),log:()=>fs.readFileSync(path.join(temp,'core.log'),'utf8'),async close(){await stop();await model.close();fs.rmSync(temp,{recursive:true,force:true})}}
}
