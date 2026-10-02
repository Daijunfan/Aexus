'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setup}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Learning completion'});return {...f,get:()=>f.api('study.get',{setId:set.id}),change:async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p}),current:()=>set};}
test('grouped cloze questions preserve Unicode, hints and independent FSRS history; clearing cloze is explicit',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Geography',text:'中文🙂'}),id=s.cards[0].id;
 s=await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'independent',cloze:'{{c1::巴黎::城市}} is in {{c2::France}}. {{c1::🙂}}'});
 const r=s.cards[0].review;assert.equal(r.variants.length,2);assert.match(r.variants[0].front,/\[ 城市 \].*France/);assert.match(r.variants[1].front,/巴黎.*\[ … \]/);assert.equal(r.variants[0].back,'巴黎 is in France. 🙂');
 assert.equal(s.review.dueInstances,2);
 s=await f.change('study.review.grade',{cardId:id,variantId:'c1',rating:'easy'});assert.equal(s.cards[0].review.variants[0].logs.length,1);assert.equal(s.cards[0].review.variants[1].logs.length,0);assert.equal(s.cards[0].review.logs[0].variantId,'c1');
 await f.error('study.review.grade',{setId:s.id,expectedRevision:s.revision,cardId:id,variantId:'missing',rating:'good'},'NOT_FOUND');
 s=await f.change('study.review.configure',{cardId:id,enabled:true,cloze:'',front:'New question',back:'New answer'});assert.equal(s.cards[0].review.cloze,'');assert.equal(s.cards[0].review.variants,undefined);assert.equal(s.cards[0].review.logs.length,1);
});
test('mask groups are separate questions and invalid groups never advance the set revision',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Image question'}),id=s.cards[0].id;
 const masks=[{x:.1,y:.1,width:.2,height:.2},{x:.5,y:.5,width:.2,height:.2}];
 s=await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'independent',occlusions:masks,occlusionGroups:[1,2]});assert.equal(s.review.totalInstances,2);assert.equal(s.cards[0].review.variants[0].occlusions.length,1);
 await f.error('study.review.configure',{setId:s.id,expectedRevision:s.revision,cardId:id,enabled:true,occlusions:masks,occlusionGroups:[0]},'INVALID_PARAMS');assert.equal((await f.get()).revision,s.revision);
});
test('batch review supports branches/filters, literal templates, removal and complete rollback',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Parent',text:'One',tags:['exam']}),a=s.cards[0].id;
 s=await f.change('study.note.create',{title:'Child',text:'Two',parentId:a,tags:['exam']});s=await f.change('study.note.create',{title:'Other',text:'Three'});
 s=await f.change('study.deck.create',{title:'考试'});const deckId=s.decks[0].id;
 s=await f.change('study.review.batch',{cardIds:[a],descendants:true,patch:{enabled:true,deckId,frontTemplate:'What is {title}?',backTemplate:'{text} / {note}'}});assert.equal(s.lastReviewBatch.count,2);assert.equal(s.review.total,2);assert.equal(s.cards[0].review.front,'What is Parent?');
 const before=s.revision;await f.error('study.review.batch',{setId:s.id,expectedRevision:before,patch:{frontTemplate:''}},'INVALID_PARAMS');assert.equal((await f.get()).revision,before);
 s=await f.change('study.review.batch',{filter:{tags:['exam']},patch:{enabled:false}});assert.equal(s.review.total,0);s=await f.change('study.undo');assert.equal(s.review.total,2);
});
test('scheduled sessions persist reveal/order/cursor, require reveal, reject regrading and undo their last answer',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'A',text:'Answer A'});s=await f.change('study.note.create',{title:'B',text:'Answer B'});
 s=await f.change('study.review.batch',{patch:{enabled:true}});s=await f.change('study.review.session.start',{mode:'scheduled',sort:'title'});
 const sessionId=s.reviewSession.id,first=s.reviewSession.current.cardId;assert.equal(s.reviewSession.total,2);assert.equal(s.reviewSession.current.back,null);
 await f.error('study.review.session.action',{setId:s.id,expectedRevision:s.revision,sessionId,action:'grade',rating:'good'},'ANSWER_HIDDEN');
 s=await f.change('study.review.session.action',{sessionId,action:'reveal'});assert.equal(s.reviewSession.current.back,'A\n\nAnswer A');
 const stale=s.revision;s=await f.change('study.review.session.action',{sessionId,action:'grade',rating:'easy'});assert.equal(s.reviewSession.completed,1);assert.equal(s.reviewSession.index,1);
 await f.error('study.review.session.action',{setId:s.id,expectedRevision:stale,sessionId,action:'grade',rating:'easy'},'CONFLICT');
 s=await f.change('study.review.session.action',{sessionId,action:'previous'});s=await f.change('study.review.session.action',{sessionId,action:'reveal'});
 await f.error('study.review.session.action',{setId:s.id,expectedRevision:s.revision,sessionId,action:'grade',rating:'easy'},'ALREADY_REVIEWED');
 s=await f.change('study.undo');assert.equal(s.cards.find(c=>c.id===first).review.logs.length,0);assert.equal(s.reviewSession.completed,0);assert.equal(s.reviewSession.revealed,true);
 const stateFile=f.workspace+'/.margin-reader/state.json',before=await fs.readFile(stateFile);
 const {createPlugin}=require('../runtime.cjs'),second=await createPlugin({workspace:f.workspace});t.after(()=>second.close());const response=await second.request({jsonrpc:'2.0',id:1,method:'study.review.session.get',params:{setId:s.id}});assert.equal(response.result.session.id,sessionId);assert.equal(response.result.session.revealed,true);assert.deepEqual(await fs.readFile(stateFile),before);
});
test('deterministic practice can include unscheduled notes and never modifies real FSRS records',async t=>{
 const f=await fixture(t);for(const title of ['A','B','C'])await f.change('study.note.create',{title,text:'Body '+title});
 let s=await f.change('study.review.session.start',{mode:'practice',sort:'random',seed:'fixed'});const order=s.reviewSession.entries.map(e=>e.key);
 s=await f.change('study.review.session.action',{action:'reveal'});s=await f.change('study.review.session.action',{action:'grade',rating:'good'});assert.equal(s.reviewSession.completed,1);assert(s.cards.every(c=>!c.review));
 s=await f.change('study.review.session.start',{mode:'practice',sort:'random',seed:'fixed'});assert.deepEqual(s.reviewSession.entries.map(e=>e.key),order);
 s=await f.change('study.review.session.action',{action:'favorite'});assert(s.cards.find(c=>c.id===s.reviewSession.current.cardId).favorite);
 assert.equal((await f.api('study.review.log',{setId:s.id})).total,0);
});
test('document/map recall and local presentation are persistent without changing card content or map geometry',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'One',text:'First'});s=await f.change('study.note.create',{title:'Two',text:'Second'});const id=s.cards[0].id,original=JSON.stringify(s.cards),map=JSON.stringify(await f.api('study.map.geometry',{setId:s.id}));
 s=await f.change('study.recall.set',{enabled:true,mode:'mask',scope:'both'});s=await f.change('study.recall.reveal',{cardId:id});assert.deepEqual(s.recall.revealedIds,[id]);
 s=await f.change('study.undo');assert.deepEqual(s.recall.revealedIds,[]);s=await f.change('study.recall.set',{enabled:false});
 s=await f.change('study.presentation.start',{cardIds:s.cards.map(c=>c.id)});assert.equal(s.presentation.index,0);s=await f.change('study.presentation.action',{action:'next'});assert.equal(s.presentation.index,1);
 await f.error('study.presentation.action',{setId:s.id,expectedRevision:s.revision,action:'next'},'INVALID_PARAMS');s=await f.change('study.presentation.action',{action:'stop'});assert.equal(s.presentation.enabled,false);assert.equal(JSON.stringify(s.cards),original);assert.deepEqual((await f.api('study.map.geometry',{setId:s.id})).positions,JSON.parse(map).positions);
});
