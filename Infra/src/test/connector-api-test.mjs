import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),{cli,call,raw,request,create,token}=f
try{
 await cli('group','add','A');await cli('group','add','B')
 const g=await create('Governor','B','governor'),m=await create('Manager','A','manager'),e=await create('Employee'),other=await create('Other','B'),gToken=await token(g.id),mToken=await token(m.id),eToken=await token(e.id)
 const args=['--manager',m.id,'--employee',e.id]
 const description=await cli('connector','get',...args);assert.deepEqual(description.target,{side:'auto'});assert.equal(description.availablePoints.length,24);for(const side of ['top','right','bottom','left'])assert.deepEqual(description.availablePoints.filter(p=>p.side===side).map(p=>p.offset),side==='top'||side==='bottom'?[0,.1,.3,.5,.7,.9,1]:[.1,.3,.5,.7,.9])
 assert.equal((await raw(eToken,'connector','get',...args)).ok,false)
 assert.equal((await raw(mToken,'connector','set','--manager',g.id,'--employee',other.id,'--target','top')).ok,false)
 assert.equal((await raw(mToken,'connector','set','--manager',m.id,'--employee',other.id,'--target','top')).ok,false)
 assert.equal((await raw(gToken,'connector','set','--manager',e.id,'--employee',m.id,'--target','top')).ok,false)
 const stateBefore=JSON.parse(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')))
 await call(mToken,'connector','set',...args,'--source','bottom','--source-offset','0.3','--target','top','--target-offset','0.6')
 let setting=await cli('connector','get',...args);assert.deepEqual(setting.source,{side:'bottom',offset:.3});assert.deepEqual(setting.target,{side:'top',offset:.6})
 await call(mToken,'connector','set',...args,'--source','left','--source-offset','.4');assert.deepEqual((await cli('connector','get',...args)).target,setting.target,'partial update preserves other endpoint');await call(mToken,'connector','set',...args,'--source','bottom','--source-offset','.3');
 const after=JSON.parse(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')));assert.deepEqual(after.access.relations,stateBefore.access.relations,'settings do not create relationships');assert.deepEqual(after.rooms,stateBefore.rooms,'no auto reflow')
 for(const invalid of [{side:'diagonal'},{side:'top',offset:1.1},{side:'top',offset:'0.5'}])assert.equal((await request(mToken,'connector.set',{manager:m.id,employee:e.id,target:invalid})).ok,false)
 assert.equal((await raw(null,'connector','set',...args,'--target-offset','.5')).ok,false)
 await cli('room','bounds','A','--width','1000','--height','1100');await cli('card','place',m.id,'--x','390','--y','230','--snap','off');await cli('card','place',e.id,'--x','100','--y','650','--snap','off')
 for(const offset of [0,1]){
  await call(mToken,'connector','set',...args,'--source','top','--source-offset',String(offset),'--target','bottom','--target-offset',String(offset))
  const corner=await cli('connector','get',...args)
  assert.deepEqual(corner.geometry.points[0],{x:390+190*offset,y:230})
  assert.deepEqual(corner.geometry.points.at(-1),{x:100+190*offset,y:900})
 }
 await call(mToken,'connector','set',...args,'--source','bottom','--source-offset','.3','--target','top','--target-offset','.6')
 await f.stop();await f.start();assert.deepEqual((await cli('connector','get',...args)).source,setting.source,'anchors survive restart');assert.deepEqual((await cli('connector','get',...args)).target,setting.target)
 await call(gToken,'connector','set','--manager',g.id,'--employee',m.id,'--source','left','--target','top')
 assert.equal((await call(mToken,'api','list')).some(c=>c.name==='connector.set'),true)
 assert.equal((await call(eToken,'api','list')).some(c=>c.name==='connector.set'),false)
 await call(mToken,'connector','reset',...args);assert.deepEqual((await cli('connector','get',...args)).source,{side:'auto'})
 await cli('card','remove',e.id);const cleaned=JSON.parse(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')));assert.ok(Object.values(cleaned.connectorAnchors).every(c=>c.employeeId!==e.id))
 console.log('PASS real CLI / raw Socket: anchor persistence, partial updates, validation, scoped authorization, no implicit relation or reflow, restart and deletion cleanup')
}finally{await f.close()}
