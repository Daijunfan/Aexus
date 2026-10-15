import type {Live} from '../sessions'
import type {EngineStart} from './contract'
import {isInitializer} from '../initialization-state'
import {sandboxFor} from './session-support'
/** Only common lifecycle defaults; adapters explicitly select supported capabilities. */
export function engineState(context:EngineStart,options:Partial<Live>={}):Live{
 const {args,cardId,kind,engine,cwd,remote,remoteLaunch,permissionMode}=context
 return {cardId,privateInitialization:isInitializer(cardId),kind,engine,cwd,remote,remoteLaunch,
  driver:null as never,q:null as never,input:null as never,sessionId:null,
  model:args.model,thinkingEnabled:false,planMode:args.planMode??false,fastMode:false,
  sandbox:sandboxFor(permissionMode),permissionMode,running:false,queue:[],...options}
}
