import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fixtureCore} from './fixtures/headless-core.mjs'
const bin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-return-cli-')),run=promisify(execFile)
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}
const args=process.argv.slice(2);if(args.includes('-R')){const port=args[args.indexOf('-R')+1].split(':').at(-1);console.error('Allocated port '+port);setInterval(()=>{},1000)}else{const child=require('child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}
`,{mode:0o755})
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH})
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'"
try{
 const remote=path.join(f.temp,'cloud');fs.mkdirSync(remote)
 const host=await f.cli('host','create','--data',JSON.stringify({name:'Remote',host:'fixture',os:'linux',defaultDirectory:remote}))
 await f.cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote);await f.cli('group','add','Local')
 const remoteManager=await f.create('Cloud Manager','Cloud','manager');assert.equal(remoteManager.managementRole,'manager');assert.ok(remoteManager.cwd.startsWith(remote))
 const employee=await f.create('Cloud Employee','Cloud'),folder=path.join(employee.cwd,'.agents-company/employees',employee.id),launcher=path.join(folder,'bin/agents')
 await f.cli('session','open',employee.id) // Ordinary Employees provision the remote CLI when opened, without an initialization turn.
 const invoke=async args=>{let output;try{output=(await run('/bin/bash',['-lc',quote(launcher)+' '+args.map(quote).join(' ')+' --json'],{env:{PATH:'/usr/bin:/bin',HOME:os.homedir()},timeout:15000})).stdout}catch(error){output=error.stdout;if(!output)throw error}return JSON.parse(output)}
 const who=await invoke(['auth','whoami']);assert.ok(who.ok,who.error);assert.equal(who.data.principal.employeeId,employee.id);assert.equal(who.data.managementRole,'employee')
 const hosts=await invoke(['host','list','--os','linux','--summary']);assert.ok(hosts.ok,hosts.error);assert.equal(hosts.data[0].id,host.id);assert.equal(hosts.data[0].host,undefined)
 assert.equal((await invoke(['host','remove',host.id])).ok,false,'host discovery never grants host mutation')
 assert.ok(!fs.readFileSync(launcher,'utf8').includes('node'))
 const docs=await invoke(['api','docs','core/api']);assert.ok(docs.ok,docs.error);assert.match(docs.data.markdown,/schedule\.create/);assert.equal(fs.existsSync(path.join(folder,'API.md')),false,'public docs stay in the shared catalogue, not copied into each employee workspace')
 const denied=await invoke(['card','create','--title','Forbidden']);assert.equal(denied.ok,false)
 const input=path.join(employee.cwd,'source.txt');fs.writeFileSync(input,'read on remote, parsed on host')
 assert.ok((await invoke(['workspace','write','result.txt','--employee',employee.id,'--file',input])).ok)
 assert.equal(fs.readFileSync(path.join(employee.cwd,'result.txt'),'utf8'),'read on remote, parsed on host')
 assert.equal((await invoke(['serve'])).ok,false)
 const source=fs.readFileSync(path.join(folder,'bin/agents.py'),'utf8'),config=JSON.parse(JSON.parse(source.match(/CONFIG = json.loads\((.+)\)/)[1])),token=fs.readFileSync(path.join(folder,'token'),'utf8')
 const raw=payload=>new Promise((resolve,reject)=>{const socket=net.connect(config.port,'127.0.0.1');let text='';socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify(payload)+'\n'));socket.on('data',chunk=>{text+=chunk;if(text.includes('\n')){socket.destroy();resolve(JSON.parse(text.split('\n')[0]))}})})
 assert.match((await raw({auth:token,argv:['workspace','write','out','--employee',employee.id,'--file','/etc/passwd'],files:{}})).error,/not supplied/)
 await f.cli('card','management-role',employee.id,'manager');assert.equal((await invoke(['auth','whoami'])).data.managementRole,'manager')
 await f.cli('management','global',employee.id,'on');assert.equal((await invoke(['auth','whoami'])).data.managementRole,'governor')
 await f.cli('card','management-role',employee.id,'employee')
 await assert.rejects(()=>f.cli('management','team','--team','Cloud'),/Team 不再授予管理权限/)
 const manager=await f.create('Local Manager','Local','manager');await assert.rejects(()=>f.cli('card','move',manager.id,'Cloud'),/不能更换 Team/)
 await assert.rejects(()=>f.cli('card','update',manager.id,'--group','Cloud'),/不能更换 Team/)
 await f.cli('auth','revoke',employee.id);assert.equal((await invoke(['auth','whoami'])).ok,false)
 const thread=(await f.cli('session','list')).sessions.find(c=>c.id===employee.id).threadId;await f.stop();const statePath=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json'),state=JSON.parse(fs.readFileSync(statePath));state.sessions.find(c=>c.id===employee.id).managementRole='manager';state.access.globalManagerIds.push(employee.id);fs.writeFileSync(statePath,JSON.stringify(state));await f.start()
 const migrated=(await f.cli('session','list')).sessions.find(c=>c.id===employee.id);assert.equal(migrated.managementRole,'manager');assert.equal(migrated.threadId,thread)
 console.log('PASS remote Employee opens without hidden inference, login-shell CLI works without Node, same parser and remote file inputs, no local file read or service-start bypass, ordinary employee cannot hire, cloud promotion succeeds, credentials revoke immediately, cloud Manager role survives restart without native-history changes')
}finally{await f.close();fs.rmSync(bin,{recursive:true,force:true})}
