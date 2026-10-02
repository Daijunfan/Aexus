import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react'

type Rail={node:HTMLElement;owner:HTMLElement;bar:HTMLElement;viewport:HTMLElement;visible:boolean}
const rails=new Map<Element,Rail>(),viewports=new Map<HTMLElement,Set<Rail>>(),pending=new Set<Rail>()
let resize:ResizeObserver|undefined,visibility:IntersectionObserver|undefined,frame=0
const primary='.message-copy-action,.message-forward-action,.message-reply-action,.message-more-action'
function place(rail:Rail){
 if(!rail.visible||!rail.node.isConnected)return null
 const {owner,bar,viewport}=rail,prose=owner.querySelector<HTMLElement>(':scope > .markdown')
 const style=getComputedStyle(bar),size=parseFloat(style.getPropertyValue('--message-action-size')),gap=parseFloat(style.gap),chrome=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth)
 const buttons=[...bar.querySelectorAll<HTMLButtonElement>(':scope > button')].filter(button=>!button.classList.contains('message-replay-emoji')||!!owner.closest('[data-emoji-count]'))
 const inset=getComputedStyle(owner),contentHeight=owner.offsetHeight-parseFloat(inset.paddingTop)-parseFloat(inset.paddingBottom)-parseFloat(inset.borderTopWidth)-parseFloat(inset.borderBottomWidth)
 const columnHeight=buttons.length*(buttons[0]?.offsetHeight||30)+Math.max(0,buttons.length-1)*gap+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth)
 const gutter=owner.classList.contains('channel-news-card')||contentHeight>=columnHeight+10
 // Layout pixels share the same zoom unit and ignore temporary message entrance transforms.
 const result={rail,sticky:viewport.clientHeight>0&&owner.offsetHeight>viewport.clientHeight,layout:gutter?'gutter':'header',compact:!gutter}
 const plain=prose?.children.length===1&&prose.firstElementChild?.tagName==='P'&&!owner.querySelector('pre,table,blockquote,ul,ol,img,video,audio,.rich-math-block,.tool,.thinking,.command-data,.message-reply-preview,.group-reply-link,.message-file,.message-photo,.message-album')
 if(!plain||!prose)return result
 const line=parseFloat(getComputedStyle(prose).lineHeight)
 if(prose.offsetHeight>line*3+1)return result
 if(!matchMedia('(hover:hover)').matches)return {...result,layout:'header',compact:true}
 const width=(count:number)=>count*size+Math.max(0,count-1)*gap+chrome,full=width(buttons.length),compact=width(buttons.filter(button=>button.matches(primary)).length)
 const bounds=viewport.getBoundingClientRect(),box=owner.getBoundingClientRect(),scale=bounds.width/viewport.offsetWidth||1,outgoing=!!owner.closest('.turn.user,.group-message.from-user')
 const room=outgoing?(box.left-bounds.left)/scale:viewport.clientWidth-(box.right-bounds.left)/scale
 return room>=full+8?{...result,layout:'side',compact:false}:room>=compact+8?{...result,layout:'side',compact:true}:{...result,layout:'header',compact:true}
}
function schedule(rail:Rail){
 if(!rail.visible)return;pending.add(rail)
 if(!frame)frame=requestAnimationFrame(()=>{frame=0;const batch=[...pending];pending.clear();const placements=batch.map(place);for(const result of placements){if(!result)continue;const {rail,layout,compact,sticky}=result;if(rail.node.dataset.layout!==layout)rail.node.dataset.layout=layout;if(compact)rail.node.dataset.compact='true';else delete rail.node.dataset.compact;if(sticky)rail.node.dataset.sticky='true';else delete rail.node.dataset.sticky}})
}
function register(node:HTMLElement){
 const owner=node.parentElement!,bar=node.firstElementChild as HTMLElement,viewport=owner.closest<HTMLElement>('.transcript,.group-transcript,.channel-feed,.message-library-results')
 if(!viewport)return()=>{}
 if(!resize)resize=new ResizeObserver(entries=>{for(const entry of entries){const rail=rails.get(entry.target);if(rail)schedule(rail);else for(const item of viewports.get(entry.target as HTMLElement)??[])schedule(item)}})
 if(!visibility)visibility=new IntersectionObserver(entries=>{for(const entry of entries){const rail=rails.get(entry.target);if(!rail)continue;rail.visible=entry.isIntersecting;if(rail.visible){resize!.observe(rail.owner);resize!.observe(rail.bar);schedule(rail)}else{resize!.unobserve(rail.owner);resize!.unobserve(rail.bar);pending.delete(rail)}}},{rootMargin:'80px'})
 const rail:Rail={node,owner,bar,viewport,visible:false};rails.set(owner,rail);rails.set(bar,rail)
 let members=viewports.get(viewport);if(!members){members=new Set();viewports.set(viewport,members);resize.observe(viewport)}members.add(rail);visibility.observe(owner)
 return()=>{pending.delete(rail);visibility!.unobserve(owner);resize!.unobserve(owner);resize!.unobserve(bar);rails.delete(owner);rails.delete(bar);members!.delete(rail);if(!members!.size){viewports.delete(viewport);resize!.unobserve(viewport)}if(!rails.size){resize!.disconnect();visibility!.disconnect();resize=undefined;visibility=undefined;cancelAnimationFrame(frame);frame=0}}
}
/** One shared observer pair; only messages taller than their reading viewport use native sticky. */
export function MessageActionRail({children}:{children:ReactNode}){
 const root=useRef<HTMLDivElement>(null)
 useLayoutEffect(()=>root.current?register(root.current):undefined,[])
 useLayoutEffect(()=>{const rail=root.current?.parentElement&&rails.get(root.current.parentElement);if(rail)schedule(rail)})
 return <div ref={root} className="message-action-rail">{children}</div>
}
export function useMessageCopy(text:string){
 const [status,setStatus]=useState('')
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),2200);return()=>clearTimeout(timer)},[status])
 const copy=async()=>{try{await navigator.clipboard.writeText(text);setStatus('Copied');return true}catch{setStatus('Could not copy');return false}}
 return {copy,status}
}
