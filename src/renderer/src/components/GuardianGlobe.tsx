import {useEffect,useMemo,useRef,useState} from 'react'
import type {GuardianLocation} from '../../../shared/guardian'
import land from '../assets/guardian/land.json'
import {createPlanetRenderer} from './guardian/GuardianPlanet'
import '../styles/guardian-globe.css'

type Vector=[number,number,number]
type Route={id:string;location:GuardianLocation;label:string;inbound:boolean;process:string;count:number}
type Props={home:GuardianLocation|null;routes:Route[];selected:string|null;onSelect:(id:string)=>void}
const radians=Math.PI/180
const vector=(latitude:number,longitude:number):Vector=>[Math.cos(latitude*radians)*Math.sin(longitude*radians),Math.sin(latitude*radians),Math.cos(latitude*radians)*Math.cos(longitude*radians)]
const rings=land.features.flatMap(feature=>feature.geometry.coordinates) as number[][][]
const coastlines=rings.map(ring=>ring.map(([longitude,latitude])=>vector(latitude,longitude)))
const inside=(x:number,y:number,ring:number[][])=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)result=!result}return result}
// Samples are derived from Natural Earth's public-domain coastline, never network activity.
const landPoints=():Vector[]=>rings.flatMap(ring=>{
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
 const canvas=useRef<HTMLCanvasElement>(null),planet=useRef<HTMLCanvasElement>(null),camera=useRef({longitude:110,latitude:20,zoom:1}),target=useRef<{longitude:number;latitude:number}|null>(null),drag=useRef<{x:number;y:number;moved:boolean}|null>(null),hitPoints=useRef<{x:number;y:number;id:string}[]>([])
 const [rotating,setRotating]=useState(true),[zoom,setZoom]=useState(1),[hovered,setHovered]=useState<string|null>(null)
 const data=useRef({home,routes,selected,onSelect,rotating});data.current={home,routes,selected,onSelect,rotating}
 const paths=useMemo(()=>routes.map(route=>({...route,points:home?Array.from({length:65},(_,i)=>interpolate(vector(home.latitude,home.longitude),vector(route.location.latitude,route.location.longitude),i/64)):[]})),[home,routes])
 const pathRef=useRef(paths);pathRef.current=paths
 useEffect(()=>{if(home){camera.current.longitude=home.longitude;camera.current.latitude=home.latitude}},[home?.latitude,home?.longitude])
 useEffect(()=>{const route=routes.find(item=>item.id===selected);if(route){target.current={longitude:route.location.longitude,latitude:route.location.latitude};setRotating(false)}},[selected,routes])
 useEffect(()=>{
  const el=canvas.current!,context=el.getContext('2d');if(!context)return
  const surface=createPlanetRenderer(planet.current!)
  let fallbackPoints:Vector[]|null=null
  let frame=0,last=0,width=0,height=0,ratio=1,visible=true,inViewport=true
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)')
  const resize=()=>{const box=el.getBoundingClientRect();ratio=Math.min(devicePixelRatio,2);width=box.width;height=box.height;el.width=width*ratio;el.height=height*ratio;context.setTransform(ratio,0,0,ratio,0,0)}
  const observer=new ResizeObserver(resize);observer.observe(el);resize()
  const intersection=new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting});intersection.observe(el)
  const visibility=()=>{visible=!document.hidden};document.addEventListener('visibilitychange',visibility)
  const render=(now:number)=>{
   frame=requestAnimationFrame(render);if(!visible||!inViewport||now-last<32||!width||!height)return
   const delta=last?Math.min(now-last,100):0;last=now
   if(target.current){const aim=target.current,difference=((aim.longitude-camera.current.longitude+540)%360)-180;camera.current.longitude+=difference*.14;camera.current.latitude+=(aim.latitude-camera.current.latitude)*.14;if(Math.abs(difference)<.15&&Math.abs(aim.latitude-camera.current.latitude)<.15)target.current=null}
   else if(data.current.rotating&&!drag.current&&!reducedMotion.matches)camera.current.longitude+=delta*.0016
   const {longitude,latitude,zoom:scale}=camera.current,radius=Math.min(width*.38,height*.405)*scale,cx=width*.5,cy=height*.49,yaw=-longitude*radians,pitch=latitude*radians,cosYaw=Math.cos(yaw),sinYaw=Math.sin(yaw),cosPitch=Math.cos(pitch),sinPitch=Math.sin(pitch)
   const project=(v:Vector)=>{const x=v[0]*cosYaw+v[2]*sinYaw,z=-v[0]*sinYaw+v[2]*cosYaw,y=v[1]*cosPitch-z*sinPitch;return {x:cx+x*radius,y:cy-y*radius,z:v[1]*sinPitch+z*cosPitch}}
   context.clearRect(0,0,width,height)
   const halo=context.createRadialGradient(cx,cy,radius*.9,cx,cy,radius*1.28);halo.addColorStop(0,'rgba(83,133,158,.07)');halo.addColorStop(.6,'rgba(120,162,182,.025)');halo.addColorStop(1,'rgba(120,162,182,0)');context.fillStyle=halo;context.fillRect(0,0,width,height)
   const shadow=context.createRadialGradient(cx,cy+radius*.87,0,cx,cy+radius*.87,radius*.95);shadow.addColorStop(0,'rgba(61,104,124,.09)');shadow.addColorStop(1,'rgba(61,104,124,0)');context.save();context.translate(0,(cy+radius*.87)*.73);context.scale(1,.27);context.fillStyle=shadow;context.fillRect(cx-radius,cy-radius*.15,radius*2,radius*2);context.restore()
   context.strokeStyle='rgba(77,122,143,.13)';context.lineWidth=1
   context.beginPath();context.ellipse(cx,cy+radius*.72,radius*1.23,radius*.31,-.1,0,Math.PI*2);context.stroke()
   const gpu=surface?.draw(width,height,ratio,cx,cy,radius,longitude,latitude)??false
   if(!gpu){const ocean=context.createRadialGradient(cx-radius*.4,cy-radius*.45,radius*.06,cx,cy,radius);ocean.addColorStop(0,'#3d8998');ocean.addColorStop(.68,'#1b5069');ocean.addColorStop(1,'#0a293e');context.fillStyle=ocean;context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.fill()}
   const drawLine=(points:Vector[],stroke:string,lineWidth=1)=>{context.beginPath();let pen=false;for(const point of points){const p=project(point);if(p.z>=0){if(pen)context.lineTo(p.x,p.y);else context.moveTo(p.x,p.y);pen=true}else pen=false}context.strokeStyle=stroke;context.lineWidth=lineWidth;context.stroke()}
   // Projected meridians also make rotation visually verifiable on the interaction canvas.
   for(let lat=-60;lat<=60;lat+=30)drawLine(Array.from({length:181},(_,i)=>vector(lat,i*2-180)),gpu?'rgba(125,231,230,.11)':'rgba(106,204,211,.21)')
   for(let lon=-180;lon<180;lon+=30)drawLine(Array.from({length:91},(_,i)=>vector(i*2-90,lon)),gpu?'rgba(125,231,230,.11)':'rgba(106,204,211,.17)')
   if(!gpu){
    for(const ring of coastlines)drawLine(ring,'rgba(155,237,202,.5)',.85)
    context.fillStyle='rgba(150,231,197,.67)';context.beginPath()
    for(const point of (fallbackPoints??=landPoints())){const p=project(point);if(p.z>0){context.moveTo(p.x+1,p.y);context.arc(p.x,p.y,Math.min(1.15,.45+p.z*.7)*Math.min(scale,1.4),0,Math.PI*2)}}
    context.fill()
   }
   context.strokeStyle='rgba(100,205,213,.62)';context.lineWidth=1.1;context.beginPath();context.arc(cx,cy,radius,0,Math.PI*2);context.stroke()
   for(let i=0;i<72;i++){const angle=i*Math.PI/36,inner=radius+(i%6===0?14:8),outer=radius+(i%6===0?21:11);context.strokeStyle=i%6===0?'rgba(62,151,164,.47)':'rgba(92,157,176,.2)';context.lineWidth=i%6===0?1.2:.7;context.beginPath();context.moveTo(cx+Math.cos(angle)*inner,cy+Math.sin(angle)*inner);context.lineTo(cx+Math.cos(angle)*outer,cy+Math.sin(angle)*outer);context.stroke()}
   const points:{x:number;y:number;id:string}[]=[]
   for(const route of pathRef.current){const active=route.id===data.current.selected,color=route.inbound?'245,184,109':'103,223,220';context.shadowBlur=active?19:7;context.shadowColor=`rgb(${color})`;drawLine(route.points,`rgba(${color},${active?.98:.55})`,active?2.2:1.05);context.shadowBlur=0
    const endpoint=project(vector(route.location.latitude,route.location.longitude));if(endpoint.z>0){points.push({x:endpoint.x,y:endpoint.y,id:route.id});const size=active?7:4;context.strokeStyle=`rgba(${color},${active?.9:.55})`;context.lineWidth=1.2;context.beginPath();context.arc(endpoint.x,endpoint.y,size+4+(active&&!reducedMotion.matches?Math.sin(now/360)*2:0),0,Math.PI*2);context.stroke();context.fillStyle=`rgb(${color})`;context.shadowBlur=13;context.shadowColor=`rgb(${color})`;context.beginPath();context.arc(endpoint.x,endpoint.y,size,0,Math.PI*2);context.fill();context.shadowBlur=0;if(active){context.font='600 11px -apple-system, sans-serif';context.fillStyle='#244c58';context.fillText(route.location.city||route.location.label,Math.min(width-130,endpoint.x+12),Math.max(45,endpoint.y-12))}}
   }
   hitPoints.current=points
   if(data.current.home){const h=data.current.home,p=project(vector(h.latitude,h.longitude));if(p.z>0){const glow=context.createRadialGradient(p.x,p.y,0,p.x,p.y,22);glow.addColorStop(0,'rgba(250,238,184,.8)');glow.addColorStop(1,'rgba(248,238,184,0)');context.fillStyle=glow;context.fillRect(p.x-22,p.y-22,44,44);context.strokeStyle='#fbe0a2';context.lineWidth=1.6;context.beginPath();context.arc(p.x,p.y,9,0,Math.PI*2);context.stroke();context.fillStyle='#fff2ca';context.beginPath();context.arc(p.x,p.y,3.5,0,Math.PI*2);context.fill();context.font='600 10px -apple-system, sans-serif';context.fillStyle='#244c58';context.fillText(h.source==='manual'?'MANUAL ANCHOR':'PUBLIC EGRESS',Math.min(width-136,p.x+14),p.y+4)}}
  }
  frame=requestAnimationFrame(render)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);surface?.destroy()}
 },[])
 const adjustZoom=(value:number)=>{const next=Math.max(.7,Math.min(1.7,value));camera.current.zoom=next;setZoom(next)}
 useEffect(()=>{const el=canvas.current!;const wheel=(event:WheelEvent)=>{event.preventDefault();adjustZoom(camera.current.zoom-event.deltaY*.001)};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[])
 const highlighted=routes.find(route=>route.id===(hovered??selected))
 return <div className="guardian-globe" data-testid="guardian-globe" data-mapped-count={routes.length}>
  <canvas className="guardian-globe-surface" ref={planet} aria-hidden="true"/>
  <canvas ref={canvas} data-testid="guardian-globe-canvas" tabIndex={0} aria-label="三维网络地球。拖拽旋转，滚轮缩放，方向键旋转，加减键缩放。" onPointerDown={event=>{target.current=null;setRotating(false);drag.current={x:event.clientX,y:event.clientY,moved:false};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!drag.current){const box=event.currentTarget.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;const point=hitPoints.current.find(point=>Math.hypot(point.x-x,point.y-y)<14);setHovered(point?.id??null);return}const dx=event.clientX-drag.current.x,dy=event.clientY-drag.current.y;camera.current.longitude-=dx*.35;camera.current.latitude=Math.max(-80,Math.min(80,camera.current.latitude+dy*.3));drag.current={x:event.clientX,y:event.clientY,moved:drag.current.moved||Math.abs(dx)+Math.abs(dy)>2}}} onPointerLeave={()=>setHovered(null)} onPointerUp={event=>{if(drag.current&&!drag.current.moved){const box=event.currentTarget.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top,hit=hitPoints.current.find(point=>Math.hypot(point.x-x,point.y-y)<14);if(hit)data.current.onSelect(hit.id)}drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{drag.current=null}} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(event.key)){event.preventDefault();target.current=null;setRotating(false);if(event.key==='ArrowLeft')camera.current.longitude-=10;if(event.key==='ArrowRight')camera.current.longitude+=10;if(event.key==='ArrowUp')camera.current.latitude=Math.min(80,camera.current.latitude+10);if(event.key==='ArrowDown')camera.current.latitude=Math.max(-80,camera.current.latitude-10);if(['+','='].includes(event.key))adjustZoom(camera.current.zoom+.1);if(event.key==='-')adjustZoom(camera.current.zoom-.1)}}}/>
  <div className="guardian-globe-caption"><span className="guardian-crosshair">✧</span><div>全球连接视野<small>EARTH / ORTHOGRAPHIC</small></div></div>
  <div className="guardian-globe-signal" aria-live="polite"><span>{highlighted?'SELECTED PEER':routes.length?'MAPPED TCP PEERS':'LOCATION COVERAGE'}</span><strong>{highlighted?highlighted.location.city||highlighted.location.label:routes.length?routes.length+' 个已定位 IP':'无已定位对端'}</strong><small>{highlighted?highlighted.label+' · '+highlighted.process+' · '+highlighted.count+' 个 TCP 端点':home?'端点须经授权定位才会在地球出现':'本机位置未设置 · 地球仅显示地理底图'}</small></div>
  {routes.length>0&&<div className="guardian-globe-peers" aria-label="已定位的 TCP 对端"><span>OBSERVED ENDPOINTS</span>{routes.slice(0,4).map(route=><button key={route.id} aria-pressed={selected===route.id} onClick={()=>onSelect(route.id)} title={route.label}><i className={route.inbound?'inbound':''}/><span><strong>{route.location.city||route.location.country||'近似位置'}</strong><small>{route.label}</small></span><b>{route.count}</b></button>)}{routes.length>4&&<small>另有 {routes.length-4} 个已定位 IP · 可在连接列表筛选</small>}</div>}
  <div className="guardian-globe-controls"><button title="缩小地球" aria-label="缩小地球" onClick={()=>adjustZoom(zoom-.15)}>−</button><span>{Math.round(zoom*100)}%</span><button title="放大地球" aria-label="放大地球" onClick={()=>adjustZoom(zoom+.15)}>＋</button><i/><button className={rotating?'active':''} aria-label={rotating?'暂停地球旋转':'启动地球旋转'} aria-pressed={rotating} onClick={()=>{target.current=null;setRotating(!rotating)}}>{rotating?'Ⅱ':'▷'}</button><button title="回到本机视角" aria-label="重置地球视角" onClick={()=>{target.current=null;camera.current={longitude:home?.longitude??110,latitude:home?.latitude??20,zoom:1};setZoom(1)}}>⌖</button></div>
  <div className="guardian-globe-note"><span>拖拽旋转 · 滚轮缩放 · 点击端点调查</span><span>Natural Earth 底图 · 连接弧线仅示意，不代表实际传输路径或实时流量</span></div>
 </div>
}
