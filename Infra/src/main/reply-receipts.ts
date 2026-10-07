import {createHash} from 'node:crypto'
import {readStore,writeStore} from './store'
import {requestContext} from './authorization'
import {employeeReady,type Item} from '../shared/types'
import {catalog,messages} from './chat-group-store'
import {all} from './channel-store'
import {transcriptItems} from './transcripts'

const replyId=(taskId:string|undefined,itemId:string,text:string)=>createHash('sha256').update(JSON.stringify([taskId,itemId,text])).digest('hex')

/** Publish once per completed visible answer, never for tools/thinking/onboarding. */
export function publishReply(employeeId:string,items:Item[],turnKey?:string){
  let answer:{itemId:string;text:string}|undefined
  for(let i=items.length-1;i>=0&&!answer;i--){
    const item=items[i];if(item.role==='user')break
    if(item.role!=='assistant')continue
    for(let j=item.blocks.length-1;j>=0;j--){
      const block=item.blocks[j]
      if(block.kind==='text'&&block.text.trim()){answer={itemId:item.id,text:block.text.trim()};break}
    }
  }
  if(!answer)return
  const store=readStore(),card=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  if(!card||!employeeReady(card))return
  const id=replyId(turnKey,answer.itemId,answer.text)
  if(card.lastReply?.id===id)return
  const paragraphs=answer.text.split(/\n\s*\n/).filter(text=>text.trim()&&!/^```\s*$/.test(text.trim()))
  const paragraph=paragraphs.at(-1)??answer.text,characters=Array.from(paragraph)
  // The full answer remains in transcripts; the persisted floor preview is bounded.
  const text=characters.length>4000?'…'+characters.slice(-4000).join(''):paragraph
  card.lastReply={id,itemId:answer.itemId,text,createdAt:Date.now()}
  writeStore(store)
}

/** Remove only an old unread whose exact digest proves shared-task provenance. Never rewrite history or infer human reads. */
export function repairSharedReplyReceipts(){
  const store=readStore(),candidates=store.sessions.filter(card=>!card.deleting&&card.lastReply&&!card.lastReply.readAt)
  if(!candidates.length)return
  const tasks=new Map(candidates.map(card=>[card.id,new Set<string>()]))
  try{for(const group of catalog().groups){try{for(const message of messages(group.id))for(const delivery of message.deliveries)if(delivery.taskId)tasks.get(delivery.employeeId)?.add(delivery.taskId)}catch(error){console.error('[Shared receipt history]',group.id,String(error))}}}catch(error){console.error('[Shared receipt catalog]',String(error))}
  for(const row of all('SELECT employee_id,task_id FROM channel_deliveries WHERE task_id IS NOT NULL'))tasks.get(row.employee_id)?.add(row.task_id)
  let changed=false
  for(const card of candidates){
    if(!tasks.get(card.id)?.size)continue
    try{
      const items=transcriptItems(card.id),receipt=card.lastReply!,answer=[...items].reverse().find(item=>item.role==='assistant'&&item.id===receipt.itemId)
      if(answer?.role!=='assistant')continue
      const block=[...answer.blocks].reverse().find(block=>block.kind==='text'&&block.text.trim())
      if(block?.kind==='text'&&[...tasks.get(card.id)!].some(task=>replyId(task,answer.id,block.text.trim())===receipt.id)){delete card.lastReply;changed=true}
    }catch(error){console.error('[Shared receipt verification]',card.id,String(error))}
  }
  if(changed)writeStore(store)
}

/** An old UI frame must not acknowledge a newer reply. Agent readers never mark user read. */
export function acknowledgeReply(employeeId:string,replyId:string){
  if(requestContext().principal.kind!=='operator')throw Error('Only the user may acknowledge a reply')
  if(typeof replyId!=='string'||!replyId)throw Error('replyId is required')
  const store=readStore(),card=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  if(!card)throw Error('Unknown employee')
  if(!card.lastReply||card.lastReply.id!==replyId)return {acknowledged:false,replyId:card.lastReply?.id}
  if(!card.lastReply.readAt){card.lastReply={...card.lastReply,readAt:Date.now()};writeStore(store)}
  return {acknowledged:true,replyId,readAt:card.lastReply.readAt}
}
