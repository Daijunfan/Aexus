import {readStore} from './store'
import {teamSettings,type Engine,type NativeOrigin,type StoredSession,type Item} from '../shared/types'
import {getCloudHost} from './cloud-hosts'
import {remoteFiles,teamConnectionId} from './tunnel'
import {remoteAgentCommand,readRemoteClaudeSession,listRemoteClaudeSessions} from './remote-agent-process'
import {withCodexSessionApi} from './native-sessions'
import {cloudDirectory} from './workspaces'
import type {RemoteTarget} from '../shared/remote'

export function cloudNativeTarget(card:StoredSession):{target:RemoteTarget;origin:NativeOrigin}{
  const settings=teamSettings(readStore(),card.group)
  if(card.kind!=='cloud-native-worker'||settings.mode!=='cloud'||!settings.hostId||!settings.remote)throw new Error('Cloud Native Worker 必须属于已绑定主机的 Cloud Team')
  const target={...settings.remote,directory:card.cwd},origin:NativeOrigin={kind:'cloud',hostId:settings.hostId,host:settings.remote.host,os:settings.remote.os,directory:card.cwd}
  if(card.nativeOrigin&&JSON.stringify(card.nativeOrigin)!==JSON.stringify(origin))throw new Error('云主机身份已变化；旧原生会话不会连接到另一台主机')
  return {target,origin}
}

export async function checkCloudNative(team:string,engine:Engine,directory?:string){
  const store=readStore(),settings=teamSettings(store,team)
  if(!store.groups.includes(team)||settings.mode!=='cloud'||!settings.hostId||!settings.remote)throw new Error('请先选择已绑定云主机的 Cloud Team')
  if(engine!=='codex'&&engine!=='claude')throw new Error('请选择 Codex 或 Claude Code')
  const host=getCloudHost(settings.hostId),target={...settings.remote,directory:settings.remote.directory}
  const scope=await remoteFiles(teamConnectionId(team),target,'directory',{path:directory??'.'})
  const version=await remoteAgentCommand({...target,directory:scope.path},engine,['--version'])
  if(version.code!==0)throw new Error(`该云主机未找到 ${engine==='codex'?'Codex':'Claude Code'}：${version.stderr||version.stdout||'CLI 不可执行'}`)
  if(engine==='codex')await withCodexSessionApi(call=>call('model/list',{limit:1}),{nativeRemote:{...target,directory:scope.path}})
  else{
    const help=await remoteAgentCommand({...target,directory:scope.path},'claude',['--help'])
    if(help.code!==0||!help.stdout.includes('stream-json'))throw new Error('云端 Claude Code 版本不支持 SDK 所需的 stream-json 协议')
  }
  const auth=await remoteAgentCommand({...target,directory:scope.path},engine,engine==='codex'?['login','status']:['auth','status','--json'])
  let authentication:'configured'|'not-signed-in'|'unknown'='unknown'
  if(auth.code===0){try{const value=JSON.parse(auth.stdout);authentication=value.loggedIn===false?'not-signed-in':'configured'}catch{authentication='configured'}}
  else if(/not logged|not authenticated|未登录|not signed|login required/i.test(auth.stdout+' '+auth.stderr))authentication='not-signed-in'
  if(authentication==='not-signed-in')throw new Error(`云端 ${engine==='codex'?'Codex':'Claude Code'} 尚未登录；请在该主机配置认证`)
  return {team,hostId:settings.hostId,host:host.name,engine,version:version.stdout||version.stderr,directory:scope.path,authentication,protocol:'stdio'}
}

export async function listCloudNativeSessions(team:string,engine:Engine){
  const store=readStore(),settings=teamSettings(store,team)
  if(!store.groups.includes(team)||settings.mode!=='cloud'||!settings.remote)throw new Error('请选择 Cloud Team')
  await checkCloudNative(team,engine)
  const inScope=(cwd:string|null|undefined)=>{if(!cwd)return false;try{return cloudDirectory(settings,cwd)===cwd}catch{return false}}
  if(engine==='codex'){
    const result=await withCodexSessionApi(call=>call('thread/list',{limit:100}),{nativeRemote:settings.remote})
    return {sessions:(result.data??[]).filter((thread:any)=>inScope(thread.cwd)).map((thread:any)=>({id:thread.id,cwd:thread.cwd,preview:String(thread.name??thread.preview??''),updatedAt:thread.updatedAt,engine}))}
  }
  const result=await listRemoteClaudeSessions(settings.remote)
  return {sessions:result.sessions.filter(session=>inScope(session.cwd)).map(session=>({...session,engine}))}
}

export async function readCloudNativeSession(card:StoredSession,sessionId:string):Promise<Item[]>{
  if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(sessionId))throw new Error('无效的远端原生会话 ID')
  const {target}=cloudNativeTarget(card)
  if(card.engine==='claude'){
    const result=await readRemoteClaudeSession(target,sessionId)
    if(result.cwd!==card.cwd)throw new Error('原生会话工作目录与该员工不一致；请绑定到同一目录')
    return result.items.map((item,index)=>item.role==='user'?{role:'user',id:`native-u-${index}`,text:item.text}:{role:'assistant',id:`native-a-${index}`,blocks:[{kind:'text',text:item.text}]})
  }
  const result=await withCodexSessionApi(call=>call('thread/read',{threadId:sessionId,includeTurns:true}),{nativeRemote:target})
  if(result.thread?.cwd!==card.cwd)throw new Error('原生会话工作目录与该员工不一致；请绑定到同一目录')
  const items:Item[]=[]
  for(const turn of result.thread.turns??[])for(const item of turn.items??[]){
    if(item.type==='userMessage'){
      const text=(item.content??[]).filter((part:any)=>part.type==='text').map((part:any)=>part.text).join('\n')
      if(text)items.push({role:'user',id:item.id??`native-u-${items.length}`,text})
    }else if(item.type==='agentMessage'&&item.text)items.push({role:'assistant',id:item.id??`native-a-${items.length}`,blocks:[{kind:'text',text:item.text}]})
  }
  return items
}
