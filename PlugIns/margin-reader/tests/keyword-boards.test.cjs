'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {setup}=require('./fixtures.cjs');
async function fixture(t){
 const f=await setup(t),a=await f.api('study.create',{title:'概念笔记'}),b=await f.api('study.create',{title:'参考词典'});
 const get=setId=>f.api('study.get',{setId}),change=async(setId,method,p={})=>f.api(method,{setId,expectedRevision:(await get(setId)).revision,...p});
 await change(a.id,'study.note.create',{title:'条件概率； Probability ; probability',text:'定义',tags:['数学','复习']});
 await change(a.id,'study.note.create',{title:'Probability; Bayes',text:'推导',tags:['数学']});
 await change(a.id,'study.note.create',{title:'独立记录',text:'Probability appears only in the body'});
 await change(b.id,'study.note.create',{title:'PROBABILITY',text:'其它学习集中的定义'});
 return {...f,a,b,get,change};
}
test('keyword boards group exact semicolon aliases, deduplicate per card, and preserve title spelling and state bytes',async t=>{
 const f=await fixture(t),file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);
 const r=await f.api('study.board.query',{setId:f.a.id,groupBy:['keyword','tag']}),prob=r.groups.find(g=>g.key.toLowerCase()==='probability');
 assert.equal(r.total,3);assert.equal(prob.count,2);assert.equal(prob.children.find(g=>g.key==='数学').count,2);
 assert(r.groups.some(g=>g.key==='条件概率'));assert(!r.groups.some(g=>g.key.includes(';')));
 const filtered=await f.api('study.board.query',{setId:f.a.id,filter:{titleKeyword:' probability '},groupBy:['keyword']});assert.equal(filtered.total,2);
 assert.deepEqual(await fs.readFile(file),before);assert.equal((await f.get(f.a.id)).cards[0].title,'条件概率； Probability ; probability');
});
test('workspace keyword groups retain owner identities, filters and complete pagination',async t=>{
 const f=await fixture(t),r=await f.api('study.workspace.query',{setIds:[f.a.id,f.b.id],filter:{titleKeyword:'probability'},groupBy:['keyword','study'],limit:1});
 assert.equal(r.total,3);assert.equal(r.cards.length,1);assert.equal(r.groups.find(g=>g.key.toLowerCase()==='probability').count,3);
 const seen=new Set();for(let next=0;next!==null;){const page=await f.api('study.workspace.query',{setIds:[f.a.id,f.b.id],filter:{titleKeyword:'Probability'},groupBy:['keyword'],limit:1,offset:next});page.cards.forEach(c=>seen.add(c.ownerSetId+'/'+c.id));next=page.nextOffset;}
 assert.equal(seen.size,3);await f.error('study.workspace.query',{setIds:[randomUUID()],groupBy:['keyword']},'NOT_FOUND');
});
test('saved keyword boards materialize live references with undo and survive portable import',async t=>{
 const f=await fixture(t);let s=await f.change(f.a.id,'study.board.save',{title:'词条图谱',filter:{titleKeyword:'Probability'},groupBy:['keyword'],sort:'title'});const id=s.boards[0].id,originals=structuredClone(s.cards);
 s=await f.change(f.a.id,'study.board.materialize',{boardId:id});assert(s.cards.filter(c=>c.reference).length>=2);for(const original of originals)assert.deepEqual(s.cards.find(c=>c.id===original.id),original);
 s=await f.change(f.a.id,'study.undo');assert.deepEqual(s.cards,originals);
 await f.api('study.package.export',{setId:s.id,path:'keywords.mrpkg'});const imported=await f.api('study.package.import',{path:'keywords.mrpkg',folder:'Imported'}),copy=await f.get(imported.setId);
 assert.equal(copy.boards[0].groupBy[0],'keyword');assert.equal((await f.api('study.board.query',{setId:copy.id,boardId:copy.boards[0].id})).total,2);
});
test('disabled title links reject keyword grouping and saving without changing state, while exact filtering remains available',async t=>{
 const f=await fixture(t);await f.change(f.a.id,'study.links.settings',{titleLinks:false});const file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);
 await f.error('study.board.query',{setId:f.a.id,groupBy:['keyword']},'TITLE_LINKS_DISABLED');
 await f.error('study.workspace.query',{setIds:[f.a.id,f.b.id],groupBy:['keyword']},'TITLE_LINKS_DISABLED');
 await f.error('study.board.save',{setId:f.a.id,expectedRevision:(await f.get(f.a.id)).revision,title:'Disabled',groupBy:['keyword']},'TITLE_LINKS_DISABLED');
 assert.equal((await f.api('study.board.query',{setId:f.a.id,filter:{titleKeyword:'Probability'}})).total,2);assert.deepEqual(await fs.readFile(file),before);
 await f.change(f.a.id,'study.links.settings',{titleLinks:true});await f.error('study.board.query',{setId:f.a.id,groupBy:['keyword','keyword']},'INVALID_PARAMS');
});
test('keyword grouping validates input and enforces a membership budget instead of silently truncating',()=>{
 const K=require('../lib/title-keywords.cjs');assert.deepEqual(K.terms('Alpha ; alpha； beta;'),['Alpha','beta']);
 const cards=Array.from({length:10000},()=>({title:'Alpha;Beta;Gamma;Delta',tags:Array(30).fill('tag')}));
 assert.throws(()=>K.grouping([{}],cards,['keyword','tag']),e=>e.code==='TOO_LARGE');
});
