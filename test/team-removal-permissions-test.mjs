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
 const guide=fs.readFileSync(path.join(governor.cwd,'.agents-company/employees',governor.id,'AGENTS.md'),'utf8')
 assert.match(guide,/其他团队/);assert.match(guide,/同一对话/);assert.match(guide,/全有或全无/);assert.match(guide,/只读请求不得触发删除/)
 const api=(await f.call(auth,'api','docs')).markdown;assert.match(api,/deleteBlockedReason/);assert.match(api,/没有明确|不要把未知文件策略/)
 for(const name of ['Ordinary','Empty'])await f.call(auth,'group','remove',name)
 await assert.rejects(()=>f.call(auth,'group','remove','Protected'),/Governor/)
 assert.ok((await f.cli('session','list')).sessions.some(c=>c.id===peer.id))
 console.log('PASS authoritative Team permissions: own Team, empty Teams, protected peers, real deletion parity, role scope, creator-filter independence, rename, and precise authorization handbooks')
}finally{await f.close()}
