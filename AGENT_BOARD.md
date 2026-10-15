# Agent Board 与 Role Board

当前拆分实现、验证证据及未完成项见 [拆分验收](docs/AGENT_ROLE_SPLIT.md)。Agent Board 按工作组组织主机和原生 Coding Agent；Company、Messages、Plan 位于独立 Role Board。下面的版本记录保留用于兼容性追溯。

## 2.10.2 Role Board 焦点与协作验收

Role Board 同步宿主窗口的 focus / blur，未读判定同时遵循窗口焦点和消息真实可见性。窗口失去焦点时不会继续按前台阅读处理。修复 Role Pi 将内置服务商误判为缺少自定义模型定义的问题，直接沿用原生 Pi 的内置 DeepSeek、模型选择和密钥，并正确接受原生设置中已开启的推理级别。新增安装包级合作关系、群聊、计划、刷新与 Core 重启恢复的验收流程，以及使用真实 DeepSeek 的角色委派、群内发布和计划执行检查；测试使用隔离的角色与聊天数据。

## 2.10.1 工作组与插件移除

Agent Board 与终端看板一样，提供工作组的新建、切换、重命名和移除；各组独立选择与排序主机。移除工作组或隐藏主机不停止、不删除任何原生会话。旧看板主机自动迁入默认工作组。页面不再显示 Project、Workspace、目录登记或目录筛选。旧目录 API 和数据保留兼容，不参与看板展示。

内嵌 Role Board 不再加载或打包 Aexus 的 Cloud Hosts、Mini Notion、Margin Reader 三个插件，Company、Messages、Plan 保持独立。Single Host 的 Agent 与 Role 子页面仍完全分离。

## 2.10.0 原生会话恢复

Agent Board 和 Single Host 的 Agent 子页仅管理原生会话；Role Board 及独立 Role 子页保留原版 Aexus 三个视图。Codex 原生 `/new`、`/fork`，Claude `/clear` 和 Pi `/new` 后均跟随当前原生会话 ID；普通关闭、断线及重新打开仍恢复同一当前历史，不自动发送任务。原生历史不复制到 Role Board。Cline 复用本机原生 Hub 和配置，跨机执行适配器关闭后可恢复原 ID。

# CloudHosts Agent 看板

## 展示规则

界面可通过顶部 `English / 中文` 切换；默认英文，选择持久保存在当前机器的工作区配置。已打开的 Agent 会话与发送消息在切换语言时不重建、不改写。四种 Agent 原生 SVG 均保持可见边缘留白，Pi 的原图画布空白已裁切，窄列中图标保持固定尺寸，卡片内部有独立横向滚动，杜绝图标被截断。


参考 Aexus 的 Company / Team / Employee 视图，将 Team 映射为**工作主机**、Employee 映射为**Coding Agent 会话**，沿用云主机终端及文件看板的卡片风格。整页仅上下滚动；每排固定 1–6 个等宽主机卡片，列数、主机顺序独立保存。每台工作主机可以同时容纳多个 Agent，会话可重命名、停止、重启和移除。

2.9.2 起采用 Aexus Company 风格的紧凑会话矩形：一张卡片对应一个独立会话，显示 Codex、Claude Code、Cline、Pi 的原生引擎 SVG 图标、会话名称、运行状态和引擎启动来源。每个主机框独立拥有水平/垂直滚动区域；用户可指定每行 1–6 个会话，内容多时横向与纵向滚动。角色区高度 180–600 px，拖动下边缘或使用键盘方向键可调整，所有主机保持一致。顶部「单机／终端看板／文件看板／Agent 看板」按钮也支持拖动排序（FLIP 动画），Alt+左右方向键可键盘排序；`hosts.workspace.viewOrder` 持久保存顺序。窄终端在同机、终端看板和 Agent 会话中提供横向滚动条，保留原生 PTY 的文本列宽。

**工作主机**是 Agent 实际执行文件操作及命令的位置，也是其卡片所在位置。**引擎来源主机**是启动引擎 CLI 并持有其认证/配置的主机；二者独立。每个会话卡片展示引擎、会话名称、工作目录、运行状态与来源：Core 本机用实际 macOS/Windows/Linux 系统图标及“本地主机”标识，远端启动的引擎用云朵及其登记主机名称。工作主机卡片标题显示目标系统图标。改变主机显示名后看板以最新登记信息为准。

打开看板仅列出既有角色，不主动启动 CLI、探测引擎或生成模型请求。点击角色才连接其会话视图；离开看板断开浏览器视图，后台仍在运行的会话保持运行。Agent 看板、终端看板和文件看板的数据及布局独立。

## 自动恢复、固定槽位交换与本地主机（2.9.5）

左侧主机列表始终把正在运行 CloudHosts 的本机（Mac / Windows）作为首项：本机终端、文件浏览、主机信息直接使用 Core 本机运行环境，无需绕经 SSH。本机不可误删；单机页面新增 Coding Agents 预览与独立 Agent 页签，仅显示**实际工作在所选主机上的会话**，无论引擎 CLI 实际启动于 Mac 或云主机。预览每 5 秒更新状态，不会打断鼠标聚焦。

Agent 卡片从自由坐标改成**有序槽位**：拖动角色 A 到角色 B 会交换两个槽位并播放 FLIP 动画；Alt+方向键可交换相邻槽位，每个主机的 `agentBoard.roleOrder` 独立保存，并保留画布二维滚动及 `roleOffsets`。没有任意绝对坐标功能。右侧 Agent 竖向滑轨是可抓握的实体滚动控件：鼠标移上滑块显示 `grab` 手形，拖动过程中 `grabbing`，支持点击滑轨、键盘上下翻页。

PTY Agent 收到 Ctrl+C、CLI 退出或后台服务重启后，用户再次点击会话卡片会触发 `hosts.agent-activate`：后端检查进程是否仍在，若已退出则复用原角色 ID / 工作主机、优先调用原生恢复命令（Claude Code `--resume <session UUID>`、Pi `--session-id <UUID>`、Codex TUI `resume --last`，跨主机 Codex app-server 通过原生线程恢复）。若原生恢复进程立即退出，会自动尝试重新启动一次；确认两次均无法拉起时，只删除这个无效**角色显示记录**，保留账号、项目目录和底层引擎历史文件；无需用户点 Restart。打开角色不发送任务、不向模型添加前置提示词。操作“停止会话”后不会立刻自动重启；用户再次点击角色才恢复。 如果正在查看的原生终端被 Ctrl+C 终止，直接点击终端底部「已退出 · 点击恢复」状态，也会自动重新拉起；整个过程无需手动 Restart。 2.9.6 追加了独立的 Windows ConPTY 原生 Ctrl+C、会话 ID 恢复、重复点击不重复启动的实体机测试，以及单机预览中的启动源位置与状态标签。 同时对 `.exe` 原生入口（直接 ConPTY）与 `.cmd` 包装入口（PowerShell 调用）分别执行真实 ConPTY Ctrl+C、重启同一 session ID 的实体机测试，均不产生模型消息。

## 精确 Codex 原生线程与原生 TUI（2.9.8）

Codex 角色固定绑定唯一 `threadId`。再次点击、Ctrl+C 关闭 TUI 后重新打开、后台中断后的恢复，都只允许 `thread/resume` / `codex resume <exact UUID>`，绝不使用 `resume --last`，也不能用其他线程或全新空线程代替旧 ID。原始 rollout 缺失时保持错误与线程 ID，提示无法精确恢复；认证 token 刷新失败时保留角色、原线程、工作目录与启动来源，待来源主机的 Codex 凭据修复后再次点击恢复。不会因为临时认证故障删除会话，也不自动发送模型消息。

Codex 在界面中直接展示 **官方 Codex CLI 原生 TUI**，通过受控、只服务当前绑定线程的私有 app-server 桥接连接；不使用自制对话框替代 CLI，不向 prompt 注入路由信息。新角色由原生 TUI 首次创建线程，取得唯一 ID 后持久保存；后续不允许 fork、开始其它线程或切换会话。TUI 关闭再打开时，线程历史仍然是原始 ID。所有 Agent 小卡片都有 170×140px 固定尺寸，错误只显示单行省略号，不影响所在主机的布局，也不会出现旧线程回退提示条。功能通过原生 Codex TUI 实机、Mac→Linux 与 Mac→Windows SSH、token 失败保留会话及原生 WebKit 70 项 Agent 交互测试。

## 2.9.10–2.9.11：会话连接可靠性、原生审批和受限路由

- 一个 Agent 的 **持久定义** 保存源引擎主机、账号、`CODEX_HOME`、精确 `threadId`、目标工作主机及规范目录。`terminalId`、TUI 挂接状态和握手代次仅属于当前运行实例。展示用的 `view()` 始终返回副本，启动/挂接只写真实 `records`。
- 在弹窗关闭后，原 TUI PTY 和 app-server 继续存在；重新打开只重建 xterm/WebSocket 订阅。同一角色的 `agent-tui` 并发调用共享启动 Promise，并先确认既有终端与 **已经通过身份校验的原生 TUI 桥接连接**，绝不重复启动已连接的原生 TUI。异常场景的 401（错误令牌）、403（来源/路径违规）、409（另一个 TUI 占用）、503（服务关闭）分开诊断；日志仅记录角色 ID、代次、原因、连接数及时间，不记录令牌。仅为停止或失效的 TUI 重建显示进程，不重建正确运行的线程。
- 官方 Codex TUI 通过私有本地桥双向处理 JSON-RPC，包括 server→client 审批请求 `id+method` 和 client→server 回应 `{id,result}`。请求/响应 ID 独立映射，审批不会自动跳过；TUI 在 `thread/start` 返回前关闭时，线程创建事务仍等待迟到响应，保留唯一线程 ID。
- 默认 **引擎与文件/命令同主机**：云端 Codex 在该云主机直接运行原生 app-server，绝不建立绕回 Mac 的 exec-server。受限高级模式只允许 **控制端本机 Codex → 已登记云主机**，先检查本机 Codex 版本、app-server 接口与目标 exec-server 能力。云主机 A→B、A→Mac 的新建入口关闭，但历史角色保留原启动/目标主机及精确线程，不暗中迁移。
- 未找到旧 rollout、账户失效、临时 SSH/网络断线均保留已存在角色和精确原生 ID；修复环境或重新连接后可继续。没有得到明确确认的用户任务绝不自动重发。TUI 令牌经一次性 broker 配置传输，broker 读取后立即删除磁盘文件，只有运行中的 CLI 子进程持有环境变量，不能为消除 401 放开桥鉴权。
- `Within host columns` 已移除。主机内容区使用 `auto-fill minmax(min(100%,176px),1fr)` 自适应排版，Agent 卡片宽不超过 220px；仅保存相对 ID 顺序。按主机面板实际宽度计算键盘上下交换步长；窗口大小变化不销毁或重连 Agent，滚动条随内容更新。
- Mac/Windows 使用**相同 `buildId`**（按真实 backend + UI 文件的 SHA-256 生成），安装和后台启动均验证内容指纹。`cloud-hosts status` 返回版本、指纹与 `codeMatches`，防止“版本字符串相同但运行旧代码”。

验收以纯 CLI 和无窗口的原生 WebKit/ConPTY 为主。Mac 真实 Codex 经过 30 次关闭/重开及 30 次并发挂接，保证只存在一个 TUI 进程，恢复原 `threadId` 与历史，未自动发送任务；审批双向映射、窗口关闭后的迟到创建结果及 token 失败均有隔离测试。Mac→Linux、Mac→Windows 受限路由使用隔离模型响应服务验证。远端断开 Mac 后持续运行 **尚需部署远端独立进程托管**（Linux tmux/systemd，Windows 进程服务），当前通过 SSH 启动的后台进程不承诺睡眠后持续；不应向用户显示长期持续保障。

## 纯 CLI / 图标与单击恢复验收（2.9.7）

所有看板操作均走 CloudHosts 原生 JSON-RPC/CLI。包括查看本机（`list`/`get local`）、按工作主机列出会话（`agent-list local`）、查询已排序会话（`agent-order local`）、交换同主机上的两个会话位置（`agent-swap local --first ROLE_ID --second ROLE_ID`）、点击即恢复对应进程（`agent-activate local --session ROLE_ID`）、停止和移除（`agent-close`/`agent-remove`），以及工作区列数、语言、滚动位置（`hosts.workspace --data @patch.json`）。交换操作仅写入对应工作主机的 `agentBoard.roleOrder`，不调用模型、不移动真实工作主机或引擎启动源。UI 的刷新按钮也会重新读取 CLI 修改的顺序，按原生 WebKit 测试验证。

修正全局 OS 图标固定尺寸与 Agent 来源小图标容器的冲突：`macOS` 的 Apple SVG 被全局设置为 22×24px，过去在 16px 来源徽标中可能溢出或裁切。现在来源区域为带安全边距的 22px 图标容器，所有 OS SVG 的 width/height 均在容器内保持 100% contain。原生 WebKit 在 Mac、云端启动来源及窄窗口中做了图片盒边界检查。右侧竖向滑轨和滑块均使用 `grab` 手形，拖动中为 `grabbing`。

Ctrl+C 结束 CLI 后点击已有 Agent 卡片时，先读取后端最新的进程状态，再自动调用 `agent-activate`。这能覆盖“进程刚退出、浏览器尚未等到 5 秒自动刷新”的竞争场景；单击即可恢复，正常仍在运行的进程不会重启。此操作没有前置提示词或模型请求。Mac 的真实 Pi TUI Ctrl+C/恢复、隔离 CLI 测试和 Windows 原生 ConPTY 的 .exe/.cmd 测试均为交付必测项。Codex 的每个会话必须绑定精确线程 UUID；缺失此身份时保留角色并提示核对，**禁止**调用 `resume --last` 或恢复其它会话。

```sh
cloud-hosts list
cloud-hosts agent-list local
cloud-hosts agent-order local
cloud-hosts agent-swap local --first ROLE_ID_1 --second ROLE_ID_2
cloud-hosts agent-activate local --session ROLE_ID_1
cloud-hosts hosts.workspace --data @layout-patch.json
```

## 2.9.4 历史说明

以下为历史版本行为，若与 2.9.8+ 精确线程恢复规则冲突，以较新规则为准，禁止 `--last` 或丢失 rollout 时创建替代线程。

2.9.4 的自由坐标功能已在 2.9.5 中更换为上方描述的有序槽位，旧版本保存的 rolePositions 仍可读取，但不参与新的会话布局。

如果 Codex 原线程恢复时报 `no rollout found for thread id`，重启只在这一类明确的「旧线程记录不存在」错误时回退到空的原生线程；保留原 ID 和错误作为恢复记录，不自动发送模型任务。其他认证、SSH 和权限错误不自动回退；在卡片和会话窗口中显示具体报错。

文件看板、单机文件页面中路径输入框点击后光标位于末尾；输入 `/`（Windows 支持 `\`）后向选定主机请求真实目录列表，显示可用子目录候选，可用方向键 / Enter / Tab 选择；眼睛图标控制隐藏文件显示，涵盖 Unix `.` 文件及 Windows Hidden 属性。文件看板按主机保存眼睛状态，单机文件按主机单独记忆。所有候选来自 SSH 目录读取，显示时不会执行文件名、修改远端文件或者自动启动 Agent。

## 执行方式与限制

- **默认同机模式**：引擎和工作目录属于同一主机。Codex 使用该主机直接运行的原生 app-server 与官方 TUI，无额外 exec-server 路由；Claude Code、Cline、Pi 使用同主机原生 CLI/PTY。Mac 本机或已登记 SSH 云主机都可作为该主机。
- **受限远程模式（仅控制端本机 Codex）**：当前 Core 本机启动的 Codex app-server，通过受保护的执行通道连接登记云主机上的兼容 Codex exec-server。正常任务不加入路由提示词；新建的角色只能以 Core 本机为来源。历史跨云角色保留原身份，兼容恢复，但新建入口不允许任意云主机互相路由。
- **Claude Code、Cline、Pi 跨主机**：目前没有经过验证、完全不依赖模型提示词或替代工具列表的原生适配器，创建界面会禁用这些组合，不会悄悄退回来源主机执行。不可将 Aexus 的提示词 / MCP 工具代理方案直接称为透明原生执行。

跨主机模式需要两个主机上相容的 Codex CLI，远端还需要 SSH 连接、端口转发权限及可访问的绝对工作目录。不安装引擎、不绕过原生认证；`完整权限` 会以目标主机账号权限运行，须谨慎启用。Agent 来源与工作目标只通过会话元数据进入看板，不自动添加到用户消息或模型上下文。关闭、权限变更仍需用户操作；再次点击已退出的 Agent 会话时原生引擎自动恢复，且不会自动发送模型任务。

服务重启时已保存的角色继续存在，但服务关闭会停止当前子进程；可恢复的原生会话在用户再次点击时自动拉起、尝试恢复线程，其他 CLI 由其对应原生恢复机制管理。后台会话执行、权限边界与模型计费仍取决于安装引擎及目标账号。

## 验证

```sh
npm run build
npm test
node tests/agent-native-fixture.cjs
# 以下四项是显式 opt-in 的真实 SSH 跨主机验证，需要已有 bupt208/DJF-Windows SSH 配置。
node tests/agent-crosshost-live.cjs gpu
node tests/agent-crosshost-live.cjs windows
node tests/agent-origin-live.cjs gpu --turn
node tests/agent-origin-live.cjs windows --turn
node tests/agent-remote-mesh-live.cjs gpu windows
node tests/agent-remote-mesh-live.cjs windows gpu
cat dist/ui/style.css dist/ui/agent-board.bundle.css > /tmp/cloudhosts-agent-webkit.css
swiftc -parse-as-library tests/agent-board-webkit.swift -framework AppKit -framework WebKit -o /tmp/cloudhosts-agent-webkit
/tmp/cloudhosts-agent-webkit dist/ui/agent-board.bundle.js tests/agent-board-webkit.js /tmp/cloudhosts-agent-webkit.css
```

`tests/agent-native-fixture.cjs` 使用真实安装的 Codex CLI 和隔离的本地模型响应服务，验证工具落点、创建会话不触发模型请求、无额外路由提示及线程恢复。WebKit 使用模拟主机与会话验证展示、固定列数、窗口交互及生命周期。

2026-10-12 已用真实 SSH 和两端真实 Codex 原生进程完成六方向执行测试：Mac 引擎 → GPU-server/Linux、DJF-Windows 工作主机；GPU-server/Linux、DJF-Windows 引擎 → Mac 工作主机；GPU-server/Linux 引擎 → DJF-Windows；DJF-Windows 引擎 → GPU-server/Linux。三台主机互为来源及目标的所有不同主机组合均成功在**指定的目标工作目录**执行原生命令，源主机测试目录无误写入，模型输入无路由提示词；模型供应端使用隔离的本地测试响应，未产生付费模型请求。Windows 真机也通过了原生 ConPTY、PTY 生命周期、远端 Agent CLI 探测和文件看板目录测试。仍需对真实付费模型任务、不同版本 Codex 的兼容性、权限策略及网络中断后的持久恢复开展额外验收；其他三种引擎跨主机仍未实现原生透明适配。

## 2.9.12 · 审批跨窗口恢复

原生 Codex TUI 关闭、WebSocket 短时断开时，尚未处理的 `item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/tool/requestUserInput` 保留在当前角色的私有 app-server 桥中，不发送默认接受/拒绝。再次挂接同一角色、同一原生线程后，用同一代理 ID 重放到当前唯一认证 TUI，TUI 的确认只向 app-server 原始请求 ID 转发一次。64 个待确认请求为硬上限；超限返回明确错误。完全停止引擎时桥接请求随运行实例结束。覆盖关闭视图前请求、视图关闭期间请求及重复回包的隔离测试；绝不在提示词中处理审批。

## 2.9.14 · 原生确认重连边界与 Windows 构建验收

真实 Codex 0.156.x CLI WebSocket 初始化先发送 `initialize`、再发送 `initialized`。断开视图后仍未确认的原生请求会保留原 JSON-RPC ID 与唯一绑定线程 ID；**新 TUI 必须完成 `initialized` 握手后，才重放审批**，避免发送到尚未准备好的客户端。客户端无论回应 `accept` 或 `decline` 都只回传一次原始服务器请求，绝不默认批准。已受理的 `turn/start` 在 TUI 断开后迟到回复时，仍准确持久化任务 ID 与原始用户文本；不会自动重发任务，也不会新建或猜测线程。

Windows 打包额外包含纯 Node 原生桥协议测试，在**独立 staged release** 使用打包的 Windows Node 和 ws 运行，不影响真实会话；失败禁止替换已安装应用。Mac、Windows 的版本、Build ID、打包文件和运行后台必须一致。

## 2.9.19 · Mac 引擎远程工作能力与 Origin 可点击选项

在 Mac 单机上使用 Codex 引擎、在指定云主机的项目目录工作，是合法的唯一跨主机新建模式。原生远程执行能力 `hosts.agent-capabilities` **必须逐层传递来源主机 ID 和目标主机 ID**：`core.dispatch → agent-sessions.capabilities → agent-hosts.capabilities`。此前 `core` 和 `agent-sessions` 两层均丢弃目标 ID，造成后端底层兼容性探测通过、但 GUI 收到 `routingVerified:false` 并禁止 Create & Connect。现已修复，校验协议后允许本机 Codex 原生 TUI 通过受限路由在 GPU-server、DJF-Windows 等云端项目工作，不注入提示词，不发送隐式模型任务。

Engine Origin 只列出两个**可点击**的来源：当前控制端 Mac（显示「Mac 本地」/「Local Mac」）与选定的工作主机。工作主机就是控制端时，**只列本机一个**。其它云主机不会作为灰色禁用项出现。若选择 Mac 来源跨主机，Coding Agent Engine 只列 Codex，创建按钮在实际目标 Codex exec-server 验证成功后启用；缺少协议/认证时明确说明原因，不伪造能力。若选择云主机本身作为引擎来源，则原生 CLI 与工作目录均运行于该云主机，选择器仅显示真正在该主机安装的引擎，未安装者不显示为不可点的灰色项。Mac 官方 Cline CLI 3.0.70 已安装在用户全局 npm 前缀，可通过 `~/.npm-global/bin/cline --version` 与 `hosts.agent-capabilities local` 验证；是否具备模型账号登录状态仍以原生 CLI 鉴权为准。

验收包括：Mac 原生 `agent-hosts.capabilities` 探测、`core.dispatch` 和 `agent-sessions` 双层传参隔离回归、屏幕外 WebKit 的 **真实可视化下拉菜单点击**，以及不提交模型任务的 Mac→Linux / Mac→Windows 真实原生 Codex 角色创建。所有本地能力和创建功能也可直接通过 `cloud-hosts agent-capabilities local --data @capability.json`、`cloud-hosts agent-open local --target-host HOST_ID --engine codex --directory REMOTE_ABSOLUTE_PATH` 调用。
