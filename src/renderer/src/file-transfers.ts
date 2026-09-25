import {api} from './api'
import {FILE_DRAG_TYPE,type FileLocation,type TransferJob} from '../../shared/transfers'
export const hasFileDrop=(data:DataTransfer)=>data.types.includes(FILE_DRAG_TYPE)||data.types.includes('Files')
let copiedFile:FileLocation|undefined
export function dragFile(data:DataTransfer,from:FileLocation){data.effectAllowed='copyMove';data.setData(FILE_DRAG_TYPE,JSON.stringify(from))}
export function copyFile(from:FileLocation){copiedFile=from}
export async function pasteFile(to:FileLocation){if(!copiedFile)return [];return [await transfer(copiedFile,to)]}
async function transfer(from:FileLocation,to:FileLocation){
  const job=await api.call<TransferJob>('transfer.start',{from,to})
  for(;;){
    const current=await api.call<TransferJob>('transfer.get',{id:job.id})
    if(current.state==='completed')return current
    if(current.state==='failed'||current.state==='cancelled')throw Error(current.error||'文件传输未完成')
    await new Promise(resolve=>setTimeout(resolve,200))
  }
}
export async function uploadFiles(files:File[],to:FileLocation){
  const paths=files.map(file=>api.filePath(file));if(paths.some(p=>!p))throw Error('无法取得本地文件路径，请从 Finder 拖入文件')
  return Promise.all(paths.map(path=>transfer({local:true,path},to)))
}
export async function dropFiles(data:DataTransfer,to:FileLocation){
  const value=data.getData(FILE_DRAG_TYPE)
  if(value)return [await transfer(JSON.parse(value),to)]
  return uploadFiles([...data.files],to)
}
