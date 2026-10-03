import {all,one} from './channel-store'
import {requireAppAdministrator} from './authorization'
import {CATEGORY_INCLUDES,type SocialElement} from '../shared/message-categories'
/** One grouped query for all sources; no bodies, history copies or read acknowledgements. */
export function socialElements(args:{platform?:string;includeDisabled?:boolean}={}):SocialElement[]{
 requireAppAdministrator()
 if(Object.keys(args).some(key=>!['platform','includeDisabled'].includes(key))||args.platform!==undefined&&!['telegram','x','youtube'].includes(args.platform)||args.includeDisabled!==undefined&&typeof args.includeDisabled!=='boolean')throw Error('Choose Telegram, X or YouTube')
 const now=Date.now(),rows=all(`WITH live AS (
  SELECT p.id,p.source_id,p.title,p.published_at,r.entry_id IS NULL AS unread,
  ROW_NUMBER() OVER(PARTITION BY p.source_id ORDER BY p.published_at DESC,p.id DESC) AS rank
  FROM posts p LEFT JOIN channel_user_reads r ON r.entry_id=p.id
  WHERE p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?)
 ), counts AS (SELECT source_id,COUNT(*) AS total,SUM(unread) AS unread FROM live GROUP BY source_id),
 firsts AS (SELECT id,source_id,ROW_NUMBER() OVER(PARTITION BY source_id ORDER BY published_at,id) AS rank FROM live WHERE unread)
 SELECT s.*,c.total,c.unread,p.id AS last_id,p.title AS last_title,p.published_at AS last_at,f.id AS first_id,a.sha256
 FROM sources s JOIN channels ch ON ch.id=s.channel_id
 LEFT JOIN counts c ON c.source_id=s.id LEFT JOIN live p ON p.source_id=s.id AND p.rank=1
 LEFT JOIN firsts f ON f.source_id=s.id AND f.rank=1 LEFT JOIN source_avatars a ON a.source_id=s.id
 WHERE s.plugin IN ('telegram','x','youtube') ORDER BY s.created_at,s.id`,now)
 return rows.filter(row=>(args.includeDisabled||row.enabled)&&(!args.platform||row.plugin===args.platform)).map(row=>({id:row.id,key:'source:'+row.id,channelId:row.channel_id,platform:row.plugin,name:row.name,locator:row.locator,enabled:!!row.enabled,createdAt:row.created_at,unreadCount:Number(row.unread??0),postCount:Number(row.total??0),...(row.first_id?{firstUnread:{id:row.first_id,kind:'news' as const}}:{}),...(row.last_id?{lastPost:{id:row.last_id,title:row.last_title,publishedAt:row.last_at,sourceName:row.name}}:{}),...(row.sha256?{avatar:{sourceId:row.id,sha256:row.sha256}}:{})}))
}
export function socialIdentity(key:unknown){
 requireAppAdministrator()
 if(typeof key!=='string'||!/^source:[a-zA-Z0-9_-]+$/.test(key))throw Error('Choose a valid social element')
 const row=one("SELECT id,channel_id,name,plugin,enabled FROM sources WHERE id=? AND plugin IN ('telegram','x','youtube')",key.slice(7))
 if(!row)throw Error('Unknown social element')
 return {key,kind:'source' as const,id:row.id,channelId:row.channel_id,title:row.name,platform:row.plugin,enabled:!!row.enabled}
}
export function categoryRule(include:unknown){if(include==='null')include=null;if(include!==undefined&&include!==null&&!CATEGORY_INCLUDES.includes(include as any))throw Error('Invalid category inclusion rule');return include??undefined}
