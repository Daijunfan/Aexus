import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import type {ChannelDocument,ChannelFileStatus} from '../shared/channels'
import {run,liveChannelPost,changed,projectChannelDocuments,type Row} from './channel-store'
import {channelEngine} from './channel-engines'
import {cloudHostTarget} from './cloud-hosts'
import {conversationFileEndpoint} from './conversation-workspaces'
import {requestContext,withCaller} from './authorization'
import {startTransfer,getTransfer,type FileEndpoint} from './transfers'

const imports=new Map<string,ChannelFileStatus>()
const key=(postId:string,fileId:string)=>postId+'/'+fileId
export function channelDocuments(value:unknown):ChannelDocument[]{
 if(value===undefined)return []
 if(!Array.isArray(value)||value.length>16)throw Error('Choose up to 16 document files')
 const files=value.map(file=>{
  if(!file||typeof file!=='object'||Object.keys(file).some(k=>!['id','name','mimeType','bytes','sha256','thumbnailMediaId','thumbnailOrigin'].includes(k)))throw Error('Invalid channel document metadata')
  if(typeof file.id!=='string'||!/^[\w-]{1,128}$/.test(file.id)||typeof file.name!=='string'||!file.name||file.name.length>240||/[\\/\x00-\x1f]/.test(file.name)||['.','..'].includes(file.name))throw Error('Invalid document ID or filename')
  if(typeof file.mimeType!=='string'||!/^[-\w.+]+\/[-\w.+]+$/.test(file.mimeType)||file.mimeType.startsWith('image/'))throw Error('Document files require a non-image MIME type')
  if(!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>2*1024**3||typeof file.sha256!=='string'||! /^[a-f0-9]{64}$/.test(file.sha256))throw Error('Documents require their size (up to 2 GiB) and SHA-256')
  if(file.thumbnailOrigin!==undefined&&!['telegram','generated'].includes(file.thumbnailOrigin))throw Error('Invalid document thumbnail origin')
  if(file.thumbnailMediaId!==undefined&&typeof file.thumbnailMediaId!=='string')throw Error('Invalid document thumbnail')
  return {...file} as ChannelDocument
 })
 if(new Set(files.map(file=>file.id)).size!==files.length)throw Error('Document IDs must be unique')
 return files
}
async function digest(file:string){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')}
function source(post:Row,file:ChannelDocument):FileEndpoint{
 const engine=channelEngine(post.channel_id)
 if(engine.kind!=='external'||!engine.fileStorage)throw Error('This channel has no configured cloud file storage')
 const storage=engine.fileStorage,remote=cloudHostTarget(storage.hostId,storage.directory),relative=file.sha256.slice(0,2)+'/'+file.sha256,context=requestContext()
 return {root:remote.directory,path:relative,remote,name:file.name,validate:()=>withCaller(context,()=>{
  const current=liveChannelPost(post.id),latest=channelEngine(current.channel_id)
  if(Date.now()>=current.published_at+7*86400000)throw Error('The cloud document cache has expired')
  if(current.channel_id!==post.channel_id||latest.kind!=='external'||JSON.stringify(latest.fileStorage)!==JSON.stringify(storage)||!(JSON.parse(current.remote_files??'[]') as ChannelDocument[]).some(value=>value.id===file.id&&value.sha256===file.sha256))throw Error('The document or its cloud storage changed; retry the download')
 })}
}
export function channelFileStatus(postId:string,fileId:string):ChannelFileStatus{
 const post=liveChannelPost(postId),file=projectChannelDocuments(post).find(value=>value.id===fileId)
 if(!file)throw Error('Unknown channel document')
 if(file.savedPath)return {postId,fileId,state:'completed',bytes:file.bytes,totalBytes:file.bytes,path:file.savedPath}
 if(Date.now()>=post.published_at+7*86400000)return {postId,fileId,state:'failed',bytes:0,totalBytes:file.bytes,error:'The cloud document cache has expired'}
 const status=imports.get(key(postId,fileId))
 if(!status)return {postId,fileId,state:'not-downloaded',bytes:0,totalBytes:file.bytes}
 if(status.id&&['queued','running'].includes(status.state)){const job=getTransfer(status.id);if(job.state==='queued'||job.state==='running')return {...status,state:job.state,bytes:job.bytes}}
 return {...status}
}
export async function downloadChannelFile(postId:string,fileId:string):Promise<ChannelFileStatus>{
 if(requestContext().principal.kind!=='operator')throw Error('Only the user may download cloud documents into a channel')
 const existing=channelFileStatus(postId,fileId)
 if(existing.error==='The cloud document cache has expired')throw Error(existing.error)
 if(['queued','running','completed'].includes(existing.state))return existing
 const post=liveChannelPost(postId),file=projectChannelDocuments(post).find(value=>value.id===fileId)!,context=requestContext(),target=conversationFileEndpoint('channel:'+post.channel_id,'.',true),originalValidate=target.validate
 let name=file.name
 if(fs.existsSync(path.join(target.root,name))){const extension=path.extname(name),stem=name.slice(0,name.length-extension.length);let index=1;do{name=stem+' ('+file.sha256.slice(0,8)+(index>1?'-'+index:'')+')'+extension;index++}while(fs.existsSync(path.join(target.root,name)))}
 target.validate=async(operation,args)=>{
  await originalValidate?.(operation,args)
  if(operation==='copy-commit'){const staged=path.resolve(target.root,String(args.path));if(fs.statSync(staged).size!==file.bytes||await digest(staged)!==file.sha256)throw Error('The cloud document did not match its size or SHA-256; no local file was saved')}
 }
 const endpoint=source(post,file);endpoint.name=name
 const job=startTransfer({channel:post.channel_id,path:postId+'/'+fileId},{conversation:'channel:'+post.channel_id,path:'.'},endpoint,target),status:ChannelFileStatus={postId,fileId,id:job.id,state:job.state==='queued'?'queued':'running',bytes:0,totalBytes:file.bytes}
 imports.set(key(postId,fileId),status)
 void withCaller(context,async()=>{
  try{
   for(;;){const current=getTransfer(job.id);if(['failed','cancelled'].includes(current.state)){status.state='failed';status.error=current.error??'Download cancelled';break}
    if(current.state==='completed'){const saved=path.join(target.root,current.destination!);run('INSERT INTO channel_file_imports(post_id,file_id,sha256,path,saved_at) VALUES(?,?,?,?,?) ON CONFLICT(post_id,file_id) DO UPDATE SET sha256=excluded.sha256,path=excluded.path,saved_at=excluded.saved_at',postId,fileId,file.sha256,saved,Date.now());status.state='completed';status.bytes=file.bytes;status.path=path.basename(saved);break}
    await new Promise(resolve=>setTimeout(resolve,200))
   }
   changed('posts',{channelIds:[post.channel_id],postIds:[postId]})
  }catch(error){status.state='failed';status.error=(error as Error).message}
 })
 return {...status}
}
