import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {assetCatalog,assetReference,locateAsset} from './assets'
import {requestContext} from './request-context'
import {workspacePath,workspaceFiles} from './files'
import {liveChannelPost,projectChannelDocuments} from './channel-store'
import type {AssetPreview} from '../shared/asset-schema'
import type {FileLocation} from '../shared/transfers'
import type {FileEndpoint} from './transfers'

let closed=false
const version=(stat:fs.Stats)=>createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`).digest('hex').slice(0,24)
const fallback=(reason:string):AssetPreview=>({kind:'fallback',reason})

/** Aexus keeps bounded image previews; document covers require a separately installed renderer. */
export async function assetPreview(id:string,call:(command:string,args:Record<string,any>)=>Promise<any>,resolve:(location:FileLocation,destination:boolean)=>FileEndpoint):Promise<AssetPreview>{
 if(requestContext().principal.kind!=='operator')throw Error('Only the user may preview all company assets')
 if(closed)return fallback('Preview service is closed')
 const catalog=assetCatalog(),ref=assetReference(id)
 if(catalog.mounts.find(mount=>mount.id===ref.asset)?.remote)return fallback('Remote original not fetched for a thumbnail')
 const {node}=await locateAsset(id,catalog,call)
 let location=node.location,format=path.extname(node.name).slice(1).toLowerCase()
 if(node.document){
  const post=liveChannelPost(node.document.postId),file=projectChannelDocuments(post).find(file=>file.id===node.document!.fileId)
  if(!file?.thumbnailMediaId)return fallback('No cached cover; the cloud original was not downloaded')
  location={channel:post.channel_id,path:post.id+'/'+file.thumbnailMediaId};format='png'
 }
 if(node.directory||!location)return fallback('Folder or virtual collection')
 const end=resolve(location,false)
 if(end.remote)return fallback('Remote original not fetched for a thumbnail')
 if(!['png','jpg','jpeg','gif','webp'].includes(format))return fallback('No built-in document preview renderer')
 const filename=workspacePath(end.root,end.path),stat=fs.lstatSync(filename)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)return fallback('Preview size or file type limit')
 await end.validate?.('copy-info',{path:end.path})
 const image=workspaceFiles(end.root,'read-image',{path:end.path})
 if(version(fs.statSync(filename))!==version(stat))return fallback('File changed; refresh to load its cover')
 return {kind:'image',mimeType:image.mimeType,data:image.data,version:version(stat)}
}
export async function closeAssetPreviews(){closed=true}
