import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const run=promisify(execFile),project=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-rt-')))
const home=path.join(temp,'state'),remote=path.join(temp,'cloud'),bin=path.join(temp,'bin')
for(const p of [home,remote,bin])fs.mkdirSync(p)
fs.mkdirSync(path.join(remote,'nested'));fs.writeFileSync(path.join(remote,'proof.txt'),'cloud initial')
fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3
import os,sys
if 'offline' in sys.argv:sys.stderr.write('fixture: SSH unreachable');sys.exit(255)
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
const fixture=path.join(bin,'codex-fixture')
fs.writeFileSync(fixture,`#!/usr/bin/env node
const {execFileSync}=require('child_process'),readline=require('readline'),args=process.argv.slice(2);
if(!args.includes('model="gpt-5.6-luna"')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
const emit=value=>process.stdout.write(JSON.stringify(value)+'\\n'),threadId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const req=JSON.parse(line),p=req.params??{};if(req.id===undefined)return;
 if(req.method==='model/list'){emit({id:req.id,result:{data:[{id:'luna',model:'gpt-5.6-luna',displayName:'Luna',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low',serviceTiers:[{id:'priority',name:'Fast',description:'Fast'}]}]}});return}\n if(req.method==='thread/start'||req.method==='thread/resume'){if(!process.env.CODEX_EXEC_SERVER_URL?.startsWith('ws://127.0.0.1:'))process.exit(5);emit({id:req.id,result:{thread:{id:threadId}}});return}
 if(req.method==='turn/start'){\n  if(p.serviceTier!=='priority'||p.effort!=='low'||p.model!=='gpt-5.6-luna')process.exit(7);
  require('fs').writeFileSync(${JSON.stringify(path.join(temp,'remote-policy.json'))},JSON.stringify(p.sandboxPolicy));const cwd=p.environments[0].cwd;
  const output=execFileSync('ssh',['fixture',"cd '"+cwd.replaceAll("'","'\\''")+"' && printf AGENT_REMOTE_OK > routed-by-agent.txt; pwd"],{encoding:'utf8'});
  emit({id:req.id,result:{turn:{id:'turn1'}}});emit({method:'turn/started',params:{turn:{id:'turn1'}}});
  emit({method:'item/completed',params:{item:{type:'commandExecution',id:'cmd1',command:'write proof',aggregatedOutput:output,exitCode:0}}});emit({method:'turn/completed',params:{turn:{id:'turn1',status:'completed'}}});return
 }
 emit({id:req.id,result:{}});
});
`,{mode:0o755})
const env={...process.env,PATH:bin+':'+process.env.PATH,SHELL:'/bin/bash',HISTFILE:'/dev/null',BASH_SILENCE_DEPRECATION_WARNING:'1',AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_TUNNEL_DIR:process.env.AGENTS_COMPANY_TEST_TUNNEL_DIR||path.join(project,'Infra/src/tunnel'),CODEX_BIN:fixture}
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'Infra/src/cli/agents')]
let service,done;const cli=async(...args)=>{const reply=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:30000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const until=async(fn)=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40))}throw new Error('Condition timed out')}
const start=async()=>{service=spawn(executable,[...prefix,'serve'],{env,stdio:'ignore'});done=new Promise(r=>service.once('exit',r));await until(async()=>{try{return (await cli('status')).running}catch{return false}})}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await start();await cli('group','add','Build');await cli('group','add','Work','--mode','work','--plugin','mininotion')
 await assert.rejects(()=>cli('card','create','--title','Remote Work','--group','Work','--remote-host','fixture','--remote-dir',remote))
 const host=await cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote,distribution:'kali'}))
 await cli('group','add','Cloud Team','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const cloud=await cli('card','create','--title','Cloud','--group','Cloud Team','--directory-mode','bind','--cwd','.')
 const local=await cli('card','create','--title','Local','--group','Build')
 ok(cloud.remote.directory===remote&&cloud.remote.host==='fixture'&&cloud.remote.distribution==='kali','cloud Team owns its OS label and connection; employees inherit both without overrides')
 const child=await cli('card','create','--title','云端工程师','--group','Cloud Team')
 ok(child.cwd===path.join(remote,'云端工程师')&&fs.existsSync(child.cwd)&&!JSON.parse(fs.readFileSync(path.join(home,'sessions.json'))).sessions.find(c=>c.id===child.id).remote,'default cloud folders are created remotely and SSH credentials are stored only on the Team')
 await assert.rejects(()=>cli('card','create','--title','Escape','--group','Cloud Team','--directory-mode','bind','--cwd','..'))
 await assert.rejects(()=>cli('card','update',child.id,'--remote-host','other','--remote-dir',remote))
 ok((await cli('workspace','list','.','--team','Cloud Team')).entries.some(e=>e.name==='云端工程师'),'Team file APIs use the remote root and employee host overrides are rejected')
 const otherRoot=path.join(temp,'other-cloud');fs.mkdirSync(otherRoot)
 await assert.rejects(()=>cli('group','configure','Cloud Team','--mode','cloud','--host-id',host.id,'--remote-dir',otherRoot))
 ok((await cli('group','list','--details')).find(g=>g.name==='Cloud Team').remote.directory===remote,'cloud Team reconfiguration validates every employee folder before changing metadata')
 fs.mkdirSync(path.join(otherRoot,'云端工程师'));await cli('group','configure','Cloud Team','--mode','cloud','--host-id',host.id,'--remote-dir',otherRoot)
 ok((await cli('session','list')).sessions.find(c=>c.id===child.id).cwd===path.join(otherRoot,'云端工程师')&&fs.existsSync(path.join(remote,'proof.txt')),'changing a cloud Team rebinds its employees without moving or deleting remote files')
 await cli('group','configure','Cloud Team','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await cli('remote','check','--employee',cloud.id)
 ok((await cli('workspace','read','proof.txt','--employee',cloud.id)).content==='cloud initial','the file API reads the remote folder instead of the local bookkeeping folder')
 const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP+kAAAAASUVORK5CYII=','base64');fs.writeFileSync(path.join(remote,'remote.png'),imageBytes)
 const cloudImage=await cli('workspace','image','remote.png','--employee',cloud.id);ok(cloudImage.mimeType==='image/png'&&Buffer.from(cloudImage.data,'base64').equals(imageBytes),'cloud image attachments read bytes through the scoped SSH file API')
 const document=await cli('workspace','read','proof.txt','--employee',cloud.id)
 await cli('workspace','write','proof.txt','--employee',cloud.id,'--hash',document.hash,'--content','cloud edited')
 await assert.rejects(()=>cli('workspace','write','proof.txt','--employee',cloud.id,'--hash',document.hash,'--content','stale overwrite'))
 await cli('workspace','mkdir','created','--employee',cloud.id)
 await cli('workspace','move','proof.txt','--employee',cloud.id,'--to','created/renamed.txt')
 const removed=await cli('workspace','trash','created/renamed.txt','--employee',cloud.id);await cli('workspace','restore','--id',removed.id,'--employee',cloud.id)
 ok(fs.readFileSync(path.join(remote,'created/renamed.txt'),'utf8')==='cloud edited'&&!fs.existsSync(path.join(temp,'projects','Cloud Team')),'remote editing, conflict checks, mkdir, rename, trash and restore stay remote')
 fs.symlinkSync(temp,path.join(remote,'outward'))
 await assert.rejects(()=>cli('workspace','read','../state/sessions.json','--employee',cloud.id))
 await assert.rejects(()=>cli('workspace','read','outward/state/sessions.json','--employee',cloud.id))
 ok(true,'remote file tree rejects traversal and outward symlinks')
 const legacyThread='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',stored=JSON.parse(fs.readFileSync(path.join(home,'sessions.json')))
 stored.sessions.find(c=>c.id===cloud.id).threadId=legacyThread
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(stored))
 fs.mkdirSync(path.join(home,'transcripts'),{recursive:true});fs.writeFileSync(path.join(home,'transcripts',cloud.id+'.json'),JSON.stringify([{role:'user',id:'old',text:'Earlier conversation'}]))
 const opened=await cli('session','open',cloud.id);await cli('config','remote-admin',opened.sessionId,'on');assert.equal((await cli('session','info',opened.sessionId)).remoteAdmin,true);ok(opened.cwd===remote,'employee conversation reports the remote working directory')
 await until(async()=>(await cli('session','info',opened.sessionId)).models[0]?.displayName==='Luna');await cli('config','fast',opened.sessionId,'on')
 await cli('session','send',opened.sessionId,'fixture routing, no inference');await until(()=>fs.existsSync(path.join(remote,'routed-by-agent.txt')))
 await until(async()=>!(await cli('session','snapshot',opened.sessionId)).busy)
 ok(fs.readFileSync(path.join(remote,'routed-by-agent.txt'),'utf8')==='AGENT_REMOTE_OK'&&!fs.existsSync(path.join(home,'tunnel',cloud.id,'routed-by-agent.txt')),'cloud native turn receives Luna/low/Fast and selects the Team environment without local work artifacts')
 assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'remote-policy.json'))).type,'dangerFullAccess');await cli('config','remote-admin',opened.sessionId,'off');assert.equal((await cli('session','info',opened.sessionId)).remoteAdmin,false)
 const migrated=(await cli('session','list')).sessions.find(c=>c.id===cloud.id)
 ok(migrated.codexExecution==='native-v1'&&migrated.threadId!==legacyThread&&migrated.nativeSessions.some(ref=>ref.id===legacyThread),'old model context is replaced once while retaining its native cleanup reference')
 ok((await cli('session','transcript',cloud.id)).text.includes('Earlier conversation'),'cleaning the model context preserves the visible conversation')
 await cli('session','close',opened.sessionId)
 const removedRoot=remote+'-removed';fs.renameSync(remote,removedRoot)
 const missing=error=>{const message=String(error.stdout||error.message);assert.match(message,/云端工作目录不存在/);assert.ok(!message.includes('Fatal Python error')&&!message.includes('.agents-company-tmp-'));return true}
 try{
   await assert.rejects(()=>cli('session','open',cloud.id),missing)
   await assert.rejects(()=>cli('workspace','list','.','--employee',cloud.id),missing)
   // This employee has no cached file connection: exercise the bootstrap failure too.
   await assert.rejects(()=>cli('workspace','list','.','--employee',child.id),missing)
   ok(!fs.existsSync(remote)&&(await cli('session','list')).sessions.find(c=>c.id===cloud.id).threadId===migrated.threadId,'a missing cloud folder reports an actionable error without recreating data or resetting the session')
 }finally{fs.renameSync(removedRoot,remote)}
 await cli('remote','check','--employee',cloud.id)
 ok((await cli('workspace','read','created/renamed.txt','--employee',cloud.id)).content==='cloud edited','restoring the directory lets the original employee reconnect and read its files')
 const resumed=await cli('session','open',cloud.id)
 ok((await cli('session','list')).sessions.find(c=>c.id===cloud.id).threadId===migrated.threadId,'subsequent opens retain the clean native thread')
 opened.sessionId=resumed.sessionId
 await assert.rejects(()=>cli('config','permission',opened.sessionId,'bypassPermissions'))
 const localLive=await cli('session','open',local.id);await assert.rejects(()=>cli('config','remote-admin',localLive.sessionId,'on'));
 const native=await cli('terminal','open','--employee',local.id,'--cols','100','--rows','24')
 await cli('terminal','input',native.id,'--data','pwd > terminal-cwd.txt; mkdir -p shell-folder; cd shell-folder; export EMPLOYEE_TEST=kept','--enter')
 await until(()=>fs.existsSync(path.join(local.cwd,'terminal-cwd.txt')))
 await cli('terminal','input',native.id,'--data','printf "$EMPLOYEE_TEST" > state.txt','--enter')
 await until(()=>fs.existsSync(path.join(local.cwd,'shell-folder/state.txt')))
 ok(fs.readFileSync(path.join(local.cwd,'terminal-cwd.txt'),'utf8').trim()===local.cwd&&fs.readFileSync(path.join(local.cwd,'shell-folder/state.txt'),'utf8')==='kept','local PTY starts in employee cwd and retains cd and environment between commands')
 await cli('terminal','resize',native.id,'--cols','113','--rows','31');await cli('terminal','input',native.id,'--data','stty size > size.txt','--enter')
 await until(()=>fs.existsSync(path.join(local.cwd,'shell-folder/size.txt'))&&fs.readFileSync(path.join(local.cwd,'shell-folder/size.txt'),'utf8').trim().length>0)
 ok(fs.readFileSync(path.join(local.cwd,'shell-folder/size.txt'),'utf8').trim()==='31 113','PTY resizing reaches the actual shell: '+JSON.stringify(fs.readFileSync(path.join(local.cwd,'shell-folder/size.txt'),'utf8')))
 await cli('terminal','input',native.id,'--data','sleep 30','--enter');await new Promise(r=>setTimeout(r,100));await cli('terminal','input',native.id,'--data','\u0003');await cli('terminal','input',native.id,'--data','printf stopped > interrupted.txt','--enter')
 await until(()=>fs.existsSync(path.join(local.cwd,'shell-folder/interrupted.txt')));ok(true,'Ctrl+C interrupts a terminal command without killing the shell')
 const ssh=await cli('terminal','open','--employee',cloud.id);await cli('terminal','input',ssh.id,'--data','pwd > terminal-remote.txt; printf REMOTE_PTY','--enter')
 await until(()=>fs.existsSync(path.join(remote,'terminal-remote.txt')))
 ok(fs.readFileSync(path.join(remote,'terminal-remote.txt'),'utf8').trim()===remote&&!fs.existsSync(path.join(home,'tunnel',cloud.id,'terminal-remote.txt')),'cloud PTY uses SSH and starts directly in the remote employee folder')
 await cli('card','update',cloud.id,'--role','Remote builder')
 ok((await cli('terminal','list','--employee',cloud.id)).length===1,'saving unchanged remote settings preserves the active terminal')
 await cli('group','rename','Cloud Team','Cloud Renamed')
 const renamedCloud=await cli('session','list')
 ok(renamedCloud.teamRoots['Cloud Renamed']===remote&&renamedCloud.sessions.find(c=>c.id===cloud.id).group==='Cloud Renamed'&&(await cli('session','snapshot',opened.sessionId)).group==='Cloud Renamed'&&(await cli('workspace','list','.','--team','Cloud Renamed')).entries.some(e=>e.name==='云端工程师')&&(await cli('terminal','list','--employee',cloud.id)).length===1,'cloud Team rename preserves host, remote folder, live session and active terminal')
 await assert.rejects(()=>cli('group','rename','Cloud Renamed','Build'))
 const hostFile=path.join(home,'cloud-hosts/hosts.json'),before=JSON.parse(fs.readFileSync(hostFile)),offline=structuredClone(before);offline.find(h=>h.id===host.id).host='offline';fs.writeFileSync(hostFile,JSON.stringify(offline))
 await cli('session','close',opened.sessionId)
 await assert.rejects(()=>cli('session','open',cloud.id));await assert.rejects(()=>cli('workspace','write','must-not-exist.txt','--employee',cloud.id,'--content','x'))
 ok(!fs.existsSync(path.join(remote,'must-not-exist.txt')),'SSH failure is reported and never falls back to local file writes')
 fs.writeFileSync(hostFile,JSON.stringify(before))
 await cli('card','remove',local.id);ok(!(await cli('terminal','list','--employee',local.id)).length&&fs.existsSync(local.cwd),'employee removal closes its terminals but keeps work files')
 await cli('group','remove','Build');await cli('group','remove','Cloud Renamed');ok(!(await cli('terminal','list')).length&&fs.existsSync(remote),'Team removal closes all remaining terminals without removing remote files')
 console.log(`PASS=${n} FAIL=0 — actual PTYs and SSH transport fixture, no model calls`)
}finally{if(service?.exitCode===null){service.kill('SIGTERM');await done}fs.rmSync(temp,{recursive:true,force:true})}
