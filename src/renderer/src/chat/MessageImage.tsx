import {useMessageOwner,useMessageViewport,useMessageRowState} from './MessageViewport'
import {useMessenger} from '../components/useMessenger'
import type {GalleryQuery} from '../../../shared/messenger'
import {translate as uiText,useI18n} from '../i18n'
import {createContext,useContext,useEffect,useRef,useState} from 'react'
import {MessageImageViewer,readGalleryImage,galleryKey,type GalleryImage} from './MessageImageViewer'
import {Icon} from '../components/Icon'

/** A view supplies its ordered public images; opening a gallery freezes that order. */
export const MessageGalleryContext=createContext<{images:GalleryImage[];history?:GalleryQuery}|null>(null)
export function MessageImages({employee,group,paths,messageId,caption}:{employee?:string;group?:string;paths:string[];messageId?:string;caption?:string}){
 const [ratios,setRatios]=useMessageRowState<Record<string,number>>('images:ratios',{}),inherited=useContext(MessageGalleryContext),items=paths.map(path=>({employee,group,path,messageId,caption}))
 if(!paths.length)return null
 return <MessageGalleryContext.Provider value={inherited??{images:items}}><div className={paths.length>1?'message-album':'message-single-photo'} data-photo-count={paths.length} data-album-remainder={paths.length%3} data-leading-portrait={(ratios[paths[0]]??1)<.9||undefined} aria-label={paths.length>1?uiText('{0} photos',[paths.length]):undefined}>{items.map(item=><MessageImage key={item.path} {...item} onDimensions={ratio=>setRatios(previous=>previous[item.path]===ratio?previous:{...previous,[item.path]:ratio})}/>)}</div></MessageGalleryContext.Provider>
}
/** Scoped, lazy image reads; bytes never come from another conversation implicitly. */
export function MessageImage(source:GalleryImage&{onDimensions?:(ratio:number)=>void}){
 useI18n()
 const messenger=useMessenger(),{employee,group,path}=source,gallery=useContext(MessageGalleryContext),root=useRef<HTMLButtonElement>(null),[image,setImage]=useState(''),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[opened,setOpened]=useState<{items:GalleryImage[];index:number;history?:GalleryQuery}|null>(null)
 const viewport=useMessageViewport();useMessageOwner(!!opened)
 useEffect(()=>{
  setImage('');setError(false);setOpened(null)
  let active=true,started=false
  const load=()=>{if(started)return;started=true;void readGalleryImage(source).then(value=>{if(active)setImage(value)}).catch(()=>{if(active)setError(true)})}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){load();observer.disconnect()}},{rootMargin:'120px'})
  if(root.current)observer.observe(root.current)
  return()=>{active=false;observer.disconnect()}
 },[employee,group,path,attempt])
 const name=path.split(/[\\/]/).at(-1)||'Photo',key=galleryKey(source)
 const origin=(item:GalleryImage)=>{const scope=root.current?.closest('.transcript,.group-transcript,.message-library-results,.message-attachment-draft')??root.current?.parentElement;return [...scope?.querySelectorAll<HTMLButtonElement>('[data-gallery-image]')??[]].find(button=>button.dataset.galleryImage===galleryKey(item))??null}
 return <><button ref={root} type="button" className="message-photo" data-gallery-image={key} aria-label={error?uiText('Retry image {0}',[name]):uiText('View image {0}',[name])} aria-busy={!image&&!error||undefined} onClick={()=>{if(error){setAttempt(value=>value+1);return}const items=gallery?.images.some(item=>galleryKey(item)===key)?gallery.images:[source];setOpened({items:[...items],index:items.findIndex(item=>galleryKey(item)===key),history:gallery?.history})}}>{image?<img alt={name} src={image} onLoad={event=>source.onDimensions?.(event.currentTarget.naturalWidth/event.currentTarget.naturalHeight)}/>:<span><Icon name={error?'refresh':'file-media'}/>{error?uiText('Preview unavailable · Retry'):uiText('Loading image…')}</span>}</button>{opened&&<MessageImageViewer items={opened.items} initialIndex={opened.index} initialSrc={image} history={opened.history} origin={origin} prepareClose={async item=>{if(item.messageId&&gallery?.images.some(image=>galleryKey(image)===galleryKey(item)))await viewport?.scrollToMessage(item.messageId,{block:'nearest'})}} onReveal={source.messageId&&messenger?item=>{messenger.setLibrary(null);void messenger.navigate({conversation:item.group?'group:'+item.group:'employee:'+item.employee,id:item.messageId!})}:undefined} onClose={()=>setOpened(null)}/>}</>
}
