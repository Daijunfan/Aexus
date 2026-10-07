import spawn from 'cross-spawn'
import type {ChildProcess} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {engineExecutable} from './executable'
import {engineEnvironment} from './configuration'
import {childEnv} from '../exec'
import {terminateTree} from '../platform'
import {invalidateEngine} from './registry'
import {emitCoreEvent} from '../core-events'
type Login={id:string;engine:'codex';state:'running'|'succeeded'|'failed'|'cancelled';log:string;url?:string;startedAt:number;error?:string}
const jobs=new Map<string,{value:Login;child:ChildProcess;timer:NodeJS.Timeout}>()
export function beginEngineLogin(engine:string){
  if(engine!=='codex')throw Error('This engine uses an API key or an approved provider configuration; device-code login is available for Codex only')
  const active=[...jobs.values()].find(job=>job.value.state==='running');if(active)return {...active.value}
  const child=spawn(engineExecutable('codex'),['login','--device-auth'],{env:{...childEnv(),...engineEnvironment('codex')},stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'})
  const value:Login={id:randomUUID(),engine:'codex',state:'running',log:'',startedAt:Date.now()}
  const emit=()=>emitCoreEvent({channel:'engine:login',payload:{...value}})
  const append=(bytes:Buffer)=>{
    value.log=(value.log+bytes.toString().replace(/\x1b\[[0-9;]*m/g,'')).slice(-6000)
    const match=value.log.match(/https:\/\/(?:auth\.openai\.com|chatgpt\.com|platform\.openai\.com)\/[^\s<>"']+/)
    if(match)value.url=match[0];emit()
  }
  const timer=setTimeout(()=>{value.state='failed';value.error='登录超时，请重新开始';terminateTree(child,true);emit()},600000)
  jobs.set(value.id,{value,child,timer})
  child.stdout?.on('data',append);child.stderr?.on('data',append)
  child.once('error',error=>{clearTimeout(timer);value.state='failed';value.error=error.message;emit()})
  child.once('close',code=>{clearTimeout(timer);if(value.state==='running'){value.state=code===0?'succeeded':'failed';if(code!==0)value.error='登录未完成，请查看信息并重试'};invalidateEngine('codex');emit()})
  for(const [id,job] of jobs)if(jobs.size>8&&job.value.state!=='running')jobs.delete(id)
  return {...value}
}
export function engineLoginStatus(id:string){const job=jobs.get(id);if(!job)throw Error('Unknown engine login');return {...job.value}}
export function cancelEngineLogin(id:string){const job=jobs.get(id);if(!job)throw Error('Unknown engine login');if(job.value.state==='running'){clearTimeout(job.timer);job.value.state='cancelled';terminateTree(job.child,true)};return {...job.value}}
export function closeEngineLogins(){for(const id of jobs.keys())cancelEngineLogin(id)}
