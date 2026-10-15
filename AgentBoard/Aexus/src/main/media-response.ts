import type {MediaInfo} from '../shared/media'
/** One bounded range implementation for authenticated HTTP and the desktop protocol. */
export function mediaRange(value:string|null,bytes:number){
 if(!value)return {start:0,end:bytes-1,partial:false}
 const match=/^bytes=(\d*)-(\d*)$/.exec(value)
 if(!match||!match[1]&&!match[2])throw Error('Invalid byte range')
 const a=match[1]?Number(match[1]):undefined,b=match[2]?Number(match[2]):undefined
 if(a!==undefined&&!Number.isSafeInteger(a)||b!==undefined&&!Number.isSafeInteger(b)||a===undefined&&!b)throw Error('Invalid byte range')
 const start=a??Math.max(0,bytes-b!),end=a===undefined?bytes-1:Math.min(b??bytes-1,bytes-1)
 if(start<0||start>=bytes||end<start)throw Error('Unsatisfiable byte range')
 return {start,end,partial:true}
}
export async function mediaResponse(request:{method:string;headers:Headers;signal?:AbortSignal},id:string,call:(cmd:string,args:Record<string,unknown>)=>Promise<any>,valid:()=>boolean=()=>true):Promise<Response>{
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}})
 if(!valid())return new Response(null,{status:401})
 let info:MediaInfo
 try{info=await call('messenger.media-info',{id})}catch{return new Response(null,{status:404})}
 const headers=new Headers({'content-type':info.mimeType,'accept-ranges':'bytes','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'content-disposition':"inline; filename*=UTF-8''"+encodeURIComponent(info.name)})
 let range:ReturnType<typeof mediaRange>
 try{range=mediaRange(request.method==='HEAD'?null:request.headers.get('range'),info.bytes)}catch{headers.set('content-range','bytes */'+info.bytes);return new Response(null,{status:416,headers})}
 headers.set('content-length',String(Math.max(0,range.end-range.start+1)))
 if(range.partial)headers.set('content-range',`bytes ${range.start}-${range.end}/${info.bytes}`)
 const status=range.partial?206:200
 if(request.method==='HEAD')return new Response(null,{status,headers})
 let offset=range.start,cancelled=false
 const stream=new ReadableStream<Uint8Array>({
  async pull(controller){
   if(cancelled)return
   if(request.signal?.aborted||!valid()){controller.error(Error('Media stream closed'));return}
   if(offset>range.end){controller.close();return}
   try{const chunk=await call('messenger.media-read',{id,offset});if(cancelled)return;if(request.signal?.aborted||!valid())throw Error('Media stream closed');const data=Buffer.from(chunk.data,'base64').subarray(0,range.end-offset+1);if(!data.length)throw Error('Media file ended early');offset+=data.length;controller.enqueue(data)}catch(error){if(!cancelled)controller.error(error)}
  },cancel(){cancelled=true}
 })
 return new Response(stream,{status,headers})
}
