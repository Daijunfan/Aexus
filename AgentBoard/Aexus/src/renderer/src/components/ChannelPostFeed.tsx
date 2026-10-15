import {useLayoutEffect,useMemo,useRef} from 'react'
import type {ChannelPost,ChannelView} from '../../../shared/channels'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {ChannelAvatar,ChannelImage,channelPlatform} from './ChannelNewsCard'
import {ChannelPostSource,newestPosts,postExcerpt,postPhotos,type ChannelFeedView} from './channel-post-model'
import {Icon} from './Icon'
import '../styles/channel-posts.css'

export function ChannelViewSwitch({value,onChange}:{value:ChannelFeedView;onChange:(value:ChannelFeedView)=>void}){
 return <div className="channel-view-switch" role="group" aria-label={uiText('Channel display')}>
  <button type="button" aria-label={uiText('Channel view')} title={uiText('Channel view')} aria-pressed={value==='conversation'} onClick={()=>onChange('conversation')}><Icon name="comment-discussion"/><span>{uiText('Channel')}</span></button>
  <button type="button" aria-label={uiText('Post view')} title={uiText('Post view')} aria-pressed={value==='posts'} onClick={()=>onChange('posts')}><Icon name="layout"/><span>{uiText('Posts')}</span></button>
 </div>
}

export function ChannelPostFeed({posts,sourceAvatar,selectedSource,onSource,onOpen}:{posts:readonly ChannelPost[];sourceAvatar?:ChannelView['avatar'];selectedSource:string;onSource:(key:string)=>void;onOpen:(post:ChannelPost)=>void}){
 useI18n()
 const ordered=useMemo(()=>newestPosts(posts),[posts]),sources=useMemo(()=>ChannelPostSource.collect(ordered),[ordered]),selected=sources.find(source=>source.key===selectedSource),shown=selected?.posts??ordered,grid=useRef<HTMLDivElement>(null)
 // Row-first masonry keeps chronological DOM/keyboard order, unlike CSS columns.
 useLayoutEffect(()=>{
  const root=grid.current;if(!root)return
  const fit=(card:HTMLElement)=>{const row=card.parentElement;if(row)row.style.gridRowEnd='span '+Math.ceil(card.getBoundingClientRect().height+16)}
  const observer=new ResizeObserver(entries=>{for(const entry of entries)fit(entry.target as HTMLElement)})
  for(const card of root.querySelectorAll<HTMLElement>('.channel-post-open')){fit(card);observer.observe(card)}
  return()=>observer.disconnect()
 },[shown])
 return <div className="channel-post-browser">
  <div className="channel-post-toolbar">
   <div className="channel-post-sources" role="group" aria-label={uiText('Post sources')}>
    <button type="button" aria-pressed={!selected} onClick={()=>onSource('')}><Icon name="layers"/>{uiText('All sources')}<small>{ordered.length}</small></button>
    {sources.map(source=><button type="button" key={source.key} data-source-key={source.key} aria-pressed={selected?.key===source.key} title={channelPlatform(source.platform)+' · '+source.name} onClick={()=>onSource(source.key)}><ChannelAvatar kind={source.platform} avatar={source.posts[0].sourceAvatar??(sourceAvatar?.sourceId===source.id?sourceAvatar:undefined)} name={source.name}/><span>{source.name}</span><small>{source.posts.length}</small></button>)}
   </div>
   <span className="channel-post-count">{uiText('{0} loaded · newest first',[shown.length])}</span>
  </div>
  <div ref={grid} className="channel-post-grid" role="list" aria-label={uiText('Posts')}>
   {shown.map(post=><ChannelPostCard key={post.id} post={post} sourceAvatar={sourceAvatar} onOpen={()=>onOpen(post)}/>)}
  </div>
 </div>
}

function ChannelPostCard({post,sourceAvatar,onOpen}:{post:ChannelPost;sourceAvatar?:ChannelView['avatar'];onOpen:()=>void}){
 const photos=postPhotos(post),cover=photos[0],text=postExcerpt(post.body),author=post.authorName||post.sourceName,identity=post.sourceAvatar??sourceAvatar,heading=post.title||(cover?text:''),date=new Date(post.publishedAt)
 return <article className="channel-post-card" role="listitem" data-news-id={post.id} data-platform={post.plugin} data-source-key={post.plugin+':'+post.sourceId}>
  <button type="button" className="channel-post-open" onClick={onOpen} aria-label={uiText('Open post from {0}: {1}',[author,post.title||text.slice(0,90)||uiText('Photos')])}>
   <div className={'channel-post-cover'+(cover?'':' is-text')}>
    {cover?<ChannelImage channelId={post.channelId} postId={post.id} mediaId={cover.id} alt={cover.name}/>:<div className="channel-post-text"><Icon name="quote"/><p>{text||post.title}</p><span>{channelPlatform(post.plugin)}</span></div>}
    {cover&&post.plugin==='youtube'&&<span className="channel-post-play" aria-hidden="true"><Icon name="play"/></span>}
    {photos.length>1&&<span className="channel-post-album" aria-label={uiText('{0} photos',[photos.length])}><Icon name="files"/>{photos.length}</span>}
    {post.saved&&<span className="channel-post-saved" title={uiText('Saved')} aria-label={uiText('Saved')}><Icon name="bookmark"/></span>}
   </div>
   <div className="channel-post-details">
    {heading&&(cover||text)&&<h3>{heading}</h3>}
    <div className="channel-post-author"><span className="channel-author-avatar">{post.plugin!=='telegram'&&post.avatarMediaId?<ChannelImage channelId={post.channelId} postId={post.id} mediaId={post.avatarMediaId} alt=""/>:<ChannelAvatar kind={post.plugin} avatar={identity?.sourceId===post.sourceId?identity:undefined} name={author}/>}</span><span>{author}</span></div>
    <div className="channel-post-meta"><span>{channelPlatform(post.plugin)}</span><time dateTime={date.toISOString()} title={date.toLocaleString(interfaceLocale())}>{date.toLocaleDateString(interfaceLocale(),{month:'short',day:'numeric'})}</time></div>
   </div>
  </button>
 </article>
}
