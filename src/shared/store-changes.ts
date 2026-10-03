import type {Store,StoredSession} from './types'
export type StoreChanges={baseRevision:number;revision:number;fields:string[];employeeIds:string[];authority:boolean;members:boolean;inbox:boolean}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const visual=new Set(['title','role','avatar','accessory','desk','seat','position','lastReply','createdBy','createdAt'])
const authority=(store:Store)=>({access:store.access,groups:store.groups,teamSettings:store.teamSettings,teamRoots:store.teamRoots,sessions:store.sessions.map(card=>Object.fromEntries(Object.entries(card).filter(([key])=>!visual.has(key))))})
const members=(cards:StoredSession[])=>cards.map(({id,title,group,managementRole,avatar,engine,deleting})=>({id,title,group,managementRole,avatar,engine,deleting}))
/** Conservative: new execution fields invalidate authority unless explicitly presentation-only. */
export function storeChanges(previous:Store|undefined,next:Store):StoreChanges{
 const before=previous??{sessions:[],groups:[],rooms:{}},prior=new Map(before.sessions.map(card=>[card.id,card])),current=new Map(next.sessions.map(card=>[card.id,card]))
 const fields=[...new Set([...Object.keys(before),...Object.keys(next)])].filter(key=>key!=='revision'&&!equal((before as any)[key],(next as any)[key]))
 const employeeIds=[...new Set([...prior.keys(),...current.keys()])].filter(id=>!equal(prior.get(id),current.get(id)))
 const memberChange=!equal(members(before.sessions),members(next.sessions))
 return {baseRevision:before.revision??0,revision:next.revision??0,fields,employeeIds,authority:!equal(authority(before),authority(next)),members:memberChange,inbox:memberChange||employeeIds.some(id=>!equal(prior.get(id)?.lastReply,current.get(id)?.lastReply))}
}
export const affectsMembers=(payload:{changes?:StoreChanges})=>!payload?.changes||payload.changes.members||payload.changes.authority
export const affectsInbox=(payload:{changes?:StoreChanges})=>!payload?.changes||payload.changes.inbox||payload.changes.authority
