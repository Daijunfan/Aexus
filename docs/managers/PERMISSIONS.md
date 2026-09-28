# Agents Company 权限说明

管理权限属于员工的 `managementRole`，与 Team 名称、工作目录、目录标记和视图无关。CLI 与 UI 进入相同的 Core 授权入口。完整命令见 [API.md](API.md)。`management.topology.teams` 从同一授权入口返回逐 Team 的 allowedActions、deleteBlockedReason、governorIds 和 isOwnTeam，避免把少数受保护 Team 误判为全部不可删除。

## 三种职位

| 能力 | Employee | Manager | Governor | 用户 |
| --- | --- | --- | --- | --- |
| 查询自己的身份和 API、使用自身工作区及已授权插件 | 允许 | 允许 | 允许 | 允许 |
| 只读查询 Cloud Hosts 插件登记的主机列表（host.list） | 允许 | 允许 | 允许 | 允许 |
| 读取主机密码、私钥与 SSH 配置内容 | 不允许 | 自己 Cloud Team 的主机 | 所有主机 | 所有主机 |
| 管理本 Team 的 Employee | 不允许 | 允许，包括其他创建者的员工 | 允许 | 允许 |
| 跨 Team 管理 Employee / Manager | 不允许 | 不允许 | 允许 | 允许 |
| 查看和控制其他 Governor 的会话与普通配置 | 不允许 | 不允许 | 允许 | 允许 |
| 调整 Team 位置、大小及员工位置 | 不允许 | 本 Team 外框、自己和全部 Employee | 所有 Team 和所有员工，包括 Governor | 所有 |
| 创建、删除 Employee | 不允许 | 本 Team | 所有 Team | 所有 |
| 创建、删除 Manager | 不允许 | 不允许 | 所有 Team | 所有 |
| 将 Employee / Manager 互相转换 | 不允许 | 不允许 | 允许 | 允许 |
| 创建、删除 Governor，授予或撤销 Governor 职位 | 不允许 | 不允许 | **不允许** | **仅用户** |
| 删除含 Governor 的 Team | 不允许 | 不允许 | **不允许** | **仅用户** |
| 员工凭据签发／撤销、模拟 UI、替用户确认已读 | 不允许 | 不允许 | 不允许 | 仅用户 |

Governor 不能通过降级后删除、克隆、整个 Team 删除、内部字段或转发调用绕过同级保护。克隆结果始终是 Employee，不复制职位、全局授权或凭据。所有删除入口在清理目录或原生会话前检查实际目标。

职位定义集中于 `src/shared/roles.ts`：包含显示名、说明、作用范围、允许的 API 类别、可控制／创建／删除／设置的目标职位以及 `userManaged` 生命周期标志。`agents management roles --json` 返回同一份定义；表单直接复用该定义。后续新增职位在这个边界内扩展，不使用 Team 名称或数字高低比较来隐式放权。

## 使用方法

```sh
# 用户创建普通文件夹中的 Governor；无需特殊 Team 或目录。
agents card create --title Governor --group "Any Team" --management-role governor --kind worker --model gpt-6-luna --effort low --json
# 用户也可以改变已有员工的职位。
agents card management-role EMPLOYEE_ID governor --json
agents auth whoami --json
agents management roles --json
agents management topology --json
agents api docs
```

Manager / Governor 都必须是在 Core 所在主机运行、使用该主机本地工作区的 Local Worker。Core 可以运行于 macOS、Windows 或 Linux；浏览器所在电脑不会自动成为执行主机。它们可以加入 Cloud Team：创建时传 `--work-environment local`，仍通过同一组 `session.*`、`schedule.*`、`card.*` 管理云端 Employee。Cloud Native Worker 和本地引擎的云端工作环境只允许 Employee。运行位置 `kind`、工作环境 `workEnvironment`、职位 `managementRole`、引擎 `permissionMode` 是独立概念。

新员工默认使用 Ask，Full access 需要用户明确选择。升级保留原有执行权限，不把已有受限配置自动提升。公司职位与引擎执行权限分别校验；`workspace.*` 和 Work 插件仍使用各自明确的文件范围。云端命令失败不会回退到 Core 本机。

## 旧授权迁移

首次升级将 `access.version` 从 1 更新为 2。已有显式全局授权，以及旧 `access.managerTeam` 中已获得全局权限的本地员工，会逐一成为 Governor。原员工 ID、工作目录、原生会话引用、历史和已有全局委派授权标识保留；升级不额外调用模型初始化。

随后清除旧 Team 授权来源。新加入旧管理 Team 的员工默认仍是 Employee；复制目录标记不会获得权限。迁移后的 `globalManagerIds` / `managerTeam` 不再是授权来源。`auth.whoami.globalManager` 是角色计算出来的兼容投影，`globalByTeam` 固定为 false，`managerTeam` 固定为 null。

旧 `management.team` 只保留只读发现，设置或清除 Team 授权会返回已停用错误。用户调用 `management.global ID on` 兼容为授予 Governor；`off` 将 Governor 降为 Manager。推荐统一使用 `card.management-role`。

## 连线、委派和调度

`createdBy` 只能由后台写入。同 Team 内，管理者创建了可创建的下属职位才有常驻来源线。用户创建的员工没有来源线，但仍受上述范围内的 Manager / Governor 管理。来源线不授予权限。`management topology` 返回 createdBy、createdByMe、createdAt 和 allowedActions，并支持 `--creator self|others|operator|unknown|EMPLOYEE_ID`；历史来源缺失时为 null，查询筛选不扩大本来的职位范围。

真实消息/控制请求、回复订阅或经过授权的委派任务执行期间，来源线变绿；没有来源线的对象出现临时绿色虚线。`management.activity` 用 kind=request/task 区分正在通信与正在协作的任务，任务线有 messageId，结束即清除。查询、发送、订阅、排队、停止和调度都使用稳定员工 ID，不依赖原生引擎的多 Agent 功能。

消息、队列、调度、订阅保存原始发起者；接收者仍使用自己的身份。接受请求、准备执行及异步准备后均复核权限。Governor 降级或凭据撤销后，旧的跨 Team 委派失效；重新授予权限不会恢复旧任务。其他用户或管理者的独立任务不受影响。

## 初始化、手册与运行隔离

Employee 创建后直接就绪，保持原生 Coding Agent 的纯净上下文，不执行隐藏模型轮。新建 Manager / Governor 才阅读 `.agents-company/employees/<employeeId>/` 内的角色手册。初始化期间显示黄灯，未就绪前不接受用户或 Manager 的工作任务；失败可重试。初始化轮不进入本项目可见历史，但保留在原生引擎上下文中。

初始化员工仅能调用必要的身份、职位定义、API 文档、拓扑及本人文档读取等只读接口。不会在隐藏初始化期间执行文档示例或请求工具提权。Work 插件手册保留在 `.agents-company/plugins/<pluginId>`。角色变化更新手册，文档不替代后台授权。

Trusted 保留系统账号的实际文件权限；API 授权不等于对同用户无限制进程的操作系统级防篡改沙箱。Isolated 使用现有外层系统隔离，不支持时拒绝启动。Governor 的生命周期保护在所有公司管理 API 入口强制执行。

## 布局和已读状态

`office.layout` 返回实际几何、正交连线与 editable；`room.bounds`、`room.place`、`card.place`、`management.relayout` 共用作用范围检查。视图只过滤显示，不改变权限、目录或任务。手动拖动一个 Team 不移动其他 Team；角色和创建来源变化通过现有布局服务处理。

`session.acknowledge` 只允许用户确认确切的 replyId。任何 Agent 的读取或订阅都不会清除用户未读状态；隐藏窗口也不代用户确认。初始化不产生未读消息。Web 端使用认证用户会话及页面可见性检查；桌面端额外验证原生窗口状态。

`host.list` 与 Cloud Hosts 插件共用主机登记表，支持 os / distribution 筛选，不发起 SSH。普通 Employee 可读取简短主机信息。Manager 可读取自己 Cloud Team 绑定主机的完整连接记录，Governor 可读取全部主机。`host.credentials ID` 返回明文密码，以及登记的 identityFile、knownHosts、sshConfig 文件路径与完整内容（包括私钥）；`host.list --credentials` 可一并返回有权读取的主机凭据。Manager 对其他主机只能看到简短信息；Employee 不可读取凭据。读取凭据不授予 host.check/exec/create/update/remove 的管理权限。

## 人物形象

所有职位都可用 `avatar.list` 查询完整可选目录，包括初始化期间。`character`/`avatarStyle` 或 `avatar` 仅选择视觉形象；`profession`（旧字段 `role`）仅描述职业；职级仍由 `managementRole` 控制。Manager 可用 `card.avatar` 修改自己及本 Team Employee，Governor 可在其控制范围内跨 Team 修改；该接口不修改名字、引擎、权限、职位、目录或历史。
