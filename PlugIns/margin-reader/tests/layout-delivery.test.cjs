'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'layout.pdf'),pdfFixture());
 let doc=await f.api('document.open',{path:'layout.pdf',activate:false}),set=await f.api('study.create',{title:'Layout verification'});
 const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.documents.add',{paths:['layout.pdf']});
 const fold=async(method,p={})=>doc=await f.api(method,{id:doc.id,expectedRevision:doc.revision,...p});
 return {...f,getDoc:async()=>doc=await f.api('document.get',{id:doc.id}),getSet:async()=>set=await f.api('study.get',{setId:set.id}),change,fold,doc,set};
}
test('partial page layout is reachable through the public API, persistent, source-scoped and reversible',async t=>{
 const f=await fixture(t);let d=await f.fold('document.region.set',{page:1,start:.2,end:.4});const region=d.foldRegions[0];
 assert.equal(d.layoutHistory.canUndo,true);assert.equal(region.sourceChanged,false);
 let layout=await f.api('document.layout.get',{id:d.id,page:1,width:612});assert(layout.blocks.some(b=>b.type==='fold'));
 d=await f.fold('document.layout.undo');assert.deepEqual(d.foldRegions,[]);
 d=await f.fold('document.layout.redo');assert.equal(d.foldRegions[0].id,region.id);
 await f.error('document.region.set',{id:d.id,expectedRevision:d.revision,page:1,start:.3,end:.5},'INVALID_PARAMS');
 assert.equal((await f.getDoc()).revision,d.revision);
 d=await f.api('document.open',{path:'layout.pdf',refresh:true,activate:false});assert.equal(d.foldRegions[0].id,region.id);
 await f.getDoc();d=await f.fold('document.region.remove',{regionId:region.id});assert.equal(d.foldRegions.length,0);
 d=await f.fold('document.layout.undo');assert.equal(d.foldRegions[0].id,region.id);
 await fs.appendFile(path.join(f.workspace,'layout.pdf'),'\n% externally changed');
 await f.error('document.region.set',{id:d.id,expectedRevision:d.revision,regionId:region.id,folded:false},'SOURCE_CHANGED');
 d=await f.api('document.open',{path:'layout.pdf',refresh:true,activate:false});assert.equal(d.foldRegions[0].sourceChanged,true);
 layout=await f.api('document.layout.get',{id:d.id,page:1,width:612});assert(!layout.blocks.some(b=>b.type==='fold'));
});
test('whole-page and chapter folds share undo history and exact source activation unfolds only its target',async t=>{
 const f=await fixture(t);let d=await f.fold('document.fold.chapters',{nodeIds:[f.doc.toc[0].id]});assert(d.foldedPages.includes(1));
 d=await f.fold('document.layout.undo');assert.deepEqual(d.foldedPages,[]);
 d=await f.fold('document.fold',{pages:[2]});d=await f.fold('document.layout.undo');assert.deepEqual(d.foldedPages,[]);
 d=await f.fold('document.region.set',{page:1,start:.1,end:.3});const first=d.foldRegions[0].id;
 d=await f.fold('document.region.set',{page:1,start:.6,end:.8});const second=d.foldRegions[1].id;
 const set=await f.getSet();const c=await f.api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:d.id,expectedSourceVersion:d.sourceVersion,captureId:randomUUID(),text:'',color:'blue',locator:{page:1},selection:{rects:[{page:1,x:.1,y:.2,width:.5,height:.05}]}});
 await f.api('study.card.activate',{setId:set.id,cardId:c.card.id});d=await f.getDoc();
 assert.equal(d.foldRegions.find(r=>r.id===first).folded,false);assert.equal(d.foldRegions.find(r=>r.id===second).folded,true);
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'layout.pdf')),pdfFixture());
});
test('embedded and overlaid notes are atomic, editable, layer-locked and safe for portable roundtrip',async t=>{
 const f=await fixture(t),doc=f.doc;
 let set=await f.change('study.note.place',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,title:'Between paragraphs',text:'**Meaning** $x^2$',locator:{page:1,pageOffset:.45},display:'embedded',height:120});
 const cardId=set.lastPlacedNote;assert(cardId);assert.equal(set.cards.length,1);
 const before=await f.api('document.layout.get',{id:doc.id,page:1,width:612});
 const after=await f.api('document.layout.get',{id:doc.id,page:1,width:612,setId:set.id});assert(after.height>before.height);assert(after.blocks.some(b=>b.type==='note'&&b.start===.45));
 set=await f.change('study.note.place',{cardId,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,locator:{page:1,pageOffset:.3},display:'overlay',rect:{x:.1,y:.3,width:.5,height:.2}});
 assert.equal(set.cards.length,1);assert.equal(set.cards[0].anchor.height,120);
 const invalid={setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,title:'Never saved',locator:{page:1},display:'overlay',rect:{x:.9,y:0,width:.2,height:.2}};
 await f.error('study.note.place',invalid,'INVALID_PARAMS');assert.equal((await f.getSet()).cards.length,1);
 set=await f.change('study.layer.update',{layerId:'default',locked:true});
 await f.error('study.note.place',{...invalid,expectedRevision:set.revision,cardId,rect:{x:.1,y:.2,width:.5,height:.2}},'LAYER_LOCKED');
 await f.error('study.card.update',{setId:set.id,expectedRevision:set.revision,cardId,text:'locked'},'LAYER_LOCKED');
 set=await f.change('study.layer.update',{layerId:'default',locked:false});
 await f.fold('document.region.set',{page:2,start:.2,end:.4});
 await f.api('study.package.export',{setId:set.id,path:'layout.mrpkg'});
 assert.equal((await f.api('study.package.inspect',{path:'layout.mrpkg'})).sets.length,1);
 const imported=await f.api('study.package.import',{path:'layout.mrpkg',folder:'Roundtrip',activate:false});
 const copy=await f.api('study.get',{setId:imported.setId});assert.equal(copy.cards[0].anchor.display,'overlay');assert.equal(copy.cards[0].anchor.height,120);
 const copyDoc=await f.api('document.get',{id:copy.documentIds[0]});assert.equal(copyDoc.foldRegions[0].sourceChanged,false);
});
test('source/display geometry roundtrips all visible points and splits selections around folds and inserted bands',async()=>{
 const G=await import('../ui/page-slices.mjs'),notes=[{id:'note',anchor:{display:'embedded',locator:{pageOffset:.5},height:100}}];
 const layout=G.pageSlices(1000,[{id:'fold',start:.2,end:.4,folded:true}],notes,1);
 assert.equal(layout.height,930);
 for(let i=0;i<=1000;i++){const y=i/1000;if(y>=.2&&y<.4)continue;assert(Math.abs(G.sourceY(layout,G.displayY(layout,y))-y)<1e-7,'roundtrip at '+y);}
 assert.equal(G.displayY(layout,.5),430);
 const projected=G.projectRects(layout,{x:.1,y:.1,width:.5,height:.6},600);assert.equal(projected.length,3);
 const roundtrip=projected.flatMap(r=>G.sourceRects(layout,r,600));assert(Math.abs(roundtrip.reduce((n,r)=>n+r.height,0)-.4)<1e-8);
 const insideFold=G.sourceRects(layout,{x:10,y:201,width:200,height:28},600);assert.equal(insideFold.length,0);
});
