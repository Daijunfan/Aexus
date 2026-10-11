import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const run=promisify(execFile),project=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-ssh-'))),remote=path.join(temp,'remote'),home=path.join(temp,'state')
fs.mkdirSync(remote);fs.mkdirSync(home)
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r))
for(const name of ['host','client'])await run('ssh-keygen',['-q','-t','ed25519','-N','','-f',path.join(temp,name)])
fs.copyFileSync(path.join(temp,'client.pub'),path.join(temp,'authorized_keys'))
fs.writeFileSync(path.join(temp,'known_hosts'),`[127.0.0.1]:${port} `+fs.readFileSync(path.join(temp,'host.pub'),'utf8'))
fs.writeFileSync(path.join(temp,'sshd_config'),`Port ${port}\nListenAddress 127.0.0.1\nHostKey ${temp}/host\nPidFile ${temp}/sshd.pid\nAuthorizedKeysFile ${temp}/authorized_keys\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\nLogLevel ERROR\n`)
const sshd=spawn('/usr/sbin/sshd',['-D','-e','-f',path.join(temp,'sshd_config')],{stdio:'ignore'}),sshDone=new Promise(r=>sshd.once('exit',r))
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_TUNNEL_DIR:process.env.AGENTS_COMPANY_TEST_TUNNEL_DIR||path.join(project,'Modules/Tunnel')}
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'bin/agents')]
let daemon,done,liveCard;const cli=async(...args)=>{const reply=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:35000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const until=async(fn,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,120))}throw new Error('Timed out')}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 daemon=spawn(executable,[...prefix,'serve'],{env,stdio:'ignore'});done=new Promise(r=>daemon.once('exit',r));await until(async()=>{try{return (await cli('status')).running}catch{return false}})
 await cli('group','add','SSH integration','--mode','cloud','--remote-host',os.userInfo().username+'@127.0.0.1','--remote-dir',remote,'--remote-os','macos','--ssh-port',String(port),'--ssh-key',path.join(temp,'client'),'--known-hosts',path.join(temp,'known_hosts'))
 liveCard=await cli('card','create','--title','Native cloud engineer','--group','SSH integration','--engine','codex','--model','gpt-5.6-luna','--effort','low','--directory-mode','bind','--cwd','.')
 const check=await cli('remote','check','--employee',liveCard.id);ok(check.info.includes(remote),'real OpenSSH public-key authentication verifies the target working directory')
 await cli('workspace','write','encrypted.txt','--employee',liveCard.id,'--content','REAL_SSH_FILES');ok((await cli('workspace','read','encrypted.txt','--employee',liveCard.id)).content==='REAL_SSH_FILES','file editor API round-trips through the actual SSH server')
 const terminal=await cli('terminal','open','--employee',liveCard.id);await cli('terminal','input',terminal.id,'--data','printf REAL_SSH_PTY > encrypted-terminal.txt','--enter');await until(()=>fs.existsSync(path.join(remote,'encrypted-terminal.txt'))&&fs.readFileSync(path.join(remote,'encrypted-terminal.txt'),'utf8')==='REAL_SSH_PTY');ok(true,'interactive terminal runs through an actual SSH PTY')
 if(process.env.AGENTS_COMPANY_LIVE_CODEX==='1'){
  const token='LUNA_REMOTE_'+randomUUID(),file='native-codex-proof.txt',session=await cli('session','open',liveCard.id)
  await cli('session','send',session.sessionId,`Write ${JSON.stringify(token)} to ${file} in the working directory, read the file back, and reply with that exact token. Do not change any other files.`)
  await until(async()=>!(await cli('session','snapshot',session.sessionId)).busy,180000)
  const snapshot=await cli('session','snapshot',session.sessionId)
  if(!fs.existsSync(path.join(remote,file)))throw new Error('Native Codex remote proof missing: '+JSON.stringify(snapshot.items).slice(-3500))
  ok(fs.readFileSync(path.join(remote,file),'utf8')===token&&!fs.existsSync(path.join(temp,'projects','SSH integration',file))&&!fs.existsSync(path.join(home,'tunnel',liveCard.id,file)),'native Codex gpt-5.6-luna / low writes and reads exclusively through native execution over SSH')
  await cli('session','close',session.sessionId)
  const resumed=await cli('session','open',liveCard.id)
  await cli('session','send',resumed.sessionId,`Read ${file} with the available file tools. Reply with its exact contents only.`)
  await until(async()=>!(await cli('session','snapshot',resumed.sessionId)).busy,180000)
  const after=await cli('session','snapshot',resumed.sessionId)
  ok(after.items.slice(after.items.findLastIndex(item=>item.role==='user')+1).filter(item=>item.role==='assistant').flatMap(item=>item.blocks).some(block=>block.kind==='tool'&&!block.isError&&block.result?.includes(token))&&after.threadId===snapshot.threadId,'resumed native Codex conversation retains its remote tools and original thread identity')
  await cli('session','close',resumed.sessionId)
 }
 if(process.env.AGENTS_COMPANY_NATIVE_CLAUDE==='1'){
  Object.assign(process.env,env)
  const require=createRequire(import.meta.url),sdkPath=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=path.join(temp,'options.cjs')
  await build({stdin:{contents: "export {buildOptions,AsyncQueue} from './src/main/sessions';export {prepareRemote} from './src/main/tunnel'",resolveDir:project,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,alias:{'@anthropic-ai/claude-agent-sdk':sdkPath},external:[sdkPath],logLevel:'silent'})
  const {buildOptions,AsyncQueue,prepareRemote}=require(bundle),{query,deleteSession}=await import('@anthropic-ai/claude-agent-sdk')
  const launch=await prepareRemote('claude-native-test','claude',liveCard.remote),input=new AsyncQueue(),options=buildOptions({cwd:liveCard.cwd,remote:liveCard.remote,remoteLaunch:launch,permissionMode:'acceptEdits',effort:'low'}),ids=new Set()
  assert.deepEqual(options.tools,[]);assert.equal(options.strictMcpConfig,true)
  const hook=options.hooks.PreToolUse[0].hooks[0];assert.equal((await hook({tool_name:'Bash'})).hookSpecificOutput.permissionDecision,'deny');assert.equal((await hook({tool_name:'mcp__tunnel__execute'})).hookSpecificOutput.permissionDecision,'allow')
  const q=query({prompt:input,options}),drain=(async()=>{try{for await(const message of q)if(message.session_id)ids.add(message.session_id)}catch{}})()
  try{await until(async()=>{const state=await q.mcpServerStatus();return state.find(server=>server.name==='tunnel')?.status==='connected'},30000);ok(true,'native Claude SDK connects its Tunnel MCP over real SSH; local tools are disabled and guarded; no inference')}
  finally{input.close();q.close();await drain;for(const id of ids)try{await deleteSession(id)}catch(error){if(!String(error).includes('not found'))throw error}}
 }
 await cli('card','remove',liveCard.id);liveCard=null
 ok(!(await cli('terminal','list')).length&&fs.existsSync(path.join(remote,'encrypted.txt')),'removal cleans up terminals and native session metadata while retaining target files')
 console.log(`PASS=${n} FAIL=0 — real encrypted SSH; live Codex=${process.env.AGENTS_COMPANY_LIVE_CODEX==='1'}`)
}finally{
 if(liveCard&&daemon?.exitCode===null)try{for(const s of await cli('session','list','--live'))await cli('session','close',s.id);await cli('card','remove',liveCard.id)}catch(e){console.error('Test session cleanup:',e.message)}
 if(daemon?.exitCode===null){daemon.kill('SIGTERM');await done}sshd.kill('SIGTERM');await sshDone;fs.rmSync(temp,{recursive:true,force:true})
}
