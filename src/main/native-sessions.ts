import {workCodexConfig} from './scope'
import {openCodexExecutor,codexControlCwd} from './codex-executor'
import {nativeExecutionConfig} from './codex-native'
import type {RemoteTarget} from '../shared/remote'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import {homedir} from 'node:os'
import {deleteSession as deleteClaudeSession,forkSession as forkClaudeSession} from '@anthropic-ai/claude-agent-sdk'
import {childEnv,resolveBinary} from './exec'
import {nativeSessionRefs,type NativeSession,type StoredSession} from '../shared/types'
import {APP_HOME} from '../shared/protocol'

type Call=(method:string,params:Record<string,unknown>)=>Promise<any>
/** Native metadata API only: never starts an inference turn. */
export async function withCodexSessionApi<T>(action:(call:Call)=>Promise<T>,options:{cwd?:string;remote?:RemoteTarget;configArgs?:string[]}={}):Promise<T> {
  const executor=options.remote?await openCodexExecutor(options.remote):undefined
  const child=spawn(resolveBinary('codex',process.env.CODEX_BIN),['app-server','--stdio',...(options.remote?nativeExecutionConfig():[]),...(options.configArgs??[]),'--disable','memories','--disable','chronicle','-c','memories.generate_memories=false','-c','model="gpt-5.6-luna"','-c','model_reasoning_effort="low"'],{cwd:options.remote?APP_HOME:options.cwd,env:{...childEnv(),...(executor?{CODEX_EXEC_SERVER_URL:executor.url}:{})},stdio:['pipe','pipe','pipe']})
  let sequence=0,stderr=''
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  const fail=(error:Error)=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(error)}pending.clear()}
  const ended=new Promise<void>(resolve=>child.once('close',()=>{fail(new Error(stderr.trim()||'Codex 会话服务已退出'));resolve()}))
  child.on('error',fail);child.stdin.on('error',fail);child.stderr.on('data',data=>stderr=(stderr+data).slice(-4000))
  const lines=createInterface({input:child.stdout})
  lines.on('line',line=>{let reply:any;try{reply=JSON.parse(line)}catch{return}const request=pending.get(reply.id);if(!request)return;pending.delete(reply.id);clearTimeout(request.timer);if(reply.error)request.reject(new Error(reply.error.message));else request.resolve(reply.result)})
  const call:Call=(method,params)=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Codex ${method} 超时`))},15000)
    pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n')
  })
  try{
    await call('initialize',{clientInfo:{name:'agents_company_sessions',version:'1'},capabilities:{experimentalApi:true}})
    child.stdin.write(JSON.stringify({method:'initialized'})+'\n')
    return await action(call)
  }finally{lines.close();child.stdin.end();child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),1500);await ended;clearTimeout(kill);await executor?.close()}
}


/** Fork only the active native context. Never share deletion ownership with the source. */
export async function forkEmployeeContext(source:StoredSession,cwd:string,title:string,workRoot?:string){
  if(source.engine==='claude'&&source.claudeSessionId){
    const result=await forkClaudeSession(source.claudeSessionId,{title})
    return {claudeSessionId:result.sessionId}
  }
  if(source.engine==='codex'&&source.threadId){
    const result=await withCodexSessionApi(async call=>{
      const controlCwd=codexControlCwd(cwd,source.remote)
      const fork=await call('thread/fork',{threadId:source.threadId,cwd:controlCwd,runtimeWorkspaceRoots:[controlCwd],model:source.model,deferGoalContinuation:true,...(workRoot?{permissions:'agents-company-work'}:{})})
      try{await call('thread/name/set',{threadId:fork.thread.id,name:title})}
      catch(error){await call('thread/delete',{threadId:fork.thread.id});throw error}
      return fork
    },{cwd:source.remote?undefined:cwd,remote:source.remote?{...source.remote,directory:cwd}:undefined,configArgs:workRoot?workCodexConfig(cwd,workRoot):[]})
    return {threadId:result.thread.id}
  }
  return {}
}


function rewrite(file:string,transform:(content:string)=>string) {
  if(!fs.existsSync(file))return
  const before=fs.statSync(file),content=fs.readFileSync(file,'utf8'),next=transform(content)
  if(next===content)return
  const current=fs.statSync(file)
  if(current.size!==before.size||current.mtimeMs!==before.mtimeMs)throw new Error('原生会话索引正在更新，请重试移除员工')
  const temporary=`${file}.agents-company-${process.pid}.tmp`
  try{fs.writeFileSync(temporary,next,{mode:before.mode&0o777});const latest=fs.statSync(file);if(latest.size!==before.size||latest.mtimeMs!==before.mtimeMs)throw new Error('原生会话索引正在更新，请重试移除员工');fs.renameSync(temporary,file)}finally{fs.rmSync(temporary,{force:true})}
}
function removeLines(file:string,ids:Set<string>,key:string) {
  rewrite(file,content=>content.split(/(?<=\n)/).filter(line=>{try{return !ids.has(JSON.parse(line)[key])}catch{return true}}).join(''))
}

export async function deleteNativeSessions(refs:NativeSession[]):Promise<void> {
  for(const ref of refs)if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(ref.id))throw new Error(`无效的 ${ref.engine} 原生会话 ID，未移除员工`)
  const codex=new Set(refs.filter(ref=>ref.engine==='codex').map(ref=>ref.id)),claude=new Set(refs.filter(ref=>ref.engine==='claude').map(ref=>ref.id))
  if(codex.size){
    await withCodexSessionApi(async call=>{for(const threadId of codex)try{await call('thread/delete',{threadId})}catch(error){if(!String(error).includes(`no rollout found for thread id ${threadId}`))throw error}})
    const root=process.env.CODEX_HOME||path.join(homedir(),'.codex')
    removeLines(path.join(root,'session_index.jsonl'),codex,'id');removeLines(path.join(root,'history.jsonl'),codex,'session_id')
  }
  for(const id of claude)try{await deleteClaudeSession(id)}catch(error){if(!String(error).includes(`Session ${id} not found in any project directory`))throw error}
  if(claude.size){
    const root=process.env.CLAUDE_CONFIG_DIR||path.join(homedir(),'.claude'),projects=path.join(root,'projects')
    removeLines(path.join(root,'history.jsonl'),claude,'sessionId')
    if(fs.existsSync(projects))for(const entry of fs.readdirSync(projects,{withFileTypes:true}).filter(e=>e.isDirectory()))rewrite(path.join(projects,entry.name,'sessions-index.json'),content=>{const index=JSON.parse(content);if(!Array.isArray(index.entries))return content;const entries=index.entries.filter((item:{sessionId:string})=>!claude.has(item.sessionId));return entries.length===index.entries.length?content:JSON.stringify({...index,entries},null,2)+'\n'})
  }
}

/** Recover only exact employee-ID associations from this app's migration backups. */
export function nativeRefsForRemoval(card:StoredSession):NativeSession[] {
  const refs=nativeSessionRefs(card),backups=path.join(APP_HOME,'backups')
  if(fs.existsSync(backups))for(const file of fs.readdirSync(backups).filter(name=>name.startsWith('before-')&&name.endsWith('.json'))){
    let saved:any;try{saved=JSON.parse(fs.readFileSync(path.join(backups,file),'utf8'))}catch{continue}
    const previous=saved.sessions?.find((item:StoredSession)=>item.id===card.id)
    if(previous)refs.push(...nativeSessionRefs(previous))
  }
  return refs.filter((ref,i)=>refs.findIndex(other=>other.engine===ref.engine&&other.id===ref.id)===i)
}
