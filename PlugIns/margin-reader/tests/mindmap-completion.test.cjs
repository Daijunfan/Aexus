'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs'),F=require('./xmind-fixture.cjs'),C=require('../ui/mindmap-catalog.json');
const make=async f=>{let s=await f.api('study.create',{title:'Complete local mind-map'});return f.api('study.mindmap.outline.import',{setId:s.id,expectedRevision:s.revision,text:F.outline()});};
const change=(f,s,method,p={})=>f.api(method,{setId:s.id,expectedRevision:s.revision,...p});
test('all 54 grouped skeletons have distinct actual layout/style output, preserve six-level topics and finite geometry',async()=>{
 const {layoutMindmap}=await import('../ui/mindmap-layout.mjs'),cards=F.cards(true),signatures=new Set(),groups=new Set();assert.equal(Object.keys(C.skeletons).length,54);
 for(const [id,s]of Object.entries(C.skeletons)){const l=layoutMindmap(cards,{mindmap:{skeleton:id}});assert.equal(l.positions.size,cards.length,id);assert.equal(l.config.structure,s.structure,id);groups.add(s.group);for(const p of l.positions.values())for(const key of ['x','y','width','height'])assert(Number.isFinite(p[key])&&p[key]>=0,id+' '+key);
  const sig=JSON.stringify({positions:[...l.positions],topics:[...l.topics].map(([id,t])=>[id,t.shape,t.fill,t.fontSize,t.bold,t.paddingY,t.line]),links:l.links});assert(!signatures.has(sig),'Duplicate rendered skeleton: '+id);signatures.add(sig);
 }
 assert.equal(groups.size,9);assert.equal(signatures.size,54);
});
test('a custom palette and level styles are shared by renderer geometry, full labels and numbered prefixes',async t=>{
 const f=await setup(t);let s=await make(f);const original=s.cards.map(c=>[c.id,c.parentId,c.title]);
 s=await change(f,s,'study.mindmap.configure',{patch:{skeleton:'classic',palette:['#E06A55','#428C89','#7F68AE'],centralColor:'#192C48',levelStyles:[{shape:'pill',fill:'solid',size:8,bold:true},{shape:'hexagon',fill:'soft',size:2,bold:true},{shape:'underline',fill:'none',size:0,bold:false}],numbering:'hierarchy',numberPrefix:'[',numberSuffix:']'}});
 const {layoutMindmap}=await import('../ui/mindmap-layout.mjs'),l=layoutMindmap(s.cards,s.map);assert.equal(l.topics.get(s.cards[0].id).fill,'#192C48');assert.equal(l.topics.get(s.cards[1].id).shape,'hexagon');assert(l.topics.get(s.cards[1].id).prefix.startsWith('['));assert(l.topics.get(s.cards[1].id).prefix.endsWith('] '));assert.deepEqual(s.cards.map(c=>[c.id,c.parentId,c.title]),original);
 for(const patch of [{palette:['red','#FFFFFF']},{levelStyles:[{shape:'code',fill:'none'}]},{levelStyles:[{size:100}]},{levelStyles:[{script:'x'}]}])await f.error('study.mindmap.configure',{setId:s.id,expectedRevision:s.revision,patch},'INVALID_PARAMS');
 assert.equal((await f.api('study.get',{setId:s.id})).revision,s.revision);
});
test('local designs save, apply, undo, archive, restore and round-trip without carrying topic contents or identity',async t=>{
 const f=await setup(t);let s=await make(f);s=await change(f,s,'study.mindmap.configure',{patch:{skeleton:'mind-hexagon',palette:['#8C629D','#459789'],centralColor:'#1C2843'}});
 const library=await f.api('study.mindmap.design.list');let saved=await f.api('study.mindmap.design.save',{setId:s.id,expectedRevision:s.revision,title:'My local design',expectedVersion:library.version});const id=saved.designId;
 assert.equal(saved.designs.length,1);assert.equal((await f.api('study.get',{setId:s.id})).revision,s.revision);
 await f.error('study.mindmap.design.save',{title:'stale',settings:{skeleton:'classic'},expectedVersion:library.version},'CONFLICT');
 let second=await make(f);const before=structuredClone(second.cards),previous=structuredClone(second.map);second=await change(f,second,'study.mindmap.design.apply',{designId:id,expectedVersion:saved.version});assert.equal(second.map.mindmap.skeleton,'mind-hexagon');assert.deepEqual(second.cards,before);second=await change(f,second,'study.undo');assert.deepEqual(second.map,previous);
 const exported=await f.api('study.mindmap.design.export',{designId:id,expectedVersion:saved.version,path:'local-design.json'});assert(exported.bytes>100);const content=await fs.readFile(path.join(f.workspace,exported.path),'utf8');assert(!content.includes(s.cards[0].id));assert(!content.includes('cards'));const inspection=await f.api('study.mindmap.design.import',{path:exported.path});assert.equal(inspection.document.settings.skeleton,'mind-hexagon');assert.equal(inspection.applied,false);
 await f.error('study.mindmap.design.import',{path:exported.path,apply:true,expectedVersion:saved.version,expectedSourceVersion:'changed'},'CONFLICT');
 saved=await f.api('study.mindmap.design.import',{path:exported.path,apply:true,expectedVersion:saved.version,expectedSourceVersion:inspection.sourceVersion});assert.equal(saved.designs.length,2);assert.notEqual(saved.designId,id);
 saved=await f.api('study.mindmap.design.archive',{designId:id,expectedVersion:saved.version});assert(saved.designs.find(d=>d.id===id).archived);await f.error('study.mindmap.design.apply',{setId:second.id,expectedRevision:second.revision,designId:id,expectedVersion:saved.version},'NOT_FOUND');
 saved=await f.api('study.mindmap.design.archive',{designId:id,expectedVersion:saved.version,archived:false});assert(!saved.designs.find(d=>d.id===id).archived);
 await f.error('study.mindmap.design.save',{title:'unsafe',settings:{items:[{cardIds:s.cards.map(c=>c.id)}]},expectedVersion:saved.version},'INVALID_PARAMS');
 const {createPlugin}=require('../runtime.cjs'),again=await createPlugin({workspace:f.workspace});try{const r=await again.request({jsonrpc:'2.0',id:1,method:'study.mindmap.design.list'});assert.deepEqual(r.result.designs,saved.designs);}finally{await again.close();}
});
test('free main-branch positioning retains hierarchy and moves the entire visible subtree, with reversible reset',async t=>{
 const f=await setup(t);let s=await make(f);s=await change(f,s,'study.mindmap.configure',{patch:{skeleton:'classic',freeBranches:true,topicOverlap:true}});
 const main=s.cards.find(c=>c.parentId===s.cards[0].id),child=s.cards.find(c=>c.parentId===main.id),g=await f.api('study.map.geometry',{setId:s.id}),b=g.positions.find(p=>p.cardId===main.id),cb=g.positions.find(p=>p.cardId===child.id),ids=s.cards.map(c=>[c.id,c.parentId]);
 s=await change(f,s,'study.mindmap.arrange',{cardIds:[main.id],action:'place',positions:[{cardId:main.id,x:b.x+90,y:b.y+45}]});let next=await f.api('study.map.geometry',{setId:s.id});const moved=next.positions.find(p=>p.cardId===main.id),cm=next.positions.find(p=>p.cardId===child.id);assert(Math.abs(moved.x-b.x-90)<.01);assert(Math.abs(moved.y-b.y-45)<.01);assert(Math.abs(cm.x-cb.x-90)<.01);assert.deepEqual(s.cards.map(c=>[c.id,c.parentId]),ids);
 s=await change(f,s,'study.mindmap.arrange',{cardIds:[main.id],action:'reset'});next=await f.api('study.map.geometry',{setId:s.id});assert.deepEqual(next.positions,g.positions);s=await change(f,s,'study.undo');assert.equal(s.cards.find(c=>c.id===main.id).mindmap.offset.x,90);
 await f.error('study.mindmap.arrange',{setId:s.id,expectedRevision:s.revision,cardIds:[child.id],action:'place',positions:[{cardId:child.id,x:10,y:10}]},'INVALID_PARAMS');
});
test('floating align and distribute use actual topic dimensions and apply as one undoable transaction',async t=>{
 const f=await setup(t);let s=await f.api('study.create',{title:'Floating alignment'});s=await change(f,s,'study.mindmap.configure',{patch:{topicOverlap:true}});
 for(const [i,title]of ['First','A wider floating theme','Third'].entries())s=await change(f,s,'study.note.create',{title,x:100+i*300,y:100+i*110});const ids=s.cards.map(c=>c.id),original=structuredClone(s.cards);
 s=await change(f,s,'study.mindmap.arrange',{cardIds:ids,action:'top'});let p=(await f.api('study.map.geometry',{setId:s.id})).positions;assert(Math.max(...p.map(p=>p.y))-Math.min(...p.map(p=>p.y))<.01);
 s=await change(f,s,'study.mindmap.arrange',{cardIds:ids,action:'distribute-x'});p=(await f.api('study.map.geometry',{setId:s.id})).positions.sort((a,b)=>a.x-b.x);assert(Math.abs(p[1].x-p[0].x-p[0].width-(p[2].x-p[1].x-p[1].width))<.01);
 s=await change(f,s,'study.undo');s=await change(f,s,'study.undo');assert.deepEqual(s.cards,original);
});
test('collapse to depth and expand every descendant preserve data and reject stale commands',async t=>{
 const f=await setup(t);let s=await make(f);const before=structuredClone(s.cards),revision=s.revision,root=s.cards[0].id;s=await change(f,s,'study.mindmap.collapse',{cardIds:[root],level:1});const g=await f.api('study.map.geometry',{setId:s.id});assert.equal(g.positions.length,5);assert.equal(s.cards.length,before.length);
 await f.error('study.mindmap.collapse',{setId:s.id,expectedRevision:revision,cardIds:[root],level:-1},'CONFLICT');s=await change(f,s,'study.undo');assert.deepEqual(s.cards,before);s=await change(f,s,'study.mindmap.collapse',{cardIds:[root],level:-1});assert.equal((await f.api('study.map.geometry',{setId:s.id})).positions.length,before.length);
});
test('flexible floating and free branch pointer intents are pure and snapping uses screen-independent geometry',async()=>{
 const {layoutMindmap}=await import('../ui/mindmap-layout.mjs'),{topicDrop}=await import('../ui/topic-drop.mjs'),{snapDelta}=await import('../ui/mindmap-guides.mjs');
 const cards=[{id:'r',parentId:null,title:'Center'},{id:'m',parentId:'r',title:'Main'},{id:'f',parentId:null,title:'Floating',position:{x:200,y:500}}],l=layoutMindmap(cards,{mindmap:{freeBranches:true,flexibleFloating:true}}),r=l.positions.get('r'),m=l.positions.get('m');
 let p=topicDrop({cards,layout:l,rootIds:['f'],family:new Set(['f']),point:[r.x+r.width/2,r.y+r.height/2],delta:[20,10]});assert.equal(p.kind,'child');p=topicDrop({cards,layout:l,rootIds:['f'],family:new Set(['f']),point:[r.x+r.width/2,r.y+r.height/2],delta:[20,10],alt:true});assert.equal(p.kind,'floating');p=topicDrop({cards,layout:l,rootIds:['m'],family:new Set(['m']),point:[m.x+400,m.y+300],delta:[400,300]});assert.equal(p.kind,'position');
 const positions=new Map([['a',{x:0,y:0,width:100,height:50}],['b',{x:205,y:80,width:100,height:50}]]),snap=snapDelta(positions,new Set(['a']),'a',[201,79],7);assert.equal(snap.delta[0],205);assert.equal(snap.delta[1],80);assert.equal(snap.guides.length,2);
});
