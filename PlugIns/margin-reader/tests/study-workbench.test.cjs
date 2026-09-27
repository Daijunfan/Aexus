'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
const {createPlugin}=require('../runtime.cjs');
async function study(t){const f=await setup(t);let set=await f.api('study.create',{title:'本地学习'});return {...f,get:async()=>set=await f.api('study.get',{setId:set.id}),change:async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p}),id:set.id};}
test('independent note cards, tags, search and view survive a runtime restart',async t=>{
 const f=await study(t);let s=await f.change('study.note.create',{title:'知识卡',text:'中文 English body',tags:[' 原理 ','原理','考试'],color:'blue'});const c=s.cards[0];assert.equal(c.source,null);assert.equal(c.imageAsset,null);assert.deepEqual(c.tags,['原理','考试']);
 s=await f.change('study.card.update',{cardId:c.id,text:'updated body',note:'详细注释'});assert.equal(s.cards[0].text,'updated body');
 assert.equal((await f.api('study.cards.query',{setId:s.id,query:'BODY',tag:'原理',color:'blue'})).cards.length,1);assert.equal((await f.api('study.cards.query',{setId:s.id,tag:'missing'})).cards.length,0);
 await f.change('study.view.set',{view:'outline'});await f.error('study.card.image',{setId:s.id,cardId:c.id},'NOT_FOUND');
 const r=await createPlugin({workspace:f.workspace});t.after(()=>r.close());const loaded=await r.request({jsonrpc:'2.0',id:1,method:'study.get',params:{setId:s.id}});assert.equal(loaded.result.view,'outline');assert.equal(loaded.result.cards[0].note,'详细注释');
 const bytes=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'),'utf8');assert(!bytes.includes('contentBase64'));assert.deepEqual((await f.api('fs.list')).entries,[]);
});
test('associations cross branches; card deletion/restoration and undo/redo preserve links',async t=>{
 const f=await study(t);let s=await f.change('study.note.create',{title:'A'}),a=s.cards[0].id;s=await f.change('study.note.create',{title:'B'});const b=s.cards[1].id;
 s=await f.change('study.link.add',{from:a,to:b,label:'相关'});const link=s.links[0];assert.equal(link.bidirectional,true);
 await f.error('study.link.add',{setId:s.id,expectedRevision:s.revision,from:b,to:a},'ALREADY_EXISTS');
 await f.error('study.link.add',{setId:s.id,expectedRevision:s.revision,from:a,to:a},'INVALID_PARAMS');
 s=await f.change('study.card.remove',{cardId:a});assert.equal(s.links.length,0);const trash=s.cardTrash[0].id;
 s=await f.change('study.card.restore',{trashId:trash});assert.equal(s.links[0].id,link.id);
 s=await f.change('study.undo');assert.equal(s.cards.length,1);assert.equal(s.links.length,0);
 s=await f.change('study.redo');assert.equal(s.cards.length,2);assert.equal(s.links.length,1);
});
test('history is durable, monotonic, conflict-checked, and new edits clear redo',async t=>{
 const f=await study(t);let s=await f.change('study.note.create',{title:'First'}),rev=s.revision;
 s=await f.change('study.undo');assert.equal(s.cards.length,0);assert(s.revision>rev);assert(s.history.canRedo);
 await f.error('study.redo',{setId:s.id,expectedRevision:rev},'CONFLICT');
 s=await f.change('study.redo');assert.equal(s.cards[0].title,'First');
 await f.change('study.undo');s=await f.change('study.note.create',{title:'Second'});assert(!s.history.canRedo);
 for(let i=0;i<33;i++)await f.change('study.update',{title:'History '+i});
 const state=JSON.parse(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')));assert.equal(state.studySets[s.id].history.undo.length,30);
});
test('FSRS review is offline, persists schedule/logs, supports suspension and undoing a rating',async t=>{
 const f=await study(t);let s=await f.change('study.note.create',{title:'Question',text:'Answer'});const cardId=s.cards[0].id;
 s=await f.change('study.review.configure',{cardId,enabled:true,front:'Why?',back:'Because.'});assert.equal(s.review.due,1);const original=s.cards[0].review.schedule;
 const preview=await f.api('study.review.preview',{setId:s.id,cardId});assert.deepEqual(Object.keys(preview),['again','hard','good','easy']);assert(new Date(preview.easy)>new Date(preview.again));
 const rev=s.revision;s=await f.change('study.review.grade',{cardId,rating:'easy'});assert.equal(s.cards[0].review.schedule.reps,1);assert.equal(s.cards[0].review.logs.length,1);assert.equal(s.review.due,0);
 await f.error('study.review.grade',{setId:s.id,expectedRevision:rev,cardId,rating:'easy'},'CONFLICT');
 s=await f.change('study.undo');assert.deepEqual(s.cards[0].review.schedule,original);assert.equal(s.review.due,1);assert.equal(s.cards[0].review.logs.length,0);
 s=await f.change('study.review.configure',{cardId,enabled:false});assert.equal(s.review.total,0);
 await f.error('study.review.grade',{setId:s.id,expectedRevision:s.revision,cardId,rating:'good'},'INVALID_PARAMS');
 s=await f.change('study.review.configure',{cardId,enabled:true});assert.equal(s.cards[0].review.front,'Why?');assert.equal(s.review.total,1);
});
test('validation failure does not advance revision/history or leak across sets',async t=>{
 const f=await study(t),s=await f.change('study.note.create',{title:'A'}),other=await f.api('study.create',{title:'Other'});
 for(const p of [{title:''},{title:'Bad',tags:[{}]},{title:'Bad',parentId:s.cards[0].id+'x'}])await f.error('study.note.create',{setId:s.id,expectedRevision:s.revision,...p},p.parentId?'NOT_FOUND':'INVALID_PARAMS');
 assert.equal((await f.get()).revision,s.revision);assert.equal((await f.get()).cards.length,1);
 await f.error('study.link.add',{setId:other.id,expectedRevision:other.revision,from:s.cards[0].id,to:s.cards[0].id},'NOT_FOUND');
});
test('PDF ink is version-scoped, survives restart and zoom coordinates, supports erase/undo without modifying originals',async t=>{
 const f=await study(t),bytes=require('./fixtures.cjs').pdfFixture();await fs.writeFile(path.join(f.workspace,'ink.pdf'),bytes);
 let s=await f.change('study.documents.add',{paths:['ink.pdf']}),doc=await f.api('document.open',{path:'ink.pdf'});
 const p={documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,.2],[.3,.4],[.5,.2]],color:'blue',width:.004};
 await f.error('study.ink.add',{setId:s.id,expectedRevision:s.revision,...p,points:[[2,0],[0,0]]},'INVALID_PARAMS');
 s=await f.change('study.ink.add',p);const stroke=s.ink[0];assert.equal(stroke.sourceChanged,false);assert.deepEqual(stroke.points,p.points);
 s=await f.change('study.ink.remove',{strokeId:stroke.id});assert.equal(s.ink.length,0);s=await f.change('study.undo');assert.equal(s.ink[0].id,stroke.id);
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'ink.pdf')),bytes);
 await fs.appendFile(path.join(f.workspace,'ink.pdf'),'\n% changed');assert((await f.get()).ink[0].sourceChanged);
 await f.error('study.ink.add',{setId:s.id,expectedRevision:s.revision,...p},'SOURCE_CHANGED');
});
