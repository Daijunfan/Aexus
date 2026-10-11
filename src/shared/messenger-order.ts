/** Apply saved positions without dropping newly created or currently unranked items. */
export function orderedKeys(keys:readonly string[],order:readonly string[]=[]):string[]{
 const remaining=new Set(keys),result:string[]=[]
 for(const key of order)if(remaining.delete(key))result.push(key)
 return [...result,...remaining]
}
/** Reorder a visible subset in its existing slots; filtered/archived items keep their positions. */
export function mergeOrder(previous:readonly string[],next:readonly string[]):string[]{
 const selected=new Set(next);let index=0
 return [...previous.map(key=>selected.has(key)?next[index++]:key),...next.slice(index)]
}
export const sameOrder=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((key,index)=>key===b[index])
export const orderScope=(value:unknown):value is string=>typeof value==='string'&&(/^(categories|all|favorites|archive)$/.test(value)||/^mf_[a-f0-9-]{36}$/.test(value))
export const validOrder=(value:unknown):value is string[]=>Array.isArray(value)&&value.length<=10000&&value.every(key=>typeof key==='string'&&key.length>0&&key.length<=200)&&new Set(value).size===value.length
