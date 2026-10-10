import {nativeFixture} from './native-fixture.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-host-registry-'))),home=path.join(temp,'state'),remote=path.join(temp,'remote'),bin=path.join(temp,'bin')
for(const directory of [home,remote,bin])fs.mkdirSync(directory);fs.mkdirSync(path.join(remote,'nested'))
fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3
import os,sys,subprocess
if '-G' in sys.argv:print('hostname fixture');print('port 22');sys.exit(0)
if 'offline' in sys.argv:sys.exit(255)
if 'password-host' in sys.argv:
 assert os.environ.get('SSH_ASKPASS_REQUIRE')=='force'
 assert subprocess.check_output([os.environ['SSH_ASKPASS']]).decode().strip()=='fixture-password'
 assert not any('fixture-password' in a for a in sys.argv)
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
fs.writeFileSync(path.join(bin,'ssh-keyscan'),'#!/bin/sh\nprintf \'fixture ssh-ed25519 Zml4dHVyZS1rZXk=\\n\'\n',{mode:0o755})
// Two legacy Teams on the same host migrate to one registry record without SSH.
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({groups:['Legacy A','Legacy B'],sessions:[],rooms:{},teamRoots:{'Legacy A':remote,'Legacy B':path.join(remote,'nested')},teamSettings:Object.fromEntries(['Legacy A','Legacy B'].map((name,i)=>[name,{mode:'cloud',remote:{host:'legacy',os:'linux',directory:i?path.join(remote,'nested'):remote}}]))}))
const fixture=path.join(bin,'codex-fixture');fs.writeFileSync(fixture,'#!/usr/bin/env node\nprocess.stdin.resume()\n',{mode:0o755})
const env={...process.env,CODEX_BIN:nativeFixture(fixture),AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),PATH:bin+':'+process.env.PATH}
let daemon,ended
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:35000})).stdout);assert.ok(r.ok,r.error);return r.data}
try{
 daemon=spawn(process.execPath,[root+'/Infra/src/cli/agents','serve'],{env,stdio:'ignore'});ended=new Promise(r=>daemon.once('exit',r));for(let i=0;i<100;i++){try{await cli('status');break}catch{await new Promise(r=>setTimeout(r,50))}}
 assert.equal((await cli('host','list')).length,1)
 const legacy=JSON.parse(fs.readFileSync(path.join(home,'sessions.json')));assert.equal(legacy.teamSettings['Legacy A'].hostId,legacy.teamSettings['Legacy B'].hostId);assert.equal(legacy.teamSettings['Legacy A'].remote,undefined)
 const host=await cli('host','create','--data',JSON.stringify({name:'Password fixture',host:'password-host',os:'linux',defaultDirectory:remote,password:'fixture-password',distribution:'kali'}))
 assert.equal(host.hasPassword,true);assert.ok(!JSON.stringify(host).includes('fixture-password'));assert.ok(!fs.readFileSync(path.join(home,'cloud-hosts/hosts.json'),'utf8').includes('fixture-password'))
 assert.equal(fs.statSync(path.join(home,'cloud-hosts/credential.key')).mode&0o777,0o600)
 assert.equal((await cli('host','credentials',host.id)).password,'fixture-password')
 const fingerprints=await cli('host','fingerprints',host.id);assert.equal(fingerprints.length,1);await assert.rejects(()=>cli('host','trust',host.id,'--fingerprint','SHA256:wrong'));await cli('host','trust',host.id,'--fingerprint',fingerprints[0].fingerprint)
 assert.equal((await cli('host','check',host.id)).connected,true,'password travels over private socket askpass, never argv')
 const missingRoot=await cli('host','create','--data',JSON.stringify({name:'Reachable without workspace',host:'legacy',os:'linux',defaultDirectory:path.join(temp,'missing-directory')}))
 assert.equal((await cli('host','check',missingRoot.id)).connected,true,'SSH lamp reflects host reachability even when its default workspace does not exist')
 await assert.rejects(()=>cli('remote','check','--remote-host','legacy','--remote-dir',path.join(temp,'missing-directory')),'workspace check still rejects a missing directory')
 await cli('host','remove',missingRoot.id)
 assert.equal((await cli('host','directories',host.id)).entries[0].name,'nested')
 const executed=await cli('host','exec',host.id,'--command','pwd','--directory',remote);assert.equal(executed.exit_code,0);assert.equal(executed.stdout.trim(),remote)
 const nonzero=await cli('host','exec',host.id,'--command','echo readable-failure >&2; exit 7','--directory',remote);assert.equal(nonzero.exit_code,7);assert.match(nonzero.stderr,/readable-failure/)
 const vm=await cli('host','create','--data',JSON.stringify({name:'VM fixture',host:'lab@192.0.2.11',os:'linux',defaultDirectory:'/home/lab',vm:{hypervisorId:host.id,name:'ubuntu-test',projectDirectory:remote,state:'stopped',access:'serial'}}));assert.equal(vm.vm.state,'stopped');assert.equal((await cli('host','check',vm.id)).connected,false);await assert.rejects(()=>cli('host','exec',vm.id,'--command','touch /tmp/should-never-run'));await cli('host','update',vm.id,'--data',JSON.stringify({vm:{state:'running'}}));assert.equal((await cli('host','get',vm.id)).vm.access,'serial');await cli('host','remove',vm.id)
 await assert.rejects(()=>cli('group','add','Inline forbidden','--mode','cloud','--remote-host','password-host','--remote-dir',remote))
 await cli('group','add','Bound','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const worker=await cli('card','create','--title','Remote worker','--group','Bound')
 assert.equal(worker.remote.credentialId,host.id);assert.equal(worker.remote.directory,path.join(remote,'Remote worker'))
 await cli('host','update',host.id,'--data','{"name":"Renamed host","distribution":"ubuntu"}')
 assert.equal((await cli('session','list')).sessions.find(c=>c.id===worker.id).remote.distribution,'ubuntu')
 await assert.rejects(()=>cli('host','remove',host.id))
 const offline=await cli('host','create','--data',JSON.stringify({name:'Offline',host:'offline',os:'linux',defaultDirectory:remote}));assert.equal((await cli('host','check',offline.id)).connected,false)
 await cli('host','remove',offline.id)
 await cli('host','update',host.id,'--data','{"password":""}');assert.equal((await cli('host','get',host.id)).hasPassword,false)
 assert.equal(JSON.parse(fs.readFileSync(path.join(home,'sessions.json'))).teamSettings.Bound.remote,undefined)
 console.log('PASS cloud registry: legacy dedup migration, password encryption + actual SSH askpass fixture, directory browsing, host-only Team creation, inherited edits, guarded deletion; no model calls')
}finally{daemon?.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
