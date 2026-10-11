// Camera coordinates are local view state, never topic/source coordinates.
export const MIN_ZOOM=.0001,MAX_ZOOM=4;
export function zoomAt(camera,value,point){
 const z=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));
 return {x:point.x-(point.x-camera.x)*z/camera.z,y:point.y-(point.y-camera.y)*z/camera.z,z};
}
export function wheelDelta(event,height){
 const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;
 return {x:(event.shiftKey&&!event.deltaX?event.deltaY:event.deltaX)*unit,y:(event.shiftKey&&!event.deltaX?0:event.deltaY)*unit};
}
export class MapCamera{
 constructor(map){
  this.map=map;this.view=document.getElementById('study-map-viewport');this.world=document.getElementById('study-map-world');this.state={x:0,y:0,z:.9};this.saved=new Map();
  this.view.addEventListener('wheel',e=>this.wheel(e),{passive:false});
  map.board.addEventListener('pointerdown',e=>this.start(e),true);
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&this.view.contains(e.target)){this.space=true;if(!e.target.closest('.study-card')){e.preventDefault();e.stopImmediatePropagation();}}if(e.key==='Escape'&&this.pan)this.cancel();},true);
  document.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false;});window.addEventListener('blur',()=>{this.space=false;this.cancel();});
  this.view.addEventListener('click',e=>{if(performance.now()<(this.suppress||0)){e.preventDefault();e.stopImmediatePropagation();}},true);
  map.board.addEventListener('keydown',e=>{
   if(e.target.closest('input,textarea,select,[contenteditable=true]')||!(e.metaKey||e.ctrlKey))return;
   if(['+','=','-','0'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='0')this.zoom(1);else this.zoom(map.zoom*(e.key==='-'?1/1.2:1.2));}
  },true);
 }
 blocked(){return Boolean(this.map.study.ink?.dirty||this.map.study.cardInk?.dirty||this.map.topicResize?.active||this.map.study.mindmapStudio?.inline);}
 sync(layout,key){
  if(this.key!==key){if(this.key)this.saved.set(this.key,{...this.state});this.restored=this.saved.has(key);this.needsFit=!this.restored;this.state=this.saved.get(key)||{x:0,y:0,z:.9};this.key=key;this.origin={x:layout.originX||0,y:layout.originY||0};}
  else{const ox=layout.originX||0,oy=layout.originY||0;this.state.x+=(ox-this.origin.x)*this.state.z;this.state.y+=(oy-this.origin.y)*this.state.z;this.origin={x:ox,y:oy};}
  this.layout=layout;this.paint();
 }
 resize(){
  const width=this.view.clientWidth,height=this.view.clientHeight;
  if(width>0&&height>0){if(this.viewportSize&&!this.needsFit){this.state.x+=(width-this.viewportSize.width)/2;this.state.y+=(height-this.viewportSize.height)/2;}this.viewportSize={width,height};}
  this.paint();
 }
 paint(){
  if(!this.layout)return;
  if(this.needsFit&&this.view.clientWidth>0&&this.view.clientHeight>0){this.needsFit=false;const z=Math.max(MIN_ZOOM,Math.min(1,(this.view.clientWidth-64)/this.layout.width,(this.view.clientHeight-64)/this.layout.height));this.state={x:(this.view.clientWidth-this.layout.width*z)/2,y:(this.view.clientHeight-this.layout.height*z)/2,z};}
  if(!this.viewportSize&&this.view.clientWidth>0&&this.view.clientHeight>0)this.viewportSize={width:this.view.clientWidth,height:this.view.clientHeight};
  const {x,y,z}=this.state;this.map.zoom=z;
  Object.assign(this.world.style,{left:x+'px',top:y+'px',width:this.layout.width+'px',height:this.layout.height+'px',transform:`scale(${z})`});
  const extent=document.getElementById('study-map-extent');extent.style.width='100%';extent.style.height='100%';
  Object.assign(this.view.dataset,{cameraX:String(x),cameraY:String(y),cameraZoom:String(z)});
  document.getElementById('study-map-scale').textContent=(z<.01?(z*100).toFixed(2):Math.round(z*100))+'%';
  this.map.window?.schedule();this.map.study.mindmapStudio?.overview();
 }
 schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.paint();if(this.map.topicDrag?.active?.moved)this.map.topicDrag.paint(this.map.topicDrag.active.last);});}
 panBy(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;this.state.x-=dx;this.state.y-=dy;this.schedule();}
 zoom(value,anchor){
  if(this.blocked()||this.map.topicDrag?.active?.moved)return;this.map.motion?.finish();const p=anchor||{x:this.view.clientWidth/2,y:this.view.clientHeight/2};this.state=zoomAt(this.state,value,p);this.paint();
 }
 center(x,y){this.state.x=this.view.clientWidth/2-x*this.state.z;this.state.y=this.view.clientHeight/2-y*this.state.z;this.paint();this.map.window?.paint();}
 fit(){if(!this.layout)return;this.map.motion?.finish();this.state.z=Math.max(MIN_ZOOM,Math.min(1,(this.view.clientWidth-64)/this.layout.width,(this.view.clientHeight-64)/this.layout.height));this.center(this.layout.width/2,this.layout.height/2);}
 box(pad=0){const {x,y,z}=this.state;return{x:(-x-pad)/z,y:(-y-pad)/z,width:(this.view.clientWidth+2*pad)/z,height:(this.view.clientHeight+2*pad)/z};}
 point(e,logical=false){const b=this.view.getBoundingClientRect(),p={x:(e.clientX-b.left-this.state.x)/this.state.z,y:(e.clientY-b.top-this.state.y)/this.state.z};if(logical){p.x+=this.layout?.originX||0;p.y+=this.layout?.originY||0;}return p;}
 wheel(e){
  if(e.target.closest('#mindmap-overview,.mindmap-format-panel,.card-inspector'))return;e.preventDefault();e.stopPropagation();if(this.blocked())return;this.map.motion?.finish();
  const d=wheelDelta(e,this.view.clientHeight);if(e.ctrlKey||e.metaKey){const b=this.view.getBoundingClientRect();this.zoom(this.state.z*Math.exp(-Math.max(-500,Math.min(500,d.y))*.003),{x:e.clientX-b.left,y:e.clientY-b.top});}
  else this.panBy(d.x,d.y);
 }
 start(e){
  if(!this.view.contains(e.target)||this.blocked()||this.pan||e.target.closest('button,input,select,textarea,#mindmap-overview,[data-mm-item],[data-link-id],.mm-relation-handles'))return;
  // A real topic (including batched overview glyphs) owns its pointer. Only
  // explicit middle-button dragging may pan when starting on a topic.
  const topic=this.map.window.topicAt(e),blank=!topic&&!e.target.closest('.study-card'),allowed=e.button===1||e.button===0&&blank&&(this.space||(this.map.study.mapTools?.mode||'hand')==='hand');
  if(!allowed||this.map.study.cardInk?.mode!=='off')return;
  e.preventDefault();e.stopImmediatePropagation();this.map.motion?.finish();this.view.focus({preventScroll:true});const p=this.pan={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,initial:{...this.state},moved:false};this.view.setPointerCapture(e.pointerId);
  const move=v=>{if(v.pointerId!==p.id)return;p.moved||=Math.hypot(v.clientX-p.x,v.clientY-p.y)>3;this.panBy(p.lastX-v.clientX,p.lastY-v.clientY);p.lastX=v.clientX;p.lastY=v.clientY;};
  const up=v=>{if(v.pointerId!==p.id)return;move(v);this.end();};const cancel=v=>{if(v.pointerId===p.id)this.cancel();};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);
  p.clean=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);if(this.view.hasPointerCapture(p.id))this.view.releasePointerCapture(p.id);};this.view.classList.add('camera-panning');
 }
 end(){const p=this.pan;if(!p)return;p.clean();if(p.moved)this.suppress=performance.now()+300;this.pan=null;this.view.classList.remove('camera-panning');this.paint();}
 cancel(){if(!this.pan)return;this.state=this.pan.initial;this.end();}
}
