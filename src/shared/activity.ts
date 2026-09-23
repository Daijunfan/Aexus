import type {ActivityPreview,Session} from './types'

const excerpt=(text:string)=>text.length>360?'…'+text.slice(-360):text
/** Only actual, engine-published content from the current turn; never invent reasoning. */
export function activityPreview(session:Session):ActivityPreview|null {
  if(!session.busy)return null
  for(let i=session.items.length-1;i>=0;i--){
    const item=session.items[i]
    if(item.role==='user')break
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
