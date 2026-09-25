import {EmployeeInitializationError} from './initialization-state'
import {credentialActive} from './agent-access'
import {AsyncLocalStorage} from 'node:async_hooks'
import {randomUUID} from 'node:crypto'
import {COMMANDS} from '../shared/api-registry'
import {assertManagementKind,emptyAccess,type Delegation,type RequestContext,type PrincipalRef} from '../shared/management'
import type {StoredSession,Store} from '../shared/types'
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
  return caller.kind!=='cloud-native-worker'&&(index.global.has(caller.id)||!index.global.has(target.id)&&caller.managementRole==='manager'&&(target.managementRole??'employee')==='employee'&&caller.group===target.group&&index.relations.has(caller.id+'>'+target.id))
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
/** Visual geometry has its own scope; it never grants task or filesystem control. */
export function canEditOffice(store:Store,principal:PrincipalRef,team:string,employeeId?:string){
  if(principal.kind==='operator')return true
  const caller=store.sessions.find(card=>card.id===principal.employeeId&&!card.deleting)
  if(!caller||caller.kind==='cloud-native-worker')return false
  const global=!!store.access?.globalManagerIds.includes(caller.id)
  if(team!==caller.group)return global
  if(caller.managementRole!=='manager')return false
  if(global||!employeeId||employeeId===caller.id)return true
  const target=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  return target?.group===team&&(target.managementRole??'employee')==='employee'&&!store.access?.globalManagerIds.includes(employeeId)&&!!store.access?.relations.some(edge=>edge.state==='active'&&edge.managerId===caller.id&&edge.employeeId===employeeId)
}
const USER_ONLY_APIS=new Set(['auth.agent-token','auth.revoke','management.global','session.acknowledge','ui.click','ui.type','ui.drag','ui.wheel'])
function authorizeAccess(command:string,args:Record<string,any>={},targetId?:string,context=requestContext()){
  const policy=COMMANDS.find(c=>c.name===command);if(!policy)throw Error('Unknown API command')
  const principal=context.principal
  if(principal.kind==='agent'&&context.credentialHash&&!credentialActive(principal.employeeId,context.credentialHash))throw Error('Agent credential revoked')
  const caller=callerEmployee(principal)
  if(caller){
    assertManagementKind(caller,isGlobal(principal))
    if(caller.initialization&&caller.initialization.status!=='ready'){
      const reading=['auth.whoami','api.list','api.describe','api.docs','management.topology','plugin.list','plugin.describe','session.status','session.info'].includes(command)||['workspace.list','workspace.read'].includes(command)&&args.employee===caller.id
      if(!reading)throw new EmployeeInitializationError(caller.initialization.status==='failed')
    }
  }
  if(principal.kind==='operator')return
  if(USER_ONLY_APIS.has(command))throw Error('Only the user may call '+command)
  if(policy.permission==='layout.read'||policy.permission==='layout.write'){
    const store=readStore(),employeeId=command==='card.place'?String(args.id):undefined
    const team=command==='card.place'?store.sessions.find(card=>card.id===employeeId)?.group:['office.layout','management.relayout'].includes(command)?args.team:args.name
    if(policy.permission==='layout.read'){
      if(team!==undefined&&!store.groups.includes(team))throw Error('Unknown Team')
      if(isGlobal(principal)||caller!.managementRole==='manager'&&(team===undefined||team===caller!.group))return
    }else if(typeof team==='string'&&store.groups.includes(team)&&canEditOffice(store,principal,team,employeeId))return
    throw Error('Forbidden layout: '+command)
  }
  if(isGlobal(principal))return
  const deny=()=>{throw Error('Forbidden: '+command)}
  const own=targetId===caller!.id
  switch(policy.permission){
    case 'identity':case 'topology':return
    case 'relation':if(caller!.managementRole==='manager')return;return deny()
    case 'employee.read':if(command==='session.list'||command==='session.status'&&!args.employee&&!args.id||own||targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.message':case 'employee.configure':if(targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.create':if(caller!.managementRole==='manager'&&args.group===caller!.group&&(args.managementRole??'employee')==='employee')return;return deny()
    case 'employee.delete':{const target=readStore().sessions.find(c=>c.id===targetId);if(targetId&&canControl(principal,targetId)&&target?.createdBy?.kind==='agent'&&target.createdBy.employeeId===caller!.id)return;return deny()}
    case 'workspace':if(args.employee===caller!.id&&!args.team&&!args.shared)return;return deny()
    case 'plugin':if(command==='plugin.list'||command==='plugin.describe')return;if(args.employee===caller!.id&&!args.team&&!args.workspace)return;return deny()
    case 'schedule':if(caller!.managementRole!=='manager')return deny();if(!targetId||canControl(principal,targetId))return;return deny()
    default:return deny()
  }
}
export function authorize(command:string,args:Record<string,any>={},targetId?:string,context=requestContext()){
  authorizeAccess(command,args,targetId,context)
}
export function authorizeSlash(text:string,targetId:string,delegation:Delegation|undefined){
  if(!text.startsWith('/')||!delegation)return
  const name=text.trim().split(/\s/)[0].slice(1),commands:Record<string,string>={model:'config.model',effort:'config.effort',fast:'config.fast',plan:'config.plan',normal:'config.plan',permissions:'config.permission',fork:'card.clone',new:'card.native-bind',clear:'card.native-bind',help:'session.info',status:'session.info',skills:'engine.inspect',mcp:'engine.inspect',account:'engine.inspect',usage:'engine.inspect',stop:'session.background-stop',ps:'session.background'}
  const context={principal:delegation.requestedBy,requestId:delegation.requestId,credentialHash:delegation.credentialHash}
  if(!commands[name]&&!isGlobal(context.principal))throw Error('Manager messages cannot invoke unscoped slash commands')
  if(commands[name])authorize(commands[name],{id:targetId},targetId,context)
}
export function visibleEmployees(principal=requestContext().principal){return readStore().sessions.filter(card=>!card.deleting&&(isGlobal(principal)||principal.kind==='agent'&&(card.id===principal.employeeId||canControl(principal,card.id))))}
export function publicEmployee(card:StoredSession){return {id:card.id,title:card.title,group:card.group,kind:card.kind??'worker',engine:card.engine,managementRole:card.managementRole??'employee',deleting:!!card.deleting,initialization:card.initialization}}
/** Static API visibility and workspace handbooks use the same target identity. */
export function allowedCommands(context=requestContext(),store=readStore()){
  const principal=context.principal,card=principal.kind==='agent'?store.sessions.find(c=>c.id===principal.employeeId&&!c.deleting):undefined
  if(principal.kind==='agent'&&!card)return []
  const global=principal.kind==='operator'||store.access?.globalManagerIds.includes(card!.id),manager=card?.kind!=='cloud-native-worker'&&card?.managementRole==='manager'
  return COMMANDS.filter(command=>global
    ? !USER_ONLY_APIS.has(command.name)||principal.kind==='operator'
    : command.permission!=='operator'&&(!['relation','employee.create','employee.delete','employee.message','employee.configure','schedule','layout.read','layout.write'].includes(command.permission)||manager))
}
export function apiDocumentation(context=requestContext(),store=readStore()){
  const card=context.principal.kind==='agent'?store.sessions.find(c=>c.id===(context.principal as {employeeId:string}).employeeId&&!c.deleting):undefined
  if(context.principal.kind==='agent'&&!card)throw Error('Unknown employee for API documentation')
  const global=context.principal.kind==='operator'||!!store.access?.globalManagerIds.includes(card!.id),manager=global||card?.managementRole==='manager'
  const lines=['# Agents Company CLI 操作手册','','所有命令可加 `--json`。成功返回 `{ok:true,data}`；失败返回 `{ok:false,error}` 并以非零状态退出。JSON 参数可使用内联 JSON 或 `@文件.json`。',
    '',`身份：${context.principal.kind==='operator'?'用户':card!.title}；范围：${global?'全局管理':manager?'同 Team 的有效管理关系':'本人工作区与已授权插件'}。`,
    '','先执行 `agents auth whoami --json` 和 `agents management topology --json` 查询当前身份、稳定员工 ID 与实际有效关系。文档、目录名称、提示词和视图成员关系不授予权限。']
  lines.push('','## 本项目的员工与执行引擎','Agents Company 的员工必须通过 `agents card create` 登记，通过本项目的 `session.*` 和 `schedule.*` API 管理。Codex / Claude Code 只是执行引擎；其内置子 Agent、Agent / Task 工具不能替代本项目员工。不要直接编辑宿主状态 JSON。')
  if(card&&manager)lines.push('','## 创建本 Team 的员工（完整起步示例）',`你的 Team 是 ${JSON.stringify(card.group)}，员工 ID 是 ${card.id}。按顺序执行：`, '```sh', 'agents auth whoami --json', `agents card create --title Reviewer --group ${JSON.stringify(card.group)} --kind worker --engine ${card.engine} --json`, 'agents management topology --json', 'agents session status --employee <card.create返回的id> --json', '# 等 initialization.status 为 ready 后再发送；失败使用 agents card initialize ID 重试', 'agents session send --employee <card.create返回的id> --text "检查项目并报告发现的问题" --json', 'agents session transcript --employee <员工id> --limit 100 --json', '```', '创建成功会自动建立有效管理关系，无需为自己刚创建的员工再次申请。员工随后自动初始化；先用 `agents session status --employee ID --json` 等待 `initialization.status` 变为 `ready`。期间发送、排队、追加和会话读取都会返回 `EMPLOYEE_INITIALIZING`，不能抢先派发任务；失败可用 `agents card initialize ID` 重试。使用返回的真实 ID，不能把姓名当作 ID。若员工已存在，先查看拓扑；申请 existing Employee 的关系须等待批准。')
  if(manager)lines.push('','## 用户请求调整界面布局时',
    '先调用 `agents office layout --json`，读取后台实际 Team 世界坐标、员工 Team 内坐标及 editable 标记。只在用户要求时调整，不修改工作目录、权限或任务。',
    '调整 Team：`agents room bounds "TEAM" --x 120 --y 100 --width 1100 --height 900 --json`。参数可仅提供需要改变的部分，其他 Team 会自动避让。',
    '调整员工：`agents card place EMPLOYEE_ID --x 300 --y 240 --snap off --json`。坐标相对其 Team；只能在允许的范围内移动，不能借布局更换 Team。',
    '自动整理当前团队：`agents management relayout --team "TEAM" --json`；人数变化也会自动聚合、适配外框，并避让其他 Team。完成后再次查询 office layout 核对最终位置。',
    '普通 Team Manager 可调整本 Team 边框并整理本 Team；单独移动员工仅限自己和有 active 管理关系的 Employee。普通 Employee 没有布局修改权限。',
    '已获全局 Agents Manager 授权的员工可以调整其他 Team。调整自己 Team 的布局还要求职位为 Manager。仅位于 Agents-Managers 文件夹不授予权限。自动避让产生的位移不改变任何管理关系。',
    '不要用 ui.click/ui.drag 等测试接口代替结构化布局 API；这些模拟操作仅供用户入口。读取员工消息不会替用户标记已读。')
  if(card)lines.push('','## 自己的工作区',`使用 \`agents workspace list . --employee ${card.id}\`；读写、创建目录和回收文件使用同一 employee 参数。路径相对自己的工作目录，不能将其他员工 ID 作为权限提升方式。`,'插件先用 `agents plugin describe PLUGIN_ID --json` 查看独立 schema，再使用 `agents plugin call PLUGIN_ID METHOD --employee EMPLOYEE_ID --params JSON`。未向员工声明的插件命令会被拒绝。')
  if(manager)lines.push('','## 员工协作流程','1. `agents management request --employee EMPLOYEE_ID` 申请关系；pending 不产生权限，需用户或全局 Manager 批准。','2. `agents session info --employee EMPLOYEE_ID` 查看状态；`agents session send --employee EMPLOYEE_ID --text "任务内容"` 派发工作，返回 messageId 仅表示已接受。','3. `agents session transcript --employee EMPLOYEE_ID --limit 100` 读取历史；`agents session follow --employee EMPLOYEE_ID` 等待当前任务事件。','4. `agents session interrupt --employee EMPLOYEE_ID --expected-message-id MESSAGE_ID` 停止指定的当前工作；定时任务会走调度取消流程。','5. `agents card create --title NAME --group TEAM` 创建普通员工；Team Manager 只能在本 Team 创建，后台自动记录创建者并建立有效关系。只有自己创建且仍有有效关系的员工可由 Team Manager 删除。','6. 调度前读取 `agents schedule schema --json`，然后 `agents schedule create --name NAME --employee ID --prompt "任务内容" --at ISO_TIMESTAMP`；复杂规则可用 `--spec @文件.json`。','7. `agents management unbind RELATION_ID` 撤销关系，同时撤销该来源的队列、活动委派、未来调度和订阅。重新批准不会恢复旧关系来源的任务。','管理箭头不包含终端任意输入、其他员工文件写入、工具提权审批或修改执行权限。被派发任务的员工仍使用自己的身份。')
  if(global)lines.push('','## 全局管理','可使用下方全局命令管理 Team、主机、视图、员工及调度。设置 Team 角色使用 `agents card management-role ID manager|employee`；处理申请使用 `agents management decide RELATION_ID approve|deny`。只有用户入口能签发凭据和授予全局权限。','Team 可改名且目录不改名；员工名称不可改。删除前查询稳定 ID 与忙闲状态。需要完整背景与参数示例时阅读项目 API.md / SCHEDULER.md；具体可调用范围以本手册和服务端策略为准。')
  lines.push('','## 当前身份可调用的命令',...allowedCommands(context,store).map(command=>`### ${command.name}\n\n\`agents ${command.name.replaceAll('.',' ')} ${command.args}\`\n\n${command.summary}\n\n授权类别：${command.permission}；目标：${command.target}。`))
  return {markdown:lines.join('\n\n')}
}

/** A readable permission contract; no credentials or fixed subordinate lists. */
export function permissionDocumentation(context:RequestContext,store:Store){
  const card=context.principal.kind==='agent'?store.sessions.find(c=>c.id===(context.principal as {employeeId:string}).employeeId):undefined
  const global=context.principal.kind==='operator'||!!store.access?.globalManagerIds.includes(card?.id??'')
  return ['# Agents Company 权限说明',
    `职位：${card?.managementRole==='manager'?'Manager':'Employee'}；管理范围：${global?'全局明确授权':'本 Team'}。`,
    'Manager 必须是本地运行的员工，可以按已授权的工作环境使用本机工具或 Tunnel。云端原生员工只能担任 Employee，项目工具在绑定主机执行，失败不回退本机。',
    'Manager 只可管理同 Team 中有 active 箭头的 Employee。pending 不授予权限。创建员工会原子建立关系，删除额外要求自己是创建者。不能管理其他 Manager、跨 Team 员工或自行提权。',
    'Employee 只使用自己的工作区与已授权插件，接收任务不会继承发送者的身份。管理关系不授予同事的任意文件写入、终端输入、主机凭据或工具提权审批。',
    '布局：Team Manager 可调整本 Team 外框、整理本 Team，并单独移动自己及已绑定 Employee；普通 Employee 不可改布局。全局授权员工可改其他 Team，但调整自己的 Team 仍须是 Manager。布局不改变 Team 归属、目录或任务授权。',
    '未读回复只能由用户确认；Agent、Manager、插件查询或后台订阅均不能代用户标记已读。',
    '解绑立即撤销对应的后续调用、订阅、队列及调度。视图、姓名和文档不授予权限。文档是服务端授权的使用说明，不是安全凭据。',
    'Trusted 保留系统账号的权限，API 检查不构成系统级隔离；Isolated 使用受支持的外层隔离，不支持的执行环境拒绝启动。',
    '## 当前可发现的 API',
    ...allowedCommands(context,store).map(c=>`- ${c.name}：${c.summary}（${c.permission}）`)
  ].join('\n\n')+'\n'
}
