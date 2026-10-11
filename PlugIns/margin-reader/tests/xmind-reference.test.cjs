'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures.cjs'),F=require('./xmind-fixture.cjs'),C=require('../ui/mindmap-catalog.json');
const load=()=>import('../ui/mindmap-layout.mjs');
function verify(l,ids,label){
 assert.deepEqual([...l.positions.keys()].sort(),ids.slice().sort(),label+' lost IDs');
 const boxes=[...l.positions];for(let i=0;i<boxes.length;i++){const [id,a]=boxes[i];for(const k of ['x','y','width','height'])assert(Number.isFinite(a[k])&&a[k]>=0,label+' invalid '+id+' '+k);for(let j=i+1;j<boxes.length;j++)assert(!F.overlap(a,boxes[j][1]),label+' overlap '+id+' / '+boxes[j][0]);}
 assert(Number.isFinite(l.width)&&Number.isFinite(l.height),label+' invalid total bounds');
}
test('every structural family retains 125 actual topics at six levels with finite nonoverlapping geometry',async()=>{
 const {layoutMindmap}=await load(),cards=F.cards(true),ids=cards.map(c=>c.id);assert(cards.length>120);
 for(const structure of Object.keys(C.structures)){const l=layoutMindmap(cards,{mindmap:{structure}});verify(l,ids,structure);assert.deepEqual([...l.positions],[...layoutMindmap(cards,{mindmap:{structure}}).positions],structure+' nondeterministic');}
});
test('timelines keep primary topics on one axis; fishbones, braces and tables emit their actual structural furniture',async()=>{
 const {layoutMindmap}=await load(),cards=F.cards(),main=cards.filter(c=>!c.parentId||c.parentId===cards[0].id);
 for(const [structure,key,size]of [['timeline-horizontal','y','height'],['timeline-vertical','x','width']]){const l=layoutMindmap(cards,{mindmap:{structure}}),centers=main.map(c=>{const b=l.positions.get(c.id);return b[key]+b[size]/2;});assert(Math.max(...centers)-Math.min(...centers)<.01,structure);}
 for(const type of ['fishbone-right','fishbone-left']){const l=layoutMindmap(cards,{mindmap:{structure:type}});assert(l.furniture.filter(f=>f.kind==='lines').length>=5);assert(l.links.filter(e=>e.points).length>10);}
 const brace=layoutMindmap(cards,{mindmap:{structure:'brace'}});assert(brace.furniture.some(f=>f.kind==='bracket'));assert(brace.links.every(e=>e.points));
 for(const structure of ['matrix','tree-table-right','tree-table-down']){const l=layoutMindmap(cards,{mindmap:{structure}});verify(l,cards.map(c=>c.id),structure);assert(l.links.some(e=>e.hidden));if(structure==='matrix'){const g=l.furniture.find(f=>f.kind==='grid');assert(g.columns.length===3&&g.rows.length>=3);}}
});
test('independent skeletons change shapes and connectors, color changes retain a selected skeleton and complete labels',async()=>{
 const {layoutMindmap}=await load(),cards=F.cards(),signatures=new Set();
 for(const [skeleton,spec]of Object.entries(C.skeletons)){const l=layoutMindmap(cards,{mindmap:{skeleton}});assert.equal(l.config.structure,spec.structure);verify(l,cards.map(c=>c.id),skeleton);signatures.add(JSON.stringify([...l.topics.values()].map(t=>[t.shape,t.fontSize,t.borderWidth,t.line])));}
 assert(signatures.size>=9,'Skeletons must do more than recolor the same rectangles');
 const plain=layoutMindmap(cards,{mindmap:{skeleton:'classic'}}),dark=layoutMindmap(cards,{mindmap:{skeleton:'classic',theme:'midnight'}});
 assert.deepEqual([...plain.topics.values()].map(t=>t.shape),[...dark.topics.values()].map(t=>t.shape));assert([...plain.topics.values()].some(t=>t.depth>=2&&t.shape==='underline'));
 const long={id:'long',parentId:null,title:'Complete long technical heading：复杂思维导图中的定位、分支继承、拓扑重排和最后一个词 KEEP_END'};
 const l=layoutMindmap([long],{});assert(l.topics.get('long').lines.at(-1).text.endsWith('KEEP_END'));assert(!l.topics.get('long').lines.some(v=>v.ellipsis));
});
test('mixed structures preserve local branch types, selected range summaries and source identities',async()=>{
 const {layoutMindmap}=await load(),cards=F.cards(true),root=cards[0].id,main=cards.filter(c=>c.parentId===root);for(const [i,c]of main.entries())c.mindmap={structure:['org-down','brace','tree-table-right','logic-right'][i]};
 const before=structuredClone(cards),l=layoutMindmap(cards,{mindmap:{skeleton:'classic',structure:'mindmap'}});verify(l,cards.map(c=>c.id),'mixed');assert.deepEqual(cards,before);for(const c of main)assert.equal(l.topics.get(c.id).box.structure,c.mindmap.structure);
});
test('reorder and side change are one guarded Core transaction, cancel plans are read-only and undo restores descendants',async t=>{
 const f=await setup(t);let s=await f.api('study.create',{title:'Topology'});s=await f.api('study.mindmap.outline.import',{setId:s.id,expectedRevision:s.revision,text:F.outline()});const root=s.cards[0],main=s.cards.filter(c=>c.parentId===root.id),before=structuredClone(s.cards),revision=s.revision;
 s=await f.api('study.cards.move',{setId:s.id,expectedRevision:revision,cardIds:[main[0].id],parentId:root.id,index:2,side:'left'});assert.equal(s.cards.filter(c=>c.parentId===root.id)[2].id,main[0].id);assert.equal(s.cards.find(c=>c.id===main[0].id).mindmap.side,'left');
 await f.error('study.cards.move',{setId:s.id,expectedRevision:revision,cardIds:[main[1].id],parentId:root.id,index:0},'CONFLICT');
 s=await f.api('study.undo',{setId:s.id,expectedRevision:s.revision});assert.deepEqual(s.cards.map(c=>[c.id,c.parentId,c.mindmap?.side]),before.map(c=>[c.id,c.parentId,c.mindmap?.side]));
 const child=s.cards.find(c=>c.parentId===main[0].id);await f.error('study.cards.move',{setId:s.id,expectedRevision:s.revision,cardIds:[main[0].id],parentId:child.id},'INVALID_OUTLINE');
 const {topicDrop}=await import('../ui/topic-drop.mjs'),{layoutMindmap}=await load(),l=layoutMindmap(s.cards,s.map),b=l.positions.get(main[0].id),p=l.positions.get(root.id),family=new Set([main[0].id]),point=[p.x-20,p.y+p.height/2];assert(![...l.positions.values()].some(r=>point[0]>=r.x&&point[0]<=r.x+r.width&&point[1]>=r.y&&point[1]<=r.y+r.height),'A side-change test must actually drop into blank space, not another topic body');const plan=topicDrop({cards:s.cards,layout:l,rootIds:[main[0].id],family,point,delta:[-30,10]});assert.equal(plan.parentId,root.id);assert.equal(plan.side,'left');assert.equal((await f.api('study.get',{setId:s.id})).revision,s.revision);
});
