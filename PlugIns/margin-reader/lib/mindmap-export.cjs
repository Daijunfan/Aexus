'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const S=require('./safety.cjs'),M=require('./study-model.cjs');
async function svgDocument(set,{scope='all',rootId,includeImages=true}={}){
 const {markerSvg}=await import('../ui/mindmap-markers.mjs'),{relationshipRoute}=await import('../ui/mindmap-style.mjs');
 const {layoutMindmap}=await import('../ui/mindmap-layout.mjs'),{diagramPaths}=await import('../ui/mindmap-view.mjs'),{svgShape,escapeXml:E}=await import('../ui/mindmap-style.mjs');
 const options={...set.map,mindmap:{...set.map?.mindmap,enabled:true,items:(set.map?.mindmap?.items||[]).map(i=>scope==='all'&&i.kind==='zone'?{...i,style:{...i.style,collapsed:false}}:i)},focusId:rootId||(scope==='visible'?set.map?.focusId:null),submapId:scope==='visible'?set.map?.submapId:null};
 const cards=scope==='all'&&!rootId?set.cards.map(c=>({...c,collapsed:false,submap:false,inMap:true})):set.cards;
 const {extendInkLayout}=await import('../ui/ink-binding.mjs'),{strokeSvg}=await import('../ui/ink-shapes.mjs'),I=require('./image-ink.cjs');
 const layout=extendInkLayout(set,layoutMindmap(cards,options));layout.setId=set.id;
 let body=diagramPaths(layout,set.links),images=0,inkStrokes=0,equationBytes=0;const visible=s=>!s.hidden&&(set.layers||[{id:'default',visible:true}]).some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt);
 for(const stroke of (set.canvasInk||[]).filter(visible)){const markup=strokeSvg(stroke,{color:set.colors[stroke.color]||stroke.color});body+=stroke.clip?`<svg x="${stroke.clip.x}" y="${stroke.clip.y}" width="${stroke.clip.width}" height="${stroke.clip.height}" viewBox="${stroke.clip.x} ${stroke.clip.y} ${stroke.clip.width} ${stroke.clip.height}" overflow="hidden">${markup}</svg>`:markup;inkStrokes++;}
 for(const card of cards){const p=layout.positions.get(card.id),t=layout.topics.get(card.id);if(!p)continue;const b=t.box,origin=`translate(${p.x} ${p.y})`;
  body+=`<g id="topic-${card.id}" transform="${origin}"><title>${E(card.title)}</title>${svgShape(t.shape,p.width,p.height,t,'shape-'+card.id)}`;
  const font=t.fontSize,anchor=t.align==='left'?'start':t.align==='right'?'end':'middle',x=t.align==='left'?b.padX:t.align==='right'?p.width-b.padX:p.width/2;
  const styled=line=>{const text=(t.prefix||'')+card.title,offset=(t.prefix||'').length,runs=(card.mindmap?.runs||[]).map(r=>({...r,start:r.start+offset,end:r.end+offset})),points=[line.start,...runs.flatMap(r=>[r.start,r.end]).filter(n=>n>line.start&&n<line.end),line.end].sort((a,b)=>a-b);return points.slice(1).map((end,i)=>{const start=points[i],r=runs.find(r=>r.start<=start&&r.end>=end),attrs=r?`${r.color?' fill="'+r.color+'"':''}${r.bold?' font-weight="700"':''}${r.italic?' font-style="italic"':''}${r.underline||r.strike?' text-decoration="'+[r.underline?'underline':'',r.strike?'line-through':''].filter(Boolean).join(' ')+'"':''}`:'';return `<tspan${attrs}>${E(text.slice(start,end))}</tspan>`;}).join('');};
  body+=`<text x="${x}" y="${b.padTop+font}" fill="${t.textColor}" font-family="${E(t.fontFamily)}" font-size="${font}" font-weight="${t.bold?'bold':'normal'}" font-style="${t.italic?'italic':'normal'}" text-anchor="${anchor}">${t.lines.map((l,i)=>`<tspan x="${x}" dy="${i?font*1.45:0}">${styled(l)}${l.ellipsis?'…':''}</tspan>`).join('')}</text>`;
  let y=b.padTop+b.titleHeight+b.titleBottom;const s=card.mindmap||{};if(b.markers){body+=markerSvg({...s,accent:t.accent},p.width,y,t.textColor,layout.config.paper);y+=b.markers;}
  if(b.mathHeight&&card.mindmap?.equation){const equationSvg=require('./mindmap-equation.cjs').render(card.mindmap.equation.latex).svg;equationBytes+=Buffer.byteLength(equationSvg);S.assert(equationBytes<=16*1024*1024,'TOO_LARGE','Formula paths exceed 16 MiB; export a smaller branch.');body+=equationSvg.replace('<svg ',`<svg x="${(p.width-b.mathWidth)/2}" y="${y+4}" width="${b.mathWidth}" height="${b.mathHeight-12}" color="${t.textColor}" `);y+=b.mathHeight;}
  if(t.showImage&&includeImages&&card.imageBytes){body+=`<image x="${b.imageLeft}" y="${y}" width="${b.imageWidth}" height="${b.imageHeight}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${Buffer.from(card.imageBytes).toString('base64')}"/>`;y+=b.imageHeight+10;images++;}
  if(t.showTags&&card.tags?.length){body+=`<text x="${p.width/2}" y="${y+15}" fill="${t.textColor}" font-size="11" font-family="system-ui" text-anchor="middle">${E(card.tags.slice(0,3).map(tag=>'#'+tag).join(' · '))}</text>`;y+=26;}
  if(t.showNote&&card.note){const {wrapLabel}=await import('../ui/mindmap-style.mjs');body+=wrapLabel(card.note,p.width-28,12).slice(0,3).map((l,i)=>`<text x="14" y="${y+13+i*17}" font-size="12" font-family="system-ui" fill="${t.textColor}">${E(l.text)}</text>`).join('');}
  for(const stroke of (card.ink||[]).filter(s=>s.reviewSide!=='front'&&visible(s)&&(!s.imageBound||p.imageBounds))){if(stroke.imageBound&&p.imageBounds&&card.image){const f=p.imageBounds;body+=`<svg x="${f.x*p.width}" y="${f.y*p.height}" width="${f.width*p.width}" height="${f.height*p.height}" viewBox="0 0 ${card.image.width} ${card.image.height}" overflow="hidden">${strokeSvg(I.project(stroke,I.unit),{width:card.image.width,height:card.image.height,color:set.colors[stroke.color]||stroke.color})}</svg>`;}else body+=strokeSvg(stroke,{width:p.width,height:p.height,color:set.colors[stroke.color]||stroke.color});inkStrokes++;}
  if(b.source&&t.showSources&&(card.source||card.anchor||card.reference))body+=`<a href="margin-reader://card/${set.id}/${card.id}"><text x="${p.width/2}" y="${p.height-(b.padBottom||0)-8}" fill="${t.textColor}" font-size="10" font-family="system-ui" text-anchor="middle">${E(card.source?.locator.page?'↗ '+card.source.locator.page:'↗ Source')}</text></a>`;
  body+='</g>';
 }
 const routes=(set.links||[]).filter(l=>!l.toSetId||l.toSetId===set.id).map(l=>relationshipRoute(l,layout.positions)).filter(Boolean),minX=Math.min(0,...routes.map(r=>r.box.x-12)),minY=Math.min(0,...routes.map(r=>r.box.y-12)),maxX=Math.max(layout.width,...routes.map(r=>r.box.x+r.box.width+12)),maxY=Math.max(layout.height,...routes.map(r=>r.box.y+r.box.height+12)),width=maxX-minX,height=maxY-minY;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="${E(set.title)}"><title>${E(set.title)}</title><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${layout.config.paper}"/>${body}</svg>`;
 S.assert(Buffer.byteLength(svg)<=64*1024*1024,'TOO_LARGE','Diagram SVG exceeds 64 MiB.');
 const text=[...svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<>]*)/g)].map(m=>m[1].replace(/&(amp|lt|gt|quot|#39);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]))).join(' ');
 return {svg,text,width,height,topics:layout.positions.size,images,inkStrokes};
}
async function exportMap(store,p){
 if(p.format==='pptx'||p.content==='pitch')return require('./mindmap-pitch-export.cjs').exportPitch(store,p);
 S.assert(['svg','png','pdf'].includes(p.format)&&p.path.toLowerCase().endsWith('.'+p.format),'INVALID_PARAMS','Choose an SVG, PNG or PDF destination with matching extension.');
 const target=await S.safePath(store.workspace,p.path);await require('./files.cjs').parentExists(store.workspace,p.path);S.assert(!(await S.exists(target)),'ALREADY_EXISTS','Export destination already exists.');
 const state=await store.load(),raw=M.findSet(state,p.setId);M.revision(raw,p.expectedRevision);if(p.rootId)M.card(raw,p.rootId);
 const set=await M.describe(store,state,raw);let mediaBytes=0;
 if(p.includeImages!==false)for(const c of set.cards)if(c.image&&(c.mindmap?.showImage??set.map?.mindmap?.showImages??false)){const bytes=(await require('./study-capture.cjs').cardImage(store,set.id,c.id)).bytes;mediaBytes+=bytes.length;S.assert(mediaBytes<=32*1024*1024,'TOO_LARGE','Selected diagram images exceed 32 MiB.');c.imageBytes=bytes;}
 const result=await svgDocument(set,p);let bytes=Buffer.from(result.svg),scale=1,details={};
 if(p.format!=='svg'){
  scale=Math.min(2,8192/result.width,8192/result.height,Math.sqrt(24000000/(result.width*result.height)));
  const jobs=require('./worker-jobs.cjs').createWorkerJobs(path.join(__dirname,'mindmap-export-worker.cjs'),{timeout:60000,memory:512});
  try{const out=await jobs.run({...result,scale,format:p.format,pdfMode:p.pdfMode,paper:p.paper,title:set.title});bytes=Buffer.from(out.bytes);if(out.vector){const {bytes:_,...meta}=out;details=meta;scale=out.scale;}}finally{await jobs.close();}
 }
 await store.transaction(async(fresh,rollback)=>{M.revision(M.findSet(fresh,p.setId),p.expectedRevision);await S.safePath(store.workspace,p.path);await S.writeNew(target,bytes);rollback(()=>fs.rm(target,{force:true}));});
 return {path:p.path,format:p.format,bytes:bytes.length,topics:result.topics,images:result.images,inkStrokes:result.inkStrokes,width:Math.ceil(result.width*scale),height:Math.ceil(result.height*scale),rasterized:p.format!=='svg'&&!details.vector,scale,...details};
}
module.exports={svgDocument,exportMap};
