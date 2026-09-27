import {pendingInitialization,readyInitialization} from './initialization-state'
import {queueEmployeeInitialization} from './initialization'
import {requestContext,authorize} from './authorization'
import fs from 'node:fs'
import {dirname} from 'node:path'
import {readStore,patchSession,employeeFields} from './store'
import {reserveEmployee,newSessionId,assertTeamAvailable} from './sessions'
import {executionEmployee,cloudRelative,employeeRoot} from './workspaces'
import {resolveEmployeeWorkspace,remoteFiles,teamConnectionId} from './tunnel'
import {forkEmployeeContext,deleteNativeSessions} from './native-sessions'
import {copyTranscript,deleteTranscript} from './transcripts'
import {provisionEmployee,ensureEmployeeBootstrap} from './plugins/documents'
import {teamSettings,employeeSettings,nativeSessionRefs,type StoredSession} from '../shared/types'
import {hasGlobalRole} from '../shared/management'
import {checkCloudNative,cloudNativeTarget} from './cloud-native'

type CloneArgs={title:string;cwd?:string;directoryMode?:'default'|'bind'}
/** Clone configuration + the native conversation, not source files or session ownership. */
export async function cloneEmployee(id:string,args:CloneArgs){
  const targetId=newSessionId(),release=reserveEmployee(id,'clone:'+targetId)
  let cwd:string|undefined,created=false,native:Partial<StoredSession>={}
  const store=readStore(),stored=store.sessions.find(c=>c.id===id)!,source=executionEmployee(store,stored),config=employeeSettings(store,source)
  try{
    if(source.kind==='cloud-native-worker'){
      cloudNativeTarget(source)
      if(source.engine==='claude')throw new Error('云端 Claude Code 会话克隆尚未提供可靠的原生复制接口；原会话保持不变')
      await checkCloudNative(source.group,source.engine)
    }
    employeeFields({title:args.title})
    if(!args.title?.trim())throw new Error('请填写克隆员工的名称')
    if(config.mode==='cloud'&&source.kind!=='cloud-native-worker'&&source.engine==='codex'&&source.threadId&&source.codexExecution!=='native-v1')throw new Error('请先打开原员工完成云端会话迁移，再克隆')
    const mode=args.directoryMode??(args.cwd?'bind':'default')
    await resolveEmployeeWorkspace(store,source.group,args.title,args.cwd,mode,source.workEnvironment==='local'?source.id:undefined,true,source.workEnvironment)
    cwd=await resolveEmployeeWorkspace(readStore(),source.group,args.title,args.cwd,mode,source.workEnvironment==='local'?source.id:undefined,false,source.workEnvironment)
    created=mode==='default'
    native=await forkEmployeeContext(executionEmployee(store,source),cwd,args.title.trim(),config.mode==='work'?dirname(employeeRoot(store,source)!):undefined)
    assertTeamAvailable(source.group)
    const latest=readStore(),current=latest.sessions.find(c=>c.id===id)
    if(!current||JSON.stringify(current)!==JSON.stringify(stored)||JSON.stringify(employeeSettings(latest,source))!==JSON.stringify(config))throw new Error('原员工或 Team 已变化，请重试克隆')
    provisionEmployee(cwd,employeeRoot(store,source)!,config)
    copyTranscript(source.id,targetId)
    const {lastReply:_reply,threadId:_thread,claudeSessionId:_claude,nativeSessions:_history,remote:_remote,position:_position,orderIndex:_order,...settings}=stored
    authorize('card.clone',{id},id)
    const cloned:StoredSession={...settings,...native,initialization:readyInitialization(),managementRole:'employee',createdBy:requestContext().principal,deleting:undefined,id:targetId,title:args.title.trim(),cwd,directoryMode:mode,nativeOrigin:source.nativeOrigin?{...source.nativeOrigin,directory:cwd}:undefined,nativeOwnership:undefined,clonedFrom:id,createdAt:Date.now()}
    if(hasGlobalRole(latest.access,cloned))cloned.initialization=pendingInitialization()
    ensureEmployeeBootstrap(cloned,latest)
    const saved=patchSession(targetId,cloned)
    if(cloned.initialization?.status==='pending')queueEmployeeInitialization(targetId)
    return executionEmployee(saved,saved.sessions.find(c=>c.id===targetId)!)
  }catch(error){
    // Only the new fork can be removed; the source's native IDs never enter this set.
    if(native.threadId||native.claudeSessionId)await deleteNativeSessions(nativeSessionRefs({...source,...native,nativeSessions:[],threadId:native.threadId,claudeSessionId:native.claudeSessionId})).catch(()=>{})
    deleteTranscript(targetId)
    if(created&&cwd){try{if(config.mode==='cloud')await remoteFiles(teamConnectionId(source.group),config.remote!,'remove-empty-directory',{path:cloudRelative(config,cwd)});else fs.rmdirSync(cwd)}catch{}}
    throw error
  }finally{release()}
}
