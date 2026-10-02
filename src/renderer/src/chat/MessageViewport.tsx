import {createContext,Fragment,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type Dispatch,type ReactNode,type RefObject,type SetStateAction} from 'react'
import {defaultRangeExtractor,elementScroll,useVirtualizer,type Range} from '@tanstack/react-virtual'
import '../styles/message-viewport.css'

export type MessageViewportHandle={
 readonly managed:boolean
 scrollToMessage:(id:string,options?:{block?:'start'|'center'|'end'|'nearest';signal?:AbortSignal})=>Promise<HTMLElement|null>
 scrollToEnd:()=>void
}
type OwnerContext={handle:MessageViewportHandle;pin:(id:string)=>()=>void;state:Map<string,Map<string,unknown>>}
const ViewportContext=createContext<OwnerContext|null>(null),RowContext=createContext<string|null>(null)
export function useMessageViewport(){return useContext(ViewportContext)?.handle??null}
/** Open media and menus retain only their owning row, even outside the visible range. */
export function useMessageOwner(active:boolean){
 const viewport=useContext(ViewportContext),id=useContext(RowContext)
 useLayoutEffect(()=>{if(active&&id&&viewport?.handle.managed)return viewport.pin(id)},[active,id,viewport])
}
/** Preserve changed row controls across recycling without keeping their DOM mounted. */
export function useMessageRowState<T,>(slot:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
 const viewport=useContext(ViewportContext),id=useContext(RowContext)
 const [value,setValue]=useState<T>(()=>id&&viewport?.state.get(id)?.has(slot)?viewport.state.get(id)!.get(slot) as T:initial)
 const update=useCallback<Dispatch<SetStateAction<T>>>(next=>setValue(previous=>{
  const value=typeof next==='function'?(next as (previous:T)=>T)(previous):next
  if(id&&viewport?.handle.managed){let values=viewport.state.get(id);if(!values)viewport.state.set(id,values=new Map());values.set(slot,value)}
  return value
 }),[id,slot,viewport])
 return [value,update]
}

export function MessageViewport<T extends{id:string}>({items,scrollRef,apiRef,renderItem,enabled=true,following,onProgrammaticScroll}:{
 items:readonly T[];scrollRef:RefObject<HTMLDivElement|null>;apiRef:RefObject<MessageViewportHandle|null>;renderItem:(item:T,index:number)=>ReactNode;enabled?:boolean;following:()=>boolean;onProgrammaticScroll:(top:number)=>void
}){
 const root=useRef<HTMLDivElement>(null),rows=useRef(new Map<string,HTMLDivElement>()),owners=useRef(new Map<string,number>()),rowState=useRef(new Map<string,Map<string,unknown>>()),detailsDefaults=useRef(new WeakMap<HTMLDetailsElement,boolean>()),alive=useRef(true),pendingEnd=useRef(false),navigation=useRef<{cancel:()=>void}|null>(null)
 const [ownerVersion,setOwnerVersion]=useState(0),[activeOwners,setActiveOwners]=useState<string[]>([]),[margin,setMargin]=useState(0),[scrollElement,setScrollElement]=useState<HTMLDivElement|null>(null)
 const callbacks=useRef({following,onProgrammaticScroll});callbacks.current={following,onProgrammaticScroll}
 const indices=useMemo(()=>new Map(items.map((item,index)=>[item.id,index])),[items]),currentIndices=useRef(indices);currentIndices.current=indices
 // The parent's DOM ref attaches after child layout effects on the first mount.
 useEffect(()=>setScrollElement(scrollRef.current),[scrollRef,enabled])
 useEffect(()=>{for(const id of rowState.current.keys())if(!indices.has(id))rowState.current.delete(id)},[indices])
 const pin=useCallback((id:string)=>{
  const count=owners.current.get(id)??0;owners.current.set(id,count+1);if(!count&&alive.current)setOwnerVersion(value=>value+1)
  let released=false
  return()=>{if(released)return;released=true;const count=owners.current.get(id)??0;if(count>1)owners.current.set(id,count-1);else{owners.current.delete(id);if(alive.current)setOwnerVersion(value=>value+1)}}
 },[])
 const rememberDetails=useCallback((id:string,details:HTMLDetailsElement,index:number)=>{
  const slot='details:'+index,values=rowState.current.get(id)??new Map()
  if(details.open===detailsDefaults.current.get(details))values.delete(slot);else values.set(slot,details.open)
  if(values.size)rowState.current.set(id,values);else rowState.current.delete(id)
 },[])
 const rangeExtractor=useCallback((range:Range)=>{
  if(items.length<=200)return items.map((_,index)=>index)
  const result=new Set(defaultRangeExtractor(range))
  for(const id of [...owners.current.keys(),...activeOwners]){const index=indices.get(id);if(index!==undefined)result.add(index)}
  if(callbacks.current.following())for(let index=Math.max(0,items.length-6);index<items.length;index++)result.add(index)
  return [...result].sort((a,b)=>a-b)
 },[items,indices,ownerVersion,activeOwners])
 const virtual=useVirtualizer<HTMLDivElement,HTMLDivElement>({
  count:items.length,getScrollElement:()=>scrollElement,getItemKey:useCallback((index:number)=>items[index].id,[items]),estimateSize:()=>180,
  enabled,overscan:8,rangeExtractor,scrollMargin:margin,anchorTo:'end',followOnAppend:callbacks.current.following(),useFlushSync:false,
  scrollToFn:(offset,options,instance)=>{elementScroll(offset,options,instance);if(scrollRef.current)callbacks.current.onProgrammaticScroll(scrollRef.current.scrollTop)}
 })
 useLayoutEffect(()=>{if(!enabled)pendingEnd.current=false;else if(scrollElement&&pendingEnd.current){pendingEnd.current=false;virtual.scrollToEnd()}},[enabled,scrollElement,virtual])
 useLayoutEffect(()=>{
  if(!enabled||!root.current||!scrollRef.current)return
  const element=root.current,scroll=scrollRef.current
  const measure=()=>{const box=scroll.getBoundingClientRect(),scale=box.height/parseFloat(getComputedStyle(scroll).height)||1,next=(element.getBoundingClientRect().top-box.top)/scale+scroll.scrollTop-scroll.clientTop;setMargin(previous=>Math.abs(previous-next)<.5?previous:next)}
  measure();const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(scroll)
  return()=>observer.disconnect()
 },[enabled,items.length,scrollRef,scrollElement])
 useEffect(()=>{
  if(!enabled||!scrollRef.current)return
  const scroll=scrollRef.current
  const owner=(node:Node|null)=>{const element=node instanceof Element?node:node?.parentElement;return element&&scroll.contains(element)?element.closest<HTMLElement>('[data-message-owner]')?.dataset.messageOwner:undefined}
  const update=()=>{if(!alive.current)return;const selection=getSelection(),ids=[owner(document.activeElement),...(!selection?.isCollapsed?[owner(selection?.anchorNode??null),owner(selection?.focusNode??null)]:[])],next=[...new Set(ids.filter((id):id is string=>!!id))];setActiveOwners(previous=>previous.length===next.length&&previous.every((id,index)=>id===next[index])?previous:next)}
  const blur=()=>queueMicrotask(update)
  const cancel=()=>{pendingEnd.current=false;navigation.current?.cancel()}
  const key=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!(event.target as Element)?.closest('input,textarea,[contenteditable=true]'))cancel()}
  const toggle=(event:Event)=>{const details=event.target;if(!(details instanceof HTMLDetailsElement))return;const row=details.closest<HTMLElement>('[data-message-owner]'),id=row?.dataset.messageOwner;if(row&&id)rememberDetails(id,details,Array.from(row.querySelectorAll('details')).indexOf(details))}
  scroll.addEventListener('focusin',update);scroll.addEventListener('focusout',blur);document.addEventListener('selectionchange',update)
  scroll.addEventListener('wheel',cancel,{passive:true});scroll.addEventListener('touchstart',cancel,{passive:true});scroll.addEventListener('pointerdown',cancel);scroll.addEventListener('keydown',key);scroll.addEventListener('toggle',toggle,true)
  return()=>{scroll.removeEventListener('focusin',update);scroll.removeEventListener('focusout',blur);document.removeEventListener('selectionchange',update);scroll.removeEventListener('wheel',cancel);scroll.removeEventListener('touchstart',cancel);scroll.removeEventListener('pointerdown',cancel);scroll.removeEventListener('keydown',key);scroll.removeEventListener('toggle',toggle,true)}
 },[enabled,scrollRef,scrollElement,rememberDetails])
 const handle=useMemo<MessageViewportHandle>(()=>({
  managed:enabled,
  scrollToEnd(){navigation.current?.cancel();if(enabled){pendingEnd.current=!virtual.scrollElement;if(!pendingEnd.current)virtual.scrollToEnd()}else if(scrollRef.current){scrollRef.current.scrollTop=scrollRef.current.scrollHeight;callbacks.current.onProgrammaticScroll(scrollRef.current.scrollTop)}},
  scrollToMessage(id,{block='center',signal}={}){
   pendingEnd.current=false
   navigation.current?.cancel()
   if(signal?.aborted||!currentIndices.current.has(id)||!scrollRef.current)return Promise.resolve(null)
   return new Promise(resolve=>{
    let frame=0,done=false,stable=0,startedIndex:number|undefined,last:number[]|undefined
    const release=enabled?pin(id):()=>{}
    const finish=(node:HTMLElement|null)=>{if(done)return;done=true;cancelAnimationFrame(frame);signal?.removeEventListener('abort',cancel);if(navigation.current?.cancel===cancel)navigation.current=null;release();resolve(node)}
    const cancel=()=>{if(enabled&&alive.current&&scrollRef.current)virtual.scrollToOffset(scrollRef.current.scrollTop);finish(null)}
    navigation.current={cancel};signal?.addEventListener('abort',cancel,{once:true})
    const step=()=>{
     const scroll=scrollRef.current,index=currentIndices.current.get(id)
     if(!alive.current||signal?.aborted||!scroll?.isConnected||index===undefined){finish(null);return}
     if(enabled&&!virtual.scrollElement){frame=requestAnimationFrame(step);return}
     const wrapper=enabled?rows.current.get(id):[...scroll.querySelectorAll<HTMLElement>('[data-chat-item]')].find(node=>node.dataset.chatItem===id)
     if(startedIndex!==index){startedIndex=index;if(enabled)virtual.scrollToIndex(index,{align:block==='nearest'?'auto':block,behavior:'auto'});else{wrapper?.scrollIntoView({block,behavior:'instant'});callbacks.current.onProgrammaticScroll(scroll.scrollTop)}}
     const message=wrapper?.matches('[data-chat-item]')?wrapper:wrapper?.querySelector<HTMLElement>('[data-chat-item]')
     if(wrapper&&!message){finish(null);return}
     if(wrapper&&message){
      const rect=wrapper.getBoundingClientRect(),box=scroll.getBoundingClientRect(),scale=box.height/parseFloat(getComputedStyle(scroll).height)||1,top=box.top+scroll.clientTop*scale,bottom=top+scroll.clientHeight*scale,position=[rect.top,rect.height,scroll.scrollTop]
      stable=last&&position.every((value,index)=>Math.abs(value-last![index])<.5)?stable+1:0;last=position
      if(stable>=2){
       const delta=block==='start'?rect.top-top:block==='end'?rect.bottom-bottom:block==='center'?(rect.top+rect.bottom-top-bottom)/2:rect.top<top&&rect.bottom>bottom?0:rect.top<top?rect.top-top:rect.bottom>bottom?rect.bottom-bottom:0
       const target=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+delta/scale))
       // Consume pending anchor corrections before handing the row to quote/highlight navigation.
       if(Math.abs(target-scroll.scrollTop)>1){if(enabled)virtual.scrollToOffset(target);else{scroll.scrollTop=target;callbacks.current.onProgrammaticScroll(scroll.scrollTop)}stable=0;last=undefined}
       else if(rect.bottom>top&&rect.top<bottom){finish(message);return}
      }
     }
     frame=requestAnimationFrame(step)
    }
    frame=requestAnimationFrame(step)
   })
  }
 }),[enabled,pin,scrollRef,virtual])
 const context=useMemo(()=>({handle,pin,state:rowState.current}),[handle,pin])
 useLayoutEffect(()=>{apiRef.current=handle;return()=>{if(apiRef.current===handle)apiRef.current=null}},[apiRef,handle])
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;navigation.current?.cancel();rowState.current.clear()}},[])
 if(!enabled)return <ViewportContext.Provider value={context}>{items.map((item,index)=><Fragment key={item.id}>{renderItem(item,index)}</Fragment>)}</ViewportContext.Provider>
 const visible=virtual.getVirtualItems(),children:ReactNode[]=[];let end=margin
 for(const row of visible){
  const item=items[row.index],gap=Math.max(0,row.start-end);end=row.end
  children.push(<Fragment key={item.id}>{gap>0&&<div className="message-viewport-spacer" aria-hidden="true" style={{height:gap}}/>}<RowContext.Provider value={item.id}><div className="message-viewport-row" data-message-owner={item.id} data-message-last={row.index===items.length-1||undefined} data-index={row.index} ref={node=>{if(node){rows.current.set(item.id,node);node.querySelectorAll('details').forEach((details,index)=>{if(detailsDefaults.current.has(details))return;detailsDefaults.current.set(details,details.open);const state=rowState.current.get(item.id),slot='details:'+index;if(state?.has(slot))details.open=state.get(slot) as boolean})}else{rows.current.get(item.id)?.querySelectorAll('details').forEach((details,index)=>rememberDetails(item.id,details,index));rows.current.delete(item.id)}virtual.measureElement(node)}}>{renderItem(item,row.index)}</div></RowContext.Provider></Fragment>)
 }
 const total=virtual.getTotalSize(),tail=Math.max(0,total-(end-margin))
 return <ViewportContext.Provider value={context}><div ref={root} className="message-viewport" style={{height:total}}>{children}{tail>0&&<div className="message-viewport-spacer" aria-hidden="true" style={{height:tail}}/>}</div></ViewportContext.Provider>
}
