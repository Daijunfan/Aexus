// Disposable presentation index. Persistent geometry remains in the shared Core.
const CELL = 1024;
export function intersects(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
export class ViewportIndex {
  constructor(entries) {
    this.entries = new Map(entries); this.cells = new Map(); this.large = [];
    for (const [id, box] of this.entries) {
      const x1=Math.floor(box.x/CELL), x2=Math.floor((box.x+box.width)/CELL), y1=Math.floor(box.y/CELL), y2=Math.floor((box.y+box.height)/CELL);
      // Oversized freehand bounds must not allocate millions of grid buckets.
      if ((x2-x1+1)*(y2-y1+1)>64) { this.large.push(id); continue; }
      for(let x=x1;x<=x2;x++) for(let y=y1;y<=y2;y++) {
        const key=x+','+y; let bucket=this.cells.get(key); if(!bucket)this.cells.set(key,bucket=[]); bucket.push(id);
      }
    }
  }
  query(box) {
    const found=new Set(), x1=Math.floor(box.x/CELL), x2=Math.floor((box.x+box.width)/CELL), y1=Math.floor(box.y/CELL), y2=Math.floor((box.y+box.height)/CELL);
    const add=id=>{if(!found.has(id)&&intersects(this.entries.get(id),box))found.add(id);};
    if((x2-x1+1)*(y2-y1+1)>4096) { for(const id of this.entries.keys())add(id); return found; }
    for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)for(const id of this.cells.get(x+','+y)||[])add(id);
    this.large.forEach(add); return found;
  }
}
export function cardPaintBounds(card, box) {
  let x=box.x,y=box.y,right=x+box.width,bottom=y+box.height;
  for(const stroke of card.ink||[]) {
    if(stroke.hidden||stroke.imageBound||stroke.reviewSide==='front')continue;
    const pad=(stroke.width||0)*box.width/2;
    for(const p of stroke.points||[]) { const px=box.x+p[0]*box.width,py=box.y+p[1]*box.height; x=Math.min(x,px-pad);y=Math.min(y,py-pad);right=Math.max(right,px+pad);bottom=Math.max(bottom,py+pad); }
  }
  return {x,y,width:right-x,height:bottom-y};
}
export function viewportBox(viewport, zoom, overscan=220) {
  return {x:(viewport.scrollLeft-overscan)/zoom,y:(viewport.scrollTop-overscan)/zoom,width:(viewport.clientWidth+overscan*2)/zoom,height:(viewport.clientHeight+overscan*2)/zoom};
}
