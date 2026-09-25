// Real Codex initialization (no inference): a denied parent must not prevent its child from starting.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-work-startup-')),root=path.join(temp,'project'),team=path.join(root,'workspaces'),cwd=path.join(team,'Team','Worker'),home=path.join(temp,'codex')
fs.mkdirSync(path.join(root,'.git'),{recursive:true});fs.mkdirSync(path.join(cwd,'.agents-company'),{recursive:true});fs.mkdirSync(home)
fs.writeFileSync(path.join(team,'AGENTS.md'),'PARENT_MUST_NOT_LOAD');fs.writeFileSync(path.join(cwd,'AGENTS.md'),'Employee instructions')
const bundle=path.join(temp,'scope.cjs');await build({entryPoints:['src/main/scope.ts'],outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
const {workCodexConfig}=require(bundle),binary=path.join(os.homedir(),'.npm-global/bin/codex')
try{
 for(const fixed of [false,true]){
  const args=workCodexConfig(cwd,team);if(!fixed)args.splice(0,2)
  const child=spawn(binary,[...args,'app-server','--stdio'],{cwd,env:{...process.env,CODEX_HOME:home},stdio:['pipe','pipe','pipe']});let seq=0,stderr='';const pending=new Map()
  child.stderr.on('data',v=>stderr+=v);const lines=createInterface({input:child.stdout});lines.on('line',line=>{let r;try{r=JSON.parse(line)}catch{return}pending.get(r.id)?.(r);pending.delete(r.id)})
  const call=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(stderr||'Codex timeout')),12000);pending.set(id,r=>{clearTimeout(timer);resolve(r)});child.stdin.write(JSON.stringify({id,method,params})+'\n')})
  try{
   await call('initialize',{clientInfo:{name:'work-startup-test',version:'1'},capabilities:{experimentalApi:true}});child.stdin.write('{"method":"initialized"}\n')
   const response=await call('thread/start',{cwd,model:'gpt-6-luna',permissions:'agents-company-work',approvalPolicy:'never',historyMode:'legacy'})
   if(fixed)assert.ok(response.result?.thread?.id,JSON.stringify(response));else assert.match(response.error?.message??'',/AGENTS.md.*Operation not permitted/)
  }finally{child.stdin.end();child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));lines.close()}
 }
 console.log('PASS authentic Codex Work thread startup: denied parent reproduces old failure; employee project marker fixes startup without changing filesystem permissions; no inference')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
