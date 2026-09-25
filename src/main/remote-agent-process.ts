import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'
import path from 'node:path'
import {tunnelConfig,tunnelDirectory,python} from './tunnel'
import {childEnv} from './exec'
import type {RemoteTarget} from '../shared/remote'
import type {Engine} from '../shared/types'

/** The SSH child owns stdio; it never launches a local Coding Agent. */
export function spawnRemoteAgent(target:RemoteTarget,engine:Engine,args:string[],signal?:AbortSignal):ChildProcessWithoutNullStreams{
  const payload=Buffer.from(JSON.stringify({target:tunnelConfig(target),engine,args})).toString('base64url')
  return spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),payload],{env:childEnv(),stdio:['pipe','pipe','pipe'],detached:true,...(signal?{signal}:{})})
}

async function collect(child:ChildProcessWithoutNullStreams,timeout:number){
  const output:Buffer[]=[],errors:Buffer[]=[]
  child.stdout.on('data',value=>output.push(value));child.stderr.on('data',value=>errors.push(value))
  const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('远端 Coding Agent 检查超时'))},timeout)
    child.once('error',error=>{clearTimeout(timer);reject(error)})
    child.once('close',code=>{clearTimeout(timer);resolve({code,stdout:Buffer.concat(output).toString('utf8').trim(),stderr:Buffer.concat(errors).toString('utf8').trim()})})
    child.stdin.end()
  })
  return result
}

export function remoteAgentCommand(target:RemoteTarget,engine:Engine,args:string[],timeout=15000){return collect(spawnRemoteAgent(target,engine,args),timeout)}

export async function deleteRemoteClaudeSession(target:RemoteTarget,sessionId:string){
  const payload=Buffer.from(JSON.stringify({target:tunnelConfig(target),sessionId})).toString('base64url')
  const child=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'delete',payload],{env:childEnv(),stdio:['pipe','pipe','pipe'],detached:true})
  const result=await collect(child,30000)
  if(result.code!==0)throw new Error(result.stderr||'远端 Claude 会话删除失败')
  return JSON.parse(result.stdout) as {deleted:number}
}

export async function readRemoteClaudeSession(target:RemoteTarget,sessionId:string){
  const payload=Buffer.from(JSON.stringify({target:tunnelConfig(target),sessionId})).toString('base64url')
  const child=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'read',payload],{env:childEnv(),stdio:['pipe','pipe','pipe'],detached:true})
  const result=await collect(child,30000)
  if(result.code!==0)throw new Error(result.stderr||'远端 Claude 会话读取失败')
  return JSON.parse(result.stdout) as {sessionId:string;cwd:string|null;items:{role:'user'|'assistant';text:string}[]}
}

export async function listRemoteClaudeSessions(target:RemoteTarget){
  const payload=Buffer.from(JSON.stringify({target:tunnelConfig(target)})).toString('base64url')
  const child=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'list',payload],{env:childEnv(),stdio:['pipe','pipe','pipe'],detached:true})
  const result=await collect(child,30000)
  if(result.code!==0)throw new Error(result.stderr||'远端 Claude 会话列表读取失败')
  return JSON.parse(result.stdout) as {sessions:{id:string;cwd:string|null;preview:string;updatedAt:number}[]}
}
