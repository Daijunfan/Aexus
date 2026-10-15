// Private initialization for UI protocol fixtures; documentation receipts come from the real Core MCP.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
module.exports=send=>{
 let thread,cwd,environments,url,enabledTools
 return request=>{
  const p=request.params??{},reply=result=>send({id:request.id,result})
  if(['thread/start','thread/resume'].includes(request.method)){
   thread=p.threadId??randomUUID();cwd=p.cwd;environments=p.environments??[{environmentId:'local',cwd,runtimeWorkspaceRoots:[cwd]}]
   url=p.config?.['mcp_servers.agents_company']?.url;enabledTools=p.config?.['mcp_servers.agents_company']?.enabled_tools??[]
   reply({thread:{id:thread,turns:[]}});return true
  }
  if(request.method==='thread/read'){
   reply({thread:{id:p.threadId,cwd,environments,turns:[]}});return true
  }
  if(request.method==='thread/backgroundTerminals/list'){reply({data:[],nextCursor:null});return true}
  if(request.method!=='turn/start'||!p.input?.some(item=>item.text?.includes('[Agents Company private initialization]')))return false
  const turn=randomUUID(),event=(method,params)=>send({method,params:{threadId:thread,turnId:turn,...params}})
  reply({turn:{id:turn,status:'inProgress'}});event('turn/started',{turn:{id:turn}})
  void (async()=>{
   const name='agents_company_documentation',results={}
   if(!url||!enabledTools.includes(name))throw Error('Initialization received no registered documentation tool')
   const call=async(method,params)=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params})});if(!response.ok)throw Error('Documentation MCP HTTP '+response.status);return response.json()}
   const tools=await call('tools/list',{});if(!tools.result?.tools?.some(tool=>tool.name===name))throw Error('Documentation tool was not exposed')
   for(const operation of ['identity','index']){
    const id=randomUUID(),input={operation};event('item/started',{item:{id,type:'mcpToolCall',tool:name,arguments:input}})
    const result=await call('tools/call',{name,arguments:input});if(result.error||result.result?.isError)throw Error(JSON.stringify(result))
    results[operation]=JSON.parse(result.result.content.find(item=>item.type==='text').text)
    event('item/completed',{item:{id,type:'mcpToolCall',tool:name,result,status:'completed'}})
   }
   fs.writeFileSync(path.join(process.env.AC_INIT_FIXTURE,process.env.AGENTS_COMPANY_EMPLOYEE+'-read.json'),JSON.stringify({operations:['identity','index'],...results}))
   event('item/completed',{item:{id:randomUUID(),type:'agentMessage',text:'OK'}});event('turn/completed',{turn:{id:turn,status:'completed'}})
  })().catch(error=>event('turn/completed',{turn:{id:turn,status:'failed',error:{message:error.message}}}))
  return true
 }
}
