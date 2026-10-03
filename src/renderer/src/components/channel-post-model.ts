import type {ChannelPlugin,ChannelPost} from '../../../shared/channels'

export type ChannelFeedView='conversation'|'posts'

/** One presentation category per Telegram channel / X author / YouTube author.
 * These are projections of retained posts, never new subscriptions or stored entities.
 */
export class ChannelPostSource {
 readonly key:string
 readonly id:string
 readonly platform:ChannelPlugin
 readonly name:string
 readonly posts:ChannelPost[]=[]
 constructor(post:ChannelPost){
  this.id=post.sourceId;this.platform=post.plugin;this.key=post.plugin+':'+post.sourceId
  this.name=post.sourceName||post.authorName||post.sourceId
 }
 static collect(posts:readonly ChannelPost[]):ChannelPostSource[]{
  const sources=new Map<string,ChannelPostSource>()
  for(const post of posts){
   const key=post.plugin+':'+post.sourceId
   let source=sources.get(key)
   if(!source){source=new ChannelPostSource(post);sources.set(key,source)}
   source.posts.push(post)
  }
  return [...sources.values()]
 }
}

export const postPhotos=(post:ChannelPost)=>post.media.filter(media=>media.id!==post.avatarMediaId&&media.mimeType.startsWith('image/'))
/** Compact text only; full Markdown remains untouched in the conversation. */
export const postExcerpt=(text:string)=>text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/(^|\n)\s{0,3}(?:#{1,6}|>)\s*/g,' ').replace(/\*\*|__|~~|`/g,'').replace(/\s+/g,' ').trim()
export const newestPosts=(posts:readonly ChannelPost[])=>[...posts].sort((a,b)=>b.publishedAt-a.publishedAt||b.id.localeCompare(a.id))
