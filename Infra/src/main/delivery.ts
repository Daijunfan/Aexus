import type {ChatDelivery,SharedTaskContext} from '../shared/chat-groups'
import type {Delegation} from '../shared/management'
export const deliveryTerminal=(status:ChatDelivery['status'])=>['completed','failed','interrupted'].includes(status)
/** Late queue events cannot undo execution; native receipt times keep their first evidence. */
export function nextDelivery(current:ChatDelivery,patch:Partial<ChatDelivery>,onlyPending=false,terminalMetadata=false):ChatDelivery|null{
  let next:ChatDelivery
  if(deliveryTerminal(current.status)){
    if(current.deliveredAt!==undefined||patch.deliveredAt===undefined)return null
    next={...current,...(terminalMetadata?patch:{}),status:current.status,deliveredAt:patch.deliveredAt}
  }else{
    if(onlyPending&&!['pending','routing'].includes(current.status))return null
    next={...current,...patch}
  }
  next.employeeId=current.employeeId
  next.deliveredAt=current.deliveredAt??next.deliveredAt
  next.readAt=current.readAt??next.readAt
  next.ackMessageId=current.ackMessageId??next.ackMessageId
  return Object.keys(next).some(key=>next[key as keyof ChatDelivery]!==current[key as keyof ChatDelivery])?next:null
}
type Input={text:string;images?:string[];files?:string[]}
type Route={
  context:SharedTaskContext;recipients:ChatDelivery[];concurrency:number
  scope:(target:ChatDelivery)=>{delegation:Delegation;viewId?:string}
  validate:(id:string,delegation:Delegation)=>void
  input:()=>Input
  prepare?:(id:string)=>Promise<Input>
  update:(id:string,patch:Partial<ChatDelivery>,onlyPending?:boolean)=>void
}
/** One dispatch lifecycle for groups and channels; source policies stay explicit. */
export async function routeRecipients(route:Route){
  const {startSession,enqueueMessage}=await import('./sessions')
  let cursor=0
  await Promise.all(Array.from({length:Math.min(route.concurrency,route.recipients.length)},async()=>{
    while(cursor<route.recipients.length){
      const target=route.recipients[cursor++],id=target.employeeId
      try{
        const {delegation,viewId}=route.scope(target),input=route.input()
        route.update(id,{status:'routing'});route.validate(id,delegation)
        const opened=await startSession({cardId:id,delegation})
        route.validate(id,delegation)
        const prepared=route.prepare?await route.prepare(id):input
        route.validate(id,delegation)
        const queued=enqueueMessage(opened.sessionId,prepared.text,prepared.images??[],delegation,viewId,route.context,undefined,undefined,undefined,prepared.files??[])
        route.update(id,{status:'queued',sessionId:opened.sessionId,queueId:queued.id},true)
      }catch(error){route.update(id,{status:'failed',error:(error as Error).message})}
    }
  }))
}
