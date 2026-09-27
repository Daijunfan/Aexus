import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),{cli,call,token}=f
try{
 await f.stop()
 const home=f.env.AGENTS_COMPANY_HOME,file=path.join(home,'sessions.json'),root=path.join(f.temp,'ordinary-folder')
 fs.mkdirSync(root);fs.writeFileSync(path.join(root,'.agents-company-manager'),'legacy marker is not a grant')
 const make=(id,group,role='employee')=>{const cwd=path.join(root,id);fs.mkdirSync(cwd);return {id,title:id,group,managementRole:role,kind:'worker',engine:'codex',cwd,createdAt:1}}
 const cards=[make('team-employee','OldControl'),make('team-manager','OldControl','manager'),make('explicit','Other'),make('plain','Other')]
 cards.forEach((card,i)=>card.position={x:80+(i%2)*270,y:230})
 cards[0].threadId='55f4c7e7-082f-4ba9-9541-907d3e2b80de'
 cards[0].createdBy={kind:'agent',employeeId:'team-manager'}
 const initial={groups:['OldControl','Other'],sessions:cards,rooms:{},teamRoots:{OldControl:root,Other:root},viewport:{x:-15,y:23,zoom:.7},access:{version:1,revision:4,managerTeam:'OldControl',globalManagerIds:['explicit'],globalGrants:{'team-employee':'existing-epoch'},relations:[{id:'created-team-employee',managerId:'team-manager',employeeId:'team-employee',state:'active',requestedBy:cards[0].createdBy,createdAt:1,updatedAt:1}]}}
 fs.writeFileSync(file,JSON.stringify(initial));fs.mkdirSync(path.join(home,'transcripts'),{recursive:true});const history=path.join(home,'transcripts','team-employee.json'),content=JSON.stringify({items:[],marker:'native context remains owned by the original employee'});fs.writeFileSync(history,content)
 await f.start()
 let saved=JSON.parse(fs.readFileSync(file))
 assert.equal(saved.access.version,2);assert.equal(saved.access.managerTeam,undefined);assert.deepEqual(saved.access.globalManagerIds,[])
 assert.deepEqual(saved.sessions.filter(c=>c.managementRole==='governor').map(c=>c.id).sort(),['explicit','team-employee','team-manager'])
 for(const old of cards){const next=saved.sessions.find(c=>c.id===old.id);assert.equal(next.cwd,old.cwd);assert.equal(next.threadId,old.threadId);assert.deepEqual(next.position,old.position);assert.equal(next.initialization,undefined,'upgrade must not spend model quota')}
 assert.deepEqual(saved.rooms,initial.rooms);assert.deepEqual(saved.viewport,initial.viewport)
 assert.equal(saved.access.globalGrants['team-employee'],'existing-epoch');assert.equal(fs.readFileSync(history,'utf8'),content)
 assert.equal((await call(await token('plain'),'auth','whoami')).globalManager,false)
 const newcomer=await f.create('Newcomer','OldControl');assert.equal((await call(await token(newcomer.id),'auth','whoami')).globalManager,false,'joining the old Team grants nothing')
 await f.stop();saved=JSON.parse(fs.readFileSync(file));saved.access.managerTeam='Other';saved.access.globalManagerIds=['plain'];fs.writeFileSync(file,JSON.stringify(saved));await f.start()
 assert.equal((await call(await token('plain'),'auth','whoami')).globalManager,false,'stale legacy flags cannot restore authority after migration')
 assert.equal((await call(await token('team-manager'),'auth','whoami')).managementRole,'governor')
 assert.equal((await cli('management','team')).team,null)
 assert.equal(fs.readFileSync(history,'utf8'),content)
 console.log('PASS one-time role migration: existing explicit/team grants become per-employee Governor, ordinary marker folders stay ordinary, native references/workspaces/history retained, new members and stale v1 flags grant nothing, no model calls')
}finally{await f.close()}
