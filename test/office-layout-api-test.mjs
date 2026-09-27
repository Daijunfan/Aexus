import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),{cli,call,raw,request,create,token}=f
const clean=rooms=>{for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){const a=rooms[i].bounds,b=rooms[j].bounds;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'overlapping '+rooms[i].name+' / '+rooms[j].name)}}
try{
  for(const name of ['Managers','A','B','Far'])await cli('group','add',name)
  const global=await create('Global','Managers'),lead=await create('Lead','A','manager'),child=await create('Child'),outsider=await create('Unbound'),other=await create('Other','B')
  const g=await token(global.id),m=await token(lead.id),e=await token(child.id)
  await cli('management','global',global.id,'on')
  assert.equal((await raw(e,'office','layout')).ok,false)
  assert.deepEqual((await call(m,'office','layout')).rooms.map(room=>room.name),['A'])
  const permitted=(await call(m,'office','layout')).rooms[0]
  assert.ok(permitted.editable);assert.ok(permitted.employees.find(card=>card.id===child.id).editable);assert.ok(permitted.employees.find(card=>card.id===outsider.id).editable)
  assert.ok(!JSON.stringify(permitted).includes('cwd'));assert.ok(!JSON.stringify(permitted).includes('nativeSessions'))
  await call(m,'room','bounds','A','--width','1100','--height','1000')
  await call(m,'card','place',child.id,'--x','430','--y','230','--snap','off')
  assert.equal((await raw(m,'card','place',outsider.id,'--x','430','--y','230')).ok,true)
  assert.equal((await raw(m,'room','bounds','B','--x','100')).ok,false)
  assert.equal((await raw(g,'room','bounds','Managers','--x','100')).ok,true)
  assert.equal((await raw(g,'card','place',global.id,'--x','100','--y','230')).ok,true)
  await call(g,'room','bounds','B','--x','1900','--y','200','--width','950','--height','900')
  await call(g,'card','place',other.id,'--x','250','--y','230','--snap','off')
  assert.equal((await request(m,'room.bounds',{name:'B',team:'A',bounds:{x:200}})).ok,false,'conflicting Team aliases')
  assert.equal((await request(m,'card.place',{id:outsider.id,employee:child.id,x:300,y:250})).ok,false,'conflicting employee aliases')
  for(const name of ['ui.click','ui.drag','ui.type','ui.wheel','session.acknowledge'])assert.equal((await request(g,name,{})).ok,false)
  assert.ok((await call(m,'api','docs')).markdown.includes('office layout'))
  console.log('PASS layout API scope: Governors edit every Team and themselves; all same-Team Employees; alias and UI-driver bypasses denied')
  await cli('room','bounds','Managers','--x','-2200','--y','-1800')
  await cli('room','bounds','Far','--x','9000','--y','9000')
  await cli('management','relayout','--team','A');await cli('room','bounds','A','--x','0','--y','0')
  const small=(await cli('office','layout','--team','A')).rooms[0].bounds
  await cli('room','bounds','B','--x','0','--y',String(small.height+65),'--width','760','--height','520')
  await cli('canvas','set','--x','20','--y','40','--zoom','0.7')
  const camera=await cli('canvas','view'),far=(await cli('office','layout','--team','Far')).rooms[0].bounds,added=[]
  for(let i=0;i<16;i++)added.push(await create('Recruit '+i))
  const enlarged=(await cli('office','layout')).rooms,large=enlarged.find(room=>room.name==='A').bounds
  assert.ok(large.width*large.height>small.width*small.height);clean(enlarged)
  assert.equal(large.x,0);assert.equal(large.y,0)
  assert.notEqual(enlarged.find(room=>room.name==='B').bounds.y,small.height+65)
  assert.deepEqual(enlarged.find(room=>room.name==='Far').bounds,far)
  for(const card of added)await cli('card','remove',card.id)
  const reduced=(await cli('office','layout')).rooms,after=reduced.find(room=>room.name==='A').bounds
  assert.ok(after.width*after.height<large.width*large.height);clean(reduced);assert.deepEqual(await cli('canvas','view'),camera)
  const baseline=JSON.stringify(reduced),view=await cli('team-view','create','--name','Subset','--teams','["A"]')
  assert.equal(JSON.stringify((await cli('office','layout')).rooms),baseline,'views do not alter true layout')
  await cli('team-view','select','all')
  await cli('room','place','B','--col','4','--row','4','--w','2','--h','2')
  const legacy=(await cli('office','layout','--team','B')).rooms[0].bounds;assert.equal(legacy.x,3440);assert.equal(legacy.y,2680);assert.equal(legacy.width,1520)
  await cli('management','global',global.id,'off');assert.equal((await raw(g,'room','bounds','B','--x','10')).ok,false)
  clean((await cli('office','layout')).rooms)
  await f.stop()
  const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json'),legacyStore=JSON.parse(fs.readFileSync(stateFile,'utf8'))
  legacyStore.rooms.B.bounds={...legacyStore.rooms.B.bounds,x:legacyStore.rooms.A.bounds.x,y:legacyStore.rooms.A.bounds.y}
  const members=JSON.stringify(legacyStore.sessions),oldCamera=JSON.stringify(legacyStore.viewport)
  fs.writeFileSync(stateFile,JSON.stringify(legacyStore));await f.start()
  const preserved=(await cli('office','layout')).rooms
  assert.equal(preserved.find(room=>room.name==='B').bounds.x,preserved.find(room=>room.name==='A').bounds.x)
  const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'))
  assert.equal(JSON.stringify(saved.sessions),members);assert.equal(JSON.stringify(saved.viewport),oldCamera)
  console.log('PASS intentionally overlapping Team positions survive service restart without changing employee data or camera')
  fs.writeFileSync(path.join(f.root,'artifacts/office-layout-api.json'),JSON.stringify({passed:true,small,large,reduced:after,viewportPreserved:true},null,2))
  console.log('PASS persisted growth/shrink with pinned neighbors, cascade collision avoidance, legacy grid command, view invariance, unchanged camera and immediate grant revocation')
}finally{await f.close()}
