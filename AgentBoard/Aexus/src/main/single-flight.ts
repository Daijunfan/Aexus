/** Coalesce concurrent work only; durable retry policy remains with its owner. */
export class SingleFlight<T> {
  private pending=new Map<string,Promise<T>>()
  get(key:string){return this.pending.get(key)}
  has(key:string){return this.pending.has(key)}
  run(key:string,work:()=>Promise<T>):Promise<T>{
    const previous=this.pending.get(key);if(previous)return previous
    const next=Promise.resolve().then(work)
    this.pending.set(key,next)
    void next.finally(()=>{if(this.pending.get(key)===next)this.pending.delete(key)}).catch(()=>{})
    return next
  }
}
