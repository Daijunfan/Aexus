import {useGalleryHistory,type GalleryTarget} from './useGalleryHistory'
import type {GalleryImage,GalleryQuery} from '../../../shared/messenger'
export type {GalleryImage} from '../../../shared/messenger'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {translate as uiText,useI18n} from '../i18n'
import {Icon} from '../components/Icon'
import {api} from '../api'
import {useDialogFocus} from '../office/useDialogFocus'
import {motionAllowed,playMessageMotion} from './surfaceMotion'

export const galleryKey=(item:GalleryImage)=>JSON.stringify([item.employee??null,item.group??null,item.messageId??null,item.path,...(item.channel?[item.channel]:[])])
export async function readGalleryImage(item:GalleryImage){const value=await api.call<{mimeType:string;data:string}>(item.channel?'conversation.file':item.group?'chat.file':'workspace.image',item.channel?{conversation:'channel:'+item.channel,operation:'image',path:item.path}:item.group?{id:item.group,path:item.path,operation:'image'}:{employee:item.employee,path:item.path});return `data:${value.mimeType};base64,${value.data}`}
type Point={x:number;y:number}
type Gesture={kind:'pan'|'swipe';start:Point;offset:Point;time:number}|{kind:'pinch';distance:number;center:Point;zoom:number;offset:Point}

/** One ordered gallery, bounded nearby reads, and a return transition to the selected photo. */
export function MessageImageViewer({items:initialItems,initialIndex,initialSrc,history,origin,onClose,onReveal,prepareClose,readImage=readGalleryImage}:{items:GalleryImage[];initialIndex:number;initialSrc:string;history?:GalleryQuery;prepareClose?:(item:GalleryImage)=>Promise<void>;onReveal?:(image:GalleryImage)=>void;origin:(item:GalleryImage)=>HTMLButtonElement|null;onClose:()=>void;readImage?:(item:GalleryImage)=>Promise<string>}){
 useI18n()
 const overlay=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),photo=useRef<HTMLImageElement>(null),closing=useRef(false),entered=useRef(false),direction=useRef(0),animations=useRef(new Set<Animation>())
 const gallery=useGalleryHistory(initialItems,initialIndex,history),{images:items,index}=gallery.page
 const [zoom,setZoom]=useState(1),[offset,setOffset]=useState<Point>({x:0,y:0}),[swipe,setSwipe]=useState<Point>({x:0,y:0}),[dragging,setDragging]=useState(false),[dimensions,setDimensions]=useState(''),[attempt,setAttempt]=useState(0)
 const cache=useRef(new Map<string,Promise<string>>(initialSrc?[[galleryKey(initialItems[initialIndex]),Promise.resolve(initialSrc)]]:[])),[images,setImages]=useState<Record<string,string>>(initialSrc?{[galleryKey(initialItems[initialIndex])]:initialSrc}:{}),[errors,setErrors]=useState<Record<string,boolean>>({})
 const wheelLast=useRef(0),pointers=useRef(new Map<number,Point>()),gesture=useRef<Gesture|null>(null)
 const item=items[index],key=galleryKey(item),src=images[key],name=item.path.split(/[\\/]/).at(-1)??'Photo',first=Math.max(0,Math.min(index-3,items.length-7)),nearby=items.slice(first,first+7).map((item,offset)=>({item,index:first+offset}))
 useDialogFocus('.message-image-dialog',true,()=>origin(items[index]))
 const play=(el:Element,frames:Keyframe[],duration:number,done?:()=>void)=>{let animation:Animation|undefined;animation=playMessageMotion(el,frames,duration,()=>{if(animation)animations.current.delete(animation);done?.()});if(animation)animations.current.add(animation)}
 const settle=()=>{for(const animation of animations.current)if(animation.playState==='running')animation.finish()}
 useEffect(()=>{
  let active=true;const keys=new Set(nearby.map(({item})=>galleryKey(item)))
  for(const entry of cache.current.keys())if(!keys.has(entry))cache.current.delete(entry)
  setImages(previous=>Object.fromEntries(Object.entries(previous).filter(([entry])=>keys.has(entry))))
  for(const {item} of nearby){const id=galleryKey(item);let work=cache.current.get(id);if(!work){work=readImage(item);cache.current.set(id,work)}void work.then(value=>{if(active&&!closing.current){setImages(previous=>({...previous,[id]:value}));setErrors(previous=>({...previous,[id]:false}))}}).catch(()=>{if(active&&!closing.current)setErrors(previous=>({...previous,[id]:true}))})}
  return()=>{active=false}
 },[items,index,attempt])
 const pageScale=()=>{const area=viewport.current;return area?area.getBoundingClientRect().width/area.offsetWidth:1}
 const thumbnailTransform=()=>{
  const el=photo.current,area=viewport.current,source=origin(item)?.getBoundingClientRect()
  if(!el||!area||!source||source.bottom<=0||source.top>=innerHeight||source.right<=0||source.left>=innerWidth)return null
  const box=area.getBoundingClientRect(),factor=pageScale(),x=(source.left+source.width/2-box.left-box.width/2)/factor,y=(source.top+source.height/2-box.top-box.height/2)/factor
  return `translate(${x}px,${y}px) scale(${source.width/el.offsetWidth/factor},${source.height/el.offsetHeight/factor})`
 }
 const close=async(after?:()=>void)=>{
  if(closing.current)return;closing.current=true;gallery.cancel();settle();if(!after)await prepareClose?.(item).catch(()=>{});if(!overlay.current)return;const target=origin(item);target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const finish=()=>{onClose();after?.()}
  if(!motionAllowed()){finish();return}
  const el=photo.current,transform=thumbnailTransform()
  if(el)play(el,[{transform:getComputedStyle(el).transform,opacity:1},{transform:transform??`translate(${offset.x}px,${offset.y}px) scale(${zoom*.96})`,opacity:transform?1:0}],250)
  if(overlay.current)play(overlay.current,[{opacity:1},{opacity:0}],250,finish);else finish()
 }
 const enter=()=>{
  const el=photo.current;if(!el||entered.current||closing.current)return;entered.current=true;setDimensions(`${el.naturalWidth} × ${el.naturalHeight}`)
  const transform=direction.current?`translateX(${direction.current*65}px) scale(.985)`:thumbnailTransform()??'scale(.96)'
  play(el,[{transform,opacity:.25},{transform:'none',opacity:1}],direction.current?220:250)
 }
 const clampOffset=(next:Point,scale=zoom)=>{const el=photo.current,area=viewport.current;if(!el||!area)return {x:0,y:0};const maxX=Math.max(0,(el.offsetWidth*scale-area.clientWidth)/2),maxY=Math.max(0,(el.offsetHeight*scale-area.clientHeight)/2);return {x:Math.max(-maxX,Math.min(maxX,next.x)),y:Math.max(-maxY,Math.min(maxY,next.y))}}
 const changeZoom=(next:number)=>{if(closing.current||!src||errors[key])return;settle();const value=Math.max(1,Math.min(4,next));setZoom(value);setOffset(clampOffset(offset,value));setSwipe({x:0,y:0})}
 const navigate=(next:GalleryTarget)=>{
  if(closing.current)return
  gallery.select(next,way=>{
  settle();direction.current=way;const el=photo.current,area=viewport.current
  if(el&&area&&motionAllowed()){const copy=el.cloneNode(true) as HTMLImageElement,rect=el.getBoundingClientRect(),box=area.getBoundingClientRect(),factor=pageScale();copy.removeAttribute('alt');copy.setAttribute('aria-hidden','true');copy.dataset.galleryExit='true';Object.assign(copy.style,{position:'absolute',left:(rect.left-box.left)/factor+'px',top:(rect.top-box.top)/factor+'px',width:rect.width/factor+'px',height:rect.height/factor+'px',maxWidth:'none',maxHeight:'none',pointerEvents:'none',transform:'none'});area.append(copy);play(copy,[{transform:'none',opacity:1},{transform:`translateX(${-direction.current*65}px) scale(.985)`,opacity:0}],180,()=>copy.remove())}
  entered.current=false;setDimensions('');setZoom(1);setOffset({x:0,y:0});setSwipe({x:0,y:0});gesture.current=null;pointers.current.clear();setDragging(false)
  })
 }
 useEffect(()=>{const area=viewport.current;if(!area)return;const observer=new ResizeObserver(()=>setOffset(current=>clampOffset(current)));observer.observe(area);return()=>observer.disconnect()},[zoom,index])
 useEffect(()=>{if(overlay.current)play(overlay.current,[{opacity:0},{opacity:1}],200);return()=>{for(const animation of animations.current)animation.cancel();cache.current.clear()}},[])
 // Visible preview controls must already own keyboard input, including immediate reopen.
 useLayoutEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close()}
   else if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();if(event.key==='0')changeZoom(1);else if(event.key==='Home'||event.key==='End')navigate(event.key==='Home'?'first':'last');else if(event.key==='-'||event.key==='+'||event.key==='=')changeZoom(zoom+(event.key==='-'?-.5:.5));else if(zoom===1&&(event.key==='ArrowLeft'||event.key==='ArrowRight'))navigate(event.key==='ArrowLeft'?'previous':'next');else if(zoom>1)setOffset(clampOffset({x:offset.x+(event.key==='ArrowLeft'?60:event.key==='ArrowRight'?-60:0),y:offset.y+(event.key==='ArrowUp'?60:event.key==='ArrowDown'?-60:0)}))}
  };window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)
 },[items,index,zoom,offset,swipe,gallery.loading,gallery.ready])
 useEffect(()=>{const area=viewport.current;if(!area)return;const wheel=(event:WheelEvent)=>{if(event.ctrlKey||event.metaKey){event.preventDefault();changeZoom(zoom+(event.deltaY<0?.25:-.25))}else if(zoom>1){event.preventDefault();setOffset(current=>clampOffset({x:current.x-event.deltaX/pageScale(),y:current.y-event.deltaY/pageScale()}))}else if(Math.abs(event.deltaX)>Math.abs(event.deltaY)&&Math.abs(event.deltaX)>25){event.preventDefault();const now=Date.now(),quiet=now-wheelLast.current>180;wheelLast.current=now;if(quiet)navigate(event.deltaX>0?'next':'previous')}};area.addEventListener('wheel',wheel,{passive:false});return()=>area.removeEventListener('wheel',wheel)},[items,index,zoom,offset,gallery.loading,gallery.ready])
 const pointerDown=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(closing.current||event.button!==0||(event.target as HTMLElement).closest('button')||!src||event.pointerType==='mouse'&&zoom===1)return
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});settle();setDragging(true)
  const points=[...pointers.current.values()]
  if(points.length===2){const [a,b]=points;gesture.current={kind:'pinch',distance:Math.hypot(b.x-a.x,b.y-a.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},zoom,offset};setSwipe({x:0,y:0})}
  else gesture.current={kind:zoom>1?'pan':'swipe',start:points[0],offset,time:Date.now()}
 }
 const pointerMove=(event:React.PointerEvent<HTMLDivElement>)=>{
  if(!pointers.current.has(event.pointerId)||!gesture.current)return;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const start=gesture.current
  if(start.kind==='pinch'){const [a,b]=[...pointers.current.values()];if(!b)return;const scale=Math.max(1,Math.min(4,start.zoom*Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,start.distance))),box=event.currentTarget.getBoundingClientRect(),center={x:box.left+box.width/2,y:box.top+box.height/2},factor=pageScale();setZoom(scale);setOffset(clampOffset({x:((a.x+b.x)/2-center.x-(start.center.x-center.x-start.offset.x*factor)*scale/start.zoom)/factor,y:((a.y+b.y)/2-center.y-(start.center.y-center.y-start.offset.y*factor)*scale/start.zoom)/factor},scale))}
  else if(start.kind==='pan')setOffset(clampOffset({x:start.offset.x+(event.clientX-start.start.x)/pageScale(),y:start.offset.y+(event.clientY-start.start.y)/pageScale()}))
  else{const x=event.clientX-start.start.x,y=event.clientY-start.start.y;setSwipe({x:(((!gallery.previous&&x>0)||(!gallery.next&&x<0))?x*.25:x)/pageScale(),y:Math.abs(y)>Math.abs(x)?y*.6/pageScale():0})}
 }
 const pointerEnd=(event:React.PointerEvent<HTMLDivElement>,cancel=false)=>{
  const start=gesture.current;pointers.current.delete(event.pointerId)
  if(pointers.current.size===1){gesture.current={kind:'pan',start:[...pointers.current.values()][0],offset,time:Date.now()};return}
  gesture.current=null;setDragging(false);setSwipe({x:0,y:0})
  if(!cancel&&start?.kind==='swipe'&&Date.now()-start.time<900){const x=event.clientX-start.start.x,y=event.clientY-start.start.y;if(Math.abs(x)>48&&Math.abs(x)>Math.abs(y)*1.2)navigate(x<0?'next':'previous');else if(Math.abs(y)>110&&Math.abs(y)>Math.abs(x)*1.4)close()}
 }
 const retry=()=>{cache.current.delete(key);setErrors(previous=>({...previous,[key]:false}));setAttempt(value=>value+1)}
 return createPortal(<div ref={overlay} className="message-image-overlay" onClick={()=>close()}>
  <section className="message-image-dialog" role="dialog" aria-modal="true" aria-label={uiText('Image preview')} onClick={event=>event.stopPropagation()}>
   <header><span className="message-image-file"><Icon name="file-media"/><span><strong>{name}</strong><small>{dimensions||uiText(errors[key]?'Preview unavailable':'Loading image…')}{item.conversationTitle&&' · '+item.conversationTitle}</small></span></span>{(history||items.length>1)&&<output className="message-gallery-count" aria-live="polite" aria-label={uiText('Image position')}>{gallery.ready?uiText('Image {0} of {1}',[gallery.page.offset+index+1,gallery.page.total]):uiText(gallery.loading?'Loading gallery…':'Loaded images')}</output>}<a className="message-image-download" href={src&&!errors[key]?src:undefined} download={name} aria-disabled={!src||!!errors[key]} tabIndex={!src||errors[key]?-1:0} aria-label={uiText('Download image')} title={uiText('Download image')}><Icon name="desktop-download"/></a>{onReveal&&item.messageId&&<button aria-label={uiText('Go to image message')} title={uiText('Go to image message')} onClick={()=>close(()=>onReveal(item))}><Icon name="go-to-file"/></button>}<button aria-label={uiText('Close image preview')} title={uiText('Close image preview')} onClick={()=>close()}><Icon name="close"/></button></header>
   <div ref={viewport} className={`message-image-viewport ${zoom>1?'zoomed':''} ${dragging?'dragging':''}`} onDoubleClick={event=>{if(!(event.target as HTMLElement).closest('button'))changeZoom(zoom>1?1:2)}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event=>pointerEnd(event)} onPointerCancel={event=>pointerEnd(event,true)}>
    {src&&!errors[key]?<img key={key} ref={photo} src={src} alt={name} draggable={false} onLoad={enter} onError={()=>setErrors(previous=>({...previous,[key]:true}))} style={{transform:`translate(${offset.x+swipe.x}px,${offset.y+swipe.y}px) scale(${zoom})`}}/>:<div className="message-gallery-placeholder" role="status"><Icon name={errors[key]?'file-media':'loading'}/><strong>{uiText(errors[key]?'Preview unavailable':'Loading image…')}</strong>{errors[key]&&<button onClick={retry}>{uiText('Retry preview')}</button>}</div>}
    {gallery.page.total>1&&<><button className="message-gallery-arrow previous" aria-label={uiText('Previous image')} title={uiText('Previous image')} disabled={!gallery.previous||gallery.loading&&gallery.ready} onClick={()=>navigate('previous')}><Icon name="chevron-left"/></button><button className="message-gallery-arrow next" aria-label={uiText('Next image')} title={uiText('Next image')} disabled={!gallery.next||gallery.loading&&gallery.ready} onClick={()=>navigate('next')}><Icon name="chevron-right"/></button></>}
   </div>
   {(gallery.loading||gallery.error)&&<div className="message-gallery-history-status" role={gallery.error?'alert':'status'}>{gallery.error?uiText('Gallery history could not be loaded. Your current image is kept.'):uiText('Loading gallery…')}{gallery.error&&<button onClick={()=>void gallery.refresh()} title={gallery.error}>{uiText('Retry gallery history')}</button>}</div>}
   {item.caption&&<p className="message-gallery-caption">{item.caption}</p>}
   {items.length>1&&<nav className="message-gallery-filmstrip" aria-label={uiText('Gallery thumbnails')}>{nearby.map(({item,index:position})=>{const id=galleryKey(item);return <button key={id} className={position===index?'selected':''} disabled={gallery.loading&&gallery.ready} aria-current={position===index?'true':undefined} aria-label={uiText('Show image {0}: {1}',[gallery.page.offset+position+1,item.path.split(/[\\/]/).at(-1)])} onClick={()=>navigate(position)}>{images[id]&&!errors[id]?<img src={images[id]} alt=""/>:<Icon name="file-media"/>}<span>{gallery.page.offset+position+1}</span></button>})}</nav>}
   <footer><span>{uiText('Double-click to zoom · Drag to explore')}</span><div className="message-image-zoom" role="toolbar" aria-label={uiText('Image zoom')}><button aria-label={uiText('Zoom out')} title={uiText('Zoom out')} disabled={zoom===1||!src} onClick={()=>changeZoom(zoom-.5)}><Icon name="remove"/></button><output aria-label={uiText('Zoom level')}>{Math.round(zoom*100)}%</output><button aria-label={uiText('Zoom in')} title={uiText('Zoom in')} disabled={zoom===4||!src} onClick={()=>changeZoom(zoom+.5)}><Icon name="add"/></button><i/><button className="message-image-fit" aria-label={uiText('Fit image')} title={uiText('Fit image')} onClick={()=>changeZoom(1)}><Icon name="screen-full"/></button></div><span className="message-image-key">{gallery.page.total>1?'← → · ':''}Esc · {uiText('Close')}</span></footer>
  </section>
 </div>,document.body)
}
