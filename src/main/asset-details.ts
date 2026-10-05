import fs from 'node:fs'
import path from 'node:path'
import {assetCatalog,assetLocation,assetReference,locateAsset} from './assets'
import {requestContext,withCaller} from './request-context'
import {localAssetHost,assetHost,coreMachineName} from './asset-hosts'
import {channelEngine} from './channel-engines'
import {liveChannelPost,projectChannelDocuments} from './channel-store'
import {getCloudHost} from './cloud-hosts'
import {remoteFiles} from './tunnel'
import {workspaceFiles,workspacePath} from './files'
import type {FileEndpoint} from './transfers'
import type {FileLocation} from '../shared/transfers'
import type {AssetInfo} from '../shared/asset-schema'

type Resolve=(location:FileLocation,destination:boolean)=>FileEndpoint
/** Physical paths are opt-in information, never row subtitles or implicit host probes. */
export async function assetInfo(id:string,call:(command:string,args:Record<string,any>)=>Promise<any>,resolve:Resolve):Promise<AssetInfo>{
 if(requestContext().principal.kind!=='operator')throw Error('Only the user may inspect all company assets')
 const catalog=assetCatalog(),located=await locateAsset(id,catalog,call),node=located.node
 const base={node,host:node.host,readOnly:!!node.readOnly,logicalLocation:located.breadcrumbs.map(item=>item.name),fileCount:node.fileCount}
 if(node.document){
  const post=liveChannelPost(node.document.postId),file=projectChannelDocuments(post).find(file=>file.id===node.document!.fileId)
  if(!file)throw Error('Published file no longer exists; refresh the file list')
  const engine=channelEngine(post.channel_id),storage=engine.kind==='external'?engine.fileStorage:undefined,host=storage?getCloudHost(storage.hostId):undefined,paths=host?.os==='windows'?path.win32:path.posix
  return {...base,host:storage?assetHost({mode:'cloud',hostId:storage.hostId}):undefined,verified:'metadata',bytes:file.bytes,modifiedAt:post.published_at,readOnly:true,...(storage?{physicalPath:paths.join(storage.directory,file.sha256.slice(0,2),file.sha256),workspacePath:storage.directory,address:host!.host,port:host!.port??22}:{}),note:'Cloud metadata only; no original downloaded or host connection opened.'}
 }
 if(!node.location||node.directory&&node.location.asset?.startsWith('published:channel:'))return {...base,verified:'virtual',note:'This collection groups existing files and has no single physical directory.'}
 const ref=assetReference(node.location.asset!,node.location.path),end=resolve(assetLocation(ref.asset,ref.path),false),context=requestContext(),paths=end.remote?.os==='windows'?path.win32:path
 const physicalPath=end.remote?paths.join(end.root,end.path):workspacePath(end.root,end.path)
 const projected={...base,host:node.host??localAssetHost(),physicalPath,workspacePath:end.root,...(end.remote?{address:end.remote.host,port:end.remote.port??22}:{address:coreMachineName()})}
 try{
  await end.validate?.('copy-info',{path:end.path})
  const stat=end.remote?await remoteFiles('asset-info-'+id,end.remote,'copy-info',{path:end.path}):workspaceFiles(end.root,'copy-info',{path:end.path})
  return withCaller(context,()=>{const current=resolve(assetLocation(ref.asset,ref.path),false);if(current.root!==end.root||JSON.stringify(current.remote)!==JSON.stringify(end.remote))throw Error('Storage changed while loading information; refresh the item')
   return {...projected,verified:end.remote?'remote':'local',exists:stat.exists,modifiedAt:stat.modifiedAt,...(!node.directory?{bytes:stat.bytes}:{}),...(!end.remote&&stat.exists?{createdAt:fs.statSync(physicalPath).birthtimeMs}:{})}
  })
 }catch(error){return {...projected,verified:'metadata',note:(error as Error).message}}
}
