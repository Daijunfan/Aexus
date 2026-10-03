import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/core-paths'
import {directoryName} from '../shared/directory-names'
import type {AssetNode,AssetOwner} from '../shared/asset-schema'
import type {FileLocation} from '../shared/transfers'
import {requestContext} from './authorization'
import {readStore} from './store'
import {teamSettings} from '../shared/types'
import {catalog} from './chat-group-store'
import {groupMediaRoot} from './chat-groups'
import {all,projectChannelDocuments,postSelect} from './channel-store'
import {workspaceForMember} from './conversation-workspaces'
import {sharedDirectory} from './shared-directory'
import {workspaceFiles,workspacePath} from './files'
import {assetIndex} from './asset-index'

type Call=(command:string,args:Record<string,unknown>)=>Promise<any>
export type AssetMount={id:string;name:string;label:string;root:string;scope:Omit<FileLocation,'path'>;owner:AssetOwner;remote?:boolean;readOnly?:boolean;members?:Record<string,string>}
const operator=()=>{if(requestContext().principal.kind!=='operator')throw Error('Only the user may browse all company assets')}
const folder=(id:string,name:string,children:AssetNode[]=[]):AssetNode=>({id,name,directory:true,locked:true,children})
const mountNode=(mount:AssetMount):AssetNode=>({...folder(mount.id,mount.name),label:mount.label,owner:mount.owner,readOnly:mount.readOnly,location:{asset:mount.id,path:'.'},children:undefined})

/** View folders are a projection of existing identities, never a second workspace store. */
export function assetCatalog(){
 operator();const store=readStore(),mounts:AssetMount[]=[],add=(mount:AssetMount)=>{mounts.push(mount);return mountNode(mount)}
 const company=[add({id:'shared',name:'Shared',label:'Shared',root:sharedDirectory(),scope:{shared:true},owner:{view:'Company',label:'Shared'}})]
 for(const team of store.groups){
  const config=teamSettings(store,team),root=store.teamRoots?.[team];if(!root)continue
  const owner:AssetOwner={view:'Company',label:team,team},id='team:'+encodeURIComponent(team)
  const workspace=add({id,name:'Workspace',label:team,root,scope:{team},owner,remote:config.mode==='cloud'})
  const employees=store.sessions.filter(card=>card.group===team&&!card.deleting).map(card=>add({id:'employee:'+card.id,name:directoryName(card.title,'employee'),label:card.title,root:card.cwd,scope:{employee:card.id},owner:{...owner,label:team+' / '+card.title,employee:card.id},remote:config.mode==='cloud'&&card.workEnvironment!=='local'}))
  workspace.children=employees.map(employee=>{const paths=root.includes('\\')?path.win32:path.posix,member=mounts.find(mount=>mount.id===employee.id)!,part=paths.relative(root,member.root);return {...employee,external:part==='..'||part.startsWith('..'+paths.sep)||paths.isAbsolute(part)}});company.push(folder('company:'+encodeURIComponent(team),directoryName(team,'team'),[workspace]))
 }
 const conversation=(kind:'group'|'channel',item:{id:string;name:string})=>{
  const ref=kind+':'+item.id,workspace=workspaceForMember(ref,undefined,false)
  return add({id:ref,name:workspace.folderName,label:item.name,root:workspace.root,scope:{conversation:ref},owner:{view:'Messages',label:item.name,conversation:ref},members:Object.fromEntries(workspace.members.map(member=>[member.directory,member.employeeId]))})
 }
 const groups=catalog().groups.map(item=>{const node=conversation('group',item);const published=add({id:'published:group:'+item.id,name:'Published',label:item.name+' / Published',root:groupMediaRoot(item.id),scope:{group:item.id},owner:{view:'Messages',label:item.name,conversation:'group:'+item.id},readOnly:true});published.external=true;node.children=[published];return node}),channels=all('SELECT id,name FROM channels').map(item=>conversation('channel',{id:String(item.id),name:String(item.name)}))
 const plan=add({id:'plan:exports',name:'Exports',label:'Plan exports',root:path.join(APP_HOME,'plan-assets'),scope:{},owner:{view:'Plan',label:'Exports'}})
 return {tree:folder('root','AgentsCompany',[folder('company','Company',company),folder('messages','Messages',[folder('groups','Groups',groups),folder('channels','Channels',channels)]),folder('plan','Plan',[plan])]),mounts}
}
export function assetLocation(id:string,value='.'){
 operator();const store=readStore()
 if(id==='shared')return {shared:true,path:value}
 if(id==='plan:exports'){const root=path.join(APP_HOME,'plan-assets');fs.mkdirSync(root,{recursive:true});return {local:true,path:workspacePath(root,value)}}
 if(id.startsWith('published:group:'))return {group:id.slice(16),path:value}
 if(id.startsWith('published:channel:'))return {channel:id.slice(18),path:value}
 if(id.startsWith('employee:')){const employee=id.slice(9);if(store.sessions.some(card=>card.id===employee&&!card.deleting))return {employee,path:value}}
 if(id.startsWith('team:')){const team=decodeURIComponent(id.slice(5));if(store.groups.includes(team))return {team,path:value}}
 if(/^(group|channel):/.test(id)){workspaceForMember(id,undefined,false);return {conversation:id,path:value}}
 throw Error('Asset workspace no longer exists')
}
const find=(node:AssetNode,id:string):AssetNode|undefined=>node.id===id?node:node.children?.map(child=>find(child,id)).find(Boolean)
const split=(id:string)=>{const at=id.indexOf('|');return at<0?[id,'.']:[id.slice(0,at),decodeURIComponent(id.slice(at+1))]}
function cloudDocuments(root?:string,query=''):AssetNode[]{
 const result:AssetNode[]=[]
 for(const row of all(postSelect+" WHERE p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) AND p.remote_files<>'[]'",Date.now())){
  if(root&&root!=='channel:'+row.channel_id)continue
  for(const file of projectChannelDocuments(row))if(!file.savedPath&&(!query||(file.name+' '+row.source_name).toLocaleLowerCase().includes(query.toLocaleLowerCase())))result.push({id:'cloud:'+row.id+':'+file.id,name:file.name,directory:false,locked:true,bytes:file.bytes,modifiedAt:row.published_at,owner:{view:'Messages',label:row.source_name,conversation:'channel:'+row.channel_id},document:{postId:row.id,fileId:file.id}})
 }
 for(const row of all("SELECT m.*,s.channel_id,s.name AS source_name FROM media m JOIN posts p ON p.id=m.post_id JOIN sources s ON s.id=p.source_id WHERE p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?)",Date.now()))if((!root||root==='channel:'+row.channel_id)&&(!query||(row.name+' '+row.source_name).toLocaleLowerCase().includes(query.toLocaleLowerCase())))result.push({id:'published-media:'+row.id,name:row.name,directory:false,locked:true,readOnly:true,bytes:row.bytes,owner:{view:'Messages',label:row.source_name,conversation:'channel:'+row.channel_id},location:{asset:'published:channel:'+row.channel_id,path:row.id}})
 return result
}

export async function assetRequest(command:string,args:Record<string,any>,call:Call,inventory?:(ref:FileLocation,args:any)=>Promise<any>){
 operator();for(const field of ['offset','limit'])if(args[field]!==undefined&&(!Number.isSafeInteger(args[field])||args[field]<(field==='limit'?1:0)||field==='limit'&&args[field]>(command==='assets.children'?1000:500)))throw Error('Invalid asset pagination');if(args.query!==undefined&&(typeof args.query!=='string'||args.query.length>500))throw Error('Asset search must be at most 500 characters');const catalog=assetCatalog()
 if(command==='assets.tree'){
  await assetIndex.prepare(catalog.mounts,inventory);const tree=await assetIndex.treeCounts(catalog.tree),cloud=cloudDocuments()
  const add=(node:AssetNode):number=>{if(node.location){const extra=cloud.filter(file=>file.owner?.conversation===node.location!.asset).length;if(extra)node.fileCount=(node.fileCount??0)+extra;return node.fileCount??0}const children=node.children??[];node.fileCount=children.reduce((n,child)=>n+add(child),0);if(!tree.indexing)node.nonemptyFolders=children.filter(child=>(child.fileCount??0)>0).length;return node.fileCount};add(tree);return tree
 }
 if(command==='assets.search'){
  await assetIndex.prepare(catalog.mounts,inventory,args.refresh===true)
  const cloud=cloudDocuments(args.root,args.query),offset=args.offset??0,limit=args.limit??100,cloudRows=cloud.slice(offset,offset+limit),files=await assetIndex.search({...args,offset:Math.max(0,offset-cloud.length),limit:Math.max(1,limit-cloudRows.length)})
  return {...files,entries:[...cloudRows,...(cloudRows.length===limit?[]:files.entries)],total:files.total+cloud.length,offset}
 }
 if(command==='assets.children'){
  const structural=find(catalog.tree,args.id)
  if(structural?.children&& !structural.location)return {entries:structural.children,total:structural.children.length,nextOffset:null}
  const [id,value]=split(args.id),mount=catalog.mounts.find(root=>root.id===id);if(!mount)throw Error('Unknown asset directory')
  let result:any
  await assetIndex.prepare(catalog.mounts,inventory)
  try{result=mount.remote?await assetRequest('assets.file',{id,operation:'list',path:value,hidden:args.hidden},call):await assetIndex.children(id,{path:value,hidden:args.hidden,offset:args.offset,limit:args.limit})}catch(error){if(value==='.'&&!fs.existsSync(mount.root)&&!mount.remote)return {entries:[],total:0,nextOffset:null};throw error}
  if(mount.remote){const total=result.entries.length,offset=args.offset??0,limit=args.limit??500;result={...result,entries:result.entries.slice(offset,offset+limit),total,nextOffset:offset+limit<total?offset+limit:null}}
  const store=readStore(),employees=mount.owner.team?catalog.mounts.filter(root=>root.owner.employee&&root.owner.team===mount.owner.team):[]
  const entries:AssetNode[]=result.entries.map((entry:any)=>{
   const owned=value==='.'&&entry.directory?employees.find(employee=>path.resolve(employee.root)===path.resolve(mount.root,entry.path)):undefined
   if(owned)return mountNode(owned)
   const member=mount.members?.[entry.path],card=store.sessions.find(card=>card.id===member)
   return {id:id+'|'+encodeURIComponent(entry.path),name:entry.name,label:card?.title,directory:entry.directory,locked:!!member||!!mount.readOnly,readOnly:mount.readOnly,symlink:entry.symlink,bytes:entry.bytes,modifiedAt:entry.modifiedAt,location:{asset:id,path:entry.path},owner:member?{...mount.owner,employee:member,label:mount.label+' / '+card!.title}:mount.owner}
  })
  if(value==='.'&&structural?.children)for(const child of structural.children.filter(child=>child.id.startsWith('published:')))entries.push(child)
  if(value==='.')for(const employee of employees)if(!entries.some(entry=>entry.id===employee.id))entries.push(mountNode(employee))
  const extra=value==='.'&&id.startsWith('channel:')?cloudDocuments(id):[]
  return {entries:[...await assetIndex.counts(entries,args.hidden),...(args.offset?[]:extra)],total:(result.total??entries.length)+extra.length,nextOffset:result.nextOffset??null}
 }
 if(command==='assets.file'){
  const mount=catalog.mounts.find(root=>root.id===args.id);if(!mount)throw Error('Unknown asset workspace')
  const {id,operation,trashId,...options}=args,parameters={...options,...(trashId?{id:trashId}:{})}
  let result:any
  if(id==='plan:exports'){fs.mkdirSync(mount.root,{recursive:true});result=workspaceFiles(mount.root,operation==='image'?'read-image':operation==='info'?'copy-info':operation==='chunk'?'copy-read':operation,{...parameters,length:262144})}
  else result=await call(mount.scope.conversation?'conversation.file':'workspace.'+operation,{...mount.scope,...parameters,...(mount.scope.conversation?{operation}:{} )})
  if(['write','mkdir','move','trash','restore'].includes(operation))assetIndex.invalidate()
  return result
 }
 throw Error('Unknown asset operation')
}
