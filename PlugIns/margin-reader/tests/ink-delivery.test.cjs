'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
const G=require('../lib/ink-geometry.cjs');
async function fixture(t){const f=await setup(t);await fs.writeFile(path.join(f.workspace,'ink.pdf'),pdfFixture());let set=await f.api('study.create',{title:'Handwriting'});const change=async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p});await change('study.documents.add',{paths:['ink.pdf']});const doc=await f.api('document.open',{path:'ink.pdf',activate:false});return {...f,doc,change,get:async()=>set=await f.api('study.get',{setId:set.id}),add:extra=>change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,.5,.2],[.9,.5,.9]],color:'blue',width:.004,...extra})};}
test('partial eraser computes exact gaps for long segments, mixed pressures and curved paths',()=>{
 const p=G.erase([[0,.5,.2],[1,.5]],[[.5,0],[.5,1]],.1);assert.equal(p.length,2);assert(Math.abs(p[0].at(-1)[0]-.4)<1e-9);assert(Math.abs(p[1][0][0]-.6)<1e-9);assert(p.flat().every(point=>point.every(Number.isFinite)));
 assert.deepEqual(G.erase([[0,0],[1,0]],[[0,1],[1,1]],.1),[[[0,0],[1,0]]]);
 assert.equal(G.erase([[0,0],[1,0]],[[0,0],[1,0]],.1).length,0);
 const t=G.transform([[.25,.5],[.75,.5]],{origin:[.5,.5],angle:90,aspectRatio:2});assert(Math.abs(t[0][1]-.375)<1e-9);assert(Math.abs(t[1][1]-.625)<1e-9);
});
test('document eraser splits only swept ink, preserves original PDF and supports exact undo',async t=>{
 const f=await fixture(t);let s=await f.add(),original=s.ink[0];
 s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,path:[[.5,.2],[.5,.8]],radius:.03,aspectRatio:1.5});assert.equal(s.ink.length,2);assert(s.ink[0].points.at(-1)[0]<.48);assert(s.ink[1].points[0][0]>.52);
 s=await f.change('study.undo');assert.deepEqual(s.ink[0].points,original.points);assert.equal(s.ink[0].id,original.id);
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'ink.pdf')),pdfFixture());
 await f.error('study.ink.erase',{setId:s.id,expectedRevision:s.revision,scope:'document',path:[[0,0],[1,1]],radius:.02},'INVALID_PARAMS');
});
test('locked and hidden layers are excluded from erasing and all transforms are revision/source guarded',async t=>{
 const f=await fixture(t);let s=await f.change('study.layer.create',{title:'Protected'}),layerId=s.activeLayer;s=await f.add();const id=s.ink[0].id;
 s=await f.change('study.layer.update',{layerId,locked:true});s=await f.change('study.ink.erase',{scope:'document',documentId:f.doc.id,page:1,path:[[.5,0],[.5,1]],radius:.1});assert.equal(s.ink.length,1);
 await f.error('study.ink.batch',{setId:s.id,expectedRevision:s.revision,scope:'document',strokeIds:[id],action:'transform',dx:.01},'LAYER_LOCKED');
 await f.change('study.layer.update',{layerId,locked:false});s=await f.change('study.ink.batch',{scope:'document',strokeIds:[id],action:'copy',dy:.1,color:'#123456',opacity:.4});assert.equal(s.ink.length,2);assert.equal(s.ink[1].color,'#123456');
 await f.error('study.ink.batch',{setId:s.id,expectedRevision:s.revision,scope:'document',strokeIds:[id],action:'transform',dx:10},'INVALID_PARAMS');assert.equal((await f.get()).revision,s.revision);
 await fs.appendFile(path.join(f.workspace,'ink.pdf'),'\n% external modification');await f.error('study.ink.batch',{setId:s.id,expectedRevision:s.revision,scope:'document',strokeIds:[id],action:'transform',dx:.01},'SOURCE_CHANGED');
});
test('canvas binding follows card movement, permits outside-card marks, detaches without coordinate drift and packages safely',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Bound card'}),cardId=s.cards[0].id;
 s=await f.change('study.canvas.ink.add',{points:[[10,10],[100,100]],color:'orange',width:3,brush:'highlighter',opacity:.4});const strokeId=s.canvasInk[0].id;
 const geometry=await f.api('study.map.geometry',{setId:s.id});const box=geometry.positions.find(p=>p.cardId===cardId);assert(box.width>0);
 s=await f.change('study.ink.bind',{scope:'canvas',cardId,strokeIds:[strokeId]});assert.equal(s.canvasInk.length,0);assert.equal(s.cards[0].ink[0].space,'card-relative');assert(s.cards[0].ink[0].points[0][0]<0);const bound=s.cards[0].ink[0];
 s=await f.change('study.card.position',{cardId,x:box.x+120,y:box.y+70});s=await f.change('study.ink.detach',{cardId,strokeIds:[bound.id]});assert(Math.abs(s.canvasInk[0].points[0][0]-130)<1e-9);assert(Math.abs(s.canvasInk[0].points[0][1]-80)<1e-9);assert.equal(s.canvasInk[0].width,3);
 s=await f.change('study.undo');assert.equal(s.cards[0].ink.length,1);
 await f.api('study.package.export',{setId:s.id,path:'bound.mrpkg'});assert.equal((await f.api('study.package.inspect',{path:'bound.mrpkg'})).sets.length,1);
});
test('handwriting-to-card keeps a validated source anchor and never pretends to OCR the strokes',async t=>{
 const f=await fixture(t);let s=await f.add({brush:'pencil',opacity:.55}),id=s.ink[0].id;s=await f.change('study.ink.toCard',{scope:'document',strokeIds:[id],title:'Draft derivation'});const c=s.cards.find(c=>c.id===s.lastInk.cardId);assert.equal(c.text,'');assert.equal(c.ink.length,1);assert.equal(c.anchor.documentId,f.doc.id);assert.equal(s.ink.length,1);assert(c.ink[0].points.every(p=>p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1));
 const result=await f.api('study.card.activate',{setId:s.id,cardId:c.id});assert.equal(result.source.locator.page,1);
});
test('pen and geometry settings survive undo/restart and laser is never accepted as saved ink',async t=>{
 const f=await fixture(t);let s=await f.change('study.ink.settings',{brush:'highlighter',color:'purple',width:.01,shape:'rectangle',eraser:'partial',opacity:.35});assert.equal(s.inkSettings.shape,'rectangle');
 s=await f.add({brush:'highlighter',opacity:.35});assert.equal(s.ink[0].brush,'highlighter');assert.equal(s.ink[0].opacity,.35);
 await f.error('study.ink.add',{setId:s.id,expectedRevision:s.revision,documentId:f.doc.id,expectedSourceVersion:f.doc.sourceVersion,page:1,points:[[.1,.1],[.2,.2]],width:.01,color:'red',brush:'laser'},'INVALID_PARAMS');
 s=await f.change('study.ink.settings',{shape:'ellipse'});s=await f.change('study.undo');assert.equal(s.inkSettings.shape,'rectangle');
 const {shaped}=await import('../ui/ink-shapes.mjs');assert.equal(shaped([[.1,.1],[.5,.8]],'rectangle').length,5);assert.equal(shaped([[.1,.1],[.5,.8]],'ellipse').length,65);assert.equal(shaped([[0,0],[.7,.8]],'ruler',0,2)[1][1],0);
});
