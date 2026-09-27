// Role handbooks use real Core/CLI and protocol fixtures, never paid model calls.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),{cli,call,create,token}=f
const guide=(card,name='API.md')=>path.join(card.cwd,'.agents-company/employees',card.id,name)
try{
 await cli('group','add','Build');await cli('group','add','Work','--mode','work','--plugin','mininotion')
 const manager=await create('Lead','Build','manager'),governor=await create('Governor','Work','governor')
 for(const card of [manager,governor]){
  assert.match(fs.readFileSync(guide(card),'utf8'),/### card.create/)
  assert.match(fs.readFileSync(guide(card,'AGENTS.md'),'utf8'),/management roles/)
  assert.ok(!fs.existsSync(path.join(card.cwd,'AGENTS.md')),'host instructions stay hidden')
 }
 assert.match(fs.readFileSync(guide(governor,'AGENTS.md'),'utf8'),/Governor/)
 assert.ok(fs.existsSync(path.join(governor.cwd,'.agents-company/plugins/mininotion/API.md')))
 const auth=await token(manager.id),child=await call(auth,'card','create','--title','Child','--model','gpt-6-luna','--effort','low');await f.ready(child.id)
 assert.equal(child.group,'Build');assert.equal(child.createdBy.employeeId,manager.id)
 assert.ok((await call(auth,'management','topology')).edges.some(edge=>edge.employeeId===child.id))
 assert.ok(!fs.readFileSync(guide(child),'utf8').includes('### card.create'))
 await cli('card','management-role',child.id,'manager');assert.match(fs.readFileSync(guide(child),'utf8'),/### card.create/)
 await cli('card','management-role',child.id,'governor');assert.match(fs.readFileSync(guide(child),'utf8'),/### host.credentials/)
 await cli('card','management-role',child.id,'employee');assert.ok(!fs.readFileSync(guide(child),'utf8').includes('### host.credentials'))
 const shared=await cli('card','create','--title','Shared','--group','Build','--directory-mode','bind','--cwd',manager.cwd,'--model','gpt-6-luna','--effort','low')
 assert.match(fs.readFileSync(guide(manager),'utf8'),/### card.create/);assert.ok(!fs.readFileSync(guide(shared),'utf8').includes('### card.create'))
 fs.writeFileSync(path.join(manager.cwd,'AGENTS.md'),'USER_INSTRUCTIONS_PRESERVED\n')
 await cli('workspace','docs','--employee',manager.id);assert.equal(fs.readFileSync(path.join(manager.cwd,'AGENTS.md'),'utf8'),'USER_INSTRUCTIONS_PRESERVED\n')
 await cli('management','global',manager.id,'on');assert.match(fs.readFileSync(guide(manager),'utf8'),/### host.credentials/)
 await cli('management','global',manager.id,'off');assert.ok(!fs.readFileSync(guide(manager),'utf8').includes('### host.credentials'))
 await assert.rejects(()=>cli('card','create','--title','Invalid','--group','Build','--kind','cloud-native-worker','--management-role','governor'))
 await f.stop();fs.rmSync(guide(manager));await f.start();assert.match(fs.readFileSync(guide(manager),'utf8'),/### card.create/)
 assert.equal((await cli('session','list','--live')).length,0)
 console.log('PASS private Manager/Governor handbooks: role-aware CLI discovery, plugin guides, promotion/demotion, compatibility grant, shared folders, user instructions preserved, invalid cloud supervisors and restart repair; no paid models')
}finally{await f.close()}
