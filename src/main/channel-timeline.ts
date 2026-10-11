import {authorize} from './authorization'
import {readChannelIdentity,getChannelMessage} from './channel-discussion'
import {all,one,postSelect,projectChannelPost} from './channel-store'
import type {ChannelTimeline,ChannelTimelineEntry} from '../shared/channels'

const news="SELECT p.id,p.published_at AS time,'news' AS kind FROM posts p JOIN sources s ON s.id=p.source_id WHERE s.channel_id=? AND p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?)"
const messages="SELECT id,created_at AS time,'message' AS kind FROM channel_messages WHERE channel_id=?"
const key=(value:unknown,label:string)=>{if(typeof value!=='string'||!value||value!==value.trim())throw Error('Provide a valid '+label);return value}

/** Current shared content only: reading never acknowledges, replays or copies news. */
export function channelTimeline(args:Record<string,any>):ChannelTimeline{
 authorize('channel.timeline')
 for(const name of Object.keys(args))if(args[name]!==undefined&&!['id','limit','cursor','beforeEntry','kind'].includes(name))throw Error('Unknown channel timeline field: '+name)
 const channel=readChannelIdentity(args.id,true),limit=args.limit===undefined?20:args.limit,kind=args.kind===undefined?'all':args.kind,now=Date.now()
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Timeline limit must be 1–100')
 if(!['all','news','message'].includes(kind))throw Error('Timeline kind must be all, news or message')
 const beforeEntry=args.beforeEntry===undefined?null:key(args.beforeEntry,'timeline entry ID')
 const where:string[]=[],values:Array<string|number>=kind==='news'?[channel.id,now]:kind==='message'?[channel.id]:[channel.id,now,channel.id]
 const earlier=(time:number,id:string)=>{where.push('(time<? OR (time=? AND id COLLATE BINARY<?))');values.push(time,time,id)}
 if(beforeEntry!==null){
  const anchor=one('SELECT id,time FROM ('+news+' UNION ALL '+messages+') WHERE id=?',channel.id,now,channel.id,beforeEntry)
  if(!anchor)throw Error('Timeline entry is unavailable in this channel')
  earlier(anchor.time,anchor.id)
 }
 if(args.cursor!==undefined){
  let cursor:any
  try{if(typeof args.cursor!=='string'||!args.cursor||!/^[A-Za-z0-9_-]+$/.test(args.cursor))throw Error();cursor=JSON.parse(Buffer.from(args.cursor,'base64url').toString())}catch{throw Error('Invalid channel timeline cursor')}
  if(!Array.isArray(cursor)||cursor.length!==6||cursor[0]!==1||cursor[1]!==channel.id||cursor[2]!==kind||cursor[3]!==beforeEntry||!Number.isSafeInteger(cursor[4])||cursor[4]<0||typeof cursor[5]!=='string'||!cursor[5]||cursor[5]!==cursor[5].trim())throw Error('Channel timeline cursor does not match this request')
  earlier(cursor[4],cursor[5])
 }
 const selection=kind==='news'?news:kind==='message'?messages:news+' UNION ALL '+messages
 const rows=all('SELECT id,time,kind FROM ('+selection+')'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY time DESC,id COLLATE BINARY DESC LIMIT ?',...values,limit+1),page=rows.slice(0,limit),last=page.at(-1)
 const entries:ChannelTimelineEntry[]=page.reverse().map(row=>{
  if(row.kind==='message')return {kind:'message',id:row.id,time:row.time,message:getChannelMessage(channel.id,row.id)}
  const {saved:_saved,savedAt:_savedAt,...post}=projectChannelPost(one(postSelect+' WHERE p.id=?',row.id)!)
  return {kind:'news',id:row.id,time:row.time,post}
 })
 return {entries,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify([1,channel.id,kind,beforeEntry,last.time,last.id])).toString('base64url'):null,order:'chronological'}
}
