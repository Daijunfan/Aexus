// Fixed-slot Agent layout. Dragging swaps two roles; work hosts and model state
// are untouched. Each host owns an independent 2D scrolling viewport.

export function agentCanvas(node,hostId,layout,persist,onOpen,{readonlyOrder=false}={}){
 const viewport=node.querySelector('.agent-role-viewport'),canvas=node.querySelector('.agent-role-grid');
 let ids=[],disposed=false,source=null,movedUntil=0,dragEndedAt=0,suppressDragClick=false,scrollTimer;
 const track=document.createElement('div'),thumb=document.createElement('div');
 track.className='agent-vertical-track';track.setAttribute('role','scrollbar');
 track.setAttribute('aria-label','Agent canvas vertical scrollbar');track.setAttribute('aria-orientation','vertical');
 track.setAttribute('aria-valuemin','0');track.tabIndex=0;
 thumb.className='agent-vertical-thumb';track.append(thumb);
 node.querySelector('.agent-role-viewport').after(track);
 let dragScroll=null;
 function scrollbar(){
  const max=Math.max(0,viewport.scrollHeight-viewport.clientHeight);
  const top=viewport.offsetTop,height=viewport.clientHeight;
  track.style.top=top+'px';track.style.height=height+'px';track.hidden=max<3;
  if(track.hidden)return;
  const sliderHeight=Math.max(26,Math.round(height*height/viewport.scrollHeight));
  thumb.style.height=sliderHeight+'px';
  thumb.style.top=Math.round(viewport.scrollTop/max*(height-sliderHeight))+'px';
  track.setAttribute('aria-valuemax',String(Math.round(max)));
  track.setAttribute('aria-valuenow',String(Math.round(viewport.scrollTop)));
 }
 function applyOrder(){
  const tiles=new Map([...canvas.querySelectorAll('.agent-role')].map(el=>[el.dataset.session,el]));
  for(const id of ids){const tile=tiles.get(id);if(tile)canvas.append(tile)}
  // CSS auto-fill uses this host panel's actual content width. No manual
  // columns, minimum canvas width or absolute tile coordinates are retained.
  scrollbar();
 }
 function arrange(roles){
  const present=roles.map(role=>role.id),saved=layout.roleOrder?.[hostId]||[];
  ids=[...saved.filter(id=>present.includes(id)),...present.filter(id=>!saved.includes(id))];
  applyOrder();
 }
 function swap(sourceId,targetId,{drag=false}={}){
  if(readonlyOrder)return false;
  if(!sourceId||!targetId||sourceId===targetId||!ids.includes(sourceId)||!ids.includes(targetId))return false;
  const a=ids.indexOf(sourceId),b=ids.indexOf(targetId);
  const tiles=[...canvas.querySelectorAll('.agent-role')],before=new Map(tiles.map(tile=>[tile,tile.getBoundingClientRect()]));
  [ids[a],ids[b]]=[ids[b],ids[a]];
  applyOrder();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const tile of tiles){
   const prev=before.get(tile),next=tile.getBoundingClientRect();
   if(prev.left!==next.left||prev.top!==next.top)tile.animate([{transform:`translate(${prev.left-next.left}px,${prev.top-next.top}px)`},{transform:'none'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  layout.roleOrder??={};layout.roleOrder[hostId]=ids.slice();
  if(drag)suppressDragClick=true;
  movedUntil=Date.now()+330;void persist();return true;
 }
 const begin=event=>{
  if(readonlyOrder)return;
  const tile=event.target.closest('.agent-role');if(!tile||!canvas.contains(tile))return;
  source=tile.dataset.session;tile.classList.add('agent-moving');
  event.dataTransfer.setData('application/x-cloud-agent-slot',source);
  event.dataTransfer.effectAllowed='move';
 };
 const over=event=>{
  if(!source||!event.dataTransfer.types.includes('application/x-cloud-agent-slot'))return;
  const tile=event.target.closest('.agent-role');if(!tile||!canvas.contains(tile))return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  canvas.querySelectorAll('.agent-swap-target').forEach(el=>el.classList.remove('agent-swap-target'));
  if(tile.dataset.session!==source)tile.classList.add('agent-swap-target');
 };
 const drop=event=>{
  if(!source)return;
  const tile=event.target.closest('.agent-role');if(tile&&canvas.contains(tile)){event.preventDefault();swap(source,tile.dataset.session,{drag:true})}
 };
 const end=()=>{
  if(source)dragEndedAt=Date.now();
  source=null;canvas.querySelectorAll('.agent-moving,.agent-swap-target').forEach(el=>el.classList.remove('agent-moving','agent-swap-target'));
 };
 canvas.addEventListener('dragstart',begin);canvas.addEventListener('dragover',over);canvas.addEventListener('drop',drop);canvas.addEventListener('dragend',end);
 // Native drag/drop can be followed by a synthetic click much later when
 // WebKit is throttled. Suppress that *one* click. A genuine later mouse click
 // starts with pointerdown, explicitly resetting this flag.
 canvas.addEventListener('pointerdown',()=>{suppressDragClick=false});
 canvas.addEventListener('click',event=>{
  if(suppressDragClick){suppressDragClick=false;return}
  const tile=event.target.closest('.agent-role');
  if(tile&&Date.now()>=movedUntil&&Date.now()-dragEndedAt>700)onOpen(tile.dataset.session);
 });
 canvas.addEventListener('keydown',event=>{
  const tile=event.target.closest('.agent-role');
  if(readonlyOrder||!tile||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  const first=canvas.querySelector('.agent-role');
  const columns=first ? Math.max(1,[...canvas.querySelectorAll('.agent-role')].filter(t=>t.offsetTop===first.offsetTop).length) : 1;
  const index=ids.indexOf(tile.dataset.session);
  const step=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-columns:columns;
  const target=ids[index+step];if(!target)return;
  event.preventDefault();swap(tile.dataset.session,target);tile.focus({preventScroll:true});
 });
 function saveScroll(){
  clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{
   if(disposed)return;layout.roleOffsets??={};
   const next={left:Math.round(viewport.scrollLeft),top:Math.round(viewport.scrollTop)};
   const old=layout.roleOffsets[hostId];if(old?.left===next.left&&old?.top===next.top)return;
   layout.roleOffsets[hostId]=next;void persist();
  },450);
 }
 viewport.addEventListener('scroll',()=>{scrollbar();saveScroll()},{passive:true});
 viewport.addEventListener('wheel',event=>{
  if(event.shiftKey&&!event.ctrlKey&&!event.metaKey){viewport.scrollLeft+=event.deltaY;event.preventDefault()}
 },{passive:false});
 const down=event=>{
  if(event.button!==0)return;event.preventDefault();
  const thumbBox=thumb.getBoundingClientRect();
  dragScroll={id:event.pointerId,startY:event.clientY,top:viewport.scrollTop};
  if(!thumb.contains(event.target)){
   viewport.scrollTop=Math.max(0,viewport.scrollTop+(event.clientY<thumbBox.top?-viewport.clientHeight:viewport.clientHeight)*.8);
   dragScroll.top=viewport.scrollTop;
  }
  track.setPointerCapture(event.pointerId);track.classList.add('dragging');
 };
 const drag=event=>{
  if(!dragScroll||event.pointerId!==dragScroll.id)return;
  const max=Math.max(1,viewport.scrollHeight-viewport.clientHeight);
  const space=Math.max(1,viewport.clientHeight-thumb.clientHeight);
  viewport.scrollTop=dragScroll.top+(event.clientY-dragScroll.startY)*max/space;
 };
 const up=event=>{if(!dragScroll||event.pointerId!==dragScroll.id)return;dragScroll=null;track.classList.remove('dragging')};
 track.addEventListener('pointerdown',down);track.addEventListener('pointermove',drag);track.addEventListener('pointerup',up);track.addEventListener('pointercancel',up);track.addEventListener('lostpointercapture',up);
 track.addEventListener('keydown',event=>{
  const amount=event.key==='ArrowDown'?40:event.key==='ArrowUp'?-40:event.key==='PageDown'?viewport.clientHeight:event.key==='PageUp'?-viewport.clientHeight:null;
  if(amount===null)return;event.preventDefault();viewport.scrollTop+=amount;
 });
 const observer=new ResizeObserver(scrollbar);observer.observe(viewport);
 return {arrange,resize:scrollbar,restore(){const offset=layout.roleOffsets?.[hostId];if(offset){viewport.scrollLeft=offset.left||0;viewport.scrollTop=offset.top||0;}scrollbar()},
  get dragging(){return !!source},swap,get columns(){const first=canvas.querySelector('.agent-role');return first?[...canvas.querySelectorAll('.agent-role')].filter(t=>t.offsetTop===first.offsetTop).length:0},dispose(){disposed=true;clearTimeout(scrollTimer);observer.disconnect();track.remove()}};
}
