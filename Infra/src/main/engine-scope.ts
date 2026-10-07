import fs from 'node:fs'
import {join} from 'node:path'
import {APP_HOME} from '../shared/core-paths'
import type {Store} from '../shared/types'
import {atomicJson,readJson} from './atomic-file'
import {optionalRequestContext} from './request-context'
import {emitCoreEvent} from './core-events'

export const RESOURCE_KINDS=['teams','employees','groups','channels','schedules','categories','planViews','teamViews'] as const
export type ResourceKind=typeof RESOURCE_KINDS[number]
export type ResourceSet=Record<ResourceKind,string[]>
type Binding={resources:ResourceSet;excluded:ResourceSet}
type Registry={version:1;revision:number;engines:Record<string,Binding>}
type Catalog={store:Store;groups:{id:string;memberIds:string[]}[];channels:{id:string;memberIds:string[]}[]}
const empty=():ResourceSet=>Object.fromEntries(RESOURCE_KINDS.map(key=>[key,[]])) as unknown as ResourceSet
const file=join(APP_HOME,'engine-resources.json')
let catalog:()=>Catalog=()=>{throw Error('Engine resource catalog is not ready')}
export function configureEngineScope(read:()=>Catalog){catalog=read}
export const currentEngineScope=()=>optionalRequestContext()?.engineScope
export const hasEngineScope=()=>currentEngineScope()!==undefined
export function validEngineScope(value:unknown):value is string{return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/.test(value)&&value.length<=100}
function registry():Registry{return readJson<Registry>(file,()=>({version:1,revision:0,engines:{}}),(value:any)=>!!value&&value.version===1&&Number.isSafeInteger(value.revision)&&!!value.engines&&typeof value.engines==='object'&&!Array.isArray(value.engines)&&Object.entries(value.engines as Record<string,Binding>).every(([id,b])=>validEngineScope(id)&&!!b&&[b.resources,b.excluded].every(r=>!!r&&RESOURCE_KINDS.every(k=>Array.isArray(r[k])&&r[k].every((id:unknown)=>typeof id==='string')))))}
let publishScope=(revision:number)=>emitCoreEvent({channel:'engine-scope:changed',payload:{revision}})
export function setEngineScopeEmitter(emit:(channel:string,payload:unknown)=>void){publishScope=revision=>emit('engine-scope:changed',{revision})}
function persist(value:Registry){value.revision++;atomicJson(file,value,true);publishScope(value.revision)}
function binding(value:Registry,id:string){return value.engines[id]??={resources:empty(),excluded:empty()}}
/** Associations contain IDs only; canonical objects, history, authority and files stay in their original stores. */
export function bindEngineResources(engineId:string,resources:Partial<ResourceSet>,remove=false,expectedRevision?:number){
 if(!validEngineScope(engineId))throw Error('Choose a valid Engine')
 if(!resources||typeof resources!=='object'||Array.isArray(resources)||!Object.keys(resources).length||Object.keys(resources).some(k=>!RESOURCE_KINDS.includes(k as ResourceKind)))throw Error('Choose resource kinds from infra.scope')
 for(const values of Object.values(resources))if(!Array.isArray(values)||values.length>2000||values.some(id=>typeof id!=='string'||!id||id.length>300))throw Error('Invalid resource IDs')
 const state=registry();if(expectedRevision!==undefined&&state.revision!==expectedRevision)throw Object.assign(Error('Engine associations changed. Reload before saving.'),{code:'ENGINE_SCOPE_CONFLICT'})
 const b=binding(state,engineId);let changed=false
 for(const [key,values] of Object.entries(resources) as [ResourceKind,string[]][]){
  for(const id of values){
   const before=JSON.stringify([b.resources[key],b.excluded[key]])
   if(remove){b.resources[key]=b.resources[key].filter(v=>v!==id);if(!b.excluded[key].includes(id))b.excluded[key].push(id)}
   else {if(!b.resources[key].includes(id))b.resources[key].push(id);b.excluded[key]=b.excluded[key].filter(v=>v!==id)}
   changed ||= before!==JSON.stringify([b.resources[key],b.excluded[key]])
  }
 }
 if(changed)persist(state)
 return state.revision
}
export function claimEngineResource(kind:ResourceKind,id:string,engineId=currentEngineScope()){
 if(typeof engineId!=='string')return
 const state=registry(),b=binding(state,engineId)
 if(b.resources[kind].includes(id))return
 b.resources[kind].push(id);b.excluded[kind]=b.excluded[kind].filter(v=>v!==id);persist(state)
}
export function renameEngineTeam(before:string,after:string){
 if(before===after||!fs.existsSync(file))return
 const state=registry();let changed=false
 for(const b of Object.values(state.engines))for(const source of [b.resources,b.excluded])if(source.teams.includes(before)){source.teams=source.teams.map(v=>v===before?after:v);changed=true}
 if(changed)persist(state)
}
export function forgetEngineTeam(name:string){
 if(!fs.existsSync(file))return
 const state=registry();let changed=false
 for(const b of Object.values(state.engines))for(const source of [b.resources,b.excluded])if(source.teams.includes(name)){source.teams=source.teams.filter(v=>v!==name);changed=true}
 if(changed)persist(state)
}
export type ScopeSelection={engineId:string|null;revision:number;resources:ResourceSet;fullTeams:string[];excluded:ResourceSet}
/** Recompute against live objects so additions/removals never depend on a copied roster. */
export function engineSelection(engineId=currentEngineScope(),data?:Catalog):ScopeSelection|undefined{
 if(engineId===undefined)return
 const state=registry(),b=engineId===null?{resources:empty(),excluded:empty()}:state.engines[engineId]??{resources:empty(),excluded:empty()},r=structuredClone(b.resources),d=data??catalog()
 const available=d.store.sessions.filter(c=>!c.deleting),teams=new Set(d.store.groups)
 r.teams=r.teams.filter(id=>teams.has(id)&&!b.excluded.teams.includes(id));const fullTeams=[...r.teams]
 r.employees=[...new Set([...r.employees,...available.filter(c=>fullTeams.includes(c.group)).map(c=>c.id)])].filter(id=>available.some(c=>c.id===id)&&!b.excluded.employees.includes(id))
 const taken=(kind:ResourceKind,id:string)=>Object.values(state.engines).some(other=>other.resources[kind].includes(id))
 for(const kind of ['groups','channels'] as const){
  const entries=d[kind]
  const explicit=entries.filter(g=>r[kind].includes(g.id)&&!b.excluded[kind].includes(g.id))
  // Explicitly sharing a conversation makes its participants related, not their entire Teams.
  for(const g of explicit)for(const id of g.memberIds)if(available.some(c=>c.id===id)&&!b.excluded.employees.includes(id)&&!r.employees.includes(id))r.employees.push(id)
 }
 for(const kind of ['groups','channels'] as const)r[kind]=d[kind].filter(g=>!b.excluded[kind].includes(g.id)&&(r[kind].includes(g.id)||!taken(kind,g.id)&&g.memberIds.length>0&&g.memberIds.every(id=>r.employees.includes(id)))).map(g=>g.id)
 r.teams=[...new Set([...r.teams,...available.filter(c=>r.employees.includes(c.id)).map(c=>c.group)])]
 return {engineId,revision:state.revision,resources:r,fullTeams,excluded:b.excluded}
}
export function scopeAllows(kind:ResourceKind,id:string,selection=engineSelection()){return !selection||selection.resources[kind].includes(id)}
export function assertScope(kind:ResourceKind,id:unknown){if(typeof id==='string'&&!scopeAllows(kind,id))throw Object.assign(Error('This resource is not linked to the loaded Engine.'),{code:'ENGINE_SCOPE_MISMATCH'})}
export function scopeSchedule(item:{id:string;jobId?:string;action?:{employeeId?:string;channelId?:string}},selection=engineSelection()){
 if(!selection)return true
 const id=item.jobId??item.id
 if(selection.excluded.schedules.includes(id))return false
 if(selection.resources.schedules.includes(id))return true
 const boundElsewhere=Object.values(registry().engines).some(b=>b.resources.schedules.includes(id))
 return !boundElsewhere&&!!item.action?.employeeId&&selection.resources.employees.includes(item.action.employeeId)&&(!item.action.channelId||selection.resources.channels.includes(item.action.channelId))
}
export function scopeConversation(ref:string,selection=engineSelection()){
 if(!selection)return true
 const at=ref.indexOf(':'),kind=ref.slice(0,at),id=ref.slice(at+1)
 return kind==='employee'?selection.resources.employees.includes(id):kind==='group'?selection.resources.groups.includes(id):kind==='channel'?selection.resources.channels.includes(id):false
}
export function projectEngineStore(store:Store):Store{
 const selection=engineSelection();if(!selection)return store
 const {teams,employees}=selection.resources,keep=<T>(r:Record<string,T>|undefined)=>r&&Object.fromEntries(Object.entries(r).filter(([key])=>teams.includes(key)))
 const teamViews=store.teamViews?.filter(v=>scopeAllows('teamViews',v.id,selection)||v.teams.length>0&&v.teams.every(t=>teams.includes(t))).map(v=>({...v,teams:v.teams.filter(t=>teams.includes(t))}))
 const edge=(e:{managerId:string;employeeId:string})=>employees.includes(e.managerId)&&employees.includes(e.employeeId)
 return {...store,sessions:store.sessions.filter(c=>employees.includes(c.id)),groups:store.groups.filter(t=>teams.includes(t)),rooms:keep(store.rooms)??{},teamRoots:store.teamRoots&&Object.fromEntries(Object.entries(store.teamRoots).filter(([team])=>selection.fullTeams.includes(team))),teamSettings:keep(store.teamSettings),teamViews,activeTeamViewId:teamViews?.some(v=>v.id===store.activeTeamViewId)?store.activeTeamViewId:'all',connectorAnchors:store.connectorAnchors&&Object.fromEntries(Object.entries(store.connectorAnchors).filter(([,e])=>edge(e))),lastEmployeeTemplate:store.lastEmployeeTemplate?.group&&teams.includes(store.lastEmployeeTemplate.group)?store.lastEmployeeTemplate:undefined,lastTeamTemplate:undefined,access:store.access?{...store.access,bindings:store.access.bindings?.filter(edge),relations:store.access.relations.filter(edge),globalManagerIds:store.access.globalManagerIds.filter(id=>employees.includes(id)),globalGrants:undefined}:undefined}
}
/** Existing workflow checkpoints are provenance, never a guess based on an employee or Team name. */
export function adoptWorkflowResources(engineId:string,state:any){
 if(!validEngineScope(engineId)||!state||typeof state!=='object')return
 const d=catalog(),workers=Array.isArray(state.workers)?state.workers:[],ids=workers.map((w:any)=>w?.id).filter((id:unknown):id is string=>typeof id==='string'&&d.store.sessions.some(c=>c.id===id))
 const excluded=registry().engines[engineId]?.excluded??empty()
 for(const id of ids)if(!excluded.employees.includes(id)&&!excluded.teams.includes(d.store.sessions.find(c=>c.id===id)!.group))claimEngineResource('employees',id,engineId)
 if(!excluded.teams.includes(state.team)&&typeof state.team==='string'&&ids.length&&d.store.groups.includes(state.team)&&d.store.sessions.filter(c=>c.group===state.team).every(c=>ids.includes(c.id)))claimEngineResource('teams',state.team,engineId)
}
export function engineScopeRevision(){return registry().revision}

export function employeeEngineScope(id:string):string|undefined{
 const state=registry(),d=catalog(),team=d.store.sessions.find(c=>c.id===id)?.group
 const engines=Object.entries(state.engines).filter(([,b])=>!b.excluded.employees.includes(id)&&(b.resources.employees.includes(id)||!!team&&b.resources.teams.includes(team)&&!b.excluded.teams.includes(team))).map(([engine])=>engine)
 return engines.length===1?engines[0]:undefined
}
