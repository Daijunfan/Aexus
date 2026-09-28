import {EmployeeInitializationError} from './initialization-state'
import {credentialActive} from './agent-access'
import {requestContext,operatorContext,withCaller} from './request-context'
export {requestContext,operatorContext,withCaller} from './request-context'
import {randomUUID} from 'node:crypto'
import {COMMANDS} from '../shared/api-registry'
import {assertManagementKind,hasGlobalRole,type Delegation,type RequestContext,type PrincipalRef} from '../shared/management'
import {rolePolicy,roleAllows,isSupervisor,isManagementRole} from '../shared/roles'
import {employeeSettings,teamSettings,type StoredSession,type Store} from '../shared/types'
import {readStore} from './store'

export const isGlobal=(principal:PrincipalRef)=>{if(principal.kind==='operator')return true;const store=readStore();return hasGlobalRole(store.access,store.sessions.find(card=>card.id===principal.employeeId))}
export function canReadHostCredentials(id:string,principal=requestContext().principal){
  if(isGlobal(principal))return true
  const caller=callerEmployee(principal)
  return caller?.managementRole==='manager'&&teamSettings(readStore(),caller.group).hostId===id
}
export function callerEmployee(principal=requestContext().principal){if(principal.kind!=='agent')return undefined;const card=readStore().sessions.find(c=>c.id===principal.employeeId&&!c.deleting);if(!card)throw Error('Agent identity revoked');return card}
let indexedRevision:number|undefined,indexed:{cards:Map<string,StoredSession>}|undefined
function managementIndex(){const store=readStore();if(!indexed||indexedRevision!==store.revision){indexedRevision=store.revision;indexed={cards:new Map(store.sessions.map(card=>[card.id,card]))}}return indexed}
export function canControl(principal:PrincipalRef,targetId:string){
  if(principal.kind==='operator')return true
  const index=managementIndex(),caller=index.cards.get(principal.employeeId),target=index.cards.get(targetId)
  if(!caller||caller.deleting||!target||target.deleting)return false
  if(caller.kind==='cloud-native-worker')return false
  const policy=rolePolicy(caller.managementRole)
  return policy.controls.includes(target.managementRole??'employee')&&(policy.scope==='global'||policy.scope==='team'&&caller.group===target.group)
}

export function delegationFor(targetId:string,context=requestContext()):Delegation{
  authorize('session.send',{id:targetId},targetId,context)
  const globalGrantId=context.principal.kind==='agent'&&isGlobal(context.principal)?readStore().access?.globalGrants?.[context.principal.employeeId]:undefined
  return {requestedBy:context.principal,globalGrantId,requestId:context.requestId,credentialHash:context.credentialHash}
}
export function validateDelegation(delegation:Delegation|undefined,targetId:string){
  if(!delegation)return // Old persisted user schedules retain operator ownership.
  const context={principal:delegation.requestedBy,requestId:delegation.requestId,credentialHash:delegation.credentialHash}
  authorize('session.send',{id:targetId},targetId,context)
  if(delegation.globalGrantId&&(delegation.requestedBy.kind!=='agent'||readStore().access?.globalGrants?.[delegation.requestedBy.employeeId]!==delegation.globalGrantId))throw Error('Global delegation grant revoked')
}
/** Visual geometry has its own scope; it never grants task or filesystem control. */
export function canEditOffice(store:Store,principal:PrincipalRef,team:string,employeeId?:string){
  if(principal.kind==='operator')return true
  const caller=store.sessions.find(card=>card.id===principal.employeeId&&!card.deleting)
  if(!caller||caller.kind==='cloud-native-worker')return false
  const policy=rolePolicy(caller.managementRole)
  if(!roleAllows(caller.managementRole,'layout.write'))return false
  if(policy.scope==='global')return !employeeId||employeeId===caller.id||store.sessions.some(card=>card.id===employeeId&&!card.deleting&&policy.controls.includes(card.managementRole??'employee'))
  if(team!==caller.group||policy.scope!=='team')return false
  if(!employeeId||employeeId===caller.id)return true
  const target=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  return !!target&&target.group===caller.group&&policy.controls.includes(target.managementRole??'employee')
}
const USER_ONLY_APIS=new Set(["system.directories","engine.list","engine.check","engine.configure","engine.install-plan","engine.install","engine.install-status","engine.cancel-install","engine.login","engine.login-status","engine.cancel-login","transfer.upload-begin","transfer.upload-chunk","transfer.upload-commit","transfer.upload-abort","transfer.download-info","transfer.download-chunk",'auth.agent-token','auth.revoke','management.global','management.team','session.acknowledge','ui.click','ui.type','ui.drag','ui.wheel'])
function authorizeAccess(command:string,args:Record<string,any>={},targetId?:string,context=requestContext()){
  const policy=COMMANDS.find(c=>c.name===command);if(!policy)throw Error('Unknown API command')
  const principal=context.principal
  if(principal.kind==='agent'&&context.credentialHash&&!credentialActive(principal.employeeId,context.credentialHash))throw Error('Agent credential revoked')
  const caller=callerEmployee(principal)
  if(caller){
    assertManagementKind(caller,isGlobal(principal),employeeSettings(readStore(),caller).mode==='cloud')
    if(caller.initialization&&caller.initialization.status!=='ready'){
      const reading=['auth.whoami','api.list','api.describe','api.docs','management.roles','management.topology','host.list','plugin.list','plugin.describe','session.status','session.info'].includes(command)||['workspace.list','workspace.read'].includes(command)&&args.employee===caller.id
      if(!reading)throw new EmployeeInitializationError(caller.initialization.status==='failed')
    }
  }
  if(principal.kind==='operator')return
  if(USER_ONLY_APIS.has(command)||command.startsWith('ui.'))throw Error('Only the user may call '+command)
  if(!roleAllows(caller!.managementRole,policy.permission))throw Error('Forbidden: '+command)
  assertRoleBoundaries(command,args,targetId,caller!)
  if(command.startsWith('connector.')){
    if(isGlobal(principal)||args.manager===caller!.id&&canControl(principal,args.employee))return
    throw Error('Forbidden connector')
  }
  if(policy.permission==='layout.read'||policy.permission==='layout.write'){
    const store=readStore(),employeeId=command==='card.place'?String(args.id):undefined
    const team=command==='card.place'?store.sessions.find(card=>card.id===employeeId)?.group:['office.layout','management.relayout'].includes(command)?args.team:args.name
    if(policy.permission==='layout.read'){
      if(team!==undefined&&!store.groups.includes(team))throw Error('Unknown Team')
      if(isGlobal(principal)||isSupervisor(caller!.managementRole)&&(team===undefined||team===caller!.group))return
    }else if(typeof team==='string'&&store.groups.includes(team)&&canEditOffice(store,principal,team,employeeId))return
    throw Error('Forbidden layout: '+command)
  }
  if(isGlobal(principal)){
    if(targetId&&targetId!==caller!.id&&!canControl(principal,targetId))throw Error('Forbidden employee target')
    return
  }
  const deny=()=>{throw Error('Forbidden: '+command)}
  const own=targetId===caller!.id
  switch(policy.permission){
    case 'identity':case 'topology':return
    case 'host.read':if(canReadHostCredentials(String(args.id),principal))return;return deny()
    case 'relation':if(isSupervisor(caller!.managementRole))return;return deny()
    case 'employee.read':if(command==='session.list'||command==='session.status'&&!args.employee&&!args.id||own||targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.message':case 'employee.configure':if(targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.create':if(args.group===caller!.group&&rolePolicy(caller!.managementRole).creates.includes(args.managementRole??'employee'))return;return deny()
    case 'employee.delete':if(targetId&&canDeleteEmployee(principal,targetId))return;return deny()
    case 'workspace':if(args.employee===caller!.id&&!args.team&&!args.shared)return;return deny()
    case 'plugin':if(command==='plugin.list'||command==='plugin.describe')return;if(args.employee===caller!.id&&!args.team&&!args.workspace)return;return deny()
    case 'schedule':if(!isSupervisor(caller!.managementRole))return deny();if(!targetId||canControl(principal,targetId))return;return deny()
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
export function canReadEmployee(principal:PrincipalRef,id:string){return principal.kind==='operator'||principal.employeeId===id||canControl(principal,id)}
export function canDeleteEmployee(principal:PrincipalRef,id:string){
  if(principal.kind==='operator')return true
  const caller=managementIndex().cards.get(principal.employeeId),target=managementIndex().cards.get(id)
  return !!caller&&!!target&&!rolePolicy(target.managementRole).userManaged&&rolePolicy(caller.managementRole).removes.includes(target.managementRole??'employee')&&canControl(principal,id)
}

export function visibleEmployees(principal=requestContext().principal){return readStore().sessions.filter(card=>!card.deleting&&canReadEmployee(principal,card.id))}
export function publicEmployee(card:StoredSession){return {id:card.id,title:card.title,group:card.group,kind:card.kind??'worker',workEnvironment:card.workEnvironment??'team',engine:card.engine,managementRole:card.managementRole??'employee',createdBy:card.createdBy??null,createdAt:card.createdAt,deleting:!!card.deleting,initialization:card.initialization}}
/** Static API visibility and workspace handbooks use the same target identity. */
export function allowedCommands(context=requestContext(),store=readStore()){
  const principal=context.principal,card=principal.kind==='agent'?store.sessions.find(c=>c.id===principal.employeeId&&!c.deleting):undefined
  if(principal.kind==='agent'&&!card)return []
  return COMMANDS.filter(command=>!['management.request','management.decide','management.unbind','management.team'].includes(command.name)).filter(command=>principal.kind==='operator'||!USER_ONLY_APIS.has(command.name)&&!command.name.startsWith('ui.')&&roleAllows(card?.managementRole,command.permission))
}
export function apiDocumentation(context=requestContext(),store=readStore()){
  const card=context.principal.kind==='agent'?store.sessions.find(c=>c.id===(context.principal as {employeeId:string}).employeeId&&!c.deleting):undefined
  if(context.principal.kind==='agent'&&!card)throw Error('Unknown employee for API documentation')
  const policy=rolePolicy(card?.managementRole),global=context.principal.kind==='operator'||policy.scope==='global',supervisor=global||isSupervisor(card?.managementRole)
  const lines=['# Agents Company CLI 操作手册','所有命令可加 `--json`。成功返回 `{ok:true,data}`；失败返回 `{ok:false,error}` 并以非零状态退出。JSON 参数支持内联值或 `@文件.json`。',
    `身份：${context.principal.kind==='operator'?'用户':card!.title}；职位：${context.principal.kind==='operator'?'Operator':policy.label}；范围：${global?'跨 Team':policy.scope==='team'?'本 Team 的全部 Employee':'本人及已授权工具'}。`,
    '权限属于员工自己的 managementRole；Team 名字、工作目录、标记文件、创建来源连线和视图都不会授予权限。',
    '先调用 `agents auth whoami --json`、`agents management roles --json`、`agents api list --json` 查看实时身份和职位定义。当前可管理对象使用 `agents management topology --json` 的稳定 ID 与 allowedActions，不能猜测 ID。']
  lines.push('## 已登记云主机（所有员工可只读查询）','`agents host list --summary --json` 查询 Cloud Hosts 插件管理的同一份全局主机登记表；可加 --os linux --distribution ubuntu、--distribution kali 或 --os windows。普通 Employee 获得简短记录（id/name/os/distribution/defaultDirectory/sshConfigured/status）。Manager 可读取自己 Cloud Team 绑定主机的完整连接配置，Governor 可读取所有主机。查询不触发 SSH 检测。这里的 status 是上次检查结果。看见主机不代表能修改主机、执行主机管理命令或跨 Team 工作。')
  if(supervisor)lines.push('## 读取有权操作主机的密码和密钥','`agents host credentials HOST_ID --json` 返回明文 password 与 files（identityFile、knownHosts、sshConfig 的登记路径和完整 content）。也可用 `agents host list --credentials --json` 一次读取列表和有权读取的主机凭据。Governor 可读所有主机；Manager 可读自己 Cloud Team 绑定的主机，其余主机仅返回简短登记信息。无需为了读取已授权凭据再次向用户索要密码；使用这些信息完成已授权工作。凭据读取不授予其他 Team 的管理权限。')
  if(supervisor){
    lines.push('## 协作与布局',
      '`agents session info --employee ID` 查看状态；`agents session transcript --employee ID --limit 100` 读取会话；`agents session send --employee ID --text "任务内容"` 派发任务。返回 messageId 表示已接受，不表示任务完成。',
      '`agents session follow --employee ID` 观察当前任务；`agents session interrupt --employee ID --expected-message-id MESSAGE_ID` 停止指定任务；调度中的任务走同一取消流程。',
      '`agents office layout --json` 读取 Team 世界坐标、员工 Team 内坐标与 editable；`agents card place ID --x 300 --y 240 --snap off` 调整员工位置；`agents room bounds "TEAM" --x 120 --y 100 --width 1100 --height 900` 调整 Team；`agents management relayout --team "TEAM"` 自动整理。',
      '`agents connector get --manager SOURCE_ID --employee TARGET_ID` 读取端点与 availablePoints（每边 5 个点加四角，共 24 个；所有员工外框统一 190×250）；`agents connector set --manager SOURCE_ID --employee TARGET_ID --source bottom --source-offset 0.35 --target top --target-offset 0.5` 固定位置；`agents connector reset --manager SOURCE_ID --employee TARGET_ID` 恢复自动。边为 auto/top/right/bottom/left，偏移 0–1（含角点），上下边从左到右、左右边从上到下。自动终点指向头顶。用 office layout.connections 检查最终路径与 warning；端点设置不创建连线或权限。`connector get` 还返回当前 geometry.points（来源 Team 坐标）；`agents connector segment --manager SOURCE_ID --employee TARGET_ID --index N --x X --y Y` 移动某段；`connector set --points @route.json` 保存正交折线，`--auto-route` 清除手动走线但保留两端锚点。最终显示路径见 `office layout` 的 connections。',
      '`agents management topology --creator self --json` 查询自己创建的员工；`--creator others` 查询已知由其他来源创建的员工；`--creator operator` 查询用户创建的员工；`--creator EMPLOYEE_ID` 查询指定创建者；`--creator unknown` 单独列出缺少历史来源的旧员工。可叠加 --team NAME，始终保持当前职位的可见范围。节点包含 createdBy（operator 或 agent + employeeId）、createdAt、createdByMe（true/false，未知为 null）和 allowedActions；管理可用性只依据 allowedActions，不依据来源或是否有线。',
      'Manager 可调整本 Team 外框、自己和本 Team 的全部 Employee；Governor 可调整任意 Team 和任意员工的位置，包括自己及其他 Governor。',
      '`agents management activity --json` 查询真实通信与运行中的委派任务（kind=request/task，任务有 messageId）。创建来源显示常驻实线；真实协作期间变绿，任务结束立即熄灭；只读查询不亮灯。连线不授予权限。',
      '先读取 `agents schedule schema --json`，再用 `agents schedule create --name NAME --employee ID --prompt "任务" --at ISO_TIMESTAMP` 或 `--spec @文件.json` 创建排期；所有延迟任务执行前重新检查原发起者权限。',
      '权限仅控制公司的管理 API。收到任务的员工继续使用自己的身份，不继承发送者权限。')
    if(card)lines.push('## 创建员工',
      'Manager 只能在本 Team 创建 Employee；Governor 可在任意 Team 创建 Employee 或 Manager。',
      '```sh',`agents card create --title Reviewer --group ${JSON.stringify(card.group)} --kind worker --engine ${card.engine} --management-role employee --json`,
      'agents session status --employee <返回的员工ID> --json','agents session send --employee <返回的员工ID> --text "检查项目并报告发现的问题" --json','```',
      'Employee 保留纯净上下文，不做模型初始化。Manager / Governor 才有隐藏初始化；如果状态是 pending/running，必须等 ready 后交互；session status --employee ID 的 data 仍是数组，读取 data[0].initialization.status，勿按拼接文字顺序判断。失败用 card initialize ID 重试。未收到创建或删除指令时，不要自行操作。')
  }
  if(global)lines.push('## 固定任务视图',
    '先查 `agents team-view list --json`：views 是全部视图及 Team 名单，activeId 是用户当前标签。`view.get` 表示打开的面板，不表示顶部 Team 视图。',
    '用户明确指定的视图优先；否则使用当轮 `[Agents Company task view]` 中发送时固定的 viewId。本轮不要再跟随用户切换标签。用 `agents office layout --view VIEW_ID --json` 读取本次范围，再用明确 Team 名和员工 ID 调整位置。',
    '`agents canvas view --view VIEW_ID --json` 查询目标相机；`agents canvas set --view VIEW_ID --x X --y Y --zoom Z` 只修改目标相机，不切换用户标签。Team 与员工的位置全局共享，相机独立。视图被删除就报错，不改用 All Team。',
    '`agents session send --employee GOVERNOR_ID --view VIEW_ID --text "整理此视图"` 和 enqueue 均支持显式目标。Governor 定时任务必须提供 `--view VIEW_ID` 或 action.viewId；执行时不用当前标签兜底。',
    'office.layout.crossTeamConnections 给出 source/external/target 三段、轮廓端口与 routed/hidden/blocked 状态。跨 Team 线只在目标员工名牌处画箭头；hidden 表示另一端被视图过滤，blocked 表示暂无合法通道，不能擅自移动其他 Team 让线通过。')
  if(supervisor)lines.push('## 真实操作系统与云端团队',
    'Team 名称和 Team View 标签不是操作系统。management topology --teams-only --json 的 teams 明确给出 mode、hostId、hostName、os、distribution、directory；以这些真实绑定字段核验。云端失败不得改建同名 Mac 团队充数。',
    'Cloud Team 中的 Manager 必须使用 --kind worker --work-environment local，引擎和管理工作区在 Core 本机；它创建的 Employee 默认 --work-environment team，继承 Team 的真实远端主机和目录。kind worker 只表示引擎在 Core 本机，不表示员工的工作区在 Mac。无需安装远端引擎；只有明确要求引擎也在云主机运行时才用 cloud-native-worker。',
    '本 Team 的 Manager 可直接读取 management topology --team TEAM --json 核验主机绑定、员工 workspace、createdBy；也可用只读 host list 查询已登记主机；主机管理仍需要全局权限。创建员工不要把自己的 --work-environment local 复制给远端 Employee。')
  if(global)lines.push('## 按操作系统建队并委派招人',
    '用户要求不同操作系统或云端团队时，先运行 agents host list --summary --json，完整读取简短列表；可加 --os linux --distribution ubuntu、--distribution kali 或 --os windows。它读取登记配置和上次状态，不自动 SSH 检查。复用已登记的 SSH 主机，不凭 Team/View 名字推断环境，不要求用户重新提供列表里已有的 ID。需要时只检查选中的 host check ID；连接失败如实报告。',
    '创建 Ubuntu 示例：agents group add "Ubuntu Team" --mode cloud --host-id HOST_ID --directory-mode default --os linux --distribution ubuntu --json。Core 在该主机 defaultDirectory 下新建同名目录；存在同名目录则报错，不覆盖。绑定已有远端目录用 --directory-mode bind --remote-dir ABSOLUTE_PATH。--os / --distribution 是实际主机断言，不是修改标签；不匹配会拒绝创建。',
    'Kali 使用对应主机与 --os linux --distribution kali；Windows 使用对应主机与 --os windows；Core 本机使用 agents group add "Mac Team" --mode build --os macos --json。如果没有目标系统的登记主机，报告缺少哪种系统，不把本机团队改名冒充。',
    '随后用 agents card create --title "Lead" --group "Ubuntu Team" --management-role manager --kind worker --work-environment local --engine claude --model deepseek-flash --effort low --json 创建 Manager。等 session status 的 initialization.status=ready 后，session send --employee MANAGER_ID --text "请在本团队创建3名 Employee，使用 Claude / deepseek-flash，work-environment team，完成后报告ID与工作区"。如果用户要求 Manager 自己创建员工，Governor 不代为创建。',
    '最后读取 topology 的团队 mode/hostId/os/distribution/directory，并检查每名员工 group、workspace、createdBy.employeeId 等于该队 Manager ID。messageId 仅代表任务已接收，不代表创建完成；等待并核验员工真实记录。')
  if(global)lines.push('## Governor 的红线',
    'Governor 可跨 Team 管理团队、主机、视图、调度以及员工；可控制其他 Governor 的会话与配置，但不能创建、删除或更改 Governor 的职位。',
    '创建 Governor、把任何员工提升为 Governor、降级 Governor、删除 Governor，仅限用户的 UI / 用户 CLI。不能删除含 Governor 的 Team，也不能通过克隆、内部字段或批量删除绕过。克隆后的员工一律为 Employee，不复制职位、全局授权、凭据或管理关系。',
    '`agents card management-role ID employee|manager` 可更改普通员工职位；Governor 的授予与撤销仍由用户操作。凭据签发、撤销及 ui.* 模拟控制也仅限用户。',
    'Team 与员工可改显示名称，已有目录和归属固定。删除前查询稳定 ID、忙闲状态及清理范围。')
  if(supervisor)lines.push('## 明确授权与批量删除',
    '本产品的 Team 是团队记录，员工是 AI Agent，会话是软件数据。用户在管理自己的应用对象；不能把员工数量误当作真人数量，或凭空假定涉及其他人的工作。共享资源与忙闲状态以实时 API 为准。',
    '执行依据是用户的明确请求；Core 权限用于校验边界，不是让你无请求主动删除的授权。用户说“其他团队”时，使用 management.topology.teams 中 isOwnTeam=false 的当前团队，不要求重复逐个提供名称。',
    'teams 每项包含 name、isOwnTeam、employeeCount、governorIds、allowedActions、deleteBlockedReason。只将 allowedActions 含 delete 的 Team 视为职级允许删除；文件范围与远端连接仍由实际删除预检查。统计基于完整团队成员，与 --creator 对 nodes 的筛选无关。',
    '团队任务优先调用 `agents management topology --teams-only --json`：只返回 teams 和 summary，避免大量员工详情被工具截断。summary 直接给出 teams、employees、deletableTeams、blockedTeams；空团队依旧能删除，不按员工数自行推断权限。',
    '同一对话已明确的删除范围和文件处理选择继续有效，除非用户修改或撤销；后续催促不是撤销前文授权。目标及文件选择明确后，执行范围内允许的操作，并报告受保护目标；不要仅因目标较多或存在少数例外而拒绝全部。若用户要求全有或全无，先报告例外，不擅自删除子集。',
    '`agents group remove "Team A" "Team B" --json` 删除团队、员工和关联会话并保留工作目录；仅在用户已明确要求删除员工工作文件夹时加 --delete-workspace。不要把未知文件策略猜成删除文件；必要问题集中询问一次。',
    '先列出将处理及受保护的 Team，使用 CLI 实际执行，再重新读取拓扑核验结果。CLI 失败就如实报告，不编辑宿主状态或通过降级、文件操作绕过 Governor 与共享目录保护。只读预览请求不执行删除。')
  if(card)lines.push('## 工作区与插件',
    `自己的文件 API 使用 \`agents workspace list . --employee ${card.id}\`；路径相对该工作区。插件先用 \`agents plugin describe PLUGIN_ID --json\` 查看 schema，再调用 \`agents plugin call PLUGIN_ID METHOD --employee ${card.id} --params JSON\`。`,
    '公司职位不把原生 Coding Agent 的 cd 或普通文件操作锁在工作目录内；实际执行遵守引擎权限和主机权限。管理其他员工必须使用后台校验身份的 CLI，不能修改宿主状态或他人凭据来绕过。')
  lines.push('## 当前身份可调用的命令',...allowedCommands(context,store).map(command=>`### ${command.name}\n\n\`agents ${command.name.replaceAll('.',' ')} ${command.args}\`\n\n${command.summary}\n\n授权类别：${command.permission}；目标：${command.target}。`))
  return {markdown:lines.join('\n\n')}
}

export function permissionDocumentation(context:RequestContext,store:Store){
  const card=context.principal.kind==='agent'?store.sessions.find(c=>c.id===(context.principal as {employeeId:string}).employeeId):undefined,policy=rolePolicy(card?.managementRole)
  return ['# Agents Company 权限说明',`职位：${context.principal.kind==='operator'?'Operator':policy.label}。${policy.description}`,
    'Employee 使用自身工作区与授权工具；Manager 管理本 Team 的全部 Employee；Governor 管理任意 Team 与员工，布局操作包括其他 Governor。权限属于员工，任何 Team / 文件夹名字都不授予权限。',
    'Governor 的创建、删除、晋升、降级仅限用户；删除含 Governor 的 Team 同样需要用户。所有克隆默认 Employee，不继承特权。',
    'Manager / Governor 必须是 Core 本机运行、Core 本机工作区的员工。它们可加入 Cloud Team，仍通过相同 API 管理本 Team / 跨 Team 的远端 Employee。',
    '执行位置 kind、工作环境 workEnvironment、公司职位 managementRole 和引擎 permissionMode 相互独立。Employee 的普通 cd / 文件操作不会因职位被锁定在 cwd；文件 API 使用各自明确的工作区范围。',
    '消息、队列、调度与订阅保留真实发起者；权限撤销后重新检查。接收任务不会继承 Manager 或 Governor 身份。',
    '来源连线仅用于展示，API 不依赖连线授权；Manager 能管理本 Team 用户创建的 Employee。',
    'Trusted 表示用户信任运行环境，不承诺对同一系统账号的任意宿主文件访问构成防篡改沙箱。知道命令名称不等于拥有 API 权限。'
  ].join('\n\n')+'\n'
}

/** All lifecycle entrances share these boundaries, before side effects or global shortcuts. */
function assertRoleBoundaries(command:string,args:Record<string,any>,targetId:string|undefined,caller:StoredSession){
  const store=readStore(),policy=rolePolicy(caller.managementRole),target=store.sessions.find(card=>card.id===targetId)
  const deny=()=>{throw Error('Forbidden: Governor 的创建、删除与职位变更仅允许用户操作')}
  if(command==='card.create'||command==='session.new'){
    const role=args.managementRole??'employee'
    if(!isManagementRole(role))throw Error('Invalid management role')
    if(rolePolicy(role).userManaged)deny()
    if(!policy.creates.includes(role))throw Error('Forbidden: cannot create this employee role')
  }
  if(command==='card.remove'&&target&&!canDeleteEmployee({kind:'agent',employeeId:caller.id},target.id))deny()
  if(command==='group.remove'&&store.sessions.some(card=>card.group===args.name&&!canDeleteEmployee({kind:'agent',employeeId:caller.id},card.id)))deny()
  if(command==='card.management-role'){
    if(!isManagementRole(args.role))throw Error('Invalid management role')
    if(rolePolicy(args.role).userManaged||target&&rolePolicy(target.managementRole).userManaged)deny()
    if(!policy.assigns.includes(args.role)||!target||!canControl({kind:'agent',employeeId:caller.id},target.id))throw Error('Forbidden: cannot assign this employee role')
  }
}
