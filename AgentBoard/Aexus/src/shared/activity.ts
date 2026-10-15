import type {ActivityPreview,Session} from './types'

const excerpt=(text:string)=>text.length>360?'…'+text.slice(-360):text
/** Actual current-turn output, or the submitted task while awaiting engine output. */
export function activityPreview(session:Session):ActivityPreview|null {
  if(!session.busy)return null
  for(let i=session.items.length-1;i>=0;i--){
    const item=session.items[i]
    if(item.role==='user')return item.text.trim()?{kind:'tool',tool:'Task',text:item.text.trim().slice(0,360),running:true}:null
    if(item.role!=='assistant')continue
    for(let j=item.blocks.length-1;j>=0;j--){
      const block=item.blocks[j]
      if(block.kind==='tool'){
        const input=block.input??{},command=input.command??input.cmd??input.file_path??input.path
        return {kind:'tool',tool:block.name,text:excerpt(typeof command==='string'?command:JSON.stringify(input)),detail:block.result?excerpt(block.result):undefined,running:block.running}
      }
      if(block.text.trim())return {kind:block.kind==='thinking'?'thinking':'speech',text:excerpt(block.text.trim())}
    }
  }
  return null
}

/** Finished unread replies survive closed native connections and app restarts. */
export function employeeActivity(card:import('./types').StoredSession,live?:Session):ActivityPreview|null{
  if(card.initialization&&card.initialization.status!=='ready')return null
  if(live?.busy)return live.activityPreview??activityPreview(live)
  const reply=card.lastReply
  return reply&&!reply.readAt?{kind:'speech',text:reply.text,unread:true,replyId:reply.id}:null
}
