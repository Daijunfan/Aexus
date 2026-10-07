import fs from 'node:fs'
import path from 'node:path'
import {Worker} from 'node:worker_threads'
import {APP_HOME} from '../shared/core-paths'
import {applicationRoot} from './resources'
import type {MessageSource,searchMessageIndex,galleryMessageIndex} from './message-index'
import type {MessagePreferences} from '../shared/messenger'
export type IndexKind='search'|'gallery'
export type IndexOptions<K extends IndexKind>=K extends 'search'?Parameters<typeof searchMessageIndex>[0]:Parameters<typeof galleryMessageIndex>[0]
export type IndexResult<K extends IndexKind>=K extends 'search'?ReturnType<typeof searchMessageIndex>:ReturnType<typeof galleryMessageIndex>
let worker:Worker|undefined,sequence=0,closing:Promise<void>|undefined
const active=new Set<Promise<unknown>>()
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
function current(){
 if(worker)return worker
 const next=new Worker(path.join(applicationRoot(),'.aexus/out/main/message-index-worker.js'));worker=next
 const fail=(error:Error)=>{if(worker!==next)return;worker=undefined;for(const request of pending.values())request.reject(error);pending.clear()}
 next.on('error',fail)
 next.on('exit',code=>{if(worker===next){if(pending.size)fail(Error('Message index worker stopped ('+code+')'));else worker=undefined}})
 next.on('message',({id,result,error})=>{const request=pending.get(id);if(!request)return;pending.delete(id);if(!pending.size)next.unref();error?request.reject(Error(error)):request.resolve(result)})
 next.unref();return next
}
function request<T=unknown>(operation:string,args:Record<string,unknown>={}):Promise<T>{
 const target=current(),id=++sequence;target.ref()
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{target.postMessage({id,operation,args})}catch(error){pending.delete(id);if(!pending.size)target.unref();reject(error)}})
}
/** Source reads and authorization stay in Core; expensive indexing runs off its event loop. */
export function queryMessageIndex<K extends IndexKind>(kind:K,sources:MessageSource[],preferences:Record<string,MessagePreferences>,options:IndexOptions<K>):Promise<IndexResult<K>>{
 if(closing)return Promise.reject(Error('Message index is closing'))
 const query=(async()=>{
  const ids=sources.map(source=>source.id),versions=await request<Record<string,string>>('versions',{ids})
  for(const source of sources)if(versions[source.id]!==source.version)await request('sync',{id:source.id,version:source.version,rows:source.read()})
  return request<IndexResult<K>>(kind,{ids,preferences,options})
 })()
 active.add(query);void query.finally(()=>active.delete(query)).catch(()=>{});return query
}
export function removeIndexedConversation(id:string){
 if(closing||!worker&&!fs.existsSync(path.join(APP_HOME,'cache/message-index.sqlite')))return
 void request('remove',{id}).catch(error=>console.error('[Message index invalidation]',error.message))
}
export function closeMessageIndex():Promise<void>{
 return closing??=(async()=>{
  await Promise.allSettled([...active]);if(!worker)return
  const target=worker;await request('close');if(worker===target)worker=undefined
  await target.terminate()
 })().finally(()=>{closing=undefined})
}
