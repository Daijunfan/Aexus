import {conversationMuted} from './conversation-policy'
import {cloudHostTarget} from './cloud-hosts'
import {createHash,randomUUID} from 'node:crypto'
import {isIP} from 'node:net'
import type {ChannelEngine,ChannelEngineInput,ChannelCollector,ChannelAvatarInput,ChannelConnection,ChannelSettings} from '../shared/channels'
import {all,one,run,type Row} from './channel-store'
import {readStore} from './store'
import {requestContext,isAppAdministrator} from './authorization'
import {validatedChannelImage} from './channel-avatars'

const fail=(message:string,code='INVALID_CHANNEL_ENGINE',status=400)=>Object.assign(Error(message),{code,status})
const text=(value:unknown,label:string,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw fail('Provide a valid '+label);return value.trim()}
const fields=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(value[key]!==undefined&&!keys.includes(key))throw fail('Unknown engine field: '+key)}
const members=(id:string)=>{const row=one('SELECT admin_ids FROM channels WHERE id=?',id);if(!row)throw fail('Unknown news channel','CHANNEL_NOT_FOUND',404);const existing=new Set(readStore().sessions.filter(card=>!card.deleting).map(card=>card.id));return (JSON.parse(row.admin_ids) as string[]).filter(id=>existing.has(id))}

/** Missing configuration is a legacy external connection, not a fabricated localhost deployment. */
export function channelEngine(id:string):ChannelEngine{
 const stored=one('SELECT config FROM channel_engines WHERE channel_id=?',id)
 const engine=stored?JSON.parse(stored.config):{kind:'external',location:'unconfigured'}
 return engine.kind==='employees'?{kind:'employees',employeeIds:members(id)}:engine
}
export function validateChannelEngine(value:unknown):ChannelEngineInput{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('Choose a channel publishing engine')
 const input=value as Record<string,any>
 if(input.kind==='employees'){
  fields(input,['kind','employeeIds'])
  if(!Array.isArray(input.employeeIds)||!input.employeeIds.length||input.employeeIds.length>200||input.employeeIds.some(id=>typeof id!=='string'))throw fail('Choose 1–200 existing publishing employees')
  const ids=[...new Set<string>(input.employeeIds)],store=readStore()
  for(const id of ids)if(!store.sessions.some(card=>card.id===id&&!card.deleting))throw fail('Unknown publishing employee: '+id)
  return {kind:'employees',employeeIds:ids}
 }
 fields(input,['kind','location','name','host','endpoint','collectorId','fileStorage'])
 if(input.kind!=='external'||!['local','remote'].includes(input.location))throw fail('Choose a local or remote external process')
 const name=text(input.name,'process name'),host=input.location==='local'?'127.0.0.1':text(input.host,'process IP address or hostname',253)
 if(!isIP(host)&&!(/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(host)&&host.split('.').every(part=>part.length>0&&part.length<=63&&!part.startsWith('-')&&!part.endsWith('-'))))throw fail('Use a process IP address or hostname, without a URL or login')
 let endpoint:string|undefined
 if(input.endpoint!==undefined&&input.endpoint!==''){
  let url:URL;try{url=new URL(text(input.endpoint,'Core receiver URL',4096))}catch{throw fail('Use a valid Core receiver URL')}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)||url.username||url.password||url.search||url.hash||!['/','/api/channels/collector'].includes(url.pathname))throw fail('Use HTTPS or an HTTP loopback tunnel for the Core receiver, without credentials or query parameters')
  endpoint=url.origin+'/api/channels/collector'
 }
 if(input.location==='remote'&&!endpoint)throw fail('Provide the Core receiver URL reachable from the remote process')
 const collectorId=input.collectorId===undefined?undefined:text(input.collectorId,'collector ID')
 if(collectorId&&!one('SELECT id FROM collectors WHERE id=? AND revoked_at IS NULL',collectorId))throw fail('Choose an active collector credential')
 const fileStorage=input.fileStorage
 if(fileStorage){if(input.location!=='remote'||typeof fileStorage!=='object'||Object.keys(fileStorage).some(key=>!['hostId','directory'].includes(key)))throw fail('Cloud documents need a registered host and media directory');cloudHostTarget(text(fileStorage.hostId,'file host ID'),text(fileStorage.directory,'cloud media directory',4096))}
 return {kind:'external',location:input.location,name,host,...(endpoint?{endpoint}:{}),...(collectorId?{collectorId}:{}),...(fileStorage?{fileStorage:{hostId:fileStorage.hostId,directory:fileStorage.directory}}:{})}
}
export function storeChannelEngine(id:string,engine:ChannelEngineInput|ChannelEngine){
 const previous=one('SELECT config FROM channel_engines WHERE channel_id=?',id)
 if(previous&&JSON.parse(previous.config).kind!==engine.kind||!previous&&engine.kind==='employees'&&one("SELECT 1 FROM sources WHERE channel_id=? AND plugin!='employee'",id))throw fail('A channel cannot change its publishing engine type; create a new channel')
 run('INSERT INTO channel_engines VALUES(?,?) ON CONFLICT(channel_id) DO UPDATE SET config=excluded.config',id,JSON.stringify(engine.kind==='employees'?{kind:'employees'}:engine))
}
/** Called inside channel creation/membership transactions. Removed members retain history, not publishing access. */
export function syncEmployeeSources(id:string){
 const engine=channelEngine(id);if(engine.kind!=='employees')return
 run("UPDATE sources SET enabled=0 WHERE channel_id=? AND plugin='employee'",id)
 const store=readStore(),now=Date.now()
 for(const employeeId of engine.employeeIds){
  const employee=store.sessions.find(card=>card.id===employeeId)!,target='employee:'+id+':'+employeeId,sourceId='ns_'+createHash('sha256').update(target).digest('hex')
  run("INSERT INTO sources(id,plugin,target_id,locator,name,enabled,poll_seconds,channel_id,created_at,updated_at) VALUES(?,'employee',?,?,?,1,0,?,?,?) ON CONFLICT(plugin,target_id) DO UPDATE SET enabled=1,name=excluded.name,updated_at=excluded.updated_at",sourceId,target,'employee:'+employeeId,employee.title,id,now,now)
  run('INSERT OR IGNORE INTO channel_source_owners VALUES(?,?)',sourceId,employeeId)
 }
}
export function createProcessSource(id:string,name:string){
 const sourceId='ns_'+randomUUID(),now=Date.now()
 run("INSERT INTO sources(id,plugin,target_id,locator,name,enabled,poll_seconds,channel_id,created_at,updated_at) VALUES(?,'process',?,?,?,1,60,?,?,?)",sourceId,'process:'+id,'process:'+id,name,id,now,now)
 return sourceId
}
export function employeePublishingSource(id:unknown){
 const channelId=text(id,'channel ID'),principal=requestContext().principal,engine=channelEngine(channelId)
 if(principal.kind!=='agent'||engine.kind!=='employees'||!engine.employeeIds.includes(principal.employeeId))throw fail('Only a current employee publisher may publish to this channel','CHANNEL_PUBLISH_FORBIDDEN',403)
 if(conversationMuted('channel:'+channelId,principal.employeeId)!==undefined)throw fail('You are muted in this channel','CHANNEL_PUBLISH_FORBIDDEN',403)
 const row=one('SELECT s.* FROM sources s JOIN channel_source_owners o ON o.source_id=s.id WHERE s.channel_id=? AND o.employee_id=?',channelId,principal.employeeId)
 if(!row)throw fail('Employee publishing source is unavailable')
 return row
}
export function sourceEmployee(sourceId:string):string|undefined{return one('SELECT employee_id FROM channel_source_owners WHERE source_id=?',sourceId)?.employee_id}
/** A wildcard collector never acquires employee or another explicitly bound process's sources. */
export function collectorAllowsSource(row:Row,collector:ChannelCollector){
 if(row.plugin==='employee')return false
 const engine=channelEngine(row.channel_id)
 return engine.kind==='external'&&(engine.collectorId?engine.collectorId===collector.id:collector.sourceIds==='all'||collector.sourceIds.includes(row.id))
}
export function authorizeSourcePublisher(row:Row){
 const principal=requestContext().principal
 if(row.plugin==='employee'){
  const expected=employeePublishingSource(row.channel_id)
  if(expected.id!==row.id)throw fail('Cannot publish as another employee','CHANNEL_PUBLISH_FORBIDDEN',403)
 }else if(!isAppAdministrator(principal))throw fail('An employee cannot publish an external process source','CHANNEL_PUBLISH_FORBIDDEN',403)
}
export function assertExternalChannel(id:string){if(channelEngine(id).kind!=='external')throw fail('External sources cannot be routed into an employee publishing channel')}
export function recordCollectorActivity(id:string){run('INSERT INTO collector_activity VALUES(?,?) ON CONFLICT(collector_id) DO UPDATE SET last_seen_at=excluded.last_seen_at',id,Date.now())}
export function channelConnection(id:string,listener:ChannelSettings):ChannelConnection{
 const engine=channelEngine(id),external=engine.kind==='external'?engine:undefined,collectorId=external?.collectorId,collector=collectorId?one('SELECT revoked_at FROM collectors WHERE id=?',collectorId):undefined,lastSeenAt=collectorId?one('SELECT last_seen_at FROM collector_activity WHERE collector_id=?',collectorId)?.last_seen_at:undefined
 return {channelId:id,engine,listener,...(external?{endpoint:external.endpoint??`http://127.0.0.1:${listener.port}/api/channels/collector`}:{}),...(collectorId?{collectorId}:{}),...(lastSeenAt?{lastSeenAt}:{}),status:!external?'internal':!collectorId?'unconfigured':!collector||collector.revoked_at!==null?'revoked':lastSeenAt?'seen':'waiting',sources:all('SELECT id,plugin,name FROM sources WHERE channel_id=? AND enabled=1',id).map(row=>({sourceId:row.id,plugin:row.plugin,name:row.name})),publication:{command:'channel.publish',...(!external?{channelId:id}:{})},...(!external?{schedule:{command:'schedule.create',guidance:'Schedule a selected employee using the existing scheduler. The task should collect/coordinate work and explicitly call channel.publish with this channelId, a stable externalId and the original publishedAt. Creating this channel does not start a job.'}}:{})}
}
export function putChannelAvatar(id:string,input:ChannelAvatarInput|null){
 if(input===null){run('DELETE FROM channel_avatars WHERE channel_id=?',id);return}
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Upload a channel image')
 fields(input,['name','mimeType','data']);const image=validatedChannelImage(input)
 run('INSERT INTO channel_avatars VALUES(?,?,?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET name=excluded.name,mime_type=excluded.mime_type,data=excluded.data,sha256=excluded.sha256,updated_at=excluded.updated_at',id,input.name.trim(),input.mimeType,image.data,image.sha256,Date.now())
}
export function customChannelAvatar(id:string){const row=one('SELECT sha256 FROM channel_avatars WHERE channel_id=?',id);return row?{channelId:id,sourceId:id,sha256:String(row.sha256)}:undefined}
export function readChannelAvatar(id:string){const row=one('SELECT data,mime_type,name FROM channel_avatars WHERE channel_id=?',id);if(!row)throw fail('Channel avatar is unavailable','CHANNEL_AVATAR_NOT_FOUND',404);return {data:Buffer.from(row.data).toString('base64'),mimeType:row.mime_type,name:row.name}}
