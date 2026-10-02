"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
test('selection geometry normalizes root selections and rendered curves follow both card endpoints',async()=>{
 const M=await import('../ui/map-interaction.mjs');
 const cards=[{id:'root',parentId:null},{id:'child',parentId:'root'},{id:'other',parentId:null}];assert.deepEqual(M.rootSelection(cards,['root','child']).map(c=>c.id),['root']);
 const positions=new Map([['root',{x:0,y:0,width:100,height:100}],['child',{x:200,y:0,width:100,height:100}]]);
 assert.deepEqual(M.selectedRegion(positions,[0,0],[150,100]),['root']);assert.deepEqual(M.selectedRegion(positions,[0,0],[300,100],[[0,0],[150,0],[150,100],[0,100]]),['root']);
 const link={from:'root',to:'child',curve:[[50,50],[150,180],[250,50]]};assert.equal(M.curvePath(link,positions),'M50,50 L150,180 L250,50');positions.get('child').y=100;assert.equal(M.curvePath(link,positions),'M50,50 L150,230 L250,150');
});
