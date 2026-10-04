import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {requireConversation} from './conversation-policy'
import {readChatMessages,groupMediaRoot} from './chat-groups'
import {getChannelMessage} from './channel-discussion'
import {channelFileEndpoint} from './channels'
import {one,run,liveChannelPost,projectChannelPost,projectChannelDocuments} from './channel-store'
import {cloudDocumentSource} from './channel-files'
import {conversationFileEndpoint,workspaceForMember} from './conversation-workspaces'
import {workspaceCatalog} from './workspace-catalog'
import {authorize,requestContext,withCaller} from './authorization'
import {workspaceFiles} from './files'
import {startTransfer,getTransfer,cancelTransfer,type FileEndpoint} from './transfers'
import type {FileLocation,TransferJob} from '../shared/transfers'
import type {PrincipalRef} from '../shared/management'

type Attachment={id:string;name:string;kind:'image'|'document';bytes:number;mimeType?:string;sha256?:string;path?:string;mediaId?:string;fileId?:string;read?:{command:string;args:Record<string,unknown>}}
const hash=(text:string)=>createHash('sha256').update(text).digest('hex')
const actor=(principal:PrincipalRef)=>principal.kind==='operator'?'operator':principal.employeeId
const relative=(value:unknown='.')=>{if(typeof value!=='string'||!value||value.includes('\0')||value.includes('\\')||path.isAbsolute(value)||value.split('/').some(p=>p==='..'||p==='.agents-company'||p.startsWith('.agents-transfer-')))throw Error('Use a relative path inside your own workspace');return path.posix.normalize(value)}
const filename=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>240||/[\\/\x00-\x1f]/.test(value)||['.','..','.agents-company'].includes(value)||value.startsWith('.agents-transfer-'))throw Error('Choose a regular attachment filename');return value}

/** Full public data, never a private transcript or a guessed latest-N summary. */
export function conversationEntry(args:Record<string,any>){
 const scope=requireConversation(args.conversation);if(typeof args.id!=='string'||!args.id)throw Error('Choose a published entry ID')
 let entry:any,kind:'news'|'message'='message';let attachments:Attachment[]=[]
 if(scope.kind==='channel'&&args.id.startsWith('np_')){
  const row=liveChannelPost(args.id);if(row.channel_id!==scope.id)throw Error('Entry belongs to another conversation')
  const {saved:_,savedAt:__,...post}=projectChannelPost(row);entry=post;kind='news'
  attachments=[...post.media.map(file=>({id:'image:'+file.id,name:file.name,kind:'image' as const,bytes:file.bytes,mimeType:file.mimeType,sha256:file.sha256,mediaId:file.id,read:{command:'channel.image',args:{channelId:scope.id,postId:post.id,mediaId:file.id}}})),...(post.files??[]).map(({savedPath:_,...file})=>({...file,id:'document:'+file.id,fileId:file.id,kind:'document' as const}))]
 }else{
  entry=scope.kind==='group'?readChatMessages(scope.id).find(message=>message.id===args.id):getChannelMessage(scope.id,args.id)
  if(!entry)throw Error('Unknown published message')
  attachments=(entry.attachments??[]).map((file:any)=>({id:'attachment:'+hash(file.path).slice(0,32),name:file.name,kind:file.kind==='image'?'image':'document',bytes:file.bytes,mimeType:file.mimeType,path:file.path,read:file.path.startsWith('@workspace/')?{command:'conversation.file',args:{conversation:scope.conversation,path:file.path,operation:file.kind==='image'?'image':'chunk'}}:{command:'chat.file',args:{id:scope.id,path:file.path,operation:file.kind==='image'?'image':'chunk'}}}))
 }
 const text=[entry.url,entry.authorUrl,entry.title,entry.body,entry.text].filter(value=>typeof value==='string').join('\n')
 const links=[...new Set((text.match(/https?:\/\/[^\s<>"\u0000-\u001f]+/g)??[]).map(url=>url.replace(/[),.;]+$/,'')))]
 return {conversation:scope.conversation,kind,entry,links,attachments:attachments.map(file=>({...file,download:{command:'conversation.download',args:{conversation:scope.conversation,entryId:args.id,attachmentId:file.id}}}))}
}
function attachmentSource(conversation:string,entryId:string,file:Attachment):FileEndpoint{
 const scope=requireConversation(conversation),context=requestContext();let endpoint:FileEndpoint
 if(file.fileId){const row=liveChannelPost(entryId),original=projectChannelDocuments(row).find(value=>value.id===file.fileId)!
  const cached=one('SELECT path FROM channel_file_imports WHERE post_id=? AND file_id=? AND sha256=?',entryId,file.fileId,file.sha256!)
  endpoint=cached&&fs.existsSync(cached.path)?conversationFileEndpoint(conversation,path.relative(workspaceForMember(conversation).root,cached.path)):cloudDocumentSource(row,original)
 }else if(file.mediaId)endpoint=channelFileEndpoint({channelId:scope.id,postId:entryId,mediaId:file.mediaId})
 else if(file.path?.startsWith('@workspace/'))endpoint=conversationFileEndpoint(conversation,file.path)
 else{if(scope.kind!=='group'||!file.path)throw Error('Attachment source is unavailable');endpoint={root:groupMediaRoot(scope.id),path:file.path}}
 const validate=endpoint.validate
 return {...endpoint,name:file.name,validate:async(operation,args)=>withCaller(context,async()=>{
  authorize('conversation.entry');requireConversation(conversation)
  if(scope.kind==='channel'&&entryId.startsWith('np_')){const post=liveChannelPost(entryId);if(post.channel_id!==scope.id)throw Error('Post moved to another channel')}
  if(operation==='copy-info'){
   const current=conversationEntry({conversation,id:entryId}).attachments.find(value=>value.id===file.id)
   if(!current||current.bytes!==file.bytes||current.sha256!==file.sha256)throw Error('Published attachment changed during download')
  }
  await validate?.(operation,args)
 })}
}
type Download={id:string;transferId:string;owner:string;fingerprint:string;conversation:string;entryId:string;attachmentId:string;employeeId:string;workspace:string;workspacePath:string;targetRoot:string;name:string;state:TransferJob['state']|'interrupted';bytes:number;totalBytes:number;destination?:string;absolutePath?:string;error?:string;createdAt:number}
const persist=(job:Download)=>run('UPDATE conversation_downloads SET data=? WHERE id=?',JSON.stringify(job),job.id)
function refresh(job:Download){
 if(!['queued','running'].includes(job.state))return job
 try{const live=getTransfer(job.transferId);job.state=live.state;job.bytes=live.bytes;job.error=live.error;if(live.destination){job.destination=live.destination;job.absolutePath=path.join(job.targetRoot,live.destination)}}
 catch{job.state='interrupted';job.error='Core restarted; inspect your workspace before requesting another copy. This request was not replayed.'}
 persist(job);return job
}
const publicDownload=({owner:_,fingerprint:__,targetRoot:___,transferId:____,...job}:Download)=>job
export function downloadStatus(args:Record<string,any>){
 const row=one('SELECT data FROM conversation_downloads WHERE id=?',String(args.id)),job:Download|undefined=row&&JSON.parse(row.data)
 if(!job||job.owner!==actor(requestContext().principal))throw Error('Unknown attachment download for this caller')
 if(args.cancel!==undefined&&typeof args.cancel!=='boolean')throw Error('cancel must be boolean')
 if(args.cancel&&['queued','running'].includes(job.state)){try{cancelTransfer(job.transferId)}catch{}}
 return publicDownload(refresh(job))
}
export function downloadAttachment(args:Record<string,any>,resolve:(ref:FileLocation,destination:boolean)=>FileEndpoint){
 const scope=requireConversation(args.conversation),principal=requestContext().principal,employee=args.employee??(principal.kind==='agent'?principal.employeeId:undefined),context=requestContext()
 const catalog=workspaceCatalog({employee}),workspaceId=args.workspace??scope.conversation,workspace=catalog.workspaces.find(w=>w.id===workspaceId)
 if(!workspace)throw Error('Choose one of your workspace.catalog IDs')
 if(!scope.members.includes(employee))throw Error('The selected employee must belong to the source conversation')
 if(typeof args.clientRequestId!=='string'||!args.clientRequestId.trim()||args.clientRequestId.length>160)throw Error('Provide a stable clientRequestId')
 const file=conversationEntry({conversation:scope.conversation,id:args.entryId}).attachments.find(file=>file.id===args.attachmentId)
 if(!file)throw Error('Choose an attachment ID returned by conversation.entry')
 const subdirectory=relative(args.path),name=filename(args.name??file.name),fingerprint=hash(JSON.stringify([scope.conversation,args.entryId,file.id,workspaceId,employee,subdirectory,name])),requestKey=JSON.stringify([actor(principal),args.clientRequestId])
 const previous=one('SELECT data FROM conversation_downloads WHERE request_key=?',requestKey)
 if(previous){const job:Download=JSON.parse(previous.data);if(job.fingerprint!==fingerprint)throw Error('Download request ID already used with different arguments');return publicDownload(refresh(job))}
 let target:FileEndpoint,to:FileLocation
 if(workspace.view==='messages'){
  const member=workspaceForMember(workspace.conversation!,employee);to={conversation:workspace.conversation!,path:path.posix.join(member.memberDirectory!,subdirectory)};target=conversationFileEndpoint(to.conversation!,to.path,true)
 }else{to={employee,path:subdirectory};target=resolve(to,true)}
 const original=target.validate,root=target.root,remote=JSON.stringify(target.remote),digest=file.sha256?createHash('sha256'):undefined;let bytes=0
 target={...target,validate:async(operation,input)=>withCaller(context,async()=>{
  authorize('conversation.download');requireConversation(scope.conversation)
  const current=workspaceCatalog({employee}).workspaces.find(w=>w.id===workspaceId)
  if(!current||current.path!==workspace.path)throw Error('Destination workspace changed or membership was removed')
  if(workspace.view==='company'){const current=resolve(to,true);if(current.root!==root||JSON.stringify(current.remote)!==remote)throw Error('Destination execution host changed')}
  await original?.(operation,input)
  if(operation==='copy-write'){if(input.offset!==bytes)throw Error('Unexpected download offset');const chunk=Buffer.from(String(input.data),'base64');bytes+=chunk.length;digest?.update(chunk)}
  if(operation==='copy-commit'&&(bytes!==file.bytes||digest&&digest.digest('hex')!==file.sha256))throw Error('Attachment size or SHA-256 did not match; no file was committed')
 })}
 const source=attachmentSource(scope.conversation,args.entryId,file);source.name=name
 if(!target.remote){let suffix=1;const ext=path.extname(name),stem=name.slice(0,name.length-ext.length);while(fs.existsSync(path.join(target.root,target.path,source.name)))source.name=stem+' ('+suffix+++')'+ext}
 const transfer=startTransfer({conversation:scope.conversation,path:file.path??args.entryId+'/'+file.id},to,source,target)
 const job:Download={id:'cd_'+randomUUID(),transferId:transfer.id,owner:actor(principal),fingerprint,conversation:scope.conversation,entryId:args.entryId,attachmentId:file.id,employeeId:employee,workspace:workspaceId,workspacePath:workspace.path,targetRoot:target.root,name:source.name,state:transfer.state,bytes:0,totalBytes:file.bytes,createdAt:Date.now()}
 run('INSERT INTO conversation_downloads VALUES(?,?,?)',job.id,requestKey,JSON.stringify(job))
 void (async()=>{while(['queued','running'].includes(job.state)){await new Promise(resolve=>setTimeout(resolve,100));refresh(job)}})().catch(error=>console.error('[Attachment copy receipt]',error.message))
 return publicDownload(job)
}
