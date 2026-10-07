'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setup}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Review faces'});return {...f,get:()=>f.api('study.get',{setId:set.id}),change:async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p}),set:()=>set,render:cardId=>f.api('study.review.render',{setId:set.id,cardId})};}
test('new review cards use live title/full content while explicit old questions and answers remain independent',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Question',text:'**Body**'});const id=s.cards[0].id;
 await f.change('study.card.update',{cardId:id,note:'Context'});await f.change('study.comment.add',{cardId:id,text:'Explanation'});
 s=await f.change('study.review.configure',{cardId:id,enabled:true});assert.equal(s.cards[0].review.backMode,'card');assert.equal(s.cards[0].review.frontMode,'title');
 let face=await f.render(id);assert.equal(face.front.text,'Question');assert.equal(face.back.text,'Question\n\n**Body**\n\nContext\n\nExplanation');assert.match(face.back.html,/<strong>Body/);
 await f.change('study.card.update',{cardId:id,title:'Updated question',text:'Updated body'});face=await f.render(id);assert.equal(face.front.text,'Updated question');assert.match(face.back.text,/Updated body/);
 await f.change('study.review.configure',{cardId:id,enabled:true,front:'Separate question',back:'Separate answer'});await f.change('study.card.update',{cardId:id,text:'Third body'});face=await f.render(id);assert.equal(face.front.text,'Separate question');assert.equal(face.back.text,'Separate answer');assert.equal((await f.get()).cards[0].text,'Third body');
});
test('sided comments/media and handwriting are filtered correctly and remain versioned/undoable',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Faces',text:'Content'}),id=s.cards[0].id;
 await f.change('study.comment.add',{cardId:id,text:'Hint',reviewSide:'front'});await f.change('study.comment.add',{cardId:id,text:'Solution',reviewSide:'back'});await f.change('study.comment.add',{cardId:id,text:'Shared',reviewSide:'both'});
 const {createCanvas}=require('@napi-rs/canvas'),png=(await createCanvas(10,10).encode('png')).toString('base64');await f.change('study.media.import',{cardId:id,target:'comment',kind:'image',contentBase64:png,reviewSide:'front'});
 s=await f.change('study.card.ink.add',{cardId:id,reviewSide:'front',points:[[.1,.1],[.4,.5]],color:'blue',width:.01});let face=await f.render(id);
 assert.deepEqual(face.front.comments.slice(0,2).map(c=>c.text),['Hint','Shared']);assert(face.front.comments.at(-1).media.asset);assert.deepEqual(face.back.comments.map(c=>c.text),['Solution','Shared']);assert.equal(face.frontInk.length,1);assert.equal(face.ink.length,0);
 const revision=s.revision,comment=s.cards[0].comments[0];s=await f.change('study.comment.update',{cardId:id,commentId:comment.id,reviewSide:'back'});face=await f.render(id);assert(face.back.comments.some(c=>c.text==='Hint'));await f.error('study.comment.update',{setId:s.id,expectedRevision:revision,cardId:id,commentId:comment.id,text:'Stale'},'CONFLICT');await f.change('study.undo');assert(!(await f.render(id)).back.comments.some(c=>c.text==='Hint'));
});
test('sequential cloze groups reveal in numeric order, persist over restart and cannot be graded early',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Grouped',text:'Original context'}),id=s.cards[0].id;
 s=await f.change('study.review.configure',{cardId:id,enabled:true,cloze:'{{c10::Ten}} / {{c2::Deux::French}} / {{c1::一}} / {{c1::One}}'});assert.equal(s.review.totalInstances,1);
 s=await f.change('study.review.session.start',{mode:'scheduled'});assert.deepEqual(s.reviewSession.current.groups,['c1','c2','c10']);
 s=await f.change('study.review.session.action',{action:'reveal'});assert.match(s.reviewSession.current.front,/一.*One/);assert.match(s.reviewSession.current.front,/\[ French \]/);assert.equal(s.reviewSession.revealed,false);assert.equal(s.reviewSession.current.back,null);
 await f.error('study.review.session.action',{setId:s.id,expectedRevision:s.revision,action:'grade',rating:'good'},'ANSWER_HIDDEN');
 const other=await require('../runtime.cjs').createPlugin({workspace:f.workspace});t.after(()=>other.close());const read=await other.request({jsonrpc:'2.0',id:1,method:'study.review.session.get',params:{setId:s.id}});assert.deepEqual(read.result.session.current.revealedGroups,['c1']);
 s=await f.change('study.review.session.action',{action:'reveal'});assert.match(s.reviewSession.current.front,/Deux/);assert.match(s.reviewSession.current.front,/\[ … \]/);
 s=await f.change('study.review.session.action',{action:'reveal'});assert(s.reviewSession.revealed);assert.match(s.reviewSession.current.back,/Original context/);
 s=await f.change('study.review.session.action',{action:'grade',rating:'easy'});assert.equal(s.cards[0].review.logs.length,1);s=await f.change('study.undo');assert(s.reviewSession.revealed);assert.equal(s.cards[0].review.logs.length,0);
 s=await f.change('study.review.session.action',{action:'reveal',revealed:false});assert.deepEqual(s.reviewSession.current.revealedGroups,[]);assert.equal(s.reviewSession.current.back,null);
});
test('image groups reveal together and side rendering rejects stale session identities',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Image groups'}),id=s.cards[0].id;
 const masks=[{x:0,y:0,width:.2,height:.2},{x:.3,y:.3,width:.2,height:.2},{x:.6,y:.6,width:.2,height:.2}];
 await f.change('study.review.configure',{cardId:id,enabled:true,occlusions:masks,occlusionGroups:[2,1,1]});s=await f.change('study.view.set',{view:'review'});assert.equal(s.reviewSession.total,1);
 s=await f.change('study.review.session.action',{action:'reveal'});assert.equal(s.reviewSession.current.occlusions.length,1);assert.equal(s.reviewSession.current.occlusions[0].x,0);
 const render=await f.api('study.review.render',{setId:s.id,cardId:id,sessionId:s.reviewSession.id});assert.equal(render.occlusions.length,1);
 await f.error('study.review.render',{setId:s.id,cardId:id,sessionId:'wrong-session'},'CONFLICT');
 s=await f.change('study.review.session.action',{action:'reveal'});assert.equal(s.reviewSession.current.occlusions.length,0);assert(s.reviewSession.revealed);
});
test('switching group modes preserves individual schedules and read-only rendering does not migrate legacy data',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Legacy',text:'Body'}),id=s.cards[0].id;
 await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'independent',cloze:'{{c1::A}} {{c2::B}}'});s=await f.change('study.review.grade',{cardId:id,variantId:'c1',rating:'easy'});const first=s.cards[0].review.variants[0].schedule;
 s=await f.change('study.review.configure',{cardId:id,enabled:true,cloze:'{{c2::B}}'});assert.deepEqual(s.cards[0].review.variantArchive.c1.schedule,first);s=await f.change('study.review.configure',{cardId:id,enabled:true,cloze:'{{c1::A}} {{c2::B}}'});assert.deepEqual(s.cards[0].review.variants[0].schedule,first);
 s=await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'sequential'});assert.equal(s.review.totalInstances,1);assert.equal(s.cards[0].review.variantArchive.c1.logs.length,1);
 s=await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'independent'});assert.deepEqual(s.cards[0].review.variants[0].schedule,first);
 const file=f.workspace+'/.margin-reader/state.json',state=JSON.parse(await fs.readFile(file));const c=state.studySets[s.id].cards[0];delete c.review.frontMode;delete c.review.backMode;delete c.review.revealMode;c.review.front='Old';c.review.back='Answer';delete c.review.variants;c.review.cloze='';const bytes=JSON.stringify(state);await fs.writeFile(file,bytes);const face=await f.render(id);assert.equal(face.front.text,'Old');assert.equal(face.back.text,'Answer');assert.equal(await fs.readFile(file,'utf8'),bytes);
});
test('Anki export preserves live source fields, sided annotations, formula syntax and independent group identities',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Current title',text:'**Current body** $x^2$'}),id=s.cards[0].id;
 await f.change('study.comment.add',{cardId:id,text:'Front-only-hint',reviewSide:'front'});await f.change('study.comment.add',{cardId:id,text:'Back-only-context',reviewSide:'back'});await f.change('study.review.configure',{cardId:id,enabled:true});await f.change('study.card.update',{cardId:id,title:'Updated title'});
 await f.api('study.export.file',{setId:s.id,format:'apkg',path:'faces.apkg'});const zip=await require('jszip').loadAsync(await fs.readFile(f.workspace+'/faces.apkg')),file=f.workspace+'/check.sqlite';await fs.writeFile(file,await zip.file('collection.anki2').async('nodebuffer'));const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file);try{const fields=db.prepare('SELECT flds FROM notes').get().flds.split('\x1f');assert.match(fields[0],/Updated title/);assert.match(fields[0],/Front-only-hint/);assert(!fields[0].includes('Back-only-context'));assert.match(fields[1],/Current body/);assert.match(fields[1],/Back-only-context/);assert(!fields[1].includes('Front-only-hint'));assert(fields[1].includes('\\(x^2\\)'));}finally{db.close();}
 s=await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'independent',cloze:'{{c1::One}} and {{c2::Two}}'});const exported=await f.api('study.export.file',{setId:s.id,format:'apkg',path:'groups.apkg'});assert.equal(exported.notes,2);
});
test('workspace defaults affect new cards and previews without changing existing question rules',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Old title',text:'Old content'}),old=s.cards[0].id;await f.change('study.review.configure',{cardId:old,enabled:true});
 await f.api('settings.set',{reviewDefaultFront:'card',reviewDefaultReveal:'independent'});s=await f.change('study.note.create',{title:'New title',text:'New content'});const id=s.cards.at(-1).id;assert.equal((await f.render(id)).frontMode,'card');
 s=await f.change('study.review.configure',{cardId:id,enabled:true,cloze:'{{c1::A}} and {{c2::B}}'});assert.equal(s.cards.find(c=>c.id===id).review.frontMode,'card');assert.equal(s.cards.find(c=>c.id===id).review.variants.length,2);assert.equal(s.cards.find(c=>c.id===old).review.frontMode,'title');
});
test('text and image masks with the same group number reveal together without disclosing later groups',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Mixed groups'}),id=s.cards[0].id;await f.change('study.review.configure',{cardId:id,enabled:true,cloze:'{{c1::Text A}} {{c2::Text B}}',occlusions:[{x:0,y:0,width:.2,height:.2},{x:.4,y:.4,width:.2,height:.2}],occlusionGroups:[1,2]});
 s=await f.change('study.review.session.start',{});assert.deepEqual(s.reviewSession.current.groups,['c1','c2']);s=await f.change('study.review.session.action',{action:'reveal'});assert.match(s.reviewSession.current.front,/Text A/);assert(!s.reviewSession.current.front.includes('Text B'));assert.equal(s.reviewSession.current.occlusions.length,1);assert.equal(s.reviewSession.current.occlusions[0].x,.4);assert.equal(s.reviewSession.revealed,false);
});
test('portable study validation accepts sided content and rejects corrupt archived scheduling state',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Portable'}),id=s.cards[0].id;await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'independent',cloze:'{{c1::A}} {{c2::B}}'});s=await f.change('study.review.configure',{cardId:id,enabled:true,revealMode:'sequential'});await f.change('study.comment.add',{cardId:id,text:'Hint',reviewSide:'front'});
 const disk=JSON.parse(await fs.readFile(f.workspace+'/.margin-reader/state.json','utf8')).studySets[s.id],validate=require('../lib/study-package.cjs').validateSet;assert.doesNotThrow(()=>validate(disk));disk.cards[0].review.variantArchive.c1.schedule.due='invalid';assert.throws(()=>validate(disk),e=>e.code==='INVALID_PACKAGE');
});

test('bulk question extraction preserves explicitly customized fronts while an explicit template can replace them',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Original',text:'Body'}),id=s.cards[0].id;await f.change('study.review.configure',{cardId:id,enabled:true,front:'Manual question'});s=await f.change('study.review.batch',{cardIds:[id],patch:{frontMode:'card'}});assert.equal((await f.render(id)).front.text,'Manual question');assert.deepEqual(s.lastReviewBatch.preservedFronts,[id]);await f.change('study.review.batch',{cardIds:[id],patch:{frontTemplate:'Updated {title}'}});assert.equal((await f.render(id)).front.text,'Updated Original');
});
