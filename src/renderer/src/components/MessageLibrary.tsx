import {useReadingPosition} from './useReadingPosition'
import type {ChannelEvent} from '../../../shared/channels'
import {ChannelNewsCard} from './ChannelNewsCard'
import {ChannelSourcesDialog} from './ChannelSourcesDialog'
import {MessageFile} from '../chat/MessageAttachments'
import {useDialogFocus} from '../office/useDialogFocus'
import {useSurfaceMotion} from '../chat/surfaceMotion'
import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useRef,useState,useMemo} from 'react'
import {useMessenger} from './useMessenger'
import {Icon} from './Icon'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'
import {MessageImages,MessageGalleryContext} from '../chat/MessageImage'
import {messageLinks,plainMessagePreview,type MessengerMessage,type MessengerResults} from '../../../shared/messenger'

export function MessageLibrary(){
  useI18n()

 const surface=useSurfaceMotion<HTMLElement>('panel')
 useDialogFocus('.message-library',true)
 const messenger=useMessenger()!,config=messenger.library!
 const [query,setQuery]=useState(config.query??''),[filter,setFilter]=useState(config.filter??'all'),[author,setAuthor]=useState('all'),[results,setResults]=useState<MessengerResults>({messages:[],total:0,hasMore:false}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[windowSize,setWindowSize]=useState(40)
 const queryKey=JSON.stringify([config.conversation,query,filter,author]),[resultKey,setResultKey]=useState(''),[retry,setRetry]=useState(0)
 const galleryImages=useMemo(()=>results.messages.filter(message=>!message.news).flatMap(message=>message.images.map(path=>({...(message.conversation.startsWith('employee:')?{employee:message.conversation.slice(9)}:{group:message.conversation.slice(6)}),path,messageId:message.id,caption:message.text}))),[results.messages])
 const search=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null),[sourceId,setSourceId]=useState<string|null>(null),snapshot=useRef({key:'',value:results}),keepPosition=useReadingPosition(list,results)
 const pageSize=useRef(windowSize),requestRefresh=useRef<()=>void>(()=>{});pageSize.current=windowSize
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined
  const off=api.onEvent(event=>{
   if(event.channel==='channel:changed'){
    const change=event.payload as ChannelEvent
    if(change.kind==='reads')return
    if(config.conversation&&!config.conversation.startsWith('channel:'))return
    if(change.kind!=='messages'&&(author!=='all'||!['all','saved','media','links'].includes(filter)))return
    if(config.conversation&&change.channelIds&&!change.channelIds.includes(config.conversation.slice(8)))return
   }else if(event.channel==='chat:changed'){
    if(config.conversation&&config.conversation!=='group:'+event.payload.id)return
   }else if(['session:user','session:turn-end','session:interrupted','session:error'].includes(event.channel)){
    // Private events identify a live session, not its employee. Keep the search's employee scope.
    if(config.conversation&&!config.conversation.startsWith('employee:'))return
   }else return
   if(!timer)timer=setTimeout(()=>{timer=undefined;setRetry(value=>value+1)},80)
  })
  return()=>{off();clearTimeout(timer)}
 },[config.conversation,author,filter])
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined
  // Events queue one trailing pass instead of cancelling a slow search before it can publish.
  const refresh=createRefreshQueue(async()=>{
   if(!alive)return
   const prior=snapshot.current.key===queryKey?snapshot.current.value.messages:[],boundary=prior.at(-1),count=Math.max(pageSize.current,prior.length),messages:MessengerMessage[]=[];let value:MessengerResults
   if(snapshot.current.key!==queryKey||pageSize.current>prior.length&&snapshot.current.value.hasMore)setLoading(true)
   try{
    const before=(message:MessengerMessage,tail:MessengerMessage)=>(tail.createdAt??0)-(message.createdAt??0)||message.conversation.localeCompare(tail.conversation)||message.id.localeCompare(tail.id)
    do{value=await api.call<MessengerResults>('messenger.search',{conversation:config.conversation,query,filter,author,offset:messages.length,limit:Math.min(100,Math.max(40,count-messages.length))});if(!alive)return;messages.push(...value.messages)}while(value.hasMore&&(messages.length<count||!!boundary&&!!messages.length&&before(messages.at(-1)!,boundary)<0&&!messages.some(message=>message.id===boundary.id&&message.conversation===boundary.conversation)))
    const next={...value,messages};keepPosition();snapshot.current={key:queryKey,value:next};setResults(next);setResultKey(queryKey);setError('')
   }catch(cause){if(alive)setError((cause as Error).message)}finally{if(alive)setLoading(false)}
  })
  const request=()=>{if(!timer)void refresh()};requestRefresh.current=request
  setLoading(true);timer=setTimeout(()=>{timer=undefined;void refresh()},snapshot.current.key===queryKey?0:150)
  return()=>{alive=false;clearTimeout(timer);if(requestRefresh.current===request)requestRefresh.current=()=>{}}
 },[config.conversation,query,filter,author,queryKey,keepPosition])
 useEffect(()=>requestRefresh.current(),[windowSize,messenger.state.revision,retry])
 useEffect(()=>{search.current?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.querySelector('[aria-modal="true"]')){event.preventDefault();event.stopImmediatePropagation();messenger.setLibrary(null)}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[messenger.setLibrary])
 const open=async(message:MessengerMessage)=>{try{const conversation=message.news?'channel:'+message.news.channelId:message.conversation,[kind,id]=conversation.split(':');await api.call('view.open',{kind:'messages',...(kind==='group'?{chatId:id}:kind==='channel'?{channelId:id}:{employee:id})});messenger.setJump({conversation,id:message.id});messenger.setLibrary(null)}catch(cause){setError((cause as Error).message)}}
 return <aside ref={surface} className="message-library" role="dialog" aria-label={config.conversation?uiText("Conversation content"):uiText("Search and saved messages")}>
  <header><div><span>{config.conversation?uiText("IN THIS CONVERSATION"):uiText("ACROSS YOUR COMPANY")}</span><h2>{filter==='saved'?uiText("Saved messages"):filter==='pinned'?uiText("Pinned messages"):filter==='media'?uiText("Shared media"):filter==='audio'?uiText('Shared audio'):filter==='files'?uiText('Shared files'):filter==='links'?uiText("Shared links"):uiText("Find a message")}</h2></div><button aria-label={uiText("Close message library")} onClick={()=>messenger.setLibrary(null)}><Icon name="close"/></button></header>
  <label className="message-library-search"><Icon name="search"/><input ref={search} value={query} aria-label={uiText("Search full message history")} placeholder={uiText("Search all message history…")} onChange={event=>{setQuery(event.target.value);setWindowSize(40)}}/>{query&&<button aria-label={uiText("Clear history search")} onClick={()=>{setQuery('');setWindowSize(40)}}><Icon name="close"/></button>}</label>
  <div className="message-library-tabs" role="group" aria-label={uiText("Message type")}>{[['all','All','comment'],['media','Media','file-media'],['audio','Audio','unmute'],['files','Files','file'],['links','Links','link'],['saved','Saved','bookmark'],['pinned','Pinned','pinned']].map(([id,label,icon])=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setWindowSize(40)}}><Icon name={icon}/>{uiText(label)}</button>)}</div>
  <div className="message-library-summary"><span role="status">{loading?uiText("Searching…"):uiText(results.total===1?'{0} message':'{0} messages',[results.total])}</span><select aria-label={uiText("Filter message author")} value={author} onChange={event=>{setAuthor(event.target.value);setWindowSize(40)}}><option value="all">{uiText("Everyone")}</option><option value="you">{uiText("From you")}</option><option value="employee">{uiText("From teammates")}</option></select></div>
  {error&&<p className="message-list-error" role="alert">{error} <button onClick={()=>setRetry(value=>value+1)}>{uiText("Retry search")}</button></p>}
  <MessageGalleryContext.Provider value={{images:galleryImages,history:{conversation:config.conversation,query,author:author as 'all'|'you'|'employee',order:'newest'}}}><div ref={list} inert={resultKey!==queryKey} aria-busy={loading} className={`message-library-results ${filter==='media'?'media-grid':''}`}>
   {results.messages.map(message=>message.news?<ChannelNewsCard key={message.id} post={message.news} onAuthor={setSourceId} onReveal={()=>void open(message)} onChanged={next=>{keepPosition();setResults(previous=>({...previous,total:next?previous.total:previous.total-1,messages:previous.messages.flatMap(value=>value.id!==message.id?[value]:next?[{...value,news:next}]:[])}));setRetry(value=>value+1)}}/>:<article key={message.conversation+'/'+message.id} data-message-key={message.conversation+'/'+message.id} className="message-result">
    {filter==='media'&&<MessageImages {...(message.conversation.startsWith('employee:')?{employee:message.conversation.slice(9)}:{group:message.conversation.slice(6)})} paths={message.images} messageId={message.id} caption={message.text}/>}
    {filter==='media'&&message.files?.filter(file=>file.mimeType.startsWith('video/')).map(file=><MessageFile messageId={message.id} key={file.path} conversation={message.conversation} file={file}/>)}
    {filter==='audio'&&message.files?.filter(file=>file.mimeType.startsWith('audio/')).map(file=><MessageFile messageId={message.id} key={file.path} conversation={message.conversation} file={file}/>)}
    {filter==='files'&&message.files?.map(file=><MessageFile messageId={message.id} key={file.path} conversation={message.conversation} file={file}/>)}
    {filter==='links'&&messageLinks(message.text).map(({url,host})=><button key={url} className="message-shared-link" onClick={()=>void api.call('external.open',{url}).catch(cause=>setError(cause.message))}><span><Icon name="link"/></span><span><strong>{host}</strong><small>{url}</small></span><Icon name="arrow-up-right"/></button>)}
    <button className="message-result-open" onClick={()=>void open(message)}><span><strong>{message.conversationTitle}</strong><time>{message.createdAt?new Date(message.createdAt).toLocaleDateString(interfaceLocale(),{month:'short',day:'numeric'}):''}</time></span><small>{message.authorIdentity?.kind==='operator'?uiText('You'):!message.authorIdentity&&message.role==='user'?uiText('Original sender'):message.author}{message.preferences.saved?uiText(" · Saved"):''}{message.editedAt&&<span title={new Date(message.editedAt).toLocaleString(interfaceLocale())}> · {uiText("Edited")}</span>}</small><p>{plainMessagePreview(message.text)||message.files?.map(file=>file.name).join(', ')||uiText("{0} photos",[message.images.length])}</p><span className="message-result-link">{uiText("Go to message")} <Icon name="arrow-up-right"/></span></button>
   </article>)}
   {!loading&&!results.messages.length&&<div className="message-library-empty"><Icon name={filter==='saved'?'bookmark':'search'}/><h3>{query?uiText("No matching messages"):filter==='saved'?uiText("Keep the good things close"):uiText("Nothing here yet")}</h3><p>{query?uiText("Try another phrase or a different filter."):filter==='saved'?uiText("Save a message from its menu. You can find it here whenever you need it."):uiText("Shared content will appear here as your conversations grow.")}</p></div>}
   {results.hasMore&&<button className="message-library-more" disabled={loading} onClick={()=>setWindowSize(Math.max(windowSize,results.messages.length)+40)}>{loading?uiText("Loading…"):uiText("Load more messages")}</button>}
  </div></MessageGalleryContext.Provider>
  {sourceId&&<ChannelSourcesDialog sourceId={sourceId} onClose={()=>setSourceId(null)}/>}
 </aside>
}
