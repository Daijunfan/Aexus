import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import spawn from 'cross-spawn'
import {isEngine,type EngineId} from '../../shared/engines'
import {childEnv} from '../exec'
import {terminateTree} from '../platform'
import {claudeUserSettings,deepSeekProvider} from '../claude-provider'
import {engineEnvironment} from './configuration'
import {assertEngineExecutable} from './registry'

/** An explicit, bounded inference check, separate from ordinary no-cost discovery. */
export async function probeEngine(engine:EngineId,confirm:boolean,model?:string){
  if(!isEngine(engine))throw Error('Unknown Coding Agent engine')
  if(confirm!==true)throw Error('测试调用可能产生模型费用；请明确确认后重试 (--confirm)')
  const executable=await assertEngineExecutable(engine),cwd=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'agents-engine-probe-')))
  const selected=model||(engine==='codex'?'gpt-6-luna':deepSeekProvider()?'deepseek-flash':'haiku')
  const prompt='Reply with exactly OK. Do not use tools, inspect files, or perform any other task.'
  const args=engine==='codex'?['exec','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--model',selected,'-c','model_reasoning_effort="low"',prompt]:['--print','--output-format','json','--tools','','--setting-sources','','--no-session-persistence','--model',selected,prompt]
  const env:NodeJS.ProcessEnv={...childEnv(),...(engine==='claude'?claudeUserSettings().env:{}),...engineEnvironment(engine)}
  for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
  env.AGENTS_COMPANY_HOME=path.join(cwd,'company')
  const redact=(value:string)=>Object.entries(env).filter(([key,value])=>/key|token|password/i.test(key)&&typeof value==='string'&&value.length>8).reduce((text,[,secret])=>text.replaceAll(secret!,'[redacted]'),value)
  const started=Date.now()
  try{
    const output=await new Promise<string>((resolve,reject)=>{
      const child=spawn(executable,args,{cwd,env,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'})
      let stdout='',stderr='',expired=false
      const timer=setTimeout(()=>{expired=true;terminateTree(child,true)},45000)
      child.stdout?.on('data',data=>stdout=(stdout+data).slice(-131072))
      child.stderr?.on('data',data=>stderr=(stderr+data).slice(-8192))
      child.once('error',error=>{clearTimeout(timer);reject(error)})
      child.once('close',code=>{clearTimeout(timer);if(expired||code!==0)reject(Error(expired?'模型测试调用超时':redact(stderr||stdout||'模型测试失败')));else resolve(stdout)})
    })
    const values=output.trim().split('\n').flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}})
    const text=engine==='codex'?values.filter(item=>item.type==='item.completed'&&item.item?.type==='agent_message').map(item=>item.item.text).join('\n'):values.find(item=>item.type==='result'&&!item.is_error)?.result
    if(typeof text!=='string'||!text.trim())throw Error('引擎未返回有效的模型回复：'+redact(output).slice(-1600))
    return {engine,model:selected,target:os.hostname(),text:redact(text).slice(0,2000),elapsedMs:Date.now()-started,checkedAt:Date.now()}
  }finally{fs.rmSync(cwd,{recursive:true,force:true})}
}
