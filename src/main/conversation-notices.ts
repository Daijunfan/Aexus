import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync,type SQLInputValue} from 'node:sqlite'
import {randomUUID,createHash} from 'node:crypto'
import {APP_HOME} from '../shared/protocol'
import type {RequestContext} from '../shared/management'
import type {ConversationNotice,NoticeSpec,NoticeOccurrence,NoticeReceipt} from '../shared/conversation-controls'
import {CONVERSATION_CONTROL_APIS} from '../shared/conversation-control-schema'
import {noticeRule,noticeInstant,nextNoticeAt,noticePreview} from './conversation-notice-time'
import {requireConversation,requireConversationPublisher,conversationPolicy,changeConversationRole,changeConversationMember,conversationAudit,moderateConversation} from './conversation-policy'
import {requestContext} from './request-context'
import {credentialActive} from './agent-access'
import {publishGroupNotice} from './chat-groups'
import {publishChannelNotice,syncConversationChannelMembers} from './channel-discussion'

/** Static conversation text only. No scheduler, Plan, session or model dependency. */
type RecordNotice=ConversationNotice&{credentialHash?:string;requestKey:string;fingerprint:string;deleted?:boolean}
type Row=Record<string,any>
let connection:DatabaseSync|undefined,timer:ReturnType<typeof setInterval>|undefined,emitter:(channel:string,payload:unknown)=>void=()=>{}
function db(){if(connection)return connection;fs.mkdirSync(APP_HOME,{recursive:true,mode:0o700});const file=path.join(APP_HOME,'conversation-notices.sqlite');connection=new DatabaseSync(file);fs.chmodSync(file,0o600);connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY,conversation TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notices_conversation ON notices(conversation);
CREATE INDEX IF NOT EXISTS notices_active ON notices(json_extract(data,'$.enabled'),json_extract(data,'$.deleted'));
CREATE TABLE IF NOT EXISTS occurrences(id TEXT PRIMARY KEY,notice_id TEXT NOT NULL,conversation TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS occurrences_conversation ON occurrences(conversation,notice_id);
CREATE INDEX IF NOT EXISTS occurrences_pending ON occurrences(notice_id,json_extract(data,'$.status'));
CREATE TABLE IF NOT EXISTS notice_requests(key TEXT PRIMARY KEY,notice_id TEXT NOT NULL,fingerprint TEXT NOT NULL);`);return connection}
const all=(sql:string,...args:SQLInputValue[])=>db().prepare(sql).all(...args) as Row[]
const one=(sql:string,...args:SQLInputValue[])=>db().prepare(sql).get(...args) as Row|undefined
const run=(sql:string,...args:SQLInputValue[])=>db().prepare(sql).run(...args)
const jobs=(active=false)=>all('SELECT data FROM notices'+(active?" WHERE json_extract(data,'$.enabled')=1 AND COALESCE(json_extract(data,'$.deleted'),0)=0":'')).map(row=>JSON.parse(row.data) as RecordNotice)
const save=(job:RecordNotice)=>run('INSERT INTO notices VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',job.id,job.conversation,JSON.stringify(job))
const occurrence=(value:NoticeOccurrence,conversation:string)=>run('INSERT INTO occurrences VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',value.id,value.noticeId,conversation,JSON.stringify(value))
const pendingItems=(id:string)=>all("SELECT data FROM occurrences WHERE notice_id=? AND json_extract(data,'$.status')='pending'",id).map(row=>JSON.parse(row.data) as NoticeOccurrence)
const history=(conversation:string,id?:string)=>all('SELECT data FROM occurrences WHERE conversation=?'+(id?' AND notice_id=?':'')+' ORDER BY rowid DESC',conversation,...(id?[id]:[])).map(row=>JSON.parse(row.data) as NoticeOccurrence)
function publicNotice(job:RecordNotice):ConversationNotice{const {credentialHash,requestKey,fingerprint,deleted,...value}=job;return value}
const announce=(conversation:string)=>emitter('conversation:controls',{conversation})
function authority(job:RecordNotice){
 requireConversation(job.conversation,'admin',job.createdBy)
 if(job.createdBy.kind==='agent'&&job.credentialHash&&!credentialActive(job.createdBy.employeeId,job.credentialHash))throw Error('Notification creator credential was revoked')
 return requireConversationPublisher(job.conversation,job.publisherId)
}
function cancelPending(job:RecordNotice,error:string){for(const item of pendingItems(job.id))occurrence({...item,status:'cancelled',error},job.conversation)}
export function reconcileConversationNotices(){
 if(!connection&&!fs.existsSync(path.join(APP_HOME,'conversation-notices.sqlite')))return
 for(const job of jobs(true)){try{authority(job)}catch(cause){job.enabled=false;job.status='attention';job.disabledReason=(cause as Error).message;job.revision++;job.updatedAt=Date.now();save(job);cancelPending(job,job.disabledReason);announce(job.conversation)}}
}
function readJob(conversation:string,id:unknown,deleted=false){if(typeof id!=='string'||!/^cn_[a-f\d-]{36}$/.test(id))throw Error('Choose a conversation notification ID, not a Plan schedule ID');const row=one('SELECT data FROM notices WHERE id=? AND conversation=?',id,conversation),job=row&&JSON.parse(row.data) as RecordNotice;if(!job||job.deleted&&!deleted)throw Error('Unknown conversation notification');return job}
function fields(value:unknown,keys:string[]):asserts value is Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error('Unknown conversation notification fields; Plan actions, prompts and employee tasks are not accepted')}
function spec(value:unknown):NoticeSpec{
 fields(value,['name','text','publisherId','rule','enabled'])
 for(const [key,max] of [['name',120],['text',2000],['publisherId',160]] as const)if(typeof value[key]!=='string'||!value[key].trim()||value[key]!==value[key].trim()||Array.from(value[key]).length>max)throw Error('Provide '+key+' (maximum '+max+' characters)')
 if(typeof value.enabled!=='boolean')throw Error('enabled must be boolean')
 return {name:value.name,text:value.text,publisherId:value.publisherId,rule:noticeRule(value.rule),enabled:value.enabled}
}
const revision=(job:RecordNotice,value:unknown)=>{if(!Number.isSafeInteger(value)||value!==job.revision)throw Error('Notification changed; reload before saving')}
function validatePublisher(conversation:string,publisherId:string,caller:RequestContext){requireConversationPublisher(conversation,publisherId);if(caller.principal.kind==='agent'&&caller.principal.employeeId!==publisherId)throw Error('Agents publish their own notifications; choose your own employee ID')}
/** Public dispatcher is separate from conversation files and from every Plan command. */
export function conversationControlRequest(command:string,args:Record<string,any>){
 if(!CONVERSATION_CONTROL_APIS.has(command))throw Error('Unknown conversation control command')
 const allowed:Record<string,string[]>={policy:[],member:['employee','action','expectedRevision'],audit:['before','limit'],role:['employee','role','expectedRevision'],mute:['member','muted','durationSeconds','expectedRevision'],silence:['silent','expectedRevision'],'notice-list':['offset','limit'],'notice-get':['id'],'notice-create':['spec','clientRequestId'],'notice-update':['id','patch','expectedRevision'],'notice-delete':['id','expectedRevision'],'notice-preview':['rule','from'],'notice-history':['id','offset','limit']}
 const op=command.slice('conversation.'.length);fields(args,['conversation',...allowed[op]])
 const current=requireConversation(args.conversation,op==='policy'?'read':'admin'),conversation=current.conversation,caller=requestContext()
 if(op==='policy')return conversationPolicy(conversation)
 if(op==='role'){const result=changeConversationRole(args);if(current.kind==='channel')syncConversationChannelMembers(current.id);return result}
 if(op==='member'){const result=changeConversationMember(args);if(current.kind==='channel')syncConversationChannelMembers(current.id);return result}
 if(op==='audit')return conversationAudit(args)
 if(op==='mute'||op==='silence')return moderateConversation(args,op==='silence')
 reconcileConversationNotices()
 if(op==='notice-preview')return {occurrences:noticePreview(noticeRule(args.rule),args.from===undefined?Date.now():Date.parse(noticeInstant(args.from))),policy:'No Plan task or agent execution. Calendar reminders resolve DST once, using compatible local time.'}
 if(op==='notice-list'||op==='notice-history'){
  const offset=args.offset??0,limit=args.limit??30;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Choose nonnegative offset and limit 1–100')
  if(args.id!==undefined)readJob(conversation,args.id,true)
  const rows=op==='notice-list'?jobs().filter(job=>!job.deleted&&job.conversation===conversation).sort((a,b)=>b.createdAt-a.createdAt).map(publicNotice):history(conversation,args.id)
  return {rows:rows.slice(offset,offset+limit),total:rows.length,offset,hasMore:offset+limit<rows.length}
 }
 if(op==='notice-get')return publicNotice(readJob(conversation,args.id))
 if(op==='notice-create'){
  const input=spec(args.spec);validatePublisher(conversation,input.publisherId,caller)
  if(typeof args.clientRequestId!=='string'||!args.clientRequestId.trim()||args.clientRequestId.length>120)throw Error('Provide a stable clientRequestId for retries')
  const requestKey=JSON.stringify([conversation,caller.principal,args.clientRequestId]),fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex'),previous=one('SELECT * FROM notice_requests WHERE key=?',requestKey)
  if(previous){if(previous.fingerprint!==fingerprint)throw Error('Notification request ID already used with different content');return publicNotice(readJob(conversation,previous.notice_id))}
  const now=Date.now(),nextAt=nextNoticeAt(input.rule,now);if(!nextAt)throw Error('Choose a future notification time')
  const job:RecordNotice={...input,id:'cn_'+randomUUID(),conversation,revision:1,createdAt:now,updatedAt:now,createdBy:caller.principal,credentialHash:caller.credentialHash,requestKey,fingerprint,nextAt,status:input.enabled?'scheduled':'paused'}
  db().exec('BEGIN IMMEDIATE');try{save(job);run('INSERT INTO notice_requests VALUES(?,?,?)',requestKey,job.id,fingerprint);db().exec('COMMIT')}catch(error){db().exec('ROLLBACK');throw error}
  announce(conversation);return publicNotice(job)
 }
 const job=readJob(conversation,args.id);revision(job,args.expectedRevision)
 if(op==='notice-delete'){job.deleted=true;job.enabled=false;job.status='completed';job.revision++;job.updatedAt=Date.now();save(job);cancelPending(job,'Notification deleted');announce(conversation);return {id:job.id,removed:true}}
 fields(args.patch,['name','text','publisherId','rule','enabled']);const next=spec({name:job.name,text:job.text,publisherId:job.publisherId,rule:job.rule,enabled:job.enabled,...args.patch})
 return updateNotice(job,next,args.patch,caller)
}
function updateNotice(job:RecordNotice,next:NoticeSpec,patch:Record<string,any>,caller:RequestContext){
 if(next.publisherId!==job.publisherId)validatePublisher(job.conversation,next.publisherId,caller)
 else if(next.enabled)requireConversationPublisher(job.conversation,next.publisherId)
 const changedTiming=patch.rule!==undefined||next.enabled&&!job.enabled
 const nextAt=changedTiming?nextNoticeAt(next.rule,Date.now()):job.nextAt
 if(next.enabled&&!nextAt)throw Error('Choose a future time before enabling a completed notification')
 const value:RecordNotice={...job,...next,nextAt,status:next.enabled?'scheduled':'paused',createdBy:job.createdBy,revision:job.revision+1,updatedAt:Date.now()}
 // Administrative edits never launder a revoked creator. A new notice needs a new explicit create.
 if(next.enabled)authority(value)
 delete value.disabledReason;save(value);cancelPending(job,'Notification updated');announce(job.conversation);return publicNotice(value)
}
function dispatch(job:RecordNotice,item:NoticeOccurrence){
 const current=authority(job),receipt:NoticeReceipt={noticeId:job.id,occurrenceId:item.id,scheduledFor:item.scheduledFor,automatic:true,silent:current.silent}
 const message=current.kind==='group'?publishGroupNotice(current.id,job.text,job.publisherId,receipt):publishChannelNotice(current.id,job.text,job.publisherId,receipt)
 occurrence({...item,status:'published',messageId:message.id,publishedAt:Date.now()},job.conversation)
 if(!current.silent)emitter('conversation:notification',{conversation:job.conversation,name:current.name,messageId:message.id,noticeId:job.id})
}
/** Durable outbox: a crash after publication reuses the same occurrence/message ID. */
export function tickConversationNotices(now=Date.now()){
 reconcileConversationNotices()
 let budget=50
 const work=all("SELECT data FROM notices WHERE COALESCE(json_extract(data,'$.deleted'),0)=0 AND (json_extract(data,'$.enabled')=1 OR id IN (SELECT notice_id FROM occurrences WHERE json_extract(data,'$.status')='pending'))").map(row=>JSON.parse(row.data) as RecordNotice)
 for(const job of work){
  if(job.deleted||budget<=0)continue
  for(const pending of pendingItems(job.id)){if(budget--<=0)break;try{dispatch(job,pending)}catch(cause){occurrence({...pending,status:'cancelled',error:(cause as Error).message},job.conversation)}}
  if(!job.enabled||!job.nextAt||Date.parse(job.nextAt)>now||budget--<=0)continue
  const at=job.nextAt,id='notice_'+createHash('sha256').update(job.id+'\n'+at).digest('hex').slice(0,40),missed=job.rule.kind!=='once'&&now-Date.parse(at)>60000
  const item:NoticeOccurrence={id,noticeId:job.id,scheduledFor:at,status:missed?'skipped':'pending',...(missed?{error:'Missed recurring window; no backlog replay'}:{})}
  const nextAt=nextNoticeAt(job.rule,now);job.nextAt=nextAt;if(!nextAt){job.enabled=false;job.status='completed'}
  db().exec('BEGIN IMMEDIATE');try{occurrence(item,job.conversation);save(job);db().exec('COMMIT')}catch(error){db().exec('ROLLBACK');throw error}
  if(!missed)try{dispatch(job,item)}catch(cause){occurrence({...item,status:'cancelled',error:(cause as Error).message},job.conversation);job.enabled=false;job.status='attention';job.disabledReason=(cause as Error).message;job.revision++;save(job)}
  announce(job.conversation)
 }
}
export function startConversationNotices(emit:typeof emitter){emitter=emit;const tick=()=>{try{tickConversationNotices()}catch(cause){console.error('[Conversation notices]',(cause as Error).message)}};tick();timer=setInterval(tick,1000);timer.unref()}
export function stopConversationNotices(){clearInterval(timer);timer=undefined;connection?.close();connection=undefined;emitter=()=>{}}
