// Structural strokes are shared by the interactive canvas and vector export.
export function furnitureMarkup(f){const markup=shape(f);return markup?`<g data-mm-furniture="${f.id||''}">${markup}</g>`:'';}
function shape(f){
  if(f.kind==='lines')return `<path class="mm-structural-lines" d="${f.segments.map(s=>'M'+s.map(p=>p.join(',')).join(' L')).join(' ')}" fill="none" stroke="${f.color}" stroke-width="${f.lineWidth||1.5}" stroke-linejoin="round" stroke-linecap="round"/>`;
  if(f.kind==='bracket'){
    const x=f.x,y=f.y,h=f.height,w=f.width,m=y+h/2,r=Math.min(12,h/4);
    return `<path class="mm-brace" d="M${x+w},${y} Q${x},${y} ${x},${y+r} V${m-r} Q${x},${m} ${x-7},${m} Q${x},${m} ${x},${m+r} V${y+h-r} Q${x},${y+h} ${x+w},${y+h}" fill="none" stroke="${f.color}" stroke-width="1.7" stroke-linecap="round"/>`;
  }
  if(f.kind==='grid')return `<g class="mm-table-grid" fill="none" stroke="${f.color}" stroke-width=".8"><rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}"/>${f.columns.map(x=>`<path d="M${x},${f.y} V${f.y+f.height}" fill="none" stroke="${f.color}" stroke-width=".8"/>`).join('')}${f.rows.map(y=>`<path d="M${f.x},${y} H${f.x+f.width}" fill="none" stroke="${f.color}" stroke-width=".8"/>`).join('')}</g>`;
  return '';
}
export function taperedBranch(link,positions){
  if(link.hidden||link.points||link.spine)return null;
  let a=positions.get(link.from),b=positions.get(link.to);if(!a||!b)return null;
  const vertical=link.vertical,back=vertical?b.y+b.height/2<a.y+a.height/2:b.x+b.width/2<a.x+a.width/2;
  const start=vertical?[a.y+(back?0:a.height),a.x+a.width/2]:[a.x+(back?0:a.width),a.y+(link.fromBaseline?a.height:a.height/2)];
  const end=vertical?[b.y+(back?b.height:0),b.x+b.width/2]:[b.x+(back?b.width:0),b.y+(link.toBaseline?b.height:b.height/2)];
  const [x,y]=start,[tx,ty]=end,m=(x+tx)/2,w=Math.max(1.2,link.width)*.7,t=Math.max(.55,link.width*.22),p=(x,y)=>vertical?`${y},${x}`:`${x},${y}`;
  return `M${p(x,y-w)} C${p(m,y-w)} ${p(m,ty-t)} ${p(tx,ty-t)} L${p(tx,ty+t)} C${p(m,ty+t)} ${p(m,y+w)} ${p(x,y+w)} Z`;
}
