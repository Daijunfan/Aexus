import {credentialActive} from './agent-access'
import {AsyncLocalStorage} from 'node:async_hooks'
import {randomUUID} from 'node:crypto'
import {COMMANDS} from '../shared/api-registry'
import {emptyAccess,type Delegation,type RequestContext,type PrincipalRef} from '../shared/management'
import type {StoredSession} from '../shared/types'
import {readStore} from './store'

const contexts=new AsyncLocalStorage<RequestContext>()
export const operatorContext=():RequestContext=>({principal:{kind:'operator'},requestId:randomUUID()})
export const requestContext=()=>{const value=contexts.getStore();if(!value)throw Error('Missing authenticated caller');return value}
export const withCaller=<T>(context:RequestContext,work:()=>T)=>contexts.run(context,work)
export const isGlobal=(principal:PrincipalRef)=>principal.kind==='operator'||(readStore().access??emptyAccess()).globalManagerIds.includes(principal.employeeId)
export function callerEmployee(principal=requestContext().principal){if(principal.kind!=='agent')return undefined;const card=readStore().sessions.find(c=>c.id===principal.employeeId&&!c.deleting);if(!card)throw Error('Agent identity revoked');return card}
let indexedRevision:number|undefined,indexed:{cards:Map<string,StoredSession>;global:Set<string>;relations:Set<string>}|undefined
function managementIndex(){const store=readStore();if(!indexed||indexedRevision!==store.revision){indexedRevision=store.revision;indexed={cards:new Map(store.sessions.map(card=>[card.id,card])),global:new Set(store.access?.globalManagerIds),relations:new Set(store.access?.relations.filter(r=>r.state==='active').map(r=>r.managerId+'>'+r.employeeId))}}return indexed}
export function canControl(principal:PrincipalRef,targetId:string){
  if(principal.kind==='operator')return true
  const index=managementIndex(),caller=index.cards.get(principal.employeeId),target=index.cards.get(targetId)
  if(!caller||caller.deleting||!target||target.deleting)return false
  return index.global.has(caller.id)||!index.global.has(target.id)&&caller.managementRole==='manager'&&(target.managementRole??'employee')==='employee'&&caller.group===target.group&&index.relations.has(caller.id+'>'+target.id)
}

export function delegationFor(targetId:string,context=requestContext()):Delegation{
  authorize('session.send',{id:targetId},targetId,context)
  const relationId=context.principal.kind==='agent'&&!isGlobal(context.principal)?readStore().access?.relations.find(r=>r.state==='active'&&r.managerId===(context.principal as {employeeId:string}).employeeId&&r.employeeId===targetId)?.id:undefined
  const globalGrantId=context.principal.kind==='agent'&&isGlobal(context.principal)?readStore().access?.globalGrants?.[context.principal.employeeId]:undefined
  return {requestedBy:context.principal,globalGrantId,requestId:context.requestId,credentialHash:context.credentialHash,relationId}
}
export function validateDelegation(delegation:Delegation|undefined,targetId:string){
  if(!delegation)return // Old persisted user schedules retain operator ownership.
  const context={principal:delegation.requestedBy,requestId:delegation.requestId,credentialHash:delegation.credentialHash}
  authorize('session.send',{id:targetId},targetId,context)
  if(delegation.globalGrantId&&(delegation.requestedBy.kind!=='agent'||readStore().access?.globalGrants?.[delegation.requestedBy.employeeId]!==delegation.globalGrantId))throw Error('Global delegation grant revoked')
  if(delegation.relationId&&!readStore().access?.relations.some(r=>r.id===delegation.relationId&&r.state==='active'&&r.employeeId===targetId&&delegation.requestedBy.kind==='agent'&&r.managerId===delegation.requestedBy.employeeId))throw Error('Delegation relation revoked')
}
export function authorize(command:string,args:Record<string,any>={},targetId?:string,context=requestContext()){
  const policy=COMMANDS.find(c=>c.name===command);if(!policy)throw Error('Unknown API command')
  const principal=context.principal
  if(principal.kind==='agent'&&context.credentialHash&&!credentialActive(principal.employeeId,context.credentialHash))throw Error('Agent credential revoked')
  const caller=callerEmployee(principal)
  if(principal.kind==='operator')return
  if(['auth.agent-token','auth.revoke','management.global'].includes(command))throw Error('Only the user may grant credentials or global authority')
  if(isGlobal(principal))return
  const deny=()=>{throw Error('Forbidden: '+command)}
  const own=targetId===caller!.id
  switch(policy.permission){
    case 'identity':case 'topology':return
    case 'relation':if(caller!.managementRole==='manager')return;return deny()
    case 'employee.read':if(['session.list','session.status'].includes(command)||own||targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.message':case 'employee.configure':if(targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.create':if(caller!.managementRole==='manager'&&args.group===caller!.group&&(args.managementRole??'employee')==='employee')return;return deny()
    case 'employee.delete':{const target=readStore().sessions.find(c=>c.id===targetId);if(targetId&&canControl(principal,targetId)&&target?.createdBy?.kind==='agent'&&target.createdBy.employeeId===caller!.id)return;return deny()}
    case 'workspace':if(args.employee===caller!.id&&!args.team&&!args.shared)return;return deny()
    case 'plugin':if(command==='plugin.list'||command==='plugin.describe')return;if(args.employee===caller!.id&&!args.team&&!args.workspace)return;return deny()
    case 'schedule':if(caller!.managementRole!=='manager')return deny();if(!targetId||canControl(principal,targetId))return;return deny()
    default:return deny()
  }
}
export function authorizeSlash(text:string,targetId:string,delegation:Delegation|undefined){
  if(!text.startsWith('/')||!delegation)return
  const name=text.trim().split(/\s/)[0].slice(1),commands:Record<string,string>={model:'config.model',effort:'config.effort',fast:'config.fast',plan:'config.plan',normal:'config.plan',permissions:'config.permission',fork:'card.clone',new:'card.native-bind',clear:'card.native-bind',help:'session.info',status:'session.info',skills:'engine.inspect',mcp:'engine.inspect',account:'engine.inspect',usage:'engine.inspect',stop:'session.background-stop',ps:'session.background'}
  const context={principal:delegation.requestedBy,requestId:delegation.requestId,credentialHash:delegation.credentialHash}
  if(!commands[name]&&!isGlobal(context.principal))throw Error('Manager messages cannot invoke unscoped slash commands')
  if(commands[name])authorize(commands[name],{id:targetId},targetId,context)
}
export function visibleEmployees(principal=requestContext().principal){return readStore().sessions.filter(card=>!card.deleting&&(isGlobal(principal)||principal.kind==='agent'&&(card.id===principal.employeeId||canControl(principal,card.id))))}
export function publicEmployee(card:StoredSession){return {id:card.id,title:card.title,group:card.group,kind:card.kind??'worker',engine:card.engine,managementRole:card.managementRole??'employee',deleting:!!card.deleting}}
export function allowedCommands(context=requestContext()){return COMMANDS.filter(command=>{try{if(isGlobal(context.principal))return !['auth.agent-token','auth.revoke','management.global'].includes(command.name)||context.principal.kind==='operator';const role=callerEmployee(context.principal)!.managementRole;return command.permission!=='operator'&&(!['relation','employee.create','employee.delete','employee.message','employee.configure','schedule'].includes(command.permission)||role==='manager')}catch{return false}})}
export function apiDocumentation(){
  const context=requestContext(),card=callerEmployee(),global=isGlobal(context.principal),manager=global||card?.managementRole==='manager'
  const lines=['# Agents Company CLI 操作手册','','所有命令可加 `--json`。成功返回 `{ok:true,data}`；失败返回 `{ok:false,error}` 并以非零状态退出。JSON 参数可使用内联 JSON 或 `@文件.json`。',
    '',`身份：${context.principal.kind==='operator'?'用户':card!.title}；范围：${global?'全局管理':manager?'同 Team 的有效管理关系':'本人工作区与已授权插件'}。`,
    '','先执行 `agents auth whoami --json` 和 `agents management topology --json` 查询当前身份、稳定员工 ID 与实际有效关系。文档、目录名称、提示词和视图成员关系不授予权限。']
  if(card)lines.push('','## 自己的工作区',`使用 \`agents workspace list . --employee ${card.id}\`；读写、创建目录和回收文件使用同一 employee 参数。路径相对自己的工作目录，不能将其他员工 ID 作为权限提升方式。`,'插件先用 `agents plugin describe PLUGIN_ID --json` 查看独立 schema，再使用 `agents plugin call PLUGIN_ID METHOD --employee EMPLOYEE_ID --params JSON`。未向员工声明的插件命令会被拒绝。')
  if(manager)lines.push('','## 员工协作流程','1. `agents management request --employee EMPLOYEE_ID` 申请关系；pending 不产生权限，需用户或全局 Manager 批准。','2. `agents session info --employee EMPLOYEE_ID` 查看状态；`agents session send --employee EMPLOYEE_ID --text "任务内容"` 派发工作，返回 messageId 仅表示已接受。','3. `agents session transcript --employee EMPLOYEE_ID --limit 100` 读取历史；`agents session follow --employee EMPLOYEE_ID` 等待当前任务事件。','4. `agents session interrupt --employee EMPLOYEE_ID --expected-message-id MESSAGE_ID` 停止指定的当前工作；定时任务会走调度取消流程。','5. `agents card create --title NAME --group TEAM` 创建普通员工；Team Manager 只能在本 Team 创建，后台自动记录创建者并建立有效关系。只有自己创建且仍有有效关系的员工可由 Team Manager 删除。','6. 调度前读取 `agents schedule schema --json`，然后 `agents schedule create --name NAME --employee ID --prompt "任务内容" --at ISO_TIMESTAMP`；复杂规则可用 `--spec @文件.json`。','7. `agents management unbind RELATION_ID` 撤销关系，同时撤销该来源的队列、活动委派、未来调度和订阅。重新批准不会恢复旧关系来源的任务。','管理箭头不包含终端任意输入、其他员工文件写入、工具提权审批或修改执行权限。被派发任务的员工仍使用自己的身份。')
  if(global)lines.push('','## 全局管理','可使用下方全局命令管理 Team、主机、视图、员工及调度。设置 Team 角色使用 `agents card management-role ID manager|employee`；处理申请使用 `agents management decide RELATION_ID approve|deny`。只有用户入口能签发凭据和授予全局权限。','Team 可改名且目录不改名；员工名称不可改。删除前查询稳定 ID 与忙闲状态。需要完整背景与参数示例时阅读项目 API.md / SCHEDULER.md；具体可调用范围以本手册和服务端策略为准。')
  lines.push('','## 当前身份可调用的命令',...allowedCommands(context).map(command=>`### ${command.name}\n\n\`agents ${command.name.replaceAll('.',' ')} ${command.args}\`\n\n${command.summary}\n\n授权类别：${command.permission}；目标：${command.target}。`))
  return {markdown:lines.join('\n\n')}
}
