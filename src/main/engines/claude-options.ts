import {DOCUMENTATION_TOOL} from '../documentation-tool'
import {API_TOOL} from '../api-tool'
import {DISCUSSION_TOOL} from '../discussion-tool'
import type {Options} from '@anthropic-ai/claude-agent-sdk'
import type {EffortLevel,PermissionMode} from '../../shared/types'
import type {RemoteTarget} from '../../shared/remote'
import type {RemoteLaunch} from '../tunnel'
import {childEnv} from '../exec'
import {agentEnvironment} from '../agent-access'
import {employeeInstructions} from '../plugins/documents'
import {readStore} from '../store'
import {CLOUD_TOOLS,cloudClaudeSettings,cloudToolAllowed} from '../scope'
import {spawnRemoteAgent} from '../remote-agent-process'
import {spawnEmployeeProcess} from '../agent-process-isolation'
import {deepSeekProvider,deepSeekModel,deepSeekEffort,deepSeekPicker} from '../claude-provider'
import {engineExecutable} from './executable'
import {engineProcessEnvironment} from './configuration'
export function buildOptions(args: {
  employeeId?:string
  cwd: string
  workRoot?: string
  permissionRoot?: string
  remote?:RemoteTarget|null
  nativeRemote?:RemoteTarget
  remoteLaunch?:RemoteLaunch
  model?: string
  resume?: string
  permissionMode?: PermissionMode
  thinking?: boolean
  planMode?: boolean
  isPlanning?:()=>boolean
  isAcknowledging?:()=>boolean
  isInitializing?:()=>boolean
  remoteAdmin?: boolean
  fastMode?: boolean
  effort?: EffortLevel
}): Options {
  const env={...engineProcessEnvironment('claude',childEnv(args.cwd,args.workRoot)),...(args.employeeId?agentEnvironment(args.employeeId):{})}
  const instructions=args.employeeId?employeeInstructions(readStore().sessions.find(card=>card.id===args.employeeId)!,readStore()):''
  const opts: Options = {
    cwd: args.cwd,
    // Packaged apps get a minimal PATH, so point the SDK at the real CLI
    // explicitly rather than letting it resolve (and fail) on its own.
    pathToClaudeCodeExecutable: engineExecutable('claude'),
    env,
    permissionMode: args.planMode?'plan':args.permissionMode ?? 'default',
    includePartialMessages: true,
    thinking:
      args.thinking === false ? { type: 'disabled' } : { type: 'adaptive', display: 'summarized' },
    model: args.model,
    effort: args.effort as Options['effort'],
    resume: args.resume,
    systemPrompt: { type: 'preset', preset: 'claude_code',snapshot:false, ...(instructions?{append:instructions}:{}) },
    settingSources: ['user', 'project', 'local'],
    stderr: (data) => console.error('[claude]', data)
  }
  // The permission mode is switchable mid-session from the toolbar, so the
  // capability must be present from the start — otherwise selecting "Bypass"
  // on an already-running session would be refused by the engine.
  opts.allowDangerouslySkipPermissions = true
  // The CLI is identity-scoped in Core. Preapproving this entrypoint also keeps
  // an already-open Employee usable after promotion, without approving arbitrary Bash.
  if(args.employeeId&&!args.remoteLaunch&&!args.nativeRemote)opts.allowedTools=['Bash(agents *)']
  if(args.remoteLaunch){
    const launch=args.remoteLaunch,cloudSettings=cloudClaudeSettings()
    Object.assign(opts,{cwd:launch.cwd,permissionMode:'acceptEdits',tools:[],mcpServers:{tunnel:launch.server},strictMcpConfig:true,allowedTools:CLOUD_TOOLS,settingSources:[],env:{...cloudSettings.env,...env},settings:{permissions:cloudSettings.permissions},
      disallowedTools:['Bash','PowerShell','Read','Write','Edit','Glob','Grep','NotebookEdit','Agent','Task','Skill','WebFetch','WebSearch','EnterWorktree','ExitWorktree'],
      systemPrompt:{type:'preset',preset:'claude_code',snapshot:false,append:[launch.instructions,args.employeeId?employeeInstructions(readStore().sessions.find(card=>card.id===args.employeeId)!,readStore()):''].filter(Boolean).join('\n\n')},allowDangerouslySkipPermissions:false,
      hooks:{PreToolUse:[{hooks:[async(input:any)=>{
        if(args.isAcknowledging?.()||args.isInitializing?.()||[DISCUSSION_TOOL.name,DOCUMENTATION_TOOL.name,API_TOOL.name].some(name=>input.tool_name==='mcp__agents_company__'+name))return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:!args.isAcknowledging?.()&&(input.tool_name==='mcp__agents_company__'+DOCUMENTATION_TOOL.name||!args.isInitializing?.()&&[DISCUSSION_TOOL.name,API_TOOL.name].some(name=>input.tool_name==='mcp__agents_company__'+name))?'allow':'deny',permissionDecisionReason:args.isAcknowledging?.()?'No tools are available during private context reading':args.isInitializing?.()?'Only the documentation tool is available during initialization':'Documentation discovery is read-only; publication requires an active shared response stage'}}
        const planning=args.isPlanning?.()??args.planMode
        const allowed=cloudToolAllowed(input.tool_name,planning)
        return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:allowed?'allow':'deny',permissionDecisionReason:planning?'计划模式只允许读取文件；请切换到执行模式后修改。':'云主机模式仅允许 Tunnel 远端工具'}}
      }]}]}})
  }
  opts.settings={...(typeof opts.settings==='object'?opts.settings:{}),fastMode:args.fastMode??false}
  if(args.employeeId&&readStore().sessions.find(card=>card.id===args.employeeId)?.accessMode==='isolated')opts.settings={...opts.settings,sandbox:{enabled:false}}
  if(args.nativeRemote){
    opts.pathToClaudeCodeExecutable='claude'
    opts.env={}
    opts.spawnClaudeCodeProcess=options=>spawnRemoteAgent(args.nativeRemote!,'claude',options.args,options.signal,args.employeeId)
  }
  const provider=args.nativeRemote?undefined:deepSeekProvider(args.remote?undefined:args.cwd)
  if(provider){
    // The installed system CLI may predate custom model capabilities. Use the SDK's paired runtime.
    opts.pathToClaudeCodeExecutable=engineExecutable('claude',true)
    opts.model=deepSeekModel(provider,args.model||'deepseek-flash')
    opts.thinking=args.thinking===true?{type:'adaptive',display:'summarized'}:{type:'disabled'}
    opts.effort=(deepSeekEffort(args.effort)??'high') as Options['effort']
    opts.settings={...opts.settings,...deepSeekPicker,fastMode:false}
  }
  if(args.employeeId){if(!args.nativeRemote)opts.spawnClaudeCodeProcess=options=>spawnEmployeeProcess(args.employeeId,options.command,options.args,{cwd:options.cwd,env:engineProcessEnvironment('claude',options.env),signal:options.signal});opts.disallowedTools=[...new Set([...(opts.disallowedTools??[]),'Agent','Task'])]}
  return opts
}

