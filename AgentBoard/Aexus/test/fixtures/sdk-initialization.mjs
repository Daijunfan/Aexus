// Adapt older deterministic SDK work fixtures to current private initialization.
// Registered Core tool handlers still record the actual identity/index receipts.
export {tool,createSdkMcpServer} from './discussion-claude-sdk.mjs'
export async function initializeSdkInput(input,options){
 const text=typeof input.message.content==='string'?input.message.content:input.message.content.map(part=>part.text??'').join('')
 if(!text.includes('[Agents Company private initialization]'))return false
 const name='mcp__agents_company__agents_company_documentation',registered=options.mcpServers?.agents_company?.tools?.find(tool=>tool.name==='agents_company_documentation')
 if(!registered)throw Error('Missing registered initialization documentation tool')
 for(const operation of ['identity','index']){
  const args={operation},signal=new AbortController().signal,toolUseID='fixture-init-'+operation
  for(const matcher of options.hooks?.PreToolUse??[])for(const hook of matcher.hooks){const decision=await hook({hook_event_name:'PreToolUse',tool_name:name,tool_input:args,cwd:options.cwd},toolUseID,{signal});if(decision.hookSpecificOutput?.permissionDecision==='deny')throw Error('Initialization documentation hook denied')}
  if((await options.canUseTool(name,args,{signal,toolUseID})).behavior!=='allow')throw Error('Initialization documentation permission denied')
  const reply=await registered.handler(args,{requestId:toolUseID,signal});if(reply.isError)throw Error(reply.content?.[0]?.text??'Documentation read failed')
 }
 return true
}
