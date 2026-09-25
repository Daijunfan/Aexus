import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {RemoteTarget} from '../shared/remote'
import type {FileLocation,TransferJob} from '../shared/transfers'
import {workspaceFiles} from './files'
import {remoteFiles,closeRemote} from './tunnel'

export type FileEndpoint={root:string;path:string;remote?:RemoteTarget}
type Task={job:TransferJob;source:FileEndpoint;target:FileEndpoint;cancelled:boolean;done?:Promise<void>}
const tasks=new Map<string,Task>(),CHUNK=256*1024
let stopping=false
const join=(a:string,b:string)=>[a==='.'?'':a,b].filter(Boolean).join('/')
function request(task:Task,end:FileEndpoint,side:string,op:string,args:Record<string,unknown>){
  return end.remote?remoteFiles(`transfer-${task.job.id}-${side}`,end.remote,op,args):Promise.resolve(workspaceFiles(end.root,op,args))
}
export const listTransfers=()=>[...tasks.values()].map(t=>({...t.job})).reverse()
export function getTransfer(id:string){const t=tasks.get(id);if(!t)throw Error('Unknown transfer');return {...t.job}}
export function cancelTransfer(id:string){const t=tasks.get(id);if(!t)throw Error('Unknown transfer');if(['queued','running'].includes(t.job.state)){t.cancelled=true;if(t.job.state==='queued')t.job.state='cancelled';else{closeRemote(`transfer-${id}-from`);closeRemote(`transfer-${id}-to`)}}return getTransfer(id)}
export function startTransfer(from:FileLocation,to:FileLocation,source:FileEndpoint,target:FileEndpoint){
  if(stopping)throw Error('文件传输服务正在关闭')
  const name=(source.remote?.os==='windows'?path.win32:path.posix).basename(source.path==='.'?source.root:source.path)
  if(!name||name==='.'||name==='..'||/[\\/]/.test(name))throw Error('请选择有效文件或文件夹')
  const job:TransferJob={id:randomUUID(),from,to,name,state:'queued',bytes:0,totalBytes:0,files:0,totalFiles:0,createdAt:Date.now()}
  tasks.set(job.id,{job,source,target,cancelled:false})
  for(const [id,t] of tasks)if(tasks.size>100&&['completed','failed','cancelled'].includes(t.job.state))tasks.delete(id)
  pump();return {...job}
}
function pump(){
  if(stopping)return
  let available=2-[...tasks.values()].filter(t=>t.job.state==='running').length
  for(const task of tasks.values())if(available>0&&task.job.state==='queued'){
    available--;task.job.state='running';task.done=copy(task).finally(()=>pump())
  }
}
async function copy(task:Task){
  const {job,source,target}=task,stage=join(target.path,`.agents-transfer-${job.id}`),payload=join(stage,'payload'),destination=join(target.path,job.name)
  const check=()=>{if(task.cancelled)throw Error('传输已取消')}
  const call=(end:FileEndpoint,side:string,op:string,args:Record<string,unknown>)=>request(task,end,side,op,args)
  let staged=false
  try{
    check()
    const targetInfo=await call(target,'to','copy-info',{path:target.path})
    if(!targetInfo.directory||targetInfo.symlink)throw Error('目标必须是已有文件夹')
    if((await call(target,'to','copy-info',{path:destination})).exists)throw Error('目标已有同名文件，请先重命名；源文件未移动')
    const sourceInfo=await call(source,'from','copy-info',{path:source.path})
    if(!sourceInfo.exists)throw Error('源文件不存在')
    const pathApi=source.remote?.os==='windows'?path.win32:path.posix
    if(JSON.stringify(source.remote?{...source.remote,directory:undefined}:null)===JSON.stringify(target.remote?{...target.remote,directory:undefined}:null)){
      const a=pathApi.resolve(source.root,source.path),b=pathApi.resolve(target.root,destination),relative=pathApi.relative(a,b)
      if(!relative||(sourceInfo.directory&&!relative.startsWith('..'+pathApi.sep)&&relative!=='..'&&!pathApi.isAbsolute(relative)))throw Error('不能复制到源目录本身或其子目录')
    }
    const files:{path:string;relative:string;bytes:number;modifiedAt:number;mode:number}[]=[],directories:string[]=[]
    const walk=async(value:string,relative:string,info:any)=>{
      await new Promise<void>(resolve=>setImmediate(resolve))
      check();if(info.symlink)throw Error('暂不复制软链接，请选择实际文件')
      if(info.directory){directories.push(relative);const list=await call(source,'from','list',{path:value,hidden:true});for(const e of list.entries){if(e.name==='.agents-company'||e.name.startsWith('.agents-transfer-'))continue;await walk(e.path,join(relative,e.name),{...e,regular:!e.directory&&!e.symlink,mode:e.mode})}}
      else {if(info.regular===false)throw Error('只能传输普通文件和文件夹');const stat=await call(source,'from','copy-info',{path:value});if(!stat.regular||stat.symlink)throw Error('只能传输普通文件');const mode=source.remote?.os==='windows'?(stat.mode&0o222?0o644:0o444):stat.mode;files.push({path:value,relative,bytes:stat.bytes,modifiedAt:stat.modifiedAt,mode});job.totalBytes+=stat.bytes;job.totalFiles++}
    }
    await walk(source.path,'',sourceInfo);check()
    // A unique staging tree prevents failed/cancelled copies from appearing as complete files.
    await call(target,'to','mkdir',{path:stage});staged=true
    for(const dir of directories){check();await call(target,'to','mkdir',{path:join(payload,dir)})}
    for(const file of files){
      let offset=0
      do{
        check();const chunk=file.bytes?await call(source,'from','copy-read',{path:file.path,offset,length:CHUNK}):{data:'',bytes:0}
        if(file.bytes&&(!chunk.bytes||offset+chunk.bytes>file.bytes))throw Error('源文件在传输过程中发生变化，请重试')
        check();await call(target,'to','copy-write',{path:join(payload,file.relative),offset,data:chunk.data,mode:file.mode,final:offset+chunk.bytes===file.bytes})
        offset+=chunk.bytes;job.bytes+=chunk.bytes
        await new Promise<void>(resolve=>setImmediate(resolve))
      }while(offset<file.bytes)
      const after=await call(source,'from','copy-info',{path:file.path})
      if(after.bytes!==file.bytes||after.modifiedAt!==file.modifiedAt)throw Error('源文件在传输过程中发生变化，请重试')
      job.files++
    }
    check();await call(target,'to','copy-commit',{path:payload,to:destination})
    job.destination=destination;job.state='completed'
  }catch(error){job.state=task.cancelled?'cancelled':'failed';job.error=(error as Error).message}
  finally{
    if(staged)try{await call(target,'to','copy-remove',{path:stage})}catch{job.error=(job.error||'传输失败')+`；临时文件待连接恢复后清理：${stage}`}
    closeRemote(`transfer-${job.id}-from`);closeRemote(`transfer-${job.id}-to`)
  }
}
export async function closeTransfers(){stopping=true;for(const t of tasks.values())cancelTransfer(t.job.id);await Promise.all([...tasks.values()].map(t=>t.done))}
