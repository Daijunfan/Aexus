'use strict';
const {assert}=require('./safety.cjs');
function crop(value={x:0,y:0,width:1,height:1}){assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['x','y','width','height'].includes(k))&&['x','y','width','height'].every(k=>Number.isFinite(value[k]))&&value.x>=0&&value.y>=0&&value.width>0&&value.height>0&&value.x+value.width<=1.000001&&value.y+value.height<=1.000001,'INVALID_PARAMS','Page crop must lie inside the normalized source page.');return {x:value.x,y:value.y,width:Math.min(value.width,1-value.x),height:Math.min(value.height,1-value.y)};}
function rotate([x,y],angle){switch((angle%360+360)%360){case 90:return [1-y,x];case 180:return [1-x,1-y];case 270:return [y,1-x];default:return [x,y];}}
function toSource(point,spec){const [x,y]=rotate(point,360-(spec.rotation||0)),c=crop(spec.crop);return [c.x+x*c.width,c.y+y*c.height];}
function toDisplay(point,spec){const c=crop(spec.crop);return rotate([(point[0]-c.x)/c.width,(point[1]-c.y)/c.height],spec.rotation||0);}
function bounds(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};}
const corners=r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]];
function toSourceRect(rect,spec){return {...bounds(corners(rect).map(p=>toSource(p,spec))),page:spec.page};}
function projectRect(rect,spec,page){
 const c=crop(spec.crop),x=Math.max(rect.x,c.x),y=Math.max(rect.y,c.y),right=Math.min(rect.x+rect.width,c.x+c.width),bottom=Math.min(rect.y+rect.height,c.y+c.height);if(right<=x||bottom<=y)return null;
 return {...bounds(corners({x,y,width:right-x,height:bottom-y}).map(p=>toDisplay(p,spec))),page};
}
function projectPolygon(points,spec){
 let polygon=points.map(p=>[...p]);const c=crop(spec.crop);
 for(const [axis,edge,greater] of [[0,c.x,true],[0,c.x+c.width,false],[1,c.y,true],[1,c.y+c.height,false]]){
  const output=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],insideA=greater?a[axis]>=edge:a[axis]<=edge,insideB=greater?b[axis]>=edge:b[axis]<=edge;if(insideA)output.push(a);if(insideA!==insideB){const t=(edge-a[axis])/(b[axis]-a[axis]);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}polygon=output;if(!polygon.length)break;
 }return polygon.map(p=>toDisplay(p,spec));
}
module.exports={projectPolygon,crop,rotate,toSource,toDisplay,toSourceRect,projectRect,bounds,corners};
