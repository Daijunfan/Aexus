import {parentPort} from 'node:worker_threads'
import {indexVersions,setMessageScope,syncMessageIndex,searchMessageIndex,galleryMessageIndex,removeIndexedConversation,closeMessageIndex} from './message-index'
/** Derived storage only: this worker cannot dispatch tasks or decide access rights. */
parentPort!.on('message',({id,operation,args})=>{
 try{
  let result:unknown
  switch(operation){
   case 'versions':result=indexVersions(args.ids);break
   case 'sync':syncMessageIndex([{id:args.id,version:args.version,read:()=>args.rows}],{});break
   case 'search':setMessageScope(args.ids,args.preferences);result=searchMessageIndex(args.options);break
   case 'gallery':setMessageScope(args.ids,args.preferences);result=galleryMessageIndex(args.options);break
   case 'remove':removeIndexedConversation(args.id);break
   case 'close':closeMessageIndex();break
   default:throw Error('Unknown message index operation')
  }
  parentPort!.postMessage({id,result})
  if(operation==='close')parentPort!.close()
 }catch(error){parentPort!.postMessage({id,error:(error as Error).message})}
})
