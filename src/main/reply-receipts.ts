import {createHash} from 'node:crypto'
import {readStore,writeStore} from './store'
import {requestContext} from './authorization'
import {employeeReady,type Item} from '../shared/types'

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
  const id=createHash('sha256').update(JSON.stringify([turnKey,answer.itemId,answer.text])).digest('hex')
  if(card.lastReply?.id===id)return
  const paragraphs=answer.text.split(/\n\s*\n/).filter(text=>text.trim()&&!/^```\s*$/.test(text.trim()))
  const paragraph=paragraphs.at(-1)??answer.text,characters=Array.from(paragraph)
  // The full answer remains in transcripts; the persisted floor preview is bounded.
  const text=characters.length>4000?'…'+characters.slice(-4000).join(''):paragraph
  card.lastReply={id,itemId:answer.itemId,text,createdAt:Date.now()}
  writeStore(store)
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
