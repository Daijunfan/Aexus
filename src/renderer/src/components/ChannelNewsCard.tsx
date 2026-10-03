import {ChannelDocument} from './ChannelDocument'
import {useEffect,useRef,useState} from 'react'
import {RichMessageText} from '../chat/RichMessageText'
import type {ChannelPost,ChannelSaveResult,ChannelView} from '../../../shared/channels'
import type {FileLocation} from '../../../shared/transfers'
import type {GalleryImage} from '../../../shared/messenger'
import {api} from '../api'
import {downloadBrowserFile} from '../web/files'
import {MessageImageViewer} from '../chat/MessageImageViewer'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {Icon} from './Icon'
import {MessageMenu} from './MessageMenu'
import {MessageActionRail,useMessageCopy} from '../chat/MessageActionRail'
import {useMessenger} from './useMessenger'
import xLogo from '../assets/channel-icons/x.svg'
import youtubeLogo from '../assets/channel-icons/youtube.png'

export const channelPlatform=(kind:ChannelView['kind'])=>kind==='youtube'?'YouTube':kind==='telegram'?'Telegram':kind==='x'?'X':kind==='employee'?uiText('Employee'):kind==='process'?uiText('External process'):uiText('Channel')
const sourceImages=new Map<string,{sha256:string;image:Promise<string>}>()
function readSourceImage(avatar:NonNullable<ChannelView['avatar']>){
 const identity=avatar.channelId?'channel:'+avatar.channelId:avatar.sourceId,cached=sourceImages.get(identity);if(cached?.sha256===avatar.sha256)return cached.image
 const image=api.call<{data:string;mimeType:string}>(avatar.channelId?'channel.avatar-image':'channel.source-image',avatar.channelId?{id:avatar.channelId}:{sourceId:avatar.sourceId}).then(value=>`data:${value.mimeType};base64,${value.data}`)
 sourceImages.set(identity,{sha256:avatar.sha256,image});void image.catch(()=>{if(sourceImages.get(identity)?.image===image)sourceImages.delete(identity)})
 return image
}
export function ChannelAvatar({kind,avatar,name='',social=false}:{kind:ChannelView['kind'];avatar?:ChannelView['avatar'];name?:string;social?:boolean}){
 const custom=!!avatar?.channelId,identity=social||custom||kind==='telegram',key=String(social)+':'+kind+':'+(avatar?(avatar.channelId??avatar.sourceId)+':'+avatar.sha256:''),[image,setImage]=useState({key:'',src:'',failed:false}),src=image.key===key?image.src:'',failed=image.key===key&&image.failed
 useEffect(()=>{let active=true;setImage({key,src:'',failed:false});if(identity&&avatar)void readSourceImage(avatar).then(src=>{if(active)setImage({key,src,failed:false})}).catch(()=>{if(active)setImage({key,src:'',failed:true})});return()=>{active=false}},[key])
 const initials=name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]??'').join('')||'T'
 return <span className="channel-avatar" data-platform={kind} data-avatar-state={identity?(src?'ready':avatar?(failed?'error':'loading'):'placeholder'):undefined} aria-hidden="true">{src?<img className="channel-identity-image" src={src} alt="" decoding="async" onError={()=>setImage({key,src:'',failed:true})}/>:identity&&avatar?<Icon name={failed?'error':'loading'}/>:!social&&(kind==='x'||kind==='youtube')?<img className="channel-brand-icon" src={kind==='x'?xLogo:youtubeLogo} alt=""/>:social||kind==='telegram'||kind==='employee'?<span className="channel-avatar-initials">{initials}</span>:<Icon name={kind==='process'?'server':'radio-tower'}/>}</span>
}
export async function readChannelImage(channelId:string,postId:string,mediaId:string){const result=await api.call<{data:string;mimeType:string}>('channel.image',{channelId,postId,mediaId});return `data:${result.mimeType};base64,${result.data}`}
/** Only published local media is read, and only as a card reaches the viewport. */
export function ChannelImage({channelId,postId,mediaId,alt,onReady}:{channelId:string;postId:string;mediaId:string;alt:string;onReady?:(src:string)=>void}){
 const box=useRef<HTMLSpanElement>(null),[src,setSrc]=useState(''),[failed,setFailed]=useState(false),ready=useRef(onReady);ready.current=onReady
 useEffect(()=>{let alive=true,started=false;setSrc('');setFailed(false);const load=()=>{if(started)return;started=true;void readChannelImage(channelId,postId,mediaId).then(value=>{if(alive){setSrc(value);ready.current?.(value)}}).catch(()=>{if(alive)setFailed(true)})};const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load()}},{rootMargin:'160px'});if(box.current)observer.observe(box.current);return()=>{alive=false;observer.disconnect()}},[channelId,postId,mediaId])
 return <span ref={box} className={'channel-local-image'+(failed?' unavailable':'')}>{src?<img src={src} alt={alt} decoding="async" onError={()=>{setSrc('');setFailed(true)}}/>:<Icon name="file-media"/>}</span>
}

export function ChannelNewsCard({post,onAuthor,onChanged,onReveal,onReply,sourceAvatar,album,expandedInitially=false}:{post:ChannelPost;expandedInitially?:boolean;album?:ChannelPost[];onAuthor:(sourceId:string)=>void;onChanged:(post:ChannelPost|null)=>void;onReveal?:()=>void;onReply?:()=>void;sourceAvatar?:ChannelView['avatar']}){
 useI18n()
 const entries=album??[post],documents=entries.flatMap(entry=>(entry.files??[]).map(file=>({post:entry,file}))),telegram=entries.slice().reverse().find(entry=>entry.telegram?.reactions?.length)?.telegram??entries.at(-1)?.telegram
 const messenger=useMessenger(),originalText=[post.title,post.body,post.url].filter(Boolean).join('\n\n'),clipboard=useMessageCopy(originalText)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(expandedInitially),[menu,setMenu]=useState<{x:number;y:number}|null>(null),[gallery,setGallery]=useState<{index:number;mediaIds:string}|null>(null),images=useRef(new Map<string,string>()),buttons=useRef(new Map<string,HTMLButtonElement>()),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const photos=post.media.filter(media=>media.id!==post.avatarMediaId&&!post.files?.some(file=>file.thumbnailMediaId===media.id)&&media.mimeType.startsWith('image/')),items:GalleryImage[]=photos.map(media=>({path:media.id+'/'+media.name,messageId:post.id,caption:post.title||post.body})),author=post.authorName||post.sourceName
 const identity=post.sourceAvatar??sourceAvatar
 const mediaIds=JSON.stringify(photos.map(media=>media.id)),galleryPhoto=gallery?.mediaIds===mediaIds?photos[gallery.index]:undefined
 // The viewer snapshots its album. Close it when refreshed news changes that album.
 useEffect(()=>{setGallery(current=>current&&current.mediaIds!==mediaIds?null:current)},[mediaIds])
 const run=async(work:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setMenu(null);try{await work()}catch(cause){if(alive.current)setError((cause as Error).message)}finally{if(alive.current)setBusy(false)}}
 const save=()=>run(async()=>{const next=await api.call<ChannelSaveResult>('channel.save',{id:post.id,saved:!post.saved});onChanged('expired' in next?null:next)})
 const download=()=>run(async()=>{const result=await api.call<{name:string;markdown:string;download:FileLocation}>('channel.export',{id:post.id});if(api.mode==='web')downloadBrowserFile(result.download);else await api.call('transfer.download-save',{from:result.download})})
 const original=()=>run(()=>api.call('external.open',{url:post.url}))
 const copy=async()=>{if(await clipboard.copy())setMenu(null)}
 const forward=()=>{messenger?.setForward({messages:[{conversation:'channel:'+post.channelId,id:post.id}],text:originalText,images:photos.length});setMenu(null)}
 return <article className={'channel-news-card'+(documents.length?' telegram-document-message':'')} data-telegram-album={post.telegram?.groupId} data-news-id={post.id} aria-busy={busy}>
  <MessageActionRail><div className={'message-actions channel-news-actions'+(menu?' menu-open':'')} aria-label={uiText('Article actions')}>
   <button className="message-copy-action" aria-label={uiText('Copy message')} title={uiText('Copy message')} onClick={()=>void copy()}><Icon name={clipboard.status==='Copied'?'check':clipboard.status?'error':'copy'}/>{clipboard.status&&<span className="message-copy-feedback" role="status">{uiText(clipboard.status)}</span>}</button>
   <button className="message-forward-action" disabled={!messenger||busy} aria-label={uiText('Forward message')} title={uiText('Forward message')} onClick={forward}><Icon name="arrow-right"/></button>
   {onReply&&<button className="message-reply-action" disabled={busy} aria-label={uiText('Reply to message')} title={uiText('Reply to message')} onClick={onReply}><Icon name="reply"/></button>}
   <button className="message-more-action channel-news-menu" disabled={busy} aria-label={uiText('Article actions')} title={uiText('Article actions')} aria-expanded={!!menu} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setMenu(menu?null:{x:box.right-238,y:box.bottom+6})}}><Icon name="ellipsis"/></button>
  </div></MessageActionRail>
  <header><button className="channel-author" aria-label={uiText('Manage author {0}',[author])} onClick={()=>onAuthor(post.sourceId)}><span className="channel-author-avatar">{post.plugin!=='telegram'&&post.avatarMediaId?<ChannelImage channelId={post.channelId} postId={post.id} mediaId={post.avatarMediaId} alt=""/>:<ChannelAvatar kind={post.plugin} avatar={identity?.sourceId===post.sourceId?identity:undefined} name={author}/>}</span><span><strong>{author}</strong><small>{channelPlatform(post.plugin)}<b>·</b><time dateTime={new Date(post.publishedAt).toISOString()} title={new Date(post.publishedAt).toLocaleString(interfaceLocale())}>{new Date(post.publishedAt).toLocaleString(interfaceLocale(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></small></span></button></header>
  {post.title&&!(post.files?.length===1&&post.files[0].name===post.title)&&<h2>{post.title}</h2>}
  {!!documents.length&&<div className="channel-news-documents">{documents.map(({post:owner,file})=><ChannelDocument key={owner.id+'/'+file.id} postId={owner.id} channelId={owner.channelId} file={file} preview={file.thumbnailMediaId?<ChannelImage channelId={owner.channelId} postId={owner.id} mediaId={file.thumbnailMediaId} alt=""/>:undefined} onSaved={()=>owner.id===post.id&&void api.call<ChannelPost>('channel.post',{id:post.id}).then(onChanged)}/>)}</div>}
  {post.body&&<><RichMessageText className={'channel-news-body'+(!expanded&&post.body.length>700?' collapsed':'')} text={post.body} images={false} onOpenLink={url=>void run(()=>api.call('external.open',{url}))}/>{post.body.length>700&&<button className="channel-read-more" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{uiText(expanded?'Show less':'Read more')}<Icon name={expanded?'chevron-up':'chevron-down'}/></button>}</>}
  {!!photos.length&&<div className="channel-news-images" data-count={Math.min(photos.length,4)}>{photos.slice(0,4).map((media,index)=><button key={media.id} ref={element=>{if(element)buttons.current.set(media.id,element);else buttons.current.delete(media.id)}} aria-label={uiText('Preview {0}',[media.name])} onClick={()=>setGallery({index,mediaIds})}><ChannelImage channelId={post.channelId} postId={post.id} mediaId={media.id} alt={media.name} onReady={src=>images.current.set(media.id,src)}/>{index===3&&photos.length>4&&<span className="channel-image-more">+{photos.length-4}</span>}</button>)}</div>}
  {!!documents.length&&<div className="telegram-document-bottom"><div className="telegram-original-reactions">{telegram?.reactions?.map(reaction=><span key={reaction.emoji}><span>{reaction.emoji}</span>{reaction.count}</span>)}</div><span className="telegram-original-stats">{telegram?.views!==undefined&&<><Icon name="eye"/>{new Intl.NumberFormat(interfaceLocale(),{notation:'compact',maximumFractionDigits:1}).format(telegram.views)}</>}<time dateTime={new Date(post.publishedAt).toISOString()}>{new Date(post.publishedAt).toLocaleTimeString(interfaceLocale(),{hour:'2-digit',minute:'2-digit',hour12:false})}</time></span></div>}
  <footer><button className={'channel-save'+(post.saved?' saved':'')} disabled={busy} aria-pressed={post.saved} onClick={()=>void save()}><Icon name="bookmark"/>{uiText(post.saved?'Saved':'Save article')}</button><span/>{onReveal&&<button disabled={busy} aria-label={uiText('Go to channel')} title={uiText('Go to channel')} onClick={onReveal}><Icon name="arrow-up-right"/></button>}{post.url&&<button disabled={busy} onClick={()=>void original()}><Icon name="link"/>{uiText('Original')}</button>}<button disabled={busy} aria-label={uiText('Download article and images')} title={uiText('Download article and images')} onClick={()=>void download()}><Icon name="desktop-download"/></button></footer>
  {error&&<p className="channel-inline-error" role="alert">{uiText(error)}</p>}
  {menu&&<MessageMenu anchor={menu} label={uiText('Article actions')} onClose={()=>setMenu(null)}><button role="menuitem" onClick={()=>void copy()}><Icon name="copy"/>{uiText('Copy message')}</button><button role="menuitem" disabled={!messenger} onClick={forward}><Icon name="arrow-right"/>{uiText('Forward message')}</button>{onReply&&<button role="menuitem" onClick={()=>{setMenu(null);onReply()}}><Icon name="reply"/>{uiText('Reply')}</button>}<button role="menuitem" onClick={()=>void save()}><Icon name="bookmark"/>{uiText(post.saved?'Remove from saved':'Save article')}</button><button role="menuitem" onClick={()=>void download()}><Icon name="desktop-download"/>{uiText('Download article and images')}</button><button role="menuitem" onClick={()=>{setMenu(null);onAuthor(post.sourceId)}}><Icon name="person"/>{uiText('Manage author')}</button><hr/><button role="menuitem" onClick={()=>void run(async()=>{await api.call('channel.delete',{id:post.id});onChanged(null)})}><Icon name="trash"/>{uiText('Delete article')}</button></MessageMenu>}
  {gallery&&galleryPhoto&&<MessageImageViewer items={items} initialIndex={gallery.index} initialSrc={images.current.get(galleryPhoto.id)??''} readImage={item=>readChannelImage(post.channelId,post.id,item.path.split('/')[0])} origin={item=>buttons.current.get(item.path.split('/')[0])??null} onClose={()=>setGallery(null)}/>}
 </article>
}
