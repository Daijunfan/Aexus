import {projectEngineStore,scopeAllows,currentEngineScope,hasEngineScope,assertScope,engineSelection} from './engine-scope'
import {assetHost,localAssetHost} from './asset-hosts'
import {channelEngine} from './channel-engines'
import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/core-paths'
import {directoryName} from '../shared/directory-names'
import type {AssetNode,AssetOwner,AssetFilters,AssetTree,AssetLocation,AssetHost,AssetBrowse} from '../shared/asset-schema'
import {assetFileKind,assetNodeId} from '../shared/asset-presentation'
import type {FileLocation} from '../shared/transfers'
import {requestContext} from './authorization'
import {readStore} from './store'
import {teamSettings,employeeSettings} from '../shared/types'
import {catalog} from './chat-group-store'
import {groupMediaRoot} from './chat-groups'
import {all,projectChannelDocuments,postSelect} from './channel-store'
import {workspaceForMember} from './conversation-workspaces'
import {sharedDirectory} from './shared-directory'
import {workspaceFiles,workspacePath} from './files'
import {assetIndex} from './asset-index'

type Call=(command:string,args:Record<string,unknown>)=>Promise<any>
export type AssetMount={host?:AssetHost;id:string;name:string;label:string;root:string;scope:Omit<FileLocation,'path'>;owner:AssetOwner;remote?:boolean;readOnly?:boolean;members?:Record<string,string>;memberOwners?:Record<string,AssetOwner>;kind?:string}
const planExportsRoot=()=>typeof currentEngineScope()==='string'?path.join(APP_HOME,'plan-assets','engines',currentEngineScope()!):path.join(APP_HOME,'plan-assets')
const operator=()=>{if(requestContext().principal.kind!=='operator')throw Error('Only the user may browse all company assets')}
const folder=(id:string,name:string,children:AssetNode[]=[]):AssetNode=>({id,name,directory:true,locked:true,children})
const mountNode=(mount:AssetMount):AssetNode=>({...folder(mount.id,mount.name),host:mount.host,label:mount.label,kind:mount.kind,storage:mount.remote?'remote':'local',owner:mount.owner,readOnly:mount.readOnly,location:{asset:mount.id,path:'.'},children:undefined})

/** View folders are a projection of existing identities, never a second workspace store. */
export function assetCatalog(){
 operator();const selection=engineSelection(),store=projectEngineStore(readStore()),mounts:AssetMount[]=[],add=(mount:AssetMount)=>{mount.host??=localAssetHost();mounts.push(mount);return mountNode(mount)}
 const company=hasEngineScope()?[]:[add({id:'shared',name:'Shared',label:'Shared',root:sharedDirectory(),scope:{shared:true},kind:'shared',owner:{view:'Company',label:'Shared'}})]
 for(const team of store.groups){
  const config=teamSettings(store,team),root=store.teamRoots?.[team];if(!root)continue
  const owner:AssetOwner={view:'Company',label:team,team},id='team:'+encodeURIComponent(team)
  const whole=!selection||selection.fullTeams.includes(team)
  const workspace=whole?add({id,name:'Workspace',label:team,root,scope:{team},kind:'team',owner,host:assetHost(config),remote:config.mode==='cloud'}):folder('company:'+encodeURIComponent(team),team)
  const employees=store.sessions.filter(card=>card.group===team&&!card.deleting).map(card=>add({id:'employee:'+card.id,name:directoryName(card.title,'employee'),label:card.title,root:card.cwd,scope:{employee:card.id},kind:'employee',owner:{...owner,label:team+' / '+card.title,employee:card.id,employeeName:card.title,avatar:card.avatar,color:card.color},host:assetHost(employeeSettings(store,card)),remote:employeeSettings(store,card).mode==='cloud'}))
  workspace.children=employees.map(employee=>{const paths=root.includes('\\')?path.win32:path.posix,member=mounts.find(mount=>mount.id===employee.id)!,part=paths.relative(root,member.root);return {...employee,external:part==='..'||part.startsWith('..'+paths.sep)||paths.isAbsolute(part)}});company.push({...folder('company:'+encodeURIComponent(team),directoryName(team,'team'),whole?[workspace]:employees),label:team,kind:'team',owner})
 }
 const conversation=(kind:'group'|'channel',item:{id:string;name:string})=>{
  const ref=kind+':'+item.id,workspace=workspaceForMember(ref,undefined,false)
  return add({id:ref,name:workspace.folderName,label:item.name,root:workspace.root,scope:{conversation:ref},owner:{view:'Messages',label:item.name,conversation:ref,conversationName:item.name},kind,members:Object.fromEntries(workspace.members.map(member=>[member.directory,member.employeeId])),memberOwners:Object.fromEntries(workspace.members.map(member=>[member.directory,{view:'Messages',label:item.name+' / '+member.name,conversation:ref,conversationName:item.name,employee:member.employeeId,employeeName:member.name,avatar:store.sessions.find(card=>card.id===member.employeeId)?.avatar,color:store.sessions.find(card=>card.id===member.employeeId)?.color,team:store.sessions.find(card=>card.id===member.employeeId)?.group}]))})
 }
 const groups=catalog().groups.filter(g=>scopeAllows('groups',g.id)).map(item=>{const node=conversation('group',item);const published=add({id:'published:group:'+item.id,name:'Published',label:item.name+' / Published',root:groupMediaRoot(item.id),scope:{group:item.id},kind:'published',owner:{view:'Messages',label:item.name,conversation:'group:'+item.id},readOnly:true});published.external=true;node.children=[published];return node}),channels=all('SELECT id,name FROM channels').filter(c=>scopeAllows('channels',c.id)).map(item=>conversation('channel',{id:String(item.id),name:String(item.name)}))
 const plan=add({id:'plan:exports',name:'Exports',label:'Plan exports',root:planExportsRoot(),scope:{},kind:'exports',owner:{view:'Plan',label:'Exports'}})
 return {tree:folder('root','Workspaces',[folder('company','Company',company),folder('messages','Messages',[folder('groups','Groups',groups),folder('channels','Channels',channels)]),folder('plan','Plan',[plan])]),mounts}
}
export function assetLocation(id:string,value?:string){
 operator();const parsed=assetReference(id,value);id=parsed.asset;value=parsed.path;const store=readStore()
 if(id==='shared'){if(hasEngineScope())throw Error('Choose an Engine workspace');return {shared:true,path:value}}
 if(id==='plan:exports'){const root=planExportsRoot();fs.mkdirSync(root,{recursive:true});return {local:true,path:workspacePath(root,value)}}
 if(id.startsWith('published:group:'))return {group:id.slice(16),path:value}
 if(id.startsWith('published:channel:')){
  const channel=id.slice(18)
  // Pre-fix asset rows and copied references contained mediaId alone.
  if(!value.includes('/')&&value!=='.'){const row=all('SELECT m.post_id FROM media m JOIN sources s ON s.id=m.source_id WHERE m.id=? AND s.channel_id=?',value,channel)[0];if(row)value=row.post_id+'/'+value}
  return {channel,path:value}
 }
 if(id.startsWith('employee:')){const employee=id.slice(9);assertScope('employees',employee);if(store.sessions.some(card=>card.id===employee&&!card.deleting))return {employee,path:value}}
 if(id.startsWith('team:')){const team=decodeURIComponent(id.slice(5));assertScope('teams',team);const selected=engineSelection();if(selected&&!selected.fullTeams.includes(team))throw Error('Only an explicitly linked Team exposes its root workspace');if(store.groups.includes(team))return {team,path:value}}
 if(/^(group|channel):/.test(id)){workspaceForMember(id,undefined,false);return {conversation:id,path:value}}
 throw Error('Asset workspace no longer exists')
}
const find=(node:AssetNode,id:string):AssetNode|undefined=>node.id===id?node:node.children?.map(child=>find(child,id)).find(Boolean)
export function assetReference(id:string,value?:string){
 if(typeof id!=='string'||!id)throw Error('Choose a valid asset reference')
 const at=id.indexOf('|');let suffix='.'
 try{if(at>=0)suffix=decodeURIComponent(id.slice(at+1))}catch{throw Error('Invalid asset path encoding')}
 const asset=at<0?id:id.slice(0,at),file=value??suffix
 if(typeof file!=='string'||file.includes('\0')||file.includes('\\')||path.posix.isAbsolute(file)||file.split('/').includes('..'))throw Error('Asset path is outside its workspace')
 return {asset,path:path.posix.normalize(file||'.')}
}
const split=(id:string)=>{const ref=assetReference(id);return [ref.asset,ref.path]}

const documentHost=(channelId:string)=>{const engine=channelEngine(channelId);return engine.kind==='external'&&engine.fileStorage?assetHost({mode:'cloud',hostId:engine.fileStorage.hostId}):undefined}
function cloudDocuments(root?:string,query=''):AssetNode[]{
 const result:AssetNode[]=[]
 for(const row of all(postSelect+" WHERE p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) AND p.remote_files<>'[]'",Date.now())){
  if(!scopeAllows('channels',row.channel_id)||root&&root!=='channel:'+row.channel_id)continue
  for(const file of projectChannelDocuments(row))if(!file.savedPath&&(!query||(file.name+' '+row.source_name).toLocaleLowerCase().includes(query.toLocaleLowerCase())))result.push({id:'cloud:'+row.id+':'+file.id,name:file.name,directory:false,locked:true,storage:'cloud',kind:assetFileKind(file.name),host:documentHost(row.channel_id),bytes:file.bytes,modifiedAt:row.published_at,owner:{view:'Messages',label:row.source_name,conversation:'channel:'+row.channel_id},document:{postId:row.id,fileId:file.id}})
 }
 for(const row of all("SELECT m.*,s.channel_id,s.name AS source_name FROM media m JOIN posts p ON p.id=m.post_id JOIN sources s ON s.id=p.source_id WHERE p.state='active' AND (p.saved_at IS NOT NULL OR p.expires_at>?) AND EXISTS(SELECT 1 FROM json_each(p.media_ids) WHERE value=m.id)",Date.now()))if(scopeAllows('channels',row.channel_id)&&(!root||root==='channel:'+row.channel_id)&&(!query||(row.name+' '+row.source_name).toLocaleLowerCase().includes(query.toLocaleLowerCase())))result.push({id:'published-media:'+row.id,name:row.name,directory:false,locked:true,readOnly:true,storage:'local',host:localAssetHost(),kind:assetFileKind(row.name),bytes:row.bytes,owner:{view:'Messages',label:row.source_name,conversation:'channel:'+row.channel_id},location:{asset:'published:channel:'+row.channel_id,path:row.post_id+'/'+row.id}})
 return result
}

type Catalog=ReturnType<typeof assetCatalog>
type QueryScope=AssetFilters&{sharedConversations:string[];employeeTeam?:string}
function queryScope(args:Record<string,any>,catalog:Catalog):QueryScope{
 const store=readStore(),employee=args.employee?store.sessions.find(card=>card.id===args.employee&&!card.deleting):undefined
 if(args.view!==undefined&&!['Company','Messages','Plan'].includes(args.view))throw Error('Choose Company, Messages or Plan')
 if(args.employee!==undefined&&!employee)throw Error('Employee no longer exists; clear the employee filter')
 if(args.team!==undefined&&!store.groups.includes(args.team))throw Error('Team no longer exists; clear the Team filter')
 if(args.kind!==undefined&&!['folder','all','document','image','audio','video','code','archive','other'].includes(args.kind))throw Error('Choose a supported asset type')
 if(args.storage!==undefined&&!['local','remote','cloud'].includes(args.storage))throw Error('Choose local, remote or cloud storage')
 if(args.sort!==undefined&&!['name','modified','size'].includes(args.sort))throw Error('Choose name, modified or size sorting')
 const sharedConversations=catalog.mounts.filter(mount=>mount.owner.conversation&&Object.values(mount.memberOwners??{}).some(owner=>(!employee||owner.employee===employee.id)&&(!args.team||owner.team===args.team))).map(mount=>mount.owner.conversation!)
 return {host:args.host,view:args.view,team:args.team,employee:args.employee,conversation:args.conversation,kind:args.kind,storage:args.storage,sort:args.sort,sharedConversations,employeeTeam:employee?.group}
}
function owns(owner:AssetOwner|undefined,scope:QueryScope){
 if(!owner)return !scope.view&&!scope.team&&!scope.employee&&!scope.conversation
 if(scope.view&&owner.view!==scope.view||scope.conversation&&owner.conversation!==scope.conversation)return false
 if(scope.team&&owner.team!==scope.team&&!(owner.employee===undefined&&owner.conversation&&scope.sharedConversations.includes(owner.conversation)))return false
 if(scope.employee&&owner.employee!==scope.employee&&!(owner.employee===undefined&&(owner.conversation&&scope.sharedConversations.includes(owner.conversation)||!owner.conversation&&owner.team===scope.employeeTeam)))return false
 return true
}
function memberNodes(mount:AssetMount):AssetNode[]{return Object.entries(mount.memberOwners??{}).map(([directory,owner])=>({id:assetNodeId(mount.id,directory),name:directory,label:owner.employeeName,kind:'member',host:mount.host,storage:mount.remote?'remote':'local',directory:true,locked:true,owner,location:{asset:mount.id,path:directory}}))}
const publishedWorkspace=(channelId:string,name:string):AssetNode=>({id:'published:channel:'+channelId,name:'Published',label:'Published attachments',kind:'published',directory:true,locked:true,readOnly:true,storage:'local',host:localAssetHost(),owner:{view:'Messages',label:name,conversation:'channel:'+channelId,conversationName:name},location:{asset:'published:channel:'+channelId,path:'.'}})
function enrichedTree(catalog:Catalog,scope:QueryScope):AssetNode{
 const visit=(node:AssetNode):AssetNode|undefined=>{
  const mount=catalog.mounts.find(mount=>mount.id===node.id),members=mount?memberNodes(mount):[],published=node.id.startsWith('channel:')?[publishedWorkspace(node.id.slice(8),mount?.label??node.name)]:[]
  const children=[...(node.children??[]),...members,...published].map(visit).filter((node):node is AssetNode=>!!node)
  if(node.location&&(!owns(node.owner,scope)||scope.host&&node.host?.id!==scope.host)&&!children.length)return
  if(!node.location&&!['root','company','messages','groups','channels','plan'].includes(node.id)&&!children.length)return
  return {...node,children:children.length||node.children?children:undefined}
 }
 return visit(catalog.tree)!
}
const facets=(catalog:Catalog)=>{const store=projectEngineStore(readStore());return {hosts:[...new Map([...catalog.mounts.map(mount=>mount.host!),...cloudDocuments().map(node=>node.host).filter((host):host is AssetHost=>!!host)].map(host=>[host.id,host])).values()],teams:[...store.groups],employees:store.sessions.filter(card=>!card.deleting).map(card=>({id:card.id,name:card.title,team:card.group})),conversations:catalog.mounts.filter(mount=>mount.kind==='group'||mount.kind==='channel').map(mount=>({id:mount.id,name:mount.label,kind:mount.kind as 'group'|'channel'}))}}
const pageSlice=(entries:AssetNode[],args:Record<string,any>)=>{const offset=args.offset??0,limit=args.limit??500;return {entries:entries.slice(offset,offset+limit),total:entries.length,nextOffset:offset+limit<entries.length?offset+limit:null}}
function publishedImages(id:string,value='.'){
 const channelId=id.slice(18),files=cloudDocuments('channel:'+channelId).filter(node=>!node.document&&node.location)
 return value==='.'?files:files.filter(node=>node.location!.path.startsWith(value.replace(/\/$/,'')+'/'))
}
function rootScopes(catalog:Catalog,id?:string){
 if(!id)return hasEngineScope()?catalog.mounts.map(m=>({id:m.id,path:'.'})):undefined
 const [root,value]=split(id),mount=catalog.mounts.find(mount=>mount.id===root)
 if(mount)return [{id:root,path:value}]
 const node=find(enrichedTree(catalog,{sharedConversations:[]}),root);if(!node)throw Error('Workspace no longer exists; refresh the file list')
 const scopes:{id:string;path:string}[]=[];const walk=(node:AssetNode)=>{if(node.location?.asset)scopes.push({id:node.location.asset,path:node.location.path});for(const child of node.children??[])walk(child)};walk(node);return scopes
}
function filterCloud(nodes:AssetNode[],scope:QueryScope,scopes?:{id:string;path:string}[]){return nodes.filter(node=>owns(node.owner,scope)&&(!scope.host||node.host?.id===scope.host)&&(!scope.kind||scope.kind==='all'||assetFileKind(node.name)===scope.kind)&&(!scope.storage||node.storage===scope.storage)&&(!scopes||scopes.some(root=>root.path==='.'&&(root.id===node.owner?.conversation||root.id===node.location?.asset))))}
function ancestors(node:AssetNode,id:string,path:{id:string;name:string}[]=[]):{id:string;name:string}[]|undefined{const here=[...path,{id:node.id,name:node.label??node.name}];return node.id===id?here:node.children?.map(child=>ancestors(child,id,here)).find(Boolean)}
export async function locateAsset(id:string,catalog:Catalog,call:Call):Promise<AssetLocation>{
 const tree=enrichedTree(catalog,{sharedConversations:[]}),advertised=cloudDocuments().find(node=>node.id===id)
 if(advertised?.document){const parent=find(tree,advertised.owner!.conversation!)!;return {node:advertised,workspace:parent,parent,breadcrumbs:ancestors(tree,parent.id)??[],canReveal:false}}
 let ref=advertised?.location?.asset?{asset:advertised.location.asset,path:advertised.location.path}:assetReference(id)
 if(ref.asset.startsWith('published:channel:')){const mapped=assetLocation(ref.asset,ref.path);ref={asset:ref.asset,path:mapped.path}}
 const mount=catalog.mounts.find(mount=>mount.id===ref.asset),workspace=find(tree,ref.asset)
 if(!workspace)throw Error('Workspace no longer exists; refresh the file list')
 const pathParts=ref.path==='.'?[]:ref.path.split('/'),base=ancestors(tree,workspace.id)??[],parentPath=pathParts.slice(0,-1).join('/')||'.'
 if(!workspace.location)return {node:workspace,workspace,parent:workspace,breadcrumbs:base,canReveal:false}
 const media=ref.asset.startsWith('published:channel:')?publishedImages(ref.asset).find(node=>node.location?.path===ref.path):undefined
 if(ref.asset.startsWith('published:channel:')&&!media&&ref.path!=='.'){
  const items=publishedImages(ref.asset,ref.path);if(!items.length)throw Error('Published file no longer exists; refresh the file list')
 }
 let node:AssetNode
 if(media)node={...media,id:assetNodeId(ref.asset,ref.path)}
 else if(!pathParts.length)node=workspace
 else if(ref.asset.startsWith('published:channel:'))node={...workspace,id:assetNodeId(ref.asset,ref.path),name:'Published post',label:'Published post',location:{asset:ref.asset,path:ref.path},children:undefined}
 else{
  const info=await call('assets.file',{id:ref.asset,path:ref.path,operation:'info'});if(!info.exists)throw Error('File no longer exists; refresh the file list')
  const owner=mount?.memberOwners?.[pathParts[0]]??mount?.owner??workspace.owner
  node={id:assetNodeId(ref.asset,ref.path),name:pathParts.at(-1)!,directory:!!info.directory,locked:!!workspace.readOnly||!!mount?.members?.[ref.path],readOnly:workspace.readOnly,storage:workspace.storage,host:workspace.host,kind:mount?.members?.[ref.path]?'member':info.directory?'folder':assetFileKind(pathParts.at(-1)!),owner,bytes:info.bytes,modifiedAt:info.modifiedAt,symlink:info.symlink,location:{asset:ref.asset,path:ref.path}}
 }
 const parent=node.directory?node:media||parentPath==='.'?workspace:{...workspace,id:assetNodeId(ref.asset,parentPath),name:parentPath.split('/').at(-1)!,label:mount?.memberOwners?.[parentPath]?.employeeName,location:{asset:ref.asset,path:parentPath},children:undefined}
 const breadcrumbs=[...base,...(media?[]:pathParts.slice(0,node.directory?undefined:-1)).map((name,index)=>({id:assetNodeId(ref.asset,pathParts.slice(0,index+1).join('/')),name:mount?.memberOwners?.[pathParts.slice(0,index+1).join('/')]?.employeeName??name}))]
 return {node,workspace,parent,breadcrumbs,canReveal:node.storage!=='cloud'&&node.storage!=='remote'&&!!node.location&&(!ref.asset.startsWith('published:channel:')||!!media)}
}

export async function assetRequest(command:string,args:Record<string,any>,call:Call,inventory?:(ref:FileLocation,args:any)=>Promise<any>){
 operator();for(const field of ['offset','limit'])if(args[field]!==undefined&&(!Number.isSafeInteger(args[field])||args[field]<(field==='limit'?1:0)||field==='limit'&&args[field]>(command==='assets.children'?1000:500)))throw Error('Invalid asset pagination');if(args.query!==undefined&&(typeof args.query!=='string'||args.query.length>500))throw Error('Asset search must be at most 500 characters')
 const catalog=assetCatalog(),scope=queryScope(args,catalog)
 if(command==='assets.browse')return browseAssets(args,catalog,scope,call,inventory)
 if(command==='assets.locate')return locateAsset(args.id,catalog,call)
 if(command==='assets.tree'){
  await assetIndex.prepare(catalog.mounts,inventory);const tree=await assetIndex.treeCounts(enrichedTree(catalog,scope),scope),cloud=filterCloud(cloudDocuments(),scope)
  const add=(node:AssetNode):number=>{
   for(const child of node.children??[])add(child)
   if(node.id.startsWith('published:channel:'))node.fileCount=cloud.filter(file=>file.location?.asset===node.id).length
   else if(node.location)node.fileCount=(node.fileCount??0)+cloud.filter(file=>file.owner?.conversation===node.id).length
   else node.fileCount=(node.children??[]).reduce((sum,child)=>sum+(child.fileCount??0),0)
   return node.fileCount??0
  };add(tree)
  return {...tree,facets:facets(catalog)} satisfies AssetTree
 }
 if(command==='assets.search'){
  await assetIndex.prepare(catalog.mounts,inventory,args.refresh===true)
  const scopes=rootScopes(catalog,args.root),cloud=filterCloud(cloudDocuments(undefined,args.query),scope,scopes),offset=args.offset??0,limit=args.limit??100
  // Ask for only the prefix needed to merge remote publication metadata with indexed files.
  const count=offset+limit,files=await assetIndex.search({...args,...scope,scopes,root:undefined,offset:cloud.length?0:offset,limit:cloud.length?count:limit})
  type Ordered=AssetNode&{_orderKey?:string[]}
  const keys=(node:Ordered)=>node._orderKey??[node.name.replace(/[A-Z]/g,char=>char.toLowerCase()),node.location?.asset??node.id,node.location?.path??'']
  const order=(a:Ordered,b:Ordered)=>{const metric=args.sort==='modified'?(b.modifiedAt??0)-(a.modifiedAt??0):args.sort==='size'?(b.bytes??0)-(a.bytes??0):0;if(metric)return metric;const ka=keys(a),kb=keys(b);for(let i=0;i<3;i++){const diff=Buffer.compare(Buffer.from(ka[i]),Buffer.from(kb[i]));if(diff)return diff}return 0}
  const entries=(cloud.length?[...cloud,...files.entries].sort(order).slice(offset,count):files.entries).map(({_orderKey,...node}:Ordered)=>node)
  return {...files,entries,total:files.total+cloud.length,offset}
 }
 if(command==='assets.children'){
  const tree=enrichedTree(catalog,scope),structural=find(tree,args.id)
  if(structural?.children&&!structural.location)return pageSlice(structural.children,args)
  const [id,value]=split(args.id)
  if(id.startsWith('published:channel:'))return pageSlice(filterCloud(publishedImages(id,value),scope),args)
  const mount=catalog.mounts.find(root=>root.id===id);if(!mount)throw Error('Workspace no longer exists; refresh the file list')
  await assetIndex.prepare(catalog.mounts,inventory)
  const rootNode=find(tree,id),virtual=(value==='.'?rootNode?.children??[]:[]).filter(node=>node.directory),skip=memberNodes(mount).map(node=>node.location!.path)
  const employees=value==='.'?catalog.mounts.filter(root=>root.owner.employee&&root.owner.team===mount.owner.team&&mount.owner.team&&mount.kind==='team'):[]
  for(const member of employees){const paths=mount.remote?path.posix:path,part=paths.relative(mount.root.replaceAll('\\','/'),member.root.replaceAll('\\','/'));if(part&&!part.includes('/'))skip.push(part)}
  const extra=[...virtual,...(value==='.'&&id.startsWith('channel:')?filterCloud(cloudDocuments(id),scope).filter(node=>node.document):[])]
  const offset=args.offset??0,limit=args.limit??500,prefix=extra.slice(offset,offset+limit),physicalOffset=Math.max(0,offset-extra.length),physicalLimit=Math.max(1,limit-prefix.length)
  let result:any
  try{
   if(mount.remote){const data=await call('assets.file',{id,operation:'list',path:value,hidden:args.hidden}),items=data.entries.filter((entry:any)=>!skip.includes(entry.path));result={entries:items.slice(physicalOffset,physicalOffset+physicalLimit),total:items.length}}
   else result=await assetIndex.children(id,{path:value,hidden:args.hidden,offset:physicalOffset,limit:physicalLimit,exclude:skip,sort:args.sort})
  }catch(error){if(!mount.remote&&!fs.existsSync(mount.root)&&value==='.')result={entries:[],total:0};else throw error}
  const entries:AssetNode[]=result.entries.map((entry:any)=>{const owner=mount.memberOwners?.[entry.path.split('/')[0]]??mount.owner;return {id:assetNodeId(id,entry.path),name:entry.name,label:mount.memberOwners?.[entry.path]?.employeeName,directory:entry.directory,kind:entry.directory?(mount.members?.[entry.path]?'member':undefined):assetFileKind(entry.name),locked:!!mount.members?.[entry.path]||!!mount.readOnly,readOnly:mount.readOnly,host:mount.host,storage:mount.remote?'remote':'local',symlink:entry.symlink,bytes:entry.bytes,modifiedAt:entry.modifiedAt,location:{asset:id,path:entry.path},owner}})
  const total=extra.length+result.total
  const counted=await assetIndex.counts([...prefix,...(prefix.length===limit?[]:entries)],args.hidden,scope)
  for(const node of counted)if(node.id.startsWith('published:channel:')&&node.directory)node.fileCount=filterCloud(publishedImages(node.id),scope).length
  return {entries:counted,total,nextOffset:offset+limit<total?offset+limit:null}
 }
 if(command==='assets.file'){
  const ref=assetReference(args.id,args.path),id=ref.asset,operation=args.operation
  if(id.startsWith('published:channel:')&&operation==='list'){const entries=publishedImages(id,ref.path).map(node=>({...node,path:node.location!.path,symlink:false}));return {path:ref.path,entries}}
  const mount=catalog.mounts.find(root=>root.id===id);if(!mount)throw Error('Workspace no longer exists; refresh the file list')
  const {id:_,operation:__,trashId,...options}=args,parameters={...options,path:ref.path,...(trashId?{id:trashId}:{})}
  let result:any
  if(id==='plan:exports'){fs.mkdirSync(mount.root,{recursive:true});result=workspaceFiles(mount.root,operation==='image'?'read-image':operation==='info'?'copy-info':operation==='chunk'?'copy-read':operation,{...parameters,length:262144})}
  else result=await call(mount.scope.conversation?'conversation.file':'workspace.'+operation,{...mount.scope,...parameters,...(mount.scope.conversation?{operation}:{} )})
  if(['write','mkdir','move','trash','restore'].includes(operation))assetIndex.invalidate()
  return result
 }
 throw Error('Unknown asset operation')
}

async function browseAssets(args:Record<string,any>,catalog:Catalog,scope:QueryScope,call:Call,inventory?: (ref:FileLocation,args:any)=>Promise<any>):Promise<AssetBrowse>{
 const root=args.root??'root',offset=args.offset??0,limit=args.limit??60
 if(typeof root!=='string'||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error('Use a canonical root and limit 1–200')
 const recursive=!!args.query?.trim()||!!scope.storage||!!scope.kind&&scope.kind!=='all'
 if(recursive){
  const result=await assetRequest('assets.search',{...args,root:root==='root'?undefined:root,query:args.query?.trim(),offset,limit,folders:true},call,inventory)
  return {...result,nextOffset:offset+limit<result.total?offset+limit:null,parent:folder('root','Search results'),breadcrumbs:[{id:'root',name:'All spaces'}]}
 }
 await assetIndex.prepare(catalog.mounts,inventory)
 if(root==='root'){
  const candidates=catalog.mounts.flatMap(mount=>scope.employee?[...(mount.owner.employee===scope.employee?[mountNode(mount)]:[]),...memberNodes(mount).filter(node=>node.owner?.employee===scope.employee)]:mount.owner.employee||mount.kind==='published'?[]:[mountNode(mount)])
  const matching=candidates.filter(node=>owns(node.owner,scope)&&(!scope.host||node.host?.id===scope.host)).sort((a,b)=>(a.owner?.view??'').localeCompare(b.owner?.view??'')||assetTitleForSort(a).localeCompare(assetTitleForSort(b)))
  const entries=await assetIndex.counts(matching.slice(offset,offset+limit),args.hidden,scope),status=await assetIndex.search({limit:1})
  return {entries,total:matching.length,nextOffset:offset+limit<matching.length?offset+limit:null,parent:folder('root','Your file library'),breadcrumbs:[{id:'root',name:'All spaces'}],indexing:status.indexing,errors:status.errors}
 }
 const location=await locateAsset(root,catalog,call)
 if(!location.node.directory)throw Error('Choose a folder to browse')
 const result=await assetRequest('assets.children',{...args,id:root,offset,limit},call,inventory),status=await assetIndex.search({limit:1})
 return {...result,parent:location.node,breadcrumbs:location.breadcrumbs,indexing:status.indexing,errors:status.errors}
}
const assetTitleForSort=(node:AssetNode)=>node.label??node.name
