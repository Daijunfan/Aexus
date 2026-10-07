import {MESSAGE_COLLABORATION_COMMANDS} from '../shared/message-collaboration'
import {workspaceCatalog} from './workspace-catalog'
import {conversationEntry,downloadAttachment,downloadStatus} from './conversation-attachments'
import {postTriggerRequest} from './channel-post-triggers'
import type {FileLocation} from '../shared/transfers'
import type {FileEndpoint} from './transfers'

/** Shared dispatch for the GUI, CLI and authenticated employee tools. */
export function messageCollaborationRequest(command:string,args:Record<string,any>,resolve:(ref:FileLocation,destination:boolean)=>FileEndpoint){
 const schema=MESSAGE_COLLABORATION_COMMANDS.find(c=>c.name===command)?.inputSchema
 if(!schema)throw Error('Unknown Message collaboration API')
 for(const key of Object.keys(args))if(args[key]!==undefined&&!Object.hasOwn(schema.properties,key))throw Error('Unknown Message collaboration field: '+key)
 for(const key of schema.required??[])if(args[key]===undefined)throw Error('Missing required field: '+key)
 if(command==='workspace.catalog')return workspaceCatalog(args)
 if(command==='conversation.entry')return conversationEntry(args)
 if(command==='conversation.download')return downloadAttachment(args,resolve)
 if(command==='conversation.download-status')return downloadStatus(args)
 return postTriggerRequest(command,args)
}
