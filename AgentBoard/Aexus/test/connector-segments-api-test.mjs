import assert from 'node:assert/strict';import {fixtureCore} from './fixtures/headless-core.mjs';
const f=await fixtureCore(),{cli,call,raw,request,create,token}=f;
try{
 await cli('group','add','A');await cli('group','add','B');const m=await create('Manager','A','manager'),e=await create('Employee'),outside=await create('Outside','B'),t=await token(m.id),et=await token(e.id),args=['--manager',m.id,'--employee',e.id];
 await cli('room','bounds','A','--width','1000','--height','1000');await cli('card','place',m.id,'--x','350','--y','250','--snap','off');await cli('card','place',e.id,'--x','80','--y','650','--snap','off');
 const before=await cli('connector','get',...args),points=before.geometry.points,index=points.findIndex((p,i)=>i>0&&i<points.length-2&&p.y===points[i+1].y);assert.ok(index>=0);
 await call(t,'connector','segment',...args,'--index',String(index),'--x','300','--y',String(points[index].y+40));let saved=await cli('connector','get',...args);assert.ok(saved.route?.length);assert.notDeepEqual(saved.geometry.points,points);assert.deepEqual(saved.geometry.points[0],points[0]);assert.deepEqual(saved.geometry.points.at(-1),points.at(-1));
 await f.stop();await f.start();assert.deepEqual((await cli('connector','get',...args)).route,saved.route,'manual route persists');
 await cli('card','place',e.id,'--x','140','--y','710','--snap','off');let moved=await cli('connector','get',...args);assert.deepEqual(moved.geometry.points.at(-1),{x:235,y:710});assert.ok(moved.route);
 assert.equal((await raw(et,'connector','segment',...args,'--index','1','--x','0','--y','0')).ok,false);assert.equal((await raw(t,'connector','segment','--manager',m.id,'--employee',outside.id,'--index','0','--x','10','--y','20')).ok,false);
 assert.equal((await request(t,'connector.set',{manager:m.id,employee:e.id,route:[{x:0,y:0},{x:1,y:1}]})).ok,false,'diagonal raw input rejected');assert.equal((await request(t,'connector.segment',{manager:m.id,employee:e.id,index:1000,x:0,y:0})).ok,false);
 await call(t,'connector','set',...args,'--auto-route');const restored=await cli('connector','get',...args);assert.equal(restored.route,undefined);assert.deepEqual(restored.source,saved.source);assert.deepEqual(restored.target,saved.target);
 // A manually edited cross-Team route must not retain rails at the old Team location.
 await cli('card','management-role',m.id,'governor');const cross=['--manager',m.id,'--employee',outside.id];
 await cli('room','bounds','B','--x','1500','--y','0');
 const edit=async()=>{const c=await cli('connector','get',...cross),p=c.geometry.points;await cli('connector','segment',...cross,'--index','0','--x',String(p[0].x+90),'--y',String(p[0].y+90));return cli('connector','get',...cross)};
 await call(t,'connector','set',...args,'--points',JSON.stringify(saved.route));const internal=(await cli('connector','get',...args)).route;
 for(const [name,x,y] of [['B',1700,350],['A',-400,-300],['B',-1700,-300],['A',0,0]]){
  const manual=await edit();assert.ok(manual.route);
  const unchanged=await cli('room','layout',name);await cli('room','bounds',name,'--x',String(unchanged.bounds.x));assert.deepEqual((await cli('connector','get',...cross)).route,manual.route,'no-op placement retains edits');
  await cli('room','bounds',name,'--x',String(x),'--y',String(y));const automatic=await cli('connector','get',...cross);
  assert.equal(automatic.route,undefined,'moving either Team re-plans all cross-Team segments');assert.equal(automatic.geometry.manual,false);assert.deepEqual(automatic.source,manual.source);assert.deepEqual(automatic.target,manual.target);
  assert.deepEqual((await cli('connector','get',...args)).route,internal,'same-Team routes move with their room');
 }
 await edit();await cli('group','add','Unrelated');await cli('room','bounds','Unrelated','--x','5000');assert.ok((await cli('connector','get',...cross)).route,'unrelated Teams preserve edits');
 await cli('room','bounds','B','--x','1900');const automatic=(await cli('connector','get',...cross)).geometry.worldPath;await f.stop();await f.start();assert.equal((await cli('connector','get',...cross)).geometry.worldPath,automatic,'new route survives restart');
 console.log('PASS real CLI: move segment, persist bends, follow employee, automatic-route reset, permissions and malformed geometry')
}finally{await f.close()}
