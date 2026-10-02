const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// y positions in persisted locators always address the unchanged original page.
// This layout inserts note bands and replaces folded intervals in display space.
export function pageSlices(sourceHeight,folds=[],notes=[],scale=1){
  const hidden=folds.filter(f=>f.folded!==false&&!f.deletedAt).sort((a,b)=>a.start-b.start);
  const inserts=notes.filter(c=>c.anchor?.display==='embedded').map(c=>({id:c.id,at:clamp(c.anchor.locator.pageOffset??1,0,1),height:(c.anchor.height||150)*scale,card:c})).sort((a,b)=>a.at-b.at);
  const events=[...hidden.map(f=>({type:'fold',at:f.start,end:f.end,fold:f,height:30})),...inserts.map(n=>({type:'note',...n}))].sort((a,b)=>a.at-b.at||(a.type==='note'?-1:1));
  const blocks=[];let cursor=0,top=0;
  const source=(end)=>{if(end>cursor){const height=(end-cursor)*sourceHeight;blocks.push({type:'source',start:cursor,end,top,height});top+=height;cursor=end;}};
  for(const event of events){
    if(event.at<cursor-1e-9){if(event.type==='note')continue;else continue;}
    source(event.at);
    blocks.push({...event,top,start:event.at});top+=event.height;
    if(event.type==='fold')cursor=event.end;
  }
  source(1);
  return {sourceHeight,height:top,blocks};
}
export function sourceY(layout,displayY){
  const y=clamp(displayY,0,layout.height);
  for(const b of layout.blocks){if(y<b.top+b.height-1e-9||y===layout.height&&b===layout.blocks.at(-1)){return b.type==='source'?clamp(b.start+(y-b.top)/layout.sourceHeight,b.start,b.end):b.start;}}
  return 1;
}
export function displayY(layout,normalized){
  const y=clamp(normalized,0,1);
  // A source position exactly on a note boundary addresses the source AFTER it.
  for(const b of layout.blocks){
    if(b.type==='source'&&y>=b.start-1e-9&&(y<b.end-1e-9||y===1&&b.end===1))return b.top+(y-b.start)*layout.sourceHeight;
    if(b.type==='fold'&&y>=b.start&&y<b.end)return b.top;
  }
  return layout.height;
}
export function projectRects(layout,rect,width){
  const out=[];
  for(const b of layout.blocks){if(b.type!=='source')continue;const top=Math.max(rect.y,b.start),bottom=Math.min(rect.y+rect.height,b.end);if(bottom<=top)continue;out.push({x:rect.x*width,y:b.top+(top-b.start)*layout.sourceHeight,width:rect.width*width,height:(bottom-top)*layout.sourceHeight,sourceStart:top,sourceEnd:bottom});}
  return out;
}
export function sourceRects(layout,rect,width){
  const out=[];
  for(const b of layout.blocks){if(b.type!=='source')continue;const top=Math.max(rect.y,b.top),bottom=Math.min(rect.y+rect.height,b.top+b.height);if(bottom<=top)continue;out.push({x:clamp(rect.x/width,0,1),y:b.start+(top-b.top)/layout.sourceHeight,width:Math.min(1-rect.x/width,rect.width/width),height:(bottom-top)/layout.sourceHeight});}
  return out;
}
export function pagePoint(page,x,y){const box=page.getBoundingClientRect();return [clamp((x-box.left)/box.width,0,1),page.pageSlices?sourceY(page.pageSlices,y-box.top):clamp((y-box.top)/box.height,0,1)];}
export function sourceRectangle(page,rect){
  const box=page.getBoundingClientRect(),x=clamp(rect.left-box.left,0,box.width),y=clamp(rect.top-box.top,0,box.height),right=clamp(rect.left+rect.width-box.left,0,box.width),bottom=clamp(rect.top+rect.height-box.top,0,box.height);
  if(right<=x||bottom<=y)return [];
  const local={x,y,width:right-x,height:bottom-y};
  return page.pageSlices?sourceRects(page.pageSlices,local,box.width):[{x:x/box.width,y:y/box.height,width:local.width/box.width,height:local.height/box.height}];
}
export function strokeSlices(page,svg){
  const layout=page.pageSlices,w=page.clientWidth;
  if(!layout||layout.blocks.length===1)return svg;
  return layout.blocks.filter(b=>b.type==='source').map(b=>`<svg x="0" y="${b.top}" width="${w}" height="${b.height}" viewBox="0 ${b.start*layout.sourceHeight} ${w} ${b.height}" preserveAspectRatio="none" overflow="hidden">${svg}</svg>`).join('');
}
