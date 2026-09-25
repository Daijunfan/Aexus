import {query} from '@anthropic-ai/claude-agent-sdk'
import {readStore,getPreferences} from './store'
import {teamSettings,type Engine,type EmployeeKind,type ModelInfo} from '../shared/types'
import {allCodexModels} from './codex'
import {withCodexSessionApi} from './native-sessions'
import {deepSeekProvider,deepSeekModels,deepSeekModel} from './claude-provider'
import {childEnv,resolveBinary} from './exec'
import {spawnRemoteAgent} from './remote-agent-process'

export function defaultEmployeeModel(engine:Engine,kind:EmployeeKind='worker'){
  const settings=getPreferences()
  return (engine==='codex'?settings.defaultCodexModel:settings.defaultClaudeModel)|| (engine==='codex'?(kind==='cloud-native-worker'?'gpt-6-luna':'gpt-5.6-luna'):undefined)
}

/** Discover models without creating an employee or sending an inference turn. */
export async function engineModels(engine:Engine,kind:EmployeeKind='worker',team?:string){
  if(!['codex','claude'].includes(engine))throw Error('请选择 Codex 或 Claude Code')
  if(!['worker','cloud-native-worker'].includes(kind))throw Error('Unknown employee kind')
  const store=readStore(),config=team?teamSettings(store,team):undefined
  if(kind==='cloud-native-worker'&&(!team||!store.groups.includes(team)||config?.mode!=='cloud'||!config.remote))throw Error('请先选择已绑定云主机的 Cloud Team')
  const remote=kind==='cloud-native-worker'?config!.remote:undefined
  const provider=engine==='claude'&&!remote?deepSeekProvider():undefined
  let models:ModelInfo[]
  if(engine==='codex')models=await withCodexSessionApi(allCodexModels,remote?{nativeRemote:remote}:{})
  else if(provider)models=deepSeekModels
  else{
    const abort=new AbortController()
    const prompt=(async function*(){await new Promise<void>(resolve=>abort.signal.addEventListener('abort',()=>resolve(),{once:true}))})()
    const q=query({prompt,options:{abortController:abort,persistSession:false,settingSources:['user'],
      pathToClaudeCodeExecutable:remote?'claude':resolveBinary('claude',process.env.CLAUDE_BIN),
      env:remote?{}:childEnv(),...(remote?{cwd:remote.directory,spawnClaudeCodeProcess:options=>spawnRemoteAgent(remote,'claude',options.args,options.signal)}:{})}})
    const timer=setTimeout(()=>abort.abort(),15000)
    try{models=await q.supportedModels()}finally{clearTimeout(timer);abort.abort();q.close()}
  }
  const preferred=defaultEmployeeModel(engine,kind)
  const defaultModel=remote
    ?models.find(model=>model.value===preferred)?.value??models.find(model=>model.isDefault)?.value??models[0]?.value
    :preferred??(provider?deepSeekModel(provider):undefined)
  return {models,defaultModel}
}
