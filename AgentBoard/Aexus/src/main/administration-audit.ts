import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {APP_HOME} from '../shared/core-paths'
import {atomicJson,readJson} from './atomic-file'
import {requestContext} from './request-context'
import {requireApplicationAdministrator} from './application-administrator'
import type {PrincipalRef} from '../shared/management'
type Entry={id:string;at:number;actor:PrincipalRef;command:string;target?:string;status:'succeeded'|'failed'}
const file=join(APP_HOME,'administration-audit.json')
export function recordAdministration(command:string,target:string|undefined,status:Entry['status']){
 const entries=readJson<Entry[]>(file,()=>[])
 // Never persist arguments, credentials, message bodies or filesystem contents.
 entries.push({id:randomUUID(),at:Date.now(),actor:requestContext().principal,command,...(target?{target}:{}),status})
 atomicJson(file,entries.slice(-2000),true)
}
export function administrationAudit(args:Record<string,any>){
 requireApplicationAdministrator()
 const limit=args.limit??100,before=args.before??Number.MAX_SAFE_INTEGER
 if(!Number.isSafeInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(before)||before<0)throw Error('Use limit 1–500 and a timestamp cursor')
 let rows=readJson<Entry[]>(file,()=>[]).filter(entry=>entry.at<before).reverse()
 if(args.beforeId!==undefined){if(typeof args.beforeId!=='string')throw Error('beforeId must be an audit record ID');const index=rows.findIndex(entry=>entry.id===args.beforeId);if(index<0)throw Error('Audit cursor expired or unknown; reload the latest page');rows=rows.slice(index+1)}
 const entries=rows.slice(0,limit),hasMore=rows.length>limit
 return {entries,retention:2000,hasMore,nextCursor:hasMore?entries.at(-1)!.id:null}
}
