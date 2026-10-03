// Deterministic SDK callback fixture. Registered tools call the actual Core handler; assistant text never calls it.
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
export function tool(name,description,schema,handler){return {name,description,schema,handler}}
export function createSdkMcpServer({name,tools}){return {name,tools}}
export function query({prompt,options}){
 let closed=false,interrupted=false
 const sessionId=options.resume??randomUUID(),employee=options.env?.AGENTS_COMPANY_EMPLOYEE??'catalog',control=process.env.AC_INIT_FIXTURE,file=suffix=>path.join(control,employee+suffix)
 const note=(kind,value)=>fs.writeFileSync(file('-'+kind+'.json'),JSON.stringify(value))
 const decisions=async(name,input)=>{const values=[];for(const matcher of options.hooks?.PreToolUse??[])for(const hook of matcher.hooks)values.push((await hook({hook_event_name:'PreToolUse',tool_name:name,tool_input:input,session_id:sessionId,cwd:options.cwd},'fixture-tool',{signal:new AbortController().signal})).hookSpecificOutput?.permissionDecision);return values}
 const nativeTool=async(rawName,args)=>{
  const callId='fixture-tool-'+randomUUID(),name='mcp__agents_company__'+rawName,hooks=await decisions(name,args),permission=await options.canUseTool(name,args,{signal:new AbortController().signal,toolUseID:callId}),kind=rawName==='agents_company_documentation'?'documentation':'discussion'
  note(kind+'-permission',{hooks,permission});if(hooks.includes('deny')||permission.behavior!=='allow')throw Error('Registered '+rawName+' was denied')
  const registered=options.mcpServers?.agents_company?.tools?.find(tool=>tool.name===rawName);if(!registered)throw Error('SDK received no registered '+rawName)
  const input=z.object(registered.schema).parse(args),result=await registered.handler(input,{requestId:callId,signal:new AbortController().signal});note(kind+'-tool',{input,result,callId,at:Date.now()});return result
 }
 const q=(async function*(){
  yield {type:'system',subtype:'init',session_id:sessionId,model:'fixture-claude',slash_commands:[]}
  for await(const input of prompt){
   if(closed)return;interrupted=false
   const text=typeof input.message.content==='string'?input.message.content:input.message.content.filter(part=>part.type==='text').map(part=>part.text).join(''),ack=/^\[Agents Company (group|channel) acknowledgment\]\n/.test(text),uuid=input.uuid,hidden=text.includes('[Agents Company private initialization]')
   note(ack?'ack':hidden?'initializing':'work',{text,sessionId,at:Date.now()});let response='WORK_FINISHED',failure
   if(text.includes('ACK_TOOL_FIXTURE')){
    const values=[];for(const name of ['Bash','Read','Write','Edit'])values.push(...await decisions(name,{}))
    const allowed=!values.length||values.some(value=>value!=='deny');if(ack)note('ack-tool-result',{allowed,decisions:values});if(allowed)fs.writeFileSync(path.join(options.cwd,ack?'ack-forbidden.txt':'approval.txt'),'approved')
   }
   if(hidden){
    while(!closed&&!interrupted&&!fs.existsSync(file('.release'))&&!fs.existsSync(path.join(control,'release-all')))await new Promise(resolve=>setTimeout(resolve,20))
    try{const operations=fs.existsSync(file('.init-skip-docs'))?[]:fs.existsSync(file('.init-identity-only'))?['identity']:['identity','index'],results={}
     if(!closed&&!interrupted)for(const operation of operations){const reply=await nativeTool('agents_company_documentation',{operation});if(reply.isError)throw Error(reply.content?.[0]?.text??'Documentation tool failed');results[operation]=JSON.parse(reply.content.find(item=>item.type==='text').text)}
     note('read',{operations,identity:results.identity,index:results.index,bytes:operations.map(operation=>JSON.stringify(results[operation])?.length??0)});response=fs.existsSync(file('.bad-ok'))?'NOT_READY':'OK';if(fs.existsSync(file('.fail')))failure='fixture initialization failure'
    }catch(error){failure=error.message}
   }else if(ack){
    const policy=JSON.parse(text.split('\n')[1]),explicit=fs.existsSync(file('.ack-tool.json')),raw=fs.existsSync(file('.ack-output.txt'))
    response=raw?fs.readFileSync(file('.ack-output.txt'),'utf8'):'Fixture acknowledgment stage complete.'
    note('ack-response',{text:response})
    if(fs.existsSync(file('.ack-preface.txt')))yield {type:'assistant',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:uuid,message:{content:[{type:'text',text:fs.readFileSync(file('.ack-preface.txt'),'utf8')}]}}
    while(!closed&&!interrupted&&fs.existsSync(file('.hold-ack')))await new Promise(resolve=>setTimeout(resolve,20))
    if(!closed&&!interrupted&&explicit){
     try{
      const args={conversationType:policy.conversationType,conversationId:policy.conversationId,messageId:policy.messageId,text:null,...(explicit?JSON.parse(fs.readFileSync(file('.ack-tool.json'),'utf8')):{})};await nativeTool('agents_company_discussion_post',args)
     }catch(error){failure=error.message}
    }
    if(fs.existsSync(file('.ack-fail')))failure='Fixture acknowledgment failure'
   }else{const post=workPostArgs(text,control,employee);if(post)try{const result=await nativeTool('agents_company_discussion_post',post);note('work-publication',{input:post,result});if(result.isError)throw Error(result.content?.[0]?.text??'Publication failed')}catch(error){failure=error.message};while(!closed&&!interrupted&&fs.existsSync(file('.hold-user')))await new Promise(resolve=>setTimeout(resolve,20))}
   if(closed)return
   if(!interrupted){
    yield {type:'stream_event',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:uuid,event:{type:'message_start',message:{id:randomUUID(),role:'assistant',content:[]}}}
    const content=[...(ack&&fs.existsSync(file('.ack-thinking.txt'))?[{type:'thinking',thinking:fs.readFileSync(file('.ack-thinking.txt'),'utf8')}]:[]),...(response?[{type:'text',text:response}]:[])]
    if(content.length)yield {type:'assistant',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:uuid,message:{content}}
   }
   yield {type:'result',subtype:interrupted||failure?'error_during_execution':'success',is_error:!!(interrupted||failure),errors:interrupted?['Interrupted']:failure?[failure]:[],session_id:sessionId,user_message_uuid:uuid,...(ack&&fs.existsSync(file('.ack-result.txt'))?{result:fs.readFileSync(file('.ack-result.txt'),'utf8')}:{})}
  }
 })()
 Object.assign(q,{supportedCommands:async()=>[],supportedModels:async()=>[{value:'fixture-claude',displayName:'Fixture'}],close:()=>{closed=true},interrupt:async()=>{interrupted=true},setModel:async()=>{},setPermissionMode:async()=>{},setMaxThinkingTokens:async()=>{},applyFlagSettings:async()=>{}})
 return q
}

function workPostArgs(text,control,employee){
 const file=path.join(control,employee+'.work-post.json');if(!fs.existsSync(file))return
 const marker=text.includes('[Group request]\n')?'[Group request]\n':text.includes('[Channel context]\n')?'[Channel context]\n':undefined
 if(!marker)return
 const context=JSON.parse(text.split(marker)[1].split('\n')[0])
 return {conversationType:context.conversationType,conversationId:context.conversationId,messageId:context.messageId??context.entryId,...JSON.parse(fs.readFileSync(file,'utf8'))}
}
