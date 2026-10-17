# Aexus RoleBoard 权限与身份

Company、Messages、Plan 是同一个认证 Core 的三个视图。桌面、浏览器、CLI、原生 `agents_company_api` 工具进入同一分发器。界面标签、Team 名字、工作目录、头像和创建关系均不授予权限。

本版本将 **Secretary 明确设为最高应用管理员**。它能以本人的 Agent key 完成软件管理工作，不需要取得 operator token，不需要模拟用户点击。秘书不直接修改 Aexus 项目源码；软件本身的开发交给用户的编码主代理。这个职责约束不等于同一操作系统账号上的额外文件沙箱。

## 职级与管理范围

| 操作 | Employee | Manager | Governor | Secretary | 用户 |
| --- | --- | --- | --- | --- | --- |
| 读取公开文档、真实身份和可用接口 | 允许 | 允许 | 允许 | 允许 | 允许 |
| 思考程度/思考开关 | 自身 | 自身及本 Team Employee | 自身及所管角色 | 全部角色，包括自己和其他 Secretary | 全部 |
| 创建/删除角色 | 不允许 | 本 Team Employee | 全局 Employee/Manager | 全部角色 | 全部 |
| 任免 Governor | 不允许 | 不允许 | 不允许 | 允许 | 允许 |
| 任免 Secretary | 不允许 | 不允许 | 不允许 | 允许；必须保留一个 ready Secretary | 允许，含恢复入口 |
| Plan 排期 | 自身 | 自身及本 Team Employee | 自身及全局 Employee/Manager | 全部角色、所有现存/孤立记录 | 全部 |
| Company 配置、资料、形象、布局 | 自身已授权范围 | 本 Team 已授权范围 | 全局既有管理范围 | 全部 | 全部 |
| 全局资产、会话治理、整理、媒体与文件传输 | 本人/成员文件范围 | 同左 | 同左 | 全部应用管理范围 | 全部 |
| 签发/撤销员工 key | 不允许 | 不允许 | 不允许 | 可签发/撤销员工范围 key；不返回别人明文 key | 完整管理 |
| 读取/修改原生引擎 OS 权限 | 既有授权 | 既有授权 | 既有授权 | 既有明确授权；不会自动提权 | 完整管理 |

批量删除在任何副作用前整批检查。Secretary 删除、降级、撤销最后一个 ready Secretary 的凭据，以及删除包含最后一个 ready Secretary 的 Team，均拒绝。先创建并初始化替代管理员再操作。用户仍可恢复或清空管理角色。这个约束不会把失败/正在初始化或没有有效已签发key的角色当作可靠替代者。

角色和成员 ID、原生会话引用、Team 与工作区绑定继续稳定。职位改变不迁移工作目录、切换引擎或提升操作系统身份。Secretary 保留 Core 本地引擎与本地工作区要求；Cloud Team 内可显式选择 local。

## 真实身份、key 和审计

`auth.whoami` 返回真实 principal、managementRole、appAdministrator 与职责。秘书始终是 `{kind:"agent",employeeId:...}`。任何请求都不得自报 createdBy、delegation、operator 身份或内部权限字段。

`auth.agent-token {id}` 由用户调用时保留既有凭据返回；由 Secretary 调用时只返回 `{employeeId,issued:true,scope:"employee",credentialReturned:false}`。目标员工自己的运行环境从 Core 获取其专属 key；秘书不会收到别人的明文 token。撤销即时影响后续请求，key 不获得超出目标员工当前角色的权限。

`administration.audit {limit?,beforeId?,before?}` 返回最近 2000 条应用管理结果，包含稳定记录 ID、时间、真实 actor、命令、可解析目标员工及 succeeded/failed。不写入参数、消息正文、API key、文件内容。用nextCursor作为beforeId翻页，避免同毫秒记录被跳过；before仍可按时间过滤。审计是应用管理记录，不宣称覆盖任意外部 shell 命令。文件写入采用私有原子替换及前一版本备份。发生连接或持久化错误后应回读实际业务状态，不自动重复写操作。

`api.capabilities` 返回完整注册目录、当前可调用状态、保留的身份边界、旧接口替代说明及三个视图信息。可调用表示职级入口可用，目标、修订、运行中状态、文件存在性和外部服务仍在实际调用时检查。

## Messages 管理

Secretary 可读取全局群组和频道，管理成员、Owner/Admin、禁言、静音、固定通知、来源、订阅、个人分类/排序/归档及保存视图。它无须先把自己加入每个群组；`conversation.policy.actorRole` 如实返回 `secretary`，不伪装 Owner。普通 Employee/Manager/Governor 仍须具有实际成员或会话 Owner/Admin 权限。

秘书发言、转发、跨会话引用和管理请求保留真实 Agent 作者。转发幂等记录按实际 actor 隔离，不能用相同 clientMessageId 读到别人的确认。消息修订保留原作者和已派发任务，`chat.edit` 额外记录 editedBy，界面显示实际编辑者。修订仍校验 expectedRevision，不重新触发已接受任务。

**人类阅读确认不是管理委派。** `session.acknowledge`、`chat.acknowledge`、`channel.acknowledge` 仍表示用户实际阅读，仅用户可调用；秘书读取历史、整理会话或执行任务不会伪造这种回执。秘书可以使用现有会话未读提醒等整理操作，不把它声称为用户亲自读过。

固定正文通知使用 `conversation.notice-*`，不运行模型、不进入 Plan。按新增文章计数触发成员提示词使用 `channel.post-trigger-*`，与 Plan 独立。真正的员工排期使用 `schedule.*`，不可用临时 sleep/cron 代替。

## 文件与资产

Secretary 可调用 `assets.*`、`workspace.*`、`conversation.file`、`transfer.*`、`channel.file-download` 与 `workspace.reveal`，包括所有应用管理工作区、会话根原件与成员目录。普通角色的本人目录/当前成员范围保持原有校验。固定成员目录本身仍不能通过普通文件改名/删除破坏身份绑定；迁移使用带预览的 `assets.naming`。

发布附件仍只读，复制保留原件；云端下载保留 SHA-256/大小校验和同名文件保护。路径穿越、符号链接、工作区绑定变化、busy 角色、活动传输和 optimistic hash 检查继续执行。上传/下载/媒体能力绑定实际 principal 与客户端；秘书无法取得尚未上传的浏览器本地文件，也不共享其他 actor 的进行中上传或媒体许可。

`workspace.reveal` 仅在 Core 主机的桌面打开经过范围校验的本地路径。远端原件和浏览器本地文件继续通过下载/传输处理，不把服务端路径误认为客户端路径。

## Coding Agent 思考控制与默认值

`config.get {id}` 可读取稳定员工 ID 或 live session ID 的当前 model、effort、thinking、能力、busy 和新建默认值；不启动引擎或推理。`config.effort {id,effort}` 与 `config.thinking {id,enabled}` 同时支持已关闭的员工。关闭会话的非默认 effort 通过目标实际引擎/主机模型目录校验，不偷偷改用本机引擎。异步校验之后再次检查角色、凭据、员工配置和运行状态。

设置保存到员工记录，重新打开仍保持。`effort:"default"` 明确清除覆盖；不会在重开时重新套用新员工默认值。busy 或调度占用时拒绝修改，先完成/停止任务。

`settings.set` 保存 `defaultCodexEffort`、`defaultClaudeEffort`、`defaultOpenCodeEffort`、`defaultClaudeThinking`，及原有各引擎 default*Model（新增 defaultOpenCodeModel）。适用于之后创建的所有职级；不批量改动已有员工。界面 Employee defaults 使用同一 API、模型能力目录和显式 Apply。显式创建参数优先于默认值，包括 default 与 false。

Codex/OpenCode 使用 effort；Claude 可用 effort 与 thinking；Cline/Pi 当前不暴露这两个配置能力，显式要求不支持的能力会报错，不制造已生效的假状态。合法 effort 必须属于当前模型 supportedEffortLevels，包括目录支持时的 ultra；不同引擎/模型不可任意套用同一档位。

## 原生工具与执行权限

`agents_company_documentation` 按需读 identity、index、单接口 schema；`agents_company_api {command,args}` 执行同一 Core API。查询不额外弹审批；写入遵循现有 Ask/Full access，planning 只读，dontAsk 拒绝写入。初始化和静默阅读阶段不能使用通用执行器。审批等待后再次检查当前轮次、凭据、职位与权限。

`ui.click/type/drag/wheel` 仍只属于用户设备交互。它们会经用户的渲染器触发身份行为，不能作为秘书越过真实 actor 的后门。秘书用对应的 Company/Messages/Plan 业务 API 完成操作；导航、画布、窗口、终端等已有明确 API 可直接使用。麦克风、浏览器文件选择和本机剪贴板仍由客户端提供字节或设备许可。

新建角色的引擎权限沿用当前 defaultPermissionMode。改变管理职位或升级本版本不自动提升已有员工的 OS 权限。Trusted 引擎具有其真实系统账号权限；Core 的 API 范围不是对同账号任意 shell 的额外沙箱。云端执行失败不会回退本机；隔离不支持时明确失败。
