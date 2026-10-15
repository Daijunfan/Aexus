import {claudeUserSettings} from './claude-provider'

export function workCodexConfig(cwd:string,teamRoot:string,controlSocket?:string):string[] {
  const access:Record<string,string>={}
  if(cwd!==teamRoot)access[teamRoot]='deny'
  access[cwd]='write'
  const table='{'+Object.entries(access).map(([key,value])=>`${JSON.stringify(key)}=${JSON.stringify(value)}`).join(',')+'}'
  // Stop AGENTS.md discovery at this employee's generated guide, before denied ancestors.
  return ['-c','project_root_markers=[".agents-company"]','-c','memories.use_memories=false','-c','memories.generate_memories=false','-c','features.memories=false','-c','default_permissions="agents-company-work"','-c','approval_policy="never"','-c','permissions.agents-company-work.extends=":workspace"','-c',`permissions.agents-company-work.filesystem=${table}`,...(controlSocket?['-c','permissions.agents-company-work.network.enabled=true','-c',`permissions.agents-company-work.network.unix_sockets={${JSON.stringify(controlSocket)}="allow"}`]:[])]
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
