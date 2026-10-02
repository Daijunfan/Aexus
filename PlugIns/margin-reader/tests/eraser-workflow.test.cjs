'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{createCanvas}=require('@napi-rs/canvas');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);await fs.writeFile(f.workspace+'/ink.pdf',pdfFixture());const doc=await f.api('document.open',{path:'ink.pdf',activate:false});let set=await f.api('study.create',{title:'Eraser workflow'});const change=async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p});await change('study.documents.add',{paths:['ink.pdf']});return {...f,doc,change,set:()=>set,add:y=>change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,y],[.9,y]],width:.004,color:'blue'})};}
test('complete eraser removes every swept stroke, preserves misses and restores identities with undo',async t=>{
 const f=await fixture(t);await f.add(.2);await f.add(.4);let s=await f.add(.95),before=structuredClone(s.ink);
 s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,mode:'stroke',path:[[.5,.1],[.5,.8]],radius:.02});assert.equal(s.lastInk.mode,'stroke');assert.equal(s.lastInk.erased,2);assert.deepEqual(s.ink,[before[2]]);s=await f.change('study.undo');assert.deepEqual(s.ink,before);assert.deepEqual(await fs.readFile(f.workspace+'/ink.pdf'),pdfFixture());
 s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,path:[[.5,.1],[.5,.8]],radius:.02});assert.equal(s.lastInk.mode,'partial');assert.equal(s.ink.length,5);
});
test('visible source bands protect wholly folded strokes and preserve hidden portions under partial erasing',async t=>{
 const f=await fixture(t);await f.add(.2);await f.add(.5);await f.add(.8);const hidden=f.set().ink[1],bands=[{start:0,end:.3},{start:.7,end:1}];let s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,mode:'stroke',bands,path:[[.5,.1],[.5,.9]],radius:.03});assert.deepEqual(s.ink,[hidden]);
 const G=require('../lib/ink-geometry.cjs'),parts=G.erase([[.5,.1,.2],[.5,.9,.8]],[[.5,0],[.5,1]],.1,1,bands);assert.equal(parts.length,1);assert(Math.abs(parts[0][0][1]-.3)<1e-9);assert(Math.abs(parts[0].at(-1)[1]-.7)<1e-9);
 await f.error('study.ink.erase',{setId:s.id,expectedRevision:s.revision,scope:'document',documentId:f.doc.id,page:1,bands:[{start:.7,end:.2}],path:[[.5,0],[.5,1]],radius:.01},'INVALID_PARAMS');
});
test('hidden or locked layers and document notebooks remain untouched during a complete sweep',async t=>{
 const f=await fixture(t);await f.add(.3);let s=await f.change('study.notebook.create',{documentId:f.doc.id,title:'Locked'}),book=s.lastNotebookId;await f.add(.3);const locked=f.set().ink.at(-1).id;await f.change('study.notebook.update',{documentId:f.doc.id,notebookId:book,locked:true});
 s=await f.change('study.notebook.create',{documentId:f.doc.id,title:'Hidden'});const hiddenBook=s.lastNotebookId;await f.add(.3);const hidden=f.set().ink.at(-1).id;await f.change('study.notebook.update',{documentId:f.doc.id,notebookId:hiddenBook,visible:false});await f.change('study.notebook.select',{documentId:f.doc.id,notebookId:'default'});
 s=await f.change('study.layer.create',{title:'Locked layer'});const layer=s.activeLayer;await f.add(.3);const layerInk=f.set().ink.at(-1).id;await f.change('study.layer.update',{layerId:layer,locked:true});
 s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,mode:'stroke',path:[[.5,.1],[.5,.6]],radius:.03});assert.deepEqual(new Set(s.ink.map(i=>i.id)),new Set([locked,hidden,layerInk]));assert.equal(s.lastInk.erased,1);
});
test('card and canvas sweeps keep their scope and constrain card erasing to its visible side',async t=>{
 const f=await fixture(t),png=await createCanvas(100,100).encode('png');let s=await f.change('study.media.import',{kind:'image',title:'Image',contentBase64:png.toString('base64')}),id=s.cards[0].id;
 for(const y of [.3,.7])await f.change('study.card.ink.add',{cardId:id,imageBound:true,imageBounds:{x:0,y:0,width:1,height:1},points:[[.1,y],[.9,y]],width:.01,color:'blue'});
 s=await f.change('study.card.ink.add',{cardId:id,reviewSide:'front',points:[[.1,.45],[.9,.45]],width:.01,color:'purple'});const front=s.cards[0].ink.at(-1).id;for(const y of [100,300])await f.change('study.canvas.ink.add',{points:[[100,y],[900,y]],width:3,color:'green'});
 s=await f.change('study.ink.erase',{scope:'card',cardId:id,side:'back',mode:'stroke',imageBounds:{x:.2,y:.3,width:.6,height:.3},path:[[.5,.35],[.5,.6]],radius:.01});assert.deepEqual(s.cards[0].ink.map(i=>i.id),[front]);assert.equal(s.canvasInk.length,2);
 s=await f.change('study.ink.erase',{scope:'canvas',mode:'stroke',path:[[500,50],[500,350]],radius:10});assert.equal(s.canvasInk.length,0);assert.equal(s.cards[0].ink[0].id,front);
});
test('auto-return is a persistent preference that does not overwrite the selected brush or history',async t=>{
 const f=await fixture(t);let s=await f.change('study.ink.settings',{brush:'pencil',color:'purple',opacity:.6,eraser:'stroke',eraserAutoCancel:true});assert(s.inkSettings.eraserAutoCancel);await f.add(.3);s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,mode:'stroke',path:[[.5,.1],[.5,.5]],radius:.02});assert.equal(s.inkSettings.brush,'pencil');assert.equal(s.inkSettings.opacity,.6);const state=JSON.parse(await fs.readFile(f.workspace+'/.margin-reader/state.json','utf8'));assert.equal(state.studySets[s.id].inkSettings.eraserAutoCancel,true);await f.change('study.undo');assert.equal(f.set().ink.length,1);
});
test('a lasso can select the middle of a sparse straight stroke without capturing its endpoints',async()=>{
 const {polylineIntersectsPolygon:hit}=await import('../ui/ink-shapes.mjs'),polygon=[[.4,.4],[.6,.4],[.6,.6],[.4,.6]];assert(hit([[0,.5],[1,.5]],polygon));assert(hit([[.5,0],[.5,1]],polygon));assert(!hit([[0,.1],[1,.1]],polygon));assert(!hit([[0,0],[1,1]],[[.5,.5],[.6,.6]]));assert(hit([[0,.4],[1,.4]],polygon));
});
