import {snapRuler} from './ruler-geometry.mjs';
import {shaped} from './ink-shapes.mjs';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function box(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};}
function sample(points,count=64){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+distance(points[i-1],points[i]));const total=lengths.at(-1);if(total<1e-12)return Array.from({length:count},()=>points[0]);let j=1;return Array.from({length:count},(_,i)=>{const at=total*i/(count-1);while(j<points.length-1&&lengths[j]<at)j++;const t=(at-lengths[j-1])/(lengths[j]-lengths[j-1]||1);return [points[j-1][0]+(points[j][0]-points[j-1][0])*t,points[j-1][1]+(points[j][1]-points[j-1][1])*t];});}
function normalize(points){const b=box(points);return points.map(p=>[(p[0]-b.x)/(b.width||1),(p[1]-b.y)/(b.height||1)]);}
function polygon(n,inner=1){const pts=Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2-Math.PI/2,r=i%2?inner:1;return [Math.cos(a)*r,Math.sin(a)*r];});return [...pts,pts[0]];}
const templates={
 rectangle:[[0,0],[1,0],[1,1],[0,1],[0,0]],
 ellipse:Array.from({length:97},(_,i)=>[Math.cos(i/96*Math.PI*2),Math.sin(i/96*Math.PI*2)]),
 triangle:polygon(3),pentagon:polygon(5),star:polygon(10,.42),
 heart:Array.from({length:97},(_,i)=>{const t=i/96*Math.PI*2;return [16*Math.sin(t)**3,-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))];})
};
const paths=Object.fromEntries(Object.entries(templates).map(([kind,points])=>[kind,normalize(points)]));
const samples=Object.fromEntries(Object.entries(paths).map(([kind,points])=>[kind,sample(points,65).slice(0,64)]));
function score(points,model){let best=Infinity;for(const direction of [1,-1])for(let shift=0;shift<64;shift++){let sum=0;for(let i=0;i<64;i++){const p=model[(shift+direction*i+128)%64],dx=points[i][0]-p[0],dy=points[i][1]-p[1];sum+=dx*dx+dy*dy;if(sum>=best)break;}best=Math.min(best,sum);}return Math.sqrt(best/64);}
function isLine(points){const a=points[0],b=points.at(-1),length=distance(a,b);if(length<1e-8)return false;let path=0,max=0;for(let i=1;i<points.length;i++){path+=distance(points[i-1],points[i]);max=Math.max(max,Math.abs((b[0]-a[0])*(a[1]-points[i][1])-(a[0]-points[i][0])*(b[1]-a[1]))/length);}return path/length<1.08&&max/length<.035;}
function isScribble(points){
 if(points.length<7)return false;const bounds=box(points),diagonal=Math.hypot(bounds.width,bounds.height);let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);if(diagonal<1e-8||length/diagonal<5)return false;
 const across=axis=>{const values=points.map(p=>p[axis]),lo=Math.min(...values),range=Math.max(...values)-lo;if(range<diagonal*.2)return 0;let side=0,count=0;for(const v of values){const next=v<lo+range*.25?-1:v>lo+range*.75?1:0;if(next){if(side&&side!==next)count++;side=next;}}return count;};if(Math.max(across(0),across(1))<6)return false;
 const sampled=sample(points,96);let turns=0;for(let i=2;i<sampled.length-2;i++){const a=sampled[i-2],b=sampled[i],c=sampled[i+2],ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1],size=Math.hypot(ux,uy)*Math.hypot(vx,vy);if(size>1e-10&&(ux*vx+uy*vy)/size<-.55){turns++;i+=3;}}return turns>=4;
}
function fitClosed(points){
 const original=box(points),diagonal=Math.hypot(original.width,original.height);if(points.length<4||!original.width||!original.height||distance(points[0],points.at(-1))>diagonal*.18)return null;
 const closed=[...points,points[0]],cx=original.x+original.width/2,cy=original.y+original.height/2,angles=new Set([0]);let xx=0,xy=0,yy=0;
 for(const p of sample(closed)){const x=p[0]-cx,y=p[1]-cy;xx+=x*x;xy+=x*y;yy+=y*y;}const principal=.5*Math.atan2(2*xy,xx-yy);angles.add(principal);angles.add(principal+Math.PI);
 for(let i=1;i<36;i++)angles.add(i*Math.PI/18);
 let best=null;
 for(const angle of angles){const c=Math.cos(angle),s=Math.sin(angle),rotated=closed.map(p=>[(p[0]-cx)*c+(p[1]-cy)*s,-(p[0]-cx)*s+(p[1]-cy)*c]),bounds=box(rotated);if(bounds.width<diagonal*.03||bounds.height<diagonal*.03)continue;const normalized=sample(normalize(rotated),65).slice(0,64);
  for(const [kind,model] of Object.entries(samples)){const error=score(normalized,model);if(!best||error<best.error)best={kind,error,angle,bounds};}
 }
 if(!best||best.error>.07)return null;
 let {kind,angle,bounds:b}=best,shape=paths[kind];if(kind==='ellipse'&&Math.abs(b.width-b.height)/Math.max(b.width,b.height)<.12){kind='circle';const d=(b.width+b.height)/2;b={x:b.x+(b.width-d)/2,y:b.y+(b.height-d)/2,width:d,height:d};}
 const c=Math.cos(angle),s=Math.sin(angle),output=shape.map(p=>{const x=b.x+p[0]*b.width,y=b.y+p[1]*b.height;return [cx+x*c-y*s,cy+x*s+y*c];}),fitted=box(output),scale=Math.min(1,original.width/fitted.width,original.height/fitted.height);
 return {kind,points:output.map(p=>[Math.max(original.x,Math.min(original.x+original.width,cx+(p[0]-fitted.x-fitted.width/2)*scale)),Math.max(original.y,Math.min(original.y+original.height,cy+(p[1]-fitted.y-fitted.height/2)*scale))])};
}
/** Shared by the renderer preview and authoritative Core writes. No OCR/model. */
export function resolveStroke(points,{shape='free',rulerAngle=0,aspectRatio=1,straighten='off',perfectShape=false,scribbleErase=false,heldMs=0,ruler,bands}={}){
 if(points.length<2)return {points,kind:'free'};
 const pressured=points.some(p=>p.length===3),values=points.map(p=>p[2]).filter(p=>p>0),pressure=values.length?values.reduce((a,b)=>a+b,0)/values.length:(pressured?0:1);
 const finish=(result,kind)=>({kind,points:result.map(p=>pressured?[p[0],p[1],pressure]:p.slice(0,2))});
 if(shape==='free'&&ruler){const snapped=snapRuler(points,ruler,aspectRatio,bands);if(snapped)return snapped;}
 if(shape!=='free')return finish(shaped(points,shape,rulerAngle,aspectRatio),shape);
 const physical=points.map(p=>[p[0],p[1]*aspectRatio]);
 if(perfectShape&&heldMs>=500){if(scribbleErase&&isScribble(physical))return {points,kind:'scribble'};const result=fitClosed(physical);if(result)return finish(result.points.map(p=>[p[0],p[1]/aspectRatio]),result.kind);}
 if(straighten==='always'||straighten==='auto'&&isLine(physical))return finish([points[0],points.at(-1)],'line');
 return {points,kind:'free'};
}
