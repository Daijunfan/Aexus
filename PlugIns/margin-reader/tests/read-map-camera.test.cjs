'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures.cjs');
test('camera zoom preserves the exact pointer world position across negative offsets and its supported scale range',async()=>{
 const {zoomAt,MIN_ZOOM,MAX_ZOOM,wheelDelta}=await import('../ui/map-camera.mjs');
 for(const c of [{x:-100000,y:200000,z:.01},{x:420,y:-810,z:1},{x:-.123,y:99.9,z:4}])for(const value of [.00001,.01,.4,1,2,8])for(const p of [{x:0,y:0},{x:900,y:750}]){
  const next=zoomAt(c,value,p);assert(next.z>=MIN_ZOOM&&next.z<=MAX_ZOOM);for(const key of ['x','y'])assert(Math.abs((p[key]-c[key])/c.z-(p[key]-next[key])/next.z)<.00001);
 }
 assert.deepEqual(wheelDelta({deltaX:2,deltaY:-3,deltaMode:1},700),{x:32,y:-48});assert.deepEqual(wheelDelta({deltaX:0,deltaY:1,deltaMode:2},700),{x:0,y:700});assert.deepEqual(wheelDelta({deltaX:0,deltaY:42,shiftKey:true},700),{x:42,y:0});
});
test('signed floating placement supports every canvas direction and keeps source identities, relative geometry and undo',async t=>{
 const f=await setup(t);let s=await f.api('study.create',{title:'Unbounded camera model'});
 const change=async(m,p)=>s=await f.api(m,{setId:s.id,expectedRevision:s.revision,...p});
 await change('study.mindmap.outline.import',{text:'Center\n  Branch\n    Leaf'});const before=structuredClone(s.cards),root=before[0].id;
 await change('study.note.create',{title:'Negative quadrant',x:-4200,y:-3100});const floating=s.cards.find(c=>c.title==='Negative quadrant');
 assert.deepEqual(floating.position,{x:-4200,y:-3100});const g=await f.api('study.map.geometry',{setId:s.id});assert(g.originX<0&&g.originY<0);
 for(const c of before)assert.deepEqual(s.cards.find(n=>n.id===c.id),c);
 const b=g.positions.find(p=>p.cardId===floating.id);assert.equal(b.x+g.originX,-4200);assert.equal(b.y+g.originY,-3100);
 await change('study.cards.move',{cardIds:[root],parentId:null,positions:[{cardId:root,x:-6000,y:2000}]});assert.equal(s.cards.find(c=>c.id===root).position.x,-6000);
 await change('study.undo',{});assert.deepEqual(s.cards.find(c=>c.id===root),before[0]);
 await f.error('study.note.create',{setId:s.id,expectedRevision:s.revision,title:'Outside numeric budget',x:2e9,y:0},'INVALID_PARAMS');
 await change('study.view.set',{view:'documents'});assert.equal(s.view,'documents');await change('study.view.set',{view:'map'});assert.equal(s.view,'map');assert.equal(s.cards.length,4);
});
