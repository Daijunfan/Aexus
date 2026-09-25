import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-native-core-'))),remote=path.join(temp,'remote'),bin=path.join(temp,'bin'),home=path.join(temp,'user'),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
for(const dir of [remote,bin,home])fs.mkdirSync(dir)
const cwd=path.join(remote,'claude'),project=path.join(home,'.claude/projects/fixture');fs.mkdirSync(cwd);fs.mkdirSync(project,{recursive:true})
const transcript=path.join(project,id+'.jsonl');fs.writeFileSync(transcript,JSON.stringify({type:'user',cwd,message:{content:'帮我查看工作目录'}})+'\n'+JSON.stringify({type:'assistant',cwd,message:{content:[{type:'text',text:'目录已确认'}]}})+'\n')
fs.writeFileSync(path.join(bin,'ssh'),'#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n',{mode:0o755})
fs.writeFileSync(path.join(bin,'claude'),'#!/bin/sh\ncase "$*" in *--version*) echo "2.1.233 Claude Code";; *--help*) echo "--input-format stream-json --output-format stream-json";; *"auth status --json"*) echo "{\\"loggedIn\\":true}";; *) exit 2;; esac\n',{mode:0o755})
const env={...process.env,HOME:home,PATH:[bin,path.dirname(process.execPath),'/usr/bin','/bin','/usr/sbin','/sbin'].join(':'),AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel')}
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>daemon.once('exit',resolve))
const cli=async(...args)=>{try{const r=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:30000})).stdout);if(!r.ok)throw Error(r.error);return r.data}catch(error){if(error.stdout)throw Error(JSON.parse(error.stdout).error);throw error}}
try{
 for(let n=0;n<80;n++){try{await cli('status');break}catch{await new Promise(r=>setTimeout(r,50))}}
 const host=await cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}))
 await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const card=await cli('card','create','--title','Claude native','--group','Cloud','--kind','cloud-native-worker','--engine','claude','--directory-mode','bind','--cwd','claude')
 const sessions=await cli('engine','remote-sessions','--team','Cloud','--engine','claude')
 assert.ok(sessions.sessions.some(value=>value.id===id&&value.cwd===cwd))
 const bound=await cli('card','native-bind',card.id,id);assert.equal(bound.imported,2);assert.equal(bound.card.nativeOwnership,'external')
 assert.match((await cli('session','transcript',card.id)).text,/目录已确认/)
 await assert.rejects(()=>cli('card','clone',card.id,'--title','Impossible Claude clone'))
 assert.ok(!fs.existsSync(path.join(remote,'Impossible Claude clone')))
 await cli('card','remove',card.id)
 assert.ok(fs.existsSync(transcript),'removing an imported employee retains the original remote Claude session')
 console.log('PASS remote Claude history listing/binding, imported transcript, explicit clone rejection and external-session ownership')
}finally{daemon.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
