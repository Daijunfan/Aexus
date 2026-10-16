import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {build} from 'esbuild';import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'

// --- Part A: pure geometry (quality detection + arrangement shapes), no daemon ---
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-office-arrange-')),file=path.join(temp,'geometry.cjs')
await build({stdin:{contents:"export * from './src/shared/office-quality';export * from './src/shared/office-arrange';export * from './src/shared/canvas';export * from './src/shared/office-layout';export * from './src/shared/roles';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'})
const {officeQuality,arrangeTeamEmployees,arrangeRoomBounds,orderedTeamMembers,EMPLOYEE_SIZE,EMPLOYEE_TOP,MIN_ROOM_HEIGHT,employeeFits,roomsOverlap}=createRequire(import.meta.url)(file)
const W=EMPLOYEE_SIZE.width,H=EMPLOYEE_SIZE.height
const card=(id,role='employee',createdAt=1,deleting=false)=>({id,title:id,engine:'codex',managementRole:role,kind:'worker',group:'A',createdAt,cwd:'/fixture',deleting})
const room=(name,members,bounds={x:0,y:0,width:760,height:520,shape:'rounded',arrangement:'grid'})=>({name,bounds,employees:members.map(m=>({card:m,position:{x:300,y:220}}))})
const seg=(id,m,e,points,extra={})=>({id,managerId:m,employeeId:e,points,...extra})
const assertSeats=arranged=>{for(const employee of arranged.employees)assert.ok(employeeFits(arranged.bounds,employee.position),'seat outside room: '+employee.card.id);for(let i=0;i<arranged.employees.length;i++)for(let j=i+1;j<arranged.employees.length;j++){const a=arranged.employees[i].position,b=arranged.employees[j].position;assert.ok(a.x+W<=b.x||b.x+W<=a.x||a.y+H<=b.y||b.y+H<=a.y,'seats overlap: '+arranged.employees[i].card.id+' / '+arranged.employees[j].card.id)}}
const assertRooms=rooms=>{for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++)assert.ok(!roomsOverlap(rooms[i].bounds,rooms[j].bounds),'rooms overlap: '+rooms[i].name+' / '+rooms[j].name)}
try{
  // 1. deterministic member order: supervisors first, order preference, around first
  const members=[card('w1','employee',3),card('m','manager',1),card('sec','secretary',2),card('w2','employee',4)],r=room('A',members)
  assert.deepEqual(orderedTeamMembers(r).map(c=>c.id),['m','sec','w1','w2'])
  assert.deepEqual(orderedTeamMembers(r,['sec','m','w2','w1']).map(c=>c.id),['sec','m','w2','w1'])
  assert.deepEqual(orderedTeamMembers(r,['sec','m','w2','w1'],'w1').map(c=>c.id),['w1','sec','m','w2'])

  // 2. circle with --around centers the Secretary and keeps everyone on legal, non-overlapping seats
  const secTeam=room('A',[card('sec','secretary',1),card('w1','employee',2),card('w2','employee',3)])
  const circle=arrangeTeamEmployees(secTeam,'circle',undefined,'sec')
  assert.equal(circle.employees[0].card.id,'sec')
  const secPos=circle.employees[0].position,cx=circle.bounds.width/2-W/2,cy=(EMPLOYEE_TOP+circle.bounds.height-18)/2-H/2
  assert.ok(Math.abs(secPos.x-cx)<1&&Math.abs(secPos.y-cy)<1,'Secretary at circle center')
  assertSeats(circle)

  // 3. grid and rectangle stay inside the frame and never overlap for a larger team
  for(const pattern of ['grid','rectangle']){
    const six=room('A',Array.from({length:6},(_,i)=>card('e'+i,'employee',i+1)))
    const out=arrangeTeamEmployees(six,pattern)
    assert.equal(out.employees.length,6);assertSeats(out)
  }

  // 4. single-member team degrades to a centered seat without growing unnecessarily
  const single=arrangeTeamEmployees(room('A',[card('only')]),'circle')
  assert.equal(single.employees.length,1);assertSeats(single)

  // 5. room arrangement: grid and circle both produce non-overlapping rooms; --around pins the anchor
  const three=[room('A',[]),room('B',[]),room('C',[])]
  assertRooms(arrangeRoomBounds(three,'grid',{x:0,y:0}))
  const around=arrangeRoomBounds(three,'circle',{x:1000,y:1000},'A'),anchor=around.find(r=>r.name==='A').bounds
  assert.equal(anchor.x,1000-760/2);assert.equal(anchor.y,1000-520/2);assertRooms(around)

  // 6. quality: a true interior crossing is detected with an approximate point
  const cross=officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}]),seg('b','m2','e2',[{x:50,y:-50},{x:50,y:50}])])
  assert.equal(cross.crossingCount,1);assert.equal(cross.overlapCount,0);assert.deepEqual(cross.crossings[0].point,{x:50,y:0});assert.equal(cross.crossings[0].kind,'cross');assert.ok(cross.crossings[0].avoidable);assert.equal(cross.avoidable,true)

  // 7. shared endpoints and adjacent orthogonal corners are never fake crossings
  const touch=officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}]),seg('b','m2','e2',[{x:100,y:0},{x:100,y:50}])])
  assert.equal(touch.crossingCount,0);assert.deepEqual(touch.crossings,[])
  const near=officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}]),seg('b','m2','e2',[{x:100,y:10},{x:100,y:50}])])
  assert.equal(near.crossingCount,0);assert.deepEqual(near.crossings,[])

  // 8. collinear overlap: reported between unrelated lines, suppressed on a shared trunk
  const overlap=officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}]),seg('b','m2','e2',[{x:50,y:0},{x:150,y:0}])])
  assert.equal(overlap.overlapCount,1);assert.equal(overlap.crossingCount,0);assert.equal(overlap.crossings[0].kind,'overlap');assert.deepEqual(overlap.crossings[0].point,{x:75,y:0})
  const trunk=officeQuality([seg('a','m','e1',[{x:0,y:0},{x:100,y:0}]),seg('b','m','e2',[{x:50,y:0},{x:150,y:0}])])
  assert.equal(trunk.overlapCount,0);assert.deepEqual(trunk.crossings,[])

  // 9. blockedCount sums warnings + blocked cross-Team legs; manual crossing names its route
  assert.equal(officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}],{warning:'no clear path'})],[{status:'blocked'}]).blockedCount,2)
  assert.ok(officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}],{manual:true}),seg('b','m2','e2',[{x:50,y:-50},{x:50,y:50}])]).crossings[0].reason.includes('manual'))
  assert.equal(officeQuality([seg('a','m1','e1',[{x:0,y:0},{x:100,y:0}]),seg('b','m2','e2',[{x:200,y:0},{x:300,y:0}])]).avoidable,false)
  console.log('PASS geometry: member ordering, circle/grid/rectangle seating, room shapes, crossing/overlap/trunk/blocked detection')
}finally{fs.rmSync(temp,{recursive:true,force:true})}

// --- Part B: authenticated Core API + CLI + authorization + persistence ---
const f=await fixtureCore(),{cli,call,raw,create,token}=f
const clean=rooms=>{for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){const a=rooms[i].bounds,b=rooms[j].bounds;assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'overlapping '+rooms[i].name+' / '+rooms[j].name)}}
try{
  for(const name of ['A','B'])await cli('group','add',name)
  const sec=await create('Sec','A','secretary'),lead=await create('Lead','A','manager'),child=await create('Child','A'),other=await create('Other','B')
  const s=await token(sec.id),m=await token(lead.id)

  // 1. office.layout exposes a machine-readable quality shape
  const layout=await call(m,'office','layout')
  assert.ok(layout.quality,'quality present on office.layout')
  for(const key of ['crossingCount','overlapCount','blockedCount','crossings','avoidable'])assert.ok(key in layout.quality,key)
  assert.ok(Array.isArray(layout.quality.crossings));assert.equal(typeof layout.quality.avoidable,'boolean')

  // 2. layout is documented and discoverable for the Secretary-facing CLI
  const doc=await call(m,'api','docs','core/layout')
  assert.ok(doc.markdown.includes('office.arrange'));assert.ok(doc.markdown.includes('quality'))
  assert.ok((await call(m,'api','list','--prefix','office.')).map(c=>c.name).includes('office.arrange'))

  // 3. snapshot every business-relevant field before arranging
  const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')
  const snap=s=>{const projection=c=>({id:c.id,group:c.group,title:c.title,managementRole:c.managementRole,engine:c.engine,model:c.model,effort:c.effort,thinking:c.thinking,permissionMode:c.permissionMode,workEnvironment:c.workEnvironment,cwd:c.cwd,kind:c.kind,accessMode:c.accessMode,nativeSessions:c.nativeSessions,createdAt:c.createdAt});return {sessions:s.sessions.map(projection),access:s.access,teamSettings:s.teamSettings,teamRoots:s.teamRoots,groups:s.groups}}
  const before=snap(JSON.parse(fs.readFileSync(stateFile,'utf8')))

  // 4. Secretary has global scope: arranges a Team it does not belong to
  const glob=await call(s,'office','arrange','--pattern','circle','--scope','teams','--team','B')
  assert.equal(glob.pattern,'circle');assert.deepEqual(glob.rooms.map(r=>r.name),['B']);assert.ok(glob.quality)

  // 5. Manager is denied outside its own Team (rooms and employees)
  assert.equal((await raw(m,'office','arrange','--pattern','circle','--scope','teams','--team','B')).ok,false)
  assert.equal((await raw(m,'office','arrange','--pattern','grid','--scope','employees','--team','B')).ok,false)

  // 6. Manager arranges its own Team; --around centers the Secretary, --order ranks within the Team
  const arranged=await call(m,'office','arrange','--pattern','circle','--scope','employees','--team','A','--around',sec.id,'--order',JSON.stringify([lead.id,sec.id,child.id]))
  assert.equal(arranged.scope,'employees');assert.equal(arranged.avoidCrossings,true)
  assert.deepEqual(new Set(arranged.employees.map(e=>e.id)),new Set([sec.id,lead.id,child.id]))
  assert.ok(arranged.employees.every(e=>e.team==='A'))
  const roomA=arranged.rooms.find(r=>r.name==='A')
  const centerX=roomA.bounds.width/2-W/2,centerY=(EMPLOYEE_TOP+roomA.bounds.height-18)/2-H/2
  const seat=id=>arranged.employees.find(e=>e.id===id).position
  assert.ok(Math.abs(seat(sec.id).x-centerX)<1&&Math.abs(seat(sec.id).y-centerY)<1,'Secretary sits at the circle center')
  assert.ok(Math.hypot(seat(sec.id).x+W/2-roomA.bounds.width/2,seat(sec.id).y+H/2-(EMPLOYEE_TOP+roomA.bounds.height-18)/2)<Math.hypot(seat(lead.id).x+W/2-roomA.bounds.width/2,seat(lead.id).y+H/2-(EMPLOYEE_TOP+roomA.bounds.height-18)/2),'Secretary is innermost')

  // 7. rectangle arrangement persists and every seat respects the room bounds
  const rect=await call(m,'office','arrange','--pattern','rectangle','--scope','employees','--team','A')
  for(const r of rect.rooms)for(const e of r.employees){assert.ok(e.position.x>=18&&e.position.y>=EMPLOYEE_TOP,'seat above/left of frame');assert.ok(e.position.x+W<=r.bounds.width-18+1e-6&&e.position.y+H<=r.bounds.height-18+1e-6,'seat below/right of frame')}
  const recheck=(await call(m,'office','layout','--team','A')).rooms[0]
  assert.deepEqual(recheck.employees.map(e=>({id:e.id,position:e.position})),rect.rooms[0].employees.map(e=>({id:e.id,position:e.position})),'arrangement persists in a later layout read')

  // 8. CLI-driven room arrangement keeps every Team room separated
  await cli('office','arrange','--pattern','circle','--scope','teams','--around','A')
  clean((await cli('office','layout')).rooms)

  // 9. invalid pattern and out-of-Team order are rejected
  assert.equal((await raw(m,'office','arrange','--pattern','bogus')).ok,false)
  assert.equal((await raw(m,'office','arrange','--pattern','grid','--scope','employees','--team','A','--order',JSON.stringify([other.id]))).ok,false)

  // 10. nothing outside visual geometry changed
  const after=snap(JSON.parse(fs.readFileSync(stateFile,'utf8')))
  assert.deepEqual(after.sessions,before.sessions,'roles/engines/workspaces unchanged')
  assert.deepEqual(after.access,before.access,'access grants and revision unchanged')
  assert.deepEqual(after.teamSettings,before.teamSettings)
  assert.deepEqual(after.teamRoots,before.teamRoots)
  assert.deepEqual(after.groups,before.groups)

  fs.writeFileSync(path.join(f.root,'artifacts/office-arrange.json'),JSON.stringify({passed:true,pattern:'circle',quality:arranged.quality,arranged:[sec.id,lead.id,child.id]},null,2))
  console.log('PASS layout API: quality shape, docs/discoverability, global Secretary vs team-scoped Manager, centered Secretary, persistence, bounds, CLI parse, no business-logic mutation')
}finally{await f.close()}
