import type {PermissionMode,EffortLevel} from '../../shared/types'
import type {SandboxMode} from '../codex'

/** Shared adapter helpers; this leaf never imports the session service at runtime. */
export function sandboxFor(mode:PermissionMode):SandboxMode {
  if(mode==='bypassPermissions')return 'danger-full-access'
  if(mode==='acceptEdits'||mode==='auto')return 'workspace-write'
  return 'read-only'
}
export const codexEffort=(effort?:EffortLevel):string|undefined=>effort

/** Preserve the native protocol's terminal status; a cancelled or failed turn is never success. */
export function nativeTurnFailure(engine:'codex'|'cline',status:unknown,diagnostic?:unknown):Error|undefined {
  const completed=engine==='codex'?'completed':'end_turn'
  if(status===completed)return undefined
  const reason=typeof diagnostic==='string'&&diagnostic.trim()?diagnostic:`${engine} turn ended with status ${typeof status==='string'?status:'unknown'}`
  return new Error(reason)
}

export class AsyncQueue<T> {
  private items:T[]=[]
  private waiter:((value:IteratorResult<T>)=>void)|null=null
  private closed=false
  push(item:T) {
    if(this.closed)return
    if(this.waiter){const resolve=this.waiter;this.waiter=null;resolve({value:item,done:false})}
    else this.items.push(item)
  }
  close() {
    this.closed=true
    if(this.waiter){const resolve=this.waiter;this.waiter=null;resolve({value:undefined as never,done:true})}
  }
  [Symbol.asyncIterator]():AsyncIterator<T> {
    return {next:()=>{
      if(this.items.length)return Promise.resolve({value:this.items.shift()!,done:false})
      if(this.closed)return Promise.resolve({value:undefined as never,done:true})
      return new Promise<IteratorResult<T>>(resolve=>{this.waiter=resolve})
    }}
  }
}
