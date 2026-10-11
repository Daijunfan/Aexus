'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
const output=async()=>path.resolve((await fs.readFile(path.join(__dirname,'../artifacts/completion-current.txt'),'utf8')).trim());
const update=(f,s,p)=>f.api('study.mindmap.topics.update',{setId:s.id,expectedRevision:s.revision,...p});
test('local math and chemical equations render vector paths, isolate macros and reject external or unbounded input',async t=>{
 const f=await setup(t);const values=[String.raw`\frac{a+b}{c}`,String.raw`\int_0^1 x^2\,dx=\frac13`,String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,String.raw`\ce{2H2 + O2 -> 2H2O}`];
 for(const latex of values){const r=await f.api('study.mindmap.equation.preview',{latex});assert(r.svg.includes('<path'));assert(r.width>0&&r.height>0);assert(!r.svg.includes('<image'));assert(!r.svg.includes('foreignObject'));}
 await f.api('study.mindmap.equation.preview',{latex:String.raw`\newcommand{\temporarysymbol}{x}\temporarysymbol`});
 for(const latex of [String.raw`\temporarysymbol`,String.raw`\unknowncommand`,String.raw`\href{https://example.com}{x}`,String.raw`\require{html}`,String.raw`\def\again{\again}\again`,'x'.repeat(2001)])await f.error('study.mindmap.equation.preview',{latex},'INVALID_PARAMS');
});
test('equation geometry is canonical across Core, renderer and SVG export, reversible without persisting SVG',async t=>{
 const f=await setup(t);let s=await f.api('study.create',{title:'公式结构'});s=await f.api('study.note.create',{setId:s.id,expectedRevision:s.revision,title:'数学与化学'});const id=s.cards[0].id,latex=String.raw`\frac{\sqrt{x^2+y^2}}{1+z}`;
 s=await update(f,s,{cardIds:[id],patch:{equation:{latex,scale:1.5,width:1,height:1}}});assert(s.cards[0].mindmap.equation);assert(!s.cards[0].equationSvg);assert(s.cards[0].mindmap.equation.width>1);const state=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'),'utf8');assert(!state.includes('equationSvg'));assert(!state.includes('<svg'));
 const {layoutMindmap}=await import('../ui/mindmap-layout.mjs'),l=layoutMindmap(s.cards,s.map),topic=l.topics.get(id);assert(topic.box.mathHeight>20);assert(topic.box.mathWidth<=l.positions.get(id).width);
 const svg=await f.api('study.mindmap.export',{setId:s.id,expectedRevision:s.revision,format:'svg',path:'equation.svg'});const content=await fs.readFile(path.join(f.workspace,svg.path),'utf8');assert(content.includes('data-mml-node'));assert(content.includes('数学与化学'));assert(!content.includes('<image'));
 s=await update(f,s,{cardIds:[id],patch:{equation:null}});assert(!s.cards[0].equationSvg);s=await f.api('study.undo',{setId:s.id,expectedRevision:s.revision});assert.equal(s.cards[0].mindmap.equation.latex,latex);assert(s.cards[0].mindmap.equation);assert(!s.cards[0].equationSvg);
});
test('vector PDF retains Chinese and English searchable labels, complete formulas and curves with no whole-page image',async t=>{
 const f=await setup(t);let s=await f.api('study.create',{title:'可搜索的知识图谱'});s=await f.api('study.mindmap.outline.import',{setId:s.id,expectedRevision:s.revision,text:'知识图谱 Knowledge\n  数学模型\n    Model validation\n    可重复实验\n  工程实现\n    原文回源\n    保存与撤销'});
 s=await update(f,s,{cardIds:[s.cards.find(c=>c.title==='数学模型').id],patch:{equation:{latex:String.raw`E=mc^2+\frac{a}{b}`,scale:1}}});
 const r=await f.api('study.mindmap.export',{setId:s.id,expectedRevision:s.revision,format:'pdf',path:'vector.pdf',paper:'A3'});assert.equal(r.rasterized,false);assert(r.vector);assert.equal(r.topics,7);assert(r.fonts.length);assert(Math.abs(r.width-1190.55)<.01);assert.deepEqual(r.warnings,[]);
 const bytes=await fs.readFile(path.join(f.workspace,r.path)),{createCanvas}=require('@napi-rs/canvas'),pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(bytes),verbosity:0,isEvalSupported:false});
 try{const pdf=await task.promise;assert.equal(pdf.numPages,1);const page=await pdf.getPage(1),text=(await page.getTextContent()).items.map(i=>i.str).join('');for(const title of s.cards.map(c=>c.title))assert(text.includes(title),'Missing searchable title: '+title);
  const ops=(await page.getOperatorList()).fnArray;assert(!ops.includes(pdfjs.OPS.paintImageXObject));assert(ops.length>300,'Missing vector paths');const v=page.getViewport({scale:1}),canvas=createCanvas(Math.ceil(v.width),Math.ceil(v.height));await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;const out=await output();await fs.writeFile(path.join(out,'vector-math.pdf'),bytes);await fs.writeFile(path.join(out,'vector-math.png'),await canvas.encode('png'));await fs.writeFile(path.join(out,'vector-math-result.json'),JSON.stringify({...r,text,operatorCount:ops.length},null,2));
 }finally{await task.destroy();}
 const raster=await f.api('study.mindmap.export',{setId:s.id,expectedRevision:s.revision,format:'pdf',path:'compatible.pdf',pdfMode:'raster'});assert(raster.rasterized);assert(!raster.vector);assert.equal((await f.api('study.get',{setId:s.id})).revision,s.revision);
});
