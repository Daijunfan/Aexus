import fs from 'node:fs'

/** Detect replacement, in-place edits, removals and retargeted symlinks without reading bytes. */
export function fileVersion(file:string):string {
  const stamp=(stat:fs.BigIntStats)=>`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
  try{const stat=fs.lstatSync(file,{bigint:true});return stamp(stat)+(stat.isSymbolicLink()?':'+stamp(fs.statSync(file,{bigint:true})): '')}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return 'missing';throw error}
}

/** Bounded derived data only. Callers must recheck authorization before consulting a cache. */
export class ReadCache<T> {
  private entries=new Map<string,{version:unknown;value:T;bytes:number}>()
  private bytes=0
  constructor(private maxEntries:number,private maxBytes:number){}
  get(key:string,version:unknown,load:()=>T,size:(value:T)=>number):T {
    const old=this.entries.get(key)
    if(old){this.entries.delete(key);this.bytes-=old.bytes}
    if(old&&old.version===version){this.entries.set(key,old);this.bytes+=old.bytes;return old.value}
    const value=load(),bytes=size(value)
    if(bytes<=this.maxBytes){
      this.entries.set(key,{version,value,bytes});this.bytes+=bytes
      while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes){const first=this.entries.keys().next().value!;this.bytes-=this.entries.get(first)!.bytes;this.entries.delete(first)}
    }
    return value
  }
}
const textCache=new ReadCache<string>(128,16*1024*1024)
export const readSourceText=(file:string)=>textCache.get(file,fileVersion(file),()=>fs.readFileSync(file,'utf8'),text=>Buffer.byteLength(text))
