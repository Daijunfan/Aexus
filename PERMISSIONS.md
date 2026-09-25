# Agents Company 权限说明

本文说明本项目的 API 授权。产品概览见 [README.md](README.md)，完整命令见 [API.md](API.md)。每个员工应通过 `agents auth whoami --json` 确认身份，通过 `agents api docs` 获取自己可用的手册。

## 职位、运行位置与工作环境

职位只有 **Manager** 和 **Employee**，保存为 `managementRole`。运行位置独立保存为 `kind`：`worker` 表示本地 Coding Agent，`cloud-native-worker` 表示云主机原生 Coding Agent。旧数据缺省为本地 Employee。

Manager 必须是本地运行的员工。本地员工可以按所属 Team 的配置在本机工作，或使用 Tunnel 操作已绑定云主机。云端原生员工只能担任 Employee：执行引擎、配置及项目工具位于其绑定主机，连接失败不回退 Mac。

Team 类型在界面中分为 Build（项目）和 Work（插件）；Build 可选择本地或 SSH 环境。为保持旧版本兼容，SSH Build 在存储和 CLI 中继续使用 `mode: cloud`。Team 决定目标主机及根目录，员工不能覆盖主机或离开云端 Team 范围。

**Agents Manager 是单独明确授予的全局管理范围，不增加第三种职位。**只有用户可以签发／撤销员工凭据及授予／撤销全局权限。目录名称、标记文件、Prompt 和视图成员关系不授予权限。

## 能力范围

| 操作 | Employee | Team Manager | 全局 Agents Manager / 用户 |
| --- | --- | --- | --- |
| 查询自己的身份、API、会话和状态 | 允许 | 允许 | 允许 |
| 操作本人工作区、已声明的插件 API | 允许 | 允许 | 按原全局能力 |
| 查询同 Team 的最小拓扑名录 | 允许 | 允许 | 全局 |
| 创建本项目员工 | 拒绝 | 仅本 Team 的 Employee | 全局 |
| 查看他人会话、状态、排队消息 | 拒绝 | 仅 active 关系目标 | 全局 |
| 派发 Prompt、排队、停止任务、调度 | 拒绝管理他人 | 仅 active 关系目标 | 全局 |
| 修改模型、思考、速度、计划模式 | 拒绝管理他人 | 仅 active 关系目标及实际引擎支持的设置 | 全局 |
| 删除员工 | 拒绝 | 必须自己创建且仍有 active 关系 | 全局，保留原生会话所有权规则 |
| 申请关系／解除关系 | 拒绝 | 仅自己的同 Team 关系 | 全局 |
| 批准关系／设置职位 | 拒绝 | 拒绝自行提权 | 全局 |
| 其他员工任意文件写入／终端输入／工具提权审批 | 拒绝 | 管理箭头不授予 | 全局 |
| Team、主机、视图及全局设置 | 拒绝 | 默认拒绝 | 全局 |
| 员工凭据、全局授权 | 拒绝 | 拒绝 | 仅用户 |

实际可发现的命令由共享 API Registry 和当前身份决定。`api.list` 说明当前可用 API 类别；具体目标还须通过运行时资源授权。未知或未为员工声明的命令默认不开放。`plugin.call` 还要求插件 schema 为该命令声明 `agentAccess: workspace`。

## 管理箭头

普通管理关系只能是同一 Team 内的 `Manager → Employee`。不同 Team、Manager 自己、其他 Manager 或全局管理者不能成为普通关系目标。没有 active 箭头，就没有对该员工的编排权限。

申请先进入 pending，用户或全局管理者批准后才生效。Manager 创建普通员工时，Core 在同一次状态提交中记录 `createdBy` 并建立 active 关系，不需要再重复申请。创建参数省略 `--group` 时，普通 Manager 默认使用自己的 Team。客户端不能伪造创建者、批准者或权限字段。

删除额外要求当前 Manager 是真实创建者。克隆不会复制管理职位、关系、全局授权或凭据。员工的模型调用和工具执行始终使用该员工自己的身份，不能继承派发者的身份。

解绑、角色变化、员工移动／删除会使不再合法的关系失效。来自该关系的后续调用、订阅、排队消息和定时委派被撤销；其他有效来源的任务不受牵连。重新绑定使用新的关系 ID，不恢复旧委派。已完成的文件改动不能因解绑自动回滚。

## 初始化和文档

员工工作目录的 `AGENTS.md` / `CLAUDE.md` 包含公司 CLI 入口。`.agents-company/employees/<employeeId>/API.md` 和 `PERMISSIONS.md` 按该员工真实身份生成；共用文件夹的员工各自拥有自己的手册。Work 插件手册保留在 `.agents-company/plugins/<pluginId>`，与公司手册共同生效。

角色与全局授权变更会更新手册；会话恢复和下一次任务会刷新启动引导。文档不替代后端授权。普通 Manager 不会因为位于 `Agents-Managers` 目录就获得全局手册或权限。旧手册路径仅保留到当前身份手册的入口。

本项目员工必须由 `agents card create` 创建并登记。Codex / Claude Code 自带的子 Agent、线程或 `Agent` / `Task` 工具不属于本项目员工，不用于实现公司编排。

## 工具权限与系统隔离

API 角色授权和 Coding Agent 文件／工具权限分别执行。Manager 不需要 Full access 或全局授权才能创建本 Team 员工。Core 在授权通过后创建员工目录，Manager 的引擎不需要直接写入同事目录。

本机 Codex 的只读和 Work 配置，以及 Claude Work 配置，只为本项目经过认证的 Unix Socket 增加精确路径许可，保留原有文件范围和工具审批。不能改为允许所有 Unix Socket，不能通过关闭沙箱修复 CLI 连接。受管理策略禁止该通道时应报告初始化错误。

Trusted 保留宿主操作系统账号的实际权限，API 授权不能防止同一无限制账号中的进程直接读取文件或窃取凭据。Isolated 使用支持的外层系统隔离；不支持的环境会拒绝启动，不自动降级。文件范围不等于容器隔离，SSH 账号权限仍决定远端可访问资源。

## 视图与布局

视图只过滤显示，不改变权限。主视图动态包含全部 Team，不能移出或删除；自定义视图移除 Team 不停止任务或撤销关系。同一 Team 在所有视图使用同一份关系和坐标。

有效关系变化后，Core 自动聚合管理组、安排剩余孤立员工、调整 Team 外框。连线直线段严格水平／垂直，仅拐角使用小圆角。布局变化保留视图镜头；手动整理使用 `agents management relayout --team NAME`，仅用户／全局管理者可调用。


## 初始化期间的临时限制

初始化是 Core 管理的员工生命周期，不改变长期职位或管理关系。用户和 Manager 均须等目标员工 `initialization.status === "ready"` 后才能打开、发送、排队、追加、停止或读取会话。可继续查询状态；具备删除权限的调用者可以取消并删除员工。失败提供配置和重试入口，不能通过修改员工 JSON 字段标记为已就绪。

正在初始化的员工自身只可调用身份、API 文档、拓扑及本人文档读取等必要的只读公司 API；不允许因为已经是 Manager 就执行手册里的创建示例。插件 API 文档可读，初始化阶段不执行插件写操作。引擎的原有工具安全边界继续有效；额外权限请求会使初始化失败，不弹出隐藏审批、不自动提权。

完整说明保存在 `.agents-company/` 隐藏目录，默认文件树不展示。隐藏用于减少界面干扰，不是权限或保密机制。Core 不发布初始化轮的消息内容；原生 Coding Agent 上下文仍保留初始化内容。

## 0.40 布局工具与用户已读状态

本节更新上文关于布局的说明。普通 Team Manager 可以读取和调整本 Team 外框，自动整理本 Team，并单独移动自己及 active 关系中的 Employee。普通 Employee 不新增跨 Team 权限。

具有全局 Agents Manager 授权的员工可以调整其他 Team；调整自己 Team 的外框及员工位置仍要求 Manager 职位。用户通过自己的 CLI 或 UI 可以调整所有 Team。文件夹名称不授予这些能力。

`office.layout` 返回实际几何及 editable 标记；`room.bounds`、`room.place`、`card.place` 和 `management.relayout` 统一验证实际目标。模拟 UI 点击、输入、拖动和滚轮的测试接口仅供用户使用，Agent 使用结构化布局 API。

招募、删除员工或有效关系变化时，后台自动适配外框并推开重叠的邻居，包括手动固定过的 Team。自动避让不改变工作目录、任务归属或管理关系。所有视图继续共用同一份 Team 坐标，镜头不变。

`session.acknowledge` 只允许用户确认确切的 replyId；Manager 查询、订阅或读取不会清除用户未读状态，全局 Agent 也不能代用户确认。过期确认不会清除更新的回复。桌面确认要求原生窗口可见、在前台且未最小化，并实际显示最后回复的末尾。关闭会话、重启或切换视图保留未读状态。隐藏初始化不产生未读消息。

完整文档和引导位于 `.agents-company/employees/<employeeId>/` 隐藏目录；根目录已有的用户说明保留，不需要显示宿主生成文档。
