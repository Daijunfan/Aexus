import {resolveStroke} from './ink-recognition.mjs';
export const shapeNames={free:'手写',line:'直线',ruler:'尺线',rectangle:'矩形',ellipse:'椭圆',circle:'圆',triangle:'三角形',pentagon:'五边形',star:'星形',heart:'心形',scribble:'涂抹删除'};
export function geometrySettings(settings,aspectRatio,extra={}){return {shape:settings.shape,straighten:settings.straighten||'off',perfectShape:Boolean(settings.perfectShape),rulerAngle:settings.rulerAngle||0,aspectRatio,scribbleErase:Boolean(settings.perfectShape)&&settings.brush!=='laser'&&!settings.vanish,...extra};}
export function inkGesture(raw,options,unitsPerPixel,onUpdate){
 let timer,fixed=null,anchor=[...raw[0]],closed=false;
 const notify=(points,heldMs)=>{const geometry={...options,heldMs},result=resolveStroke(points,geometry);onUpdate(result,points,geometry);return result;};
 const schedule=()=>{clearTimeout(timer);if(options.perfectShape&&options.shape==='free')timer=setTimeout(()=>{if(closed)return;const candidate=raw.map(p=>[...p]),result=notify(candidate,500);fixed=!['free','line','ruler'].includes(result.kind)?candidate:null;},500);};
 schedule();
 return {
  move(){if(closed)return;const point=raw.at(-1);if(Math.hypot(point[0]-anchor[0],(point[1]-anchor[1])*options.aspectRatio)>unitsPerPixel*1.5){anchor=[...point];fixed=null;schedule();}if(!fixed)notify(raw,0);},
  finish(){clearTimeout(timer);closed=true;let points=fixed||raw;if(points.length===1)points=[points[0],[...points[0]]];notify(points,fixed?500:0);},
  cancel(){closed=true;clearTimeout(timer);}
 };
}
