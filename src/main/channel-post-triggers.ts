import {randomUUID} from 'node:crypto'
import {one,all,run,transaction,changed,liveChannelPost,projectChannelPost} from './channel-store'
import {requireConversation,controlChanged} from './conversation-policy'
import {channelMemberIds} from './channel-members'
import {requestContext,withCaller} from './request-context'
import {readStore} from './store'
import {employeeReady} from '../shared/types'
import {credentialActive} from './agent-access'
import type {PrincipalRef,Delegation} from '../shared/management'
import type {PostTrigger,PostBatchReceipt} from '../shared/message-collaboration'

type Rule=Omit<PostTrigger,'pendingCount'|'remaining'>&{createdBy:PrincipalRef;credentialHash?:string;pendingIds:string[]}
export type PostBatch={id:string;ruleId:string;channelId:string;employeeId:string;ruleRevision:number;prompt:string;postIds:string[];createdBy:PrincipalRef;credentialHash?:string;createdAt:number;state:'pending'|'dispatched'|'cancelled';messageId?:string;error?:string}
const parse=<T>(row:Record<string,any>|undefined):T|undefined=>row?JSON.parse(row.data):undefined
const rules=(channelId?:string)=>all('SELECT data FROM channel_post_rules'+(channelId?' WHERE channel_id=?':''),...(channelId?[channelId]:[])).map(row=>JSON.parse(row.data) as Rule)
const save=(rule:Rule)=>run('INSERT INTO channel_post_rules VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',rule.id,rule.channelId,rule.employeeId,JSON.stringify(rule))
const saveBatch=(batch:PostBatch)=>run('UPDATE channel_post_batches SET data=? WHERE id=?',JSON.stringify(batch),batch.id)
const publicRule=({createdBy:_,credentialHash:__,pendingIds,...rule}:Rule):PostTrigger=>({...rule,pendingCount:pendingIds.length,remaining:rule.everyPosts-pendingIds.length})
function authority(rule:Rule){
 requireConversation('channel:'+rule.channelId,'admin',rule.createdBy)
 if(rule.createdBy.kind==='agent'&&rule.credentialHash&&!credentialActive(rule.createdBy.employeeId,rule.credentialHash))throw Error('Post-count rule creator credential revoked')
 if(!channelMemberIds(rule.channelId).includes(rule.employeeId))throw Error('Post-count target membership revoked')
 const card=readStore().sessions.find(card=>card.id===rule.employeeId&&!card.deleting)
 if(!card||!employeeReady(card))throw Error('Post-count target is not ready')
}
function cancelPending(rule:Rule,reason:string){for(const row of all("SELECT data FROM channel_post_batches WHERE rule_id=? AND json_extract(data,'$.state')='pending'",rule.id)){const batch=JSON.parse(row.data) as PostBatch;batch.state='cancelled';batch.error=reason;saveBatch(batch)}}
function disable(rule:Rule,reason:string){rule.enabled=false;rule.disabledReason=reason;rule.pendingIds=[];rule.revision++;rule.updatedAt=Date.now();save(rule);cancelPending(rule,reason)}
export function reconcilePostTriggers(){for(const rule of rules().filter(rule=>rule.enabled))try{authority(rule)}catch(cause){disable(rule,(cause as Error).message);changed('channels',{channelIds:[rule.channelId]})}}
/** Called in the same transaction that accepts a genuinely new post. No model or Plan call. */
export function recordPostForTriggers(channelId:string,postId:string,publisherId?:string){
 const configured=rules(channelId),configuredIds=new Set(configured.map(rule=>rule.employeeId))
 if(Number(run('INSERT OR IGNORE INTO channel_post_events VALUES(?,?,?)',postId,channelId,Date.now()).changes))for(const rule of configured){
  if(!rule.enabled||rule.employeeId===publisherId)continue
  try{authority(rule)}catch(cause){disable(rule,(cause as Error).message);continue}
  rule.pendingIds.push(postId)
  if(rule.pendingIds.length===rule.everyPosts){
   const batch:PostBatch={id:'cpb_'+randomUUID(),ruleId:rule.id,channelId,employeeId:rule.employeeId,ruleRevision:rule.revision,prompt:rule.prompt,postIds:rule.pendingIds,createdBy:rule.createdBy,credentialHash:rule.credentialHash,createdAt:Date.now(),state:'pending'}
   run('INSERT INTO channel_post_batches VALUES(?,?,?,?,?)',batch.id,rule.id,channelId,rule.employeeId,JSON.stringify(batch));rule.pendingIds=[]
  }
  save(rule)
 }
 // A saved count rule replaces per-post awareness for that Agent, including while paused.
 return channelMemberIds(channelId).filter(id=>id!==publisherId&&!configuredIds.has(id))
}
export function validatePostTriggerDelegation(delegation:Delegation,targetId:string){
 const grant=delegation.channelTrigger
 if(!grant||grant.employeeId!==targetId)throw Error('Invalid channel post-count delegation')
 const batch=parse<PostBatch>(one('SELECT data FROM channel_post_batches WHERE id=?',grant.batchId)),rule=batch&&parse<Rule>(one('SELECT data FROM channel_post_rules WHERE id=?',batch.ruleId))
 if(!batch||!rule||!rule.enabled||rule.revision!==batch.ruleRevision||batch.employeeId!==targetId||batch.channelId!==grant.channelId||batch.messageId!==grant.entryId||batch.state==='cancelled'||JSON.stringify(delegation.requestedBy)!==JSON.stringify(batch.createdBy)||delegation.credentialHash!==batch.credentialHash)throw Error('Channel post-count authorization changed or was revoked')
 authority(rule)
 const delivery=one("SELECT mode FROM channel_deliveries WHERE channel_id=? AND entry_id=? AND employee_id=?",batch.channelId,batch.messageId!,targetId)
 if(delivery?.mode!=='work')throw Error('Batch was not assigned to this employee')
}
export function postBatchMetadata(batch:PostBatch):PostBatchReceipt{return {ruleId:batch.ruleId,batchId:batch.id,employeeId:batch.employeeId,postCount:batch.postIds.length,automatic:true}}
function readScope(channelId:string,employee?:string){
 const scope=requireConversation('channel:'+channelId),principal=requestContext().principal,admin=principal.kind==='operator'||['owner','admin'].includes(scope.role(principal.employeeId)??'')
 if(!admin&&employee!==undefined&&principal.kind==='agent'&&employee!==principal.employeeId)throw Error('Members may read only their own post-count configuration')
 return {scope,employee:admin?employee:principal.kind==='agent'?principal.employeeId:undefined,admin}
}
export function postTriggerRequest(command:string,args:Record<string,any>){
 const reading=command==='channel.post-trigger-list'||command==='channel.post-trigger-history'||command==='channel.post-trigger-batch'
 if(!reading)requireConversation('channel:'+args.id,'admin')
 const scope=readScope(args.id,args.employee)
 if(command==='channel.post-trigger-list')return {channelId:args.id,rules:rules(args.id).filter(rule=>!scope.employee||rule.employeeId===scope.employee).map(publicRule),canManage:scope.admin}
 const offset=args.offset??0,limit=args.limit??30
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Use a nonnegative offset and limit 1–100')
 if(command==='channel.post-trigger-history'){
  const rows=all('SELECT data FROM channel_post_batches WHERE channel_id=?'+(scope.employee?' AND employee_id=?':'')+' ORDER BY rowid DESC',args.id,...(scope.employee?[scope.employee]:[])).map(row=>JSON.parse(row.data) as PostBatch)
  return {rows:rows.slice(offset,offset+limit).map(batch=>{const delivery=batch.messageId?one('SELECT status,error FROM channel_deliveries WHERE channel_id=? AND entry_id=? AND employee_id=?',batch.channelId,batch.messageId,batch.employeeId):undefined;return {id:batch.id,ruleId:batch.ruleId,employeeId:batch.employeeId,postCount:batch.postIds.length,createdAt:batch.createdAt,state:delivery?.status??batch.state,error:delivery?.error??batch.error,messageId:batch.messageId}}),total:rows.length,offset,hasMore:offset+limit<rows.length}
 }
 if(command==='channel.post-trigger-batch'){
  const batch=parse<PostBatch>(one('SELECT data FROM channel_post_batches WHERE id=? AND channel_id=?',String(args.batchId),args.id))
  if(!batch||scope.employee&&batch.employeeId!==scope.employee)throw Error('Unknown post batch for this caller')
  return {id:batch.id,channelId:batch.channelId,employeeId:batch.employeeId,prompt:batch.prompt,total:batch.postIds.length,offset,hasMore:offset+limit<batch.postIds.length,posts:batch.postIds.slice(offset,offset+limit).map(id=>{try{const row=liveChannelPost(id);if(row.channel_id!==batch.channelId)throw Error('Post moved to another channel');const {saved:_,savedAt:__,...post}=projectChannelPost(row);return {id,available:true,post,entryApi:{command:'conversation.entry',args:{conversation:'channel:'+batch.channelId,id}}}}catch(error){return {id,available:false,error:(error as Error).message}}})}
 }
 if(typeof args.employee!=='string'||command==='channel.post-trigger-set'&&!scope.scope.members.includes(args.employee))throw Error('Choose a current channel member')
 const current=rules(args.id).find(rule=>rule.employeeId===args.employee)
 if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision!==(current?.revision??0))throw Error('Post-count configuration changed; reload before saving')
 if(command==='channel.post-trigger-remove'){
  if(!current)throw Error('No post-count configuration for this employee')
  transaction(()=>{cancelPending(current,'Post-count rule removed');run('DELETE FROM channel_post_rules WHERE id=?',current.id)});controlChanged('channel:'+args.id);return {removed:true,id:current.id}
 }
 if(command!=='channel.post-trigger-set')throw Error('Unknown channel post-count operation')
 if(!Number.isSafeInteger(args.everyPosts)||args.everyPosts<1||args.everyPosts>10000||typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>16000||typeof args.enabled!=='boolean')throw Error('Provide everyPosts 1–10000, prompt 1–16000 characters and enabled boolean')
 const caller=requestContext(),now=Date.now(),rule:Rule={id:current?.id??'cpr_'+randomUUID(),channelId:args.id,employeeId:args.employee,everyPosts:args.everyPosts,prompt:args.prompt.trim(),enabled:args.enabled,revision:(current?.revision??0)+1,pendingIds:[],createdBy:caller.principal,credentialHash:caller.credentialHash,createdAt:current?.createdAt??now,updatedAt:now}
 if(rule.enabled)authority(rule)
 transaction(()=>{if(current)cancelPending(current,'Post-count rule edited');save(rule)})
 controlChanged('channel:'+args.id);return publicRule(rule)
}
let timer:ReturnType<typeof setInterval>|undefined,pumping:Promise<void>|undefined,stopped=true
export function pumpPostTriggers(){
 if(stopped||pumping)return pumping
 pumping=(async()=>{
  reconcilePostTriggers()
  const {publishChannelTriggerRequest,routeChannelTrigger}=await import('./channel-discussion')
  for(const row of all("SELECT data FROM (SELECT data,rowid,ROW_NUMBER() OVER(PARTITION BY employee_id ORDER BY rowid) AS position FROM channel_post_batches WHERE json_extract(data,'$.state')='pending') WHERE position=1 ORDER BY rowid LIMIT 200")){
   if(stopped)break
   const batch=JSON.parse(row.data) as PostBatch,rule=parse<Rule>(one('SELECT data FROM channel_post_rules WHERE id=?',batch.ruleId))
   try{
    if(!rule||!rule.enabled||rule.revision!==batch.ruleRevision)throw Error('Post-count rule changed')
    authority(rule)
    if(batch.messageId){const delivered=one('SELECT status FROM channel_deliveries WHERE channel_id=? AND entry_id=? AND employee_id=?',batch.channelId,batch.messageId,batch.employeeId);if(delivered&&delivered.status!=='pending'){batch.state='dispatched';saveBatch(batch);continue}}
    // One active count-triggered task per employee; exact pending batches stay durable.
    if(one("SELECT 1 FROM channel_post_batches b JOIN channel_deliveries d ON d.entry_id=json_extract(b.data,'$.messageId') AND d.employee_id=b.employee_id WHERE b.employee_id=? AND b.id!=? AND d.status IN ('routing','queued','running')",batch.employeeId,batch.id))continue
    await withCaller({principal:batch.createdBy,credentialHash:batch.credentialHash,requestId:batch.id},async()=>{
     batch.messageId=publishChannelTriggerRequest(batch).id;saveBatch(batch)
     await routeChannelTrigger(batch);batch.state='dispatched';saveBatch(batch)
    })
   }catch(error){batch.state='cancelled';batch.error=(error as Error).message;saveBatch(batch)}
   changed('channels',{channelIds:[batch.channelId]})
  }
 })().catch(error=>console.error('[Channel post-count]',error.message)).finally(()=>{pumping=undefined})
 return pumping
}
export function startPostTriggers(){stopped=false;void pumpPostTriggers();timer=setInterval(()=>void pumpPostTriggers(),1000);timer.unref()}
export async function stopPostTriggers(){stopped=true;clearInterval(timer);timer=undefined;await pumping}
