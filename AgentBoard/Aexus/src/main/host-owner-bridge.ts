import net from 'node:net'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'

// Backend-only capability to the CloudHosts registry owner. The Aexus renderer
// receives neither the socket path nor its authorization secret.
export const hostedCloudHosts=()=>process.env.AGENTS_COMPANY_HOSTED==='1'
/** Subscribe after Core initialization. Atomic host projection renames invalidate
 * inode-bound fs.watch(), so watchFile compares the revision on the path.
 * Release the returned function during Core shutdown. */
export function watchHostProjection(changed:(revision:string)=>void){
  const location=process.env.AGENTS_COMPANY_HOST_PROJECTION_PATH
  if(!hostedCloudHosts()||!location)return ()=>{}
  const revision=()=>{
    try{
      const state=JSON.parse(fs.readFileSync(location,'utf8'))
      if(state?.schemaVersion!==1||state?.source!=='cloudhosts'||!Array.isArray(state.hosts)||
        !/^[a-f0-9]{64}$/.test(state.projectionRevision))return ''
      return state.projectionRevision as string
    }catch{return ''}
  }
  let current=revision()
  const onStat=()=>{const next=revision();if(next&&next!==current){current=next;changed(next)}}
  fs.watchFile(location,{persistent:false,interval:1500},onStat)
  return ()=>fs.unwatchFile(location,onStat)
}
const supported=new Set(['host.create','host.update','host.remove','host.check','host.fingerprints','host.trust','host.credentials'])
export async function hostOwnerRequest<T=any>(type:string,payload:Record<string,unknown>={}):Promise<T>{
  if(!hostedCloudHosts()||!supported.has(type))throw Object.assign(Error('Unsupported host owner operation'),{code:'HOST_BRIDGE_TYPE'})
  const location=process.env.AGENTS_COMPANY_HOST_BRIDGE_SOCKET
  const secret=process.env.AGENTS_COMPANY_HOST_BRIDGE_SECRET
  const instanceId=process.env.AGENTS_COMPANY_HOST_INSTANCE_ID
  if(!location||!secret||!instanceId)throw Object.assign(Error('CloudHosts host owner unavailable'),{code:'HOST_BRIDGE_UNAVAILABLE'})
  const requestId=randomUUID()
  return new Promise<T>((resolve,reject)=>{
    const socket=net.connect(location)
    let text='',size=0,settled=false
    const finish=(error?:Error,value?:T)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve(value as T)}
    socket.setTimeout(12000,()=>finish(Object.assign(Error('CloudHosts host bridge timed out'),{code:'HOST_BRIDGE_TIMEOUT'})))
    socket.on('connect',()=>socket.write(JSON.stringify({protocolVersion:1,instanceId,requestId,secret,type,payload})+'\n'))
    socket.on('data',data=>{
      size+=data.length;if(size>1024*1024){finish(Error('Host bridge response exceeds limit'));return}
      text+=data.toString('utf8')
      const at=text.indexOf('\n');if(at<0)return
      try{
        const value=JSON.parse(text.slice(0,at))
        if(value.requestId!==requestId)throw Error('Host bridge response mismatched')
        if(value.ok!==true)throw Object.assign(Error(String(value.error||'Host bridge failed')),{code:value.code})
        finish(undefined,value.data)
      }catch(error){finish(error as Error)}
    })
    socket.on('error',finish)
    socket.on('end',()=>{if(!settled)finish(Error('CloudHosts host owner disconnected'))})
  })
}
