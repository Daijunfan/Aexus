import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {clineClient} from './cline-client'
import {piClient} from './pi-client'
import {opencodeClient,opencodeDefaultModel} from './opencode-client'
import {processProvider} from './configuration'

/** Bounded, explicit inference through the same native transports as employee sessions. */
export async function probeProcessEngine(engine:'cline'|'pi'|'opencode',model?:string){
  const selected=model??(engine==='opencode'?opencodeDefaultModel:processProvider(engine).model)
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-'+engine+'-probe-')),started=Date.now(),prompt='Reply with exactly OK. Do not use tools or perform any other task.'
  let text='',finish:(()=>void)|undefined,failure:string|undefined
  const label=engine==='cline'?'Cline':engine==='pi'?'Pi':'OpenCode'
  const client=engine==='cline'?await clineClient({cwd:directory,directory,model:selected,onUpdate:u=>{if(u.sessionUpdate==='agent_message_chunk')text+=u.content?.text??'';if(u.sessionUpdate==='agent_thought_chunk'&&!client.managedReasoning)failure=label+' returned reasoning despite Thinking off'}}):engine==='pi'?piClient({cwd:directory,directory,model:selected,onEvent:e=>{if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta')text+=e.assistantMessageEvent.delta;if(e.type==='message_update'&&['thinking_delta','thinking_end'].includes(e.assistantMessageEvent?.type)&&!client.managedReasoning)failure='Pi returned reasoning despite Thinking off';if(e.type==='message_end'&&e.message?.errorMessage)failure=e.message.errorMessage;if(e.type==='agent_settled')finish?.();if(e.type==='process_error'){failure=e.error;finish?.()}}}):await opencodeClient({cwd:directory,directory,model:selected,onUpdate:u=>{if(u.sessionUpdate==='agent_message_chunk')text+=u.content?.text??'';if(u.sessionUpdate==='agent_thought_chunk'&&!client.managedReasoning)failure=label+' returned reasoning despite Thinking off'}})
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
    if(engine==='cline'||engine==='opencode'){
      await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company-probe',version:'1'},clientCapabilities:{}})
      const session=await client.call('session/new',{cwd:directory,mcpServers:[]})
      await client.call('session/set_config_option',{sessionId:session.sessionId,configId:'model',value:selected})
      await client.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:prompt}]},45000)
    }else{
      const pi=client as ReturnType<typeof piClient>
      await pi.call('set_model',{provider:pi.provider,modelId:selected});await pi.call('set_thinking_level',{level:'off'})
      const settled=new Promise<void>((resolve,reject)=>{finish=resolve;timer=setTimeout(()=>reject(Error('Pi model probe timed out')),45000)})
      void settled.catch(()=>{});await client.call('prompt',{message:prompt});await settled
    }
    if(failure)throw Error(client.redact(failure))
    if(!text.trim())throw Error('The engine returned no assistant text')
    return {engine,model:selected,thinking:false,thinkingManaged:client.managedReasoning,target:os.hostname(),text:client.redact(text.trim()).slice(0,2000),elapsedMs:Date.now()-started,checkedAt:Date.now()}
  }finally{clearTimeout(timer);await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}
