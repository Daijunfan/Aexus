# Agent 插件功能对照（进行中）

目标是完整的 CLI 引擎界面和 CLI/API 覆盖，不能用“有原生控制入口”代替完整交互。

2026-09-12 对照了本机安装包的公开 manifest：Codex `openai.chatgpt-26.901.22334-darwin-arm64`、Claude Code `anthropic.claude-code-2.1.269-darwin-arm64`。下表先覆盖公开命令与设置；webview 内部动作、原生协议和实际行为仍须继续核对。详细运行证据在 [AGENT_ACCEPTANCE.md](AGENT_ACCEPTANCE.md)。

| 功能 | 当前接口与实现 | 验收或缺口 |
| --- | --- | --- |
| CLI 引擎、模型、思考强度、Thinking、Wrapper、原生设置 | Codex App Server；Claude Agent SDK；`agent.configure`、`agent.control`、`agent.command` | 两种真实引擎及打包引擎已运行。模型、思考、原生配置均有实际证据。 |
| CLI/API 与 UI 数据一致 | UI 数据修改经 `workspace.patch` 或公共 API；CLI `api` 使用同一服务；视图/综合页共享投影 | 手工场景验证富文本、记录、日期、提醒和视图。52 个直接调用的方法均有命令目录；动态调用与原生桌面桥继续逐项检查，此项静态盘点不代表运行验收。 |
| Workspace / 主页面 / 文件目录 | 同一根页面 ID、固定身份 gateway、进程文件沙箱 | 开发构建和打包构建均拒绝空间外写入；跨主页面修改失败且其他页面保留原值。 |
| 发送前保存（Claude autosave） | Agent 发送、追加、斜杠命令与继续队列前等待现有 `WorkspaceSync.flush`；保存错误阻止启动任务 | 已补实现；需要在 UI 中编辑后立即发送的实际复验。 |
| 文本、多附件、图片、页面与选区引用 | `agent.send` 的 files/fileIds/context；@ 菜单；编辑器选区入口 | 双引擎多图片识别并写页面通过；UI 选择既有文件通过。图片预览、选区入口仍需手工检查。 |
| 输入快捷键与运行中的后续消息 | composerEnterBehavior、followUpQueueMode；排队/追加/中断；编辑/移除队列 | Enter/Cmd Enter、真实排队/中断有证据；队列编辑的完整 UI 流程仍需检查。 |
| 专注视图（Claude focusView） | `focusView`、`/focus`、面板按钮、Ctrl+Alt+F；工具分组折叠，保留实时名称、错误及请求 | 按公开设置补上，待 UI 验收。 |
| 会话新建、历史、分支、命名 | `agent.new/resume/fork/rename/sessions/close`、`--conversation-id` | 并行连接、独立配置/队列/日志、关闭后重开和未读已实现；Codex、Claude 各两个真实会话并行及落盘验证通过。会话标签的 UI 视觉/交互待后台手工复验；新窗口、分组和自动归档仍有缺口。 |
| 审批、会话许可、权限建议、用户问答 | `agent.respond`；完整 SDK PermissionResult；Codex availableDecisions | UI 批准 Write、AskUserQuestion→提醒通过；规则记忆、无效响应拒绝通过真实引擎。新增授权按钮需 UI 复验。 |
| 工具状态、后台任务、停止、日志 | 原生事件、稳定消息 ID、任务卡、stopTask/backgroundTasks、history --raw | 真实后台任务、停止后的延迟反查和恢复保留任务名已通过；另修复主回复 idle 后全局停止遗漏后台任务，回收站场景也已实测。 |
| 修改预览、接受/拒绝、回退 | `agent.diff` 每轮汇总、逐次操作、行号与搜索；Claude 用户消息检查点、`agent.rewind` 预览/恢复、`/rewind` 面板 | 真实 Codex 中文/空格/引号文件的差异与行号、Claude Edit 前后片段已核对；Claude 检查点恢复已验证。Codex 差异撤销也已验证单文件、多文件冲突与选择性撤销；UI 手工验收、通用快照/重做、接受修改流程仍有缺口。 |
| Review 交付位置 | `agent.review`、`/review` 选择目标与结果位置；原生 review/start | 四种目标、inline/detached、后续修复并写页面、取消后恢复均已真实验证；选择界面与文件行号跳转的手工 UI 验收待完成。 |
| MCP、技能、插件 | 动态发现与可搜索列表；原生控制；Claude sdk.mcpServers 等运行参数 | 真实 MCP 工具→主页面写入、配置新增/移除、启停/重连、故障状态均已验证；真实 MCP 表单接受/取消与页面写回也已验证；管理/表单 UI 手工验收、原生超时清理、Claude MCP 登录、插件安装/卸载等仍有缺口；Codex MCP OAuth 的本地完整协议、自动重载、跨会话刷新与持久性已验证，登录 UI 手工验收待完成。 |
| 登录、退出登录、账户与配额 | 账户面板、`/account`；Codex OAuth/设备码/API Key/取消/退出；Claude 账户/用量 | 原生登录启动/取消、退出持久性和并行缓存失效已实际验证。OAuth 授权完成、账户 UI、Claude 专用登录仍待验收或补齐。 |
| 工作树与文件搜索偏好 | 原生 CLI 工具可操作空间内仓库；当前文件列表来自 Workspace | 专用工作树入口、respectGitIgnore、编辑器语言服务适配仍需核对和补齐。 |
| 布局、焦点、启动偏好、引导 | 停靠/浮动/拖动、历史、输入区 | 主编辑区/新窗口、焦点快捷键、启动自动打开及引导偏好尚未全部对齐。Windows 的 WSL 设置有明确平台条件，当前应用是 macOS。 |
| 综合页面与跳转 | overview.get/render/configure；议程、日历、看板、表格、时间线 | 五种综合视图、跨日展示、完成联动、跨空间提醒与跳转均有真实 UI 证据。 |

## 打包验收

`npm run package -- --dir --publish never` 生成本地 `.app`。通过包内 `Contents/Resources/cli/mininotion` 创建独立数据目录，再启动两种真实引擎；文件和页面双写成功。Claude 实际运行的是 `app.asar.unpacked` 中的 2.1.269 二进制。包内 Codex 在同一条原生命令中成功写入自己的目录、拒绝写出目录；调用固定 gateway 修改另一主页面也被拒绝。

证据位于 `.local-data/package-acceptance-20260912/`，含 `result.json`、`boundary.json`、`page-boundary.json` 和 `app-sha256.txt`。此包对应当时构建快照；后续新增功能需要在最终打包版本中复核。
