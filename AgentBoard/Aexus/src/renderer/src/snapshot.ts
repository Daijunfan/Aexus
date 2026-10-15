/** Reuse unchanged JSON branches after IPC; never mutate the authoritative response. */
export function retainEqual<T>(previous:T|undefined,next:T):T {
  if(Object.is(previous,next))return previous as T
  if(!previous||!next||typeof previous!=='object'||typeof next!=='object')return next
  if(Array.isArray(next)){
    if(!Array.isArray(previous))return next
    const values=next.map((value,index)=>retainEqual(previous[index],value))
    return (values.length===previous.length&&values.every((value,index)=>value===previous[index])?previous:values) as T
  }
  if(Array.isArray(previous))return next
  const before=previous as Record<string,unknown>,after=next as Record<string,unknown>,keys=Object.keys(after)
  let equal=keys.length===Object.keys(before).length
  const result:Record<string,unknown>={}
  for(const key of keys){result[key]=retainEqual(before[key],after[key]);if(!Object.hasOwn(before,key)||result[key]!==before[key])equal=false}
  return (equal?previous:result) as T
}

/** One in-flight refresh, one coalesced trailing refresh; callers await published state. */
export function createRefreshQueue(work:(configuration:boolean,conversation:boolean,status:boolean)=>Promise<void>){
  let running:Promise<void>|undefined,queued=false,configuration=false,conversation=false,status=false
  return (full=true,detail=true,live=true):Promise<void>=>{
    queued=true;configuration ||= full;conversation ||= detail;status ||= live||detail
    if(!running)running=Promise.resolve().then(async()=>{
      while(queued){
        const config=configuration,content=conversation,live=status
        queued=false;configuration=false;conversation=false;status=false
        await work(config,content,live)
      }
    }).finally(()=>{running=undefined})
    return running
  }
}
