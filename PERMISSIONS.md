# Agents Company 权限说明

管理权限属于员工的 `managementRole`，与 Team 名称、工作目录、目录标记和视图无关。CLI 与 UI 进入相同的 Core 授权入口。完整命令见 [API.md](API.md)。`management.topology.teams` 从同一授权入口返回逐 Team 的 allowedActions、deleteBlockedReason、governorIds 和 isOwnTeam，避免把少数受保护 Team 误判为全部不可删除。

## 四种职位

Secretary 是最高的 **Agent 应用管理职位**，负责帮助用户操作 Agents Company 及插件。它不冒充用户，不改变原生引擎执行权限或操作系统身份；具体业务工作应委派给合适员工。

| 能力 | Employee | Manager | Governor | Secretary | 用户 |
| --- | --- | --- | --- | --- | --- |
| 读取全部公开 Core/插件文档 | 允许 | 允许 | 允许 | 允许 | 允许 |
| 管理员工 | 自身 | 本 Team 的 Employee | 跨 Team 的 Employee/Manager/Governor 会话 | 全局，包括 Governor；可管理应用及插件 | 全部 |
| 创建、删除 Employee | 不允许 | 本 Team | 全局 | 全局 | 全部 |
| 创建、删除 Manager | 不允许 | 不允许 | 全局 | 全局 | 全部 |
| 创建、删除或变更 Governor 职位 | 不允许 | 不允许 | 不允许 | 允许 | 允许 |
| 创建、删除或变更 Secretary 职位 | 不允许 | 不允许 | 不允许 | 不允许 | 仅用户 |
| 管理群组/成员/禁言、频道/订阅/作者/管理员、个人会话分类 | 不允许 | 不允许 | 不允许 | 允许 | 允许 |
| 发布群聊或频道回复 | 实际成员/管理员范围 | 同左 | 同左 | 同左，仍以自己的 Agent 身份发布 | 允许 |
| 本人已读确认、用户消息编辑、跨会话转发、身份凭据及客户端上传下载 | 不允许 | 不允许 | 不允许 | 不允许 | 仅用户 |

Governor 仍不能创建、删除、升降级自己或其他 Governor，不能管理 Secretary。任何 Agent 都不能任免 Secretary，包括自己。批量删除 Team/员工、角色变更和克隆入口均在副作用前检查；克隆始终为 Employee，不复制管理授权。

职位定义集中于 `src/shared/roles.ts`，包含控制/创建/删除/赋予的目标角色、执行位置与 `appAdministrator`。`userManaged` 仅标记只能由用户任免的最高职位 Secretary；Governor 的生命周期由各角色的目标列表保护。更名、Team、工作目录和视图都不会授予职位。旧名为 Secretary 的员工不会自动升级。

Secretary 可出现在 Company、Messages、Plan 或普通插件 Team 中；视图只过滤展示。它使用 Core 主机的本地引擎和本地工作区，Cloud Team 可选择 `workEnvironment:local`。它没有 Governor 的任务视图绑定。原有 Manager/Governor 能力保留，包括既有全局插件/设置权限。

秘书使用普通认证 Core/CLI 操作管理软件，例如 `chat.create/update`、`channel.source-add/update/remove`、`channel.update --admins`、`messenger.folder-save`、`engine.configure` 和 `plugin.call`。管理读取不要求先加入群/频道；实际公开发言和静默确认仍要求真实成员或管理员身份。秘书作为频道管理员可用 `channel.message-send` 发起管理请求，作者仍是该秘书；只有 Core 在此入口设置的 `requestId=id` 管理根能作为后续讨论根，普通投稿不能伪造。

用户身份相关入口保持独立：`auth.agent-token/revoke`、`session/chat/channel.acknowledge`、`chat.edit`、`messenger.forward/forward-draft/forward-status/reference`、播放器及上传下载客户端许可、`ui.click/type/drag/wheel` 仍仅用户。秘书通过 Core API 操作软件，不以 UI 模拟或令牌冒充用户；原生引擎的 Ask/Full access 设置仍单独生效。已有 API 的 revision、显式确认和作用域检查继续执行。

私聊 `session.send/enqueue` 的可选 `clientMessageId` 按真实调用者与员工区分。同一请求的重试确认仍检查当前权限、员工身份及初始化状态，不会重新打开引擎；其他调用者不能用相同编号读取或冒用该确认。发送确认不等于员工已读，不改变本人阅读回执。转发草稿及状态查询也不能派发工作；放弃转发草稿不取消已发送的消息或任务。

频道个人阅读状态通过 `channel.read-state {id,entryIds}` 向用户和 Secretary 只读开放，普通频道管理员不能读取这部分用户信息。`channel.acknowledge {id,entryIds}` 以及用户显式选择的 `{id,all:true}` 仅用户可执行，Secretary 也不能替用户标记已读。频道新新闻与 Agent 回复的未读计数，不等于管理员对群发消息的已读回执；两套状态互不修改。升级前记录保持未知基线，不伪造历史已读时间；查询历史、修改收藏和调整作者归属都不能代替用户阅读。

## 使用方法

```sh
# 用户创建最高应用管理秘书；无需特殊 Team 或目录。
agents card create --title Secretary --group "Any Team" --management-role secretary --kind worker --json
# 用户或 Secretary 可创建 Governor。
agents card create --title Governor --group "Any Team" --management-role governor --kind worker --model gpt-6-luna --effort low --json
# 用户也可以改变已有员工的职位。
agents card management-role EMPLOYEE_ID governor --json
agents auth whoami --json
agents management roles --json
agents management topology --json
agents api docs
```

Manager / Governor / Secretary 都必须是在 Core 所在主机运行、使用该主机本地工作区的 Local Worker。Core 可以运行于 macOS、Windows 或 Linux；浏览器所在电脑不会自动成为执行主机。它们可以加入 Cloud Team：创建时传 `--work-environment local`，仍通过同一组 `session.*`、`schedule.*`、`card.*` 管理云端 Employee。Cloud Native Worker 和本地引擎的云端工作环境只允许 Employee。运行位置 `kind`、工作环境 `workEnvironment`、职位 `managementRole`、引擎 `permissionMode` 是独立概念。

新员工默认使用 Ask，Full access 需要用户明确选择。升级保留原有执行权限，不把已有受限配置自动提升。公司职位与引擎执行权限分别校验；`workspace.*` 和 Work 插件仍使用各自明确的文件范围。云端命令失败不会回退到 Core 本机。

## 旧授权迁移

首次升级将 `access.version` 从 1 更新为 2。已有显式全局授权，以及旧 `access.managerTeam` 中已获得全局权限的本地员工，会逐一成为 Governor。原员工 ID、工作目录、原生会话引用、历史和已有全局委派授权标识保留；升级不额外调用模型初始化。

随后清除旧 Team 授权来源。新加入旧管理 Team 的员工默认仍是 Employee；复制目录标记不会获得权限。迁移后的 `globalManagerIds` / `managerTeam` 不再是授权来源。`auth.whoami.globalManager` 是角色计算出来的兼容投影，`globalByTeam` 固定为 false，`managerTeam` 固定为 null。

旧 `management.team` 只保留只读发现，设置或清除 Team 授权会返回已停用错误。用户调用 `management.global ID on` 兼容为授予 Governor；`off` 将 Governor 降为 Manager。推荐统一使用 `card.management-role`。

## 连线、委派和调度

`createdBy` 只能由后台写入，始终表示真实创建历史。符合现有职位范围的管理者创建下属后默认有常驻来源线；用户创建的员工也可显式绑定逻辑来源。未绑定或已解绑的员工仍受上述范围内的 Manager / Governor 管理。来源线和显式绑定均不授予权限。`management topology` 返回 createdBy、createdByMe、createdAt 和 allowedActions，并支持 `--creator self|others|operator|unknown|EMPLOYEE_ID`；历史来源缺失时为 null，查询筛选不扩大本来的职位范围。

`management.bind {manager?,employee}` 新增普通常驻有向箭头；`management.unbind {manager?,employee}` 或 `{id}` 只取消指定的一条，包括默认创建来源线。多个 Manager/Governor 可以指向同一员工，同对端点重复操作幂等，解绑后保存及重启不重生。`createdBy`、职位、操作权限、已有任务、队列、调度、凭据及员工位置均不改变。

Agent 省略 manager 时指向自己作为来源；用户须明确指定。Manager 只能增删自己发出的关系，绑定目标限本 Team Employee；Governor/用户可指定其他合规的管理者来源，但不能借绑定扩大该来源的控制范围。普通 Employee 不可调用。取消自己的既有关系允许清理目标职级变化后已不再可控的旧线；这不会恢复已失去的控制权限。

真实消息/控制请求、回复订阅建立或委派任务开始时，来源/绑定线短暂变绿，单次最多 600 毫秒；没有常驻关系时显示同样时限的临时绿色虚线。到期仅结束显示提示，不影响实际任务、订阅和原有权限。`management.activity` 用 kind=request/task 区分正在通信与正在协作的任务，任务线有 messageId，结束即清除。查询、发送、订阅、排队、停止和调度都使用稳定员工 ID，不依赖原生引擎的多 Agent 功能。

消息、队列、调度、订阅保存原始发起者；接收者仍使用自己的身份。接受请求、准备执行及异步准备后均复核权限。Governor 降级或凭据撤销后，旧的跨 Team 委派失效；重新授予权限不会恢复旧任务。其他用户或管理者的独立任务不受影响。

## 初始化、手册与运行隔离

所有新建 Employee / Manager / Governor / Secretary 都在自己的原生会话完成同一简短隐藏初始化：只读本人真实身份和共享 API 索引，然后简短确认。就绪只依据本人身份和索引工具均成功返回且引擎正常结束；文本写出 OK 不能替代真实读取，多一句隐藏说明也不构成失败。初始化期间显示黄灯，未就绪前不接受正式请求；失败可重试。初始化轮不进入本项目可见历史或已读回执，但保留在原生引擎上下文中；不预加载完整手册、不执行其中示例。

初始化员工仅能调用必要的只读身份与文档入口，不执行写操作或请求工具提权。完整 Core 三视图与所有已安装插件 API/schema 统一投影到 `APP_HOME/api-docs`，原生只读文档工具及 `api.docs {document?}` 按文档 ID 读取；远端、隔离环境无需复制手册或放宽文件权限。Company、Messages、Plan 是 Core 视图，Plan 的 `plan.*` / `schedule.*` 不等于 MiniNotion 插件 API。

所有角色都可读完整公开文档；`api.list/describe --all` 只扩展文档发现，缺省仍过滤当前身份可调用的命令。插件先读 `plugin/<id>/index` 的方法摘要，再按需读 `plugin/<id>/command/<method>` 单条真实 schema，无须为一个操作加载整册。知道命令不等于能执行：Employee / Manager / Governor 的现有控制与写入权限、群/频道成员检查和插件工作区边界不变。统一路由要求遵循身份中的 roleDescription；正式请求只附一段当前认证职位，Secretary 还附简短的应用管理/委派职责，升降级后立即刷新。公开文档不按角色复制到工作区。

Trusted 保留系统账号的实际文件权限；API 授权不等于对同用户无限制进程的操作系统级防篡改沙箱。Isolated 使用现有外层系统隔离，不支持时拒绝启动。Governor/Secretary 的分级生命周期保护在所有公司管理 API 入口强制执行。

## 布局和已读状态

`office.layout` 返回实际几何、正交连线与 editable；`room.bounds`、`room.place`、`card.place`、`management.relayout` 共用作用范围检查。视图只过滤显示，不改变权限、目录或任务。手动拖动一个 Team 不移动其他 Team；角色和创建来源变化通过现有布局服务处理。

`session.acknowledge` 只允许用户确认确切的 replyId。任何 Agent 的读取或订阅都不会清除用户未读状态；隐藏窗口也不代用户确认。初始化不产生未读消息。Web 端使用认证用户会话及页面可见性检查；桌面端额外验证原生窗口状态。

`host.list` 与 Cloud Hosts 插件共用主机登记表，支持 os / distribution 筛选，不发起 SSH。普通 Employee 可读取简短主机信息。Manager 可读取自己 Cloud Team 绑定主机的完整连接记录，Governor 可读取全部主机。`host.credentials ID` 返回明文密码，以及登记的 identityFile、knownHosts、sshConfig 文件路径与完整内容（包括私钥）；`host.list --credentials` 可一并返回有权读取的主机凭据。Manager 对其他主机只能看到简短信息；Employee 不可读取凭据。读取凭据不授予 host.check/exec/create/update/remove 的管理权限。

## 人物形象

所有职位都可用 `avatar.list` 查询完整可选目录，包括初始化期间。`character`/`avatarStyle` 或 `avatar` 仅选择视觉形象；`profession`（旧字段 `role`）仅描述职业；职级仍由 `managementRole` 控制。Manager 可用 `card.avatar` 修改自己及本 Team Employee，Governor 可在其控制范围内跨 Team 修改；该接口不修改名字、引擎、权限、职位、目录或历史。

## Messages 视图

Messages 与原会话复用相同权限、历史和员工身份。`session.inbox` 只读返回有权读取的员工及最新公开消息摘要；Employee 仅本人，Manager 本人及本 Team Employee，Governor/用户遵循现有可读范围。列表不返回推理或工具输入输出，不发起模型调用，不替用户确认已读。选择员工后的发送、排队、停止、附件和审批仍走已有 Core API，绑定关系和真实权限不变。

未指定 `replyConversation` 时，`session.send/enqueue` 的 `replyTo` 只能指向同一员工会话中的公开消息。Core 在原有权限校验后解析引用，不信任客户端提供的引用正文或作者；只有工具／思考内容的条目和其他会话的 ID 均不可引用。排队执行时重新校验引用与原发起者权限。引用不会授予原消息作者的权限，不跨员工读取文件，不清除已读状态，也不改写已执行的历史。新消息的发送者来自认证委派，时间来自 Core 实际记录；旧记录缺失的信息保留为未知。

精确选段通过 `replyQuote: {text, offset}` 提交，必须同时指定 `replyTo`。Core 使用与界面一致的公开 Markdown/GFM 文本投影核对内容和位置，不接受伪造、过期、越界或切断 Unicode 代理对的选段。群聊选段沿用原有成员检查；实际发送按 work/awareness 契约共享引用上下文，用户回复可将仍在群内的原 Agent 作者纳入工作对象。仅生成选段或预览引用不启动投递。选段、跳转与高亮不会提升权限，也不会代替真正的已读确认。

用户可显式提供 `replyConversation`，把另一个私聊或群聊的公开消息片段带入当前回复。跨会话分享及 `messenger.reference` 预览只允许用户，Governor 也不能借此跨读或转发。Core 解析来源和作者并保存接受时的引用快照，客户端不能提供内部 `crossReply`。已接受的排队快照不会因个人隐藏状态而改写；派发仍检查原发送者和目标权限。群成员只能读到用户明确分享到群里的片段，不能据引用访问原私聊、凭据或文件。图片不会静默复制；整条含图消息须显式选择文字引用，或通过已有转发流程分享图片。来源跳转与返回只是用户端导航，不修改原消息或真实已读记录。

## 群聊与共享视图

`view.list` 返回共用视图定义与数据 API；`view.select company|messages` 仅切换展示，Company 缺省为 All Team。员工、原生会话、权限、绑定及私聊的 exact-reply 已读记录只有一份；在 Messages 阅读后，Company 使用同一 readAt，不再重复标红。

群组创建、编辑成员、删除和禁言允许用户或 Secretary；用户已读确认仍仅用户。成员可以包含多个 Team 的员工，加入群组不会改变 Team、职位、目录或控制权限。`chat.list/get/history/context/post` 对所有职位开放，但 Core 每次只允许读取或发布自己所属群组；Governor 同样不能读取未加入的群聊。返回的成员信息只含身份，不包括他人的私聊内容或文件。

`chat.edit {id,messageId,text,expectedRevision}` 仅用户可用，且只能修改作者为用户的群聊正文或附件说明。Employee、Manager 和 Governor 都不能调用；默认 API 发现不列出它，`--all` 可读说明但不授予权限。每次实际修改增加 `editRevision` 并记录 `editedAt`；旧消息的初始修订号为 0，同文重试幂等，冲突修订拒绝。该操作不修改作者、序号、原始时间、附件、mentions、投递状态、引用快照、原始发送去重键或已读游标，不创建新的任务、回执或编辑历史内容库。已接受的路由及排队任务仍使用原始提示和已验证的引用；新增引用继续核对当前正文。最新预览可更新，但会话排序时间不变。

每条公开 `chat.send` 和非空 `chat.post` 都向发送时的当前员工成员投递；Agent 作者不再接收自己的发文，避免自回声。`deliveries` 保存固定接收者及 mode，新增成员不会被补进已接受消息的重试。mode 为 work 或 awareness，旧记录缺失时按 work 兼容；旧的无 delivery 公告不会被追补执行。

用户 `chat.send` 的工作对象是显式 mentions 与有效同群 replyTo 原 Agent 作者的并集；两者皆空时仍向全员分配工作。员工 `chat.send` 只有显式 mentions 可以分配正式工作，并继续逐目标检查原有控制权限；其余成员接收 awareness。员工无 mentions 发送、以及任何非空 `chat.post`，均只把上下文送达其他成员。replyTo 的真实原作者、正文和主要对话对象由 Core 传入提示，不根据显示名猜人，不从跨会话或外部新闻引用自动扩展对象，也不加入已离群作者。

awareness 是绑定真实发起身份、当前群、消息及固定接收者的窄范围投递，不是普通 session.send 授权。它复用原生会话和原队列，重新检查凭据与成员资格；不会增加管理控制、读取他人私聊或切换执行主机。普通 Employee 可以向同群 Governor 发布共享上下文，但仍不能直接控制其会话或获得 Governor 权限。接收者仍使用自己的身份与原权限。

所有接收员工都可以通过自身认证的 `chat.post {id,replyTo,text:null}`（SDK None、CLI --silent）静默确认，包括被明确 @ 或回复的员工。任何 Agent 都不必公开回复。只有固定投递列表中的本人可以确认；静默确认不创建消息气泡、序号、预览、用户未读或新投递，重复保留首次时间。非空公开回复也可确认它所回复的本人请求，同时作为一条新消息送达其他成员。读取 history/context 本身不伪造确认。

投递的 `deliveredAt` 只来自真实接收证据，进入本地队列本身不算原生接收；`readAt` 只由认证员工的上述确认产生，`ackMessageId` 可链接首次公开确认。确认已读也可补全此前缺失的送达时间。这些接收员工回执与用户阅读私聊的 `lastReply.readAt` 完全分离，不能替用户清除未读。

`chat.mute {id,member:"all"|EMPLOYEE_ID,muted,durationSeconds?}` 允许用户或 Secretary 调用；默认 API 发现对用户和 Secretary 列出。可永久、限时、单独或全员禁言；全员规则也覆盖后来加入的员工，与单独规则叠加。Core 每次发布时按实际时间检查到期，不依赖后台计时器。禁言只拒绝员工的新公开发布，不阻止阅读、接收工作或静默确认，也不影响用户发送。它不改变成员、控制权限或任务执行，不能由员工、Manager 或 Governor 绕过。

未确认的投递先在同一原生会话运行内部阅读确认轮次。模型须明确调用 `agents_company_discussion_post({conversationType:"group"|"channel",conversationId,messageId,text:string|null})`，由绑定本次员工身份和群消息/频道条目的工具调用原有认证发布 API；工具必须显式提交 conversationType、conversationId、messageId 和 text，前三者逐项匹配本次冻结来源；即使同时属于两个房间，填错目标也拒绝且不产生任何回执。工具只在该阅读阶段有效，不是新公开 CLI。正式回复仍通过 chat.post 或 channel.message-post 明确指定目标 id 及该目标中的 replyTo。通常使用 text:null；非空值就是明确要给参与者看的实际答复或简短确认，不能是内部推理或决定如何回答的计划。普通文字、JSON、思考和最终输出绝不代发或标记已读；未通过工具或显式认证 API 确认就失败，不释放正式工作。原生工具成功结果明确 nextAction=end_turn；模型应以 OK 结束当前轮，由 Core 另发正式响应。确认上下文只保留真实来源/回复/原文，历史读取和公开回复指引只出现在正式阶段。work 在确认后才派发正式响应；awareness 完成确认后直接结束，不写入公开的私聊 user/assistant 工作记录，不改变用户旧私聊已读或无关当前任务。期间可使用原队列，不能通过 Steer 向隐藏确认轮追加工作。

阅读阶段工具明确发布的公开回复由 Core 标记只读 acknowledgmentOf；该标记不能由 API 提交。后续接收者使用 awareness + silent-only，模型读完后须明确提交 text:null，阻断自动回执互相唤醒。禁言或 silent-only 时提交可见文字会被拒绝，不能将拒绝或普通模型输出自动变成已读。确认已记录后，正式响应阶段不再次确认。正常主动公开讨论仍会送达其他成员。

Codex 在受限阅读和普通工作间通过原生 idle actor unsubscribe 后 resume 同一 threadId 切换，保留历史、主机、模型与身份，不重启引擎进程。切换前若原生后台终端仍活动，就明确拒绝本次阅读，不停止终端、不标记已读；待其自然结束或用户明确停止后再重试。成功接收 awareness 后也可能暂留受限确认环境，下一条普通工作恢复原环境；之前的 /review、/compact 明确拒绝。

员工通过 `chat.context` 获取具体请求和发布规则，再用 `chat.post` 明确发布面向参与者的实际答复，kind 仍为 summary/decision/blocker/question/result。日常聊天、故事、提问与工作任务都是有效用户请求；work/awareness 只是投递分工，静默已读不等于忽略被交付的请求。作者取自认证身份，不接受伪造；员工单条上限 2000 字符。内部推理、工作详情、工具日志和私聊回复不自动镜像入群。API 不自动判断所有敏感信息，发布者仍应遵守返回的共享策略。

群组已读和私聊已读各自对应真正展示过的内容：阅读群组摘要不能清除尚未阅读的完整私聊。两种已读操作都只允许用户，窗口隐藏、被遮挡、后台读取或 Agent 查询都不代用户确认。删除群组仅移除群组记录，保留可恢复群聊文件与全部员工、工作区、原生历史和独立调度。

## Plan 与自主排期

所有 Employee / Manager / Governor / Secretary 都可通过 schedule.create 为自己排期，self 只能解析成认证员工自己的稳定 ID。其他目标继续使用原有 Manager / Governor 控制范围；群组、视图、标签和备注不扩权。自我排期使用后台专用的自目标委派，不开放普通 Employee 的他人会话发送权限。非全局调用者只能查看或修改自己创建的排期，执行与异步准备后复核凭据和目标权限。

Plan 的十种数据库视图（Table / Board / Timeline / Calendar / Planner / List / Gallery / Chart / Feed / Form）共享 schedules.json；status、nextAt、occurrences 由 Core 计算，不能伪造。保存的数据库视图按创建身份限定编辑范围，用户可管理全部；删除视图保留排期。定时器不会关闭或打断已有人工任务，也不会唤醒休眠主机。完整 API 见 PLAN.md 与 schedule.schema。

`plan.timeline/analytics/feed` 只投影现有调度权限允许的记录，不绕过角色范围。durationMinutes 仅为预计时长，不授予并发执行或超时豁免。Form 和时间线改期使用 schedule.create/update；Feed 读取不清除私聊未读。历史聚合中的 Team/priority 来自当前仍存在的关联对象；缺失信息明确标为未知。

## 用户的 Messages 整理状态

`messenger.state/conversation/message/draft/search` 仅用户可用；Employee、Manager 和 Governor 均不能读取或修改用户草稿、收藏、表情标记或会话整理。数据独立保存在 `messenger.json`。置顶、归档、个人未读提醒、隐藏和搜索不改变成员身份、管理权限、任务执行、原生上下文或真实已读回执。群聊权限仍由既有成员和调用者身份检查；`chat.history --around` 不扩大读取范围。

Message attachment uploads, file forwarding and Core-host download/save are user-only
operations. Group membership grants `chat.file` reads of explicitly published group
attachment paths, never unpublished upload staging, another group's files, or a private
employee workspace. Agents cannot publish arbitrary group file paths. Mention delivery
copies group attachments into each explicitly selected employee's own workspace and
rechecks the existing delegation and membership before enqueueing. A file upload, preview, search or download does not start inference. Public group
posts notify recipients through the bounded awareness lifecycle; they do not assign
formal work. Silent acknowledgments create no further delivery.

`messenger.gallery` 仅用户可用，沿用可见员工和群聊的公开历史读取范围。返回分页图片引用，不读取图片字节、不运行任务、不标记已读，也不包含推理或工具私有内容。游标只定位已存在的消息与图片，不授予访问其他会话或工作区的权限。后续图片读取仍分别经过原有 workspace.image / chat.file 授权。

音视频预览的 media-open/info/read/close 仅用户可用，许可绑定创建它的客户端；Web Cookie 播放还绑定登录会话。每次读取重新校验原工作区与文件版本，不会随配置变化切换到另一个主机或文件。代理不能获得媒体许可；现有 chat.file 的群成员公开附件读取规则不变。播放不触发推理、消息或已读确认。退出登录撤销活动流，播放器释放许可后不再提供字节。


## 自建混合会话分类

`messenger.folder-save/delete` 允许用户或 Secretary 调用，默认 API 发现对二者列出；与其他个人整理操作共用 `messenger.json`。分类只保存已验证的私聊、群聊、频道引用；同一会话可以加入多个分类。每个分类有独立 revision，同名及相同成员重试保持幂等；并发修改同一分类时显式 expectedRevision 冲突拒绝。无关草稿写入不会造成分类冲突。删除分类保留全部会话、消息、草稿、置顶、收藏和归档；固定 All 没有可编辑或删除的分类记录。

频道会话可使用相同的个人置顶、收藏夹、归档和未读提醒；这些仍只影响用户整理状态。新闻文章收藏始终属于频道 Core 中的稳定 postId，不复制到随作者路由变化的 messenger key。`messenger.search` 以同一用户权限合并仍保留的新闻，外部作者不冒充 operator 或 agent。新闻可作为用户明确选择的引用或转发来源；目标仍为已有私聊或群聊，图片复制继续使用原有认证文件传输。频道讨论支持文字、mentions 和 replyTo 草稿及受限管理员发言；尚不接受讨论附件上传。

`view.open messages --channel` 与返回导航仅选择展示对象，不能签发采集凭据、调用模型或确认其他会话已读。新闻图片读取和下载仍检查文章在当前频道的真实归属；收藏后移动来源不会授予对旧频道路径的继续读取权限。

## 独立新闻频道与采集凭据

同一员工可以同时属于多个群组、担任多个频道的管理员，各项成员关系独立；从一处移除不影响其他成员关系或公司职位。`chat.list` 只返回自己加入的群组。`channel.list/get` 现在允许已初始化员工读取自己仍担任管理员的频道身份（ID、名称、类型、管理员和修订信息），不返回用户收藏计数或订阅配置；Employee、Manager、Governor 均不能凭公司职位读取未加入的频道。用户原有完整频道列表保持不变。

频道管理员是独立于公司职位的身份，由用户或 Secretary 通过 channel.update 的 adminIds 指定任意现有员工；不会改变 Employee/Manager/Governor 角色、引擎、宿主、工作区或公司管理权限。频道没有隐藏群、独立模型或第二套任务队列。管理订阅、管理员、收藏、删除、图片与导出允许用户或 Secretary；channel.context、channel.history、channel.message-post 还允许当前频道管理员，且每次由 Core 验证成员身份。界面读新闻不调用模型、不清除私聊或群聊已读。配置管理员后，新的外部新闻会在这些员工原有队列中进行真实静默阅读确认。

外部采集服务使用独立的 source-scoped capability，不获得 operator 身份或控制令牌，也不扩展既有 `PrincipalRef`。其专用认证入口只允许 `channel.collector-config`、`channel.media-put`、`channel.publish` 和 source 范围的 `channel.source-avatar-put`，每次核对令牌有效性与来源范围；不能修改订阅、路由、用户收藏、Core 设置或调用其他 API。用户签发时只返回一次明文，SQLite 仅存哈希，撤销立即生效。采集服务自己的 cookies、TG session 和其他平台凭据留在其原主机。

采集监听默认关闭；启用后仅绑定 `127.0.0.1` 的指定端口。跨主机通过 HTTPS 反向代理或 SSH 隧道连接，令牌只放认证头。Core 不根据提交的 URL 下载内容；图片必须显式上传，限制为单张 8 MiB 的 PNG/JPEG/GIF/WebP，属于指定来源和文章。读取与下载仅限当前频道中该文章已发布的图片，不能访问 staging、其他文章或任意本机路径。

Core 是订阅和作者路由的权威。取消订阅仅禁用来源；移动作者保留 sourceId、文章 ID 和收藏，所有仍保留内容随当前路由投影。未收藏新闻按原发布时间与首次接收时间的较早 48 小时截止点清理本地正文和图片，重试或更新不延长时限；收藏连同本地媒体永久保留。删除和过期有窗口内重投保护，旧发布时间在窗口外继续拒绝。清理仅涉及 Core 自己的频道目录，不更改远端采集服务的清理策略或内容。

用户或实际担任管理员的 Secretary 可用 channel.message-send 向发送时其他管理员投递；显式 mentions 与有效同频道回复的原 Agent 作者为工作对象，两者皆空时全员工作，其余只接收 awareness。管理员 channel.message-post 的公开回复必须关联其实际收到的用户讨论，不因单独的外部新闻通知主动发言；用户针对新闻的提问属于正常讨论，可关联该用户消息答复。其他管理员只静默知悉该回复，作者不自回声。阅读阶段使用同一受限发布工具，普通文字、JSON 和思考不会变成频道发言或已读。text:null/--silent 仅为本人固定投递记录确认，不产生公开气泡或继续扇出。任何频道身份都不授予控制其他员工的权力。

`channel.timeline {id,kind?,limit?,beforeEntry?,cursor?}` 对当前频道管理员开放；Secretary/用户仍可管理读取所有频道。它提供新闻与讨论的统一历史：默认最近20条，每页可自主选择1–100条，游标继续取更早内容，超过100条无需一次加载全部。按新闻发布时间/讨论创建时间及稳定ID排序；beforeEntry严格限定当前时间线中位于提问之前的内容，并不是过去时刻的快照。新闻正文完整、带真实作者/平台/时间和媒体描述，不返回用户saved/savedAt偏好。每页重新核对成员、当前来源归属、48小时保留/收藏及删除状态。读取不触发模型、已读或发言，不绕过频道发布限制。旧channel.history及context.recentMessages仅含讨论，不能据此判断新闻为空。

新新闻仅在首次创建时冻结管理员 recipients，强制 awareness + silent-only。重投、更新、收藏、删除和后来加入的管理员不会触发补发。队列只存 news ID 引用，派发时从仍有效的唯一新闻记录取得全文、原发布时间、真实外部作者/平台/URL和媒体描述；过期、删除、来源移动或撤销管理员时拒绝后续阅读，不从永久副本复活。本轮仅自动送正文和完整来源元数据/图片描述，不将图片字节自动送入原生视觉输入，也不宣称视觉理解；原图仍可在频道查看和下载。投递借用原 ACK/原生 FIFO；新闻作者始终为外部来源，用户仅是管理员订阅授权的来源，不冒充新闻作者。原生引擎实际读过的内容可能保留在其原生历史，Core 的48小时清理不改写这些执行记录。

公开频道讨论 cm_ 保留真实作者、序号和时间，支持个人 saved/pinned/hidden/reaction，以及消息引用、转发和文字/mentions/replyTo草稿；操作不改写原消息。新闻 np_ 仍只有稳定postId收藏并服从48小时策略。来源头像独立存储在 source_avatars，每source一张，采用相同8MiB和真实格式校验；文章清理不删除来源身份图片。采集凭据可上传被授权来源头像，但不能读消息、任命管理员或获得operator身份。

## 每个主视图的外观

`settings.set` 沿用既有全局管理能力，Secretary 也可代用户配置。`viewAppearance.company/messages/plan` 分别保存配色与自定义颜色，局部修改在 Core 合并，不会覆盖未提供的其他视图；非法视图、字段或颜色整次拒绝。旧 `theme/themeColor` 仅映射 Messages。界面语言、模型默认值和页面大小继续共用，外观不改变员工、原生会话、工作区、计划权限、画布几何或群消息/新闻数据。设置导航与颜色预览不运行计划任务。
