'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
const V=require('../lib/mindmap-model.cjs');
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'知识体系'});const change=async(m,p={})=>{set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p});return set;};await change('study.mindmap.template.apply',{template:'brainstorm',title:'学习与知识'});return {...f,get set(){return set;},change,refresh:async()=>set=await f.api('study.get',{setId:set.id})};}
const overlaps=(a,b)=>a.x<b.x+b.width-.01&&a.x+a.width>b.x+.01&&a.y<b.y+b.height-.01&&a.y+a.height>b.y+.01;
test('mindmap catalog, all structures and mixed branches preserve complete IDs, finite geometry and nonoverlapping topic boxes',async t=>{
 const f=await fixture(t),c=await f.api('study.mindmap.catalog');assert.equal(Object.keys(c.shapes).length,31);assert.equal(Object.keys(c.arrows).length,11);
 const {layoutStudy}=await import('../ui/study-map-layout.mjs');const original=f.set.cards.map(c=>c.id);
 for(const structure of Object.keys(c.structures)){
  await f.change('study.mindmap.configure',{patch:{structure}});const l=layoutStudy(f.set.cards,f.set.map,f.set.appearance);assert.equal(l.positions.size,original.length,structure);assert.deepEqual([...l.positions.keys()].sort(),[...original].sort());
  const boxes=[...l.positions.values()];for(const [i,b]of boxes.entries()){assert(Object.values(b).every(v=>Number.isFinite(v)),structure);assert(b.x>=0&&b.y>=0&&b.width>0&&b.height>0);for(const a of boxes.slice(i+1))assert(!overlaps(a,b),structure+' overlapping topics');}
  assert.deepEqual([...l.positions],[...layoutStudy(f.set.cards,f.set.map,f.set.appearance).positions],structure+' deterministic');
 }
 await f.change('study.mindmap.topics.update',{cardIds:[f.set.cards[1].id],patch:{structure:'org-down',side:'left',numbering:'hierarchy'}});const l=layoutStudy(f.set.cards,f.set.map,f.set.appearance);assert.equal(l.positions.size,original.length);
 await f.change('study.card.update',{cardId:f.set.cards[1].id,collapsed:true});const collapsed=layoutStudy(f.set.cards,f.set.map);assert(collapsed.positions.size<original.length);await f.change('study.undo');assert.equal(layoutStudy(f.set.cards,f.set.map).positions.size,original.length);
});
test('theme, marker and per-topic style updates are atomic, undoable and reject unknown styles, invalid task dates and stale writers',async t=>{
 const f=await fixture(t),id=f.set.cards[1].id;const original=structuredClone(f.set.cards);
 for(const theme of Object.keys(V.C.themes))await f.change('study.mindmap.configure',{patch:{theme}});
 await f.change('study.mindmap.topics.update',{cardIds:[id],patch:{shape:'hexagon',priority:3,progress:75,status:'doing',symbol:'idea',fill:'#DDEEFF',task:{start:'2026-10-01',due:'2026-10-09',assignee:'Owner'}}});
 assert.equal(f.set.cards.find(c=>c.id===id).mindmap.progress,75);assert.deepEqual(f.set.cards.map(c=>[c.id,c.parentId,c.text,c.color]),original.map(c=>[c.id,c.parentId,c.text,c.color]));
 const rev=f.set.revision;await f.error('study.mindmap.topics.update',{setId:f.set.id,expectedRevision:rev-1,cardIds:[id],patch:{priority:1}},'CONFLICT');
 for(const patch of [{fill:'url(javascript:x)'},{shape:'foreign'},{fontFamily:'x;position:fixed'},{progress:200},{task:{due:'2026-02-30'}},{task:{start:'2026-10-10',due:'2026-01-01'}}])await f.error('study.mindmap.topics.update',{setId:f.set.id,expectedRevision:rev,cardIds:[id],patch},'INVALID_PARAMS');
 assert.equal((await f.refresh()).revision,rev);await f.change('study.undo');assert.equal(f.set.cards.find(c=>c.id===id).mindmap,undefined);await f.change('study.redo');assert.equal(f.set.cards.find(c=>c.id===id).mindmap.shape,'hexagon');
});
test('rich topic ranges retain unicode boundaries and ordinary renaming cannot leave invalid stale ranges',async t=>{
 const f=await fixture(t),id=f.set.cards[0].id;await f.change('study.card.update',{cardId:id,title:'中文🙂 theme'});
 await f.change('study.mindmap.topics.update',{cardIds:[id],patch:{runs:[{start:0,end:4,bold:true,color:'#AA3333'},{start:5,end:10,italic:true}]}});
 await f.error('study.mindmap.topics.update',{setId:f.set.id,expectedRevision:f.set.revision,cardIds:[id],patch:{runs:[{start:0,end:3}]}},'INVALID_PARAMS');
 await f.change('study.card.update',{cardId:id,title:'改名'});assert.equal(f.set.cards[0].mindmap.runs,undefined);await f.change('study.undo');assert.equal(f.set.cards[0].mindmap.runs.length,2);
});
test('boundaries and summaries track topic IDs and removal or undo never deletes their contents',async t=>{
 const f=await fixture(t),root=f.set.cards[0].id,ids=f.set.cards.filter(c=>c.parentId===root).slice(0,2).map(c=>c.id);
 await f.change('study.mindmap.decoration.set',{kind:'boundary',cardIds:ids,style:{title:'核心分组',shape:'rounded',color:'#6677AA'}});const boundary=f.set.lastMindmapDecoration;
 await f.change('study.mindmap.decoration.set',{kind:'summary',cardIds:ids,style:{title:'共同结论'}});const summary=f.set.map.mindmap.items.find(i=>i.kind==='summary'),topic=summary.topicId;await f.change('study.note.create',{title:'验证总结',parentId:topic});
 const {layoutStudy}=await import('../ui/study-map-layout.mjs');let l=layoutStudy(f.set.cards,f.set.map);assert(l.positions.has(topic));assert(l.decorations.some(d=>d.id===summary.id));
 await f.error('study.mindmap.decoration.set',{setId:f.set.id,expectedRevision:f.set.revision,decorationId:summary.id,cardIds:[topic]},'INVALID_PARAMS');
 await f.change('study.mindmap.decoration.remove',{decorationId:summary.id});assert(f.set.cards.some(c=>c.id===topic));assert(f.set.cards.some(c=>c.parentId===topic));await f.change('study.undo');assert(f.set.map.mindmap.items.some(i=>i.id===summary.id));
 await f.change('study.mindmap.decoration.set',{decorationId:boundary,cardIds:ids.slice(0,1),style:{shape:'cloud'}});l=layoutStudy(f.set.cards,f.set.map);assert.equal(l.decorations.find(d=>d.id===boundary).style.shape,'cloud');
});
test('relationship styling and reconnection uses the same guarded revisions and persists line endpoints',async t=>{
 const f=await fixture(t),[a,b,c]=f.set.cards;await f.change('study.link.add',{from:a.id,to:b.id,label:'联系',bidirectional:false});const id=f.set.links.at(-1).id;
 await f.change('study.mindmap.relationship.update',{linkId:id,to:c.id,patch:{color:'#778899',start:'circle-open',end:'diamond',width:3,dash:'solid',bendX:90,bendY:-70}});
 assert.equal(f.set.links.at(-1).to,c.id);assert.equal(f.set.links.at(-1).mindmap.start,'circle-open');await f.error('study.mindmap.relationship.update',{setId:f.set.id,expectedRevision:f.set.revision,linkId:id,to:a.id,patch:{}},'INVALID_PARAMS');await f.change('study.undo');assert.equal(f.set.links.at(-1).to,b.id);
});
test('mindmap data survive complete portable study import with remapped IDs and undo histories',async t=>{
 const f=await fixture(t),root=f.set.cards[0].id,ids=f.set.cards.filter(c=>c.parentId===root).map(c=>c.id);await f.change('study.mindmap.decoration.set',{kind:'boundary',cardIds:ids,style:{title:'保留的外框'}});await f.change('study.mindmap.topics.update',{cardIds:[root],patch:{priority:1,shape:'ellipse'}});
 await f.api('study.package.export',{setId:f.set.id,path:'map.mrpkg'});const imported=await f.api('study.package.import',{path:'map.mrpkg',folder:'imported',activate:false}),next=await f.api('study.get',{setId:imported.setId});
 assert(next.map.mindmap.enabled);assert.equal(next.cards[0].mindmap.shape,'ellipse');assert.notEqual(next.cards[0].id,root);assert(next.map.mindmap.items[0].cardIds.every(id=>next.cards.some(c=>c.id===id)));assert(next.history.canUndo);
});
test('mindmap exports contain every collapsed topic and embedded source image, reject overwrites and preserve original PDF bytes',async t=>{
 const f=await fixture(t),source=pdfFixture();await fs.writeFile(path.join(f.workspace,'source.pdf'),source);await f.change('study.documents.add',{paths:['source.pdf']});const doc=await f.api('document.open',{path:'source.pdf',activate:false});
 const result=await f.api('study.card.create',{setId:f.set.id,expectedRevision:f.set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:require('node:crypto').randomUUID(),color:'yellow',title:'PDF snapshot',text:'',locator:{page:2},selection:{rects:[{page:2,x:.1,y:.06,width:.7,height:.12}]}});await f.refresh();await f.change('study.card.update',{cardId:f.set.cards[0].id,collapsed:true});
 for(const format of ['svg','png','pdf']){const output=await f.api('study.mindmap.export',{setId:f.set.id,expectedRevision:f.set.revision,path:'map.'+format,format});assert.equal(output.topics,f.set.cards.length);assert.equal(output.images,1);const bytes=await fs.readFile(path.join(f.workspace,'map.'+format));assert(bytes.length>100);if(format==='svg'){assert(bytes.toString().includes('data:image/png;base64'));for(const c of f.set.cards)assert(bytes.toString().includes('topic-'+c.id));}if(format==='pdf')assert.equal((await require('pdf-lib').PDFDocument.load(bytes)).getPageCount(),1);await f.error('study.mindmap.export',{setId:f.set.id,expectedRevision:f.set.revision,path:'map.'+format,format},'ALREADY_EXISTS');}
 const g=await f.api('study.map.geometry',{setId:f.set.id});assert(g.positions.find(p=>p.cardId===result.card.id).imageBounds);assert.deepEqual(await fs.readFile(path.join(f.workspace,'source.pdf')),source);
});
