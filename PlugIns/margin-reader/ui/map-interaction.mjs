export function rootSelection(cards,ids){
 const selected=new Set(ids),byId=new Map(cards.map(c=>[c.id,c]));
 return cards.filter(c=>{if(!selected.has(c.id))return false;let parent=c.parentId;const seen=new Set();while(parent){if(seen.has(parent))return false;seen.add(parent);if(selected.has(parent))return false;parent=byId.get(parent)?.parentId;}return true;});
}
export function curvePath(link,positions){
 const a=positions.get(link.from),b=positions.get(link.to);if(!a||!b)return '';
 const start=[a.x+a.width/2,a.y+a.height/2],end=[b.x+b.width/2,b.y+b.height/2];
 if(link.curve?.length>=2){
  const first=link.curve[0],last=link.curve.at(-1),count=link.curve.length-1;
  return link.curve.map((p,i)=>{const t=i/count,x=p[0]+(start[0]-first[0])*(1-t)+(end[0]-last[0])*t,y=p[1]+(start[1]-first[1])*(1-t)+(end[1]-last[1])*t;return `${i?'L':'M'}${x},${y}`;}).join(' ');
 }
 return `M${start.join(',')} Q${Math.min(a.x,b.x)-45},${(a.y+b.y)/2} ${end.join(',')}`;
}
export function pointInside(point,polygon){
 let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
export function selectedRegion(positions,start,end,polygon){
 const x=Math.min(start[0],end[0]),y=Math.min(start[1],end[1]),right=Math.max(start[0],end[0]),bottom=Math.max(start[1],end[1]);
 return [...positions].filter(([,p])=>polygon?pointInside([p.x+p.width/2,p.y+p.height/2],polygon):p.x<right&&p.x+p.width>x&&p.y<bottom&&p.y+p.height>y).map(([id])=>id);
}
