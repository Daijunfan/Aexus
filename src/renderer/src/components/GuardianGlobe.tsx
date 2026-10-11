import {useEffect,useMemo,useRef,useState} from 'react'
import type {GuardianLocation} from '../../../shared/guardian'
import land from '../assets/guardian/land.json'

type Vector=[number,number,number]
type Route={id:string;location:GuardianLocation;label:string;inbound:boolean}
type Props={home:GuardianLocation|null;routes:Route[];selected:string|null;onSelect:(id:string)=>void}
const radians=Math.PI/180
const vector=(latitude:number,longitude:number):Vector=>[Math.cos(latitude*radians)*Math.sin(longitude*radians),Math.sin(latitude*radians),Math.cos(latitude*radians)*Math.cos(longitude*radians)]
const rings=land.features.flatMap(feature=>feature.geometry.coordinates) as number[][][]
const coastlines=rings.map(ring=>ring.map(([longitude,latitude])=>vector(latitude,longitude)))
const inside=(x:number,y:number,ring:number[][])=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)result=!result}return result}
// Samples are derived from Natural Earth's public-domain coastline, never network activity.
const landPoints:Vector[]=rings.flatMap(ring=>{
 const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),points:Vector[]=[]
 for(let latitude=Math.ceil(Math.min(...ys));latitude<Math.max(...ys);latitude+=1.8){const step=1.8/Math.max(.22,Math.cos(latitude*radians));for(let longitude=Math.min(...xs);longitude<Math.max(...xs);longitude+=step)if(inside(longitude,latitude,ring))points.push(vector(latitude,longitude))}
 return points
})
const interpolate=(from:Vector,to:Vector,t:number):Vector=>{
 const angle=Math.acos(Math.max(-1,Math.min(1,from.reduce((n,v,i)=>n+v*to[i],0)))),sine=Math.sin(angle)
 const a=sine<.001?1-t:Math.sin((1-t)*angle)/sine,b=sine<.001?t:Math.sin(t*angle)/sine,h=1+.18*Math.sin(t*Math.PI)
 return from.map((v,i)=>(v*a+to[i]*b)*h) as Vector
}
export function GuardianGlobe({home,routes,selected,onSelect}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),camera=useRef({longitude:110,latitude:20,zoom:1}),drag=useRef<{x:number;y:number;moved:boolean}|null>(null),hitPoints=useRef<{x:number;y:number;id:string}[]>([])
 const [rotating,setRotating]=useState(true),[zoom,setZoom]=useState(1)
 const data=useRef({home,routes,selected,onSelect,rotating});data.current={home,routes,selected,onSelect,rotating}
 const paths=useMemo(()=>home?routes.map(route=>({...route,points:Array.from({length:65},(_,i)=>interpolate(vector(home.latitude,home.longitude),vector(route.location.latitude,route.location.longitude),i/64))})):[],[home,routes])
 const pathRef=useRef(paths);pathRef.current=paths
 useEffect(()=>{if(home){camera.current.longitude=home.longitude;camera.current.latitude=home.latitude}},[home?.latitude,home?.longitude])
 useEffect(()=>{
  const el=canvas.current!,context=el.getContext('2d');if(!context)return
  let frame=0,last=0,width=0,height=0,visible=true,inViewport=true
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')
  const resize=()=>{const box=el.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,2);width=box.width;height=box.height;el.width=width*ratio;el.height=height*ratio;context.setTransform(ratio,0,0,ratio,0,0)}
  const observer=new ResizeObserver(resize);observer.observe(el);resize()
  const intersection=new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting});intersection.observe(el)
  const visibility=()=>{visible=!document.hidden};document.addEventListener('visibilitychange',visibility)
  const render=(now:number)=>{
   frame=requestAnimationFrame(render);if(!visible||!inViewport||now-last<32||!width||!height)return
   const delta=last?Math.min(now-last,100):0;last=now
   if(data.current.rotating&&!drag.current&&!reducedMotion.matches)camera.current.longitude+=delta*.0016
   const {longitude,latitude,zoom:scale}=camera.current,radius=Math.min(width*.38,height*.405)*scale,cx=width*.5,cy=height*.49,yaw=-longitude*radians,pitch=latitude*radians,cosYaw=Math.cos(yaw),sinYaw=Math.sin(yaw),cosPitch=Math.cos(pitch),sinPitch=Math.sin(pitch)
   const project=(v:Vector)=>{const x=v[0]*cosYaw+v[2]*sinYaw,z=-v[0]*sinYaw+v[2]*cosYaw,y=v[1]*cosPitch-z*sinPitch;return {x:cx+x*radius,y:cy-y*radius,z:v[1]*sinPitch+z*cosPitch}}
   context.clearRect(0,0,width,height)
   const halo=context.createRadialGradient(cx,cy,radius*.9,cx,cy,radius*1.28);halo.addColorStop(0,'rgba(83,133,158,.07)');halo.addColorStop(.6,'rgba(120,162,182,.025)');halo.addColorStop(1,'rgba(120,162,182,0)');context.fillStyle=halo;context.fillRect(0,0,width,height)
   const shadow=context.createRadialGradient(cx,cy+radius*.87,0,cx,cy+radius*.87,radius*.95);shadow.addColorStop(0,'rgba(61,104,124,.09)');shadow.addColorStop(1,'rgba(61,104,124,0)');context.save();context.translate(0,(cy+radius*.87)*.73);context.scale(1,.27);context.fillStyle=shadow;context.fillRect(cx-radius,cy-radius*.15,radius*2,radius*2);context.restore()
   context.strokeStyle='rgba(77,122,143,.13)';context.lineWidth=1
   context.beginPath();context.ellipse(cx,cy+radius*.72,radius*1.23,radius*.31,-.1,0,Math.PI*2);context.stroke()
   const ocean=context.createRadialGradient(cx-radius*.4,cy-radius*.45,radius*.06,cx,cy,radius);ocean.addColorStop(0,'#f9fcfd');ocean.addColorStop(.65,'#e3eef3');ocean.addColorStop(1,'#c4d6e1');context.fillStyle=ocean;context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.fill()
   const drawLine=(points:Vector[],stroke:string,lineWidth=1)=>{context.beginPath();let pen=false;for(const point of points){const p=project(point);if(p.z>=0){if(pen)context.lineTo(p.x,p.y);else context.moveTo(p.x,p.y);pen=true}else pen=false}context.strokeStyle=stroke;context.lineWidth=lineWidth;context.stroke()}
   for(let lat=-60;lat<=60;lat+=30)drawLine(Array.from({length:181},(_,i)=>vector(lat,i*2-180)),'rgba(79,116,139,.16)')
   for(let lon=-180;lon<180;lon+=30)drawLine(Array.from({length:91},(_,i)=>vector(i*2-90,lon)),'rgba(79,116,139,.14)')
   for(const ring of coastlines)drawLine(ring,'rgba(66,108,125,.43)',.7)
   for(const point of landPoints){const p=project(point);if(p.z<0)continue;context.fillStyle=`rgba(74,121,137,${.25+p.z*.55})`;context.beginPath();context.arc(p.x,p.y,(.6+p.z*.45)*Math.min(scale,1.4),0,Math.PI*2);context.fill()}
   context.strokeStyle='rgba(124,157,175,.5)';context.lineWidth=1;context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.stroke()
   const points:{x:number;y:number;id:string}[]=[]
   for(const route of pathRef.current){const active=route.id===data.current.selected,color=route.inbound?'169,115,47':'31,132,118';drawLine(route.points,`rgba(${color},${active?.98:route.inbound?.74:.58+Math.sin(now/850)*.08})`,active?2:1)
    const endpoint=project(vector(route.location.latitude,route.location.longitude));if(endpoint.z>0){points.push({x:endpoint.x,y:endpoint.y,id:route.id});context.fillStyle=`rgba(${color},.85)`;context.beginPath();context.arc(endpoint.x,endpoint.y,active?4:2.5,0,Math.PI*2);context.fill();if(active){context.font='11px -apple-system, sans-serif';context.fillStyle='#3b586a';context.fillText(route.location.city||route.location.label,endpoint.x+10,endpoint.y-8)}}
    const pulse=project(route.points[64-Math.floor(now/75)%65]);if(route.inbound&&pulse.z>0){context.shadowBlur=9;context.shadowColor=`rgb(${color})`;context.fillStyle=`rgba(${color},.85)`;context.beginPath();context.arc(pulse.x,pulse.y,active?2.5:1.7,0,Math.PI*2);context.fill();context.shadowBlur=0}
   }
   hitPoints.current=points
   if(data.current.home){const h=data.current.home,p=project(vector(h.latitude,h.longitude));if(p.z>0){const glow=context.createRadialGradient(p.x,p.y,0,p.x,p.y,22);glow.addColorStop(0,'rgba(44,141,119,.19)');glow.addColorStop(1,'rgba(44,141,119,0)');context.fillStyle=glow;context.fillRect(p.x-22,p.y-22,44,44);context.strokeStyle='#2b8c7b';context.lineWidth=1.3;context.beginPath();context.arc(p.x,p.y,8,0,Math.PI*2);context.stroke();context.fillStyle='#267c6e';context.beginPath();context.arc(p.x,p.y,3.5,0,Math.PI*2);context.fill();context.font='600 10px -apple-system, sans-serif';context.fillStyle='#3d675e';context.fillText(h.source==='manual'?'MANUAL ANCHOR':'PUBLIC EGRESS',p.x+14,p.y+4)}}
  }
  frame=requestAnimationFrame(render)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility)}
 },[])
 const adjustZoom=(value:number)=>{const next=Math.max(.7,Math.min(1.7,value));camera.current.zoom=next;setZoom(next)}
 useEffect(()=>{const el=canvas.current!;const wheel=(event:WheelEvent)=>{event.preventDefault();adjustZoom(camera.current.zoom-event.deltaY*.001)};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[])
 return <div className="guardian-globe" data-testid="guardian-globe">
  <canvas ref={canvas} data-testid="guardian-globe-canvas" tabIndex={0} aria-label="三维网络地球。拖拽旋转，滚轮缩放，方向键旋转，加减键缩放。" onPointerDown={event=>{drag.current={x:event.clientX,y:event.clientY,moved:false};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!drag.current)return;const dx=event.clientX-drag.current.x,dy=event.clientY-drag.current.y;camera.current.longitude-=dx*.35;camera.current.latitude=Math.max(-80,Math.min(80,camera.current.latitude+dy*.3));drag.current={x:event.clientX,y:event.clientY,moved:drag.current.moved||Math.abs(dx)+Math.abs(dy)>2}}} onPointerUp={event=>{if(drag.current&&!drag.current.moved){const box=event.currentTarget.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top,hit=hitPoints.current.find(point=>Math.hypot(point.x-x,point.y-y)<14);if(hit)data.current.onSelect(hit.id)}drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{drag.current=null}} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(event.key)){event.preventDefault();if(event.key==='ArrowLeft')camera.current.longitude-=10;if(event.key==='ArrowRight')camera.current.longitude+=10;if(event.key==='ArrowUp')camera.current.latitude=Math.min(80,camera.current.latitude+10);if(event.key==='ArrowDown')camera.current.latitude=Math.max(-80,camera.current.latitude-10);if(['+','='].includes(event.key))adjustZoom(camera.current.zoom+.1);if(event.key==='-')adjustZoom(camera.current.zoom-.1)}}}/>
  <div className="guardian-globe-caption"><span className="guardian-crosshair">＋</span><div>全球连接视野<small>ORTHOGRAPHIC · LIVE ENDPOINTS</small></div></div>
  <div className="guardian-globe-controls"><button title="缩小地球" aria-label="缩小地球" onClick={()=>adjustZoom(zoom-.15)}>−</button><span>{Math.round(zoom*100)}%</span><button title="放大地球" aria-label="放大地球" onClick={()=>adjustZoom(zoom+.15)}>＋</button><i/><button className={rotating?'active':''} aria-label={rotating?'暂停地球旋转':'启动地球旋转'} aria-pressed={rotating} onClick={()=>setRotating(!rotating)}>{rotating?'Ⅱ':'▷'}</button><button title="回到本机视角" aria-label="重置地球视角" onClick={()=>{camera.current={longitude:home?.longitude??110,latitude:home?.latitude??20,zoom:1};setZoom(1)}}>⌖</button></div>
  <div className="guardian-globe-note">拖拽旋转 · 滚轮缩放<span>Made with Natural Earth</span></div>
 </div>
}
