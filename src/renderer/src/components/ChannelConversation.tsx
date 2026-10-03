import {useCatalog} from './useCatalog'
import type {SocialElement} from '../../../shared/message-categories'
import {ConversationWorkspace} from './ConversationWorkspace'
import {MessageImages} from '../chat/MessageImage'
import {MessageFile} from '../chat/MessageAttachments'
import {Fragment,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import type {ChannelMessage,ChannelPost,ChannelView} from '../../../shared/channels'
import type {Store} from '../../../shared/types'
import {messageKey} from '../../../shared/messenger'
import {api} from '../api'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {RichMessageText} from '../chat/RichMessageText'
import {MessageActions,MessageDate} from '../chat/MessageActions'
import {MessageReceipt} from '../chat/MessageReceipt'
import {UnreadDivider} from '../chat/UnreadDivider'
import {useChannelPosts} from './useChannels'
import {useChannelDiscussion} from './useChannelDiscussion'
import {useChannelReading} from './useChannelReading'
import {useMessenger} from './useMessenger'
import {ChannelAvatar,ChannelNewsCard,channelPlatform} from './ChannelNewsCard'
import {ChannelPostFeed,ChannelViewSwitch} from './ChannelPostFeed'
import {ChannelPostDetail} from './ChannelPostDetail'
import type {ChannelFeedView} from './channel-post-model'
import {ConversationControls} from './ConversationControls'
import {ConversationNoticeBadge} from './ConversationNotice'
import {ChannelSourcesDialog} from './ChannelSourcesDialog'
import {ChannelAdminDialog} from './ChannelAdminDialog'
import {ChannelComposer,type ChannelReply} from './ChannelComposer'
import {MessageAuthorAvatar} from './MessageIdentity'
import {MessageCheckbox,MessageSelectionBar} from './MessageSelectionBar'
import {PinnedMessages} from './PinnedMessages'
import {Icon} from './Icon'
import '../styles/channel-discussion.css'

export function ChannelConversation({channel,store,onBack,sourceId}:{channel:ChannelView;store:Store;onBack:()=>void;sourceId?:string}){
 useI18n()
 const [workspaceOpen,setWorkspaceOpen]=useState(false),[detailId,setDetailId]=useState<string|null>(null)
 const {value:social}=useCatalog<SocialElement>('messenger.social',!!sourceId,event=>event.channel==='channel:changed',80,{includeDisabled:true})
 const source=sourceId?social.find(item=>item.id===sourceId):undefined,title=source?.name??channel.name,displayKind=source?.platform??channel.kind,displayAvatar=sourceId?source?.avatar:channel.avatar
 const openParent=()=>void api.call('view.open',{kind:'messages',channelId:channel.id})
 useEffect(()=>{if(source&&source.channelId!==channel.id)void api.call('view.open',{kind:'messages',sourceId:source.id})},[source?.channelId,channel.id])
 const messenger=useMessenger()!,[input,setInput]=useState(''),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),[saved,setSaved]=useState(false),[manager,setManager]=useState<{sourceId?:string}|null>(null),[administration,setAdministration]=useState(false),[admins,setAdmins]=useState(false),[confirmed,setConfirmed]=useState<ChannelView|null>(null),[revealed,setRevealed]=useState<ChannelPost|null>(null),[jumpError,setJumpError]=useState(''),[reply,setReply]=useState<ChannelReply|null>(null),[away,setAway]=useState(false)
 const search=useRef<HTMLInputElement>(null),feed=useRef<HTMLDivElement>(null),following=useRef(true),positioned=useRef(false),jumping=useRef(false),jumpSequence=useRef(0),revealController=useRef<AbortController|null>(null)
 const [readPositioned,setReadPositioned]=useState(false),[unreadBoundary,setUnreadBoundary]=useState<string|null>(null),earlierRequested=useRef(false)
 const [view,setView]=useState<ChannelFeedView>('conversation'),[postSource,setPostSource]=useState(''),viewRef=useRef<ChannelFeedView>('conversation'),viewPositions=useRef({conversation:0,posts:0}),restoreView=useRef(false)
 const current=confirmed&&confirmed.revision>channel.revision?confirmed:channel,history=useChannelPosts(channel.id,query,saved,feed,sourceId),discussion=useChannelDiscussion(channel.id,feed,!sourceId),conversation='channel:'+channel.id,filtered=!!query||saved
 const names=useMemo(()=>Object.fromEntries(store.sessions.map(card=>[card.id,card.title])),[store.sessions])
 const timeline=useMemo(()=>[
  ...history.posts.map(post=>({id:post.id,time:post.publishedAt,post,message:undefined as ChannelMessage|undefined})),
  ...(!filtered?discussion.messages.map(message=>({id:message.id,time:message.createdAt,post:undefined as ChannelPost|undefined,message})):[]),
  ...(revealed&&!history.posts.some(post=>post.id===revealed.id)?[{id:revealed.id,time:revealed.publishedAt,post:revealed,message:undefined}]:[]),
 ].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id)),[history.posts,discussion.messages,filtered,revealed])
 const documentAlbums=useMemo(()=>{const albums=new Map<string,ChannelPost[]>();for(const entry of timeline){const post=entry.post;if(post?.telegram?.groupId&&post.files?.length){const key=post.sourceId+'/'+post.telegram.groupId;albums.set(key,[...(albums.get(key)??[]),post])}}for(const posts of albums.values())posts.sort((a,b)=>a.externalId.localeCompare(b.externalId,undefined,{numeric:true}));return albums},[timeline])
 const displayedTimeline=useMemo(()=>timeline.filter(entry=>!entry.post?.telegram?.groupId||!entry.post.files?.length||documentAlbums.get(entry.post.sourceId+'/'+entry.post.telegram.groupId)?.[0].id===entry.id),[timeline,documentAlbums])
 const postItems=useMemo(()=>timeline.flatMap(entry=>entry.post?[entry.post]:[]),[timeline])
 const reading=useChannelReading(channel.id,feed,timeline.map(entry=>entry.id),view==='conversation'&&readPositioned&&!history.loading&&!discussion.loading&&!filtered&&!searching&&!manager&&!admins&&!administration&&!workspaceOpen&&!messenger.library&&!messenger.forward&&!messenger.replyTarget&&!jumping.current)
 const scopeSummary=sourceId?source:current
 const firstUnread=timeline.find(entry=>reading.entries.get(entry.id)?.state==='unread')?.id
 const dividerId=unreadBoundary??(!positioned.current?firstUnread:undefined),earlierUnread=!!scopeSummary?.firstUnread&&!timeline.some(entry=>entry.id===scopeSummary.firstUnread!.id)&&(!!history.cursor||discussion.before!==null)
 const earlierCount=Math.max(0,(scopeSummary?.unreadCount??0)-timeline.filter(entry=>reading.entries.get(entry.id)?.state==='unread').length),loadingEarlier=history.more||discussion.more||earlierRequested.current&&!reading.ready
 const latest=()=>{following.current=true;feed.current?.scrollTo({top:feed.current.scrollHeight,behavior:'instant'});setAway(false)}
 const changeView=(next:ChannelFeedView)=>{
  if(next===viewRef.current)return
  viewPositions.current[viewRef.current]=feed.current?.scrollTop??0;viewRef.current=next;following.current=false;restoreView.current=true;setView(next);setAway(false)
 }
 useLayoutEffect(()=>{const el=feed.current;if(!restoreView.current||!el)return;restoreView.current=false;el.scrollTop=viewPositions.current[view];if(view==='conversation')setAway(el.scrollHeight-el.clientHeight-el.scrollTop>80)},[view])
 useEffect(()=>{const timer=setTimeout(()=>setQuery(input.trim()),180);return()=>clearTimeout(timer)},[input])
 useEffect(()=>{if(searching)search.current?.focus()},[searching])
 useEffect(()=>{const listener=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'&&!document.querySelector('[aria-modal="true"]')){event.preventDefault();setSearching(true);search.current?.focus()}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener)},[])
 useLayoutEffect(()=>{
  if(view!=='conversation'||history.loading||discussion.loading||history.more||discussion.more||!reading.ready||filtered||jumping.current||messenger.jump?.conversation===conversation)return
  if(!positioned.current||earlierRequested.current){
   const target=firstUnread,marker=target&&feed.current?.querySelector<HTMLElement>(`[data-channel-unread="${CSS.escape(target)}"]`),row=target&&feed.current?.querySelector<HTMLElement>(`[data-chat-item="${CSS.escape(target)}"]`),previous=marker?marker.previousElementSibling:null,node=previous?.matches('.message-date')?previous:marker||row
   if(node&&feed.current){following.current=false;feed.current.scrollTop+=node.getBoundingClientRect().top-feed.current.getBoundingClientRect().top;setUnreadBoundary(target!);setAway(feed.current.scrollHeight-feed.current.clientHeight-feed.current.scrollTop>80)}else if(!positioned.current)latest()
   earlierRequested.current=false;positioned.current=true;setReadPositioned(true)
  }else if(following.current)latest()
 },[view,timeline,history.loading,discussion.loading,history.more,discussion.more,reading.ready,firstUnread,filtered,messenger.jump])
 useEffect(()=>{const el=feed.current;if(!el||view!=='conversation')return;const observer=new ResizeObserver(()=>{if(following.current&&!jumping.current)latest()});observer.observe(el);return()=>observer.disconnect()},[view])
 useEffect(()=>()=>{jumpSequence.current++;revealController.current?.abort();messenger.setJump(previous=>previous?.conversation===conversation?null:previous)},[conversation,messenger.setJump])
 const reveal=async(id:string)=>{
  setDetailId(null);changeView('conversation')
  const sequence=++jumpSequence.current;revealController.current?.abort();const controller=new AbortController();revealController.current=controller;following.current=false;jumping.current=true;setJumpError('');setInput('');setQuery('');setSaved(false)
  try{
   if(id.startsWith('cm_')){if(!await discussion.reveal(id,controller.signal))throw Error('Original message unavailable')}
   else{const post=await api.call<ChannelPost>('channel.post',{id});if(sequence!==jumpSequence.current)return;if(post.channelId!==channel.id||sourceId&&post.sourceId!==sourceId){void messenger.navigate({conversation:'channel:'+post.channelId,id});return}setRevealed(post)}
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
   if(sequence!==jumpSequence.current)return
   const node=feed.current?.querySelector<HTMLElement>(`[data-chat-item="${CSS.escape(id)}"]`)
   if(node){node.scrollIntoView({block:'center',behavior:'instant'});positioned.current=true;setReadPositioned(true);node.dataset.messageJump='true';setTimeout(()=>{if(node.isConnected)delete node.dataset.messageJump},2400)}
  }catch(cause){if(sequence===jumpSequence.current)setJumpError((cause as Error).message)}finally{if(sequence===jumpSequence.current)jumping.current=false}
 }
 useEffect(()=>{const target=messenger.jump;if(target?.conversation!==conversation)return;void reveal(target.id).finally(()=>messenger.setJump(previous=>previous===target?null:previous))},[messenger.jump,conversation])
 const changed=(id:string,post:ChannelPost|null)=>{history.changed(id,post);setRevealed(previous=>previous?.id===id?post:previous)}
 const loadEarlierUnread=async()=>{earlierRequested.current=true;following.current=false;setReadPositioned(false);await Promise.all([history.cursor?history.loadMore():undefined,discussion.before!==null?discussion.loadMore():undefined])}
 const chooseReply=(value:ChannelReply)=>{setReply(value);requestAnimationFrame(()=>feed.current?.parentElement?.querySelector<HTMLTextAreaElement>('.channel-composer textarea')?.focus())}
 const replyPreview=(id:string)=>{const message=discussion.messages.find(value=>value.id===id);if(message)return {id,author:message.author.kind==='operator'?uiText('You'):message.authorName,text:message.text};const post=history.posts.find(value=>value.id===id)??(revealed?.id===id?revealed:null);return post?{id,author:post.authorName??post.sourceName,text:post.title||post.body}:null}
 return <section className={'message-conversation channel-conversation'+(current.engine?.kind==='external'&&current.engine.fileStorage?' telegram-document-channel':'')} data-feed-view={view} aria-label={uiText('Channel {0}',[title])}>
  <header className="message-thread-header"><button className="message-back" aria-label={uiText('Back to conversations')} onClick={onBack}><Icon name="arrow-left"/></button><button className="message-person channel-person" aria-label={uiText('Channel administrators')} onClick={()=>setAdmins(true)}><ChannelAvatar kind={displayKind} avatar={displayAvatar} name={title} social={!!sourceId}/><span><strong>{title}</strong><small><span>{channelPlatform(displayKind)}</span><b>·</b><span>{current.subscriberCount!==undefined?uiText('{0} subscribers',[current.subscriberCount.toLocaleString(interfaceLocale())]):sourceId?source?.locator:uiText(current.adminIds.length===1?'{0} administrator':'{0} administrators',[current.adminIds.length])}</span></small></span></button><ChannelViewSwitch value={view} onChange={changeView}/><div className="message-thread-actions"><button aria-label={uiText("Shared workspace")} title={uiText("Shared workspace")} onClick={()=>setWorkspaceOpen(true)}><Icon name="files"/></button><button aria-label={uiText('Search channel')} aria-pressed={searching} title={uiText('Search channel')} onClick={()=>setSearching(!searching)}><Icon name="search"/></button><button aria-label={uiText('Saved articles')} aria-pressed={saved} title={uiText('Saved articles')} onClick={()=>{setSaved(!saved);setRevealed(null);following.current=true}}><Icon name="bookmark"/></button><button aria-label={uiText('Channel administrators')} title={uiText('Channel administrators')} onClick={()=>setAdmins(true)}><Icon name="organization"/></button><button aria-label={uiText('Conversation administration')} title={uiText('Roles, moderation & notifications')} onClick={()=>setAdministration(true)}><Icon name="shield"/></button><span className="message-action-divider"/><button aria-label={uiText('Manage channels and authors')} title={uiText('Manage channels and authors')} onClick={()=>setManager({})}><Icon name="settings-gear"/></button></div></header>
  {view==='conversation'&&<><MessageSelectionBar conversation={conversation} messages={discussion.messages}/><PinnedMessages conversation={conversation}/></>}
  {view==='conversation'&&!filtered&&earlierUnread&&<div className="channel-earlier-unread"><span><Icon name="mail"/>{uiText(scopeSummary?.unreadCount===1?'{0} unread update':'{0} unread updates',[scopeSummary?.unreadCount??0])}</span><button disabled={loadingEarlier||!reading.ready} onClick={()=>void loadEarlierUnread()}>{uiText(loadingEarlier?'Loading…':'Load earlier unread ({0})',[earlierCount||(scopeSummary?.unreadCount??0)])}<Icon name="arrow-up"/></button></div>}
  {searching&&<label className="channel-feed-search"><Icon name="search"/><input ref={search} value={input} aria-label={uiText('Search channel articles')} placeholder={uiText('Search articles…')} onChange={event=>{setInput(event.target.value);setRevealed(null);following.current=true}} onKeyDown={event=>{if(event.key==='Escape'){setSearching(false);setInput('')}}}/><button aria-label={uiText('Close search')} onClick={()=>{setSearching(false);setInput('')}}><Icon name="close"/></button></label>}
  <div className={'channel-feed '+(view==='posts'?'channel-post-feed':'channel-timeline group-transcript')} ref={feed} aria-busy={history.loading||discussion.loading} onWheel={event=>{if(view==='conversation'&&event.deltaY<0)following.current=false}} onScroll={event=>{if(view!=='conversation')return;const el=event.currentTarget,gap=el.scrollHeight-el.clientHeight-el.scrollTop;if(positioned.current&&!jumping.current)following.current=gap<5;setAway(gap>80)}}>
   <div className="channel-feed-caption"><span><Icon name={saved?'bookmark':'radio-tower'}/>{uiText(saved?'SAVED ARTICLES':'CHANNEL UPDATES')}</span><small>{uiText(current.engine?.kind==='external'&&current.engine.fileStorage?'Cloud posts and files are kept for 7 days':'Unsaved articles are kept for 48 hours')}</small></div>
   {(history.error||discussion.error||reading.error||jumpError)&&<p className="channel-inline-error" role="alert">{uiText(history.error||discussion.error||reading.error||jumpError)} <button onClick={()=>{void history.refresh();void discussion.refresh();reading.refresh()}}>{uiText('Retry')}</button></p>}
   {view==='conversation'&&(history.cursor||!filtered&&discussion.before!==null)&&<div className="channel-earlier">{history.cursor&&<button className="channel-load-more" disabled={history.loading||history.more} onClick={()=>{following.current=false;void history.loadMore()}}>{uiText(history.more?'Loading…':'Load earlier articles')}</button>}{!filtered&&discussion.before!==null&&<button className="channel-load-more" disabled={discussion.more} onClick={()=>{following.current=false;void discussion.loadMore()}}>{uiText(discussion.more?'Loading…':'Load earlier messages')}</button>}</div>}
   {!(view==='posts'?postItems.length:timeline.length)&&<div className="channel-feed-empty"><ChannelAvatar kind={displayKind} avatar={displayAvatar} name={title} social={!!sourceId}/><h2>{uiText(history.loading?'Loading articles…':query?'No matching articles':saved?'Save something worth keeping':'Your next discovery starts here')}</h2><p>{uiText(query?'Try another phrase.':saved?(current.engine?.kind==='external'&&current.engine.fileStorage?'Save an article to keep its information after the cloud cache expires.':'Save an article to keep it beyond 48 hours.'):'New articles from your followed authors will appear here.')}</p>{!history.loading&&!saved&&!query&&<button onClick={()=>setManager({})}><Icon name="person"/>{uiText('Manage authors')}</button>}</div>}
   {view==='posts'&&postItems.length>0&&<ChannelPostFeed posts={postItems} sourceAvatar={channel.avatar} selectedSource={postSource} onSource={key=>{setPostSource(key);viewPositions.current.posts=0;feed.current?.scrollTo({top:0,behavior:'instant'})}} onOpen={post=>setDetailId(post.id)}/>}
   {view==='posts'&&history.cursor&&<button className="channel-load-more" disabled={history.loading||history.more} onClick={()=>void history.loadMore()}>{uiText(history.more?'Loading…':'Load earlier articles')}</button>}
   {view==='conversation'&&displayedTimeline.map((entry,index)=><Fragment key={entry.id}>{(!index||new Date(displayedTimeline[index-1].time).toDateString()!==new Date(entry.time).toDateString())&&<MessageDate value={entry.time}/>}{entry.id===(earlierRequested.current?firstUnread:dividerId)&&<div data-channel-unread={entry.id}><UnreadDivider/></div>}{entry.post?<div className="channel-news-item" data-chat-item={entry.id}><ChannelNewsCard post={entry.post} album={entry.post.telegram?.groupId?documentAlbums.get(entry.post.sourceId+'/'+entry.post.telegram.groupId):undefined} sourceAvatar={channel.avatar} onAuthor={sourceId=>setManager({sourceId})} onChanged={next=>changed(entry.id,next)} onReply={sourceId?undefined:()=>chooseReply({id:entry.id,author:entry.post!.authorName??entry.post!.sourceName,text:entry.post!.title||entry.post!.body})}/><span className="reply-seen-marker" data-channel-read={entry.id} aria-hidden="true"/></div>:entry.message&&<ChannelDiscussionMessage message={entry.message} store={store} names={names} conversation={conversation} reply={entry.message.replyTo?replyPreview(entry.message.replyTo):null} onReply={()=>chooseReply({id:entry.id,author:entry.message!.author.kind==='operator'?uiText('You'):entry.message!.authorName,text:entry.message!.text})} onReveal={id=>void reveal(id)}/>}</Fragment>)}
  </div>
  <div className="channel-compose-region" hidden={view==='posts'}>
  {away&&<button className="channel-jump-latest" aria-label={uiText('Latest messages')} title={uiText('Latest messages')} onClick={latest}><Icon name="arrow-down"/></button>}
  {filtered&&<div className="channel-filter-note"><button onClick={()=>{setInput('');setQuery('');setSaved(false);following.current=true}}><Icon name="arrow-left"/>{uiText('Back to channel conversation')}</button></div>}
  {!sourceId&&<ChannelComposer hidden={filtered||view==='posts'} channel={current} store={store} reply={reply&&replyPreview(reply.id)||reply} onReply={setReply} onReveal={id=>void reveal(id)} onSent={message=>{following.current=true;discussion.changed([message])}} onAdministrators={()=>setAdmins(true)}/>}{sourceId&&<div className="channel-source-context"><span>{uiText('Reading one social element. Shared discussions stay in the parent channel.')}</span><button onClick={openParent}><Icon name="comment-discussion"/>{uiText('Open shared channel')}</button></div>}
  </div>
  {view==='posts'&&detailId&&<ChannelPostDetail key={detailId} id={detailId} channelId={channel.id} sourceId={sourceId} sourceAvatar={channel.avatar} blocked={!!manager||admins||administration||workspaceOpen||!!messenger.library||!!messenger.forward||!!messenger.replyTarget} onClose={()=>setDetailId(null)} onChanged={post=>changed(detailId,post)} onAuthor={sourceId=>setManager({sourceId})}/>}
  {workspaceOpen&&<ConversationWorkspace conversation={conversation} onClose={()=>setWorkspaceOpen(false)}/>}
  {manager&&<ChannelSourcesDialog channelId={channel.id} sourceId={manager.sourceId} onClose={()=>{setManager(null);setRevealed(null)}}/>}
  {administration&&<ConversationControls conversation={conversation} store={store} onClose={()=>setAdministration(false)}/>}
  {admins&&<ChannelAdminDialog channel={current} store={store} onClose={()=>setAdmins(false)} onSaved={setConfirmed}/>}
 </section>
}

function ChannelDiscussionMessage({message,store,names,conversation,reply,onReply,onReveal}:{message:ChannelMessage;store:Store;names:Record<string,string>;conversation:string;reply:ChannelReply|null;onReply:()=>void;onReveal:(id:string)=>void}){
 const messenger=useMessenger()!,selection=messenger.selection?.conversation===conversation,[navigationError,setNavigationError]=useState('')
 if(messenger.state.messages[messageKey(conversation,message.id)]?.hidden)return <div className="message-hidden" data-chat-item={message.id}>{uiText('Message hidden for you')}<button onClick={()=>void messenger.message(conversation,message.id,{hidden:false})}>{uiText('Show message')}</button></div>
 return <article className={'group-message channel-discussion-message '+(message.author.kind==='operator'?'from-user':'from-employee')} data-chat-item={message.id} data-message-key={message.id} data-selecting={selection||undefined} data-selected={selection&&messenger.selection!.ids.includes(message.id)||undefined} onClickCapture={event=>{if(selection&&!(event.target as Element).closest('.message-select-toggle')){event.preventDefault();event.stopPropagation();messenger.toggleSelection(conversation,message.id)}}}>
  <MessageCheckbox conversation={conversation} id={message.id}/><div className="group-message-heading"><MessageAuthorAvatar author={message.author} authorName={message.authorName} store={store}/><strong>{message.author.kind==='operator'?uiText('You'):message.authorName}</strong>{message.author.kind==='agent'&&<span className="channel-admin-badge">Admin</span>}</div>
  {message.replyTo&&<button className="group-reply-link" onClick={()=>onReveal(message.replyTo!)}><strong>{reply?.author??uiText('Original message')}</strong><small>{reply?.text??uiText('Go to original message')}</small></button>}
  {!!message.mentions.length&&<div className="group-message-mentions">{message.mentions.map(id=><span key={id}>@{names[id]??uiText('Former member')}</span>)}</div>}
  <ConversationNoticeBadge notice={message.notice}/><RichMessageText text={message.text} images={false}/><MessageImages channel={message.channelId} paths={message.attachments?.filter(file=>file.kind==='image').map(file=>file.path)??[]} messageId={message.id} caption={message.text}/>{message.attachments?.filter(file=>file.kind==='file').map(file=><MessageFile key={file.path} conversation={conversation} file={file} messageId={message.id}/>)}
  <div className="message-time message-time-with-receipt"><time dateTime={new Date(message.createdAt).toISOString()} title={new Date(message.createdAt).toLocaleString(interfaceLocale())}>{new Date(message.createdAt).toLocaleTimeString(interfaceLocale(),{hour:'2-digit',minute:'2-digit'})}</time><MessageReceipt deliveries={message.deliveries} memberName={id=>names[id]??uiText('Former member')} canOpenRecipient={id=>store.sessions.some(card=>card.id===id&&!card.deleting)} onOpenRecipient={id=>{setNavigationError('');void api.call('view.open',{kind:'conversation',employee:id}).catch(cause=>setNavigationError((cause as Error).message))}}/></div>
  {navigationError&&<p className="channel-inline-error" role="alert">{uiText(navigationError)}</p>}
  <MessageActions conversation={conversation} id={message.id} text={message.text} images={message.attachments?.length??0} onReply={onReply}/>
  <span className="reply-seen-marker" data-channel-read={message.id} aria-hidden="true"/>
 </article>
}
