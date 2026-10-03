import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'

const f=await fixtureCore()
try{
 for(const team of ['A','B'])await f.cli('group','add',team)
 const manager=await f.create('Manager','A','manager'),peer=await f.create('Peer','A','manager'),governor=await f.create('Governor','B','governor')
 const user=await f.create('User created'),legacy=await f.create('Legacy'),outside=await f.create('Outside','B')
 const managerToken=await f.token(manager.id),peerToken=await f.token(peer.id),governorToken=await f.token(governor.id)
 const hire=async(token,title,group)=>{const card=await f.call(token,'card','create','--title',title,'--group',group,'--model','gpt-6-luna','--effort','low');await f.ready(card.id);return card}
 const mine=await hire(managerToken,'Mine','A'),theirs=await hire(peerToken,'Theirs','A'),globalChild=await hire(governorToken,'Cross Team Child','A')
 const topology=(token,...args)=>f.call(token,'management','topology',...args)
 const ids=result=>result.nodes.map(n=>n.id).sort()
 const own=await topology(managerToken,'--creator','self')
 assert.deepEqual(ids(own),[mine.id]);assert.deepEqual(own.nodes[0].createdBy,{kind:'agent',employeeId:manager.id});assert.equal(own.nodes[0].createdAt,mine.createdAt);assert.equal(own.nodes[0].createdByMe,true)
 const all=await topology(managerToken)
 assert.ok(all.nodes.every(n=>n.group==='A'));assert.ok(!all.nodes.some(n=>n.id===outside.id))
 for(const card of [user,theirs,globalChild]){
  const node=all.nodes.find(n=>n.id===card.id);assert.equal(node.createdByMe,false);assert.ok(node.allowedActions.includes('message'),'other creators do not restrict management')
 }
 assert.ok(!all.edges.some(e=>e.employeeId===user.id),'user-created employee has no line')
 assert.deepEqual(ids(await topology(managerToken,'--creator',peer.id)),[theirs.id])
 assert.ok(ids(await topology(managerToken,'--creator','operator')).includes(user.id))
 assert.ok(!ids(await topology(managerToken,'--creator','others')).includes(mine.id))
 assert.deepEqual(ids(await topology(governorToken,'--creator','self')),[globalChild.id])
 assert.deepEqual(ids(await topology(governorToken,'--team','A','--creator',manager.id)),[mine.id])
 assert.equal((await f.raw(managerToken,'management','topology','--team','B','--creator','operator')).ok,false)
 assert.equal((await f.request(managerToken,'management.topology',{creator:42})).ok,false)
 assert.deepEqual((await f.call(managerToken,'session','list')).sessions.find(n=>n.id===mine.id).createdBy,mine.createdBy)
 const docs=(await f.call(managerToken,'api','docs','core/api')).markdown;assert.match(docs,/--creator self/);assert.match(docs,/--creator unknown/)
 assert.match(fs.readFileSync((await f.call(managerToken,'api','docs','core/api')).path,'utf8'),/createdByMe/)
 assert.ok((await f.call(managerToken,'api','describe','management.topology')).args.includes('--creator'))
 // Seed one legacy record only in the stopped, isolated fixture store.
 await f.stop();const file=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json'),store=JSON.parse(fs.readFileSync(file));delete store.sessions.find(n=>n.id===legacy.id).createdBy;fs.writeFileSync(file,JSON.stringify(store));await f.start()
 const unknown=await topology(managerToken,'--creator','unknown');assert.deepEqual(ids(unknown),[legacy.id]);assert.equal(unknown.nodes[0].createdBy,null);assert.equal(unknown.nodes[0].createdByMe,null)
 assert.ok(!ids(await topology(managerToken,'--creator','others')).includes(legacy.id));assert.ok(!ids(await topology(managerToken,'--creator','operator')).includes(legacy.id))
 // Removing the creation line by changing role does not erase provenance or widen authority.
 await f.cli('card','management-role',mine.id,'manager');await f.ready(mine.id)
 const promoted=await topology(managerToken,'--creator','self');assert.deepEqual(ids(promoted),[mine.id]);assert.ok(!promoted.nodes[0].allowedActions.includes('message'));assert.equal(promoted.edges.length,0)
 await f.cli('card','remove',peer.id)
 const historical=await topology(governorToken,'--creator',peer.id);assert.deepEqual(ids(historical),[theirs.id]);assert.deepEqual(historical.nodes[0].createdBy,{kind:'agent',employeeId:peer.id})
 const employeeToken=await f.token(user.id);assert.ok((await topology(employeeToken)).nodes.every(n=>n.group==='A'));assert.equal((await f.raw(employeeToken,'session','send','--employee',theirs.id,'--text','Denied')).ok,false)
 console.log('PASS headless CLI provenance: self/others/operator/creator-ID/unknown filters; Manager and Governor scopes; no-line control; legacy nulls; role changes and deleted creators; discovery and employee handbooks')
}finally{await f.close()}
