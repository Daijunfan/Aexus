// Mixed-layout roots can sit behind their own descendants. Route the incoming
// connector around that subtree's outer corridor rather than through its text.
export function mixedConnector(parent,n,x,y,incoming={},spacing=16){
 if(!parent||incoming.chain||!n.placements.length||incoming.route)return null;
 const target={x:x+n.x,y:y+n.y,width:n.width,height:n.height},box={x,y,width:n.w,height:n.h},pc=[parent.x+parent.width/2,parent.y+parent.height/2],tc=[target.x+target.width/2,target.y+target.height/2];
 const natural=incoming.vertical?(pc[1]<tc[1]?'top':'bottom'):(pc[0]<tc[0]?'left':'right');
 const gaps={left:n.x,right:n.w-n.x-n.width,top:n.y,bottom:n.h-n.y-n.height};if(gaps[natural]<.1)return null;
 const ports={left:[target.x,tc[1]],right:[target.x+target.width,tc[1]],top:[tc[0],target.y],bottom:[tc[0],target.y+target.height]};
 const candidates=Object.keys(gaps).filter(k=>gaps[k]<.1),side=(candidates.length?candidates:['top','bottom']).sort((a,b)=>Math.hypot(ports[a][0]-pc[0],ports[a][1]-pc[1])-Math.hypot(ports[b][0]-pc[0],ports[b][1]-pc[1]))[0];
 const pad=Math.min(12,Math.max(6,spacing/2-1)),end=ports[side],start=incoming.vertical?[pc[0],pc[1]<tc[1]?parent.y+parent.height:parent.y]:[pc[0]<tc[0]?parent.x+parent.width:parent.x,pc[1]];
 const bx=pc[0]<box.x+box.width/2?box.x-pad:box.x+box.width+pad,by=pc[1]<box.y+box.height/2?box.y-pad:box.y+box.height+pad;
 if(side==='top'||side==='bottom'){const ey=side==='top'?box.y-pad:box.y+box.height+pad;return [start,[bx,start[1]],[bx,ey],[end[0],ey],end];}
 const ex=side==='left'?box.x-pad:box.x+box.width+pad;return [start,[bx,start[1]],[bx,by],[ex,by],[ex,end[1]],end];
}
export function roundedRoute(points,radius=10){
 const ps=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.01);if(!ps.length)return '';
 let d='M'+ps[0].join(',');for(let i=1;i<ps.length-1;i++){const a=ps[i-1],b=ps[i],c=ps[i+1],ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),r=Math.min(radius,ab/2,bc/2),p=[b[0]+(a[0]-b[0])*r/ab,b[1]+(a[1]-b[1])*r/ab],q=[b[0]+(c[0]-b[0])*r/bc,b[1]+(c[1]-b[1])*r/bc];d+=` L${p} Q${b} ${q}`;}if(ps.length>1)d+=' L'+ps.at(-1).join(',');return d;
}
