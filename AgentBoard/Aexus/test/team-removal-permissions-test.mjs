import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore()
try{
 for(const name of ['Home','Ordinary','Protected','Empty'])await f.cli('group','add',name)
 const governor=await f.create('Governor','Home','governor'),peer=await f.create('Peer','Protected','governor'),manager=await f.create('Manager','Ordinary','manager'),worker=await f.create('Worker','Ordinary')
 const auth=await f.token(governor.id),managerAuth=await f.token(manager.id),workerAuth=await f.token(worker.id)
 const teams=(await f.call(auth,'management','topology')).teams
 assert.equal(teams.length,4)
 const compact=await f.call(auth,'management','topology','--teams-only');assert.deepEqual(compact.teams,teams);assert.deepEqual(compact.summary,{teams:4,employees:4,deletableTeams:2,blockedTeams:2});assert.ok(!('nodes' in compact));assert.equal((await f.request(auth,'management.topology',{teamsOnly:'yes'})).ok,false)
 assert.deepEqual(teams.filter(t=>t.isOwnTeam).map(t=>t.name),['Home'])
 assert.deepEqual(teams.filter(t=>t.allowedActions.includes('delete')).map(t=>t.name).sort(),['Empty','Ordinary'])
 const protectedTeam=teams.find(t=>t.name==='Protected');assert.deepEqual(protectedTeam.governorIds,[peer.id]);assert.match(protectedTeam.deleteBlockedReason,/Governor/)
 assert.equal(teams.find(t=>t.name==='Ordinary').employeeCount,2);assert.equal(teams.find(t=>t.name==='Empty').employeeCount,0)
 assert.deepEqual((await f.call(auth,'management','topology','--creator','self')).teams,teams,'creator filtering cannot hide protected members from team permissions')
 const scoped=await f.call(auth,'management','topology','--team','Protected');assert.equal(scoped.teams.length,1);assert.deepEqual(scoped.teams[0],protectedTeam)
 for(const token of [managerAuth,workerAuth]){const scoped=(await f.call(token,'management','topology')).teams;assert.equal(scoped.length,1);assert.equal(scoped[0].name,'Ordinary');assert.deepEqual(scoped[0].allowedActions,[]);assert.match(scoped[0].deleteBlockedReason,/Forbidden/)}
 assert.ok((await f.cli('management','topology')).teams.every(t=>t.allowedActions.includes('delete')&&t.deleteBlockedReason===null))
 await f.cli('group','rename','Home','Renamed Home');assert.equal((await f.call(auth,'management','topology')).teams.find(t=>t.isOwnTeam).name,'Renamed Home')
 // The per-employee handbook was replaced by one shared ROUTER_PROMPT plus the
 // Core API documents the read-only documentation tool serves on demand
 // (src/main/plugins/documents.ts employeeInstructions, src/main/api-documents.ts),
 // which state that no handbook is copied into an employee folder. The Team
 // authority rules the handbook carried are enforced by the Core and reported
 // per Team through allowedActions/deleteBlockedReason, asserted above.
 const employeeRoot=path.join(governor.cwd,'.agents-company','employees',governor.id)
 assert.ok(!fs.existsSync(path.join(employeeRoot,'AGENTS.md')),'an employee folder must not receive a private handbook copy')
 assert.deepEqual(fs.existsSync(employeeRoot)?fs.readdirSync(employeeRoot).filter(name=>name.endsWith('.md')):[],[])
 const description=await f.call(auth,'api','describe','management.topology','--all')
 assert.match(description.summary,/deleteBlockedReason/,'the shared API description must document the per-Team deleteBlockedReason the handbook used to explain')
 const api=(await f.call(auth,'api','docs')).markdown;assert.match(api,/实际操作仍由 Core 校验身份、角色、成员与工作区权限/)
 for(const name of ['Ordinary','Empty'])await f.call(auth,'group','remove',name)
 await assert.rejects(()=>f.call(auth,'group','remove','Protected'),/Governor/)
 assert.ok((await f.cli('session','list')).sessions.some(c=>c.id===peer.id))
 console.log('PASS authoritative Team permissions: own Team, empty Teams, protected peers, real deletion parity, role scope, creator-filter independence, rename, and shared authorization documents with no per-employee handbook copy')
}finally{await f.close()}
