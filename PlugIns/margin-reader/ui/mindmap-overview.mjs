// At whole-map zoom, topics smaller than readable text are represented by
// batched glyphs. Every visible topic remains in this layer and in hit testing;
// selected/focused topics can still mount their full accessible HTML.
export function overviewGlyphs(layout,ids,selected){
 const groups=new Map();let count=0;
 for(const id of ids){if(id===selected)continue;const p=layout.positions.get(id),t=layout.topics.get(id);if(!p||!t)continue;const color=t.fill==='none'?t.accent:t.fill,key=color+'|'+t.borderColor;
  if(!groups.has(key))groups.set(key,{fill:color,stroke:t.borderColor,paths:[]});groups.get(key).paths.push(`M${p.x},${p.y}h${p.width}v${p.height}h-${p.width}Z`);count++;
 }
 return {count,svg:`<g class="mm-overview-glyphs" aria-label="${count} 个完整主题的缩略表示">${[...groups.values()].map(g=>`<path d="${g.paths.join(' ')}" fill="${g.fill}" stroke="${g.stroke}" stroke-width="1.3"/>`).join('')}</g>`};
}
export function hitTopic(layout,x,y,tolerance=0){
 let hit=null;for(const [id,p]of layout.positions)if(x>=p.x&&y>=p.y&&x<=p.x+p.width&&y<=p.y+p.height){const score=p.width*p.height;if(!hit||score<hit.score)hit={id,score};}if(hit)return hit.id;
 // At overview scales a topic can be narrower than one physical input pixel.
 // A small screen-space tolerance resolves its nearest center; it does not
 // change the stored topic rectangles or source-document coordinates.
 if(tolerance>0){let distance=tolerance;for(const [id,p]of layout.positions){const d=Math.hypot(x-p.x-p.width/2,y-p.y-p.height/2);if(d<distance){distance=d;hit={id};}}}
 return hit?.id||null;
}
