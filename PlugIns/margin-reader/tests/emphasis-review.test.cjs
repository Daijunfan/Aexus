'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{randomUUID}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Emphasis'});return {...f,get:()=>f.api('study.get',{setId:set.id}),change:async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p}),set:()=>set};}
test('text and comment emphasis remain separate from content, generate named sequential groups, and survive reopen',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Geography',text:'Paris and France'}),id=s.cards[0].id;
 await f.change('study.comment.add',{cardId:id,text:'Europe is a continent'});const comment=f.set().cards[0].comments[0];
 const marks=[{field:'text',start:0,end:5,quote:'Paris',group:'Step 2'},{field:'text',start:10,end:16,quote:'France',group:'Step 10'},{field:'comment:'+comment.id,start:0,end:6,quote:'Europe',group:'Step 1'}];
 s=await f.change('study.card.emphasis.set',{cardId:id,text:marks});assert.equal(s.cards[0].review,undefined);assert.equal(s.cards[0].text,'Paris and France');
 const rich=await f.api('study.card.render',{setId:s.id,cardId:id});assert.match(rich.html,/<mark>Paris<\/mark>/);assert.match(rich.comments[0].html,/<mark>Europe/);
 s=await f.change('study.review.generate',{cardIds:[id]});assert.deepEqual(s.cards[0].review.groupNames,{'1':'Step 1','2':'Step 2','3':'Step 10'});
 s=await f.change('study.review.session.start',{});assert(!s.reviewSession.current.front.includes('Paris'));assert(!s.reviewSession.current.front.includes('Europe'));
 s=await f.change('study.review.session.action',{action:'reveal'});assert.match(s.reviewSession.current.front,/Europe/);assert(!s.reviewSession.current.front.includes('Paris'));
 s=await f.change('study.review.session.action',{action:'reveal'});assert.match(s.reviewSession.current.front,/Paris/);assert(!s.reviewSession.current.front.includes('France'));
 await f.runtime.close();const reopened=await require('../runtime.cjs').createPlugin({workspace:f.workspace});try{const reply=await reopened.request({jsonrpc:'2.0',id:1,method:'study.review.session.get',params:{setId:s.id}});assert.deepEqual(reply.result.session.current.revealedGroups,['c1','c2']);}finally{await reopened.close();}
});
test('stale/overlapping selections reject atomically and empty bulk cards are skipped without changing prior questions',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'One',text:'alpha beta'}),id=s.cards[0].id;
 const mark={field:'text',start:0,end:5,quote:'alpha',group:'1'};await f.change('study.card.emphasis.set',{cardId:id,text:[mark]});
 await f.error('study.card.emphasis.set',{setId:s.id,expectedRevision:f.set().revision,cardId:id,text:[mark,{...mark,start:1,end:5,quote:'lpha'}]},'INVALID_PARAMS');
 s=await f.change('study.note.create',{title:'Unmarked'});const second=s.cards[1].id;await f.change('study.review.configure',{cardId:second,enabled:true,front:'Keep this',back:'Keep that'});
 s=await f.change('study.review.generate',{});assert.equal(s.lastReviewBatch.count,1);assert.equal(s.lastReviewBatch.skipped[0].cardId,second);assert.equal(s.cards[1].review.front,'Keep this');
 await f.change('study.card.update',{cardId:id,text:'changed beta'});assert(!(await f.api('study.card.render',{setId:s.id,cardId:id})).html.includes('<mark>'));
 await f.error('study.review.generate',{setId:s.id,expectedRevision:f.set().revision,cardIds:[id]},'NO_EMPHASIS');
 await f.error('study.card.emphasis.set',{setId:s.id,expectedRevision:f.set().revision,cardId:id,text:[mark]},'SOURCE_CHANGED');
});
test('image emphasis and card highlighters project from the card frame and respect rules/layers with undo',async t=>{
 const f=await fixture(t),canvas=require('@napi-rs/canvas').createCanvas(160,80);let s=await f.change('study.media.import',{kind:'image',title:'Image',contentBase64:(await canvas.encode('png')).toString('base64')}),id=s.cards[0].id;
 await f.change('study.card.emphasis.set',{cardId:id,images:[{x:.1,y:.2,width:.2,height:.3,group:'Second'}]});
 await f.change('study.card.ink.add',{cardId:id,points:[[.3,.4],[.6,.4]],color:'yellow',brush:'highlighter',width:.02,imageBound:false,imageBounds:{x:.1,y:.2,width:.8,height:.5},aspectRatio:1});
 s=await f.change('study.review.generate',{cardIds:[id]});assert.equal(s.cards[0].review.occlusions.length,2);const projected=s.cards[0].review.occlusions[1];assert(Math.abs(projected.x-.2375)<1e-8);assert(Math.abs(projected.y-.38)<1e-8);
 s=await f.change('study.review.generate',{cardIds:[id],rules:{cardHighlighter:false}});assert.equal(s.cards[0].review.occlusions.length,1);
 s=await f.change('study.undo',{});assert.equal(s.cards[0].review.occlusions.length,2);
 const disk=JSON.parse(await fs.readFile(f.workspace+'/.margin-reader/state.json','utf8'));assert.doesNotThrow(()=>require('../lib/study-package.cjs').validateSet(disk.studySets[s.id]));
});
test('real PDF excerpts retain crop transforms and project only matching visible document highlighters',async t=>{
 const f=await fixture(t);await fs.writeFile(f.workspace+'/book.pdf',pdfFixture());const doc=await f.api('document.open',{path:'book.pdf'});let s=await f.change('study.documents.add',{paths:['book.pdf']});
 const captured=await f.api('study.card.create',{setId:s.id,expectedRevision:s.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'',color:'yellow',title:'PDF question',locator:{page:1},selection:{rects:[{page:1,x:.05,y:.04,width:.7,height:.12}]}});const id=captured.card.id;
 // Capture returns a different result shape, so continue against the actual current revision.
 const change=async(m,p)=>{s=await f.get();return s=await f.api(m,{setId:s.id,expectedRevision:s.revision,...p});};
 assert.equal(captured.card.image.fragments.length,1);
 await change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,.09],[.4,.09]],width:.012,color:'yellow',brush:'highlighter'});
 await change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:2,points:[[.1,.09],[.4,.09]],width:.012,color:'yellow',brush:'highlighter'});
 s=await change('study.review.generate',{cardIds:[id]});const masks=s.cards[0].review.occlusions;assert.equal(masks.length,1);const f0=captured.card.image.fragments[0],expectedX=f0.image.x+(.094-f0.source.x)/f0.source.width*f0.image.width;assert(Math.abs(masks[0].x-expectedX)<1e-8);
 await change('study.ink.batch',{scope:'document',strokeIds:[s.ink[0].id],action:'transform',hidden:true});
 await f.error('study.review.generate',{setId:s.id,expectedRevision:s.revision,cardIds:[id]},'NO_EMPHASIS');
});
