import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-worker-only-'))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex')}
const service=spawn(process.execPath,[path.join(root,'bin/agents'),'serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>service.once('exit',resolve))
const invoke=async(...args)=>{try{return JSON.parse((await promisify(execFile)(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout)}catch(error){if((error).stdout)return JSON.parse((error).stdout);throw error}}
try{
  for(let i=0;i<80;i++){if((await invoke('status').catch(()=>({}))).ok)break;await new Promise(r=>setTimeout(r,50))}
  assert.equal((await invoke('group','add','Local')).ok,true)
  assert.equal((await invoke('card','create','--title','Former chat','--group','Local','--kind','chatter')).ok,false)
  assert.equal((await invoke('card','create','--title','Hidden chat','--group','Local','--chat-provider','chatgpt')).ok,false)
  assert.equal((await invoke('chatter','view','unknown')).ok,false)
  const worker=await invoke('card','create','--title','Worker','--group','Local','--engine','codex','--model','gpt-6-luna','--effort','low')
  assert.equal(worker.ok,true,worker.error);assert.ok(fs.existsSync(worker.data.cwd))
  const cards=(await invoke('session','list')).data.sessions
  assert.equal(cards.length,1);assert.equal(cards[0].title,'Worker');assert.equal(cards[0].chatProvider,undefined)
  const plugins=(await invoke('plugin','list')).data
  assert.ok(plugins.some(plugin=>plugin.id==='mininotion')&&plugins.some(plugin=>plugin.id==='cloud-hosts'))
  assert.ok(!plugins.some(plugin=>['browser','margin-lab'].includes(plugin.id)))
  assert.equal((await invoke('plugin','describe','browser')).ok,false)
  assert.equal((await invoke('plugin','describe','margin-lab')).ok,false)
  console.log('PASS only Worker cards can be created; removed plugins are unavailable and MiniNotion/Cloud Hosts remain')
}finally{service.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
