import {scopeAllows,assertScope,claimEngineResource,engineSelection} from './engine-scope'
import {channelMemberIds,channelOffices} from './channel-members'
import {requireConversation} from './conversation-policy'
import {controlChanged} from './conversation-policy'
import {channelDocuments,channelFileStatus,downloadChannelFile} from './channel-files'
import {notifyChannelSchedule,reconcileSchedules} from './scheduler/service'
import {validatedChannelImage,putSourceAvatar,sourceAvatar,readSourceAvatar} from './channel-avatars'
import {channelEngine,validateChannelEngine,storeChannelEngine,syncEmployeeSources,createProcessSource,employeePublishingSource,sourceEmployee,collectorAllowsSource,authorizeSourcePublisher,assertExternalChannel,recordCollectorActivity,channelConnection,putChannelAvatar,customChannelAvatar,readChannelAvatar} from './channel-engines'
import {readStore} from './store'
import type {ChannelEngineInput} from '../shared/channels'
import {updateChannelAdmins,channelAdminIds,freezeChannelNews,deliverChannelNews,channelHistory,channelContext,sendChannelMessage,postChannelMessage} from './channel-discussion'
import {channelTimeline} from './channel-timeline'
import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import type {SQLInputValue} from 'node:sqlite'
import type {ChannelReadSummary,ChannelReadState,ChannelReadEntry,ChannelAcknowledgment} from '../shared/channels'
import {authorize,requestContext,isAppAdministrator,requireAppAdministrator} from './authorization'
import {CHANNEL_PLUGINS,CHANNEL_IMAGE_LIMIT,NEWS_RETENTION_MS,type ChannelSettings,type ChannelRecord,type ChannelSource,type ChannelPost,type ChannelView,type ChannelPostPage,type ChannelMedia,type ChannelSourceInput,type ChannelSourcePatch,type ChannelPublishInput,type ChannelPublishResult,type ChannelMediaInput,type ChannelCollector,type CollectorConfig,type ChannelEvent,type ChannelFileRef} from '../shared/channels'

import {directory,mediaDirectory,db,one,all,run,revision,transaction,changed,closeChannelStore,type Row,channelMedia as media,projectChannelPost as projected,postSelect,liveChannelPost as livePost} from './channel-store'
export {setChannelStoreEmitter as setChannelsEmitter} from './channel-store'
let timer:ReturnType<typeof setInterval>|undefined
const fail=(message:string,code='INVALID_CHANNEL_REQUEST',status=400)=>Object.assign(Error(message),{code,status})
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
const postId=(sourceId:string,externalId:string)=>'np_'+hash(JSON.stringify([sourceId,externalId]))
const fields=(value:Record<string,unknown>,allowed:string[])=>{for(const key of Object.keys(value))if(value[key]!==undefined&&!allowed.includes(key))throw fail('Unknown channel field: '+key)}
const text=(value:unknown,label:string,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw fail('Provide a valid '+label);return value.trim()}
const optionalText=(value:unknown,label:string,max=500)=>value===undefined?undefined:text(value,label,max)
const webUrl=(value:unknown)=>{if(value===undefined||value==='')return undefined;const url=new URL(text(value,'HTTP URL',4096));if(!['http:','https:'].includes(url.protocol))throw fail('Use an HTTP or HTTPS URL');return url.href}
const timestamp=(value:unknown,now=Date.now())=>{if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>now+300000)throw fail('publishedAt must be Unix milliseconds, not a future date');return Number(value)}
const positive=(value:unknown,label:string)=>{if(!Number.isSafeInteger(value)||Number(value)<1)throw fail('Provide a positive '+label);return Number(value)}
export function getChannelSettings():ChannelSettings{return JSON.parse(one("SELECT value FROM metadata WHERE key='settings'")!.value)}
function settings(patch?:Record<string,unknown>){
 const current=getChannelSettings();if(patch===undefined)return current
 fields(patch,['enabled','port']);if(patch.enabled!==undefined&&typeof patch.enabled!=='boolean')throw fail('enabled must be boolean')
 if(patch.port!==undefined&&(!Number.isInteger(patch.port)||Number(patch.port)<1024||Number(patch.port)>65535))throw fail('Choose a listener port from 1024 to 65535')
 const next={...current,...patch,host:'127.0.0.1' as const};run("UPDATE metadata SET value=? WHERE key='settings'",JSON.stringify(next));changed('settings');return next
}
function channelRow(id:unknown){assertScope('channels',id);const row=one('SELECT * FROM channels WHERE id=?',text(id,'channel ID'));if(!row)throw fail('Unknown news channel','CHANNEL_NOT_FOUND',404);return row}
function sourceRow(id:unknown){const row=one('SELECT * FROM sources WHERE id=?',text(id,'source ID'));if(!row)throw fail('Unknown news source','SOURCE_NOT_FOUND',404);assertScope('channels',row.channel_id);return row}
const record=(row:Row):ChannelRecord=>({...channelOffices(row.id),id:row.id,name:row.name,kind:row.kind,createdAt:row.created_at,updatedAt:row.updated_at,adminIds:channelAdminIds(row.id),revision:row.revision,engine:channelEngine(row.id)})
const unreadEntries="SELECT p.id,'news' AS kind,p.published_at AS time FROM posts p JOIN sources s ON s.id=p.source_id LEFT JOIN channel_user_reads r ON r.entry_id=p.id WHERE s.channel_id=? AND p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) AND r.entry_id IS NULL UNION ALL SELECT m.id,'message' AS kind,m.created_at AS time FROM channel_messages m LEFT JOIN channel_user_reads r ON r.entry_id=m.id WHERE m.channel_id=? AND json_extract(m.author,'$.kind')='agent' AND r.entry_id IS NULL"
function readSummary(id:string,now=Date.now()):ChannelReadSummary{const first=one('SELECT id,kind,COUNT(*) OVER() AS count FROM ('+unreadEntries+') ORDER BY time,id COLLATE BINARY LIMIT 1',id,now,id);return {unreadCount:Number(first?.count??0),...(first?{firstUnread:{id:first.id,kind:first.kind}}:{})}}
function readEntryIds(input:unknown){if(!Array.isArray(input)||input.length>200||input.some(id=>typeof id!=='string'||!id||id!==id.trim()))throw fail('Choose up to 200 channel entry IDs');return [...new Set(input)] as string[]}
/** Resolve current routing and retention without reading bodies or touching Agent receipts. */
function userReadEntry(channelId:string,id:string,now:number){
 const row=id.startsWith('np_')?one("SELECT p.id,s.channel_id,p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) AS visible,1 AS incoming,r.entry_id AS known,r.read_at FROM posts p JOIN sources s ON s.id=p.source_id LEFT JOIN channel_user_reads r ON r.entry_id=p.id WHERE p.id=?",now,id):one("SELECT m.id,m.channel_id,1 AS visible,json_extract(m.author,'$.kind')='agent' AS incoming,r.entry_id AS known,r.read_at FROM channel_messages m LEFT JOIN channel_user_reads r ON r.entry_id=m.id WHERE m.id=?",id)
 if(!row||!row.visible)return undefined
 if(row.channel_id!==channelId)throw fail('Entry belongs to another channel','CHANNEL_ENTRY_SCOPE_MISMATCH',403)
 return row
}
function channelReadState(args:Record<string,any>):ChannelReadState{
 fields(args,['id','entryIds']);const channel=channelRow(args.id),ids=readEntryIds(args.entryIds),now=Date.now()
 const entries=ids.flatMap((id):ChannelReadEntry[]=>{const row=userReadEntry(channel.id,id,now);if(!row)return [];return [{id,state:!row.incoming?'read':!row.known?'unread':row.read_at===null?'unknown':'read',...(row.incoming&&row.read_at!==null?{readAt:row.read_at}:{})}]})
 return {id:channel.id,entries,...readSummary(channel.id,now)}
}
function acknowledgeChannel(args:Record<string,any>):ChannelAcknowledgment{
 if(requestContext().principal.kind!=='operator')throw fail('Only the user may mark channel entries read','FORBIDDEN',403)
 fields(args,['id','entryIds','all','sourceId']);if(args.sourceId!==undefined&&args.all!==true)throw fail('Source reading requires explicit all:true');if(args.all!==undefined&&args.all!==true||args.all===true&&args.entryIds!==undefined||args.all===undefined&&args.entryIds===undefined)throw fail('Choose entryIds or all:true')
 const channel=channelRow(args.id),ids=args.all?[]:readEntryIds(args.entryIds),now=Date.now(),changedIds:string[]=[]
 if(args.sourceId!==undefined&&sourceRow(args.sourceId).channel_id!==channel.id)throw fail('Source belongs to another channel')
 const result=transaction(()=>{
  if(args.sourceId!==undefined){const count=Number(run("INSERT INTO channel_user_reads(entry_id,read_at) SELECT p.id,? FROM posts p LEFT JOIN channel_user_reads r ON r.entry_id=p.id WHERE p.source_id=? AND p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) AND r.entry_id IS NULL",now,args.sourceId,now).changes);return {acknowledged:true as const,id:channel.id,all:true as const,acknowledgedCount:count,...readSummary(channel.id,now)}}
  if(args.all){const count=Number(run('INSERT INTO channel_user_reads(entry_id,read_at) SELECT id,? FROM ('+unreadEntries+')',now,channel.id,now,channel.id).changes);return {acknowledged:true as const,id:channel.id,all:true as const,acknowledgedCount:count,...readSummary(channel.id,now)}}
  const entries=ids.map(id=>userReadEntry(channel.id,id,now)).filter((row):row is Row=>!!row)
  for(const row of entries)if(row.incoming&&Number(run('INSERT INTO channel_user_reads(entry_id,read_at) VALUES(?,?) ON CONFLICT(entry_id) DO UPDATE SET read_at=excluded.read_at WHERE channel_user_reads.read_at IS NULL',row.id,now).changes))changedIds.push(row.id)
  return {acknowledged:true as const,id:channel.id,entryIds:entries.map(row=>row.id),acknowledgedCount:changedIds.length,...readSummary(channel.id,now)}
 })
 if(result.acknowledgedCount)changed('reads',{channelIds:[channel.id],...(args.all?{}:{entryIds:changedIds})})
 return result
}
function source(row:Row):ChannelSource{
 const avatar=one("SELECT id,avatar_media_id,author_url FROM posts WHERE source_id=? AND state='active' AND (saved_at IS NOT NULL OR expires_at>?) AND avatar_media_id IS NOT NULL ORDER BY published_at DESC,id DESC LIMIT 1",row.id,Date.now())
 return {id:row.id,plugin:row.plugin,targetId:row.target_id,locator:row.locator,name:row.name,enabled:!!row.enabled,pollSeconds:row.poll_seconds,channelId:row.channel_id,createdAt:row.created_at,updatedAt:row.updated_at,...(avatar?{avatar:{postId:avatar.id,mediaId:avatar.avatar_media_id},...(avatar.author_url?{authorUrl:avatar.author_url}:{})}:{})}
}
function channelView(row:Row):ChannelView{
 const counts=one("SELECT COUNT(*) AS count,SUM(p.saved_at IS NOT NULL) AS saved FROM posts p JOIN sources s ON s.id=p.source_id WHERE s.channel_id=? AND p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?)",row.id,Date.now())!
 const last=one("SELECT p.id,p.title,p.published_at,p.telegram,s.name FROM posts p JOIN sources s ON s.id=p.source_id WHERE s.channel_id=? AND p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) ORDER BY p.published_at DESC,p.id DESC LIMIT 1",row.id,Date.now())
 const customAvatar=customChannelAvatar(row.id)
 const avatar=row.kind==='telegram'?one("SELECT s.id,a.sha256 FROM sources s JOIN source_avatars a ON a.source_id=s.id WHERE s.channel_id=? AND s.plugin='telegram' ORDER BY s.created_at LIMIT 1",row.id):undefined
 const lastMessage=one('SELECT id,text,created_at,author_name,author FROM channel_messages WHERE channel_id=? ORDER BY sequence DESC LIMIT 1',row.id)
 const subscriberCount=last?.telegram?JSON.parse(last.telegram).subscriberCount:undefined
 return {...(subscriberCount!==undefined?{subscriberCount}:{}),...record(row),...readSummary(row.id),...(lastMessage?{lastMessage:{id:lastMessage.id,text:lastMessage.text,createdAt:lastMessage.created_at,authorName:lastMessage.author_name,author:JSON.parse(lastMessage.author)}}:{}),...(customAvatar?{avatar:customAvatar}:avatar?{avatar:{sourceId:avatar.id,sha256:avatar.sha256}}:{}),sourceCount:Number(one('SELECT COUNT(*) AS count FROM sources WHERE channel_id=? AND enabled=1',row.id)!.count),postCount:Number(counts.count),savedCount:Number(counts.saved??0),...(last?{lastPost:{id:last.id,title:last.title,publishedAt:last.published_at,sourceName:last.name}}:{})}
}
function createChannel(name:string,kind:ChannelRecord['kind']='custom'){
 const now=Date.now(),id='nc_'+randomUUID();run('INSERT INTO channels(id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?)',id,name,kind,now,now);claimEngineResource('channels',id);return channelRow(id)
}
function configurePublishingEngine(id:string,input:ChannelEngineInput){
 const previous=channelEngine(id)
 storeChannelEngine(id,input)
 if(input.kind==='employees')return undefined
 const sources=all('SELECT id FROM sources WHERE channel_id=?',id).map(row=>String(row.id))
 if(!sources.length)sources.push(createProcessSource(id,input.name))
 const collectorId=input.collectorId??(previous.kind==='external'?previous.collectorId:undefined)
 const issued=collectorId?undefined:addCollector({name:input.name,sourceIds:sources})
 storeChannelEngine(id,{...input,collectorId:collectorId??issued!.collector.id})
 return issued?{collectorId:issued.collector.id,token:issued.token}:undefined
}
function createConfiguredChannel(args:Record<string,any>){
 fields(args,['name','engine','avatar']);const name=text(args.name,'channel name'),engine=validateChannelEngine(args.engine)
 const result=transaction(()=>{
  const row=createChannel(name),setup=configurePublishingEngine(row.id,engine)
  if(engine.kind==='employees'){run('UPDATE channels SET admin_ids=? WHERE id=?',JSON.stringify(engine.employeeIds),row.id);syncEmployeeSources(row.id)}
  if(args.avatar!==undefined)putChannelAvatar(row.id,args.avatar)
  return {...channelView(channelRow(row.id)),...(setup?{setup}:{})}
 })
 changed('channels',{channelIds:[result.id]});return result
}
function updateConfiguredChannel(args:Record<string,any>){
 fields(args,['id','name','adminIds','engine','avatar','expectedRevision']);const row=channelRow(args.id)
 if(args.expectedRevision!==undefined&&args.expectedRevision!==row.revision)throw Error('Channel changed; reload before saving')
 if(['name','adminIds','engine','avatar'].every(key=>args[key]===undefined))throw fail('Provide a channel name, avatar, engine or administrators')
 const name=args.name===undefined?row.name:text(args.name,'channel name'),engine=args.engine===undefined?undefined:validateChannelEngine(args.engine)
 if(engine?.kind==='employees'&&args.adminIds!==undefined)throw fail('Choose engine employeeIds or adminIds, not both')
 const adminIds=engine?.kind==='employees'?engine.employeeIds:args.adminIds
 const result=transaction(()=>{
  const setup=engine?configurePublishingEngine(row.id,engine):undefined
  if(adminIds!==undefined)updateChannelAdmins(row.id,adminIds,args.expectedRevision)
  run('UPDATE channels SET name=?,updated_at=?,revision=revision+? WHERE id=?',name,Date.now(),adminIds===undefined?1:0,row.id)
  syncEmployeeSources(row.id)
  if(args.avatar!==undefined)putChannelAvatar(row.id,args.avatar)
  return {...channelView(channelRow(row.id)),...(setup?{setup}:{})}
 })
 changed('channels',{channelIds:[row.id]});controlChanged('channel:'+row.id);reconcileSchedules();return result
}
function defaultChannel(plugin:ChannelSourceInput['plugin'],name:string){return plugin==='telegram'?createChannel(name,plugin):all('SELECT * FROM channels WHERE kind=? ORDER BY created_at',plugin).find(row=>scopeAllows('channels',row.id))??createChannel(plugin==='x'?'X':'YouTube',plugin)}
function sourceIdentity(plugin:ChannelSourceInput['plugin'],locator:string){
 const value=locator.trim().replace(/\/+$/,'');if(plugin==='telegram')return value
 const url=value.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?(?:[?#].*)?$/i),hosts=plugin==='x'?['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com']:['youtube.com','www.youtube.com','m.youtube.com']
 const invalid=()=>fail(plugin==='x'?'Use a valid X author handle or profile URL':'Use a YouTube author handle or channel homepage URL','INVALID_SOURCE_LOCATOR')
 if(url&&!hosts.includes(url[1].toLowerCase()))throw invalid()
 let target=url?(url[2]??'').replace(/^\/|\/+$/g,''):value
 if(plugin==='x'){
  target=target.replace(/^@/,'').toLowerCase()
  if(!/^[a-z\d_]{1,15}$/.test(target)||['home','explore','search','settings','notifications','messages','i','intent','share','login','signup','compose'].includes(target))throw invalid()
  return target
 }
 if(!url&&!value.startsWith('@'))throw invalid()
 target=target.replace(/\/(videos|shorts|streams|featured|about|playlists|community)$/,'')
 const creator=target.match(/^(?:@([\p{L}\p{N}_.-]+)|channel\/(UC[\p{L}\p{N}_-]+)|(?:c\/|user\/)?([\p{L}\p{N}_.-]+))$/u)
 if(!creator||['watch','playlist','shorts','live','feed'].includes(target.toLowerCase()))throw invalid()
 return creator[1]?'@'+creator[1].toLowerCase():creator[2]??target
}
function addSource(args:ChannelSourceInput):ChannelSource{
 fields(args as any,['plugin','targetId','locator','name','enabled','pollSeconds','channelId']);if(!CHANNEL_PLUGINS.includes(args.plugin))throw fail('Use telegram, x or youtube')
 const locator=text(args.locator,'source locator',4096),targetId=optionalText(args.targetId,'target ID',4096)??args.plugin+':'+locator.replace(/\/$/,''),name=optionalText(args.name,'source name')??locator
 if(args.enabled!==undefined&&typeof args.enabled!=='boolean')throw fail('enabled must be boolean')
 const identity=sourceIdentity(args.plugin,locator),existing=one('SELECT * FROM sources WHERE plugin=? AND target_id=?',args.plugin,targetId)??all('SELECT * FROM sources WHERE plugin=?',args.plugin).find(row=>sourceIdentity(args.plugin,row.locator)===identity)
 if(existing){if(sourceIdentity(args.plugin,existing.locator)!==identity)throw fail('An existing source cannot change authors; follow a new source instead','SOURCE_ID_CONFLICT',409);return updateSource(existing.id,{...(args.name!==undefined?{name}:{}),enabled:args.enabled??true,...(args.pollSeconds!==undefined?{pollSeconds:args.pollSeconds}:{}),...(args.channelId?{channelId:args.channelId}:{})})}
 if(one('SELECT id FROM sources WHERE target_id=?',targetId))throw fail('Target ID is already used by another source','SOURCE_ID_CONFLICT',409)
 if(args.plugin==='telegram'&&args.channelId)throw fail('A Telegram subscription creates its own channel')
 if(args.channelId)assertExternalChannel(args.channelId)
 const row=transaction(()=>{const channel=args.channelId?channelRow(args.channelId):defaultChannel(args.plugin,name),now=Date.now(),id='ns_'+randomUUID();run('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?)',id,args.plugin,targetId,locator,name,Number(args.enabled??true),args.pollSeconds===undefined?{telegram:300,x:3600,youtube:7200}[args.plugin]:positive(args.pollSeconds,'poll interval'),channel.id,now,now);return sourceRow(id)})
 changed('sources',{channelIds:[row.channel_id]});return source(row)
}
function updateSource(id:unknown,patch:ChannelSourcePatch):ChannelSource{
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw fail('Provide a source patch');fields(patch as any,['name','locator','enabled','pollSeconds','channelId']);const row=sourceRow(id)
 if(row.plugin==='employee')throw fail('Manage publishing employees through channel membership, not source settings')
 if(row.plugin==='process'&&(patch.locator!==undefined||patch.channelId!==undefined&&patch.channelId!==row.channel_id))throw fail('A process source keeps its configured identity and channel')
 if(patch.enabled!==undefined&&typeof patch.enabled!=='boolean')throw fail('enabled must be boolean')
 if(patch.locator!==undefined&&sourceIdentity(row.plugin,text(patch.locator,'source locator',4096))!==sourceIdentity(row.plugin,row.locator))throw fail('An existing source cannot change authors; follow a new source instead','SOURCE_ID_CONFLICT',409)
 if(patch.channelId!==undefined){channelRow(patch.channelId);assertExternalChannel(patch.channelId);if(row.plugin==='telegram'&&patch.channelId!==row.channel_id)throw fail('Telegram subscriptions keep their one-to-one channel')}
 run('UPDATE sources SET name=?,enabled=?,poll_seconds=?,channel_id=?,updated_at=? WHERE id=?',patch.name===undefined?row.name:text(patch.name,'source name'),patch.enabled===undefined?row.enabled:Number(patch.enabled),patch.pollSeconds===undefined?row.poll_seconds:positive(patch.pollSeconds,'poll interval'),patch.channelId??row.channel_id,Date.now(),row.id)
 changed('sources',{channelIds:[...new Set([row.channel_id,patch.channelId??row.channel_id])]});return source(sourceRow(row.id))
}
export function getChannelPost(id:unknown):ChannelPost{const row=livePost(id);requireConversation('channel:'+row.channel_id);return projected(row)}
function memberRecord(row:Row):ChannelRecord{const value=record(row);if(value.engine?.kind==='external')value.engine={kind:'external',location:value.engine.location};return value}
export function getChannel(id:unknown):ChannelRecord{const row=channelRow(id),principal=requestContext().principal,value=isAppAdministrator(principal)?record(row):memberRecord(row);if(principal.kind==='agent'&&!isAppAdministrator(principal)&&!value.memberIds!.includes(principal.employeeId))throw fail('Not a channel administrator','FORBIDDEN',403);return value}
export function listChannels():ChannelRecord[]{const rows=all('SELECT * FROM channels ORDER BY created_at,id').filter(row=>scopeAllows('channels',row.id)),principal=requestContext().principal;return isAppAdministrator(principal)?rows.map(channelView):rows.map(memberRecord).filter(value=>principal.kind==='agent'&&value.memberIds!.includes(principal.employeeId))}
export function listChannelSources(args:{channelId?:string;plugin?:string;includeDisabled?:boolean}={}):ChannelSource[]{requireAppAdministrator();fields(args as any,['channelId','plugin','includeDisabled']);const where:string[]=[],values:SQLInputValue[]=[];if(args.channelId){where.push('channel_id=?');values.push(args.channelId)}if(args.plugin){where.push('plugin=?');values.push(args.plugin)}if(!args.includeDisabled)where.push('enabled=1');return all('SELECT * FROM sources'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY created_at,id',...values).filter(row=>scopeAllows('channels',row.channel_id)).map(source)}
export function queryChannelPosts(args:Record<string,any>={}):ChannelPostPage{
 requireAppAdministrator();fields(args,['channelId','sourceId','saved','query','media','links','messageOrder','cursor','offset','limit']);const limit=args.limit??50,offset=args.offset??0;if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(offset)||offset<0)throw fail('Invalid news limit or offset')
 const where=["p.state='active'",'(p.saved_at IS NOT NULL OR p.expires_at>?)'],values:SQLInputValue[]=[Date.now()]
  const selection=engineSelection();if(selection){const ids=selection.resources.channels;where.push(ids.length?'s.channel_id IN ('+ids.map(()=>'?').join(',')+')':'0');values.push(...ids)}
 if(args.channelId!==undefined){channelRow(args.channelId);where.push('s.channel_id=?');values.push(args.channelId)}if(args.sourceId!==undefined){sourceRow(args.sourceId);where.push('p.source_id=?');values.push(args.sourceId)}
 if(args.saved!==undefined){if(typeof args.saved!=='boolean')throw fail('saved must be boolean');where.push('p.saved_at IS '+(args.saved?'NOT ':'')+'NULL')}
 if(args.media)where.push('json_array_length(p.media_ids)>0')
 if(args.links)where.push("(p.url LIKE 'http%' OR p.body LIKE '%http://%' OR p.body LIKE '%https://%')")
 if(args.messageOrder&&args.cursor)throw fail('Message ordering cannot use a news cursor')
 if(args.query!==undefined){const query=text(args.query,'search text',500);where.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')");const term='%'+query.replace(/[\\%_]/g,'\\$&')+'%';values.push(term,term,term)}
 const total=Number(one('SELECT COUNT(*) AS count FROM posts p JOIN sources s ON s.id=p.source_id WHERE '+where.join(' AND '),...values)!.count)
 if(args.cursor){if(offset)throw fail('Choose a cursor or offset, not both');let cursor:any;try{cursor=JSON.parse(Buffer.from(args.cursor,'base64url').toString())}catch{throw fail('Invalid news cursor')};if(!Array.isArray(cursor)||cursor.length!==2||!Number.isSafeInteger(cursor[0])||typeof cursor[1]!=='string')throw fail('Invalid news cursor');where.push('(p.published_at<? OR (p.published_at=? AND p.id<?))');values.push(cursor[0],cursor[0],cursor[1])}
 const order=args.messageOrder?'p.published_at DESC,s.channel_id ASC,p.id ASC':'p.published_at DESC,p.id DESC',rows=all(postSelect+' WHERE '+where.join(' AND ')+' ORDER BY '+order+' LIMIT ? OFFSET ?',...values,limit+1,offset),page=rows.slice(0,limit),last=page.at(-1)
 return {posts:page.map(projected),nextCursor:!args.messageOrder&&rows.length>limit&&last?Buffer.from(JSON.stringify([last.published_at,last.id])).toString('base64url'):null,total}
}
function expire(row:Row,state:'deleted'|'expired',now=Date.now()){
 run("UPDATE posts SET state=?,title=NULL,body=NULL,url=NULL,author_name=NULL,author_url=NULL,avatar_media_id=NULL,saved_at=NULL,media_ids='[]',forget_at=?,updated_at=? WHERE id=?",state,Math.max(row.expires_at,now+NEWS_RETENTION_MS),now,row.id)
 for(const asset of all('SELECT * FROM media WHERE post_id=?',row.id)){fs.rmSync(path.join(mediaDirectory,asset.file),{force:true});run('DELETE FROM media WHERE id=?',asset.id)}
 run('DELETE FROM channel_user_reads WHERE entry_id=?',row.id)
}
function savePost(id:unknown,saved:unknown){
 if(typeof saved!=='boolean')throw fail('saved must be boolean');const row=livePost(id)
 if(saved)run('UPDATE posts SET saved_at=COALESCE(saved_at,?) WHERE id=?',Date.now(),row.id)
 else{run('UPDATE posts SET saved_at=NULL WHERE id=?',row.id);if(row.expires_at<=Date.now()){expire(row,'expired');changed('posts',{channelIds:[row.channel_id],postIds:[row.id]});return {id:row.id,saved:false,expired:true}}}
 changed('posts',{channelIds:[row.channel_id],postIds:[row.id]});return projected(livePost(row.id))
}
function deletePost(id:unknown){const row=one(postSelect+' WHERE p.id=?',text(id,'post ID'));if(row&&row.state==='active'){expire(row,'deleted');changed('posts',{channelIds:[row.channel_id],postIds:[row.id]})};return {id,deleted:true}}
function activeSource(id:unknown,collector?:ChannelCollector){
 const sourceId=text(id,'source ID'),row=sourceRow(sourceId)
 if(collector){if(!collectorAllowsSource(row,collector))throw fail('Collector cannot publish this source','SOURCE_FORBIDDEN',403)}else authorizeSourcePublisher(row)
 if(!row.enabled)throw fail('Source is disabled; refresh collector configuration','SOURCE_DISABLED',409);return row
}
function publicationSource(args:{sourceId?:string;channelId?:string},collector?:ChannelCollector){
 if((args.sourceId===undefined)===(args.channelId===undefined))throw fail('Choose sourceId or channelId, not both')
 if(args.channelId!==undefined){if(collector)throw fail('Collector publication requires its sourceId','SOURCE_FORBIDDEN',403);return activeSource(employeePublishingSource(args.channelId).id)}
 return activeSource(args.sourceId,collector)
}
function itemState(sourceId:string,externalId:string,publishedAt:number){const src=sourceRow(sourceId),engine=channelEngine(src.channel_id),retention=engine.kind==='external'&&engine.fileStorage?7*24*60*60*1000:NEWS_RETENTION_MS;const id=postId(sourceId,externalId),row=one('SELECT * FROM posts WHERE id=?',id),now=Date.now(),expiresAt=row?.expires_at??Math.min(publishedAt+retention,now+retention);if(row&&row.published_at!==publishedAt)throw fail('An existing item cannot change its publishedAt','POST_ID_CONFLICT',409);return {id,row,now,expiresAt}}
function telegramInfo(value:unknown,plugin:string):import('../shared/channels').TelegramPostInfo|undefined{
 if(value===undefined)return undefined
 if(plugin!=='telegram'||!value||typeof value!=='object'||Array.isArray(value))throw fail('Telegram metadata requires a Telegram source')
 const input=value as Record<string,any>;fields(input,['groupId','views','subscriberCount','reactions'])
 if(input.groupId!==undefined&&(typeof input.groupId!=='string'||!/^\d{1,30}$/.test(input.groupId)))throw fail('Invalid Telegram album ID')
 for(const field of ['views','subscriberCount'])if(input[field]!==undefined&&(!Number.isSafeInteger(input[field])||input[field]<0))throw fail('Invalid Telegram count')
 if(input.reactions!==undefined&&(!Array.isArray(input.reactions)||input.reactions.length>32||input.reactions.some((reaction:any)=>!reaction||typeof reaction.emoji!=='string'||reaction.emoji.length>64||!Number.isSafeInteger(reaction.count)||reaction.count<0)))throw fail('Invalid Telegram reactions')
 return input
}
function publish(args:ChannelPublishInput,collector?:ChannelCollector):ChannelPublishResult{
 fields(args as any,['sourceId','channelId','externalId','publishedAt','title','body','url','authorName','authorUrl','avatarMediaId','mediaIds','files','telegram','contentHash']);const src=publicationSource(args,collector),externalId=text(args.externalId,'external item ID',1024),publishedAt=timestamp(args.publishedAt),item=itemState(src.id,externalId,publishedAt)
 if(typeof args.title!=='string'||args.title.length>1000||typeof args.body!=='string'||Buffer.byteLength(args.body)>1024*1024)throw fail('News requires a title up to 1000 characters and a body up to 1 MiB')
 const telegram=telegramInfo(args.telegram,src.plugin);
 const files=channelDocuments(args.files),engine=channelEngine(src.channel_id);if(files.length&&(engine.kind!=='external'||!engine.fileStorage))throw fail('Configure cloud file storage before publishing document metadata');
 const ids=args.mediaIds??[];if(!Array.isArray(ids)||ids.length>16||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw fail('Choose up to 16 unique uploaded images')
 const employeeId=sourceEmployee(src.id),employeeName=employeeId?readStore().sessions.find(card=>card.id===employeeId)?.title:undefined
 if(employeeId&&args.authorName!==undefined&&args.authorName!==employeeName)throw fail('Cannot publish as another author','CHANNEL_PUBLISH_FORBIDDEN',403)
 const title=args.title.trim(),body=args.body,url=webUrl(args.url),authorName=employeeName??optionalText(args.authorName,'author name'),authorUrl=webUrl(args.authorUrl),avatar=optionalText(args.avatarMediaId,'avatar media ID'),payloadHash=hash(JSON.stringify([title,body,url??null,authorName??null,authorUrl??null,avatar??null,ids,...(files.length?[files]:[]),...(telegram?[telegram]:[])])),contentHash=optionalText(args.contentHash,'content hash',128)??payloadHash
 if(!title&&!body.trim()&&!ids.some(id=>id!==avatar)&&!files.length&&!url)throw fail('News requires text, a body image or a source URL')
 const result=(status:ChannelPublishResult['status'],storedHash=contentHash):ChannelPublishResult=>({id:item.id,channelId:src.channel_id,status,contentHash:storedHash,expiresAt:item.expiresAt})
 if(item.row&&['deleted','expired'].includes(item.row.state))return result(item.row.state,item.row.content_hash)
 if(item.row?.state==='active'&&item.row.saved_at===null&&item.expiresAt<=item.now){expire(item.row,'expired');changed('posts',{channelIds:[src.channel_id],postIds:[item.id]});return result('expired',item.row.content_hash)}
 if(item.row?.state==='active'&&item.row.payload_hash===payloadHash&&item.row.content_hash===contentHash)return result('duplicate')
 if(item.expiresAt<=item.now)return result('expired',item.row?.content_hash??contentHash)
 for(const file of files)if(file.thumbnailMediaId&&!ids.includes(file.thumbnailMediaId))throw fail('Document thumbnail must be an uploaded image in this item');
 for(const id of [...ids,...(avatar?[avatar]:[])])if(!one('SELECT id FROM media WHERE id=? AND post_id=? AND source_id=?',id,item.id,src.id))throw fail('Media is not an uploaded image for this source item','MEDIA_SCOPE_MISMATCH',403)
 if(item.row?.content_hash===contentHash&&item.row.payload_hash!==payloadHash)throw fail('Content hash was reused for a different payload','CONTENT_HASH_CONFLICT',409)
 transaction(()=>{run(`INSERT INTO posts(id,source_id,external_id,state,title,body,url,author_name,author_url,avatar_media_id,published_at,received_at,updated_at,expires_at,saved_at,content_hash,payload_hash,media_ids,forget_at) VALUES(?,?,?,'active',?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,NULL)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,url=excluded.url,author_name=excluded.author_name,author_url=excluded.author_url,avatar_media_id=excluded.avatar_media_id,updated_at=excluded.updated_at,content_hash=excluded.content_hash,payload_hash=excluded.payload_hash,media_ids=excluded.media_ids`,item.id,src.id,externalId,title,body,url??null,authorName??null,authorUrl??null,avatar??null,publishedAt,item.now,item.now,item.expiresAt,contentHash,payloadHash,JSON.stringify(ids));run('UPDATE posts SET remote_files=?,telegram=? WHERE id=?',JSON.stringify(files),telegram?JSON.stringify(telegram):null,item.id);if(!item.row)freezeChannelNews(src.channel_id,item.id,sourceEmployee(src.id))})
 changed('posts',{channelIds:[src.channel_id],postIds:[item.id]});if(!item.row){notifyChannelSchedule(src.channel_id,item.id,sourceEmployee(src.id));deliverChannelNews(src.channel_id,item.id)}return result(item.row?'updated':'created')
}
function mediaPut(args:ChannelMediaInput,collector?:ChannelCollector){
 fields(args as any,['sourceId','channelId','externalId','publishedAt','mediaKey','name','mimeType','data']);const src=publicationSource(args,collector),externalId=text(args.externalId,'external item ID',1024),publishedAt=timestamp(args.publishedAt),item=itemState(src.id,externalId,publishedAt),key=text(args.mediaKey,'media key',1024),name=text(args.name,'image filename',255)
 if(item.row?.state==='deleted')throw fail('News was deleted; do not replay it','POST_DELETED',410)
 if(item.row?.state==='expired'||item.expiresAt<=item.now)throw fail('News is outside the 48-hour receive window','POST_EXPIRED',410)
 const {data,sha256,extension}=validatedChannelImage(args),id='nm_'+hash(JSON.stringify([item.id,key,sha256])),old=one('SELECT * FROM media WHERE id=?',id)
 if(old&&fs.existsSync(path.join(mediaDirectory,old.file)))return {media:media(old),duplicate:true}
 const file=id+'.'+extension,stage=path.join(mediaDirectory,'.stage-'+randomUUID());fs.writeFileSync(stage,data,{mode:0o600,flag:'wx'});fs.renameSync(stage,path.join(mediaDirectory,file))
 run('INSERT OR REPLACE INTO media VALUES(?,?,?,?,?,?,?,?,?,?)',id,item.id,src.id,key,name,args.mimeType,data.length,sha256,file,item.expiresAt)
 return {media:media(one('SELECT * FROM media WHERE id=?',id)!),duplicate:false}
}
function collectorRecord(row:Row):ChannelCollector{return {id:row.id,name:row.name,sourceIds:JSON.parse(row.source_ids),createdAt:row.created_at,...(row.revoked_at!==null?{revokedAt:row.revoked_at}:{})}}
function addCollector(args:Record<string,any>):{collector:ChannelCollector;token:string}{
 fields(args,['name','sourceIds','channelId']);const name=text(args.name,'collector name')
 if(args.channelId!==undefined){
  if(args.sourceIds!==undefined)throw fail('Choose channelId or sourceIds, not both')
  const channel=channelRow(args.channelId);assertExternalChannel(channel.id)
  const result=transaction(()=>{const sources=all('SELECT id FROM sources WHERE channel_id=?',channel.id).map(row=>String(row.id));if(!sources.length)sources.push(createProcessSource(channel.id,name));const issued=addCollector({name,sourceIds:sources}),engine=channelEngine(channel.id);if(engine.kind!=='external')throw fail('Choose an external channel');storeChannelEngine(channel.id,{...engine,collectorId:issued.collector.id});run('UPDATE channels SET revision=revision+1,updated_at=? WHERE id=?',Date.now(),channel.id);return issued})
  changed('channels',{channelIds:[channel.id]});return result
 }
 const sourceIds=args.sourceIds??'all';if(sourceIds!=='all'&&(!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.some((id:unknown)=>typeof id!=='string')))throw fail('Choose all or explicit source IDs')
 if(sourceIds!=='all')for(const id of sourceIds)if(sourceRow(id).plugin==='employee')throw fail('Collector credentials cannot include employee publishing sources')
 const id='ncc_'+randomUUID(),token='news_'+randomBytes(32).toString('hex');run('INSERT INTO collectors VALUES(?,?,?,?,?,NULL)',id,name,hash(token),JSON.stringify(sourceIds==='all'?'all':[...new Set(sourceIds)]),Date.now());return {collector:collectorRecord(one('SELECT * FROM collectors WHERE id=?',id)!),token}
}
function authenticateCollector(token:unknown):ChannelCollector{if(typeof token!=='string'||token.length>512)throw fail('Invalid collector token','COLLECTOR_UNAUTHORIZED',401);const row=one('SELECT * FROM collectors WHERE token_hash=? AND revoked_at IS NULL',hash(token));if(!row)throw fail('Invalid or revoked collector token','COLLECTOR_UNAUTHORIZED',401);return collectorRecord(row)}
function collectorConfig(args:Record<string,any>,collector?:ChannelCollector):CollectorConfig{
 fields(args,['sinceRevision']);const current=revision('config_revision');if(args.sinceRevision!==undefined&&!Number.isSafeInteger(args.sinceRevision))throw fail('Invalid configuration revision')
 if(args.sinceRevision===current)return {revision:current,changed:false}
 return {revision:current,changed:true,targets:all('SELECT * FROM sources ORDER BY created_at,id').filter(row=>row.plugin!=='employee'&&(!collector||collectorAllowsSource(row,collector))).map(row=>({...(channelEngine(row.channel_id).kind==='external'&&(channelEngine(row.channel_id) as import('../shared/channels').ChannelEngineInput&{fileStorage?:unknown}).fileStorage?{collectFiles:true}:{}),sourceId:row.id,targetId:row.target_id,plugin:row.plugin,locator:row.locator,name:row.name,enabled:!!row.enabled,pollSeconds:row.poll_seconds}))}
}
/** This capability never becomes an operator/employee principal or enters the general dispatcher. */
export function channelCollectorRequest(token:unknown,command:string,args:Record<string,any>={}){
 const collector=authenticateCollector(token)
 const execute=()=>{
 if(command==='channel.collector-config')return collectorConfig(args,collector)
 if(command==='channel.media-put')return mediaPut(args as ChannelMediaInput,collector)
 if(command==='channel.publish')return publish(args as ChannelPublishInput,collector)
 if(command==='channel.source-avatar-put'){fields(args,['sourceId','name','mimeType','data']);const src=activeSource(args.sourceId,collector),before=sourceAvatar(src.id),result=putSourceAvatar(args as any);if(before?.sha256!==result.sha256)changed('sources',{channelIds:[src.channel_id]});return result}
 throw fail('Collector tokens only permit source configuration reads and news/image submission','COLLECTOR_FORBIDDEN',403)
 }
 const result=execute();recordCollectorActivity(collector.id);return result
}
export function channelFileEndpoint(ref:Partial<ChannelFileRef>):{root:string;path:string;name:string;mimeType:string;bytes:number}{
 const parts=ref.path?.split('/'),id=ref.postId??parts?.[0],mediaId=ref.mediaId??parts?.[1],post=livePost(id);channelRow(ref.channelId);requireConversation('channel:'+ref.channelId)
 if(post.channel_id!==ref.channelId||!mediaId||!(JSON.parse(post.media_ids).includes(mediaId)||post.avatar_media_id===mediaId))throw fail('Image is not published in this channel item','MEDIA_SCOPE_MISMATCH',403)
 const asset=one('SELECT * FROM media WHERE id=? AND post_id=?',mediaId,post.id);if(!asset)throw fail('News image is unavailable','MEDIA_NOT_FOUND',404)
 return {root:mediaDirectory,path:asset.file,name:asset.name,mimeType:asset.mime_type,bytes:asset.bytes}
}
export function channelRequest(command:string,args:Record<string,any>={}){
 authorize(command,args)
 if(command==='channel.timeline')return channelTimeline(args)
 switch(command){case 'channel.list':fields(args,[]);return listChannels();case 'channel.get':fields(args,['id']);return getChannel(args.id);case 'channel.history':return channelHistory(args);case 'channel.context':return channelContext(args);case 'channel.message-send':return sendChannelMessage(args);case 'channel.message-post':return postChannelMessage(args)}
 if(command==='channel.publish')return publish(args as ChannelPublishInput)
 if(command==='channel.media-put')return mediaPut(args as ChannelMediaInput)
 if(command==='channel.post'){fields(args,['id']);return getChannelPost(args.id)}
 requireAppAdministrator()
 switch(command){
  case 'channel.file-download':fields(args,['postId','fileId']);return downloadChannelFile(text(args.postId,'post ID'),text(args.fileId,'file ID'))
  case 'channel.file-status':fields(args,['postId','fileId']);return channelFileStatus(text(args.postId,'post ID'),text(args.fileId,'file ID'))
  case 'channel.connection':fields(args,['id']);channelRow(args.id);return channelConnection(args.id,getChannelSettings())
  case 'channel.avatar-image':fields(args,['id']);channelRow(args.id);return readChannelAvatar(args.id)
  case 'channel.read-state':return channelReadState(args)
  case 'channel.acknowledge':return acknowledgeChannel(args)
  case 'channel.settings':fields(args,['patch']);return settings(args.patch)
  case 'channel.sources':return listChannelSources(args)
  case 'channel.create':return createConfiguredChannel(args)
  case 'channel.update':return updateConfiguredChannel(args)
  case 'channel.source-add':return addSource(args as ChannelSourceInput)
  case 'channel.source-update':fields(args,['id','patch']);return updateSource(args.id,args.patch)
  case 'channel.source-remove':fields(args,['id']);return updateSource(args.id,{enabled:false})
  case 'channel.posts':fields(args,['channelId','sourceId','saved','query','cursor','limit']);if(args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>100))throw fail('News page limit must be 1–100');return queryChannelPosts(args)
  case 'channel.post':fields(args,['id']);return getChannelPost(args.id)
  case 'channel.save':fields(args,['id','saved']);return savePost(args.id,args.saved)
  case 'channel.delete':fields(args,['id']);return deletePost(args.id)
  case 'channel.collector-add':return addCollector(args)
  case 'channel.collectors':fields(args,[]);return all('SELECT * FROM collectors ORDER BY created_at,id').map(collectorRecord)
  case 'channel.collector-revoke':fields(args,['id']);{const id=text(args.id,'collector ID');run('UPDATE collectors SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',Date.now(),id);changed('sources');return {id,revoked:true}}
  case 'channel.collector-config':return collectorConfig(args)
  case 'channel.media-put':return mediaPut(args as ChannelMediaInput)
  case 'channel.source-image':fields(args,['sourceId']);sourceRow(args.sourceId);return readSourceAvatar(args.sourceId)
  case 'channel.source-avatar-put':{fields(args,['sourceId','name','mimeType','data']);const src=activeSource(args.sourceId),before=sourceAvatar(src.id),result=putSourceAvatar(args as any);if(before?.sha256!==result.sha256)changed('sources',{channelIds:[src.channel_id]});return result}
  case 'channel.publish':return publish(args as ChannelPublishInput)
  default:throw fail('Unknown channel operation')
 }
}
/** Only local channel storage is reclaimed; collector/remote retention is never changed. */
export function pruneChannelNews(now=Date.now()){
 const expired=all("SELECT p.*,s.channel_id FROM posts p JOIN sources s ON s.id=p.source_id WHERE p.state='active' AND p.saved_at IS NULL AND p.expires_at<=?",now)
 for(const row of expired)expire(row,'expired',now)
 for(const asset of all('SELECT m.*,p.state,p.saved_at,p.expires_at AS post_expiry,p.media_ids,p.avatar_media_id FROM media m LEFT JOIN posts p ON p.id=m.post_id')){
  const referenced=asset.state==='active'&&(asset.saved_at!==null||asset.post_expiry>now)&&(JSON.parse(asset.media_ids).includes(asset.id)||asset.avatar_media_id===asset.id)
  if(!referenced&&asset.expires_at<=now){fs.rmSync(path.join(mediaDirectory,asset.file),{force:true});run('DELETE FROM media WHERE id=?',asset.id)}
 }
 run("DELETE FROM posts WHERE state IN ('deleted','expired') AND forget_at<=?",now)
 run("DELETE FROM channel_deliveries WHERE kind='news' AND NOT EXISTS(SELECT 1 FROM posts WHERE posts.id=channel_deliveries.entry_id)")
 run("DELETE FROM channel_user_reads WHERE NOT EXISTS(SELECT 1 FROM posts p WHERE p.id=channel_user_reads.entry_id AND p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?)) AND NOT EXISTS(SELECT 1 FROM channel_messages m WHERE m.id=channel_user_reads.entry_id)",now)
 const known=new Set(all('SELECT file FROM media').map(row=>row.file));for(const name of fs.readdirSync(mediaDirectory))if(!known.has(name))fs.rmSync(path.join(mediaDirectory,name),{force:true})
 if(expired.length){db().exec('PRAGMA wal_checkpoint(TRUNCATE)');changed('posts',{channelIds:[...new Set(expired.map(row=>row.channel_id))]})}
 return {expired:expired.length}
}
export function startChannels(){db();pruneChannelNews();if(!timer){timer=setInterval(()=>{try{pruneChannelNews()}catch(error){console.error('[Channels cleanup]',(error as Error).message)}},60000);timer.unref()}}
export function closeChannels(){if(timer)clearInterval(timer);timer=undefined;closeChannelStore()}
