import {statSync} from 'node:fs'
import {workspacePath} from './files'
import {requestContext} from './request-context'
import type {FileEndpoint} from './transfers'

let reveal:((path:string)=>void)|undefined
export function setFileRevealer(value:(path:string)=>void){reveal=value}
/** Resolve and authorize in Core before asking the local desktop to reveal a path. */
export async function revealWorkspaceFile(endpoint:FileEndpoint){
 if(requestContext().clientId?.startsWith('web-'))throw Error('The browser cannot open Finder on this device. Download a file, then use the browser downloads list to show it in Finder.')
 if(endpoint.remote)throw Error('This item is on a remote host. Download the file, or copy the folder to Shared, then open the local copy in Finder.')
 await endpoint.validate?.('copy-info',{path:endpoint.path})
 const file=workspacePath(endpoint.root,endpoint.path)
 statSync(file)
 if(!reveal)throw Error('Open the desktop app on the Core host to reveal this item in its file manager.')
 reveal(file)
 return {path:file,revealed:true}
}
