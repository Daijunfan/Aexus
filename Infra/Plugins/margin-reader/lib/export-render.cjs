'use strict';
const {createCanvas,loadImage,Path2D}=require('@napi-rs/canvas');
const {PDFDocument,degrees}=require('pdf-lib');
const {assert}=require('./safety.cjs');
const M=require('./study-model.cjs');
const color=v=>M.COLORS[v]||v||'#20252d';
function lines(ctx,text,width){const out=[];for(const paragraph of String(text||'').split('\n')){let line='';for(const ch of paragraph){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line='';}line+=ch;}out.push(line);}return out;}
function write(ctx,text,x,y,width,height,size=14){ctx.font=`${size}px sans-serif`;ctx.textBaseline='top';const rows=lines(ctx,text,width),n=Math.max(0,Math.floor(height/(size*1.45)));rows.slice(0,n).forEach((r,i)=>ctx.fillText(r,x,y+i*size*1.45));if(rows.length>n&&n)ctx.fillText('…',x+width-size,y+(n-1)*size*1.45);return Math.min(rows.length,n)*size*1.45;}
function stroke(ctx,s,width,height){
  if(s.hidden)return;ctx.save();ctx.strokeStyle=color(s.color);ctx.globalAlpha=s.opacity??(s.brush==='highlighter'?.35:1);ctx.lineCap='round';ctx.lineJoin='round';
  const pressure=s.points[0]?.[2]??1,constant=s.brush==='highlighter'||s.points.every(p=>(p[2]??1)===pressure);
  if(constant){ctx.lineWidth=s.width*width*(s.brush==='highlighter'?1:.2+.8*pressure);ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p[0]*width,p[1]*height):ctx.moveTo(p[0]*width,p[1]*height));ctx.stroke();}
  else for(let i=1;i<s.points.length;i++){const a=s.points[i-1],b=s.points[i];ctx.lineWidth=s.width*width*(.2+.8*(b[2]??1));ctx.beginPath();ctx.moveTo(a[0]*width,a[1]*height);ctx.lineTo(b[0]*width,b[1]*height);ctx.stroke();}ctx.restore();
}
async function mapPdf(set,p){
  assert(set.cards.length<=2000,'TOO_LARGE','Choose at most 2000 cards for one map export.');
  const {layoutStudy,branchPath}=await import('../ui/study-map-layout.mjs');
  const cards=p.expanded?set.cards.map(c=>({...c,collapsed:false,submap:false})):set.cards;
  const {extendInkLayout}=await import('../ui/ink-binding.mjs'),layout=extendInkLayout({...set,map:{...set.map,focusId:p.rootId||set.map?.focusId},cards},layoutStudy(cards,{...set.map,...(p.rootId?{focusId:p.rootId}:{}),...(p.expanded?{submapId:null}:{})},set.appearance)),output=await PDFDocument.create();
  const pageWidth=p.poster?Math.min(10000,layout.width):1191,pageHeight=p.poster?Math.min(10000,layout.height):842;
  const scale=p.poster?Math.min(1,pageWidth/layout.width,pageHeight/layout.height):1;
  const cols=p.poster?1:Math.ceil(layout.width/pageWidth),rows=p.poster?1:Math.ceil(layout.height/pageHeight);
  assert(cols*rows<=256,'TOO_LARGE','Map would exceed 256 print sheets; reduce the branch scope or use poster mode.');
  const images=new Map();for(const c of cards)if(c.imageBytes)images.set(c.id,await loadImage(c.imageBytes));
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const resolution=Math.min(1.7,Math.sqrt(8000000/(pageWidth*pageHeight))),canvas=createCanvas(Math.ceil(pageWidth*resolution),Math.ceil(pageHeight*resolution)),ctx=canvas.getContext('2d');
    ctx.fillStyle=set.appearance?.background||'#f7f8fa';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(resolution*scale,resolution*scale);ctx.translate(-col*pageWidth,-row*pageHeight);
    ctx.strokeStyle='#a2adb9';ctx.lineWidth=2;
    for(const l of layout.links)ctx.stroke(new Path2D(branchPath(layout.positions.get(l.from),layout.positions.get(l.to),l.style)));
    for(const link of set.links||[]){const a=layout.positions.get(link.from),b=(!link.toSetId||link.toSetId===set.id)&&layout.positions.get(link.to);if(!a||!b)continue;ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle='#ad7897';ctx.beginPath();ctx.moveTo(a.x+a.width/2,a.y+a.height/2);if(link.curve?.length)for(const [x,y] of link.curve)ctx.lineTo(x,y);ctx.lineTo(b.x+b.width/2,b.y+b.height/2);ctx.stroke();ctx.restore();}
    const visible=new Set((set.layers||[]).filter(l=>l.visible&&!l.deletedAt).map(l=>l.id));
    for(const s of set.canvasInk||[])if(visible.has(s.layerId||'default'))stroke(ctx,{...s,width:s.width},1,1);
    for(const c of cards){const box=layout.positions.get(c.id);if(!box)continue;
      if(!p.poster&&(box.x+box.width<col*pageWidth||box.x>(col+1)*pageWidth||box.y+box.height<row*pageHeight||box.y>(row+1)*pageHeight))continue;
      ctx.save();ctx.translate(box.x,box.y);ctx.fillStyle=c.style?.background||'#fff';ctx.fillRect(0,0,box.width,box.height);ctx.strokeStyle=color(c.color);ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,box.width-3,box.height-3);ctx.save();ctx.beginPath();ctx.rect(5,5,box.width-10,box.height-10);ctx.clip();
      ctx.fillStyle='#202a37';const titleHeight=write(ctx,c.title,12,12,box.width-24,62,16),top=20+titleHeight,image=images.get(c.id);
      if(image){const fit=Math.min((box.width-24)/image.width,(box.height-top-30)/image.height);ctx.drawImage(image,12,top,image.width*fit,image.height*fit);}
      else write(ctx,c.editedText??c.text,12,top,box.width-24,box.height-top-30,c.style?.fontSize||set.appearance?.fontSize||13);
      ctx.fillStyle='#657486';write(ctx,c.source?(c.source.locator.page?'PDF · '+c.source.locator.page:'Section · '+(c.source.locator.section+1)):(c.tags||[]).join(' · '),12,box.height-22,box.width-24,18,10);
      ctx.restore();for(const s of c.ink||[])if(visible.has(s.layerId||'default'))stroke(ctx,s,box.width,box.height);
      ctx.restore();
    }
    const image=await output.embedPng(await canvas.encode('png')),page=output.addPage([pageWidth,pageHeight]);page.drawImage(image,{x:0,y:0,width:pageWidth,height:pageHeight});
  }
  output.setTitle(set.title);output.setProducer('Margin Reader local map exporter');return {bytes:Buffer.from(await output.save()),pages:output.getPageCount(),cards:layout.positions.size,rasterized:true};
}
async function annotatedPdf(args){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),path=require('node:path'),base=path.dirname(require.resolve('pdfjs-dist/package.json'));
  const sourceBytes=Buffer.from(args.sourceBytes),output=await PDFDocument.load(sourceBytes),task=pdfjs.getDocument({data:new Uint8Array(sourceBytes),password:args.password,isEvalSupported:false,verbosity:0,cMapUrl:path.join(base,'cmaps')+path.sep,cMapPacked:true,standardFontDataUrl:path.join(base,'standard_fonts')+path.sep,wasmUrl:path.join(base,'wasm')+path.sep});
  const warnings=[],notes=[];let annotations=0;
  try{
    const source=await task.promise;
    for(let index=0;index<source.numPages;index++){
      const pdfPage=await source.getPage(index+1),viewport=pdfPage.getViewport({scale:1}),w=viewport.width,h=viewport.height,ratio=Math.min(2,Math.sqrt(6000000/(w*h))),canvas=createCanvas(Math.ceil(w*ratio),Math.ceil(h*ratio)),ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);let dirty=false;
      for(const set of args.sets){const layers=new Set((set.layers||[]).filter(l=>l.visible&&!l.deletedAt).map(l=>l.id));
        for(const c of set.cards){
          if(c.anchor?.documentId===args.document.id&&c.anchor.locator.page===index+1&&!c.anchorChanged)notes.push({page:index+1,title:c.title,text:c.editedText??c.text,note:c.note});
          if(c.source?.documentId!==args.document.id||c.annotation?.visible===false)continue;
          if(c.sourceChanged){warnings.push(`Skipped stale excerpt: ${c.id}`);continue;}
          const rects=c.source.selection.rects?.filter(r=>r.page===index+1)||[];if(!rects.length)continue;
          ctx.save();ctx.fillStyle=ctx.strokeStyle=color(c.color);ctx.lineWidth=1.5;ctx.globalAlpha=(c.annotation?.style||'highlight')==='highlight'?.3:.9;
          if(c.source.selection.polygon){ctx.beginPath();c.source.selection.polygon.points.forEach((p,i)=>i?ctx.lineTo(p[0]*w,p[1]*h):ctx.moveTo(p[0]*w,p[1]*h));ctx.closePath();ctx.clip();}
          for(const r of rects){const x=r.x*w,y=r.y*h,width=r.width*w,height=r.height*h;switch(c.annotation?.style){case'box':ctx.strokeRect(x,y,width,height);break;case'underline':case'strike':ctx.beginPath();ctx.moveTo(x,y+height*(c.annotation.style==='strike'?.5:1));ctx.lineTo(x+width,y+height*(c.annotation.style==='strike'?.5:1));ctx.stroke();break;default:ctx.fillRect(x,y,width,height);}annotations++;dirty=true;}
          ctx.restore();
        }
        for(const s of set.ink||[])if(s.documentId===args.document.id&&s.page===index+1&&!s.sourceChanged&&layers.has(s.layerId||'default')){stroke(ctx,s,w,h);dirty=true;annotations++;}
      }
      if(dirty){const image=await output.embedPng(await canvas.encode('png')),bl=viewport.convertToPdfPoint(0,h),br=viewport.convertToPdfPoint(w,h),tl=viewport.convertToPdfPoint(0,0),angle=Math.atan2(br[1]-bl[1],br[0]-bl[0])*180/Math.PI;
        output.getPage(index).drawImage(image,{x:bl[0],y:bl[1],width:Math.hypot(br[0]-bl[0],br[1]-bl[1]),height:Math.hypot(tl[0]-bl[0],tl[1]-bl[1]),rotate:degrees(angle)});
      }
      pdfPage.cleanup();
    }
    const selected=args.pages||Array.from({length:source.numPages},(_,i)=>i+1),kept=args.omitFolded?selected.filter(n=>!args.document.foldedPages.includes(n)):selected;
    assert(kept.length,'INVALID_PARAMS','Select at least one unfolded page.');
    const result=await PDFDocument.create();for(const page of await result.copyPages(output,kept.map(n=>n-1)))result.addPage(page);
    if(args.includeNotes!==false&&notes.length){warnings.push('Extended notes are appended as readable note pages; originals and their selectable PDF text remain unchanged.');
      for(const note of notes.filter(n=>kept.includes(n.page))){const canvas=createCanvas(1190,1684),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1190,1684);ctx.fillStyle='#202a37';write(ctx,`Page ${note.page} · ${note.title}`,80,75,1030,150,32);const text=[note.text,note.note].filter(Boolean).join('\n\n');ctx.font='24px sans-serif';const all=lines(ctx,text,1030);
        for(let start=0;start<all.length||start===0;start+=39){ctx.fillStyle='#fff';ctx.fillRect(0,230,1190,1454);ctx.fillStyle='#202a37';write(ctx,all.slice(start,start+39).join('\n'),80,240,1030,1360,24);const image=await result.embedPng(await canvas.encode('png'));result.addPage([595,842]).drawImage(image,{x:0,y:0,width:595,height:842});}
      }
    }
    result.setTitle(args.document.title);result.setProducer('Margin Reader annotated PDF export');return {bytes:Buffer.from(await result.save()),pages:result.getPageCount(),annotations,warnings:[...new Set(warnings)],originalTextPreserved:true};
  }finally{await task.destroy();}
}
module.exports={mapPdf,annotatedPdf,lines,write,stroke};
