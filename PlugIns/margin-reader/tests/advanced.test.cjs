'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());let set=await f.api('study.create',{title:'Advanced'});set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['book.pdf']});const doc=await f.api('document.open',{path:'book.pdf'});return {...f,doc,get:()=>f.api('study.get',{setId:set.id}),change:async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p}),set};}
test('page composition preserves originals and supports reorder, crop, rotate and blank paper',async t=>{
 const f=await fixture(t),page=n=>({documentId:f.doc.id,expectedSourceVersion:f.doc.sourceVersion,page:n});
 const d=await f.api('pdf.compose',{path:'compiled.pdf',pages:[{...page(2),rotation:90,crop:{x:.1,y:.1,width:.8,height:.8}},{blank:true,paper:'grid'},page(1)],activate:false});assert.equal(d.pageCount,3);assert(d.sections[0].width>d.sections[0].height);assert.match((await f.api('document.content',{id:d.id,page:3})).text,/Introduction/);assert.deepEqual(await fs.readFile(path.join(f.workspace,'book.pdf')),pdfFixture());
 await f.error('pdf.compose',{path:'compiled.pdf',pages:[page(1)]},'ALREADY_EXISTS');await f.error('pdf.compose',{path:'../escape.pdf',pages:[page(1)]},'SCOPE_DENIED');await f.error('pdf.compose',{path:'bad.pdf',pages:[page(99)]},'INVALID_LOCATOR');assert(!await fs.stat(path.join(f.workspace,'bad.pdf')).catch(()=>null));
});
test('layers isolate pressure strokes, lock/hide, transform, merge and undo without loss',async t=>{
 const f=await fixture(t);let s=await f.change('study.layer.create',{title:'练习'}),layerId=s.activeLayer;
 s=await f.change('study.ink.add',{documentId:f.doc.id,expectedSourceVersion:f.doc.sourceVersion,page:1,points:[[.2,.2,.3],[.4,.4,.8]],color:'blue',width:.004});const strokeId=s.ink[0].id;assert.equal(s.ink[0].layerId,layerId);
 s=await f.change('study.layer.update',{layerId,locked:true});await f.error('study.ink.remove',{setId:s.id,expectedRevision:s.revision,strokeId},'LAYER_LOCKED');
 await f.change('study.layer.update',{layerId,locked:false});s=await f.change('study.ink.transform',{strokeIds:[strokeId],dx:.1,dy:.1,color:'pink'});assert.equal(s.ink[0].points[1][0],.5);
 s=await f.change('study.layer.merge',{layerId,targetId:'default'});assert.equal(s.ink[0].layerId,'default');s=await f.change('study.undo');assert.equal(s.ink[0].layerId,layerId);assert(!s.layers.find(l=>l.id===layerId).deletedAt);
});
test('extended notes, composite/summary cards, subtree views and workspace references persist',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'A',text:'**bold** $x^2$'}),a=s.cards[0].id;s=await f.change('study.note.anchor',{cardId:a,documentId:f.doc.id,locator:{page:1,pageOffset:.2},display:'embedded'});assert.equal(s.cards[0].anchorChanged,false);
 const html=await f.api('study.card.render',{setId:s.id,cardId:a});assert.match(html.html,/<strong>bold/);assert.match(html.html,/katex/);
 s=await f.change('study.note.create',{title:'B',text:'Second'});const b=s.cards[1].id;s=await f.change('study.cards.merge',{cardIds:[a,b],title:'Composite'});const group=s.cards.find(c=>c.mergedIds);assert.equal(group.mergedIds.length,2);assert.equal(s.cards.find(c=>c.id===a).parentId,group.id);assert(s.cards.find(c=>c.id===a).anchor);
 s=await f.change('study.map.configure',{layout:'radial',focusId:group.id});assert.equal(s.map.focusId,group.id);
 let other=await f.api('study.create',{title:'Other'});other=await f.api('study.card.reference',{setId:other.id,expectedRevision:other.revision,targetSetId:s.id,targetCardId:a});assert.equal(other.cards[0].referenceAvailable,true);assert.equal((await f.api('study.search',{query:'Composite'})).cards.length,1);
 s=await f.change('study.undo');assert.equal(s.map.focusId,undefined);
});
test('independent comparison position and document tabs do not move the main reader',async t=>{
 const f=await fixture(t);await f.api('reader.position.set',{id:f.doc.id,locator:{page:1}});await f.api('reader.comparison.set',{documentId:f.doc.id,locator:{page:2}});assert.equal((await f.api('reader.position.get',{id:f.doc.id})).locator.page,1);assert.equal((await f.api('settings.get')).comparison.locator.page,2);
 await f.error('reader.comparison.set',{documentId:f.doc.id,locator:{page:99}},'INVALID_LOCATOR');await f.api('reader.tabs.close',{id:f.doc.id});assert.deepEqual((await f.api('settings.get')).openDocuments,[]);
});
test('decks, cloze, image masks, target retention and review statistics are CLI features',async t=>{
 const f=await fixture(t);let s=await f.change('study.deck.create',{title:'考试'}),deckId=s.decks[0].id;s=await f.change('study.note.create',{title:'Q'});const cardId=s.cards[0].id;
 s=await f.change('study.review.configure',{cardId,enabled:true,deckId,cloze:'Paris is in {{France}}.'});assert.equal(s.cards[0].review.front,'Paris is in [ … ].');assert.equal(s.cards[0].review.back,'Paris is in France.');
 s=await f.change('study.review.settings',{retention:.95,maximumInterval:30,deckId});assert.equal(s.review.due,1);s=await f.change('study.review.grade',{cardId,rating:'good'});const stats=await f.api('study.review.stats',{setId:s.id});assert.equal(stats.reviews,1);assert.equal(stats.recallRate,1);
 s=await f.change('study.deck.update',{deckId,deleted:true});assert.equal(s.review.total,0);s=await f.change('study.undo');assert.equal(s.review.total,1);
});
test('card rich text strips executable HTML and dangerous links',()=>{const {render}=require('../lib/card-text.cjs');const html=render('<script>alert(1)</script> [bad](javascript:alert(1)) $\\href{javascript:alert(1)}{x}$');assert(!html.includes('<script'));assert(!html.includes('href="javascript:'));});
test('folding is reversible and page previews address the requested PDF page',async t=>{
 const f=await fixture(t);let d=await f.api('document.fold',{id:f.doc.id,expectedRevision:f.doc.revision,pages:[1]});assert.deepEqual(d.foldedPages,[1]);d=await f.api('document.open',{path:'book.pdf',refresh:true});assert.deepEqual(d.foldedPages,[1]);d=await f.api('document.fold',{id:d.id,expectedRevision:d.revision,pages:[]});assert.deepEqual(d.foldedPages,[]);
 const first=await f.api('document.preview',{path:'book.pdf',page:1}),second=await f.api('document.preview',{path:'book.pdf',page:2});assert.equal(second.page,2);assert.notEqual(first.contentBase64,second.contentBase64);assert.equal((await f.api('document.preview',{path:'book.pdf',page:2})).cacheHit,true);
});
test('card-bound handwriting and automatic title links preserve stable identities',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'知识点',text:'定义'}),a=s.cards[0].id;s=await f.change('study.note.create',{title:'解释',text:'关于知识点的推导'});const b=s.cards[1].id;
 s=await f.change('study.card.ink.add',{cardId:a,points:[[.1,.2],[.7,.6]],color:'blue',width:.01});const stroke=s.cards[0].ink[0];s=await f.change('study.card.move',{cardId:a,parentId:b});assert.equal(s.cards.find(c=>c.id===a).ink[0].id,stroke.id);
 const text=await f.api('study.card.render',{setId:s.id,cardId:b});assert(text.titleLinks.some(l=>l.cardId===a));s=await f.change('study.card.ink.remove',{cardId:a,strokeId:stroke.id});assert.equal(s.cards.find(c=>c.id===a).ink.length,0);s=await f.change('study.undo');assert.equal(s.cards.find(c=>c.id===a).ink.length,1);
});
test('optimizer refuses insufficient history without overwriting preferences',async t=>{const f=await fixture(t);await f.error('study.review.optimize',{setId:f.set.id,expectedRevision:f.set.revision},'INSUFFICIENT_HISTORY');assert.equal((await f.get()).reviewSettings.w,undefined);});
test('local optimizer consumes synthetic across-day observations and persists real FSRS parameters',async t=>{
 const f=await fixture(t),file=path.join(f.workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file));const set=state.studySets[f.set.id],now=Date.now()-100*86400000;
 for(let c=0;c<10;c++)set.cards.push({id:require('node:crypto').randomUUID(),title:'Training '+c,text:'',note:'',tags:[],color:'blue',parentId:null,source:null,image:null,review:{enabled:false,logs:Array.from({length:8},(_,i)=>({rating:(i+c)%5===0?1:3,review:new Date(now+i*86400000*(c%3+1)).toISOString()}))}});
 await fs.writeFile(file,JSON.stringify(state));const s=await f.api('study.review.optimize',{setId:set.id,expectedRevision:set.revision});assert.equal(s.reviewSettings.w.length,21);assert.equal(s.reviewSettings.trainingSamples,70);assert(s.reviewSettings.w.every(Number.isFinite));
});
test('polygon capture stores a real clipped source image and idempotent request data',async t=>{
 const f=await fixture(t),p={setId:f.set.id,expectedRevision:f.set.revision,documentId:f.doc.id,expectedSourceVersion:f.doc.sourceVersion,captureId:require('node:crypto').randomUUID(),text:'',color:'blue',locator:{page:1},selection:{rects:[],polygon:{page:1,points:[[.1,.1],[.8,.1],[.4,.6]]}}};
 const c=await f.api('study.card.create',p);assert.equal(c.card.image.kind,'pdf-lasso');assert.equal(p.selection.rects.length,0);assert.equal((await f.api('study.card.create',p)).duplicate,true);const img=await f.api('study.card.image',{setId:f.set.id,cardId:c.card.id});assert(Buffer.from(img.contentBase64,'base64').length>100);
});
test('free canvas ink remains in world coordinates and joins layer merges without moving cards',async t=>{
 const f=await fixture(t);let s=await f.change('study.layer.create',{title:'脑图批注'});const layerId=s.activeLayer;s=await f.change('study.canvas.ink.add',{points:[[500,200],[560,240]],width:3,color:'purple',layerId});const strokeId=s.canvasInk[0].id;
 s=await f.change('study.layer.merge',{layerId,targetId:'default'});assert.equal(s.canvasInk[0].layerId,'default');s=await f.change('study.canvas.ink.remove',{strokeId});assert.equal(s.canvasInk.length,0);s=await f.change('study.undo');assert.equal(s.canvasInk[0].id,strokeId);
});
test('tab metadata is available without reading or rebuilding parsed document caches',async t=>{
 const f=await fixture(t),settings=await f.api('settings.get');const state=JSON.parse(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')));await fs.rm(path.join(f.workspace,'.margin-reader/cache',state.documents[f.doc.id].cacheKey+'.json'));
 const list=await f.api('document.list',{ids:[f.doc.id]});assert.equal(list.documents[0].title,f.doc.title);assert.equal(list.documents[0].path,'book.pdf');assert.deepEqual(await f.api('settings.get'),settings);
});
