# Aexus 权限说明

管理权限属于员工的 `managementRole`，与 Team 名称、工作目录、目录标记和视图无关。CLI 与 UI 进入相同的 Core 授权入口。完整命令见 [API.md](API.md)。`management.topology.teams` 从同一授权入口返回逐 Team 的 allowedActions、deleteBlockedReason、governorIds 和 isOwnTeam，避免把少数受保护 Team 误判为全部不可删除。

## 四种职位

Secretary 是最高的 **Agent 应用管理职位**，负责帮助用户操作 Aexus 及插件。它不冒充用户，不改变原生引擎执行权限或操作系统身份；具体业务工作应委派给合适员工。

| 能力 | Employee | Manager | Governor | Secretary | 用户 |
| --- | --- | --- | --- | --- | --- |
| 读取全部公开 Core/插件文档 | 允许 | 允许 | 允许 | 允许 | 允许 |
| 管理员工 | 自身 | 本 Team 的 Employee | 跨 Team 的 Employee/Manager/Governor 会话 | 全局，包括 Governor；可管理应用及插件 | 全部 |
| 创建、删除 Employee | 不允许 | 本 Team | 全局 | 全局 | 全部 |
| 创建、删除 Manager | 不允许 | 不允许 | 全局 | 全局 | 全部 |
| 创建、删除或变更 Governor 职位 | 不允许 | 不允许 | 不允许 | 允许 | 允许 |
| 创建、删除或变更 Secretary 职位 | 不允许 | 不允许 | 不允许 | 不允许 | 仅用户 |
| 群成员、禁言、静音与会话通知 | 取决于群内 Owner/Admin | 同左 | 同左 | 同左，无 Company 豁免 | 管理与恢复入口 |
| 频道采集服务、订阅、个人会话分类 | 不允许 | 不允许 | 不允许 | 原应用管理范围 | 允许 |
| 发布群聊或频道回复 | 实际成员/管理员范围 | 同左 | 同左 | 同左，仍以自己的 Agent 身份发布 | 允许 |
| 本人已读确认、用户消息编辑、跨会话转发、身份凭据及客户端上传下载 | 不允许 | 不允许 | 不允许 | 不允许 | 仅用户 |

Governor 仍不能创建、删除、升降级自己或其他 Governor，不能管理 Secretary。任何 Agent 都不能任免 Secretary，包括自己。批量删除 Team/员工、角色变更和克隆入口均在副作用前检查；克隆始终为 Employee，不复制管理授权。

职位定义集中于 `Infra/src/shared/roles.ts`，包含控制/创建/删除/赋予的目标角色、执行位置与 `appAdministrator`。`userManaged` 仅标记只能由用户任免的最高职位 Secretary；Governor 的生命周期由各角色的目标列表保护。更名、Team、工作目录和视图都不会授予职位。旧名为 Secretary 的员工不会自动升级。

Secretary 可出现在 Company、Messages、Plan 或普通插件 Team 中；视图只过滤展示。它使用 Core 主机的本地引擎和本地工作区，Cloud Team 可选择 `workEnvironment:local`。它没有 Governor 的任务视图绑定。原有 Manager/Governor 能力保留，包括既有全局插件/设置权限。

秘书使用普通认证 Core/CLI 操作管理软件，例如 `channel.source-add/update/remove`、`messenger.folder-save`、`engine.configure` 和 `plugin.call`。会话内治理另行检查实际职位：chat.update/mute、conversation.role/mute/silence/notice-* 要求本会话 Owner/Admin，chat.delete 要求 Owner；Company Secretary 不获得豁免。应用目录与采集配置元数据仍可按原范围读取，群组正文和频道讨论需真实成员身份。秘书作为频道管理员可用 `channel.message-send` 发起管理请求，作者仍是该秘书；只有 Core 在此入口设置的 `requestId=id` 管理根能作为后续讨论根，普通投稿不能伪造。

个人消息头像通过 `messenger.profile` 上传、更换或重置；`messenger.profile-image` 读取当前图片。两者均仅用户可调用，Secretary 也不能更改或读取用户头像图片；头像不改变消息中的真实作者与权限。

用户身份相关入口保持独立：`auth.agent-token/revoke`、`session/chat/channel.acknowledge`、`chat.edit`、`messenger.forward/forward-draft/forward-status/reference`、播放器及上传下载客户端许可、`ui.click/type/drag/wheel` 仍仅用户。秘书通过 Core API 操作软件，不以 UI 模拟或令牌冒充用户；原生引擎的 Ask/Full access 设置仍单独生效。已有 API 的 revision、显式确认和作用域检查继续执行。

私聊 `session.send/enqueue` 的可选 `clientMessageId` 按真实调用者与员工区分。同一请求的重试确认仍检查当前权限、员工身份及初始化状态，不会重新打开引擎；其他调用者不能用相同编号读取或冒用该确认。发送确认不等于员工已读，不改变本人阅读回执。转发草稿及状态查询也不能派发工作；放弃转发草稿不取消已发送的消息或任务。

私聊 `session.send/enqueue/steer` 可携带 `sourceView`（company/messages/plan），由发送客户端声明，仅供理解当前消息。该字段与 Governor 的目标团队视图 viewId 独立，不改变真实作者、角色、委派范围、执行主机或群组成员资格。四种角色均收到来源提示；优先遵循正文，不能仅依据来源自动建群或群发。未提供的来源保持未知，不读取其他客户端的当前界面。排队和未变请求重试保留发送时快照；新回执绑定来源，改变来源的同键请求拒绝，旧回执仍可确认且不补造历史。追加消息单独记录来源，不覆盖原始任务来源。历史正文和引用不包含来源提示词。

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

Manager / Governor 可使用 Core 本地工作区、Core 引擎加 Tunnel 云端工作区，以及已支持引擎的 Cloud Native Worker。职位选择不会自动改变引擎位置或工作目录，启动恢复保留已授予的职位。Manager 仍仅管理本 Team，Governor 仍按全局角色范围管理；Plan 继续只允许本人或职级下行。Secretary 保留 Core 本地引擎与本地工作区要求。`kind`、`workEnvironment`、`managementRole` 和 `permissionMode` 分别校验；云端身份通过员工专属反向 CLI 通道认证，不能取得用户控制令牌。

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

群成员可读取本群消息、共享上下文并在未禁言时发布。群组 Owner/Admin 管理成员和禁言，Owner 解散群组，用户保留恢复入口；Company 职位不授予群内治理或他人私聊权限。

`chat.send`、`chat.post` 投递到发送时的全部当前成员，Agent 作者不接收自己的发文。用户消息的 mentions 与同群回复原作者确定工作对象；未指定对象时全员处理。员工只能向其控制权限内的显式 mentions 分配工作，其余成员接收上下文。`chat.post` 不分配正式工作。

全员在各自原生会话与 FIFO 中阅读。Core 校验凭据和成员资格后记录接收/已读；awareness 表示知悉，work 随后执行任务。公开发言使用明确的发布 API，普通会话输出保持私有。发言不改变员工控制权限或工作区范围。

用户的群聊、频道和私聊已读独立；Agent 不能代用户确认。用户仅可编辑本人发布的消息。删除群组保留可恢复历史、员工、工作区及独立调度。接口参数见 [API.md](API.md)。

## Plan 与自主排期

所有 Employee / Manager / Governor / Secretary 都可通过 schedule.create 为自己排期，self 只能解析成认证员工自己的稳定 ID。其他目标继续使用原有 Manager / Governor 控制范围；群组、视图、标签和备注不扩权。自我排期使用后台专用的自目标委派，不开放普通 Employee 的他人会话发送权限。非全局调用者只能查看或修改自己创建的排期，执行与异步准备后复核凭据和目标权限。

Plan 的十种数据库视图（Table / Board / Timeline / Calendar / Planner / List / Gallery / Chart / Feed / Form）共享 schedules.json；status、nextAt、occurrences 由 Core 计算，不能伪造。保存的数据库视图保留创建者身份，用户和 Secretary 可管理全部，其他员工仅能编辑自己创建的视图；删除视图保留排期。定时器不会关闭或打断已有人工任务，也不会唤醒休眠主机。完整 API 见 PLAN.md 与 schedule.schema。

`plan.timeline/analytics/feed` 只投影现有调度权限允许的记录，不绕过角色范围。durationMinutes 仅为预计时长，不授予并发执行或超时豁免。Form 和时间线改期使用 schedule.create/update；Feed 读取不清除私聊未读。历史聚合中的 Team/priority 来自当前仍存在的关联对象；缺失信息明确标为未知。

## 用户的 Messages 整理状态

`messenger.state/conversation/message/draft/search` 仅用户可用；Employee、Manager 和 Governor 均不能读取或修改用户草稿、收藏、表情标记或会话整理。数据独立保存在 `messenger.json`。置顶、归档、个人未读提醒、隐藏和搜索不改变成员身份、管理权限、任务执行、原生上下文或真实已读回执。群聊权限仍由既有成员和调用者身份检查；`chat.history --around` 不扩大读取范围。

Message attachment uploads, file forwarding and Core-host download/save are user-only
operations. Group membership grants `chat.file` reads of explicitly published group
attachment paths, never unpublished upload staging, another group's files, or a private
employee workspace. Agents cannot publish arbitrary group file paths. Group/channel attachment delivery sends one text-only file notice together with the
user's original text. It does not copy bytes or private-chat attachments automatically.
Members use conversation.file to read shared files and conversation.copy to explicitly
copy originals into their own named subfolder or their unchanged personal Workspace.
Current membership and delegation are rechecked before enqueueing. A file upload, preview, search or download does not start inference. Public group
posts notify recipients through the bounded awareness lifecycle; they do not assign
formal work. Silent acknowledgments create no further delivery.

`messenger.gallery` 仅用户可用，沿用可见员工和群聊的公开历史读取范围。返回分页图片引用，不读取图片字节、不运行任务、不标记已读，也不包含推理或工具私有内容。游标只定位已存在的消息与图片，不授予访问其他会话或工作区的权限。后续图片读取仍分别经过原有 workspace.image / chat.file 授权。

音视频预览的 media-open/info/read/close 仅用户可用，许可绑定创建它的客户端；Web Cookie 播放还绑定登录会话。每次读取重新校验原工作区与文件版本，不会随配置变化切换到另一个主机或文件。代理不能获得媒体许可；现有 chat.file 的群成员公开附件读取规则不变。播放不触发推理、消息或已读确认。退出登录撤销活动流，播放器释放许可后不再提供字节。


## 群组与频道共享工作区

`conversation.workspace/workspaces/file/copy/transfer` 使用真实群组/频道成员身份。成员可读取共享文件，并完整操作自己的一级姓名子目录。当前成员中的 Company Secretary 额外可以维护会话根目录直属普通文件；此例外不允许修改其他成员目录。群内 Owner/Admin 身份本身不赋予根文件写权限。个人 Company Workspace 继续独立可用。归档不改变权限，移除成员立即撤销 API 访问，但保留已有文件。`workspace.catalog` 只返回本人所有 Company/Message 工作区及权限，不规定任务必须存放的位置。

同名群组用稳定 ID 父目录隔离，同名员工目录映射到真实员工 ID。目录名称在首次创建后保持稳定，重命名显示名称不会移动运行中的工作目录。用户完成上传后文件即对成员共享，发送消息才触发文字通知；临时上传分块不向成员展示。以上为 Core API 授权，不是同一操作系统账号下任意 Trusted 原生进程的文件沙箱，也不会因加入群组而放宽引擎权限。

`Archived chats` 统一显示已归档的员工、群组和频道；Restore 继续调用 `messenger.conversation {patch:{archived:false}}`，不改变历史、未读回执、成员身份或工作区。

## 自建混合会话分类

`messenger.folder-save/delete` 允许用户或 Secretary 调用，默认 API 发现对二者列出；与其他个人整理操作共用 `messenger.json`。分类只保存已验证的私聊、群聊、频道引用；同一会话可以加入多个分类。每个分类有独立 revision，同名及相同成员重试保持幂等；并发修改同一分类时显式 expectedRevision 冲突拒绝。无关草稿写入不会造成分类冲突。删除分类保留全部会话、消息、草稿、置顶、收藏和归档；固定 All 没有可编辑或删除的分类记录。

频道会话可使用相同的个人置顶、收藏夹、归档和未读提醒；这些仍只影响用户整理状态。新闻文章收藏始终属于频道 Core 中的稳定 postId，不复制到随作者路由变化的 messenger key。`messenger.search` 以同一用户权限合并仍保留的新闻，外部作者不冒充 operator 或 agent。新闻可作为用户明确选择的引用或转发来源；目标仍为已有私聊或群聊，图片复制继续使用原有认证文件传输。频道讨论支持文字、图片、文件、mentions 和同频道 replyTo 草稿。用户附件保存在频道共享根目录；员工仅收到原文与文件清单，不自动收到私聊附件。

`view.open messages --channel` 与返回导航仅选择展示对象，不能签发采集凭据、调用模型或确认其他会话已读。新闻图片读取和下载仍检查文章在当前频道的真实归属；收藏后移动来源不会授予对旧频道路径的继续读取权限。

## 独立新闻频道与采集凭据

同一员工可以同时属于多个群组、担任多个频道的管理员，各项成员关系独立；从一处移除不影响其他成员关系或公司职位。`chat.list` 只返回自己加入的群组。`channel.list/get` 现在允许已初始化员工读取自己仍为成员的频道身份（ID、名称、类型、管理员和修订信息），不返回用户收藏计数或订阅配置；Employee、Manager、Governor 均不能凭公司职位读取未加入的频道。用户原有完整频道列表保持不变。

频道 Admin 是独立于公司职位的身份，由用户或实际频道 Admin 通过 conversation.role 任免现有 Agent；旧 channel.update 的 adminIds 写入也必须通过同一成员校验，Company Secretary 没有豁免；不会改变 Employee/Manager/Governor 角色、引擎、宿主、工作区或公司管理权限。频道没有隐藏群、独立模型或第二套任务队列。订阅、采集部署、收藏、频道删除与导出保留用户/Secretary应用管理范围；图片原始字节读取要求真实频道成员；频道 Admin 任免、禁言、静音、静态通知要求实际会话职位，channel.context、channel.history、channel.message-post、channel.post、channel.image 对所有 Agent（含 Secretary）要求真实当前频道成员身份；文章发布继续要求 Owner/Admin 发布者身份。界面读新闻不调用模型、不清除私聊或群聊已读。配置管理员后，新的外部新闻会在这些员工原有队列中进行真实静默阅读确认。

新建频道必须显式选择员工或外部进程引擎。员工频道复用 adminIds 作为发布成员；团队快选仅加入当前员工，不改变公司职位。`channel.publish` / `channel.media-put` 使用 chat 权限，但 Core 每次将 channelId 解析为当前认证员工自己的来源；不得冒充其他员工、修改真实作者或向外部引擎来源投稿。撤销成员立即撤销发布权限，保留历史文章；普通私聊回复和静默新闻通知不会自动成为投稿。原生 schedule.create 仍走原有目标员工、权限与调度校验，创建频道不自动启动任务。

频道引擎、头像、连接参数和凭据配置仅用户或 Secretary 可修改；普通成员的 channel.list/get 不返回外部进程地址或凭据 ID。独立头像只允许验证过的图片，恢复默认用 avatar:null。已绑定外部频道要求匹配其 collectorId，旧 all/source-scoped 令牌不能跨入其他绑定频道或员工频道；更换绑定只撤销旧凭据对此频道的访问，不影响无关频道。host 仅是部署记录，认证仍依赖凭据；连接状态只依据成功认证请求时间，不伪造在线状态。

外部采集服务使用独立的 source-scoped capability，不获得 operator 身份或控制令牌，也不扩展既有 `PrincipalRef`。其专用认证入口只允许 `channel.collector-config`、`channel.media-put`、`channel.publish` 和 source 范围的 `channel.source-avatar-put`，每次核对令牌有效性与来源范围；不能修改订阅、路由、用户收藏、Core 设置或调用其他 API。用户签发时只返回一次明文，SQLite 仅存哈希，撤销立即生效。采集服务自己的 cookies、TG session 和其他平台凭据留在其原主机。

采集监听默认关闭；启用后仅绑定 `127.0.0.1` 的指定端口。跨主机通过 HTTPS 反向代理或 SSH 隧道连接，令牌只放认证头。Core 不根据提交的 URL 下载内容；图片必须显式上传，限制为单张 8 MiB 的 PNG/JPEG/GIF/WebP，属于指定来源和文章。读取与下载仅限当前频道中该文章已发布的图片，不能访问 staging、其他文章或任意本机路径。

Core 是订阅和作者路由的权威。取消订阅仅禁用来源；移动作者保留 sourceId、文章 ID 和收藏，所有仍保留内容随当前路由投影。未收藏新闻按原发布时间与首次接收时间的较早 48 小时截止点清理本地正文和图片，重试或更新不延长时限；收藏连同本地媒体永久保留。删除和过期有窗口内重投保护，旧发布时间在窗口外继续拒绝。清理仅涉及 Core 自己的频道目录，不更改远端采集服务的清理策略或内容。

用户或实际担任管理员的 Secretary 可用 channel.message-send 向发送时其他管理员投递；显式 mentions 与有效同频道回复的原 Agent 作者为工作对象，两者皆空时全员工作，其余只接收 awareness。管理员 channel.message-post 的公开回复必须关联其实际收到的用户讨论，不因单独的外部新闻通知主动发言；用户针对新闻的提问属于正常讨论，可关联该用户消息答复。其他管理员只静默知悉该回复，作者不自回声。阅读阶段无工具，由成功的原生轮次记录接收回执；普通文字、JSON 和思考不会变成频道发言。text:null/--silent 已移除，只有明确的非空发布才能创建气泡。任何频道身份都不授予控制其他员工的权力。

`channel.timeline {id,kind?,limit?,beforeEntry?,cursor?}` 对当前频道成员开放；Secretary 读取正文也要求真实成员，用户保留管理访问。它提供新闻与讨论的统一历史：默认最近20条，每页可自主选择1–100条，游标继续取更早内容，超过100条无需一次加载全部。按新闻发布时间/讨论创建时间及稳定ID排序；beforeEntry严格限定当前时间线中位于提问之前的内容，并不是过去时刻的快照。新闻正文完整、带真实作者/平台/时间和媒体描述，不返回用户saved/savedAt偏好。每页重新核对成员、当前来源归属、48小时保留/收藏及删除状态。读取不触发模型、已读或发言，不绕过频道发布限制。旧channel.history及context.recentMessages仅含讨论，不能据此判断新闻为空。

新新闻仅在首次创建时冻结未配置计数规则的成员 recipients，使用 awareness + silent-only。配置 `channel.post-trigger-*` 的成员改为独立按新帖阈值接收批次；暂停的规则不逐帖唤醒该成员，移除规则才恢复逐帖阅读。重投、更新、收藏、删除和后来加入的管理员不会触发补发。队列只存 news ID 引用，派发时从仍有效的唯一新闻记录取得全文、原发布时间、真实外部作者/平台/URL和媒体描述；过期、删除、来源移动或撤销管理员时拒绝后续阅读，不从永久副本复活。本轮仅自动送正文和完整来源元数据/图片描述，不将图片字节自动送入原生视觉输入，也不宣称视觉理解；原图仍可在频道查看和下载。投递借用原 ACK/原生 FIFO；新闻作者始终为外部来源，用户仅是管理员订阅授权的来源，不冒充新闻作者。原生引擎实际读过的内容可能保留在其原生历史，Core 的48小时清理不改写这些执行记录。

公开频道讨论 cm_ 保留真实作者、序号和时间，支持个人 saved/pinned/hidden/reaction，以及消息引用、转发和文字/mentions/replyTo草稿；操作不改写原消息。新闻 np_ 仍只有稳定postId收藏并服从48小时策略。来源头像独立存储在 source_avatars，每source一张，采用相同8MiB和真实格式校验；文章清理不删除来源身份图片。采集凭据可上传被授权来源头像，但不能读消息、任命管理员或获得operator身份。

## 每个主视图的外观

`settings.set` 沿用既有全局管理能力，Secretary 也可代用户配置。`viewAppearance.company/messages/plan` 分别保存配色与自定义颜色，局部修改在 Core 合并，不会覆盖未提供的其他视图；非法视图、字段或颜色整次拒绝。旧 `theme/themeColor` 仅映射 Messages。界面语言、模型默认值和页面大小继续共用，外观不改变员工、原生会话、工作区、计划权限、画布几何或群消息/新闻数据。设置导航与颜色预览不运行计划任务。

`settings.set {messageWallpaper:{pattern,layout,density,opacity}}` 复用既有设置权限和偏好存储。它只调整 Messages 装饰：五组原创小图案、整齐/散落布局、密度和浓淡；局部修改保留其他字段，非法输入整次拒绝。预览、改变花纹和恢复默认都不读取或修改消息、任务、已读、成员或凭据。Company/Plan 配色和权限保持独立。

### Message 拖动排序

`messenger.reorder` 允许用户或 Secretary 整理 category 与混合会话顺序，沿用个人 Messenger 状态和既有授权。Core 验证 scope、当前会话/分类引用及分类成员；每个 scope 可独立比较 expectedOrder，避免覆盖其他窗口。拖动只保存位置，不读取历史、标记已读、触发员工或改变公司/群组/频道权限。手动顺序不修改置顶/收藏/归档标记；恢复自动排序只删除指定 scope 的位置记录。

## Plan 调度的独立下行边界

所有四种角色都具有 `plan.*` / `schedule.*` 能力和自我排期能力。对他人的排期额外要求严格的职级下行：Manager → 本 Team Employee；Governor → 全局 Employee/Manager；Secretary → 全局 Employee/Manager/Governor。禁止跨员工的同级排期及向上排期，Secretary 的一般应用管理权限也不能绕过此限制。用户可操作全部规划。

调度元数据和视图不授予角色权限。Core 在创建、修改、预览、触发、恢复、执行及异步准备后校验目标和原始委派。旧同级调度在恢复时停用，保留历史和稳定 ID。`action.channelId` 要求目标仍是该员工引擎频道的发布者；channel.posted 事件同时要求目标及普通调度发起者具有来源频道成员资格。Collector 凭据无权调用任何 Plan 调度 API。

所有角色通过本人身份说明获得统一指引：员工自动任务应调用 Core Plan API，读取返回 ID 并核对规则；不要用临时 sleep、cron、第二套调度器或插件文档提醒代替。此行为指引与 API 授权共同工作，不宣称给共享系统账号上的任意 shell 进程提供额外操作系统沙箱。


## 跨视图员工资料

`card.profile {id,offset?,limit?}` 复用 employee.read 目标授权，只读返回 Company 身份、可见群组/频道中的真实成员身份、稳定工作目录和分页 Plan 摘要。管理员可读员工不等于能读其未加入的群聊；所有 Agent（包括 Secretary）的会话身份投影均按本人成员关系过滤，用户可管理查看。资料不返回提示词、凭据或私聊正文，不创建目录、不启动引擎、不改变本人已读。异步读排期之后重新核对权限与成员关系。初始化状态不妨碍只读查看身份，仍不能以此启动正式任务。

员工资料中管理职位与编码引擎只读；原有独立任免接口继续按职位能力矩阵授权。更换角色仅在显式展开后使用原外观编辑流程。用户通过资料的 Workspaces 入口可编辑群/频道根目录原件；普通员工 API 保持根直属文件只读、本人一级姓名目录可写；实际成员 Secretary 可维护根直属文件，仍不能写他人目录，并可显式复制到个人 Workspace，所有者和已有会话/目录标识保持不变。

## 云端角色与编码引擎凭据

Manager/Governor 的控制、布局、招聘、身份、反向 CLI 和重启恢复均按职位与 Team 校验，云端位置不再一律拒绝。已有员工的 ID、主机、工作目录、原生历史和引擎不迁移。撤销凭据和职位变化继续立即影响 Core 权限。

Cline/Pi 在 Work 插件目录中使用本人插件授权与专属运行目录；不能借新引擎选择访问其他员工或用户的插件数据。API Key/服务地址按编码引擎独立保存，学校兼容服务和 Claude 的个人服务互不继承。此配置隔离不改变 Trusted 系统账号本身的文件权限。

## Secretary 的 Plan 记录管理与统一 API 工具

Secretary 可查询全部 Plan 排期与保留的执行记录，包含目标员工已删除的任务；这类任务的原 ID、引擎和时间规则仍可读取，已无法确认的旧名字/职位返回 null。秘书可清理、暂停、维护停用记录，或把完整 action 改派到当前有权排期的目标。记录读取和清理不授予执行权限；不同在职 Secretary 的排期仍不可修改、恢复或执行。用户保存的 Plan 数据库视图可由秘书通过原 plan.view-* 管理。

统一原生 agents_company_api 使用启动时绑定的员工凭据，进入 UI/CLI 同一 Core 分发器，不接受调用者自行提交身份、委派或用户 token。查询无需额外批准；写入遵循引擎的 Ask/Full access，原生 planning 模式只读，初始化和静默阅读不开放通用操作。批准后再检查当前任务和有效权限。该工具不扩大当前员工、成员文件或宿主的操作系统权限。

人类已读确认、用户消息作者编辑、跨会话引用/转发授权、用户凭据、权限升级及 Secretary 任免保持原边界。共享原件和其他成员目录的写入仍受成员范围约束。已有 API 可用性审计与 GUI/CLI 对应记录见 Infra/src/docs/SECRETARY_API_PARITY.md；一次成功构建不等于每个外部服务或所有操作系统已实测。


## 自定义分类与社交元素

`messenger.social`、规则分类和 source:ID 列表偏好沿用用户/Secretary 的应用管理授权。普通员工不能查询或改动用户分类；社交元素不创建新频道、身份或执行权限。`channel.acknowledge --all --source` 仍仅用户，按当前父频道校验并只确认该来源的保留文章，不修改其他作者或私聊/群组回执。分类 include/excluded 只过滤列表，删除分类不删除原消息或订阅。

## 云端文档与频道存储

外部频道 fileStorage 由用户或 Secretary 显式绑定既有 Cloud Hosts hostId 和云端内容寻址媒体目录。采集器只能提交本来源文件名、MIME、大小、SHA-256 和缩略图等元数据；不能指定任意主机路径、取得用户凭据或自动写入 Mac。channel.file-download 仅用户可调用，复用现有 SSH 传输与频道 conversation.workspace。每次远端读取核对当前帖子、路由和绑定，提交前校验大小与 SHA-256；同名用户文件保留。channel.file-status 只查询进度，不能开始传输。

文档频道的云端帖子和文件缓存保留七天并自动清理，普通频道仍保留48小时语义。本地已下载件遵循已有共享原件/成员工作区权限，不因云端过期、帖子删除或服务重启删除。

## 全部会话目录

`messenger.directory` 沿用用户/Secretary的应用管理权限，只读查询当前员工、群组、父频道及平台来源元数据，可按类型、分类、搜索、归档和分页过滤；不读取私聊正文、启动引擎或标记已读。普通员工仍通过原 `chat.list` 仅看到自己加入的群组，不因目录功能扩大权限。动态分类由显式include规则决定，不按名字自动改写用户手选名单。

## Conversation notices are separate from Plan

Current conversation offices (Owner/Admin/Member in both groups and channels) are independent of Company managementRole. Only actual conversation Owner/Admin configures mute, quiet mode and fixed-text notifications; Company Secretary has no conversation-office bypass. Owner alone dissolves groups or transfers ownership, with the human user's external recovery override. `conversation.notice-*` posts saved text through an independent Core timer/storage without running an Agent or entering Plan. Plan `schedule.*` retains its own employee scheduling contracts. Separately, `channel.post-trigger-*` stores per-member new-post counters, saved prompts and exact batches; it may execute that member without creating or triggering a Plan record. `conversation.entry/download/download-status` provides full stored published content and a verified copy into an own selected workspace, never a peer folder or root original. See [MESSAGE_COLLABORATION.md](Infra/src/docs/MESSAGE_COLLABORATION.md) for these separate contracts. See [CONVERSATION_CONTROLS.md](Infra/src/docs/CONVERSATION_CONTROLS.md) for the current, detailed boundary.

## Asset center

`assets.tree`, `assets.children`, `assets.search`, `assets.locate`, `assets.file` and `assets.naming`
are human-only. File operations reuse current workspace/conversation boundaries;
index metadata does not grant file authority. Published files are read-only.
Employees cannot mutate conversation originals or peer folders, or use an asset
reference to bypass those restrictions. Directory migration requires a current
preview and rejects busy affected employees and active transfers.

`workspace.reveal` is human-only and resolves the same file scopes as transfers.
It reveals local Core-host paths only after scope and symlink validation. Remote
and Web requests cannot open a Core path in the client's file manager. Revealing
fixed roots or published attachments grants no write or rename permission;
existing read-only and member workspace boundaries remain unchanged. Downloads
continue through the existing authenticated transfer/channel operations.
`assetDrawerWidth` uses existing `settings.set` authority and only affects display.

## Research Studio data operations

`workflow.prepare` extracts only explicitly supplied Engine input and returns bounded text metadata; it creates no workflow/employee and receives no Infra client. `workflow.export` renders a supported alternate format from the caller's completed report without model calls or changes to the original revision/manifest. Neither data operation grants Agents access to a user's materials or report. `workflow.fork` requires an owned completed parent, current expectedRevision and stable clientRequestId; Core stamps lineage and creates a separate workflow. Parent content remains immutable and private material reuse follows the Engine's explicit input policy. See `Contract/WORKFLOWS.md` for schemas, limits and CLI.
