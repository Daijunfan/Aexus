import {$,run} from './dom.js';
import {rulerEdges,clipEdge} from './ruler-geometry.mjs';
import {pagePoint} from './page-slices.mjs';
const defaults={enabled:false,x:.5,y:.5,angle:0,length:.7,cover:false};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),angle=n=>((n+180)%360+360)%360-180;
export class InkRulers {
 constructor(study){
  this.study=study;this.bindings=new Map();this.layers=new Map();this.drag=false;this.busy=false;
  const refresh=()=>{if(this.drag)return;cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.render());};window.addEventListener('resize',refresh);document.addEventListener('scroll',refresh,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.cancel){e.preventDefault();e.stopImmediatePropagation();this.cancel();}},true);
 }
 pose(context){return {...defaults,...this.study.current?.inkRulers?.[context]};}
 bind(context,root,options={}){this.bindings.set(context,{root,...options,setId:this.study.current?.id});this.render();}
 unbind(context,owner){if(owner&&this.bindings.get(context)?.owner!==owner)return;if(this.drag===context)this.cancel?.();this.bindings.delete(context);this.layers.get(context)?.remove();this.layers.delete(context);}
 render(){
  const set=this.study.current;if(!set){this.cancel?.();for(const layer of this.layers.values())layer.remove();this.layers.clear();this.bindings.clear();return;}
  for(const [context,b] of this.bindings)if(b.setId!==set.id)this.unbind(context);
  if(!this.bindings.has('map'))this.bindings.set('map',{root:()=>$('study-map-viewport'),drawing:()=>this.study.cardInk?.gesture,setId:set.id});
  if(!this.bindings.has('document'))this.bindings.set('document',{root:()=>this.study.getDocument()?.kind==='pdf'?$('reader-scroll'):null,drawing:()=>this.study.ink?.gesture,setId:set.id});
  for(const [context,b] of this.bindings){
   if(this.drag===context)continue;const pose=this.pose(context),root=b.root(),box=root?.getBoundingClientRect();let layer=this.layers.get(context);
   if(!pose.enabled||!box?.width||!box.height){if(layer)layer.hidden=true;continue;}
   if(!layer){layer=document.createElement('div');layer.className='ink-ruler-layer';layer.dataset.rulerContext=context;layer.innerHTML='<div class="ink-ruler"><div class="ruler-ticks"></div><div class="ruler-grip" role="slider" tabindex="0" aria-label="移动尺子"><span class="ruler-angle"></span></div><button type="button" class="ruler-rotate" aria-label="旋转尺子" title="拖动旋转 · 双指也可旋转">↻</button><button type="button" class="ruler-close" aria-label="收起尺子">×</button><output class="ruler-reading" hidden></output></div>';this.layers.set(context,layer);layer.querySelector('.ruler-grip').onpointerdown=e=>this.start(e,context,false);layer.querySelector('.ruler-rotate').onpointerdown=e=>this.start(e,context,true);layer.querySelector('.ruler-close').onclick=run(()=>this.save(context,{enabled:false},this.study.current.revision,b));layer.querySelector('.ruler-grip').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||this.busy)return;e.preventDefault();e.stopPropagation();const p=this.pose(context),step=e.shiftKey?15:1;run(()=>this.save(context,{angle:angle(p.angle+(['ArrowLeft','ArrowDown'].includes(e.key)?-step:step))},this.study.current.revision,b))();};}
   const parent=b.parent||document.body;if(layer.parentNode!==parent)parent.append(layer);layer.hidden=false;this.position(layer,box,pose,b);
  }
 }
 position(layer,box,pose,binding){
  Object.assign(layer.style,{left:box.left+'px',top:box.top+'px',width:box.width+'px',height:box.height+'px'});const clip=binding.clip?.()?.getBoundingClientRect();layer.style.clipPath=clip?`inset(${Math.max(0,clip.top-box.top)}px ${Math.max(0,box.right-clip.right)}px ${Math.max(0,box.bottom-clip.bottom)}px ${Math.max(0,clip.left-box.left)}px)`:'none';
  const ruler=layer.firstElementChild,length=box.width*pose.length;ruler.style.width=length+'px';ruler.style.left=pose.x*box.width+'px';ruler.style.top=pose.y*box.height+'px';ruler.style.transform=`translate(-50%,-50%) rotate(${pose.angle}deg)`;ruler.classList.toggle('ruler-cover',pose.cover);ruler.dataset.angle=String(pose.angle);layer.querySelector('.ruler-angle').textContent=pose.angle.toFixed(1)+'°';layer.querySelector('.ruler-angle').style.transform=`rotate(${-pose.angle}deg)`;layer.querySelector('.ruler-grip').setAttribute('aria-valuenow',String(pose.angle));
  const ticks=layer.querySelector('.ruler-ticks'),count=Math.floor(length/50);if(ticks.dataset.count!==String(count)){ticks.dataset.count=String(count);ticks.innerHTML=Array.from({length:count+1},(_,i)=>`<span style="left:${i*50}px">${i*50}</span>`).join('');}
 }
 async save(context,patch,revision,binding=this.bindings.get(context)){
  if(this.busy||binding?.setId!==this.study.current?.id)return;this.busy=true;
  try{const set=await this.study.change('study.ink.ruler.set',{context,...patch},revision);binding.changed?.(set,revision);return set;}finally{this.busy=false;this.render();}
 }
 start(event,context,rotating){
  const b=this.bindings.get(context);if(event.button!==0||this.busy||b?.drawing?.()||this.study.inkTools.toolbar.busy)return;event.preventDefault();event.stopPropagation();
  if(this.gesture){if(this.gesture.context===context){this.gesture.add(event);}return;}
  const layer=this.layers.get(context),box=b.root().getBoundingClientRect(),revision=this.study.current.revision,start=this.pose(context),points=new Map();let pose={...start},base,origin,moved=false;
  const rebase=()=>{base={...pose};const a=[...points.values()];origin=a.length>1?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,angle:Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x)}:{...a[0],angle:Math.atan2(a[0].y-box.top-base.y*box.height,a[0].x-box.left-base.x*box.width)};};
  const add=e=>{if(points.size>=2)return;e.currentTarget.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY,element:e.currentTarget});rebase();};add(event);this.drag=context;this.gesture={context,add};
  const move=e=>{if(!points.has(e.pointerId))return;const old=points.get(e.pointerId);points.set(e.pointerId,{...old,x:e.clientX,y:e.clientY});const a=[...points.values()],center=a.length>1?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}:a[0],turn=a.length>1?Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x):Math.atan2(center.y-box.top-base.y*box.height,center.x-box.left-base.x*box.width);
   if(rotating||a.length>1){let value=angle(base.angle+(turn-origin.angle)*180/Math.PI);if(e.shiftKey)value=Math.round(value/15)*15;pose={...pose,angle:value};}
   if(!rotating||a.length>1)pose={...pose,x:clamp(base.x+(center.x-origin.x)/box.width,0,1),y:clamp(base.y+(center.y-origin.y)/box.height,0,1)};
   moved||=Math.hypot((pose.x-start.x)*box.width,(pose.y-start.y)*box.height)>1||Math.abs(angle(pose.angle-start.angle))>.25;this.position(layer,box,pose,b);
  };
  const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',cancel);for(const [id,p] of points)if(p.element.hasPointerCapture(id))p.element.releasePointerCapture(id);points.clear();this.drag=false;this.gesture=null;this.cancel=null;};
  const cancel=e=>{if(e&& !points.has(e.pointerId))return;cleanup();this.render();};this.cancel=()=>cancel();
  const end=e=>{if(!points.has(e.pointerId))return;move(e);const p=points.get(e.pointerId);if(p.element.hasPointerCapture(e.pointerId))p.element.releasePointerCapture(e.pointerId);points.delete(e.pointerId);if(points.size){rebase();return;}cleanup();if(moved&&b.setId===this.study.current?.id)run(()=>this.save(context,{x:pose.x,y:pose.y,angle:pose.angle},revision,b))();else this.render();};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',cancel);
 }
 guide(context,{point,scale,page,clip}){
  const b=this.bindings.get(context),pose=this.pose(context),root=b?.root(),box=root?.getBoundingClientRect();if(!pose.enabled||!box?.width||!box.height||b.setId!==this.study.current?.id)return null;
  const guides=[];for(const edge of rulerEdges(box,pose)){
   if(page){const pb=page.getBoundingClientRect(),blocks=page.pageSlices?.blocks.filter(b=>b.type==='source')||[{top:0,height:pb.height}];for(const block of blocks){const part=clipEdge(edge,{left:pb.left,right:pb.right,top:pb.top+block.top,bottom:pb.top+block.top+block.height});if(part)guides.push({...part,a:pagePoint(page,...part.a),b:pagePoint(page,...part.b)});}}
   else{const part=clip?clipEdge(edge,clip):edge;if(part)guides.push({...part,a:point(...part.a),b:point(...part.b)});}
  }
  return guides.length?{edges:guides,tolerance:12*scale}:null;
 }
 measure(context,x,y){const b=this.bindings.get(context),layer=this.layers.get(context),box=b?.root()?.getBoundingClientRect();if(!layer||layer.hidden||!box)return;const p=this.pose(context),rad=p.angle*Math.PI/180,length=box.width*p.length,dx=x-(box.left+box.width*p.x),dy=y-(box.top+box.height*p.y),along=dx*Math.cos(rad)+dy*Math.sin(rad),normal=-dx*Math.sin(rad)+dy*Math.cos(rad),out=layer.querySelector('.ruler-reading');out.hidden=Math.abs(Math.abs(normal)-24)>16||Math.abs(along)>length/2;if(!out.hidden){out.textContent=(along+length/2).toFixed(1)+' px';out.style.left=clamp(along+length/2,20,length-20)+'px';}}
}
