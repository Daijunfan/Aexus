'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Local organization'});const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});return {...f,change,get:async()=>set=await f.api('study.get',{setId:set.id})};}
test('batch edits are atomic, validate every field, preserve parents and support undo',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'A',text:'First',tags:['alpha']});const a=s.cards[0].id;
  s=await f.change('study.note.create',{title:'B',text:'Second',parentId:a});const b=s.cards[1].id;
  const before=s.revision;s=await f.change('study.cards.batch',{cardIds:[a],descendants:true,patch:{color:'#296ca8',addTags:['beta'],favorite:true}});
  assert(s.cards.every(c=>c.color==='#296ca8'&&c.favorite&&c.tags.includes('beta')));assert.equal(s.cards[1].parentId,a);assert.equal(s.colors['#296ca8'],'#296ca8');
  await f.error('study.cards.batch',{setId:s.id,expectedRevision:before,cardIds:[a],patch:{favorite:false}},'CONFLICT');
  await f.error('study.cards.batch',{setId:s.id,expectedRevision:s.revision,cardIds:[a,b],patch:{color:'<script>'}},'INVALID_PARAMS');
  assert.equal((await f.get()).revision,s.revision);s=await f.change('study.undo');assert(!s.cards[0].favorite);assert.equal(s.cards[1].parentId,a);
});
test('smart boards support union/intersection, grouping, pagination, materialization and reversible definitions',async t=>{
  const f=await fixture(t);let s;
  for(const [title,tags,color] of [['A',['x','y'],'red'],['B',['x'],'blue'],['C',['y'],'red']])s=await f.change('study.note.create',{title,tags,color});
  const q=p=>f.api('study.board.query',{setId:s.id,...p});
  assert.equal((await q({filter:{tags:['x','y'],tagMode:'all'}})).total,1);
  assert.equal((await q({filter:{tags:['x','y'],tagMode:'any'}})).total,3);
  assert.equal((await q({filter:{all:[{colors:['red']},{not:{tags:['x']}}]}})).cards[0].title,'C');
  const page=await q({filter:{any:[{colors:['red']},{tags:['x']}]},groupBy:['color','tag'],sort:'title',limit:2});assert.equal(page.total,3);assert.equal(page.nextOffset,2);assert(page.groups.length===2);
  assert.equal((await q({sort:'title',offset:2,limit:2})).cards[0].title,'C');
  s=await f.change('study.board.save',{title:'Red cards',filter:{colors:['red']},groupBy:['color']});const board=s.boards[0];
  s=await f.change('study.board.materialize',{boardId:board.id});const refs=s.cards.filter(c=>c.reference);assert.equal(refs.length,2);assert(refs.every(c=>c.reference.setId===s.id));
  s=await f.change('study.board.remove',{boardId:board.id});assert.equal(s.boards.length,0);s=await f.change('study.undo');assert.equal(s.boards[0].id,board.id);
  await f.error('study.board.query',{setId:s.id,filter:{unknown:true}},'INVALID_PARAMS');
});
test('cross-branch summaries keep existing parent relationships while split notes preserve their source card',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'A',text:'one\n\ntwo\n\nthree'});const a=s.cards[0].id;
  s=await f.change('study.note.create',{title:'B'});const b=s.cards[1].id;
  s=await f.change('study.summary.create',{cardIds:[a,b],title:'Summary',text:'Synthesis'});assert.equal(s.cards.find(c=>c.id===a).parentId,null);assert.equal(s.cards.find(c=>c.id===b).parentId,null);assert.equal(s.links.length,2);
  const offsets=[10,5];s=await f.change('study.card.split',{cardId:a,offsets});assert.deepEqual(offsets,[10,5]);assert.equal(s.cards.find(c=>c.id===a).splitIds.length,3);assert.equal(s.cards.find(c=>c.id===a).text,'one\n\ntwo\n\nthree');
});
test('document and TOC organization reuses stable scaffolds and routes excerpts to their source chapter',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());let s=await f.change('study.documents.add',{paths:['book.pdf']});const doc=await f.api('document.open',{path:'book.pdf'});
  const c=await f.api('study.card.create',{setId:s.id,expectedRevision:s.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'Chapter two',color:'blue',locator:{page:2}});await f.get();
  s=await f.change('study.cards.organize',{cardIds:[c.card.id],by:'toc'});const excerpt=s.cards.find(n=>n.id===c.card.id),parent=s.cards.find(n=>n.id===excerpt.parentId);assert.equal(parent.title,'Chapter Two');
  const count=s.cards.length,scaffold=s.cards.filter(n=>n.outlineSource).map(n=>n.id);s=await f.change('study.cards.organize',{cardIds:[c.card.id],by:'toc'});assert.equal(s.cards.length,count);assert.deepEqual(s.cards.filter(n=>n.outlineSource).map(n=>n.id),scaffold);
});
test('capture presets apply tags, map state, style, automatic grouping and review inside one transaction',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());let s=await f.change('study.documents.add',{paths:['book.pdf']});const doc=await f.api('document.open',{path:'book.pdf'});
  s=await f.change('study.capture.settings',{tags:['automatic'],inMap:false,annotationStyle:'underline',review:true});
  const create=()=>f.api('study.card.create',{setId:s.id,expectedRevision:s.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'Question and answer',color:'teal',locator:{page:1}});
  const result=await create();s=await f.get();const c=s.cards.find(c=>c.id===result.card.id);assert.equal(c.inMap,false);assert.deepEqual(c.tags,['automatic']);assert.equal(c.annotation.style,'underline');assert(c.review.enabled);
  s=await f.change('study.capture.settings',{inMap:true,organize:'toc'});const next=await create();s=await f.get();assert(s.cards.find(c=>c.id===next.card.id).parentId);
});
test('copying a source card carries its durable PNG, independent IDs and explicit destination revision',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());let s=await f.change('study.documents.add',{paths:['book.pdf']});const doc=await f.api('document.open',{path:'book.pdf'});
  const c=await f.api('study.card.create',{setId:s.id,expectedRevision:s.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'snapshot',color:'blue',locator:{page:1}});s=await f.get();
  const destination=await f.api('study.create',{title:'Other'});
  await f.error('study.cards.copy',{setId:s.id,expectedRevision:s.revision,cardIds:[c.card.id],targetSetId:destination.id,targetRevision:0},'INVALID_PARAMS');
  s=await f.change('study.cards.copy',{cardIds:[c.card.id],targetSetId:destination.id,targetRevision:destination.revision});
  const other=await f.api('study.get',{setId:destination.id}),copy=other.cards[0];assert.notEqual(copy.id,c.card.id);assert.equal(copy.source.documentId,c.card.source.documentId);
  assert.deepEqual(await f.api('study.card.image',{setId:s.id,cardId:c.card.id}),await f.api('study.card.image',{setId:other.id,cardId:copy.id}));
  await f.api('study.undo',{setId:other.id,expectedRevision:other.revision});assert.equal((await f.api('study.get',{setId:other.id})).cards.length,0);assert.equal((await f.get()).cards.length,1);
});
test('submap boundaries can be entered, renamed and restored; source linkage selects the nearest submap',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'Parent',submap:true});const root=s.cards[0].id;
  s=await f.change('study.note.create',{title:'Inside',parentId:root});const child=s.cards[1].id;
  assert.equal(s.submaps[0].id,root);s=await f.change('study.submap.open',{cardId:root});assert.equal(s.map.submapId,root);
  s=await f.change('study.submap.configure',{cardId:root,title:'Renamed'});assert.equal(s.submaps[0].title,'Renamed');
  s=await f.change('study.submap.open',{cardId:null});const selected=await f.api('study.card.activate',{setId:s.id,cardId:child,origin:'document'});assert.equal(selected.set.map.submapId,root);await f.get();
  s=await f.change('study.submap.configure',{cardId:root,enabled:false});assert.equal(s.map.submapId,null);assert.equal(s.cards.find(c=>c.id===child).parentId,root);
});
test('all ten branch styles lay out complete mixed-size branches without overlapping cards',async()=>{
  const {layoutStudy,branchPath}=await import('../ui/study-map-layout.mjs');
  const cards=[{id:'root',parentId:null},...Array.from({length:5},(_,i)=>({id:'c'+i,parentId:'root',style:{width:180+i*20,height:150+i*12}})),{id:'deep',parentId:'c2'}];
  for(const branchStyle of require('../lib/study-organize.cjs').STYLES){const layout=layoutStudy(cards,{branchStyle});assert.equal(layout.positions.size,cards.length);assert(layout.width>0&&layout.height>0);
    const all=[...layout.positions.values()];for(const p of all)assert([p.x,p.y,p.width,p.height].every(Number.isFinite));
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,branchStyle+' overlap');}
    for(const link of layout.links)assert(!/NaN|Infinity/.test(branchPath(layout.positions.get(link.from),layout.positions.get(link.to),link.style)));
  }
  const boundary=cards.map(c=>c.id==='c2'?{...c,submap:true}:c);assert(!layoutStudy(boundary).positions.has('deep'));assert(layoutStudy(boundary,{submapId:'c2'}).positions.has('deep'));
});
test('free root movement, sibling sort and style metadata are persisted and reversible',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'Z'});const z=s.cards[0].id;s=await f.change('study.note.create',{title:'A'});
  s=await f.change('study.card.position',{cardId:z,x:900,y:450});assert.deepEqual(s.cards.find(c=>c.id===z).position,{x:900,y:450});
  s=await f.change('study.cards.sort',{by:'title'});assert.equal(s.cards[0].title,'A');
  s=await f.change('study.appearance.set',{branchStyle:'frame',cardStyle:{fontFamily:'serif',fontSize:20,width:300,height:260},paper:'grid'});assert.equal(s.appearance.fontSize,20);assert.equal(s.map.branchStyle,'frame');
  await f.error('study.appearance.set',{setId:s.id,expectedRevision:s.revision,cardStyle:{fontSize:1000}},'INVALID_PARAMS');
  s=await f.change('study.undo');assert.equal(s.appearance.fontSize,undefined);
});
