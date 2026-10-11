const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rulerEdges(box,pose,thickness=48){
 const angle=pose.angle*Math.PI/180,u=[Math.cos(angle),Math.sin(angle)],n=[-u[1],u[0]],length=box.width*pose.length,c=[box.left+box.width*pose.x,box.top+box.height*pose.y];
 return [-1,1].map((side,i)=>({group:i===0?'top':'bottom',a:[c[0]-u[0]*length/2+n[0]*thickness/2*side,c[1]-u[1]*length/2+n[1]*thickness/2*side],b:[c[0]+u[0]*length/2+n[0]*thickness/2*side,c[1]+u[1]*length/2+n[1]*thickness/2*side],t0:0,t1:1}));
}
export function clipEdge(edge,rect){
 const [x,y]=edge.a,dx=edge.b[0]-x,dy=edge.b[1]-y;let low=0,high=1;
 for(const [p,q] of [[-dx,x-rect.left],[dx,rect.right-x],[-dy,y-rect.top],[dy,rect.bottom-y]]){if(Math.abs(p)<1e-10){if(q<0)return null;}else if(p<0)low=Math.max(low,q/p);else high=Math.min(high,q/p);}
 if(high<=low)return null;return {...edge,a:[x+dx*low,y+dy*low],b:[x+dx*high,y+dy*high],t0:edge.t0+(edge.t1-edge.t0)*low,t1:edge.t0+(edge.t1-edge.t0)*high};
}
/** Project only gestures running along a nearby finite edge. Fragments retain pressure. */
export function snapRuler(points,ruler,aspect=1,bands){
 if(!ruler?.edges?.length||points.length<2)return null;
 const scale=p=>[p[0],p[1]*aspect],edges=ruler.edges.map((e,id)=>{const a=scale(e.a),b=scale(e.b),v=sub(b,a),length=Math.hypot(...v);return {...e,id,a,b,v,length,t0:e.t0??0,t1:e.t1??1};}).filter(e=>e.length>1e-10);
 const visible=p=>!bands||bands.some(b=>p[1]>b.start&&p[1]<b.end||b.start===0&&p[1]===0||b.end===1&&p[1]===1),raw=points.filter(visible);if(raw.length<2)return null;
 const nearest=(point,candidates)=>{const p=scale(point);let best;for(const e of candidates){const t=clamp(dot(sub(p,e.a),e.v)/(e.length*e.length),0,1),q=lerp(e.a,e.b,t),distance=Math.hypot(...sub(p,q));if(!best||distance<best.distance)best={edge:e,t:e.t0+(e.t1-e.t0)*t,distance,normal:(e.v[0]*(p[1]-q[1])-e.v[1]*(p[0]-q[0]))/e.length,point};}return best;};
 const first=nearest(raw[0],edges);if(!first||first.distance>ruler.tolerance)return null;const group=edges.filter(e=>e.group===first.edge.group),samples=raw.map(p=>nearest(p,group));if(samples.some(p=>p.distance>ruler.tolerance))return null;
 const span=(Math.max(...samples.map(p=>p.t))-Math.min(...samples.map(p=>p.t)))*first.edge.length/(first.edge.t1-first.edge.t0),normal=Math.max(...samples.map(p=>p.normal))-Math.min(...samples.map(p=>p.normal));if(span<1e-8||span<normal*2)return null;
 const paths=[];let lastEdge=null,total=0;
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1],b=samples[i],lo=Math.min(a.t,b.t),hi=Math.max(a.t,b.t);if(hi-lo<1e-12)continue;
  const selected=group.filter(e=>e.t1>lo&&e.t0<hi).sort((x,y)=>(x.t0-y.t0)*(b.t>=a.t?1:-1));
  for(const e of selected){const low=Math.max(lo,e.t0),high=Math.min(hi,e.t1),ts=b.t>=a.t?[low,high]:[high,low],pair=ts.map(t=>{const p=lerp(e.a,e.b,(t-e.t0)/(e.t1-e.t0)),value=[p[0],p[1]/aspect];if(a.point.length===3||b.point.length===3){const ratio=(t-a.t)/(b.t-a.t),pressure=ratio<=0?(a.point[2]??1):ratio>=1?(b.point[2]??1):(a.point[2]??1)+((b.point[2]??1)-(a.point[2]??1))*ratio;value.push(clamp(pressure,0,1));}return value;});
   const current=paths.at(-1);if(current&&lastEdge===e.id&&Math.hypot(current.at(-1)[0]-pair[0][0],current.at(-1)[1]-pair[0][1])<1e-8){current.push(pair[1]);total++;}else{paths.push(pair);total+=2;}lastEdge=e.id;if(paths.length>256||total>4096)return {kind:'free',points,overflow:true};
  }
 }
 return paths.length?{kind:'ruler',points:paths[0],...(paths.length>1?{paths}:{})}:null;
}
