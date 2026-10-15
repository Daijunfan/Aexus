import type {AgentsApi} from '../api'
import type {FileLocation} from '../../../shared/transfers'
const join=(a:string,b:string)=>[a==='.'?'':a,b].filter(Boolean).join('/')
function base64(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value)}
export async function uploadBrowserFile(api:AgentsApi,file:File,to:FileLocation){
  const upload=await api.call<{id:string;chunkBytes:number}>('transfer.upload-begin',{to,name:file.name,bytes:file.size})
  try{
    for(let offset=0;offset<file.size;offset+=upload.chunkBytes){const bytes=new Uint8Array(await file.slice(offset,offset+upload.chunkBytes).arrayBuffer());await api.call('transfer.upload-chunk',{id:upload.id,offset,data:base64(bytes)})}
    return await api.call('transfer.upload-commit',{id:upload.id})
  }catch(error){await api.call('transfer.upload-abort',{id:upload.id}).catch(()=>{});throw error}
}
export async function dropBrowserFiles(api:AgentsApi,data:DataTransfer,to:FileLocation){
  const entries=[...data.items].map(item=>(item as any).webkitGetAsEntry?.()).filter(Boolean),results:any[]=[]
  let count=0
  async function visit(entry:any,destination:FileLocation){
    if(++count>10000)throw Error('一次最多导入 10000 个文件和文件夹，请分批上传')
    if(entry.isFile){const file=await new Promise<File>((resolve,reject)=>entry.file(resolve,reject));results.push(await uploadBrowserFile(api,file,destination));return}
    if(!entry.isDirectory)return
    if(!entry.name||/[\\/]/.test(entry.name)||entry.name==='.'||entry.name==='..'||entry.name==='.agents-company')throw Error('无效的文件夹名称')
    const next={...destination,path:join(destination.path,entry.name)}
    const {path:parent,...scope}=destination
    const children=await api.call<any>('workspace.list',{...scope,path:parent})
    const existing=children.entries.find((item:any)=>item.name===entry.name)
    if(existing&&!existing.directory)throw Error('目标已有同名文件：'+entry.name)
    if(!existing)await api.call('workspace.mkdir',{...scope,path:next.path})
    const reader=entry.createReader()
    for(;;){const batch=await new Promise<any[]>((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)await visit(child,next)}
  }
  if(entries.length){for(const entry of entries)await visit(entry,to)}
  else for(const file of [...data.files])results.push(await uploadBrowserFile(api,file,to))
  return results
}
export function downloadBrowserFile(from:FileLocation){
  const client=sessionStorage.getItem('agents-company-client')
  if(!client)throw Error('Browser session is not ready')
  const url=new URL('/api/download',location.href);url.searchParams.set('from',JSON.stringify(from));url.searchParams.set('client',client)
  const link=document.createElement('a');link.href=url.href;link.download=from.path.split(/[\\/]/).at(-1)??'download';link.rel='noreferrer';link.click()
}
