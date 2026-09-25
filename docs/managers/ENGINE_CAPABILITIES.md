# 引擎能力核对

核对本机 Codex CLI 0.145.0、Claude Code 2.1.233 及安装的官方 Agent SDK。
操作共用 Core、Unix socket CLI API 和桌面界面，不通过模拟点击执行业务。
接口用法见 [API.md](API.md#employee-cloning-and-native-workflow-tools)。

| 能力 | Codex | Claude Code | 桌面入口 |
| --- | --- | --- | --- |
| 员工克隆 / 会话分叉 | 原生 `thread/fork`、新 ID、原生标题 | 原生 `forkSession`、新 ID、原生标题 | 会话顶部「克隆员工」或 `/fork` |
| 新目录 / 绑定目录 | 继承 Team 范围；云端走 SSH | 继承 Team 范围；云端走 SSH | 克隆表单 |
| 克隆后的继续会话 | 独立续接、独立工作目录 | 独立续接、独立工作目录 | 点击新员工 |
| 删除原件 / 副本 | 原生记录分别清理，工作文件保留 | 原生记录分别清理，工作文件保留 | 员工资料 |
| 引擎、模型、思考、Fast | 原生目录与控制接口 | 官方 SDK 目录与设置接口 | 会话控制栏 |
| 计划模式 | 原生 collaboration mode | 原生 plan permission mode | 计划/执行开关、`/plan`、`/normal` |
| 会话持续连接 | 每员工一个原生 app-server 连接 | 原生 SDK 流式会话 | 自动 |
| 跨轮后台进程 | 保留并可列出、单独停止或全部停止 | 任务事件与 `stopTask` | 工具与额度 → 后台进程 |
| 忙时排队 | Core 有序队列 | Core 有序队列 | 排队按钮，可取消待发送项 |
| 运行中追加 | 原生 `turn/steer` | SDK 流式用户输入 | 追加按钮 |
| 实时文字 / 思考摘要 / 工具输出 | 原生增量事件、最终内容去重 | SDK 流式事件 | 会话正文 |
| 审批与用户问题 | 原生命令/文件审批、问题选项、自由文本 | 工具审批、AskUserQuestion | 会话上方的待处理请求 |
| MCP 表单 / URL 授权 | 原生 elicitation | SDK onElicitation | 待处理请求；用户点击才打开授权链接 |
| Skills / 命令调用 | 原生 `skills/list` 与 `$skill` | 官方动态命令列表、别名、项目技能 | 工具与额度 → 技能与命令 |
| MCP 状态 | 原生 MCP 状态 | SDK MCP 状态 | 工具与额度 → MCP 服务 |
| 账号 / 额度 / 用量 | 原生账号与限额 API、token 事件 | SDK 账号、result 用量与原生 `/usage` | 工具与额度 |
| 代码审查 | 未提交改动、分支、提交、自定义要求 | 原生审查命令/技能 | `/review` / 技能列表 |
| 图片输入和预览 | 原生多模态 input | SDK image content | 文件树「＋」附加图片；也可 CLI 发送 |
| 云端图片 | 通过 SSH 文件 API 读取，发送图片数据 | 通过 SSH 文件 API 读取，发送图片数据 | 同本地操作 |
| 会话导出 | Markdown / JSON，写入员工目录 | Markdown / JSON，写入员工目录 | 工具与额度 → 导出会话 |
| 上下文压缩 / 清空 | 原生 compact；新上下文保留旧 ID 的清理关系 | 原生命令、正确跟随重置后的新 ID | 斜杠菜单 |
| 文件编辑 / 冲突检查 / 回收站 | 共享本地/云端文件 API | 共享本地/云端文件 API | 文件树 |
| 人工终端 | 当前员工目录的 PTY/SSH | 当前员工目录的 PTY/SSH | 会话下方 |
| 持久定时任务 | 共享 Core，模型/思考覆盖与执行记录 | 共享 Core，模型/思考覆盖与执行记录 | `agents schedule` |

## Local Worker 与 Cloud Native Worker

旧员工及 `kind:worker` 是 Local Worker。即使所属 Team 在云主机上，Coding Agent 进程仍运行在 Mac，命令通过既有 Tunnel 工具或 Codex 远程执行环境到云端。`kind:cloud-native-worker` 只允许 Cloud Team，Codex app-server 或 Claude CLI 进程通过 SSH 在该 Team 主机上原生启动；不会把 Mac 的认证、Skills、MCP 或 Claude/DeepSeek 环境注入远端，也不会在断线后退回本机执行。

创建和切换引擎前使用 `engine.remote-check` 验证远端 CLI、结构化协议、认证状态及目录；提交创建时 Core 再检查一次。远端 Codex 的模型、账号和技能取自远端 app-server；Claude 使用远端 SDK 进程。员工和原生会话引用保存执行来源。Codex 云端克隆通过远端 `thread/fork`；云端 Claude 的克隆暂时明确拒绝，避免误克隆本机记录。手动绑定的外部原生历史可恢复和显示，但删除员工默认不删除外部原件。

## 宿主约定

- 克隆复制当前原生上下文及宿主可见历史，不复制工作文件、后台进程或排队消息。
  原件和副本都有独立会话 ID。Build 绑定同一目录时共享文件；Work 不能共用同一员工目录。
- 名称创建后固定；`/fork` 映射为员工克隆，避免产生没有员工归属的会话。
- Work / cloud 的目录边界保留；远端原生 CLI 的系统权限仍由 SSH 用户和远端沙箱决定，Team 目录绑定本身不是完整沙箱。Local Worker 云端模式不加载本机 Skills/MCP，
  避免本机工具和目录信息混入云端模型上下文。
- 原生 CLI 的账户登录、全局 MCP/插件配置继续由官方 CLI 管理；本地员工使用其原生配置。
  Local Worker 的云端 Claude 仅继承供应商认证、模型别名及网络环境，不加载本机配置中的 Hooks、插件或权限规则；
  工具白名单、PreToolUse Hook 和权限回调共同禁止本机工具，禁止 bypass 模式。
  原生终端的主题、状态栏、快捷键编辑等 TUI 页面不在会话中模拟；宿主有自己的主题、角色和终端界面。
- 图片必须在员工工作目录范围内，PNG/JPEG/GIF/WebP 单张最多 10 MB，每条消息最多 16 张。
- 退出会话会结束它的原生执行环境。断网/目录删除不等于会话丢失：连接可重建，已删除文件仍需恢复或重新绑定。
- 本表列出已经适配的工作流，不把未公开的官方客户端内部接口或未来实验功能标成已完成。

## 验证入口

DeepSeek 配置下仅显示 Flash / V4 Pro；思考强度为 low / high / max，开关独立。
使用 SDK 配套官方运行时，避免旧 CLI 丢失自定义模型的关闭思考参数。
Codex 模型列表读取全部分页与隐藏条目；新建员工使用 legacy 历史格式，保持克隆历史独立，
防止新版分页历史对原件的引用阻止删除员工。详细证据见 `artifacts/model-catalog/README.md`。

```sh
npm run typecheck
npm run test:coverage
npm run test:employee-features
npm run test:engine-controls
npm run test:native-clone
npm run test:scheduler
npm run test:remote
```

Core/CLI 测试使用隔离目录与协议 fixture。原生 Codex 协议测试连接本机 HTTP 模型 fixture，
验证真实执行路由、Fast 参数、跨轮后台进程与真实会话分叉；只用 `gpt-5.6-luna / low`，不调用付费模型。
原生 Claude 分叉验证只执行不推理的 `/usage`。UI 验证全部使用隐藏窗口。

官方接口依据：[Codex app-server](https://learn.chatgpt.com/docs/app-server)、
[Claude 会话与分叉](https://code.claude.com/docs/en/agent-sdk/sessions)。

## Windows cloud validation

Windows 11 Pro was tested with native PowerShell 5.1 and Codex 0.145.0, controlled
from macOS. Real `gpt-5.6-luna` / `low` executed environment discovery and a verified
file write/read. A deterministic native-protocol test captured model inputs and
asserted no SSH, Tunnel, exec-server or Mac paths were present. See
`artifacts/windows-live-test.json` and `artifacts/native-windows-audit/`.

Controller configuration paths stay local; selected execution-environment paths
stay Windows-native. Native tools and their outputs are unchanged. Missing remote
directories fail before model invocation. Windows cloud execution follows the SSH
user's permissions; it does not inherit the Mac workspace-write path policy.

## Company management and process isolation

Management APIs use the shared transcript/session layer and do not enable native Codex or Claude subagents. Team Manager authority is separate from engine tool permissions. Local macOS Isolated mode uses an outer Seatbelt process profile and private native-engine state; Codex's nested sandbox is disabled because macOS rejects sandbox reapplication. The outer profile enforces host-state/credential isolation and workspace writes. Work folder read boundaries remain in the outer policy; Claude keeps its file-tool scope hooks. Isolated native-history cloning is explicitly unavailable. Remote Isolated startup is rejected until an independently isolated remote OS environment is supplied; remote Trusted Managers use employee-bound SSH return channels.
