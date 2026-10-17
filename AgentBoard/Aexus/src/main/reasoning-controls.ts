import {ENGINE_DEFINITIONS} from '../shared/engines'
import {activeModel,modelEfforts} from '../shared/engine-commands'
import {validateEffort,effortPreference} from '../shared/reasoning-defaults'
import {authorize,requestContext} from './authorization'
import {readStore,patchSession,getPreferences} from './store'
import {listLive,sessionInfo,sessionSnapshot,setEffort,setThinking,assertEmployeeControl,assertNotRemoving} from './sessions'
import {engineModels} from './engine-models'
import type {EffortLevel} from '../shared/types'

function target(id:string){
 const info=sessionInfo(id),card=readStore().sessions.find(card=>card.id===(info?.cardId??id)&&!card.deleting)
 if(!card)throw Error('Unknown employee')
 const live=listLive().find(value=>sessionInfo(value.id)?.cardId===card.id)
 return {card,liveId:live?.id}
}
export function employeeConfiguration(id:string){
 const {card,liveId}=target(id),live=liveId?sessionSnapshot(liveId):undefined,capabilities=ENGINE_DEFINITIONS[card.engine].capabilities,key=effortPreference(card.engine)
 return {employeeId:card.id,sessionId:liveId??null,engine:card.engine,managementRole:card.managementRole??'employee',model:live?.model??card.model??null,effort:live?live.effort??'default':card.effort??'default',thinking:live?.thinking??card.thinking??false,busy:live?.busy??false,supportsEffort:capabilities.effort,supportsThinking:capabilities.thinking,creationDefaults:{effort:key?getPreferences()[key]:'default',thinking:card.engine==='claude'?getPreferences().defaultClaudeThinking:false},defaultsApplyTo:'new employees only'}
}
/** A stable card ID works even when its native engine is closed. Never opens a turn. */
export async function configureReasoning(command:'config.effort'|'config.thinking',args:Record<string,any>){
 const initial=target(String(args.id)),context=requestContext(),card=initial.card
 authorize(command,args,card.id,context);assertEmployeeControl(card.id);assertNotRemoving(card.id)
 if(command==='config.thinking'){
  if(typeof args.enabled!=='boolean')throw Error('enabled must be boolean')
  if(!ENGINE_DEFINITIONS[card.engine].capabilities.thinking)throw Error(`${card.engine} does not support a thinking toggle; use config.effort when supported`)
 }else{
  if(args.effort===undefined||args.effort===null)args.effort='default'
  validateEffort(args.effort)
  if(!ENGINE_DEFINITIONS[card.engine].capabilities.effort)throw Error(`${card.engine} does not support configurable effort`)
 }
 if(initial.liveId){
  if(command==='config.thinking')await setThinking(initial.liveId,args.enabled)
  else await setEffort(initial.liveId,args.effort==='default'?null:args.effort)
 }else{
  if(command==='config.effort'&&args.effort!=='default'){
   const catalog=await engineModels(card.engine,card.kind,card.group),selected=activeModel(catalog.models,card.model??catalog.defaultModel)
   if(!selected||!modelEfforts(card.engine,selected).includes(args.effort))throw Error('Unsupported effort for this employee model; query engine.models or choose default')
  }
  // Catalogue lookup can yield. Recheck identity, target, config and live state before writing.
  authorize(command,args,card.id,context);assertEmployeeControl(card.id);assertNotRemoving(card.id)
  const current=target(card.id)
  if(current.liveId||JSON.stringify(current.card)!==JSON.stringify(card))throw Error('Employee changed while checking reasoning controls; reload and retry')
  patchSession(card.id,command==='config.thinking'?{thinking:args.enabled}:{effort:args.effort==='default'?undefined:args.effort as EffortLevel})
 }
 return {ok:true,...employeeConfiguration(card.id)}
}
