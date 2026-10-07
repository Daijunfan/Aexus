import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {clineClient} from './cline-client'
import {piClient} from './pi-client'
import {processProvider} from './configuration'

/** Bounded, explicit inference through the same native transports as employee sessions. */
export async function probeProcessEngine(engine:'cline'|'pi',model=processProvider(engine).model){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-'+engine+'-probe-')),started=Date.now(),prompt='Reply with exactly OK. Do not use tools or perform any other task.'
  let text='',finish:(()=>void)|undefined,failure:string|undefined
  const client=engine==='cline'?await clineClient({cwd:directory,directory,model,onUpdate:u=>{if(u.sessionUpdate==='agent_message_chunk')text+=u.content?.text??'';if(u.sessionUpdate==='agent_thought_chunk'&&!client.managedReasoning)failure='Cline returned reasoning despite Thinking off'}}):piClient({cwd:directory,directory,model,onEvent:e=>{if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta')text+=e.assistantMessageEvent.delta;if(e.type==='message_update'&&['thinking_delta','thinking_end'].includes(e.assistantMessageEvent?.type)&&!client.managedReasoning)failure='Pi returned reasoning despite Thinking off';if(e.type==='message_end'&&e.message?.errorMessage)failure=e.message.errorMessage;if(e.type==='agent_settled')finish?.();if(e.type==='process_error'){failure=e.error;finish?.()}}})
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
    if(engine==='cline'){
      await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company-probe',version:'1'},clientCapabilities:{}})
      const session=await client.call('session/new',{cwd:directory,mcpServers:[]})
      await client.call('session/set_config_option',{sessionId:session.sessionId,configId:'model',value:model})
      await client.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:prompt}]},45000)
    }else{
      await client.call('set_model',{provider:client.provider,modelId:model});await client.call('set_thinking_level',{level:'off'})
      const settled=new Promise<void>((resolve,reject)=>{finish=resolve;timer=setTimeout(()=>reject(Error('Pi model probe timed out')),45000)})
      void settled.catch(()=>{});await client.call('prompt',{message:prompt});await settled
    }
    if(failure)throw Error(client.redact(failure))
    if(!text.trim())throw Error('The engine returned no assistant text')
    return {engine,model,thinking:false,thinkingManaged:client.managedReasoning,target:os.hostname(),text:client.redact(text.trim()).slice(0,2000),elapsedMs:Date.now()-started,checkedAt:Date.now()}
  }finally{clearTimeout(timer);await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}
