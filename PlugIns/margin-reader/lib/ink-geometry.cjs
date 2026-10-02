'use strict';
const EPS=1e-10;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
function quadratic(a,b,c,lo,hi){
  if(Math.abs(a)<EPS){if(Math.abs(b)<EPS)return c<=0?[[lo,hi]]:[];const t=-c/b;const x=b>0?[lo,Math.min(hi,t)]:[Math.max(lo,t),hi];return x[1]>x[0]? [x]:[];}
  const disc=b*b-4*a*c;if(disc<0)return [];
  const root=Math.sqrt(Math.max(0,disc)),l=Math.max(lo,(-b-root)/(2*a)),r=Math.min(hi,(-b+root)/(2*a));return r>l?[[l,r]]:[];
}
// Exact intersection of one stroke segment with the capsule swept by an eraser
// segment. Projection breakpoints divide endpoint circles from the straight body.
function capsule(a,b,c,d,radius){
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),vv=dot(v,v),bounds=[0,1];
  const alpha=vv<EPS?0:dot(w,v)/vv,beta=vv<EPS?0:dot(u,v)/vv;
  if(Math.abs(beta)>EPS)for(const q of [0,1]){const t=(q-alpha)/beta;if(t>0&&t<1)bounds.push(t);}
  bounds.sort((a,b)=>a-b);const out=[];
  for(let i=1;i<bounds.length;i++){
    const lo=bounds[i-1],hi=bounds[i],q=alpha+beta*(lo+hi)/2;let x,y;
    if(vv<EPS||q<=0){x=w;y=u;}else if(q>=1){x=sub(a,d);y=u;}else{x=[w[0]-v[0]*alpha,w[1]-v[1]*alpha];y=[u[0]-v[0]*beta,u[1]-v[1]*beta];}
    out.push(...quadratic(dot(y,y),2*dot(x,y),dot(x,x)-radius*radius,lo,hi));
  }
  return out;
}
function merge(values){const sorted=values.sort((a,b)=>a[0]-b[0]),out=[];for(const v of sorted){const last=out.at(-1);if(last&&v[0]<=last[1]+EPS)last[1]=Math.max(last[1],v[1]);else out.push([...v]);}return out;}
function erase(points,path,radius,aspect=1,bands){
  const scaled=p=>[p[0],p[1]*aspect],eraser=path.map(scaled),parts=[];let current=[];
  const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,...(a.length===3||b.length===3?[(a[2]??1)+((b[2]??1)-(a[2]??1))*t]:[])];
  const append=p=>{if(!current.length||Math.hypot(p[0]-current.at(-1)[0],p[1]-current.at(-1)[1])>EPS)current.push(p);};
  const flush=()=>{if(current.length>=2)parts.push(current);current=[];};
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],blocked=[];
    for(let j=1;j<eraser.length;j++)blocked.push(...capsule(scaled(a),scaled(b),eraser[j-1],eraser[j],radius));
    let cuts=merge(blocked);
    if(bands){const dy=b[1]-a[1],visible=merge(bands.flatMap(band=>{if(Math.abs(dy)<EPS)return a[1]>=band.start&&a[1]<=band.end?[[0,1]]:[];const u=(band.start-a[1])/dy,v=(band.end-a[1])/dy,lo=Math.max(0,Math.min(u,v)),hi=Math.min(1,Math.max(u,v));return hi>lo?[[lo,hi]]:[];})),clipped=[];let i=0,j=0;while(i<cuts.length&&j<visible.length){const lo=Math.max(cuts[i][0],visible[j][0]),hi=Math.min(cuts[i][1],visible[j][1]);if(hi>lo)clipped.push([lo,hi]);if(cuts[i][1]<visible[j][1])i++;else j++;}cuts=clipped;}
    let from=0;
    for(const [lo,hi] of cuts){if(lo>from+EPS){append(lerp(a,b,from));append(lerp(a,b,lo));}flush();from=Math.max(from,hi);}
    if(from<1-EPS){append(lerp(a,b,from));append([...b]);}else flush();
  }
  flush();return parts;
}
function transform(points,{dx=0,dy=0,scaleX=1,scaleY=1,angle=0,origin,aspectRatio=1}){
  const [cx,cy]=origin,rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  return points.map(p=>{const x=(p[0]-cx)*scaleX,y=(p[1]-cy)*scaleY*aspectRatio;return [cx+x*c-y*s+dx,cy+(x*s+y*c)/aspectRatio+dy,...p.slice(2)];});
}
function bounds(points){const box={x:Infinity,y:Infinity,right:-Infinity,bottom:-Infinity};for(const p of points){box.x=Math.min(box.x,p[0]);box.y=Math.min(box.y,p[1]);box.right=Math.max(box.right,p[0]);box.bottom=Math.max(box.bottom,p[1]);}return box;}
function clip(points,rect){
 const out=[];let current=[];const flush=()=>{if(current.length>=2)out.push(current);current=[];};
 const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,...(a.length===3||b.length===3?[(a[2]??1)+((b[2]??1)-(a[2]??1))*t]:[])];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];let low=0,high=1,ok=true;
  for(const [p,q] of [[-dx,a[0]-rect.x],[dx,rect.x+rect.width-a[0]],[-dy,a[1]-rect.y],[dy,rect.y+rect.height-a[1]]]){if(Math.abs(p)<EPS){if(q<0){ok=false;break;}}else if(p<0)low=Math.max(low,q/p);else high=Math.min(high,q/p);}
  if(!ok||low>high){flush();continue;}const start=lerp(a,b,low),end=lerp(a,b,high);
  if(current.length&&Math.hypot(current.at(-1)[0]-start[0],current.at(-1)[1]-start[1])>EPS)flush();if(!current.length)current.push(start);current.push(end);if(high<1-EPS)flush();
 }
 flush();return out;
}
module.exports={erase,transform,bounds,capsule,clip};
