import fs from 'node:fs'
import os from 'node:os'
import spawn from 'cross-spawn'
import {ENGINE_DEFINITIONS,isEngine,type EngineId,type EngineHealth} from '../../shared/engines'
import {childEnv} from '../exec'
import {engineExecutable} from './executable'
import {engineConfiguration,engineEnvironment,publicEngineConfiguration} from './configuration'
import {terminateTree} from '../platform'
import {checkCloudNative} from '../cloud-native'
import {claudeSdkPath} from './claude-sdk'
const cache=new Map<string,{expires:number;value:EngineHealth}>(),pending=new Map<string,Promise<EngineHealth>>()
export function engineList(){return Object.entries(ENGINE_DEFINITIONS).map(([engine,value])=>({engine,...value,configuration:publicEngineConfiguration(engine as EngineId),target:os.hostname()}))}
export function invalidateEngine(engine:EngineId){for(const key of cache.keys())if(key.startsWith(engine+':'))cache.delete(key)}
async function command(engine:EngineId,args:string[],timeout=12000){
  const executable=engineExecutable(engine)
  const child=spawn(executable,args,{env:{...childEnv(),...engineEnvironment(engine)},stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'})
  return new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    let stdout='',stderr='',settled=false
    const timer=setTimeout(()=>{terminateTree(child,true);finish(Error('Coding Agent 检查超时'))},timeout)
    const finish=(error?:Error,code:number|null=null)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({code,stdout:stdout.trim(),stderr:stderr.trim()})}
    child.stdout?.on('data',value=>{stdout=(stdout+value).slice(-131072)})
    child.stderr?.on('data',value=>{stderr=(stderr+value).slice(-131072)})
    child.once('error',error=>finish(error));child.once('close',code=>finish(undefined,code))
  })
}
export async function checkEngine(engine:EngineId,options:{team?:string;force?:boolean}={}):Promise<EngineHealth>{
  if(!isEngine(engine))throw Error('Unknown Coding Agent engine')
  const key=engine+':'+(options.team??'core'),existing=pending.get(key)
  if(existing)return existing
  const cached=cache.get(key);if(!options.force&&cached&&cached.expires>Date.now())return cached.value
  const work=(async()=>{
    const definition=ENGINE_DEFINITIONS[engine],configuration=engineConfiguration(engine)
    const result:EngineHealth={engine,label:definition.label,target:options.team??os.hostname(),installed:false,protocol:'unchecked',authentication:'unknown',ready:false,checkedAt:Date.now(),managed:!!configuration.managedPath,hasApiKey:publicEngineConfiguration(engine).hasApiKey,capabilities:{...definition.capabilities}}
    try{
      if(options.team){
        const remote=await checkCloudNative(options.team,engine)
        Object.assign(result,{installed:true,protocol:'compatible',authentication:remote.authentication,target:remote.host,version:remote.version,ready:remote.authentication==='configured'})
      }else{
        result.path=engineExecutable(engine)
        const version=await command(engine,['--version'])
        if(version.code!==0)throw Error(version.stderr||version.stdout||'CLI 不可执行')
        result.installed=true;result.version=(version.stdout||version.stderr).split('\n')[0]
        if(engine==='codex'){
          const {withCodexSessionApi}=await import('../native-sessions')
          await withCodexSessionApi(call=>call('model/list',{limit:1}))
        }else{
          if(!claudeSdkPath())throw Error('Claude Agent SDK 控制库尚未安装；下载／安装可获取官方控制库和匹配程序')
          const help=await command(engine,['--help'])
          if(help.code!==0||!help.stdout.includes('stream-json'))throw Error('CLI 未提供 SDK 所需的 stream-json 协议')
        }
        result.protocol='compatible'
        const auth=await command(engine,engine==='codex'?['login','status']:['auth','status','--json'])
        if(auth.code===0){
          try{const value=JSON.parse(auth.stdout);result.authentication=value.loggedIn===false?'not-signed-in':'configured'}catch{result.authentication='configured'}
        }else if(/not logged|not authenticated|not signed|未登录|login required/i.test(auth.stdout+' '+auth.stderr))result.authentication='not-signed-in'
        if(result.hasApiKey||process.env[engine==='codex'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY'])result.authentication='configured'
        result.ready=result.protocol==='compatible'&&result.authentication==='configured'
      }
    }catch(error){result.error=String((error as Error).message).slice(0,1600);if(result.installed)result.protocol='incompatible'}
    result.checkedAt=Date.now();cache.set(key,{value:result,expires:Date.now()+15000});return result
  })()
  pending.set(key,work);try{return await work}finally{pending.delete(key)}
}
export async function assertEngineExecutable(engine:EngineId){
  if(!isEngine(engine))throw Error('Unknown Coding Agent engine')
  const executable=engineExecutable(engine)
  if(executable===engine||!fs.existsSync(executable))throw Object.assign(Error(`${ENGINE_DEFINITIONS[engine].label} 未安装或路径不可用。请打开设置 → Coding Agent 引擎进行检测、安装或选择路径。`),{code:'ENGINE_NOT_INSTALLED'})
  return executable
}
