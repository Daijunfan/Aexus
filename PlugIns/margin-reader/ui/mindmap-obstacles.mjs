import {ViewportIndex} from './viewport-index.mjs';
const caches=new WeakMap(),PAD=10;
function index(positions){
 let cached=caches.get(positions);if(cached)return cached;const rows=[...positions].map(([id,b])=>[id,{x:b.x-PAD,y:b.y-PAD,width:b.width+PAD*2,height:b.height+PAD*2}]),boxes=new Map(rows);
 cached={index:new ViewportIndex(rows),boxes,bounds:{left:Math.min(...rows.map(([,b])=>b.x))-20,right:Math.max(...rows.map(([,b])=>b.x+b.width))+20,top:Math.min(...rows.map(([,b])=>b.y))-20,bottom:Math.max(...rows.map(([,b])=>b.y+b.height))+20}};caches.set(positions,cached);return cached;
}
function cuts(a,b,r){
 let enter=0,leave=1;const d=[b[0]-a[0],b[1]-a[1]],min=[r.x+.2,r.y+.2],max=[r.x+r.width-.2,r.y+r.height-.2];
 for(let k=0;k<2;k++){if(Math.abs(d[k])<1e-9){if(a[k]<min[k]||a[k]>max[k])return false;continue;}let low=(min[k]-a[k])/d[k],high=(max[k]-a[k])/d[k];if(low>high)[low,high]=[high,low];enter=Math.max(enter,low);leave=Math.min(leave,high);if(enter>leave)return false;}return leave>=0&&enter<=1;
}
export function avoidTopics(positions,excluded,samples){
 if(!positions[Symbol.iterator]||positions.size<3)return null;const cache=index(positions),ignore=new Set(excluded),hit=(a,b)=>[...cache.index.query({x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1])})].filter(id=>!ignore.has(id)&&cuts(a,b,cache.boxes.get(id)));
 if(!samples.slice(1).some((p,i)=>hit(samples[i],p).length))return null;
 const start=samples[0],end=samples.at(-1),area={x:Math.min(start[0],end[0])-120,y:Math.min(start[1],end[1])-120,width:Math.abs(start[0]-end[0])+240,height:Math.abs(start[1]-end[1])+240},near=[...cache.index.query(area)].filter(id=>!ignore.has(id)).map(id=>cache.boxes.get(id));
 const pick=(values,a,b,lo,hi)=>[...new Set([a,b,lo,hi,...[...new Set(values)].sort((x,y)=>Math.min(Math.abs(x-a),Math.abs(x-b))-Math.min(Math.abs(y-a),Math.abs(y-b))).slice(0,22)])].sort((x,y)=>x-y);
 const xs=pick(near.flatMap(b=>[b.x-.5,b.x+b.width+.5]),start[0],end[0],cache.bounds.left,cache.bounds.right),ys=pick(near.flatMap(b=>[b.y-.5,b.y+b.height+.5]),start[1],end[1],cache.bounds.top,cache.bounds.bottom),n=xs.length,begin=ys.indexOf(start[1])*n+xs.indexOf(start[0]),goal=ys.indexOf(end[1])*n+xs.indexOf(end[0]),cost=new Map([[begin,0]]),parent=new Map(),open=new Set([begin]),closed=new Set(),point=id=>[xs[id%n],ys[Math.floor(id/n)]];
 while(open.size){let current,best=Infinity;for(const id of open){const p=point(id),score=cost.get(id)+Math.abs(p[0]-end[0])+Math.abs(p[1]-end[1]);if(score<best){best=score;current=id;}}
  if(current===goal){const route=[];for(let at=goal;at!==undefined;at=parent.get(at))route.push(point(at));route.reverse();return route.filter((p,i)=>!i||i===route.length-1||(p[0]!==route[i-1][0]||p[0]!==route[i+1][0])&&(p[1]!==route[i-1][1]||p[1]!==route[i+1][1]));}
  open.delete(current);closed.add(current);const x=current%n,y=Math.floor(current/n),p=point(current);
  for(const [nx,ny]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||nx>=n||ny<0||ny>=ys.length)continue;const next=ny*n+nx;if(closed.has(next))continue;const q=point(next);if(hit(p,q).length)continue;const value=cost.get(current)+Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1]);if(value<(cost.get(next)??Infinity)){cost.set(next,value);parent.set(next,current);open.add(next);}}
 }
 return null;
}
