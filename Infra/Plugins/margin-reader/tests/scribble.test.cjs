'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setup,pdfFixture}=require('./fixtures.cjs');
const zig=(x=.2,y=.35,w=.6,h=.28)=>Array.from({length:8},(_,i)=>[x+(i%2?w:0),y+h*i/7]);
const intent={shape:'free',straighten:'off',perfectShape:true,scribbleErase:true,heldMs:500,eraseRadius:.01};
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Scribble'});const change=async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p});return {...f,change,set:()=>set};}
test('scribble needs an explicit destructive intent, perfect shape and a held dense reversing gesture',async()=>{
 const {resolveStroke}=await import('../ui/ink-recognition.mjs'),points=zig();assert.equal(resolveStroke(points,intent).kind,'scribble');
 for(const patch of [{heldMs:499},{perfectShape:false},{scribbleErase:false}])assert.deepEqual(resolveStroke(points,{...intent,...patch}),{points,kind:'free'});
 for(const angle of [0,.6,1.57]){const rotated=points.map(([x,y])=>[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)]);assert.equal(resolveStroke(rotated,intent).kind,'scribble');}
 const loops=Array.from({length:200},(_,i)=>[.5+.3*Math.cos(i/199*8*Math.PI),.5+.3*Math.sin(i/199*8*Math.PI)]),word=[[.1,.8],[.12,.2],[.2,.7],[.25,.3],[.31,.75],[.4,.4],[.49,.8],[.6,.3],[.72,.7],[.88,.5]];
 for(const points of [loops,word,[[0,0],[1,1]]])assert.notEqual(resolveStroke(points,intent).kind,'scribble');
});
test('held PDF scribble erases only visible unlocked strokes, preserves folded content and restores exact ink with undo',async t=>{
 const f=await fixture(t);await fs.writeFile(f.workspace+'/ink.pdf',pdfFixture());const doc=await f.api('document.open',{path:'ink.pdf',activate:false});await f.change('study.documents.add',{paths:['ink.pdf']});
 const add=y=>f.change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,y],[.9,y]],width:.004,color:'blue'});await add(.4);await add(.5);const folded=f.set().ink.at(-1).id;
 let s=await f.change('study.notebook.create',{documentId:doc.id,title:'Hidden'});const hiddenBook=s.lastNotebookId;await add(.4);const hidden=f.set().ink.at(-1).id;await f.change('study.notebook.update',{documentId:doc.id,notebookId:hiddenBook,visible:false});await f.change('study.notebook.select',{documentId:doc.id,notebookId:'default'});
 s=await f.change('study.layer.create',{title:'Locked'});const layer=s.activeLayer;await add(.4);const locked=f.set().ink.at(-1).id;await f.change('study.layer.update',{layerId:layer,locked:true});const before=structuredClone(f.set());
 s=await f.change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,layerId:'default',points:zig(),width:.004,color:'red',geometry:{...intent,bands:[{start:0,end:.45},{start:.55,end:1}]}});
 assert.equal(s.revision,before.revision+1);assert.equal(s.lastInk.recognizedShape,'scribble');assert.equal(s.lastInk.erased,1);assert.deepEqual(new Set(s.ink.map(i=>i.id)),new Set([folded,hidden,locked]));assert.deepEqual(await fs.readFile(f.workspace+'/ink.pdf'),pdfFixture());
 s=await f.change('study.undo');assert.deepEqual(s.ink,before.ink);s=await f.change('study.redo');assert.equal(s.ink.length,3);
});
test('map scribble is one undoable sweep across canvas and visible card backs, preserving folded children and other studies',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Visible'}),id=s.cards[0].id;s=await f.change('study.note.create',{title:'Folded child',parentId:id});const child=s.cards.at(-1).id;
 for(const cardId of [id,child])await f.change('study.card.ink.add',{cardId,points:[[.1,.5],[.9,.5]],width:.01,color:'blue'});
 await f.change('study.card.ink.add',{cardId:id,reviewSide:'front',points:[[.1,.5],[.9,.5]],width:.01,color:'purple'});await f.change('study.card.update',{cardId:id,collapsed:true});
 const box=(await f.api('study.map.geometry',{setId:s.id})).positions.find(p=>p.cardId===id),world=pt=>[box.x+pt[0]*box.width,box.y+pt[1]*box.height];await f.change('study.canvas.ink.add',{points:[world([.1,.5]),world([.9,.5])],width:3,color:'green'});
 s=await f.change('study.layer.create',{title:'Hidden'});const layer=s.activeLayer;await f.change('study.canvas.ink.add',{points:[world([.1,.5]),world([.9,.5])],width:3,color:'green'});await f.change('study.layer.update',{layerId:layer,visible:false});
 const other=await f.api('study.create',{title:'Unrelated'}),before=structuredClone(f.set());s=await f.change('study.canvas.ink.add',{points:zig().map(world),layerId:'default',width:3,color:'red',geometry:{...intent,scribbleScope:'map',eraseRadius:3}});
 assert.equal(s.lastInk.erased,2);assert.equal(s.canvasInk.length,1);assert.equal(s.cards.find(c=>c.id===id).ink.length,1);assert.equal(s.cards.find(c=>c.id===id).ink[0].reviewSide,'front');assert.equal(s.cards.find(c=>c.id===child).ink.length,1);assert.equal((await f.api('study.get',{setId:other.id})).revision,other.revision);
 s=await f.change('study.undo');assert.deepEqual(s.cards,before.cards);assert.deepEqual(s.canvasInk,before.canvasInk);
});
test('card scribble stays in its own image frame by default and can explicitly erase a map gesture spanning outside its bounds',async t=>{
 const f=await fixture(t),png=await require('@napi-rs/canvas').createCanvas(100,100).encode('png');let s=await f.change('study.media.import',{kind:'image',title:'Image',contentBase64:png.toString('base64')}),id=s.cards[0].id,frame={x:.2,y:.2,width:.6,height:.6};
 await f.change('study.card.ink.add',{cardId:id,imageBound:true,imageBounds:frame,points:[[.3,.5],[.7,.5]],width:.01,color:'blue'});const box=(await f.api('study.map.geometry',{setId:s.id})).positions.find(p=>p.cardId===id),world=pt=>[box.x+pt[0]*box.width,box.y+pt[1]*box.height];await f.change('study.canvas.ink.add',{points:[world([.1,.5]),world([1.2,.5])],width:2,color:'green'});
 s=await f.change('study.card.ink.add',{cardId:id,imageBound:true,imageBounds:frame,points:zig(),width:.01,color:'red',geometry:intent});assert.equal(s.cards[0].ink.length,0);assert.equal(s.canvasInk.length,1);assert.equal(s.lastInk.scope,'card');
 s=await f.change('study.card.ink.add',{cardId:id,points:zig(.2,.35,1.3,.28),width:.01,color:'red',geometry:{...intent,scribbleScope:'map'}});assert.equal(s.canvasInk.length,0);assert.equal(s.lastInk.scope,'map');assert.equal(s.lastInk.erased,1);
});
test('unheld and disabled gestures are retained as ordinary ink, with out-of-card points surviving export and import',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Outside card'}),id=s.cards[0].id;await f.change('study.ink.settings',{perfectShape:true});
 for(const geometry of [{heldMs:600},{...intent,heldMs:0},{...intent,perfectShape:false}])await f.change('study.card.ink.add',{cardId:id,points:zig(-.1,.35,1.2,.28),width:.01,color:'blue',geometry});s=f.set();assert.equal(s.cards[0].ink.length,3);assert(s.cards[0].ink.every(i=>i.space==='card-relative'&&i.recognizedShape==='free'));
 await f.api('study.package.export',{setId:s.id,path:'scribble.mrpkg'});const imported=await f.api('study.package.import',{path:'scribble.mrpkg',folder:'Restored'}),restored=await f.api('study.get',{setId:imported.setId});assert.deepEqual(restored.cards[0].ink.map(i=>i.points),s.cards[0].ink.map(i=>i.points));
});
test('stale, invalid and laser scribble requests leave the entire state intact',async t=>{
 const f=await fixture(t);await fs.writeFile(f.workspace+'/ink.pdf',pdfFixture());const doc=await f.api('document.open',{path:'ink.pdf',activate:false});await f.change('study.documents.add',{paths:['ink.pdf']});await f.change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,.5],[.9,.5]],width:.004,color:'blue'});const s=f.set(),params={setId:s.id,expectedRevision:s.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:zig(),width:.004,color:'red',geometry:intent};
 for(const [patch,code] of [[{expectedRevision:s.revision-1},'CONFLICT'],[{brush:'laser'},'INVALID_PARAMS'],[{color:'bad-color'},'INVALID_PARAMS'],[{geometry:{...intent,scribbleScope:'map'}},'INVALID_PARAMS'],[{geometry:{...intent,bands:[{start:.6,end:.4}]}},'INVALID_PARAMS']]){await f.error('study.ink.add',{...params,...patch},code);assert.deepEqual(await f.api('study.get',{setId:s.id}),s);}
 await fs.appendFile(f.workspace+'/ink.pdf','\n% source edit');await f.error('study.ink.add',params,'SOURCE_CHANGED');assert.equal((await f.api('study.get',{setId:s.id})).revision,s.revision);
});
test('a map-wide scribble respects the owning note layer lock as well as the stroke layer',async t=>{
 const f=await fixture(t);await fs.writeFile(f.workspace+'/ink.pdf',pdfFixture());const doc=await f.api('document.open',{path:'ink.pdf',activate:false});await f.change('study.documents.add',{paths:['ink.pdf']});let s=await f.change('study.layer.create',{title:'Note layer'}),layer=s.activeLayer;
 s=await f.change('study.note.place',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,title:'Protected note',locator:{page:1},layerId:layer});const id=s.cards[0].id;await f.change('study.card.ink.add',{cardId:id,layerId:'default',points:[[.1,.5],[.9,.5]],color:'blue',width:.01});const stroke=f.set().cards[0].ink[0];
 const box=(await f.api('study.map.geometry',{setId:s.id})).positions.find(p=>p.cardId===id),world=p=>[box.x+p[0]*box.width,box.y+p[1]*box.height];await f.change('study.canvas.ink.add',{layerId:'default',points:[world([.1,.5]),world([.9,.5])],width:2,color:'green'});await f.change('study.layer.update',{layerId:layer,locked:true});
 s=await f.change('study.canvas.ink.add',{layerId:'default',points:zig().map(world),width:3,color:'red',geometry:{...intent,scribbleScope:'map',eraseRadius:3}});assert.equal(s.lastInk.erased,1);assert.equal(s.canvasInk.length,0);assert.deepEqual(s.cards[0].ink,[stroke]);
});
