import {randomUUID,createHash} from 'node:crypto'
import type {FileEndpoint} from './transfers'
import {workspaceFiles} from './files'
import {remoteFiles,closeRemote} from './tunnel'
import {requestContext} from './request-context'
import type {FileLocation} from '../shared/transfers'
const CHUNK=256*1024
const owner=()=>JSON.stringify([requestContext().principal,requestContext().clientId??'cli'])
type Upload={id:string;owner:string;target:FileEndpoint;to:FileLocation;name:string;bytes:number;offset:number;stage:string;busy:boolean;updatedAt:number}
const uploads=new Map<string,Upload>()
const join=(a:string,b:string)=>[a==='.'?'':a,b].filter(Boolean).join('/')
const call=(id:string,end:FileEndpoint,operation:string,args:Record<string,unknown>)=>end.remote?remoteFiles('upload-'+id+'-'+createHash('sha256').update(JSON.stringify(end.remote)).digest('hex').slice(0,16),end.remote,operation,args):Promise.resolve(workspaceFiles(end.root,operation,args))
const get=(id:string)=>{const value=uploads.get(id);if(!value||value.owner!==owner())throw Error('Unknown upload');return value}
export async function beginUpload(to:FileLocation,target:FileEndpoint,name:string,bytes:number){
  if(uploads.size>=64)throw Error('Too many uploads; finish or cancel existing uploads')
  if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\0\r\n]/.test(name)||name==='.agents-company'||name.startsWith('.agents-transfer-'))throw Error('Invalid upload filename')
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>2*1024*1024*1024)throw Error('Files must be at most 2 GiB')
  const id=randomUUID(),info=await call(id,target,'copy-info',{path:target.path})
  if(!info.directory||info.symlink)throw Error('Upload destination must be an existing directory')
  if((await call(id,target,'copy-info',{path:join(target.path,name)})).exists)throw Error('A file with this name already exists')
  const stage=join(target.path,'.agents-transfer-'+id)
  await call(id,target,'mkdir',{path:stage})
  const value={id,owner:owner(),target,to,name,bytes,offset:0,stage,busy:false,updatedAt:Date.now()}
  uploads.set(id,value)
  if(bytes===0)await call(id,target,'copy-write',{path:stage+'/payload',offset:0,data:'',final:true,mode:0o600})
  return {id,chunkBytes:CHUNK,size:bytes}
}
export async function uploadChunk(id:string,offset:number,data:string){
  const value=get(id)
  if(value.busy)throw Error('Wait for the previous upload chunk')
  if(offset!==value.offset||typeof data!=='string'||data.length>349528||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Invalid upload chunk or offset')
  const bytes=Buffer.from(data,'base64').length
  if(bytes<1||bytes>CHUNK||offset+bytes>value.bytes)throw Error('Invalid chunk size')
  value.busy=true
  try{await call(id,value.target,'copy-write',{path:value.stage+'/payload',offset,data,final:offset+bytes===value.bytes,mode:0o600});value.offset+=bytes;value.updatedAt=Date.now();return {id,offset:value.offset}}
  finally{value.busy=false}
}
export async function commitUpload(id:string){
  const value=get(id)
  if(value.busy||value.offset!==value.bytes)throw Error('Upload is incomplete')
  value.busy=true
  try{
    const destination=join(value.target.path,value.name)
    await call(id,value.target,'copy-commit',{path:value.stage+'/payload',to:destination})
    await call(id,value.target,'copy-remove',{path:value.stage})
    uploads.delete(id);closeRemote('upload-'+id+'-'+createHash('sha256').update(JSON.stringify(value.target.remote??null)).digest('hex').slice(0,16))
    return {id,state:'completed',destination,bytes:value.bytes}
  }finally{value.busy=false}
}
export async function abortUpload(id:string){
  const value=get(id);if(value.busy)throw Error('Wait for the active chunk before cancellation')
  await call(id,value.target,'copy-remove',{path:value.stage});uploads.delete(id);closeRemote('upload-'+id+'-'+createHash('sha256').update(JSON.stringify(value.target.remote??null)).digest('hex').slice(0,16));return {cancelled:true}
}
export async function downloadInfo(target:FileEndpoint){
  const result=await call('download',target,'copy-info',{path:target.path})
  if(!result.exists||result.directory||result.symlink||result.regular===false)throw Error('Choose a regular file to download')
  return {bytes:result.bytes,modifiedAt:result.modifiedAt}
}
export async function downloadChunk(target:FileEndpoint,offset:number,modifiedAt?:number){
  const info=await downloadInfo(target)
  if(modifiedAt!==undefined&&info.modifiedAt!==modifiedAt)throw Error('File changed during download; retry')
  if(!Number.isSafeInteger(offset)||offset<0||offset>info.bytes)throw Error('Invalid download offset')
  return {...await call('download',target,'copy-read',{path:target.path,offset,length:CHUNK}),totalBytes:info.bytes,modifiedAt:info.modifiedAt}
}
export async function closeUploads(){for(const value of uploads.values())try{await call(value.id,value.target,'copy-remove',{path:value.stage});closeRemote('upload-'+value.id+'-'+createHash('sha256').update(JSON.stringify(value.target.remote??null)).digest('hex').slice(0,16))}catch{};uploads.clear()}
