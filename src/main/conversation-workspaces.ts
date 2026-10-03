import {directoryName} from '../shared/directory-names'
import {directoryPath} from './directory-aliases'
import {attachmentPaths,attachmentInfo,type MessageAttachment} from '../shared/message-attachments'
import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/core-paths'
import {WORKSPACE_FILE_PREFIX,CONVERSATION_WORKSPACE_COMMANDS,type ConversationWorkspace} from '../shared/conversation-workspaces'
import type {FileLocation} from '../shared/transfers'
import {authorize,requestContext,withCaller} from './authorization'
import {readStore} from './store'
import {employeeSettings} from '../shared/types'
import {catalog} from './chat-group-store'
import {all,one} from './channel-store'
import {atomicJson,readJson} from './atomic-file'
import {workspaceFiles,workspacePath} from './files'
import {startTransfer,getTransfer,cancelTransfer,type FileEndpoint} from './transfers'

type Identity={conversation:string;kind:'group'|'channel';id:string;name:string;memberIds:string[]}
type Directory={version:1;folderName:string;members:Record<string,string>}
const copies=new Map<string,string>()
const owner=()=>JSON.stringify([requestContext().principal,requestContext().credentialHash])
const safeName=(value:string)=>{const name=Array.from(value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').trim()).slice(0,90).join('');return !name||/^\.+$/.test(name)?'Untitled':/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?'_'+name:name}
function identity(value:unknown):Identity{
 if(typeof value!=='string'||!/^(group|channel):[a-zA-Z0-9_-]+$/.test(value))throw Error('Choose a group or channel conversation')
 const [kind,id]=value.split(':') as ['group'|'channel',string]
 const item=kind==='group'?catalog().groups.find(group=>group.id===id):one('SELECT name,admin_ids FROM channels WHERE id=?',id)
 if(!item)throw Error('Conversation no longer exists')
 const ids=kind==='group'?(item as {memberIds:string[]}).memberIds:JSON.parse((item as {admin_ids:string}).admin_ids)
 const active=new Set(readStore().sessions.filter(card=>!card.deleting).map(card=>card.id))
 return {conversation:value,kind,id,name:item.name,memberIds:ids.filter((id:string)=>active.has(id))}
}
function allowed(value:unknown){
 authorize('conversation.workspace');const info=identity(value),principal=requestContext().principal
 if(principal.kind==='agent'&&!info.memberIds.includes(principal.employeeId))throw Error('Shared files require current conversation membership')
 return info
}
function directory(root:string,create=true){
 try{const stat=fs.lstatSync(root);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Shared workspace directory was replaced')}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(create)fs.mkdirSync(root,{mode:0o700})}
 return root
}
function layout(info:Identity,create=true){
 if(create)fs.mkdirSync(APP_HOME,{recursive:true,mode:0o700});let base=fs.existsSync(APP_HOME)?fs.realpathSync(APP_HOME):path.resolve(APP_HOME)
 for(const part of ['conversation-workspaces',info.kind,info.id])base=directory(path.join(base,part),create)
 const file=path.join(base,'workspace.json')
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Shared workspace metadata cannot be a symlink')
 const data=readJson<Directory>(file,()=>({version:1,folderName:directoryName(info.name,'conversation'),members:{}}),value=>!!value&&typeof value==='object'&&(value as Directory).version===1&&typeof (value as Directory).folderName==='string'&&!!(value as Directory).members&&typeof (value as Directory).members==='object'&&!Array.isArray((value as Directory).members))
 if(safeName(data.folderName)!==data.folderName||Object.values(data.members).some(name=>typeof name!=='string'||safeName(name)!==name))throw Error('Invalid shared workspace directory metadata')
 // Initial names are durable: later display renames do not move a running workspace.
 const root=directory(path.join(base,data.folderName),create),cards=readStore().sessions
 let changed=!fs.existsSync(file)
 for(const id of info.memberIds){
  if(!data.members[id]){
   const name=directoryName(cards.find(card=>card.id===id)!.title,'employee'),used=new Set(Object.values(data.members).map(value=>value.toLocaleLowerCase()))
   let candidate=name,index=1
   while(used.has(candidate.toLocaleLowerCase())||fs.existsSync(path.join(root,candidate)))candidate=name.slice(0,60)+'-'+id.slice(-8).replace(/[^a-z0-9]/gi,'')+(index++>1?'-'+index:'')
   data.members[id]=candidate;changed=true
  }
  directory(path.join(root,data.members[id]),create)
 }
 if(changed&&create)atomicJson(file,data)
 return {root,data}
}
export function workspaceForMember(conversation:string,employeeId?:string,create=true):ConversationWorkspace{
 const info=identity(conversation)
 if(employeeId&&!info.memberIds.includes(employeeId))throw Error('Employee is not a current conversation member')
 const {root,data}=layout(info,create),cards=readStore().sessions,card=cards.find(card=>card.id===employeeId),memberDirectory=employeeId?data.members[employeeId]:undefined
 return {conversation,name:info.name,root,folderName:data.folderName,members:info.memberIds.map(id=>({employeeId:id,name:cards.find(card=>card.id===id)!.title,directory:data.members[id]})),...(memberDirectory?{memberDirectory,memberPath:path.join(root,memberDirectory)}:{}),...(card?{personalWorkspace:card.cwd}:{}),nativeAccess:!card||employeeSettings(readStore(),card).mode!=='cloud'&&card.kind!=='cloud-native-worker',policy:'Members can read shared files. User uploads in the root and other employees’ folders are read-only. Write only in your named subfolder, or explicitly copy to your existing personal workspace. This folder is on the Core host; remote Agents use the API. Folder names stay stable after a conversation or employee is renamed.'}
}
function relative(value:unknown='.'){
 if(typeof value!=='string'||!value||value.includes('\0')||value.includes('\\')||path.isAbsolute(value))throw Error('Use a relative shared file path')
 const result=value.startsWith(WORKSPACE_FILE_PREFIX)?value.slice(WORKSPACE_FILE_PREFIX.length):value
 if(result.split('/').some(part=>part==='..'||part==='.agents-company'||part.startsWith('.agents-transfer-')))throw Error('Shared file path is reserved or outside the workspace')
 return path.posix.normalize(result)
}
function noLinks(root:string,value:string){
 const resolved=workspacePath(root,value),parts=path.relative(root,resolved).split(path.sep).filter(Boolean)
 let current=root
 for(const part of parts){current=path.join(current,part);try{if(fs.lstatSync(current).isSymbolicLink())throw Error('Shared files cannot follow symbolic links')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
 return resolved
}
export function conversationFileEndpoint(conversation:string,value:string,destination=false):FileEndpoint{
 const info=allowed(conversation),{root,data}=layout(info),file=directoryPath(root,relative(value)),principal=requestContext().principal,context=requestContext()
 noLinks(root,file)
 const writable=(candidate:string)=>{
  const parts=path.relative(root,workspacePath(root,candidate)).split(path.sep).filter(Boolean)
  if(principal.kind==='agent'&&parts[0]!==data.members[principal.employeeId])throw Error('Only your named conversation subfolder is writable; user uploads and peer folders are read-only')
 }
 if(destination)writable(file)
 return {root,path:file,validate:(_operation,args)=>withCaller(context,()=>{
  allowed(conversation);noLinks(root,String(args.path??file));if(args.to!==undefined)noLinks(root,String(args.to))
  if(destination){writable(String(args.path??file));if(args.to!==undefined)writable(String(args.to))}
 })}
}
export function conversationFile(args:Record<string,any>){
 authorize('conversation.file',args)
 const info=allowed(args.conversation),{root,data}=layout(info),principal=requestContext().principal,operation=args.operation
 const operations={list:'list',read:'read',image:'read-image',info:'copy-info',chunk:'copy-read',write:'write',mkdir:'mkdir',move:'move',trash:'trash',restore:'restore'} as const
 if(!Object.hasOwn(operations,operation))throw Error('Choose a supported shared file operation')
 const writing=['write','mkdir','move','trash','restore'].includes(operation),file=directoryPath(root,relative(args.path??'.')),target=args.to===undefined?undefined:directoryPath(root,relative(args.to))
 conversationFileEndpoint(info.conversation,operation==='restore'&&principal.kind==='agent'?data.members[principal.employeeId]:file,writing)
 if(target!==undefined)conversationFileEndpoint(info.conversation,target,true)
 if(writing&&operation!=='restore'&&(Object.values(data.members).includes(file)||target!==undefined&&Object.values(data.members).includes(target)))throw Error('Named employee workspace folders cannot be replaced, renamed or removed')
 if(operation==='write'&&(typeof args.content!=='string'||Buffer.byteLength(args.content)>4*1024*1024))throw Error('Shared text writes must be at most 4 MiB')
 const own=principal.kind==='agent'?data.members[principal.employeeId]:undefined,useOwn=writing&&!!own,subroot=useOwn?path.join(root,own!):root
 const strip=(value:string)=>useOwn?path.relative(subroot,path.join(root,value)):value
 const result=workspaceFiles(subroot,operations[operation as keyof typeof operations],{...args,path:operation==='restore'?'.':strip(file),...(target?{to:strip(target)}:{}),offset:args.offset??0,length:262144})
 if(operation==='list')return {...result,path:(result.path??'').split(path.sep).join('/'),entries:result.entries!.filter((entry:{name:string})=>entry.name!=='.agents-company'&&!entry.name.startsWith('.agents-transfer-')).map((entry:{path:string})=>({...entry,path:entry.path.split(path.sep).join('/'),writable:principal.kind==='operator'||entry.path.split(path.sep)[0]===own}))}
 return result.path?{...result,path:(useOwn?[own,result.path].join('/'):result.path).split(path.sep).join('/')}:result
}
export function conversationWorkspaceRequest(command:string,args:Record<string,any>,resolveEndpoint:(location:FileLocation,destination:boolean)=>FileEndpoint){
 authorize(command,args);const principal=requestContext().principal,contract=CONVERSATION_WORKSPACE_COMMANDS.find(value=>value.name===command)
 if(!contract)throw Error('Unknown conversation workspace command')
 for(const key of ['create','hidden','cancel'])if(args[key]!==undefined&&typeof args[key]!=='boolean')throw Error(key+' must be boolean')
 for(const key of Object.keys(args))if(args[key]!==undefined&&!Object.hasOwn(contract.inputSchema.properties,key))throw Error('Unknown shared workspace field: '+key)
 if(command==='conversation.file')return conversationFile(args)
 if(command==='conversation.workspace'){const info=allowed(args.conversation),employee=args.employee??(principal.kind==='agent'?principal.employeeId:undefined);if(principal.kind==='agent'&&employee!==principal.employeeId)throw Error('Choose your own employee identity');return workspaceForMember(info.conversation,employee)}
 if(command==='conversation.workspaces'){
  const employee=args.employee??(principal.kind==='agent'?principal.employeeId:undefined)
  if(principal.kind==='agent'&&employee!==principal.employeeId)throw Error('Choose your own employee identity')
  if(employee&&!readStore().sessions.some(card=>card.id===employee&&!card.deleting))throw Error('Unknown employee')
  const refs=[...catalog().groups.map(g=>'group:'+g.id),...all('SELECT id FROM channels').map(c=>'channel:'+c.id)]
  return refs.filter(ref=>!employee||identity(ref).memberIds.includes(employee)).map(ref=>workspaceForMember(allowed(ref).conversation,employee))
 }
 if(command==='conversation.copy'){
  const endpoint=(value:any,destination:boolean):{ref:FileLocation;endpoint:FileEndpoint}=>{
   if(!value||typeof value!=='object'||Object.keys(value).some(key=>!['conversation','employee','path'].includes(key))||!!value.conversation===!!value.employee)throw Error('A copy location needs conversation or employee, and path')
   if(value.conversation)return {ref:{conversation:value.conversation,path:relative(value.path)},endpoint:conversationFileEndpoint(value.conversation,value.path,destination)}
   const employee=value.employee==='self'&&principal.kind==='agent'?principal.employeeId:value.employee
   if(typeof employee!=='string'||principal.kind==='agent'&&employee!==principal.employeeId)throw Error('Copies may use only your own personal workspace')
   const ref={employee,path:relative(value.path)},base=resolveEndpoint(ref,destination),context=requestContext()
   return {ref,endpoint:{...base,validate:()=>withCaller(context,()=>{authorize(command,args);const current=resolveEndpoint(ref,destination);if(current.root!==base.root||JSON.stringify(current.remote)!==JSON.stringify(base.remote))throw Error('Personal workspace changed during transfer')})}}
  }
  if(!args.from?.conversation&&!args.to?.conversation)throw Error('Choose at least one shared conversation workspace')
  const from=endpoint(args.from,false),to=endpoint(args.to,true),job=startTransfer(from.ref,to.ref,from.endpoint,to.endpoint)
  copies.set(job.id,owner());if(copies.size>200)for(const id of copies.keys()){if(copies.size<=200)break;try{if(['completed','failed','cancelled'].includes(getTransfer(id).state))copies.delete(id)}catch{copies.delete(id)}}
  return job
 }
 if(command==='conversation.transfer'){
  if(copies.get(args.id)!==owner())throw Error('Unknown shared copy for this caller')
  return args.cancel?cancelTransfer(args.id):getTransfer(args.id)
 }
 throw Error('Unknown conversation workspace command')
}

/** Publish stable shared-file references; bytes are fetched only when a recipient chooses. */
export function sharedAttachments(conversation:string,images:unknown,files:unknown):MessageAttachment[]{
 const photos=attachmentPaths(images),documents=attachmentPaths(files)
 if(photos.length+documents.length>16)throw Error('Choose at most 16 attachments')
 if(!photos.length&&!documents.length)return []
 if(requestContext().principal.kind!=='operator')throw Error('Only the user may publish uploaded attachments')
 const read=(value:string,kind:'image'|'file')=>{
  if(!value.startsWith(WORKSPACE_FILE_PREFIX))throw Error('Choose a file uploaded to this conversation')
  const end=conversationFileEndpoint(conversation,value)
  return attachmentInfo(value,workspaceFiles(end.root,'copy-info',{path:end.path}),kind,kind==='image'?workspaceFiles(end.root,'read-image',{path:end.path}).mimeType:undefined)
 }
 return [...photos.map(value=>read(value,'image')),...documents.map(value=>read(value,'file'))]
}
