'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const setup=async()=>{const {topicDrop}=await import('../ui/topic-drop.mjs');const cards=[{id:'root',parentId:null},{id:'a',parentId:'root'},{id:'a-child',parentId:'a'},{id:'b',parentId:'root'},{id:'b-child',parentId:'b'}];const positions=new Map([['root',{x:0,y:80,width:120,height:50}],['a',{x:200,y:0,width:130,height:50}],['a-child',{x:400,y:0,width:100,height:50}],['b',{x:200,y:150,width:140,height:60}],['b-child',{x:400,y:150,width:110,height:50}]]);return{topicDrop,cards,layout:{config:{},positions,topics:new Map(cards.map(c=>[c.id,{box:{structure:'logic-right'}}]))},rootIds:['a'],family:new Set(['a','a-child']),delta:[0,0]};};
test('the whole target body means reparent; narrow sibling bands live outside the topic',async()=>{
 const f=await setup();for(const y of [151,155,180,205,209]){const plan=f.topicDrop({...f,point:[265,y]});assert.equal(plan.kind,'child','body y='+y);assert.equal(plan.parentId,'b');}
 assert.equal(f.topicDrop({...f,point:[265,146]}).kind,'before');assert.equal(f.topicDrop({...f,point:[265,214]}).kind,'after');
});
test('an explicit topic target wins over flexible floating; Alt remains an explicit detach gesture',async()=>{
 const f=await setup();f.cards.find(c=>c.id==='a').parentId=null;f.layout.config.flexibleFloating=true;
 assert.equal(f.topicDrop({...f,point:[265,180]}).parentId,'b');assert.equal(f.topicDrop({...f,point:[265,180],alt:true}).kind,'floating');assert.equal(f.topicDrop({...f,point:[265,146]}).kind,'floating');f.layout.config.flexibleFloating=false;assert.equal(f.topicDrop({...f,point:[265,146]}).kind,'before');
});
test('an overlapping target remains reachable after the dragged root leaves its original rectangle',async()=>{
 const f=await setup();f.layout.positions.set('a',{x:230,y:155,width:70,height:40});f.delta=[55,30];
 const plan=f.topicDrop({...f,point:[260,175]});assert.equal(plan.kind,'child');assert.equal(plan.parentId,'b');
});
test('self and descendant targets never become parents and blank dropping preserves existing sibling ordering',async()=>{
 const f=await setup();assert.equal(f.topicDrop({...f,point:[240,20]}).kind,'none');assert.equal(f.topicDrop({...f,point:[440,20]}).kind,'invalid');const plan=f.topicDrop({...f,point:[340,250]});assert.equal(plan.kind,'reorder');assert.equal(plan.parentId,'root');
});
