import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),put=card=>{fs.mkdirSync(path.join(card.cwd,'nested'),{recursive:true});fs.writeFileSync(path.join(card.cwd,'nested/file.txt'),'keep or delete exactly this workspace')}
try{
 await f.cli('group','add','A')
 const keep=await f.create('Keep');put(keep);await f.cli('card','remove',keep.id)
 assert.ok(fs.existsSync(path.join(keep.cwd,'nested/file.txt')));assert.ok(!(await f.cli('session','list')).sessions.some(c=>c.id===keep.id))
 const both=await f.create('Both');put(both)
 const outside=path.join(f.temp,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'safe.txt'),'safe');fs.symlinkSync(outside,path.join(both.cwd,'outside-link'))
 await f.cli('card','remove',both.id,'--delete-workspace')
 assert.ok(!fs.existsSync(both.cwd));assert.ok(fs.existsSync(path.join(outside,'safe.txt')))
 const bound=await f.cli('card','create','--title','Bound','--group','A','--directory-mode','bind','--cwd',outside,'--model','gpt-6-luna');await f.ready(bound.id)
 await f.cli('card','remove',bound.id,'--delete-workspace');assert.ok(!fs.existsSync(outside))
 const parent=await f.create('Parent'),nested=path.join(parent.cwd,'child');fs.mkdirSync(nested)
 const child=await f.cli('card','create','--title','Child','--group','A','--directory-mode','bind','--cwd',nested,'--model','gpt-6-luna');await f.ready(child.id)
 await assert.rejects(()=>f.cli('card','remove',parent.id,'--delete-workspace'),/其他员工/)
 assert.ok(!(await f.cli('session','list')).sessions.find(c=>c.id===parent.id).deleting)
 assert.ok(fs.existsSync(nested));await f.cli('card','remove',child.id,'--delete-workspace');assert.ok(fs.existsSync(parent.cwd));await f.cli('card','remove',parent.id,'--delete-workspace')
 const missing=await f.create('Missing');fs.rmSync(missing.cwd,{recursive:true});await f.cli('card','remove',missing.id,'--delete-workspace')
 const failure=await f.create('Permission Failure');put(failure);const locked=path.join(failure.cwd,'nested');fs.chmodSync(locked,0o555)
 try{await assert.rejects(()=>f.cli('card','remove',failure.id,'--delete-workspace'));assert.ok((await f.cli('session','list')).sessions.find(c=>c.id===failure.id).deleting);assert.ok(fs.existsSync(path.join(locked,'file.txt')))}finally{fs.chmodSync(locked,0o755)}
 await f.cli('card','remove',failure.id,'--delete-workspace');assert.ok(!fs.existsSync(failure.cwd))
 const manager=await f.create('Manager','A','manager'),token=await f.token(manager.id)
 const managed=await f.call(token,'card','create','--title','Managed','--group','A','--model','gpt-6-luna');await f.ready(managed.id)
 const denied=await f.raw(token,'card','remove',managed.id,'--delete-workspace');assert.equal(denied.ok,false);assert.ok(fs.existsSync(managed.cwd))
 await f.call(token,'card','remove',managed.id);assert.ok(fs.existsSync(managed.cwd))
 const retry=await f.create('Retry'),root=(await f.cli('session','list')).teamRoots.A
 const rootEmployee=await f.cli('card','create','--title','Root','--group','A','--directory-mode','bind','--cwd',root,'--model','gpt-6-luna');await f.ready(rootEmployee.id)
 await assert.rejects(()=>f.cli('card','remove',rootEmployee.id,'--delete-workspace'),/Team/)
 assert.ok(fs.existsSync(retry.cwd));await f.cli('card','remove',rootEmployee.id)
 for(const field of ['identityFile','knownHosts','sshConfig']){
  const owner=await f.create('SSH '+field),file=path.join(owner.cwd,'shared-ssh-file');fs.writeFileSync(file,'fixture SSH dependency')
  const host=await f.cli('host','create','--data',JSON.stringify({name:'Shared '+field,host:'unused.invalid',os:'linux',defaultDirectory:'/tmp',[field]:file}))
  await assert.rejects(()=>f.cli('card','remove',owner.id,'--delete-workspace'),/云主机仍在使用的 SSH 文件/)
  assert.ok(!(await f.cli('session','list')).sessions.find(c=>c.id===owner.id).deleting);assert.ok(fs.existsSync(file))
  // Stale references are still dependencies: deleting the folder must not erase future recovery.
  fs.unlinkSync(file);await assert.rejects(()=>f.cli('card','remove',owner.id,'--delete-workspace'),/云主机仍在使用的 SSH 文件/)
  const check=await f.cli('host','check',host.id);assert.equal(check.connected,false);assert.match(check.error,/不存在/);assert.match(check.error,/不是员工管理权限错误/)
  await f.cli('host','remove',host.id);await f.cli('card','remove',owner.id,'--delete-workspace');assert.ok(!fs.existsSync(owner.cwd))
 }
 for(const linkInside of [true,false]){
  const owner=await f.create('SSH link '+linkInside),file=linkInside?path.join(f.temp,'external-key'):path.join(owner.cwd,'key'),link=linkInside?path.join(owner.cwd,'key-link'):path.join(f.temp,'external-key-link')
  fs.writeFileSync(file,'fixture key');fs.symlinkSync(file,link)
  const host=await f.cli('host','create','--data',JSON.stringify({name:'Linked key',host:'unused.invalid',os:'linux',defaultDirectory:'/tmp',identityFile:link}))
  await assert.rejects(()=>f.cli('card','remove',owner.id,'--delete-workspace'),/云主机仍在使用的 SSH 文件/)
  assert.ok(fs.existsSync(link));assert.ok(fs.existsSync(file))
  await f.cli('host','remove',host.id);await f.cli('card','remove',owner.id,'--delete-workspace')
 }
 console.log('PASS CLI keeps files by default, explicitly removes nested/default/bound workspaces, preserves symlink targets, protects other employees and Team roots, accepts missing folders, rejects Manager file-deletion escalation')
}finally{await f.close()}
