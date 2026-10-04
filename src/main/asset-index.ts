import {applicationRoot} from './resources'
import fs from 'node:fs'
import path from 'node:path'
import {Worker} from 'node:worker_threads'
import {APP_HOME} from '../shared/core-paths'
import type {AssetMount} from './assets'
import type {AssetNode,AssetPage} from '../shared/asset-schema'
import type {FileLocation} from '../shared/transfers'

let worker:Worker|undefined,sequence=0,signature='',preparedAt=0,pending=false,epoch=0,remotePending=0
let remoteErrors:string[]=[]
const replies=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>()
function request(operation:string,args:any):Promise<any>{
 if(!worker){const directory=path.join(APP_HOME,'cache');fs.mkdirSync(directory,{recursive:true});worker=new Worker(path.join(applicationRoot(),'out/main/asset-index-worker.js'),{workerData:{file:path.join(directory,'asset-index.sqlite')}});worker.unref();worker.on('message',message=>{if(message.event==='complete'){pending=false;return}const reply=replies.get(message.id);if(reply){replies.delete(message.id);message.error?reply.reject(Error(message.error)):reply.resolve(message.result)}});worker.on('error',error=>{for(const reply of replies.values())reply.reject(error);replies.clear();worker=undefined;signature='';pending=false})}
 return new Promise((resolve,reject)=>{const id=++sequence;replies.set(id,{resolve,reject});worker!.postMessage({id,operation,args})})
}
export const assetIndex={
 invalidate(){preparedAt=0},
 async prepare(roots:AssetMount[],inventory?: (ref:FileLocation,args:any)=>Promise<any>,refresh=false){
  const input=roots.map(root=>({id:root.id,root:root.root.replaceAll('\\','/'),key:root.remote?'remote:'+root.owner.team:'local',remote:root.remote,owner:root.owner,members:root.members,memberOwners:root.memberOwners,readOnly:root.readOnly})),next=JSON.stringify(input)
  if(signature===next&&(!refresh&&(pending||remotePending||Date.now()-preparedAt<30000)))return
  signature=next;preparedAt=Date.now();pending=true;remoteErrors=[];const token=++epoch,configured=await request('configure',{roots:input});remotePending=configured.remoteSources.length
  // Remote scopes remain on their original execution host; metadata only crosses the API.
  for(const id of configured.remoteSources){const root=roots.find(root=>root.id===id)!;void (async()=>{
   if(!inventory)throw Error('Remote asset inventory is unavailable')
   let cursor=0,firstRequest=true
   do{if(epoch!==token)return;const page=await inventory({...root.scope,path:'.'},{cursor,refresh:refresh&&firstRequest});firstRequest=false;if(epoch!==token)return;if(page.indexing){await new Promise(r=>setTimeout(r,500));continue}await request('remote',{root:root.id,entries:page.entries??[],directories:page.directories??[]});cursor=page.nextCursor??-1;if(page.errors?.length)remoteErrors.push(...page.errors)}while(cursor!==-1)
  })().catch(error=>{if(epoch===token)remoteErrors.push(root.label+': '+error.message)}).finally(()=>{if(epoch===token)remotePending--})}
 },
 async counts(nodes:AssetNode[],hidden=false,filters:Record<string,unknown>={}){const physical=nodes.filter(node=>node.directory&&node.location?.asset);if(!physical.length)return nodes;const counted=await request('stats',{nodes:physical,hidden,filters});const byId=new Map(counted.map((node:AssetNode)=>[node.id,node]));return nodes.map(node=>byId.get(node.id)??node) as AssetNode[]},
 async children(root:string,args:Record<string,unknown>){return request('children',{root,...args})},
 async treeCounts(tree:AssetNode,filters:Record<string,unknown>={}):Promise<AssetNode>{
  const visit=async(node:AssetNode):Promise<AssetNode>=>{
   if(node.location){const [counted]=await this.counts([node],false,filters);const children=await Promise.all((node.children??[]).map(visit));const outside=children.filter(child=>child.external),known=counted.fileCount!==undefined&&outside.every(child=>child.fileCount!==undefined);return {...counted,children:children.length?children:undefined,...(known?{fileCount:counted.fileCount!+outside.reduce((n,child)=>n+child.fileCount!,0),nonemptyFolders:(counted.nonemptyFolders??0)+outside.filter(child=>child.fileCount!>0).length}:{})}}
   const children=await Promise.all((node.children??[]).map(visit)),known=children.every(child=>child.fileCount!==undefined)
   return {...node,children,nonemptyFolders:known?children.filter(child=>(child.fileCount??0)>0).length:undefined,...(known?{fileCount:children.reduce((n,child)=>n+(child.fileCount??0),0)}:{})}
  }
  const status=await request('status',{});return {...await visit(tree),indexing:pending||remotePending>0,errors:[...status.errors,...remoteErrors]} as AssetNode
 },
 async search(args:Record<string,unknown>):Promise<AssetPage>{const page=await request('search',args);return {...page,indexing:page.indexing||remotePending>0,errors:[...page.errors,...remoteErrors]}},
 async close(){epoch++;remotePending=0;await worker?.terminate();worker=undefined;signature='';for(const reply of replies.values())reply.reject(Error('Asset index closed'));replies.clear()}
}
