import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-bulk-remote-'))),bin=path.join(temp,'bin'),remote=path.join(temp,'remote'),offline=path.join(temp,'offline')
fs.mkdirSync(bin);fs.mkdirSync(remote)
fs.writeFileSync(path.join(bin,'ssh'),`#!/bin/sh\n[ -e '${offline}' ] && exit 255\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n`,{mode:0o755})
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH})
try{
 const host=await f.cli('host','create','--data',JSON.stringify({name:'SSH fixture',host:'fixture',os:'linux',defaultDirectory:remote}))
 await f.cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const parent=await f.create('Remote parent','Cloud'),nested=path.join(parent.cwd,'child');fs.mkdirSync(nested)
 const child=await f.cli('card','create','--title','Remote child','--group','Cloud','--cwd',nested,'--directory-mode','bind','--model','gpt-6-luna')
 const shared=await f.cli('card','create','--title','Remote shared','--group','Cloud','--cwd',parent.cwd,'--directory-mode','bind','--model','gpt-6-luna')
 fs.writeFileSync(path.join(nested,'file.txt'),'remote data')
 await f.cli('card','remove',parent.id,child.id,shared.id,'--delete-workspace');assert.ok(!fs.existsSync(parent.cwd));assert.ok(fs.existsSync(remote))
 const worker=await f.create('Worker','Cloud'),manager=await f.cli('card','create','--title','Local Manager','--group','Cloud','--work-environment','local','--management-role','manager','--model','gpt-6-luna','--effort','low');await f.ready(manager.id)
 const rootCard=await f.cli('card','create','--title','Root','--group','Cloud','--cwd',remote,'--directory-mode','bind','--model','gpt-6-luna')
 await f.stop();fs.writeFileSync(offline,'');await f.start()
 await assert.rejects(()=>f.cli('group','remove','Cloud','--delete-workspace'))
 assert.ok(fs.existsSync(worker.cwd)&&fs.existsSync(manager.cwd));assert.ok((await f.cli('session','list')).sessions.every(c=>!c.deleting))
 await f.stop();fs.unlinkSync(offline);await f.start()
 await f.cli('group','remove','Cloud','--delete-workspace')
 assert.ok(!fs.existsSync(rootCard.cwd)&&!fs.existsSync(manager.cwd));assert.equal((await f.cli('session','list')).sessions.length,0)
 console.log('PASS SSH batch deletion: nested/shared remote folders, mixed local Manager/cloud Employee Team, remote Team-root employee, disconnect preflight preserves the whole batch')
}finally{await f.close();fs.rmSync(temp,{recursive:true,force:true})}
