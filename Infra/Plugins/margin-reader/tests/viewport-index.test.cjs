'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('10,000-card spatial index returns every intersecting card for arbitrary scroll/zoom rectangles',async()=>{
  const {ViewportIndex,intersects}=await import('../ui/viewport-index.mjs');
  let state=8294;const random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/2**32);
  const entries=Array.from({length:10000},(_,i)=>[String(i),{x:random()*18000-300,y:random()*900000-200,width:100+random()*700,height:80+random()*900}]);
  entries.push(['wide',{x:-10000,y:40000,width:120000,height:30000}]);
  const index=new ViewportIndex(entries);
  for(let i=0;i<80;i++){
    const box={x:random()*17000,y:random()*900000,width:600+random()*3000,height:400+random()*2000};
    const expected=new Set(entries.filter(([,p])=>intersects(p,box)).map(([id])=>id));assert.deepEqual(index.query(box),expected);
  }
  assert.deepEqual(index.query({x:-10000,y:-10000,width:150000,height:1000000}),new Set(entries.map(([id])=>id)));
});
test('card paint bounds retain off-card handwriting without treating front-only and hidden strokes as visible',async()=>{
  const {cardPaintBounds,ViewportIndex}=await import('../ui/viewport-index.mjs');
  const box={x:1000,y:1000,width:200,height:150};
  const card={ink:[{points:[[-2,.5],[.5,1.5]],width:.02},{hidden:true,points:[[-50,1]],width:1},{reviewSide:'front',points:[[40,40]],width:1},{imageBound:true,points:[[40,40]],width:1}]};
  const bounds=cardPaintBounds(card,box);assert.equal(bounds.x,598);assert.equal(bounds.y,1000);assert.equal(bounds.height,227);assert.equal(bounds.width,602);
  assert(new ViewportIndex([['note',bounds]]).query({x:590,y:1070,width:20,height:20}).has('note'));
});
test('viewport projection uses the full graph coordinates and bounded overscan at minimum zoom',async()=>{
  const {viewportBox}=await import('../ui/viewport-index.mjs');
  assert.deepEqual(viewportBox({scrollLeft:600,scrollTop:1200,clientWidth:800,clientHeight:600},.2,200),{x:2000,y:5000,width:6000,height:5000});
});
