/**
 * Segment editing adapted from mxGraph 4.2.2 mxEdgeSegmentHandler.
 * Copyright (c) 2006-2015 JGraph Ltd; Copyright (c) 2006-2015 Gaudenz Alder.
 * Apache-2.0; see Infra/src/licenses/mxgraph-4.2.2-Apache-2.0.txt.
 * Modified for a DOM-independent Core: fixed terminal anchors, per-segment drag,
 * alignment snapping, terminal leads and persistent source-Team coordinates.
 */
import type {Point} from './canvas'
export type Endpoint={point:Point;exit:Point;bounds?:Point&{width:number;height:number}}
export const samePoint=(a:Point,b:Point)=>Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6
export function simplifyPath(input:Point[]):Point[]{
  const points:Point[]=[]
  for(const raw of input){const p={x:raw.x,y:raw.y};if(points.length&&samePoint(points.at(-1)!,p))continue;points.push(p)
    while(points.length>=3){const [a,b,c]=points.slice(-3);if(a.x===b.x&&b.x===c.x||a.y===b.y&&b.y===c.y)points.splice(points.length-2,1);else break}
  }
  return points
}
const elbow=(a:Point,b:Point,horizontal:boolean):Point[]=>a.x===b.x||a.y===b.y?[b]:[horizontal?{x:b.x,y:a.y}:{x:a.x,y:b.y},b]
export function directPath(source:Endpoint,target:Endpoint){
 const s=source.point,t=target.point,a=source.exit,b=target.exit,v=a.x===s.x,w=b.x===t.x
 const toward=(p:Point,q:Point,z:Point)=>(q.x-p.x)*(z.x-p.x)+(q.y-p.y)*(z.y-p.y)>0
 if((s.x===t.x||s.y===t.y)&&toward(s,t,a)&&toward(t,s,b))return [s,t]
 if(v&&w){const x=a.x===b.x?a.x+48:(a.x+b.x)/2;return simplifyPath([s,a,{x,y:a.y},{x,y:b.y},b,t])}
 if(!v&&!w){const y=a.y===b.y?a.y+48:(a.y+b.y)/2;return simplifyPath([s,a,{x:a.x,y},{x:b.x,y},b,t])}
 const bend=v?{x:b.x,y:a.y}:{x:a.x,y:b.y}
 if(!samePoint(a,bend)&&!samePoint(b,bend))return simplifyPath([s,a,bend,b,t])
 return v?simplifyPath([s,a,{x:a.x+48,y:a.y},{x:a.x+48,y:b.y+48},{x:b.x,y:b.y+48},b,t]):simplifyPath([s,a,{x:a.x,y:a.y+48},{x:b.x+48,y:a.y+48},{x:b.x+48,y:b.y},b,t])
}
/** Keep interior bends while updating terminal attachment after either actor moves. */
export function attachPath(saved:Point[],source:Endpoint,target:Endpoint){
  const p=simplifyPath(saved).map(p=>({...p}));if(p.length<3)return directPath(source,target)
  const start=p[0],end=p.at(-1)!,firstVertical=p[1].x===start.x,lastVertical=p.at(-2)!.x===end.x
  if(firstVertical)p[1].x=source.point.x;else p[1].y=source.point.y
  if(lastVertical)p[p.length-2].x=target.point.x;else p[p.length-2].y=target.point.y
  p[0]=source.point;p[p.length-1]=target.point
  // mxGraph also replaces bends that enter a terminal. Truncate at the entry
  // side so moving an actor across a saved rail cannot draw through its body.
  const trimTerminal=(path:Point[],end:Endpoint)=>{const b=end.bounds;if(!b)return;for(let i=0;i<path.length-1;i++){
    const a=path[i],z=path[i+1],hit=Math.max(a.x,z.x)>b.x&&Math.min(a.x,z.x)<b.x+b.width&&Math.max(a.y,z.y)>b.y&&Math.min(a.y,z.y)<b.y+b.height
    if(!hit||a.x>b.x&&a.x<b.x+b.width&&a.y>b.y&&a.y<b.y+b.height)continue
    const q=a.y===z.y?{x:a.x<=b.x?b.x-18:b.x+b.width+18,y:a.y}:{x:a.x,y:a.y<=b.y?b.y-18:b.y+b.height+18}
    path.splice(i+1,path.length-i-2,q);break
  }}
  trimTerminal(p,target);p.reverse();trimTerminal(p,source);p.reverse()
  const outward=(a:Endpoint,q:Point)=>(q.x-a.point.x)*(a.exit.x-a.point.x)+(q.y-a.point.y)*(a.exit.y-a.point.y)>0&&(a.exit.x===a.point.x?q.x===a.point.x:q.y===a.point.y)
  const lane=(end:Endpoint,q:Point,vertical:boolean)=>{const e=end.exit,b=end.bounds,value=vertical?q.x:q.y,at=vertical?e.x:e.y;if(b){const low=vertical?b.x:b.y,high=low+(vertical?b.width:b.height),from=vertical?e.y:e.x,to=vertical?q.y:q.x,near=vertical?b.y:b.x,far=near+(vertical?b.height:b.width);if(value>low&&value<high&&Math.max(from,to)>near&&Math.min(from,to)<far)return value<(low+high)/2?low-18:high+18}return value===at?at+24:value}
  if(!outward(source,p[1])){const q=p[1],e=source.exit;if(e.x===source.point.x){const x=lane(source,q,true);p.splice(1,1,e,{x,y:e.y},{x,y:q.y},q)}else{const y=lane(source,q,false);p.splice(1,1,e,{x:e.x,y},{x:q.x,y},q)}}
  if(!outward(target,p.at(-2)!)){const q=p[p.length-2],e=target.exit;if(e.x===target.point.x){const x=lane(target,q,true);p.splice(p.length-1,0,{x,y:q.y},{x,y:e.y},e)}else{const y=lane(target,q,false);p.splice(p.length-1,0,{x:q.x,y},{x:e.x,y},e)}}
  const result:Point[]=[p[0]];for(let i=1;i<p.length;i++)result.push(...elbow(result.at(-1)!,p[i],i%2===0));return simplifyPath(result)
}
/** mxGraph-style segment movement: shift both adjacent bends, then merge aligned bends. */
export function movePathSegment(input:Point[],index:number,position:Point,tolerance=8):Point[]{
  const p=simplifyPath(input).map(p=>({...p}));if(!Number.isInteger(index)||index<0||index>=p.length-1)throw Error('Invalid segment index')
  const a=p[index],b=p[index+1],vertical=a.x===b.x,axis=vertical?'x':'y',other=vertical?'y':'x'
  let value=position[axis]
  const nearby=p.flatMap((q,i)=>i<p.length-1&&i!==index&&q[axis]===p[i+1][axis]?[q[axis]]:[]).sort((x,y)=>Math.abs(value-x)-Math.abs(value-y))
  if(nearby.length&&Math.abs(nearby[0]-value)<=tolerance)value=nearby[0]
  const movedA={...a,[axis]:value},movedB={...b,[axis]:value},result:Point[]=[]
  if(index===0){const lead={...a,[other]:a[other]+Math.sign(b[other]-a[other])*Math.min(24,Math.abs(b[other]-a[other])/3)};result.push(a,lead,{...lead,[axis]:value})}else result.push(...p.slice(0,index),movedA)
  if(index===p.length-2){const lead={...b,[other]:b[other]-Math.sign(b[other]-a[other])*Math.min(24,Math.abs(b[other]-a[other])/3)};result.push({...lead,[axis]:value},lead,b)}else result.push(movedB,...p.slice(index+2))
  return simplifyPath(result)
}
