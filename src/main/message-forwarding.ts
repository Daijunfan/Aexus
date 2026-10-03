import {SingleFlight} from './single-flight'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {APP_HOME} from '../shared/protocol'
import {authorize,requestContext,visibleEmployees} from './authorization'
import {atomicJson,readJson} from './atomic-file'
import {getChatGroup,readChatMessages} from './chat-groups'
import {lookupPrivateSendReceipt} from './private-send-receipts'
import {privateSendQueued} from './sessions'
import {readMessengerMessages} from './messenger'
import {employeeReady} from '../shared/types'
import type {MessengerMessage,ForwardStatus,ForwardResult} from '../shared/messenger'

type Receipt={fingerprint:string;status:'preparing'|'sent'|'failed'|'uncertain'|'interrupted';stage?:'copying'|'dispatch';to?:string;count?:number;downstreamKey?:string;result?:ForwardResult;error?:string;createdAt:number}
const file=join(APP_HOME,'message-forwards.json'),active=new SingleFlight<ForwardResult>()
const receipts=()=>readJson<Record<string,Receipt>>(file,()=>({}))
const save=(key:string,value:Receipt)=>{const state=receipts();state[key]=value;atomicJson(file,state,true)}
function requestId(value:unknown):asserts value is string{if(typeof value!=='string'||!value||value.length>160)throw Error('Provide a stable forwarding request ID')}
/** A status check may recover an existing acceptance, but never dispatches work. */
export function forwardStatus(args:Record<string,any>):ForwardStatus{
 authorize('messenger.forward-status',args);if(requestContext().principal.kind!=='operator')throw Error('Only the user may check forwarding attempts')
 requestId(args.clientMessageId)
 const key='forward:'+args.clientMessageId,receipt=receipts()[key],running=active.has(key)
 if(!receipt)return {clientMessageId:args.clientMessageId,status:'not-found',active:false,retryable:true}
 let status:ForwardStatus['status']=receipt.status,result=receipt.result,error=receipt.error
 if(receipt.stage==='dispatch'&&receipt.to&&receipt.downstreamKey){
  const [kind,id]=receipt.to.split(':')
  try{
   const found=kind==='employee'?lookupPrivateSendReceipt(id,receipt.downstreamKey,privateSendQueued):status!=='sent'?readChatMessages(id).find(message=>message.author.kind==='operator'&&message.clientMessageId===receipt.downstreamKey):undefined
   if(found){status='sent';result=receipt.result??{to:receipt.to,count:receipt.count!,status:kind==='group'?'posted':'queued',messageId:('messageId' in found?found.messageId:undefined)??found.id??null};error=undefined}
  }catch(cause){const code=(cause as {code?:string}).code;if(code==='PRIVATE_SEND_UNCERTAIN'||code==='PRIVATE_SEND_INTERRUPTED'){status=code==='PRIVATE_SEND_INTERRUPTED'?'interrupted':'uncertain';error=(cause as Error).message}else throw cause}
 }
 if(!running&&(status==='preparing'&&receipt.stage!=='copying'||status==='failed'&&receipt.stage!=='copying'))status='uncertain'
 if(status!==receipt.status||result!==receipt.result)save(key,{...receipt,status:status as Receipt['status'],result,error})
 return {clientMessageId:args.clientMessageId,status,active:running,retryable:!running&&(status==='failed'||status==='preparing')&&receipt.stage==='copying',...(status==='sent'&&result?{result}:{}),...(error?{error}:{})}
}
/** Dispatch only through Core's existing authenticated send/upload operations. */
export async function forwardMessages(args:Record<string,any>,call:(command:string,args:Record<string,unknown>)=>Promise<any>){
 authorize('messenger.forward',args);if(requestContext().principal.kind!=='operator')throw Error('Only the user may forward messages')
 if(!Array.isArray(args.messages)||!args.messages.length||args.messages.length>50)throw Error('Choose 1–50 messages')
 if(typeof args.to!=='string'||!/^(employee|group):[a-zA-Z0-9_-]+$/.test(args.to))throw Error('Choose a destination conversation')
 if(args.comment!==undefined&&(typeof args.comment!=='string'||args.comment.length>16000))throw Error('A forwarding note supports up to 16000 characters')
 if(args.retry!==undefined&&typeof args.retry!=='boolean')throw Error('retry must be boolean')
 if(args.textOnly!==undefined&&typeof args.textOnly!=='boolean')throw Error('textOnly must be boolean')
 requestId(args.clientMessageId)
 const key='forward:'+args.clientMessageId,fingerprint=createHash('sha256').update(JSON.stringify([args.to,args.messages,args.comment??'',!!args.textOnly])).digest('hex'),previous=receipts()[key]
 if(previous){if(previous.fingerprint!==fingerprint)throw Error('Forwarding request ID already used for different content');const pending=active.get(key);if(pending)return pending;const known=forwardStatus({clientMessageId:args.clientMessageId});if(known.status==='sent')return known.result;if(!known.retryable)throw Error(known.status==='interrupted'?'The queued forward was interrupted. It will not be sent again automatically.':'The earlier forwarding result is uncertain. Check the destination before creating a new request.');if(!args.retry)throw Error(previous.error??'The earlier forwarding failed. Retry the same request.')}
 const [kind,id]=args.to.split(':')
 if(kind==='group')getChatGroup(id);else {const card=visibleEmployees().find(card=>card.id===id);if(!card||!employeeReady(card))throw Error('Destination employee is not ready')}
 const selected:MessengerMessage[]=[],histories=new Map<string,MessengerMessage[]>()
 for(const ref of args.messages){
  if(!ref||typeof ref.conversation!=='string'||typeof ref.id!=='string')throw Error('Invalid source message')
  if(!histories.has(ref.conversation))histories.set(ref.conversation,readMessengerMessages(ref.conversation,args.messages.filter((value:any)=>value.conversation===ref.conversation).map((value:any)=>value.id)))
  const found=histories.get(ref.conversation)!.find(message=>message.id===ref.id&&!message.preferences.hidden)
  if(!found)throw Error('Source message is unavailable or hidden')
  selected.push(found)
 }
 const attachments=args.textOnly?[]:selected.flatMap(message=>[...message.images.map(path=>({path,kind:'image' as const})),...(message.files??[])].map(file=>({...file,from:{...(message.conversation.startsWith('employee:')?{employee:message.conversation.slice(9)}:message.conversation.startsWith('channel:')?{channel:message.conversation.slice(8)}:{group:message.conversation.slice(6)}),path:file.path}})))
 if(attachments.length>16)throw Error('A forwarded message supports at most 16 attachments')
 const text=[args.comment?.trim(),...selected.map(message=>`Forwarded from ${message.author} · ${message.conversationTitle}\n${message.text||(message.files?.length?message.files.map(file=>file.name).join(', '):'Photo')}`)].filter(Boolean).join('\n\n——\n\n')
 if(kind==='group'&&text.length>16000)throw Error('The forwarded group message exceeds 16000 characters. Select fewer messages.')
 const receipt:Receipt={fingerprint,status:'preparing',stage:'copying',to:args.to,count:selected.length,downstreamKey:'forward:'+createHash('sha256').update(args.clientMessageId).digest('hex'),createdAt:Date.now()};save(key,receipt)
 let accepted=false
 return active.run(key,async()=>{try{
  const images:string[]=[],files:string[]=[]
  for(const attachment of attachments){
    const info=await call('transfer.download-info',{from:attachment.from}),upload=await call('messenger.upload-begin',{conversation:args.to,name:info.name??attachment.path.split(/[\\/]/).at(-1),bytes:info.bytes})
    try{
      let offset=0
      while(offset<info.bytes){const chunk=await call('transfer.download-chunk',{from:attachment.from,offset,modifiedAt:info.modifiedAt});if(!chunk.bytes)throw Error('Attachment ended during forwarding');await call('transfer.upload-chunk',{id:upload.id,offset,data:chunk.data});offset+=chunk.bytes}
      const result=await call('transfer.upload-commit',{id:upload.id});(attachment.kind==='image'?images:files).push(result.destination)
    }catch(error){await call('transfer.upload-abort',{id:upload.id}).catch(()=>{});throw error}
  }
  receipt.stage='dispatch';save(key,receipt)
  const sent=kind==='group'?await call('chat.send',{id,text,images,files,mentions:[],clientMessageId:receipt.downstreamKey}):await call('session.enqueue',{employee:id,text,images,files,clientMessageId:receipt.downstreamKey})
  accepted=true
  const result:ForwardResult={to:args.to,count:selected.length,status:kind==='group'?'posted':'queued',messageId:sent.messageId??sent.id??null}
  save(key,{...receipt,status:'sent',result});return result
 }catch(error){if(!accepted)save(key,{...receipt,status:receipt.stage==='copying'?'failed':(error as {code?:string}).code==='PRIVATE_SEND_INTERRUPTED'?'interrupted':'uncertain',error:(error as Error).message});throw error}})
}
