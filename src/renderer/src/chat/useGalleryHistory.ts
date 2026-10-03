import {useEffect,useRef,useState} from 'react'
import {api} from '../api'
import type {ChatHistory} from '../../../shared/chat-groups'
import type {GalleryImage,GalleryQuery,GalleryCursor,MessengerGalleryPage} from '../../../shared/messenger'
export type GalleryTarget=number|'first'|'last'|'previous'|'next'
export const galleryCursor=(image:GalleryImage):GalleryCursor=>({conversation:image.group?'group:'+image.group:'employee:'+image.employee,messageId:image.messageId!,path:image.path})
const same=(a:GalleryImage,b:GalleryImage)=>a.messageId===b.messageId&&a.path===b.path&&a.employee===b.employee&&a.group===b.group

/** Metadata paging never prevents browsing the photos already on screen. */
export function useGalleryHistory(images:GalleryImage[],index:number,query?:GalleryQuery){
 const [page,setPage]=useState<MessengerGalleryPage>({images,index,offset:0,total:images.length,through:null}),[ready,setReady]=useState(!query),[loading,setLoading]=useState(!!query),[error,setError]=useState('')
 const current=useRef(page),known=useRef(!query),pending=useRef(false),generation=useRef(0),queued=useRef<{target:GalleryTarget;before:(direction:number)=>void}|null>(null)
 const captions=useRef(new Map<string,{text:string;revision:number}>())
 const captionKey=(image:GalleryImage)=>image.group+'/'+image.messageId
 const publish=(next:MessengerGalleryPage)=>{
  const visible=new Set(next.images.map(captionKey));for(const key of captions.current.keys())if(!visible.has(key))captions.current.delete(key)
  next={...next,images:next.images.map(image=>{const edit=captions.current.get(captionKey(image));return edit&&edit.revision>(image.editRevision??0)?{...image,caption:edit.text,editRevision:edit.revision}:image})}
  current.current=next;setPage(next)
 }
 // Text corrections update the frozen gallery without moving its selected image or rereading bytes.
 useEffect(()=>{let active=true;const requests=new Map<string,symbol>(),failure='Could not refresh the edited caption. Refresh to try again.'
  const off=api.onEvent(event=>{
   if(event.channel!=='chat:changed'||!event.payload.editedMessageId)return
   const {id,editedMessageId:messageId}=event.payload,key=id+'/'+messageId
   if(!current.current.images.some(image=>captionKey(image)===key))return
   const ticket=Symbol();requests.set(key,ticket)
   void api.call<ChatHistory>('chat.history',{id,around:messageId,limit:1}).then(history=>{
    const message=history.messages.find(item=>item.id===messageId);if(!active||requests.get(key)!==ticket||!message||!current.current.images.some(image=>captionKey(image)===key))return
    const revision=message.editRevision??0;if(revision<=(captions.current.get(key)?.revision??0))return
    captions.current.set(key,{text:message.text,revision});publish(current.current);setError(previous=>previous===failure?'':previous)
   }).catch(()=>{if(active&&requests.get(key)===ticket&&current.current.images.some(image=>captionKey(image)===key))setError(failure)}).finally(()=>{if(requests.get(key)===ticket)requests.delete(key)})
  });return()=>{active=false;off()}
 },[])
 const fetchPage=async(args:Record<string,unknown>,beforeChange?:(direction:number)=>void,preserve=false)=>{
  if(!query||pending.current)return
  pending.current=true;const request=++generation.current;setLoading(true);setError('');let accepted=false
  try{
   let next=await api.call<MessengerGalleryPage>('messenger.gallery',{...query,...args,limit:40})
   if(request!==generation.current)return
   if(preserve){
    // A late initial response must not jump back over immediate arrow/thumbnail input.
    for(;;){const selected=current.current.images[current.current.index],at=next.images.findIndex(image=>same(image,selected));if(at>=0){next={...next,index:at};break};next=await api.call<MessengerGalleryPage>('messenger.gallery',{...query,anchor:galleryCursor(selected),direction:'around',through:next.through,limit:40});if(request!==generation.current)return}
   }
   if(!next.images.length)throw Error('No images on this gallery page. Refresh to continue.')
   const prior=current.current,old=prior.images[prior.index],selected=next.images[next.index]
   if(!same(old,selected))beforeChange?.(args.direction==='before'||args.direction==='first'?-1:args.direction==='after'||args.direction==='last'?1:Math.sign(next.offset+next.index-prior.offset-prior.index))
   publish(next);known.current=true;setReady(true);accepted=true
  }catch(cause){if(request===generation.current)setError((cause as Error).message)}finally{if(request===generation.current){pending.current=false;setLoading(false);const intent=queued.current;queued.current=null;if(accepted&&intent)select(intent.target,intent.before)}}
 }
 useEffect(()=>{if(query)void fetchPage({anchor:galleryCursor(images[index]),direction:'around'},undefined,true);return()=>{generation.current++;pending.current=false;queued.current=null}},[])
 function select(target:GalleryTarget,beforeChange:(direction:number)=>void){
  const page=current.current,next=target==='previous'?page.index-1:target==='next'?page.index+1:target==='first'?(page.offset===0?0:-1):target==='last'?(page.offset+page.images.length===page.total?page.images.length-1:page.images.length):target
  // Global edge navigation waits for the first authoritative history page.
  if(query&&!known.current&&(target==='first'||target==='last')){queued.current={target,before:beforeChange};if(!pending.current)void fetchPage({anchor:galleryCursor(page.images[page.index]),direction:'around'},undefined,true);return}
  if(pending.current&&(known.current||next<0||next>=page.images.length||target==='first'||target==='last')){queued.current={target,before:beforeChange};return}
  if(next>=0&&next<page.images.length){if(next!==page.index){beforeChange(Math.sign(next-page.index));publish({...page,index:next})};return}
  if(!query||!known.current)return
  if(target==='first'||target==='last'){void fetchPage({direction:target,through:page.through},beforeChange);return}
  const direction=next<0?'before':'after'
  if(direction==='before'&&page.offset===0||direction==='after'&&page.offset+page.images.length>=page.total)return
  const edge=page.images[direction==='before'?0:page.images.length-1]
  void fetchPage({anchor:galleryCursor(edge),direction,through:page.through},beforeChange)
 }
 const cancel=()=>{generation.current++;pending.current=false;queued.current=null}
 const refresh=()=>fetchPage({anchor:galleryCursor(current.current.images[current.current.index]),direction:'around'},undefined,true)
 return {page,select,refresh,cancel,ready,loading,error,previous:page.offset+page.index>0,next:page.offset+page.index+1<page.total}
}
