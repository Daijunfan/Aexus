// Remote transport fixture; no cloud connection and no model inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-engine-models-')),bin=path.join(temp,'bin'),remote=path.join(temp,'remote'),run=promisify(execFile)
fs.mkdirSync(bin);fs.mkdirSync(remote)
fs.writeFileSync(path.join(bin,'ssh'),'#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n',{mode:0o755})
fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}
require('readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='model/list'?{data:[{id:'gpt-6-luna',model:'gpt-6-luna',displayName:'Remote fixture model',isDefault:true}]}:{};console.log(JSON.stringify({id:r.id,result}))})
`,{mode:0o755})
const trap=path.join(temp,'local-codex'),marker=path.join(temp,'local-called')
fs.writeFileSync(trap,`#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(marker)},'called');process.exit(99)\n`,{mode:0o755})
const env={...process.env,PATH:[bin,path.dirname(process.execPath),process.env.PATH].join(':'),CODEX_BIN:trap,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||key==='AGENTS_COMPANY_EMPLOYEE')delete env[key]
const service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),ended=new Promise(resolve=>service.once('exit',resolve))
const cli=async(...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}const result=JSON.parse(stdout);if(!result.ok)throw Error(result.error);return result.data}
try{
 for(let n=0;n<80;n++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,50))}}
 await cli('group','add','Local')
 await assert.rejects(()=>cli('engine','models','--engine','codex','--kind','cloud-native-worker','--team','Local'),/Cloud Team/)
 const host=await cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}))
 await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await cli('settings','set','--default-codex-model','only-on-local')
 const catalog=await cli('engine','models','--engine','codex','--kind','cloud-native-worker','--team','Cloud')
 assert.equal(catalog.defaultModel,'gpt-6-luna');assert.equal(catalog.models[0].displayName,'Remote fixture model')
 assert.equal((await cli('session','list')).sessions.length,0)
 fs.writeFileSync(path.join(bin,'ssh'),'#!/bin/sh\nexit 255\n',{mode:0o755})
 await assert.rejects(()=>cli('engine','models','--engine','codex','--kind','cloud-native-worker','--team','Cloud'))
 assert.ok(!fs.existsSync(marker),'remote discovery never launches the local Codex binary')
 console.log('PASS remote model catalog, target-specific default, invalid Team, disconnect rejection, no local fallback, no employee created')
}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
