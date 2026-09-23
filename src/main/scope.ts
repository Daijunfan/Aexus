import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {claudeUserSettings} from './claude-provider'
import type {Options} from '@anthropic-ai/claude-agent-sdk'

export function workCodexConfig(cwd:string,teamRoot:string):string[] {
  const access:Record<string,string>={}
  if(cwd!==teamRoot)access[teamRoot]='deny'
  access[cwd]='write'
  const table='{'+Object.entries(access).map(([key,value])=>`${JSON.stringify(key)}=${JSON.stringify(value)}`).join(',')+'}'
  return ['-c','default_permissions="agents-company-work"','-c','approval_policy="never"','-c','permissions.agents-company-work.extends=":workspace"','-c',`permissions.agents-company-work.filesystem=${table}`]
}

export function workClaudeOptions(cwd:string,teamRoot:string):Partial<Options> {
  return {
    settings:{sandbox:{enabled:true,failIfUnavailable:true,allowUnsandboxedCommands:false,filesystem:{allowWrite:[cwd],denyRead:cwd===teamRoot?[]:[teamRoot],allowRead:[cwd]}}},
    // File tools execute in-process; the same folder boundary must apply there.
    hooks:{PreToolUse:[{hooks:[async input=>{
      if(input.hook_event_name!=='PreToolUse'||!['Read','Edit','Write','Glob','Grep','NotebookEdit'].includes(input.tool_name))return {}
      const args=input.tool_input as Record<string,unknown>
      const raw=String(args.file_path??args.notebook_path??args.path??cwd)
      const file=path.resolve(cwd,raw.startsWith('~/')?path.join(os.homedir(),raw.slice(2)):raw)
      let ancestor=file;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor)
      const actual=fs.realpathSync(ancestor)
      if((file===cwd||file.startsWith(cwd+path.sep))&&(actual===cwd||actual.startsWith(cwd+path.sep)))return {}
      return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Work 员工只能操作自己的工作文件夹及其子文件夹。'}}
    }]}]}
  }
}

export const CLOUD_TOOLS = ['execute','read_file','write_file','edit_file','list_files'].map(name=>'mcp__tunnel__'+name)
export function cloudToolAllowed(tool:string,planning=false){
  return CLOUD_TOOLS.includes(tool)&&!(planning&&['execute','write_file','edit_file'].some(name=>tool==='mcp__tunnel__'+name))
}
/** Retain provider credentials/model aliases without importing local hooks, plugins or permissions. */
export function cloudClaudeSettings(){
  const saved=claudeUserSettings()
  const transportEnv=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']
  const env=Object.fromEntries(Object.entries(saved.env??{}).filter(([key,value])=>typeof value==='string'&&(key.startsWith('ANTHROPIC_')||transportEnv.includes(key)))) as Record<string,string>
  return {env,permissions:{disableBypassPermissionsMode:'disable' as const}}
}
