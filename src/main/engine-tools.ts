import {hasNativeCodexSession,nativeCodexRequest} from './codex-native'
import {getLive,sessionInfo,sendMessage} from './sessions'
import {withCodexSessionApi} from './native-sessions'
import {engineCapabilities} from '../shared/engines'
import {workCodexConfig} from './scope'

export async function inspectEngine(id:string,section:string){
  const s=getLive(id);if(!s)throw new Error('请先打开员工会话')
  const meta=sessionInfo(id)!
  if(s.engine==='cline'||s.engine==='pi'){
    const capabilities=engineCapabilities(s.engine)
    if(section==='capabilities')return {...capabilities,sections:['mcp','usage','config'],operations:['session.enqueue','session.queue','session.export','approval.respond',...(capabilities.capabilities.images?['workspace.image']:[]),...(capabilities.capabilities.plan?['config.plan']:[]),...(capabilities.capabilities.steer?['session.steer']:[])],nativeCommands:meta.commands}
    if(section==='config')return meta
    if(section==='skills')return {data:[],note:'This adapter does not expose native skills'}
    if(section==='mcp')return {data:s.remoteLaunch?[{name:'tunnel',transport:'stdio',status:'configured',tools:['execute','read_file','write_file','edit_file','list_files']}]:[],note:'Configured transport only; this is not a live connection probe'}
    if(section==='usage')return {usage:meta.usage??null}
    if(section==='account')return {provider:'deepseek',note:'Account and quota inspection is not exposed by this adapter'}
    throw Error('Unknown engine section')
  }
  if(section==='capabilities')return {engine:s.engine,sections:['skills','mcp','account','usage','config'],operations:['card.clone','session.enqueue','session.steer','session.background','session.queue','session.export','config.plan','workspace.image','approval.respond',...(s.engine==='codex'?['session.review']:[])],nativeCommands:meta.commands}
  if(section==='config')return meta
  if(s.engine==='claude'){
    if(section==='skills')return {data:await s.q.supportedCommands()}
    if(section==='mcp')return {data:await s.q.mcpServerStatus()}
    if(section==='account')return s.q.accountInfo()
    if(section==='usage')return {usage:meta.usage??null,command:'/usage',note:'输入 /usage 获取 Claude Code 的原生上下文与额度视图'}
  }else{
    if(s.remote&&!s.nativeRemote&&['skills','mcp'].includes(section))return {data:[],note:'云端员工不加载本机 Skills 或 MCP 配置，避免本机工具混入云端执行环境。'}
    const methods:Record<string,[string,Record<string,unknown>]>={skills:['skills/list',{cwds:[s.cwd],forceReload:true}],mcp:['mcpServerStatus/list',{limit:100}],account:['account/read',{refreshToken:false}],usage:['account/rateLimits/read',{}]}
    const request=methods[section];if(!request)throw new Error('Unknown engine section')
    let result:any
    try{result=hasNativeCodexSession(id)?await nativeCodexRequest(id,...request):await withCodexSessionApi(call=>call(...request),{cwd:s.remote?undefined:s.cwd,nativeRemote:s.nativeRemote,configArgs:s.workRoot?workCodexConfig(s.cwd,s.permissionRoot??s.workRoot):[]})}
    catch(error){if(section==='usage')return {usage:meta.usage??null,rateLimitsUnavailable:String(error)};throw error}
    if(section==='skills')return {data:(result.data??[]).flatMap((entry:any)=>entry.skills??[]).filter((skill:any)=>skill.enabled&&(!s.workRoot||skill.path.startsWith(s.cwd+'/'))),errors:(result.data??[]).flatMap((entry:any)=>entry.errors??[])}
    if(section==='usage')return {...result,usage:meta.usage??null}
    return result
  }
  throw new Error('Unknown engine section')
}
export async function invokeSkill(id:string,name:string,prompt=''){
  const s=getLive(id);if(!s)throw new Error('请先打开员工会话')
  const catalog=await inspectEngine(id,'skills')
  if(!catalog.data?.some((skill:any)=>skill.name===name))throw new Error('当前员工没有这个可用技能')
  return sendMessage(id,(s.engine==='codex'?'$':'/')+name+(prompt?' '+prompt:''))
}
