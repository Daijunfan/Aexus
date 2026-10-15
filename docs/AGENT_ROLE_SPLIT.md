# Agent Board / Role Board 拆分验收

更新日期：2026-10-15。用户已授权抽测 DeepSeek，并进一步要求深入验收 Role Board 的合作关系、三个视图和群聊；中转站故障不再作为软件验收阻塞项。

## 当前实现

- 2.10.2 发布目标： `/Applications/云主机.app`。旧 `vm` 数据仅作为兼容字段保留，不再影响主机可见性、SSH 地址、VS Code 跳板选择或删除依赖；界面移除虚拟机电源/宿主关联卡。清除旧元数据不再中断既有连接。
- 修复宿主窗口失焦后 Role Board 仍沿用旧焦点状态的问题；窗口 focus / blur 与页面可见性共同驱动原版消息已读规则。群聊、关系、计划等业务代码不变。Role Pi 接受原生内置服务商，不再要求 DeepSeek 必须在 models.json 重复定义；沿用原生设置和凭据；原生 thinking=low 等已开启推理时，不再按 Thinking off 错误拒绝初始化。显式 off 的严格检查保留。
- 顶层四入口：Single Host、Hosts Board、Agent Board、Role Board。
- Agent Board 仅按工作组组织主机：新建、切换、重命名、移除工作组；每组独立添加、隐藏、排序主机。移除分组或隐藏主机不影响原生会话。旧主机列表自动迁入默认工作组，不再显示 Project、Workspace、目录登记或目录筛选；旧目录数据和 API 保留兼容。
- Single Host 新增独立 Roles 子页面，仅按当前工作主机投影 Role Board 员工，不读取、创建或绑定 Agent 会话；打开角色使用原版 Aexus 的精确会话/初始化入口。原生 Coding Agents 子页面继续独立管理。
- Role Board 独立承载 Company、Messages、Plan，复用内嵌 Aexus 0.66.2 的原始 Core、React 页面、存储、权限、消息和调度代码。三个子页面共用一个 iframe、clientId 和 Core 实例。
- 按用户最新要求，不再构建、打包、加载 Aexus 的 Cloud Hosts、Mini Notion、Margin Reader 三个插件；关闭内嵌插件入口和安装功能。独立软件源码、应用及用户数据保留。Aexus 原版 Cline/Pi 原生配置读取能力继续保留。内嵌版新配置默认从本机原生 Cline/Pi 配置读取服务、模型和凭据，员工会话与工具权限独立。
- 原生 Codex 不再自动注入 CloudHosts 协作 MCP 或动态工具。原有历史不擦除，不通过切换线程制造“干净”的假恢复。
- 原生 TUI 连接失败时显示重连入口和折叠诊断，不切换到自制聊天界面。Codex 精确线程、Pi 原生 session ID、Claude 原生 resume ID 保留；Cline 通过原生 SDK 在共享的生产 Hub 登记会话，再由原版 TUI 的 `--id` 连接精确标识；若 Hub 尚未运行，启动原版 CLI 自带的 Hub daemon，仍使用同一原生数据目录。创建操作不发送模型请求，也不复制引擎配置；原生引擎可以清理尚无消息的空历史。跨机 Cline 通过原生 Core 的提交事件记录是否有过输入，只在确认为空时按原 ID 重建；已有输入的历史丢失仍拒绝无关恢复。已实测本机及 Linux/Windows 跨机的空会话关闭重开、随后任务与历史恢复。
- 补齐宿主适配：插件能力如实声明关闭；工作目录选择使用原生文件夹窗口，保留默认路径、取消语义和足够的选择时间；本地文件“在 Finder 中显示”先由原版 Core 做人类用户与目录权限检查，再交给宿主执行，支持临时目录和外置卷。浏览器独立模式和远端文件限制保持原版行为。
- Role Board 启动失败不阻塞其它看板；增加显式重新连接入口。修复长数据目录导致 Aexus Unix socket 无法建立的问题。
- 旧版三个顶层入口的顺序会补入 Role Board；旧 Company/Messages/Plan 子页状态迁移到独立 Role Board。原有 `agentboard.*` 内部接口和 `AgentBoard/Aexus` 数据目录保留兼容。

## 当前已运行的验收

- CloudHosts Node 测试：上一版完整基线 211 项通过；当前工作组改动只执行构建与相关检查，不再启动批量真实模型测试。最新候选包内的 Role Board WebKit 和四引擎选择 WebKit 各 13 项通过，原版 Aexus 业务浏览器验收通过。
- 在 bupt208、实体 DJF-Windows 分别同时启动四种引擎的真实 SSH 验收，八条路径全部通过；覆盖原版 TUI、工具文件效果、原生会话恢复，以及 Cline 检查点与 Core 崩溃恢复。模型均为隔离的确定性夹具，此轮不代表真实模型服务已验收。
- 原版 Aexus Messages Core、Plan Core：通过，包含权限、消息历史、计划状态、重复规则、保存视图和重启恢复；使用确定性引擎夹具。
- 此前插件业务测试结果属于旧版本；当前版本已移除插件分发。
- Cline/Pi 共享原生配置：实际 CLI 协议连接本机模型夹具，模型、密钥、模型目录、Pi thinking 读取一致，原生配置文件内容未改写。
- 同主机 Codex 不再强制覆盖原生 sandbox/approval 配置；实体 Windows 的原生 full-access 配置能够正确用于命令执行。跨主机角色仍遵循创建时明确选择的权限。原生 `/new`、`/fork` 更新当前恢复身份，保留之前的原生历史；断线重连不会切到辅助标题线程。真实 TUI、完整 fork 历史恢复和不增加模型任务的验证通过。
- Pi 使用原生 `session_start` 生命周期事件记录当前 ID，覆盖原生 `/new` 后的精确重连，不输出模型消息或修改原生配置。与 Claude 共用小型私有元数据读写函数，保持各引擎状态和历史独立。
- Codex TUI 与 app-server 均运行在实际引擎来源主机，避免 Mac TUI 解析 Windows 路径失败。远端 TUI 通过私有 SSH 反向转发连接认证桥，令牌经权限为 600 的一次性文件交接，原生 CLI 启动后删除；没有出现在命令参数中。真实 Linux/Windows 同主机 TUI 及空会话引擎重启通过。
- Claude 用原生生命周期 Hook 保存精确会话 ID、是否已有输入及 transcript 路径，覆盖首次空会话和 `/clear` 后恢复。Hook 采用 exec 参数形式，不经过跨机 Shell 前缀，不输出模型内容；Linux/Windows 的清空、断开与恢复均通过。
- 原版 Codex 产品路径：30 次关闭/打开视图和并发 attach 复用同一 TUI；原始任务字节不改写；Ctrl+C 后恢复同一线程和历史。
- 原版 Pi TUI：真实本机 CLI 启动、停止、同一会话标识恢复；不发送模型请求。Mac Pi → bupt208 和实体 DJF-Windows 已通过真实 SSH 与产品创建的原版 TUI：原生读写、编辑、命令、目录、文件查找、内容搜索、绝对路径、目标用户 home 路径、长输出文件回读、同一原生历史恢复。模型使用本机确定性夹具；共享 provider/model/tool 配置保持一致，Pi 自身记录正常的 changelog 版本元数据。
- Pi 私有执行通道：实时输出、无默认超时、指定超时、并发命令独立取消、文件连接重建验证通过；断线操作不自动重放。命令与文件操作通过既有 SSH Workspace 传输，不增加模型工具或路由提示词；Mac 源目录为稳定的空控制目录，保持原生会话存储位置。跨机模式显式关闭来源主机的扩展、skills、context files 和 prompt templates 自动加载，使用原生工具 schema/renderer 与共享认证/模型配置。
- 原版 Cline TUI：在独立原生配置下真实输入任务，收到本机模型夹具的回复，直接核对原生存储中会话 ID 和历史，再停止/恢复；恢复不自动发送模型请求。
- Mac Cline → bupt208 和实体 DJF-Windows：已接入产品创建流程。原版 Mac TUI 连接本机原生 Core/Hub，远端只调用已安装 Cline SDK 的原生执行器；真实 SSH 验证读写、编辑、搜索、命令、取消、断开后的进程清理、同一原生历史恢复。强制杀死测试 Core 后，TUI 随之关闭，重新点击恢复后仍能在原 ID 中继续任务；不回退到本机工具。
- Mac Claude → bupt208 和实体 DJF-Windows：已接入产品创建流程并通过原版 TUI 验收。本机仍运行原版 Claude 模型循环；远端通过官方 mods 的 `$.tool.call` 调用原版工具，保留原生结果、编辑差异和文件修改检测。执行辅助进程不运行主模型循环；启动保护在模块附着后恢复目标主机的原生环境，并移除私有传输变量。实测子命令继承的服务地址和密钥与目标原生配置一致，取消正在执行的命令后不再写入文件。模型请求中保留源引擎原生指令，仅替换工作环境事实及原生记忆目录，不添加路由提示词。
- Cline 跨机检查点：由原生 Core 记录，Git 对象和工作目录位于目标主机。复用原生恢复服务的工作目录回调和历史分叉逻辑；Linux、Windows 均实测未跟踪文件保留、目标目录恢复、恢复后精确分叉重连、发生会话保存失败后还原文件与暂存区、拒绝跨越后续提交。快照使用私有索引，不改用户暂存区；临时索引用完即清理。
- 实体 DJF-Windows 补齐官方 Node 24.16.0 和 Cline 3.0.71 / SDK 0.0.93；Node 压缩包与官方 SHA256 一致。保留 Restricted 执行策略，命令解析选择原生 `.cmd/.exe`；仅备份移动 npm 生成且被策略阻止的 Cline `.ps1` 启动器。原 Codex、Claude 和 VS Code 设置内容哈希不变。私有执行器源码改走 SSH stdin，避免 Windows 命令行长度限制；取消 Claude 执行器会结束其自有进程树。
- Claude 原生交互补测：修复 `@文件` 只查 Mac 文件的问题，保留原生附件格式与目标 Read 的编辑状态；用原生 Shell 前缀入口路由绕过工具事件的 `!` 输入。Linux 和 Windows 都验证命令只在目标目录产生文件，Mac 控制目录没有该文件。来源依据官方 mods 声明、实际安装版本与原生 CLI 实测；原生扩展等分支未全面覆盖；后台 Shell 及 TaskStop 已在 Linux/Windows 验证。
- Mac Claude CLI 从 2.1.233 升级为官方 2.1.299，以使用原生 mods 接口。旧包保存在 `~/.local/share/cloud-hosts/native-backups/claude-code-2.1.233`；升级前后 `~/.claude/settings.json` 和 VS Code 用户设置的内容哈希一致；随后使用未改动的原生配置向真实 DeepSeek 发起一次无工具短请求，`deepseek-flash` 正确返回指定文本。仅为 CloudHosts 自己生成的控制目录登记原生信任，首次修改前备份原生偏好文件；没有改变用户项目的信任记录。
- Mac Codex → bupt208 Linux、物理 DJF-Windows：真实 SSH + 原生 exec-server，在各自临时目录写入并读回校验文件，原版 TUI 连接同一线程；模型请求使用本机确定性 Responses 夹具，未使用付费模型。未改变两台主机的模型配置。
- 原生 macOS WebKit：实际加载候选应用包的后端和页面；拆分基线 11 项通过，新增 Single Host 独立子页面后源码 13 项通过；独立 Agent Board、原版 Aexus 握手、三个子页面、相同客户端、切回原生看板及无 JS 异常。
- 候选 macOS 应用包：原生 PTY smoke、内容指纹、codesign 验证通过；用包内 Node/Core/Web 完成原版员工创建、消息回复、暂停周期计划创建、视图切换与状态恢复。此前插件页面验收不再作为当前版本功能。

真实浏览器与原生 WebKit 的证据位于 `artifacts/role-board-acceptance/`。代码与包的验证不能当作生产安装或真实付费模型验收。

## 仍未完成

1. 四种引擎在 Linux 及实体 Windows 参考主机上的核心原生路由已验证；扩展生态和其他原生交互分支尚未完整覆盖。Claude 的 `@文件` 和直接 `!` Shell 输入已在 Linux/Windows 验证；附件内容在目标主机经过原生 Read 后，由 Mac 原版 CLI 渲染，模型看到目标路径，原生 TUI 的附件行仍显示私有暂存路径。当前不能宣称全部原生操作均已完成。不得将普通 SSH 原生 CLI 或带 Tunnel/MCP 提示词的方式标为 Mac 本地透明执行。
   - `src/native-executor.cjs` 仅承载经过 SSH 的私有执行器消息；Cline 与 Claude 保留各自适配模块。源引擎配置和历史仍在原生目录，不复制到 CloudHosts。
   - 创建菜单依据各引擎的实际源/目标兼容性显示，支持的引擎可独立选择；不再把 Pi/Cline/Claude 路由说明误写为 Codex。检查并行执行，真正创建时只复核所选引擎。
   - Cline 原生 SDK 关闭 Hub 时偶有历史搜索索引收尾告警，仍需核查；真实恢复测试没有发现历史丢失。

2. 引擎安装和当前配置阶段已完成：14 台远程主机及 Mac 的四种原生 CLI 分别发起真实短请求，60 项全部通过（`artifacts/agent-board-acceptance/native-config-matrix.json`）。每台主机已创建四种引擎的验收会话。后续原生历史审计发现部分旧测试过早接受工具输出；更严格的复测已修正多数记录，GPU-server 的 Pi 最后一次受 DeepSeek 503 影响。现按用户要求停止批量实测，不能以旧汇总声称所有路径完整通过；各主机历史进度和截图以 `artifacts/agent-board-acceptance/*-mac.json` 为准。Windows 的 VS Code 和 Codex/Claude/Cline 扩展均已安装；6 台 Windows 的 Codex/Claude 插件自带原生二进制已分别使用共享配置完成真实请求；Cline 已通过实际 VS Code Extension Host 的新会话验收。
   - 新完成 cloud-server、kali-Linux1/2、ubuntu-target2/3/4 的用户级安装：Node 24.16.0、Codex 0.162.1、Claude 2.1.299、Pi 1.2.0、Cline 3.0.71；安装器未写模型配置。Pi 的现行官方包名为 `@earendil-works/pi-coding-agent`。原文件备份在各主机 `~/.local/share/cloud-hosts/native-backups/setup-*`。
   - 组内中转站实际目录返回 20 个条目。对其中 15 个非图片模型，用隔离配置的原版 Codex CLI 各发起一次真实短请求：`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`、`gpt-6.1-sol`、`gpt-6-sol`、`gpt-6-luna`、`gpt-6-astra`、`codex-auto-review` 均返回 OK；`gpt-6`、`gpt-5.6`、`gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.3-codex-spark`、`gpt-5.2` 返回中转站 upstream_error。不能声称目录中全部模型可用，也不能将其误报为本机配置错误。5 个图片模型未作为 Coding Agent 主模型测试。
   - 已下载并核对官方 SHA256：Windows Node 24.16.0、PortableGit 2.56.0.2、VS Code User Setup 1.141.2，已部署到 5 台 Windows 客机，并验证签名、版本及扩展清单。未更改 Windows 执行策略；下载的证书链错误通过传输 Mac 上已按官方哈希验证的安装包解决，未关闭 TLS 验证。
3. 2026-10-14 用户说明 VM Lab 的 Agent 正在改动虚拟机，要求先处理前面任务。虚拟机登记/独立化、客机网络及批量配置验收暂后置；不改 VM Lab 源码或建立应用依赖。2026-10-15 用户进一步授权：先完成前面的工作，再等待该 Agent 明确完工，然后自行继续后续主机配置与测试。已核对本机 Codex 会话记录 `01a10ea6-e04e-7bb3-98fc-6446e5819356`：2026-10-15 01:30:32（北京时间）记录了明确最终交付及 `task_complete`，报告安装 2.0.0。VS Code 面板曾停留在旧的 Stop 画面；以该完成事件确认交接，现已开始后续工作。
4. 已盘点现有 14 台远程主机、VM Lab 的 11 台 BUPT 客机，均有可访问的 SSH 记录；本地 Apple VM 后端没有发现已部署实例数据。重新核对清单仍为 11 台，已存在于 14 条云主机记录中，不创建重复记录。14 台主机均通过 SSH 盘点，并能访问 DeepSeek 与组内中转站（匿名请求分别得到 401/403，尚不等于模型鉴权验收）。更新后 11 台客机均已通过原有 API 删除 `vm` 关联，保留原主机 ID 和 SSH 地址，没有重复登记。已备份主机清单；未改客机网络。
5. 用户后置虚拟机工作前已启动的安装中，ubuntu-target1 已完成 Node 24.16.0、Codex 0.162.1、Claude Code 2.1.299、Pi 1.2.0、Cline 3.0.71 安装；当时未写入模型凭据。交接后已完成剩余安装和配置；早先 BUPT-Windows 的临时 Node 上传失败也已通过新的校验传输完成。临时 SSH 出网通道已关闭。本阶段已将所有新增配置接入原生目录；两台参考主机的 Codex/Claude 文件哈希保持不变，其 DeepSeek key 与 Mac 一致。5 台 Windows 客机清除了抢占新版命令的旧 Codex PATH 项，备份保留。Pi 在 6 台 Windows 上使用原生 Shell 执行器写入并读回文件，客机的 Git Bash 路径写入 Pi 自己的设置；实体机原路径有效，未修改。BUPT-Windows 的 Claude 自更新缺失平台依赖后，已重新完成官方 2.1.300 包的安装并验证，原配置哈希不变。为原生 Pi 搜索适配，仅在 bupt208 和实体 DJF-Windows 的标准 Pi 缓存目录中安装并校验了官方 ripgrep 15.2.0；未改动这两台参考主机的模型配置、系统 PATH 或客机网络。
   - Cline 4.1.24 的 VS Code 端仍支持旧 `secrets.json` 覆盖。已备份并移除 15 个用户环境中的旧 DeepSeek key 覆盖，保留其他凭据，设置原生 Plan/Act 默认选择，使凭据回落到同一 `settings/providers.json`。Mac 已通过真实 VS Code Extension Host 调用原版 Cline 扩展，使用共享配置完成 DeepSeek 请求；原生记录的来源为 vscode，模型为 deepseek-flash，配置内容哈希未变。6 台 Windows（5 台客机及实体 DJF-Windows）也已通过同样的真实扩展验收，合计 7 项；证据为 `artifacts/agent-board-acceptance/cline-vscode-config.json`。已有面板的内存缓存需重新载入。
6. `/Applications/云主机.app` 已安全更新为 2.10.0，旧包与用户数据已备份；原有空 Cline 会话及升级时仍活动的交互终端已恢复，未提交的 GPU Shell 草稿保留且未执行。安装包指纹与运行后端一致。Windows CloudHosts 本机运行和打包验收未完成；这不影响本次 Mac CloudHosts 管理 Windows 主机的范围。

## 边界与复现

`ui/agent-groups.js` 仅管理主机工作组，`ui/agent-board.js` 只处理原生 Coding Agent；`ui/role-board.js` 和 `ui/aexus-embed.js` 只处理 Role Board。Aexus 的业务操作始终由其原始鉴权 Core 执行。CloudHosts 的主机登记是两个看板共享的基础服务，不共享员工与原生 Coding Agent 身份。

```
npm test
node tests/role-board-live-ui.cjs
sh tests/run-role-board-webkit.sh
node tests/agent-native-fixture.cjs
node tests/agent-codex-tui-product-real.cjs
node tests/agent-pi-local-real.cjs
node tests/agent-pi-route-native.cjs
node tests/agent-pi-route-native.cjs gpu --tui
node tests/agent-pi-route-native.cjs windows --tui
node tests/agent-cline-native-real.cjs
node tests/agent-cline-route-native.cjs
node tests/agent-cline-route-native.cjs windows
node tests/agent-cline-checkpoint-product.cjs
node tests/agent-cline-checkpoint-product.cjs windows
node tests/agent-claude-executor-ssh.cjs
node tests/agent-claude-route-product.cjs
node tests/agent-claude-route-product.cjs windows
node AgentBoard/Aexus/test/embedded-core-test.mjs
```

真实 SSH 验收使用 `tests/agent-codex-tui-crosshost-live.cjs gpu|windows`，需要明确授权及已有 SSH 访问，测试仅操作自己创建的临时目录。
