import type {PermissionMode,EffortLevel} from '../../shared/types'
import type {SandboxMode} from '../codex'

/** Shared adapter helpers; this leaf never imports the session service at runtime. */
export function sandboxFor(mode:PermissionMode):SandboxMode {
  if(mode==='bypassPermissions')return 'danger-full-access'
  if(mode==='acceptEdits'||mode==='auto')return 'workspace-write'
  return 'read-only'
}
export const codexEffort=(effort?:EffortLevel):string|undefined=>effort

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
