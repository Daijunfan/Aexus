import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react'
import {orderedKeys,sameOrder} from '../../../shared/messenger-order'
import {translate as uiText} from '../i18n'
import {useConversationListMotion} from './useConversationListMotion'
import {playMessageMotion} from './surfaceMotion'
import '../styles/message-sorting.css'

type Options={keys:string[];identity:string;axis:'x'|'y';disabled?:boolean;label:(key:string)=>string;save:(keys:string[])=>Promise<boolean>}
type Gesture={key:string;node:HTMLElement;pointer:number;touch:boolean;start:number;cross:number;at:number;crossAt:number;grab:number;active:boolean;initial:string[];order:string[];identity:string;save:Options['save'];stop:()=>void}
/** One pointer interaction for tabs and rows. Only release commits; moves are local, animated previews. */
export function useSortableList(options:Options){
 const latest=useRef(options);latest.current=options
 const [preview,setPreview]=useState<{identity:string;keys:string[]}|null>(null),[phase,setPhase]=useState<'idle'|'dragging'|'saving'>('idle'),[announcement,setAnnouncement]=useState('')
 const keys=preview?.identity===options.identity?orderedKeys(options.keys,preview.keys):options.keys
 const root=useConversationListMotion(keys.join('\n'),'data-sort-key'),gesture=useRef<Gesture|null>(null),blocked=useRef(false),suppressClick=useRef(false),mounted=useRef(true),landing=useRef<{node:HTMLElement;rect:DOMRect}|null>(null)
 const axis=options.axis,coordinate=(event:{clientX:number;clientY:number})=>axis==='x'?event.clientX:event.clientY,crossCoordinate=(event:{clientX:number;clientY:number})=>axis==='x'?event.clientY:event.clientX
 const announce=(key:string,order:string[])=>setAnnouncement(uiText('Moved {0} to position {1} of {2}',[latest.current.label(key),order.indexOf(key)+1,order.length]))
 const save=async(order:string[],identity:string,commit:Options['save'])=>{
  blocked.current=true;setPhase('saving');setPreview({identity,keys:order})
  let ok=false
  try{ok=await commit(order)}finally{blocked.current=false;if(mounted.current){setPreview(null);setPhase('idle');if(!ok)setAnnouncement(uiText('Order could not be saved. The current saved order has been restored.'))}}
 }
 const paint=()=>{
  const g=gesture.current,list=root.current;if(!g?.active||!list||!g.node.isConnected)return
  const rect=g.node.getBoundingClientRect(),matrix=new DOMMatrix(getComputedStyle(g.node).transform),factor=list.getBoundingClientRect().width/list.offsetWidth||1
  const base=(axis==='x'?rect.left:rect.top)-(axis==='x'?matrix.m41:matrix.m42)*factor,delta=(g.at-g.grab-base)/factor
  g.node.style.transform=axis==='x'?`translate3d(${delta}px,0,0)`:`translate3d(0,${delta}px,0)`
 }
 const finish=(commit:boolean)=>{
  const g=gesture.current;if(!g)return
  gesture.current=null;g.stop()
  if(!g.active)return
  landing.current=g.node.isConnected?{node:g.node,rect:g.node.getBoundingClientRect()}:null
  g.node.style.removeProperty('transform');delete g.node.dataset.sortDragging;delete root.current?.dataset.sorting
  delete document.body.dataset.messageSorting
  if(g.node.hasPointerCapture(g.pointer))g.node.releasePointerCapture(g.pointer)
  suppressClick.current=true
  if(commit&&!sameOrder(g.initial,g.order)){announce(g.key,g.order);void save(g.order,g.identity,g.save)}
  else {setPreview(null);setPhase('idle');setAnnouncement(uiText('Reordering cancelled'))}
 }
 const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
  suppressClick.current=false
  if(blocked.current||latest.current.disabled||event.button!==0||!event.isPrimary||event.defaultPrevented)return
  const list=root.current,node=(event.target as Element).closest<HTMLElement>('[data-sort-key]'),button=(event.target as Element).closest('button')
  if(!list||!node||node.parentElement!==list||button&&button!==node&&!button.hasAttribute('data-sort-start')&&!button.hasAttribute('data-sort-handle')||latest.current.keys.length<2)return
  const key=node.dataset.sortKey!;if(!latest.current.keys.includes(key))return
  finish(false)
  const rect=node.getBoundingClientRect(),touch=event.pointerType==='touch',g:Gesture={key,node,pointer:event.pointerId,touch,start:coordinate(event),cross:crossCoordinate(event),at:coordinate(event),crossAt:crossCoordinate(event),grab:coordinate(event)-(axis==='x'?rect.left:rect.top),active:false,initial:[...keys],order:[...keys],identity:options.identity,save:options.save,stop:()=>{}}
  gesture.current=g
  let timer:ReturnType<typeof setTimeout>|undefined,frame=0,last=0
  const inside=(margin=0)=>{const box=list.getBoundingClientRect();return axis==='x'?g.at>=box.left-margin&&g.at<=box.right+margin&&g.crossAt>=box.top-margin&&g.crossAt<=box.bottom+margin:g.at>=box.top-margin&&g.at<=box.bottom+margin&&g.crossAt>=box.left-margin&&g.crossAt<=box.right+margin}
  const update=()=>{
   if(!g.active||gesture.current!==g)return
   paint();if(!inside(32))return
   // Use layout slots, not moving animation rectangles: crossing a neighbour cannot oscillate.
   const box=list.getBoundingClientRect(),factor=box.width/list.offsetWidth||1,start=(axis==='x'?box.left:box.top),scroll=axis==='x'?list.scrollLeft:list.scrollTop,position=(g.at-start)/factor+scroll
   const rows=[...list.children].filter((item):item is HTMLElement=>item instanceof HTMLElement&&!!item.dataset.sortKey),others=rows.filter(item=>item!==node)
   const to=others.filter(item=>position>(axis==='x'?item.offsetLeft+item.offsetWidth/2:item.offsetTop+item.offsetHeight/2)).length,next=others.map(item=>item.dataset.sortKey!)
   next.splice(to,0,key)
   if(!sameOrder(g.order,next)){g.order=next;setPreview({identity:g.identity,keys:next})}
  }
  const tick=(time:number)=>{
   if(!g.active||gesture.current!==g)return
   const elapsed=last?Math.min(32,time-last):16;last=time
   const box=list.getBoundingClientRect(),start=axis==='x'?box.left:box.top,end=axis==='x'?box.right:box.bottom,edge=Math.min(44,(end-start)/4)
   const velocity=!inside(32)?0:g.at<start+edge?-Math.min(1,(start+edge-g.at)/edge):g.at>end-edge?Math.min(1,(g.at-end+edge)/edge):0
   if(velocity){if(axis==='x')list.scrollLeft+=velocity*elapsed*.7;else list.scrollTop+=velocity*elapsed*.7}
   update();frame=requestAnimationFrame(tick)
  }
  const begin=()=>{
   if(gesture.current!==g||!node.isConnected||latest.current.disabled)return
   node.getAnimations().forEach(animation=>animation.cancel());g.active=true;node.dataset.sortDragging='true';list.dataset.sorting=axis;document.body.dataset.messageSorting=axis
   node.setPointerCapture(g.pointer);window.getSelection()?.removeAllRanges();setPreview({identity:g.identity,keys:g.order});setPhase('dragging')
   setAnnouncement(uiText('Reordering {0}. Release to save, or press Escape to cancel.',[latest.current.label(key)]));paint();frame=requestAnimationFrame(tick)
  }
  const move=(e:PointerEvent)=>{
   if(e.pointerId!==g.pointer)return
   g.at=coordinate(e);g.crossAt=crossCoordinate(e)
   if(!g.active){if(Math.hypot(g.at-g.start,g.crossAt-g.cross)>6){if(touch){finish(false);return}begin()}}
   if(g.active){e.preventDefault();update()}
  }
  const up=(e:PointerEvent)=>{if(e.pointerId!==g.pointer)return;g.at=coordinate(e);g.crossAt=crossCoordinate(e);if(g.active){e.preventDefault();update()}finish(inside(24))}
  const cancel=(e:PointerEvent)=>{if(e.pointerId===g.pointer)finish(false)}
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false)}}
  const blur=()=>finish(false),hidden=()=>{if(document.hidden)finish(false)},menu=(e:Event)=>{if(g.active){e.preventDefault();e.stopImmediatePropagation()}},touchMove=(e:TouchEvent)=>{if(g.active&&e.cancelable)e.preventDefault()},multi=(e:PointerEvent)=>{if(e.pointerId!==g.pointer)finish(false)}
  g.stop=()=>{clearTimeout(timer);cancelAnimationFrame(frame);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',blur);window.removeEventListener('pointerdown',multi,true);window.removeEventListener('touchmove',touchMove,true);window.removeEventListener('contextmenu',menu,true);document.removeEventListener('visibilitychange',hidden)}
  window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('keydown',escape,true);window.addEventListener('blur',blur);window.addEventListener('pointerdown',multi,true);window.addEventListener('touchmove',touchMove,{capture:true,passive:false});window.addEventListener('contextmenu',menu,true);document.addEventListener('visibilitychange',hidden)
  if(touch)timer=setTimeout(begin,280)
 }
 const onKeyDownCapture=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
  const direction=axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown']
  if(!event.altKey||!direction.includes(event.key)||event.ctrlKey||event.metaKey)return
  const node=(event.target as Element).closest<HTMLElement>('[data-sort-key]');if(!node||node.parentElement!==root.current)return
  event.preventDefault();event.stopPropagation();if(blocked.current||options.disabled)return
  const focus=(event.target as Element).closest<HTMLElement>('button')??node,index=keys.indexOf(node.dataset.sortKey!),next=index+(event.key===direction[0]?-1:1)
  if(index<0||next<0||next>=keys.length)return
  const order=[...keys];order.splice(next,0,order.splice(index,1)[0]);announce(node.dataset.sortKey!,order);void save(order,options.identity,options.save)
  requestAnimationFrame(()=>{if(focus.isConnected){focus.focus({preventScroll:true});node.scrollIntoView({block:'nearest',inline:'nearest'})}})
 }
 useLayoutEffect(()=>{
  const g=gesture.current
  if(g){if(g.identity!==options.identity||options.disabled||g.initial.some(key=>!options.keys.includes(key)))finish(false);else paint()}
  const drop=landing.current
  if(drop){landing.current=null;if(drop.node.isConnected){drop.node.getAnimations().forEach(animation=>animation.cancel());const rect=drop.node.getBoundingClientRect(),factor=root.current?root.current.getBoundingClientRect().width/root.current.offsetWidth||1:1,x=(drop.rect.left-rect.left)/factor,y=(drop.rect.top-rect.top)/factor;playMessageMotion(drop.node,[{transform:`translate(${x}px,${y}px)`,opacity:.9},{transform:'none',opacity:1}],220)}}
 },[keys.join('\n'),options.identity,options.disabled,phase])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const g=gesture.current;if(g){g.stop();g.node.style.removeProperty('transform');delete g.node.dataset.sortDragging;delete document.body.dataset.messageSorting;gesture.current=null}}},[])
 return {root,keys,phase,announcement,bindings:{onPointerDown,onKeyDownCapture,onDragStartCapture:(event:React.DragEvent)=>event.preventDefault(),onClickCapture:(event:React.MouseEvent)=>{if(suppressClick.current&&event.detail!==0){suppressClick.current=false;event.preventDefault();event.stopPropagation()}}}}
}
