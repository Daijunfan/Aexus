import {randomUUID} from 'node:crypto'
import type {CanUseTool,OnElicitation,ElicitationResult} from '@anthropic-ai/claude-agent-sdk'
import type {Approval,AgentQuestion} from '../shared/types'

type Answers=Record<string,string[]>
const pending=new Map<string,{sessionId:string;approval:Approval;finish:(allow:boolean,answers?:Answers,form?:Record<string,unknown>)=>void}>()
function waitForAnswer(sessionId:string,approval:Approval,signal:AbortSignal,changed:()=>void){
  return new Promise<{allow:boolean;answers:Answers;form?:Record<string,unknown>}>((resolve)=>{
    const cancel=()=>finish(false)
    const finish=(allow:boolean,answers:Answers={},form?:Record<string,unknown>)=>{pending.delete(approval.id);signal.removeEventListener('abort',cancel);resolve({allow,answers,form});changed()}
    if(signal.aborted)return finish(false)
    pending.set(approval.id,{sessionId,approval,finish});signal.addEventListener('abort',cancel,{once:true});changed()
  })
}
export function approvalHandler(sessionId:string,changed:()=>void):CanUseTool{
  return async(tool,input,{signal,toolUseID,title})=>{
    const questions:AgentQuestion[]|undefined=tool==='AskUserQuestion'?(input.questions as any[])?.map(q=>({id:q.question,question:q.question,header:q.header,options:q.options,multiSelect:q.multiSelect,isOther:true})):undefined
    const result=await waitForAnswer(sessionId,{id:`${sessionId}:${toolUseID}`,tool,input,title:title||`Allow ${tool}?`,questions},signal,changed)
    return result.allow?{behavior:'allow',updatedInput:questions?{...input,answers:Object.fromEntries(Object.entries(result.answers).map(([key,value])=>[key,value.join(', ')]))}:input}:{behavior:'deny',message:'Declined by user'}
  }
}
export function elicitationHandler(sessionId:string,changed:()=>void):OnElicitation{
  return async(request,{signal})=>{
    const result=await waitForAnswer(sessionId,{id:`${sessionId}:${randomUUID()}`,tool:request.serverName,input:request,title:request.message,schema:request.requestedSchema,allowNestedForm:(request as {mode?:string}).mode==='openai/form',url:request.url},signal,changed)
    return {action:result.allow?'accept':'decline',...(result.allow&&result.form?{content:result.form as NonNullable<ElicitationResult['content']>}:{})}
  }
}
/** Native Codex asks stay outside model prompts and share the headless approval API. */
export function nativeRequestHandler(sessionId:string,changed:()=>void,allowEscalation:boolean){
  return async(method:string,input:any,signal:AbortSignal)=>{
    if(method==='mcpServer/elicitation/request'){const result=await elicitationHandler(sessionId,changed)(input,{signal,requestId:randomUUID()});return {action:result?.action??'cancel',content:result?.content??null,_meta:null}}
    const questions:AgentQuestion[]|undefined=method==='tool/requestUserInput'?input.questions:undefined
    const command=method==='item/commandExecution/requestApproval',file=method==='item/fileChange/requestApproval',permissions=method==='item/permissions/requestApproval'
    if(!questions&&!command&&!file&&!permissions)throw new Error(`Unsupported native request: ${method}`)
    if(!questions&&!allowEscalation)return permissions?{permissions:{},scope:'turn'}:{decision:'decline'}
    const result=await waitForAnswer(sessionId,{id:`${sessionId}:${randomUUID()}`,tool:method,input,title:questions?'Agent 需要你的回答':input.reason||input.command||'批准本次操作？',questions},signal,changed)
    if(questions)return {answers:Object.fromEntries(Object.entries(result.answers).map(([key,answers])=>[key,{answers}]))}
    if(permissions)return {permissions:result.allow?input.permissions:{},scope:'turn'}
    return {decision:result.allow?'accept':'decline'}
  }
}
export function approvalsFor(sessionId:string){return [...pending.values()].filter(p=>p.sessionId===sessionId).map(p=>p.approval)}
export function answerApproval(sessionId:string,id:string,allow:boolean,answers:Record<string,string|string[]>={},form?:Record<string,unknown>){
  const p=pending.get(id);if(!p||p.sessionId!==sessionId)throw new Error('Permission request is no longer pending')
  const normalized:Answers={}
  if(allow&&p.approval.questions){for(const q of p.approval.questions){const value=answers[q.id],values=typeof value==='string'?[value]:value;if(!Array.isArray(values)||!values.length||values.some(v=>typeof v!=='string'||!v.trim()))throw new Error(`请回答：${q.question}`);if(!q.multiSelect&&values.length>1)throw new Error('此问题只能选择一个答案');if(q.options?.length&&!q.isOther&&values.some(v=>!q.options!.some(o=>o.label===v)))throw new Error('请选择问题提供的选项');normalized[q.id]=values}}
  if(allow&&p.approval.schema){if(!form||typeof form!=='object'||Array.isArray(form))throw new Error('请填写 JSON 表单');if(!p.approval.allowNestedForm&&Object.values(form).some(v=>!['string','number','boolean'].includes(typeof v)&&!(Array.isArray(v)&&v.every(x=>typeof x==='string'))))throw new Error('MCP 表单仅接受文本、数字、布尔值或文本列表');for(const key of p.approval.schema.required??[])if(!Object.hasOwn(form,key))throw new Error(`缺少必填项：${key}`)}
  p.finish(allow,normalized,form);return true
}
export function cancelApprovals(sessionId:string){for(const p of pending.values())if(p.sessionId===sessionId)p.finish(false)}
