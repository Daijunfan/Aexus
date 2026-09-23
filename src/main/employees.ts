import fs from 'node:fs'
import {readStore,patchSession,employeeFields} from './store'
import {reserveEmployee,newSessionId,assertTeamAvailable} from './sessions'
import {executionEmployee,cloudRelative,managedTeamRoot} from './workspaces'
import {resolveEmployeeWorkspace,remoteFiles,teamConnectionId} from './tunnel'
import {forkEmployeeContext,deleteNativeSessions} from './native-sessions'
import {copyTranscript,deleteTranscript} from './transcripts'
import {provisionEmployee} from './plugins/documents'
import {teamSettings,nativeSessionRefs,type StoredSession} from '../shared/types'

type CloneArgs={title:string;cwd?:string;directoryMode?:'default'|'bind'}
/** Clone configuration + the native conversation, not source files or session ownership. */
export async function cloneEmployee(id:string,args:CloneArgs){
  const targetId=newSessionId(),release=reserveEmployee(id,'clone:'+targetId)
  let cwd:string|undefined,created=false,native:Partial<StoredSession>={}
  const store=readStore(),source=store.sessions.find(c=>c.id===id)!,config=teamSettings(store,source.group)
  try{
    employeeFields({title:args.title})
    if(!args.title?.trim())throw new Error('请填写克隆员工的名称')
    if(config.mode==='cloud'&&source.engine==='codex'&&source.threadId&&source.codexExecution!=='native-v1')throw new Error('请先打开原员工完成云端会话迁移，再克隆')
    const mode=args.directoryMode??(args.cwd?'bind':'default')
    await resolveEmployeeWorkspace(store,source.group,args.title,args.cwd,mode,undefined,true)
    cwd=await resolveEmployeeWorkspace(readStore(),source.group,args.title,args.cwd,mode)
    created=mode==='default'
    native=await forkEmployeeContext(executionEmployee(store,source),cwd,args.title.trim(),config.mode==='work'?managedTeamRoot('',config):undefined)
    assertTeamAvailable(source.group)
    const latest=readStore(),current=latest.sessions.find(c=>c.id===id)
    if(!current||JSON.stringify(current)!==JSON.stringify(source)||JSON.stringify(teamSettings(latest,source.group))!==JSON.stringify(config))throw new Error('原员工或 Team 已变化，请重试克隆')
    provisionEmployee(cwd,store.teamRoots![source.group],config)
    copyTranscript(source.id,targetId)
    const {threadId:_thread,claudeSessionId:_claude,nativeSessions:_history,remote:_remote,position:_position,orderIndex:_order,...settings}=source
    const saved=patchSession(targetId,{...settings,...native,id:targetId,title:args.title.trim(),cwd,clonedFrom:id,createdAt:Date.now()})
    return executionEmployee(saved,saved.sessions.find(c=>c.id===targetId)!)
  }catch(error){
    // Only the new fork can be removed; the source's native IDs never enter this set.
    if(native.threadId||native.claudeSessionId)await deleteNativeSessions(nativeSessionRefs({...source,...native,nativeSessions:[],threadId:native.threadId,claudeSessionId:native.claudeSessionId})).catch(()=>{})
    deleteTranscript(targetId)
    if(created&&cwd){try{if(config.mode==='cloud')await remoteFiles(teamConnectionId(source.group),config.remote!,'remove-empty-directory',{path:cloudRelative(config,cwd)});else fs.rmdirSync(cwd)}catch{}}
    throw error
  }finally{release()}
}
