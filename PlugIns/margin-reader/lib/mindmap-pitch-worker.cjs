'use strict';
const {parentPort,workerData:a}=require('node:worker_threads');
const S=require('./safety.cjs'),b64=bytes=>Buffer.from(bytes).toString('base64');
async function run(){
 const {pitchPlan,pitchScene}=await import('../ui/mindmap-pitch.mjs'),{pitchSvg}=await import('../ui/mindmap-pitch-svg.mjs'),{svgDocument}=require('./mindmap-export.cjs'),set=a.set,options={...set.map?.mindmap?.pitch,images:a.includeImages!==false},frames=pitchPlan(set.cards,options);
 S.assert(frames.length&&frames.length<=1000,'TOO_LARGE','Export 1–1000 slides at a time; select a smaller branch for a larger presentation.');
 let equationBytes=0;for(const c of set.cards)if(c.mindmap?.equation){c.equationSvg=require('./mindmap-equation.cjs').render(c.mindmap.equation.latex).svg;equationBytes+=Buffer.byteLength(c.equationSvg);S.assert(equationBytes<=16*1024*1024,'TOO_LARGE','Presentation formula paths exceed 16 MiB; choose a smaller branch.');}
 const image=c=>c.imageBytes?'data:image/png;base64,'+b64(c.imageBytes):null,prepared=[];
 for(const frame of frames){
  const result=pitchSvg(set,frame,options,image);let diagram;
  if(frame.layout==='map'){
   const ids=new Set([frame.cardId,...frame.childIds]),cards=set.cards.filter(c=>ids.has(c.id)).map(c=>({...c,parentId:c.id===frame.cardId?null:frame.cardId,position:null,collapsed:false}));
   diagram=await svgDocument({...set,cards,map:{...set.map,mindmap:{...set.map.mindmap,enabled:true,items:[]}}},{scope:'all'});
   result.svg=pitchSvg(set,frame,{...options,diagram},image).svg;
  }
  prepared.push({...result,frame,diagram});
 }
 if(a.format==='pdf'){
  const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create(),warnings=new Set();
  for(const {svg,scene}of prepared){const text=[...svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<>]*)/g)].map(m=>m[1]).join(' '),result=await require('./mindmap-vector-pdf.cjs').render({svg,width:scene.w,height:scene.h,title:set.title,text});for(const w of result.warnings)warnings.add(w);const page=await PDFDocument.load(result.bytes);for(const p of await pdf.copyPages(page,[0]))pdf.addPage(p);}
  pdf.setTitle(set.title);pdf.setProducer('Margin Reader presentation');return {bytes:Buffer.from(await pdf.save()),slides:frames.length,vector:true,rasterized:false,warnings:[...warnings]};
 }
 const PptxGenJS=require('pptxgenjs'),pptx=new PptxGenJS(),width=12.8,height=options.ratio==='4:3'?9.6:7.2;
 pptx.defineLayout({name:'READER',width,height});pptx.layout='READER';pptx.title=set.title;pptx.subject='Local mind-map presentation';pptx.author='Margin Reader';pptx.company='';pptx.lang='zh-CN';pptx.theme={headFontFace:'Arial Unicode MS',bodyFontFace:'Arial Unicode MS',lang:'zh-CN'};
 const svgImages=[];
 const svgImage=(slide,svg,x,y,w,h)=>{const data=svg.replace(/^<svg\b([^>]*)>/,(_,attrs)=>'<svg'+attrs.replace(/\s(?:width|height)="[^"]*"/g,'')+` width="${Math.ceil(w*100)}" height="${Math.ceil(h*100)}">`);svgImages.push(data);slide.addImage({data:'data:image/svg+xml;base64,'+b64(Buffer.from(data)),x,y,w,h});};
 const text=(slide,value,x,y,w,h,size,color,bold=false)=>{slide.addText(value,{x:x/100,y:y/100,w:w/100,h:h/100,fontFace:'Arial Unicode MS',fontSize:size*.72,color:color.slice(1),bold,margin:0,breakLine:false,paraSpaceAfter:0,lineSpacingMultiple:1.15,vertAnchor:'top',fit:'shrink',lang:'zh-CN'});};
 for(const {frame,scene:s,diagram}of prepared){
  const card=set.cards.find(c=>c.id===frame.cardId),slide=pptx.addSlide();slide.background={color:s.paper.slice(1)};
  text(slide,s.subtitle,62,18,s.w-124,28,15,s.accent);text(slide,s.title.lines.join('\n'),62,65,s.w-124,s.titleH+16,s.title.fontSize,s.ink,true);slide.addShape(pptx.ShapeType.rect,{x:.62,y:(s.top-23)/100,w:.72,h:.04,line:{transparency:100},fill:{color:s.accent.slice(1)}});
  if(diagram)svgImage(slide,diagram.svg,.62,s.top/100,(s.w-124)/100,(s.bottom-s.top)/100);
  else{
   for(const box of s.boxes){slide.addShape(pptx.ShapeType.roundRect,{x:box.x/100,y:box.y/100,w:box.w/100,h:box.h/100,radius:.15,rectRadius:.15,line:{transparency:100},fill:{color:box.fill.slice(1)}});text(slide,box.lines.join('\n'),box.x+18,box.y+22,box.w-36,box.h-34,box.fontSize,box.ink,true);}
   if(!s.boxes.length){if(s.body?.lines.length)text(slide,s.body.lines.join('\n'),70,s.top+8,s.w-(s.showImage?660:140),s.bottom-s.top-24,s.body.fontSize,s.ink);
    if(s.showImage&&card.imageBytes){const area={x:s.w/2+30,y:s.top,w:s.w/2-96,h:s.bottom-s.top},scale=Math.min(area.w/card.image.width,area.h/card.image.height);slide.addImage({data:'data:image/png;base64,'+b64(card.imageBytes),x:(area.x+(area.w-card.image.width*scale)/2)/100,y:(area.y+(area.h-card.image.height*scale)/2)/100,w:card.image.width*scale/100,h:card.image.height*scale/100});}
    else if(card.equationSvg){const q=card.mindmap.equation,scale=Math.min(4,850/q.width,240/q.height),w=q.width*scale,h=q.height*scale;svgImage(slide,card.equationSvg.replace('<svg ',`<svg color="${s.ink}" `),(s.w-w)/200,Math.max(s.top+60,s.bottom-h-35)/100,w/100,h/100);}
   }
  }
  slide.addNotes([card.title,card.note||card.editedText||card.text||'',card.mindmap?.equation?.latex||'',...frame.childIds.map(id=>{const c=set.cards.find(c=>c.id===id);return c.title+'\n'+(c.note||c.editedText||c.text||'');}),card.sourcePath||''].join('\n\n'));
 }
 let bytes=await pptx.write({outputType:'nodebuffer',compression:true});
 // Office uses SVG for modern rendering and PNG fallbacks in older viewers.
 // Replace PptxGenJS's placeholder fallback with the actual local SVG raster.
 const zip=await require('jszip').loadAsync(bytes),{createCanvas,loadImage}=require('@napi-rs/canvas');
 const {DOMParser}=require('@xmldom/xmldom'),parser=new DOMParser(),done=new Set(),posix=require('node:path').posix;
 for(const file of Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))){
  const document=parser.parseFromString(await zip.file(file).async('string'),'application/xml'),relations=zip.file(posix.join(posix.dirname(file),'_rels',posix.basename(file)+'.rels'));if(!relations)continue;
  const rels=parser.parseFromString(await relations.async('string'),'application/xml'),targets=new Map([...Array.from(rels.getElementsByTagName('Relationship'))].map(r=>[r.getAttribute('Id'),posix.normalize(posix.join('ppt/slides',r.getAttribute('Target')))]));
  for(const pic of Array.from(document.getElementsByTagName('p:pic'))){const vector=pic.getElementsByTagName('asvg:svgBlip')[0],raster=pic.getElementsByTagName('a:blip')[0];if(!vector||!raster)continue;const svg=targets.get(vector.getAttribute('r:embed')),png=targets.get(raster.getAttribute('r:embed'));if(!svg||!png||done.has(png)||!zip.file(svg)||!zip.file(png))continue;
   const source=await zip.file(svg).async('string'),im=await loadImage(Buffer.from(source)),scale=1600/Math.max(1,im.width),canvas=createCanvas(1600,Math.max(1,Math.ceil(im.height*scale)));canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);zip.file(png,await canvas.encode('png'));done.add(png);
  }
 }

 for(const file of Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))){const xml=await zip.file(file).async('string');if(!xml.includes('<p:transition'))zip.file(file,xml.replace('</p:sld>','<p:transition spd="med"><p:fade/></p:transition></p:sld>'));}
 bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});return {bytes,slides:frames.length,editableText:true,vectorGraphics:true,svgImages:svgImages.length,warnings:[]};
}
run().then(result=>parentPort.postMessage({ok:true,result}),error=>parentPort.postMessage({ok:false,error:{code:error.code||'EXPORT_FAILED',message:error.message}}));
