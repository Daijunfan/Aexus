import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {create as tar} from 'tar'
import {APP_HOME} from '../shared/protocol'
import type {ChannelPost} from '../shared/channels'
import {channelFileEndpoint,channelRequest} from './channels'

const root=path.join(APP_HOME,'channel-exports'),lifetime=3600000
const safeName=(value:string)=>value.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,'_').trim().slice(0,100)||'news'
async function clean(){
 let entries:import('node:fs').Dirent[];try{entries=await fs.readdir(root,{withFileTypes:true})}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
 for(const entry of entries)if(entry.isDirectory()&&/^[a-f0-9-]{36}$/.test(entry.name)){const folder=path.join(root,entry.name),stat=await fs.stat(folder);if(stat.mtimeMs<Date.now()-lifetime)await fs.rm(folder,{recursive:true,force:true})}
}
export function startChannelExports(){void clean().catch(error=>console.error('[Channel exports]',error.message));const timer=setInterval(()=>void clean().catch(error=>console.error('[Channel exports]',error.message)),600000);timer.unref();return()=>clearInterval(timer)}

/** A bounded, self-contained download uses the existing tar and file-transfer implementations. */
export async function exportChannelPost(id:string){
 const post=await channelRequest('channel.post',{id}) as ChannelPost,folder=path.join(root,randomUUID()),images:string[]=[]
 await fs.mkdir(folder,{recursive:true,mode:0o700})
 try{
  if(post.media.length)await fs.mkdir(path.join(folder,'images'))
  for(const [index,media] of post.media.entries()){
   const file=channelFileEndpoint({channelId:post.channelId,postId:post.id,mediaId:media.id}),name=String(index+1).padStart(2,'0')+'-'+safeName(media.name)
   await fs.copyFile(path.resolve(file.root,file.path),path.join(folder,'images',name));images.push('images/'+name)
  }
  const markdown=['# '+post.title.replace(/\s+/g,' ').trim(),post.sourceName+' · '+new Date(post.publishedAt).toISOString(),post.url?'[Original source]('+post.url+')':'',post.body,...images.map((file,index)=>'!['+post.media[index].name.replace(/[\[\]\r\n]/g,' ')+'](<'+file.split('/').map(encodeURIComponent).join('/')+'>)')].filter(Boolean).join('\n\n')+'\n'
  await fs.writeFile(path.join(folder,'story.md'),markdown,{mode:0o600})
  const name=safeName(post.title)+'.tar.gz',archive=path.join(folder,name)
  await tar({cwd:folder,file:archive,gzip:{level:1},portable:true,noMtime:true},['story.md',...(images.length?['images']:[])])
  await fs.rm(path.join(folder,'story.md'));if(images.length)await fs.rm(path.join(folder,'images'),{recursive:true})
  return {name,markdown,download:{local:true as const,path:archive}}
 }catch(error){await fs.rm(folder,{recursive:true,force:true});throw error}
}
