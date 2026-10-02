import type {ImageInput,PermissionMode,EffortLevel,StoredSession,EmployeeKind} from '../../shared/types'
import type {Live,SessionInfo,StartArgs,Emitter} from '../sessions'
import type {RemoteTarget} from '../../shared/remote'
import type {RemoteLaunch} from '../tunnel'
import type {DeepSeekProvider} from '../claude-provider'
export type EngineDriver={
  send(text:string,images:ImageInput[],taskId?:string):void
  steer(text:string):Promise<void>
  interrupt():Promise<void>
  close():Promise<void>
  whenIdle():Promise<void>
  setModel(model?:string):Promise<void>
  setPlan(enabled:boolean):Promise<void>
  setPermission(mode:PermissionMode):Promise<void>
  setThinking(enabled:boolean):Promise<void>
  setEffort(effort:EffortLevel|null):Promise<void>
  setFast(enabled:boolean):Promise<void>
  background(processId?:string,stop?:boolean):Promise<any>
}
/** Engine modules emit into Core; they do not own Team authority or task delegation. */
export type EngineHost={
  live:Map<string,Live>;info:Map<string,SessionInfo>;privateTurns:Map<string,Emitter>
  emit:Emitter;rememberMeta:(id:string,meta:Partial<SessionInfo>)=>void
  rememberTerminalCommands:(id:string,names:string[])=>void
  sessionInfo:(id:string)=>SessionInfo|undefined
  dispatchQueued:(state:Live,id:string)=>void
}
export type EngineStart={
  args:StartArgs;card?:StoredSession;kind:EmployeeKind;engine:StoredSession['engine'];cardId:string;sessionId:string
  cwd:string;workRoot?:string;permissionRoot?:string;remote:RemoteTarget|null;nativeRemote?:RemoteTarget
  remoteLaunch?:RemoteLaunch;provider?:DeepSeekProvider;permissionMode:PermissionMode;host:EngineHost
}
