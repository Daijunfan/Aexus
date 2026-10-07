import {scopeAllows} from './engine-scope'
import {readStore} from './store'
import {requestContext} from './authorization'
import {employeeSettings} from '../shared/types'
import {catalog} from './chat-group-store'
import {all} from './channel-store'
import {channelMemberIds} from './channel-members'
import {workspaceForMember} from './conversation-workspaces'
import type {WorkspaceChoice} from '../shared/message-collaboration'

export function workspaceCatalog(args:Record<string,any>){
 const principal=requestContext().principal,employee=args.employee==='self'||args.employee===undefined?(principal.kind==='agent'?principal.employeeId:undefined):args.employee
 if(!employee||principal.kind==='agent'&&employee!==principal.employeeId)throw Error('Choose your own employee identity; the user supplies employee explicitly')
 const store=readStore(),card=store.sessions.find(card=>card.id===employee&&!card.deleting)
 if(!card)throw Error('Unknown employee')
 const settings=employeeSettings(store,card),refs=[...catalog().groups.filter(g=>scopeAllows('groups',g.id)&&g.memberIds.includes(employee)).map(g=>'group:'+g.id),...all('SELECT id FROM channels').filter(c=>scopeAllows('channels',c.id)&&channelMemberIds(c.id).includes(employee)).map(c=>'channel:'+c.id)]
 const base={employeeId:card.id,employeeName:card.title,team:card.group}
 const workspaces:WorkspaceChoice[]=[{...base,id:'company:'+card.id,view:'company',name:card.group+' / '+card.title,path:card.cwd,location:settings.mode==='cloud'?'remote':'core',nativeAccess:settings.mode!=='cloud'||card.kind==='cloud-native-worker',fileApi:{command:'workspace.list',args:{employee:card.id,path:'.'}}},...refs.map(conversation=>{
  const workspace=workspaceForMember(conversation,employee,false)
  return {...base,id:conversation,view:'messages' as const,conversation,name:workspace.name+' / '+card.title,path:workspace.memberPath!,sharedRoot:workspace.root,memberDirectory:workspace.memberDirectory!,location:'core' as const,nativeAccess:workspace.nativeAccess,rootAccess:card.managementRole==='secretary'?'direct-files-write' as const:'read' as const,fileApi:{command:'conversation.file',args:{conversation,operation:'list',path:workspace.memberDirectory!}}}
 })]
 return {employeeId:employee,workspaces,total:workspaces.length}
}
