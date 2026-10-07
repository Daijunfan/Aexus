'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {setup,pdfFixture}=require('./fixtures.cjs');
const shapes={rectangle:[[.1,.2],[.9,.2],[.9,.8],[.1,.8],[.1,.2]],triangle:[[.5,.1],[.9,.9],[.1,.9],[.5,.1]],pentagon:[[.5,.1],[.88,.38],[.74,.84],[.26,.84],[.12,.38],[.5,.1]],star:[[.5,.1],[.6,.36],[.9,.36],[.66,.56],[.75,.9],[.5,.7],[.25,.9],[.34,.56],[.1,.36],[.4,.36],[.5,.1]],heart:[[.5,.85],[.18,.5],[.1,.3],[.2,.15],[.35,.14],[.5,.3],[.65,.14],[.8,.15],[.9,.3],[.82,.5],[.5,.85]]};
const ellipse=(w,h)=>Array.from({length:81},(_,i)=>[.5+w*Math.cos(i/80*Math.PI*2),.5+h*Math.sin(i/80*Math.PI*2)]);
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Stroke geometry'});const change=async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p});return {...f,change,set:()=>set};}
test('held geometric outlines recognize supported shapes in either drawing direction while leaving unmatched open handwriting unchanged',async()=>{
 const {resolveStroke}=await import('../ui/ink-recognition.mjs');
 for(const [kind,points] of Object.entries({...shapes,circle:ellipse(.35,.35),ellipse:ellipse(.4,.22)}))for(const input of [points,[...points].reverse()]){
  assert.equal(resolveStroke(input,{perfectShape:true,heldMs:499}).kind,'free');const result=resolveStroke(input,{perfectShape:true,heldMs:500});assert.equal(result.kind,kind,kind);assert(result.points.every(p=>p.every(Number.isFinite)&&p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1));
 }
 const word=[[.1,.8],[.12,.2],[.2,.7],[.25,.3],[.31,.75],[.4,.4],[.49,.8],[.6,.3],[.72,.7],[.88,.5]];assert.deepEqual(resolveStroke(word,{perfectShape:true,heldMs:1000,straighten:'auto'}),{kind:'free',points:word});
});
test('rotation, uneven sampling and physical aspect do not force shapes into the wrong orientation',async()=>{
 const {resolveStroke}=await import('../ui/ink-recognition.mjs'),angle=.35,rotated=shapes.rectangle.map(([x,y])=>[.5+(x-.5)*Math.cos(angle)-(y-.5)*Math.sin(angle),.5+(x-.5)*Math.sin(angle)+(y-.5)*Math.cos(angle)]);const fit=resolveStroke(rotated,{perfectShape:true,heldMs:600});assert.equal(fit.kind,'rectangle');assert(fit.points.some((p,i)=>i&&Math.abs(p[0]-fit.points[i-1][0])>.02&&Math.abs(p[1]-fit.points[i-1][1])>.02));
 const physicalCircle=ellipse(.3,.15);assert.equal(resolveStroke(physicalCircle,{perfectShape:true,heldMs:600,aspectRatio:2}).kind,'circle');assert.equal(resolveStroke(physicalCircle,{perfectShape:true,heldMs:600,aspectRatio:1}).kind,'ellipse');
 const sampled=shapes.rectangle.flatMap((p,i)=>i===1?[p,p,p,p,p]:[p]);assert.equal(resolveStroke(sampled,{perfectShape:true,heldMs:600}).kind,'rectangle');
});
test('Core applies automatic/always lines, preserves curves and allows an explicit per-stroke override',async t=>{
 const f=await fixture(t),near=[[100,100],[200,202],[300,300]],curve=[[100,100],[130,280],[300,300]];await f.change('study.ink.settings',{straighten:'auto'});let s=await f.change('study.canvas.ink.add',{points:near,width:3,color:'blue'});assert.equal(s.canvasInk[0].points.length,2);assert.equal(s.canvasInk[0].recognizedShape,'line');
 s=await f.change('study.canvas.ink.add',{points:curve,width:3,color:'blue'});assert.deepEqual(s.canvasInk[1].points,curve);await f.change('study.ink.settings',{straighten:'always'});s=await f.change('study.canvas.ink.add',{points:curve,width:3,color:'blue'});assert.equal(s.canvasInk[2].points.length,2);
 s=await f.change('study.canvas.ink.add',{points:curve,width:3,color:'blue',geometry:{straighten:'off'}});assert.deepEqual(s.canvasInk[3].points,curve);await f.change('study.undo');assert.equal(f.set().canvasInk.length,3);
});
test('raw strokes are shaped by the same Core path for PDF and card drawing, with bounded rulers and stable ink metadata',async t=>{
 const f=await fixture(t);await fs.writeFile(f.workspace+'/shape.pdf',pdfFixture());const doc=await f.api('document.open',{path:'shape.pdf',activate:false});await f.change('study.documents.add',{paths:['shape.pdf']});await f.change('study.ink.settings',{shape:'rectangle'});
 let s=await f.change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,.2],[.8,.7]],width:.004,color:'blue'});assert.equal(s.ink[0].points.length,5);assert.equal(s.ink[0].recognizedShape,'rectangle');assert.deepEqual(await fs.readFile(f.workspace+'/shape.pdf'),pdfFixture());
 s=await f.change('study.note.create',{title:'Geometry card'});const id=s.cards[0].id;s=await f.change('study.card.ink.add',{cardId:id,points:[[.2,.2,.8],[.8,.7,.7],[.8,.7,0]],width:.01,color:'green',geometry:{shape:'ellipse'}});const ink=s.cards[0].ink[0];assert.equal(ink.recognizedShape,'ellipse');assert.equal(ink.points.length,65);assert(ink.points.every(p=>Math.abs(p[2]-.75)<1e-9));
 s=await f.change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.8,.2],[.9,.9]],width:.004,color:'blue',geometry:{shape:'ruler',rulerAngle:45}});assert(s.ink.at(-1).points.every(p=>p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1));
});
test('held recognition persists and remains compatible with copy, portable data and revision rejection',async t=>{
 const f=await fixture(t);await f.change('study.ink.settings',{shape:'free',perfectShape:true});let s=await f.change('study.note.create',{title:'Heart'}),id=s.cards[0].id;const before=s.revision;s=await f.change('study.card.ink.add',{cardId:id,points:shapes.heart,width:.01,color:'pink',geometry:{heldMs:600,aspectRatio:1}});assert.equal(s.cards[0].ink[0].recognizedShape,'heart');
 await f.error('study.card.ink.add',{setId:s.id,expectedRevision:before,cardId:id,points:shapes.rectangle,width:.01,color:'blue',geometry:{heldMs:600}},'CONFLICT');await f.api('study.package.export',{setId:s.id,path:'geometry.mrpkg'});const imported=await f.api('study.package.import',{path:'geometry.mrpkg',folder:'Geometry restored'});const restored=await f.api('study.get',{setId:imported.setId});assert.equal(restored.cards[0].ink[0].recognizedShape,'heart');assert.deepEqual(restored.cards[0].ink[0].points,s.cards[0].ink[0].points);
 await f.error('study.card.ink.add',{setId:s.id,expectedRevision:s.revision,cardId:id,points:shapes.rectangle,width:.01,color:'blue',geometry:{heldMs:-1}},'INVALID_PARAMS');
});
