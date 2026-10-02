'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('rapid page clicks coalesce a bounded target without dropping the newest intent',async()=>{
 const {PageTurnQueue}=await import('../ui/page-turn-queue.mjs');let page=1,release;const calls=[];
 const q=new PageTurnQueue({read:()=>({key:'a',page,total:12}),move:async target=>{calls.push(target);if(calls.length===1)await new Promise(r=>{release=r;});page=target;}});
 const first=q.request(1);await new Promise(r=>setImmediate(r));q.request(1);q.request(1);q.request(-1);release();await first;
 assert.equal(page,3);assert.deepEqual(calls,[2,3]);assert.equal(q.active,false);
 await q.request(0,999);assert.equal(page,12);await q.request(1);assert.equal(page,12);
});
test('failed turns release the queue and document changes invalidate older in-flight navigation',async()=>{
 const {PageTurnQueue}=await import('../ui/page-turn-queue.mjs');let key='a',page=1,fail=true,release;
 const q=new PageTurnQueue({read:()=>({key,page,total:5}),move:async(target,{isCurrent})=>{if(fail){fail=false;throw Error('deliberate failure');}if(key==='a')await new Promise(r=>{release=r;});if(isCurrent())page=target;}});
 await assert.rejects(q.request(1),/deliberate/);assert.equal(q.active,false);
 const old=q.request(1);await new Promise(r=>setImmediate(r));q.cancel();key='b';page=1;await q.request(1);assert.equal(page,2);release();await old;assert.equal(page,2);assert.equal(q.active,false);
});
test('fresh trackpad acceleration and reversals rearm a turn without a 240ms quiet gap',async()=>{
 const {PdfGesture}=await import('../ui/pdf-gestures.mjs');const g=new PdfGesture(),turns=[];
 const values=[80,50,22,8,3,1,2,85,44,20,8,2,-80,-40,-10];
 values.forEach((x,i)=>{const a=g.feed({deltaX:x,deltaY:0,timeStamp:i*30},{now:i*30,mode:'paged'});if(a.type==='turn')turns.push(a.delta);});
 assert.deepEqual(turns,[1,1,-1]);
});
test('paged discrete wheel detents never remain latched after the first turn',async()=>{
 const {PdfGesture}=await import('../ui/pdf-gestures.mjs');
 for(const deltaMode of [0,1]){const g=new PdfGesture(),turns=[];
  for(let i=0;i<5;i++){const a=g.feed({deltaX:0,deltaY:deltaMode?5:100,deltaMode,timeStamp:i*100},{now:i*100,mode:'paged',top:0,max:0});if(a.type==='turn')turns.push(a.delta);}
  assert.deepEqual(turns,[1,1,1,1,1]);
 }
});
