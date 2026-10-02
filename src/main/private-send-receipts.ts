import {createHash,randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {APP_HOME} from '../shared/protocol'
import type {PrincipalRef} from '../shared/management'
import {attachmentPaths} from '../shared/message-attachments'
import {quoteShape} from '../shared/message-quotes'
import {atomicJson,readJson} from './atomic-file'
import {authorize,requestContext} from './authorization'
import {assertEmployeeReady} from './initialization-state'
import {readStore} from './store'

export type PrivateSendReceipt={sent:true;status:'accepted'|'queued';employeeId:string;clientMessageId:string;messageId?:string;queueId?:string;id?:string}
type Receipt={principal:PrincipalRef;clientMessageId:string;fingerprint:string;phase:'preparing'|'rejected'|'queued'|'dispatching'|'accepted'|'interrupted';boot:string;createdAt:number;messageId?:string;queueId?:string;error?:string}
export type PrivateSendAttempt={readonly queueId?:string;queued:(id:string)=>void;dispatching:(id:string)=>void;accepted:(id:string)=>void;failed:(error:unknown)=>void;interrupted:(reason:string)=>void}
type QueueCheck=(employeeId:string,queueId:string)=>boolean
const boot=randomUUID(),active=new Map<string,Promise<PrivateSendReceipt>>()
const failure=(message:string,code:'PRIVATE_SEND_UNCERTAIN'|'PRIVATE_SEND_INTERRUPTED')=>Object.assign(Error(message),{code})
const path=(employeeId:string)=>join(APP_HOME,'message-receipts',employeeId+'.json')
const read=(employeeId:string)=>readJson<Record<string,Receipt>>(path(employeeId),()=>({}),value=>!!value&&typeof value==='object'&&!Array.isArray(value))
const identify=(employeeId:string,clientMessageId:unknown)=>{
 if(typeof clientMessageId!=='string'||!clientMessageId||clientMessageId!==clientMessageId.trim()||clientMessageId.length>160)throw Error('Provide a nonempty clientMessageId of at most 160 characters')
 const principal=requestContext().principal,key=createHash('sha256').update(JSON.stringify([principal.kind,principal.kind==='agent'?principal.employeeId:null,clientMessageId])).digest('hex')
 return {employeeId,clientMessageId,principal,key,activeKey:employeeId+'/'+key}
}
function readable(employeeId:string){
 if(!readStore().sessions.some(card=>card.id===employeeId&&!card.deleting))throw Error('Unknown employee conversation')
 authorize('session.send',{id:employeeId},employeeId);assertEmployeeReady(employeeId)
}
function confirmation(employeeId:string,record:Receipt,queued:QueueCheck):PrivateSendReceipt{
 if(record.phase==='interrupted'||record.phase==='queued'&&(record.boot!==boot||!record.queueId||!queued(employeeId,record.queueId)))throw failure(record.error??'The earlier private message queue was interrupted. It was not replayed; check the conversation before starting a new request.','PRIVATE_SEND_INTERRUPTED')
 if(record.phase!=='accepted'&&record.phase!=='queued')throw failure('The earlier private message dispatch is uncertain. Check the conversation before starting a new request; it was not replayed.','PRIVATE_SEND_UNCERTAIN')
 return {sent:true,status:record.phase,employeeId,clientMessageId:record.clientMessageId,...(record.messageId?{messageId:record.messageId}:{}),...(record.queueId?{queueId:record.queueId,id:record.queueId}:{})}
}
/** Read a confirmation with current authority; no engine startup or source/attachment reads. */
export function lookupPrivateSendReceipt(employeeId:string,clientMessageId:string,queued:QueueCheck):PrivateSendReceipt|undefined{
 readable(employeeId);const identity=identify(employeeId,clientMessageId),record=read(employeeId)[identity.key]
 if(!record||record.phase==='preparing'||record.phase==='rejected')return undefined
 return confirmation(employeeId,record,queued)
}
function fingerprint(employeeId:string,args:Record<string,any>){
 const text=args.text??'',images=args.images===undefined?[]:args.images,files=attachmentPaths(args.files)
 if(typeof text!=='string'||!Array.isArray(images)||images.some(value=>typeof value!=='string')||images.length+files.length>16)throw Error('Invalid private message text or attachments')
 if(text.trimStart().startsWith('/'))throw Error('clientMessageId applies to regular private messages, not slash commands')
 const source=args.replyConversation===`employee:${employeeId}`?undefined:args.replyConversation,quote=args.replyQuote===undefined?undefined:quoteShape(args.replyQuote)
 return createHash('sha256').update(JSON.stringify([text,images,files,args.viewId??null,args.replyTo??null,quote?[quote.text,quote.offset]:null,source??null,source?!!args.replyTextOnly:false])).digest('hex')
}
/** Persist before any dispatch; an unfinished dispatch is never automatically repeated. */
export async function withPrivateSendReceipt(employeeId:string,args:Record<string,any>,work:(attempt:PrivateSendAttempt)=>Promise<unknown>,queued:QueueCheck):Promise<PrivateSendReceipt>{
 readable(employeeId);const identity=identify(employeeId,args.clientMessageId),hash=fingerprint(employeeId,args),previous=read(employeeId)[identity.key]
 if(previous&&previous.fingerprint!==hash)throw Error('Client message ID already used with different private message content or scope')
 const pending=active.get(identity.activeKey)
 if(pending){await pending;readable(employeeId);return confirmation(employeeId,read(employeeId)[identity.key],queued)}
 if(previous&&!['preparing','rejected'].includes(previous.phase))return confirmation(employeeId,previous,queued)
 let record:Receipt={principal:identity.principal,clientMessageId:identity.clientMessageId,fingerprint:hash,phase:'preparing',boot,createdAt:previous?.createdAt??Date.now()}
 const save=(patch:Partial<Receipt>)=>{record={...record,...patch};const records=read(employeeId);records[identity.key]=record;atomicJson(path(employeeId),records,true)}
 save({})
 const attempt:PrivateSendAttempt={
  get queueId(){return record.queueId},
  queued:queueId=>save({phase:'queued',queueId}),
  dispatching:messageId=>save({phase:'dispatching',messageId}),
  accepted:messageId=>save({phase:'accepted',messageId}),
  failed:error=>{if(record.phase==='accepted'||record.phase==='interrupted')return;save({phase:record.phase==='preparing'?'rejected':record.phase==='queued'?'interrupted':'dispatching',error:String((error as Error)?.message??error).slice(0,1000)})},
  interrupted:reason=>{if(record.phase==='preparing'||record.phase==='queued')save({phase:'interrupted',error:reason})}
 }
 const promise=Promise.resolve().then(async()=>{try{await work(attempt);return confirmation(employeeId,record,queued)}catch(error){attempt.failed(error);throw error}})
 active.set(identity.activeKey,promise)
 try{await promise;readable(employeeId);return confirmation(employeeId,read(employeeId)[identity.key],queued)}finally{active.delete(identity.activeKey)}
}
