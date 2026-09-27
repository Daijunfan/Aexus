import {acquireCodexStartup} from './engines/startup'
import {engineExecutable} from './engines/executable'
import {engineEnvironment} from './engines/configuration'
import {employeeInstructions} from './plugins/documents'
import {readStore} from './store'
import {remoteAgentBin} from './remote-agent-access'
import {spawnEmployeeProcess} from './agent-process-isolation'
import spawn from 'cross-spawn'
import {createInterface} from 'node:readline'
import {once} from 'node:events'
import {APP_HOME,SOCKET_PATH} from '../shared/protocol'
import {childEnv} from './exec'
import {workCodexConfig} from './scope'
import {openCodexExecutor,codexControlCwd} from './codex-executor'
import {spawnRemoteAgent} from './remote-agent-process'
import type {RemoteTarget} from '../shared/remote'
import type {ImageInput} from '../shared/types'
import type {CodexEvent,SandboxMode} from './codex'

export const nativeExecutionConfig=()=>['-c','mcp_servers={}','-c','skills.include_instructions=false','-c','skills.bundled.enabled=false',
  '-c','include_apps_instructions=false','-c','memories.use_memories=false','-c','memories.generate_memories=false','--disable','memories','--disable','apps','--disable','hooks','--disable','plugins','--disable','chronicle','--disable','multi_agent']
type Args={employeeId?:string;connectionId?:string;prompt:string;images?:ImageInput[];cwd:string;workRoot?:string;permissionRoot?:string;remote?:RemoteTarget|null;nativeRemote?:RemoteTarget;remoteAdmin?:boolean;model?:string;effort?:string;serviceTier?:string;planMode?:boolean;resumeId?:string;sandbox:SandboxMode;signal:AbortSignal;onEvent:(event:CodexEvent)=>void;onRequest?:(method:string,params:any,signal:AbortSignal)=>Promise<unknown>;approvalPolicy?:string}
class RemoteStartupError extends Error {}
const sessions=new Map<string,NativeConnection>()
type NativeConnection=Awaited<ReturnType<typeof connect>>
export const hasNativeCodexSession=(id:string)=>sessions.get(id)?.alive()??false
export const nativeCodexBusy=(id:string)=>sessions.get(id)?.busy()??false
export async function closeNativeCodexSession(id:string){const session=sessions.get(id);sessions.delete(id);await session?.close()}
export async function nativeCodexRequest(id:string,method:string,params:Record<string,unknown>={}){
  const session=sessions.get(id);if(!session?.alive())throw new Error('当前没有已连接的 Codex 会话')
  if(method.startsWith('thread/')||method.startsWith('turn/'))params={...params,threadId:session.threadId(),...(method==='turn/steer'?{expectedTurnId:session.turnId()}:method==='turn/interrupt'?{turnId:session.turnId()}:{})}
  return session.call(method,params)
}

/** One native connection per employee keeps tools and background terminals alive between turns. */
export async function runNativeCodexTurn(binary:string,args:Args){
  if(args.employeeId&&readStore().sessions.find(card=>card.id===args.employeeId)?.accessMode==='isolated')args={...args,workRoot:undefined,sandbox:'danger-full-access'}
  let session=args.connectionId?sessions.get(args.connectionId):undefined
  try{
    if(session&&!session.alive()){await session.close();session=undefined}
    if(!session){session=await connect(binary,args);if(args.connectionId)sessions.set(args.connectionId,session)}
    try{await session.run(args)}catch(error){
      if(!(error instanceof RemoteStartupError)||args.signal.aborted)throw error
      // The remote executable may start after Codex's fixed 10-second handshake
      // limit. No turn has begun, so rebuilding the transport cannot repeat work.
      if(args.connectionId)sessions.delete(args.connectionId)
      await session.close();session=await connect(binary,args)
      if(args.connectionId)sessions.set(args.connectionId,session)
      await session.run(args)
    }
  }catch(error){if(!args.signal.aborted)args.onEvent({kind:'notice',level:'error',text:error instanceof Error?error.message:String(error)})}
  finally{if(session&&(!args.connectionId||!session.alive())){if(args.connectionId)sessions.delete(args.connectionId);await session.close()}}
}
async function connect(binary:string,initial:Args){
  const profile=initial.employeeId?readStore().sessions.find(card=>card.id===initial.employeeId)?.nativeConfigRoot:undefined
  const releaseStartup=await acquireCodexStartup(initial.nativeRemote,profile)
  try{
  let args=initial,threadId=initial.resumeId??'',turnId='',loaded=false,working=false,sequence=0,stderr='',dead=false,compact=false
  let loadedInstructions='',loadedPolicy='',configuredModel=initial.model
  let waiting:{turnId?:string;resolve:()=>void;reject:(error:Error)=>void}|undefined,closing:Promise<void>|undefined
  const executor=args.remote&&!args.nativeRemote?await openCodexExecutor({...args.remote,cliBin:remoteAgentBin(args.employeeId)}):undefined
  // Permit only the authenticated application socket while retaining read-only files.
  const localControl=!!args.employeeId&&!args.remote
  const controlFlags=localControl&&args.sandbox!=='danger-full-access'?[...(!args.workRoot?['-c','default_permissions="agents-company-readonly"']:[]),'-c','permissions.agents-company-readonly.extends=":read-only"','-c','permissions.agents-company-readonly.network.enabled=true','-c',`permissions.agents-company-readonly.network.unix_sockets={${JSON.stringify(SOCKET_PATH)}="allow"}`]:[]
  const flags=[...controlFlags,...(args.model?['-c',`model=${JSON.stringify(args.model)}`]:[]),...(args.effort?['-c',`model_reasoning_effort=${JSON.stringify(args.effort)}`]:[]),'-c',`service_tier=${JSON.stringify(args.serviceTier??'default')}`,'-c','features.fast_mode=true']
  const child=args.nativeRemote?spawnRemoteAgent(args.nativeRemote,'codex',[...flags,'--disable','multi_agent','app-server','--listen','stdio://'],undefined,args.employeeId):spawnEmployeeProcess(args.employeeId,binary,[...(args.remote?nativeExecutionConfig():args.workRoot&&args.sandbox!=='danger-full-access'?workCodexConfig(args.cwd,args.permissionRoot??args.workRoot,localControl?SOCKET_PATH:undefined):[]),...flags,'--disable','multi_agent','app-server'],
    {cwd:args.remote?APP_HOME:args.cwd,env:{...childEnv(args.cwd,args.workRoot),...engineEnvironment('codex'),...(executor?{CODEX_EXEC_SERVER_URL:executor.url}:{})}})
  const ended=once(child,'close').catch(()=>{}),lines=createInterface({input:child.stdout}),lifetime=new AbortController()
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>(),incoming=new Map<string|number,AbortController>()
  const fail=(error:Error)=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear();waiting?.reject(error)}
  const call=(method:string,params:unknown)=>new Promise<any>((resolve,reject)=>{
    if(dead)return reject(new Error('Codex connection closed'))
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timed out`))},30000)
    pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n')
  })
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-4000);console.error('[codex]',String(data).trim())});child.on('error',fail);child.stdin.on('error',fail)
  child.on('close',()=>{const background=working&&!waiting&&!closing;dead=true;working=false;if(background)args.onEvent({kind:'background-turn',busy:false});fail(new Error(executor?.error()||stderr.trim()||'Working process stopped'));if(!closing)void close()})
  lines.on('line',line=>{
    let event:any;try{event=JSON.parse(line)}catch{return}
    if(event.id!==undefined&&event.method){
      const controller=new AbortController(),parent=waiting?args.signal:lifetime.signal,cancel=()=>controller.abort();incoming.set(event.id,controller);parent.addEventListener('abort',cancel,{once:true});if(parent.aborted)cancel()
      const reply=(value:unknown)=>{if(incoming.get(event.id)===controller&&!child.stdin.destroyed&&!child.stdin.writableEnded)child.stdin.write(JSON.stringify(value)+'\n')}
      const cleanup=()=>{if(incoming.get(event.id)===controller)incoming.delete(event.id);parent.removeEventListener('abort',cancel)}
      if(args.onRequest)void args.onRequest(event.method,event.params,controller.signal).then(result=>reply({id:event.id,result}),error=>reply({id:event.id,error:{code:-32000,message:String(error)}})).finally(cleanup)
      else{reply({id:event.id,error:{code:-32601,message:'Interactive requests are unavailable'}});cleanup()}
      return
    }
    const waiter=pending.get(event.id)
    if(waiter){pending.delete(event.id);clearTimeout(waiter.timer);event.error?waiter.reject(new Error(event.error.message)):waiter.resolve(event.result);return}
    const p=event.params??{},item=p.item
    if(event.method==='serverRequest/resolved'){const controller=incoming.get(p.requestId);incoming.delete(p.requestId);controller?.abort()}
    if(event.method==='thread/started'&&(!threadId||p.thread?.id===threadId)){threadId=p.thread.id;args.onEvent({kind:'thread',threadId})}
    if(p.threadId&&threadId&&p.threadId!==threadId)return
    if(event.method==='thread/closed'){loaded=false;working=false;waiting?.reject(new Error('原生会话已关闭，请重试连接'))}
    const id=(value:string|undefined)=>value?`${p.turnId??turnId}:${value}`:undefined
    if(event.method==='item/agentMessage/delta'||event.method==='item/plan/delta')args.onEvent({kind:'text-delta',id:id(p.itemId)!,text:p.delta})
    if(event.method==='item/reasoning/summaryTextDelta')args.onEvent({kind:'reasoning-delta',id:id(p.itemId)!,text:p.delta})
    if(event.method==='item/commandExecution/outputDelta')args.onEvent({kind:'tool-delta',id:id(p.itemId)!,output:p.delta})
    const extraTool=item&&['mcpToolCall','webSearch','collabAgentToolCall','dynamicToolCall','imageGeneration','imageView','subAgentActivity'].includes(item.type)
    if(event.method==='item/started'&&extraTool)args.onEvent({kind:'tool-start',id:id(item.id)!,name:item.tool||item.type,command:JSON.stringify(item.arguments??item.action??item)})
    if(event.method==='item/completed'&&extraTool){
      args.onEvent({kind:'tool-end',id:id(item.id)!,name:item.tool||item.type,command:JSON.stringify(item.arguments??item.action??{}),output:JSON.stringify(item.result??item.contentItems??item.error??item),exitCode:item.status==='failed'||item.error?1:0})
      if(item.type==='collabAgentToolCall'&&item.tool==='spawnAgent')for(const childId of item.receiverThreadIds??[])args.onEvent({kind:'child-thread',threadId:childId})
    }
    if(event.method==='thread/tokenUsage/updated')args.onEvent({kind:'usage',usage:p.tokenUsage})
    if(event.method==='turn/started'){turnId=p.turn.id;working=true;if(waiting)waiting.turnId??=turnId;else args.onEvent({kind:'background-turn',busy:true});args.onEvent({kind:'turn-start'})}
    if(event.method==='item/started'&&['commandExecution','fileChange'].includes(item?.type))args.onEvent({kind:'tool-start',id:id(item.id)!,name:item.type==='fileChange'?'file_change':undefined,command:item.command||'apply_patch'})
    if(event.method==='item/completed'){
      if(['agentMessage','plan'].includes(item.type)&&item.text)args.onEvent({kind:'text',id:id(item.id),text:item.text})
      if(item.type==='exitedReviewMode'&&item.review)args.onEvent({kind:'text',id:id(item.id),text:typeof item.review==='string'?item.review:JSON.stringify(item.review,null,2)})
      if(item.type==='reasoning'){const text=[...(item.summary??[]),...(item.content??[])].join('\n');if(text)args.onEvent({kind:'reasoning',id:id(item.id),text})}
      if(item.type==='commandExecution')args.onEvent({kind:'tool-end',id:id(item.id)!,command:item.command,output:item.aggregatedOutput??'',exitCode:item.exitCode??null})
      if(item.type==='fileChange')args.onEvent({kind:'tool-end',id:id(item.id)!,name:'file_change',command:'apply_patch',output:JSON.stringify(item.changes),exitCode:item.status==='failed'?1:0})
    }
    if(compact&&(event.method==='thread/compacted'||event.method==='item/completed'&&item?.type==='contextCompaction')){working=false;args.onEvent({kind:'notice',level:'info',text:'上下文压缩完成'});waiting?.resolve()}
    if(event.method==='turn/completed'){
      working=false
      if(waiting&&(!p.turn.id||!waiting.turnId||waiting.turnId===p.turn.id)){p.turn.status==='failed'?waiting.reject(new Error(p.turn.error?.message||'Turn failed')):waiting.resolve()}
      else args.onEvent({kind:'background-turn',busy:false})
    }
    if(event.method==='error'&&!p.willRetry){const error=new Error(p.error?.message||'Engine error');if(waiting)waiting.reject(error);else args.onEvent({kind:'notice',level:'error',text:error.message})}
  })
  const close=()=>closing??=(async()=>{
    lifetime.abort();const requests=[...incoming.values()];incoming.clear();for(const c of requests)c.abort()
    child.stdin.end();child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),1500);await ended;clearTimeout(timer);lines.close()
    for(const item of pending.values())clearTimeout(item.timer);pending.clear();await executor?.close()
  })()
  try{await call('initialize',{clientInfo:{name:'agents_company',version:'1'},capabilities:{experimentalApi:true,mcpServerOpenaiFormElicitation:true}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');releaseStartup()}
  catch(error){await close();throw error}
  try{
  if(!configuredModel){
    try{const config=await call('config/read',{includeLayers:false});configuredModel=config.config?.model}catch{}
    if(!configuredModel){const catalog=await call('model/list',{limit:100});const model=(catalog.data??[]).find((item:any)=>item.isDefault)??catalog.data?.[0];configuredModel=model?.model??model?.id}
  }
  if(!configuredModel)throw Error('Codex 未返回可用默认模型；请在引擎设置中选择账户可用的模型')
  }catch(error){await close();throw error}
  return {close,call,threadId:()=>threadId,turnId:()=>turnId,alive:()=>!dead&&(!executor||executor.connected()),busy:()=>working,
    async run(next:Args){
      args=next;let killTimer:NodeJS.Timeout|undefined
      const abort=()=>{if(threadId&&turnId)void call('turn/interrupt',{threadId,turnId}).catch(()=>{});else child.kill('SIGTERM');killTimer=setTimeout(()=>{if(args.signal.aborted&&working)void close()},1500)}
      args.signal.addEventListener('abort',abort,{once:true})
      try{
        args.signal.throwIfAborted()
        if(args.remote&&!args.nativeRemote)try{await call('environment/info',{environmentId:'remote'})}
        catch(error){throw new RemoteStartupError(error instanceof Error?error.message:String(error))}
        const environments=args.remote&&!args.nativeRemote?[{environmentId:'remote',cwd:args.remote.directory,runtimeWorkspaceRoots:[args.remote.directory]}]:undefined
        const controlCwd=args.nativeRemote?args.cwd:codexControlCwd(args.cwd,args.remote),windows=args.remote?.os==='windows'
        const sandbox=args.remote&&(windows||args.remoteAdmin&&!args.planMode)?'danger-full-access':args.sandbox
        const permissionProfile=args.workRoot&&args.sandbox!=='danger-full-access'?'agents-company-work':localControl&&args.sandbox==='read-only'?'agents-company-readonly':undefined
        const policy=permissionProfile?{permissions:permissionProfile}:{sandboxPolicy:{type:sandbox==='workspace-write'?'workspaceWrite':sandbox==='read-only'?'readOnly':'dangerFullAccess',...(sandbox==='workspace-write'?{writableRoots:[controlCwd],networkAccess:true,excludeTmpdirEnvVar:true,excludeSlashTmp:true}:{})}}
        const saved=args.employeeId?readStore().sessions.find(card=>card.id===args.employeeId):undefined
        const bootstrap=saved?employeeInstructions(saved,readStore()):undefined
        if(loaded&&(bootstrap!==loadedInstructions||(permissionProfile??sandbox)!==loadedPolicy))loaded=false
        if(!loaded){
          const options={cwd:controlCwd,...(bootstrap?{developerInstructions:bootstrap}:{}),model:args.model||configuredModel,approvalPolicy:args.approvalPolicy??'never',serviceTier:args.serviceTier??null,...(permissionProfile?{permissions:permissionProfile}:{sandbox}),...(args.remote&&!args.nativeRemote?{config:{'skills.include_instructions':false,'skills.bundled.enabled':false,'include_apps_instructions':false,'memories.use_memories':false,'memories.generate_memories':false,'features.memories':false,'features.chronicle':false,'features.plugins':false,'features.apps':false,'features.hooks':false,'features.multi_agent':false}}:{})}
          // Employee clones must own their history so removing one employee cannot invalidate another.
          const started=args.resumeId?await call('thread/resume',{threadId:args.resumeId,...options}):await call('thread/start',{...options,environments,historyMode:'legacy'})
          threadId=started.thread.id;loaded=true;loadedInstructions=bootstrap??'';loadedPolicy=permissionProfile??sandbox;args.onEvent({kind:'thread',threadId})
        }
        const settings={threadId,cwd:controlCwd,model:args.model||configuredModel,effort:args.effort??null,serviceTier:args.serviceTier??null,approvalPolicy:args.approvalPolicy??'never',collaborationMode:{mode:args.planMode?'plan':'default',settings:{model:args.model||configuredModel,reasoning_effort:args.effort??null,developer_instructions:null}},...policy}
        await call('thread/settings/update',settings);args.signal.throwIfAborted()
        const action=args.prompt.match(/^\/(compact|review)(?:\s+([\s\S]*))?$/);compact=action?.[1]==='compact'
        const target=action?.[2]?.startsWith('--base ')?{type:'baseBranch',branch:action[2].slice(7).trim()}:action?.[2]?.startsWith('--commit ')?{type:'commit',sha:action[2].slice(9).trim(),title:null}:action?.[2]?{type:'custom',instructions:action[2]}:{type:'uncommittedChanges'}
        await new Promise<void>((resolve,reject)=>{
          waiting={resolve,reject};working=true
          const operation=compact?call('thread/compact/start',{threadId}):action?.[1]==='review'?call('review/start',{threadId,delivery:'inline',target}):call('turn/start',{...settings,environments,input:[...(args.prompt?[{type:'text',text:args.prompt}]:[]),...(args.images??[]).map(image=>({type:'image',url:`data:${image.mimeType};base64,${image.data}`}))]})
          void operation.then(result=>{if(result.turn){turnId=result.turn.id;if(waiting)waiting.turnId??=turnId}if(args.signal.aborted)abort()},reject)
        })
      }catch(error){working=false;throw error}finally{clearTimeout(killTimer);waiting=undefined;args.signal.removeEventListener('abort',abort)}
    }
  }
  }finally{releaseStartup()}
}
