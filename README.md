# Aexus

Aexus 是统一管理原生 Coding Agent、协作角色与云主机的工作台。本项目由原 Cloud Hosts 演进而来，替代旧独立 Aexus 应用。

- **Single Host**：主机详情、终端、文件，以及相互独立的 Agent / Role 子页。
- **Hosts Board**：终端和文件看板。
- **Agent Board**：按工作组组织主机，各组独立保存主机排序与 1–6 列数，连接原生 Codex、Claude Code、Pi、Cline；支持主机本机引擎和 Mac 引擎跨主机执行。
- **Role Board**：Company、Messages、Plan；合作关系、群聊与计划均由独立的角色模块管理。

原 Aexus 的 Mini Notion、Margin Reader、Cloud Hosts 插件产品不再打包或加载；文档封面预览改由 Core 自身的预览 worker 独立渲染，不依赖 Margin Reader。主机管理与 VM Lab 软件独立。

当前源码版本 **2.12.6**（build 58，构建标识以仓库根 `release.json` 为唯一来源，精确 buildId/bundleHash 只在 ignored artifacts 的最终验收报告）。标准安装位置为 `/Applications/Aexus.app`；安装验证后只清理已核对 Bundle ID 的同产品旧 APP 包。2.12.6 将 Role Board Secretary 设为最高应用管理员，补齐三个视图的真实身份 API、跨会话/资产管理、全部职级 reasoning 与新建默认值；入口、权限和发布验证说明见 [2.12.6 交付范围](docs/RELEASE_2.12.6.md)。2.12.1 交付：Agent 与 Role 独立、工作组 1–6 列、Team 云端自动生成/绑定并保留父级、员工严格子目录、Secretary 创建与后续职位管理、角色/设置/对话等页面紧凑与对比度修正（看板与外壳保持原样、系统图标沿用原图标）、全云默认 Full 可配置，以及 OpenCode 作为第 5 个原生 CLI（Role/IDE 共享原生鉴权）；验收见 [2.12.1 发布验收](docs/RELEASE_2.12.1_ACCEPTANCE.md)。2.12.1 修复内嵌 Role Core 的 Python 传输入口（`agent_process.py` / `native_executor.py` / `terminal.py`）在无 `-B` 运行时会向已签名应用包内写入 `__pycache__` 字节码缓存、导致 `codesign --strict` 失效：三个入口现于导入 `transport` 前先 `sys.dont_write_bytecode = True`，并新增 `Modules/Tunnel/tests/test_no_bytecode.py`（含负对照）证明普通可写目录、无 `-B`/环境变量遮蔽下不再生成缓存。2.11.3 修复文件回收站元数据先于数据原子写入（metadata-before-move）：元数据写入失败不再产生无法恢复的孤儿，两份工作区后端（CloudHosts `Runtime/workspace_files.py` 与内嵌 Role Core `AgentBoard/Aexus/Modules/Tunnel/workspace_files.py`）同步修复，验收见 [2.11.3 发布验收](docs/RELEASE_2.11.3_ACCEPTANCE.md)。2.11.2 修复 Role Board 重新进入/刷新后的 `Invalid CSRF token`（会话 Cookie 现按 Core 实例与浏览器客户端分别命名，重新授权复用同一活动会话，不轮换 Cookie、不重放被拒写入），Company/Messages/Plan 切换改为单击直达、无需重试或再次点击；同时把图标外圈白边改为透明（现代 Assets.car + `CFBundleIconName` 优先加载，`Engine/App.swift` 仅在缺少该键时才回退旧版 icns）。macOS 应用沿用原 Aexus 图标。现有云主机数据仍沿用 `~/Library/Application Support/Toolbox/CloudHosts`，无需迁移凭据或会话；`cloud-hosts` 命令继续兼容，新的主命令为 `aexus`。验收证据见 [Agent / Role Board 拆分验收](docs/AGENT_ROLE_SPLIT.md)。

宣传海报、文案和可编辑源素材保存在 [Marketing](Marketing/README.md)，历史素材不能直接视为当前功能承诺。

```sh
npm ci
python3 build.py
# 生成 artifacts/Aexus.app；构建不代表安装，也不会修改用户数据。
```

## 使用

安装后使用 `~/.local/bin/aexus`，或进入项目执行 `node cli.cjs`。

```sh
cloud-hosts list
# File Board actions via the same CLI/RPC as GUI (JSON contains arguments.operation + arguments.args)
cloud-hosts files local --directory /absolute/workspace --operation workspace --data @file-action.json
cloud-hosts agent-list local
cloud-hosts agent-order local
cloud-hosts agent-swap local --first ROLE_A --second ROLE_B
cloud-hosts agent-activate local --session ROLE_A
cloud-hosts check --all
cloud-hosts exec GPU-server --command 'hostname; id -un'
cloud-hosts shell GPU-server
cloud-hosts terminal-open GPU-server
cloud-hosts terminal-read GPU-server --terminal TERMINAL_ID --cursor 0 --wait-ms 1000
cloud-hosts terminal-input GPU-server --terminal TERMINAL_ID --input $'pwd\r'
cloud-hosts terminal-resize GPU-server --terminal TERMINAL_ID --cols 120 --rows 32
cloud-hosts terminal-close GPU-server --terminal TERMINAL_ID
cloud-hosts files GPU-server --operation read_file --data '{"arguments":{"path":"/etc/hostname"}}'
cloud-hosts sync-vscode
cloud-hosts status
cloud-hosts stop
```

所有操作都选择登记主机；不存在远端目录时会失败，不会回退 Mac 执行。命令结果为 JSON；远端非零退出码也会成为 CLI 的非零退出码。旧 `hosts.* --data` 命令仍可使用。

## 数据与生命周期

数据位于 `~/Library/Application Support/Toolbox/CloudHosts`，由本软件独立保存配置、密钥信任记录与文件中转站。各主机以其实际用户目录为默认浏览起点。进入终端页自动打开首个会话，关闭窗口后继续保留后台会话。

窗口终端使用持久 WebSocket 同时传输按键、尺寸与输出；按键保持顺序，切换页面后已收到的输入仍写入原会话。PTY 处理短写与非阻塞写入，完整写入后确认；输入与输出均有有界队列和流控。键盘只经 xterm 的 `onData` 提交一次；构建时针对固定版本修补 WebKit / 豆包输入法的事件顺序，不额外模拟字符。SSH 认证期间保留输入。Windows 加载 PowerShell 配置及可用的 PSReadLine，支持历史和 Tab 补全。

终端标签与新建、结束、更多按钮位于同一行。进入主机时清理已退出记录；原选中终端失效时自动尝试新连接，失败后移除该标签，不循环重试。仅查看连接断开时恢复原会话，不终止仍运行的远端任务。常用画面最多缓存 4 个，回收后从保存的输出游标恢复，快照最多 20 个 / 8 MiB。支持搜索、分屏、选择复制、粘贴、链接及字体缩放。CLI 的 terminal-input/read 接口继续保留。

GPU 服务器的显示名与连接别名为 `GPU-server`；`bupt208` 保留兼容，未修改共享 Linux 系统主机名。

原有 14 个 SSH 入口已在 Mac 与实体 DJF-Windows 分别执行 hostname/whoami 验证，包括 GPU-server、11 台既有 VM、实体 Windows 与 cloud-server。Mac 当前无法直接连接实体 Windows，已通过 GPU-server 的 SSH 跳板恢复并验证。已移除不存在的临时实验机 lab-smoke01 登记；尚未开放的 SSH 入口不导出到 VS Code。

Windows 专业版虚拟机默认使用 RDP，经 SSH 通道连接，并填写明确的本地账号。实体 DJF-Windows 当前已核实为 Windows 11 专业版，支持 RDP。6 台已登记 Windows 均已核对远程桌面服务与 SSH 转发的 TLS/NLA 协商。VNC 连接认证使用 VNC 服务密码，Windows 账号在桌面系统登录画面中输入。

## 文件中转站

点击窗口右上角“文件中转站”或主机的“文件”页。左侧浏览远端目录，右侧是本机托管的文件中转站。

- 可以新建文件夹和文本文件，编辑内容、重命名、移动和删除；拖到文件夹可调整层级。
- 树形视图展示完整文件层级；大图标视图展示当前目录，图片、PDF 等提供系统缩略图。
- 拖入 Mac 文件或文件夹，或点击导入；远端文件夹可以整体存入中转站并继续传输。
- 将中转站文件拖到远端目录，或左侧主机名称；拖到主机名称时使用该主机的默认目录。也可勾选后“发送所选”。
- “下载”打开 Mac 保存位置选择窗口。原生窗口提供“↗”拖出手柄。
- 每次操作复制文件；发送、下载后，中转站副本继续保留，关闭应用后也保留。目标已有同名文件时不会覆盖。
- 二进制文件分块传输并校验 SHA-256，传输进度与失败原因在页面显示。支持取消。

```sh
cloud-hosts station list
cloud-hosts station import --path /absolute/path/photo.jpg
cloud-hosts station fetch GPU-server --directory /home/djf --path photo.jpg
cloud-hosts station send ITEM_ID 'BUPT Windows' --directory 'C:\Users\djf\Desktop'
cloud-hosts station export ITEM_ID --destination /Users/djf/Downloads
cloud-hosts station remove ITEM_ID
```

CLI fetch/send 等待传输完成并返回校验结果。中转站数据位于应用支持目录内的 station 子目录，由程序管理。

文件夹通过浏览器下载时会打包为 ZIP；Windows 原生窗口也保存为保留中文文件名和空目录的 ZIP，macOS 原生窗口仍支持直接保存完整目录。文件索引与数据位于中转站自己的 content 与 index.json 中。

## 构建与验证

`npm ci && npm run build && npm test`；`node tests/live.cjs` 验证真实持久终端、尺寸、Ctrl+C、跨主机隔离、Linux/Windows 文件接口与无本机回退。

终端字符输入统一由 xterm 原生处理，订阅一次 `onData` 后通过有序 WebSocket 发送；不再在自定义 keydown 中额外发送字符，避免与 macOS WebKit 的输入事件重复。终端标签优先复用已有画面并保留远端会话。

`npm run test:native` 验证原生 WebKit 输入；`artifacts/terminal-input-check dist/ui/terminal.bundle.js tests/terminal-lifecycle.js` 验证失效会话恢复；`npm run test:live` 使用自己的 SSH 会话验证 Linux / Windows 补全与持续输出下的输入完整性。

`python3 build.py` 构建独立云主机 App。项目根 `python3 build.py --tool cloud-hosts --install` 只选择云主机与 Toolbox 入口，不更新其他独立工具。安装前停止要更新的 App。

GUI 界面与终端 / noVNC 客户端迁移自 Aexus Cloud Hosts 1.2.2（Apache-2.0），独立 SSH transport 与终端缓冲迁移自 Aexus Core（GPL-3.0）。许可证保存在 LICENSE、Runtime/LICENSE-GPL-3.0 及构建 UI 的第三方许可证文件中。

## 多机看板与排序

顶部有四个工作台入口：“单机 / 终端看板 / Agent 看板 / 文件看板”。远程桌面从支持此功能的主机工作台进入。终端看板可以创建多个具名工作组，通过横向标签栏切换，各自保存主机组合、顺序和终端卡片尺寸；原有看板自动迁移到“默认工作组”。工作组设置支持重命名、每行最多 1–6 个等宽列、默认内容高度及 Windows、Linux、Ubuntu、Kali、Debian、macOS 的默认终端高度。同行使用较大高度；在卡片底部修改行高，或将鼠标移动到终端内容区域的下边界、卡片最下边框，出现上下调整光标后拖动（240–1000 px），会同步调整同行所有终端；宽度保持不变。底边分隔条也支持方向键调整。手动行高优先，重置整行后恢复操作系统默认值。小窗口自动减少列数。切换、移除工作组保留远端终端会话。

看板卡片仅展示终端，不再提供桌面切换下拉框；不同主机会话互不混用。卡片顶部显示操作系统矢量图标、连接地址，以及通过 SSH 实际读取的 CPU、内存、GPU 与网段。拖动卡片顶部可调整顺序。左侧主机列表也可拖动排序，两处均提供位移动画，并独立保存布局。Windows 图标使用正向蓝色四方格，Kali 使用白色官方龙纹和按用户参考图调整的鲜艳蓝色圆形底盘，资产来源见 UI/os/sources.json。

工作组 CLI 复用 `hosts.workspace --data`：读取不传 patch；创建使用 `{ "patch": { "createBoard": { "name": "科研" } } }`；切换使用 `activeBoard`；修改使用 `boardId` 与 `boardPatch`（name、hosts、sizes、columns、cardHeight、osHeights）；移除使用 `removeBoard`。旧 modes / span 字段仍可读取，界面统一使用终端和等宽列；board 字段继续对应当前工作组。

CLI 可使用 `hosts.reorder --data`、`hosts.workspace --data` 和 `hosts.inspect HOST` 对排序、看板布局及硬件信息执行同一套操作。App 图标为深蓝背景、扁长纯白云朵和位于云上方的电脑；原图和生成说明保存在 Assets。

### Agent 看板与文件看板

2.9.15：**文件看板现可直接管理文件。** 每个工作主机卡片都有“＋ 文件”“＋ 文件夹”和选中项操作；单击文件名打开 UTF-8 文本编辑器，文件夹单击展开。行尾「⋯」菜单支持重命名、在文件夹内新建、打开及移到工作目录回收站；键盘 Enter/F2/Delete 可打开、重命名、请求删除。编辑保存严格核对原文件 SHA-256，冲突保留草稿且提示，原子写入避免覆盖/截断；非 UTF-8、二进制、超过 4 MB 的文件只读提示，不改原字节。取消或切换视图遇未保存内容必须确认。Mac、Linux、Windows 的本机/SSH workspace RPC 统一执行；通过真实两台 SSH 主机的隔离临时目录及离屏 WebKit 验证。


2.9.11（包含 2.9.10 变更）：修复 Windows/macOS 生成的发行指纹在路径分隔符不同时不一致的问题，并已用实体 DJF-Windows 原生 Node 完成预安装 SHA-256 验证。

2.9.10：修复官方 Codex TUI 挂接真实实例登记、重复打开与抢占 401；补齐 JSON-RPC 双向原生审批与线程创建提交；按实际主机宽度自动排列 Agent；新建路由默认同机，仅控制端本机 Codex 支持受限远程工作；旧跨云会话保留。后台和安装包使用真实 SHA-256 内容指纹互相校验，`cloud-hosts status` 显示运行指纹。临时 TUI bearer 在读取后从磁盘立即销毁。详见 [AGENT_BOARD.md](AGENT_BOARD.md)。


2.9.8：Codex UI 使用原生 TUI，恢复时严守唯一 Codex 线程 ID，不允许 `resume --last`、静默新建空线程或替换旧线程；缺失原始 rollout 和临时认证失败都保留已登记的会话 ID / 项目路径 / 来源信息。单个 Agent 角色矩形固定 170×140px，报错截断为一行，不再撑大卡片或显示旧线程恢复提示；跨主机仍通过无提示词的原生执行路由。


2.9.7：本机 Single Host 的 Agent 子视图和左侧固定本地主机已经通过真实 WebKit 验收；修复进程 Ctrl+C 恰好早于看板轮询时的单击自动恢复竞态；修复 macOS 来源 SVG 在小来源栏中溢出/裁切；右侧滑轨手形光标可抓握。新增 `agent-order` 与 `agent-swap` 纯 CLI 动作，同工作主机双角色槽位互换并持久化，不执行 Agent 命令、不修改路由位置。界面刷新会同步读取 CLI 改动，详见 [AGENT_BOARD.md](AGENT_BOARD.md)。


2.9.6：完成单机 Agent 列表显示来源与状态的同步，修复正在查看原生 Agent 终端时按 Ctrl+C 退出后点击底部状态的单击自动恢复，并在 Windows 原生 ConPTY 通过 Ctrl+C/同会话恢复专项实体机测试。Agent 看板保留拖动交换顺序，删除旧的自由坐标 CSS 与隐藏平移按钮；Mac、Windows 应用统一升级并保留配置。 Windows 原生 `.exe` CLI 在 ConPTY 中直接启动，`.cmd` CLI 保持受控包装；双模式均以真实 Ctrl+C / 恢复专项测试验收。

2.9.5：Core 本机（macOS/Windows）固定显示在左侧主机列表，单机视图新增对应工作主机的 Coding Agents 预览与独立页签。本机原生终端、文件、系统信息均可直接使用。Agent 角色拖动改为固定槽位交换，顺序持久化，独立主机横纵滚动保留，右侧滑轨支持手形抓握。Ctrl+C 或 Agent 原生 CLI 退出后重新点击卡片会自动原生恢复（Claude Code、Pi、Codex），再尝试一次全新启动，失败才清理无效角色记录，保留历史与工作文件。 正在打开的 Agent 终端退出后，也可以直接点击底部状态再次恢复；单机概览中的 Agent 缩略卡片额外显示真实启动来源与运行状态，并遵循看板中的交换顺序。独立 Windows ConPTY 的 C# CLI 参数传递与 Unix PTY 也统一。更多参见 [AGENT_BOARD.md](AGENT_BOARD.md)。

2.9.4：Agent 看板升级成主机内自由二维画布，可拖动每个会话矩形、拖动画布、通过 Alt+方向键定位，并分别保存每个工作主机的画布坐标。修复原生 Codex 线程的丢失 rollout 错误：留存旧线程编号，创建空的新线程，不自动发送模型消息。文件看板和单机文件都支持路径自动补全（Windows 路径反斜杠兼容）、光标定位到末尾及眼睛显示/隐藏远端隐藏文件（包括 Windows 隐藏属性）。

2.9.3 起主界面正式支持 English / 中文，**初次启动默认英文**，顶部 Language 下拉切换后立即生效并保存到本机 `hosts.workspace.language`，会话、终端内容、主机名称、目录及用户输入保持原样。macOS / Windows 原生窗口标题也随语言切换。支持四个工作台、终端、文件、远程桌面和 Agent 会话的中英文文案。Agent 看板图标使用原生 Codex / Claude Code / Cline / Pi SVG，修正 Pi 的过大空白 viewBox 及其余三个 SVG 的裁剪边界；图标固定 31px，卡片预留完整显示空间。增加真 WebKit 语言往返、永久设置、用户名与 Agent 消息保护、四图标像素可视范围的回归测试。


2.9.2：四个工作台视图按钮支持拖动／Alt+左右方向键排序并持久保存；窄终端有可拖动的横向滚动条。Mac 本机 Pi 已按 Aexus 所用的 `@earendil-works/pi-coding-agent@0.87.1` 重新安装并完成离线原生 RPC 初始化检查；Pi 认证和模型配置由用户本机原有账户维护。Agent 角色卡片换成原生引擎 SVG 标志及紧凑会话矩形，主机内有独立的多行多列布局、双向滚动和高度拖动。详细说明见 [AGENT_BOARD.md](AGENT_BOARD.md)。

Agent 看板参考 Aexus Company 的“工作主机 → Coding Agent 角色”结构，每个主机框可展示多个不同来源的会话；只允许上下滚动，按用户指定的 **1–6 个固定列**显示，列数与主机排序按工作组独立保存。角色卡片显示引擎、会话名称、工作目录、状态及真实启动来源：本地启动显示本机操作系统图标与“本地主机 / Mac”等标识；远端启动显示云朵及其真实云主机名称。角色属于**工作目标主机**，不依赖引擎启动主机的位置。

同机 Agent 支持 Codex、Claude Code、Cline、Pi 原生 PTY。**跨主机透明执行支持 Codex、Claude Code、Cline、Pi 四种引擎**：Codex 由来源主机启动 app-server、工作目标主机的 exec-server 负责命令与文件操作；Claude 经官方 mods 的 `$.tool.call` 调用目标主机原生工具；Cline 由目标主机原生 SDK 执行；Pi 经既有 SSH Workspace 传输命令与文件操作。原始任务直接发送，不添加路由提示词，也不把来源工作目录混入模型请求；创建界面依据各引擎实际的源/目标兼容性显示。离开 Agent 看板不会结束后台会话；详见 [AGENT_BOARD.md](AGENT_BOARD.md) 的验证、权限和兼容性边界。

文件看板支持每行 1–6 个窗口，按主机管理多个独立的“文件 1 / 文件 2”目录标签；目录树按需展开、读取，布局独立于终端看板，跨页面和进程重启保存。桌面端使用统一风格下拉菜单。升级已有安装后必须运行新版后台进程：仅替换 `.app` 或 `.exe` 文件而不更新旧后台，会导致切换看板时出现 `Invalid workspace layout`。`tests/workspace-mode-integration.test.cjs` 和原生 WebKit 四按钮测试可用于验收。

Windows SSH 工作区必须把 `UserKnownHostsFile` 作为独立参数传递，使用 Windows 路径的正斜杠写法，同时保留严格主机指纹校验。Windows 2.8.3 已通过实体主机对远程 Linux 的目录树读取及 Agent CLI 能力检查。

## Windows / macOS 桌面与主机信息

桌面工作区在独立标签页中显示 Windows 画面，每台主机只打开一个标签；切换标签保留连接。使用本机自带的 Apache Guacamole / FreeRDP 引擎，通过原有 SSH 通道建立 RDP，不依赖 Windows App 或额外 VPN。远程桌面证书的 SHA-256 从可信 SSH 通道读取并固定验证。

macOS 主机支持 SSH 交互终端、文件浏览与系统信息。新建 macOS 主机并保存后，即可进入“远程桌面”页配置屏幕共享；未配置桌面时仍可访问设置入口。对于尚无桌面配置的 macOS 主机，默认选用 VNC 5900、127.0.0.1 和指向该 Mac 自身的 SSH 加密通道，避免在控制机上误连其本机 5900 端口。目标 Mac 需要在系统设置中开启远程登录及屏幕共享，并在受控环境中设置 VNC 查看器连接密码；连接时才输入密码，不写入主机配置。现阶段仅通过代码和自动测试验证默认设置、数据结构及交互入口，尚未进行远程 macOS 桌面的真实连接验收。

RDP 将 Windows 光标图像和热点交给本地光标显示，同时隐藏软件光标层，避免双光标及等待画面刷新的光标拖影。不支持本地光标时使用单一软件光标，鼠标离开桌面即隐藏。桌面数据采用增量协议解析，同一批到达的指令合并转发，不添加定时等待。`tests/rdp-pointer-webkit.js` 验证光标切换、坐标缩放及按键顺序；`tests/desktop.test.cjs` 验证分段 Unicode 和大图像帧。

BUPT Windows 与实体 DJF-Windows 的 Windows App 已保存账号可以迁入本应用系统钥匙串并自动登录；当前登记的 6 台 Windows 均已在本机钥匙串保存 RDP 凭据，打开桌面即可自动登录。Windows-target1–4 的 lab 账号经用户授权重设为各自独立的随机强密码，原账号 SID 与 SSH 密钥保持。新添加主机第一次登录后可选择记住。连接中断后点击“使用已保存凭据连接”即可重连；“使用其他账号”切换到手动登录。密码不进入浏览器存储、日志或 CLI 参数。RDP 的 CLI 操作使用 `hosts.rdp-open --data -` 从标准输入读入信息，或直接使用已保存的凭据；`hosts.rdp-list` 与 `hosts.rdp-close` 管理会话。

左栏右边缘可拖动至 52 px 的系统图标栏，主机名称通过悬停显示；展开后恢复文字。顶部工具栏默认 44 px，可拖动至最低 36 px。双击恢复默认尺寸，也可聚焦分隔条后使用方向键或 Home / End。尺寸在本机浏览器保存。桌面的全屏按钮会保留退出按钮，Esc 退出；原生 Mac 窗口也支持绿色全屏按钮与 Control-Command-F。RDP 根据可用区域动态调整分辨率。

主机信息页通过 SSH 读取系统、CPU、内存、使用率、GPU、磁盘、网卡、IP、路由、网关和 DNS。虚拟机检测依据系统厂商/型号、Linux 虚拟化检测及 Windows 硬件证据；仅有 HypervisorPresent 不会把运行 Hyper-V 的实体电脑误判为虚拟机。

远端文件的删除会移入当前目录 `.cloud-hosts/trash`，可在该目录的回收站恢复。中转站三点菜单在按钮附近弹出小列表；中转站副本删除与远端删除是两个不同操作。

`Aexus.app/Contents/MacOS/Aexus --background` 只启动后台服务，不打开窗口；后台启动失败也只写入错误日志。


### Workspace · Messages · Plan (2.9.13)

原生 Agent 工作台中的 Workspace 按实际主机和工作目录显示原生会话，可把多个目录保存为只读 Project 视图；Messages 分离原生会话只读事件历史与人工项目讨论，群消息不会暗中唤醒 Agent；Plan 使用持久化的 Job/Run、时区重复时间规则和同一数据源的 Board、Table、Calendar、Timeline 视图。周期任务默认为独立原生 Codex 会话，亦可明确恢复精确线程；计划默认暂停，启用时须明确选择权限、主机、路径和任务正文。模型只接收用户保存的正文，不追加虚拟角色、频道发布、身份或路由提示。计划只在本机 Core 醒着时执行。以上都可通过 `workspaces`、`messages` 和 `plan` CLI 调用。


2.9.16：File Board 文本打开与异步切换加强。点击文件**名称或图标**可打开 UTF-8 编辑器；远端文件读取尚未完成时离开 File Board，不再弹回过期编辑框或抢走焦点；保存冲突和未保存编辑状态仍由原有确认机制保护。WebKit 新增图标点开及读文件途中销毁视图的交互测试。Mac / Windows 安装时均校验版本、打包文件和运行 Build ID。


## File Board: native file operations (2.9.17)

File Board and Single Host Files share the real `hosts.files` workspace API on both the Core computer and SSH targets. Click a folder to expand it; click a text filename or icon to edit it. Every host card exposes **+ File**, **+ Folder**, a visible **⋯ Actions** control, and a right-click context menu for editing or renaming files, creating nested items, renaming folders, and safely moving files/folders to Trash. **F2** renames a selected item, **Delete** asks for confirmation, and both a confirmation dialog and trash restoration protect accidental deletion.

The text editor accepts strict UTF-8 only. Binary, invalid-encoding, or oversized files remain read-only. Save uses the original SHA-256 hash and an atomic replacement, so concurrent edits from another tab or device cannot silently overwrite a newer file; failed saves preserve the draft. Host+root are captured when each action begins, preventing a tab switch from redirecting a write. The `cloud-hosts files ... --operation workspace --data @action.json` CLI uses the same API without opening any UI. File Board interactions can be checked headlessly using the WebKit fixture `tests/file-board-actions-webkit.js`, Node CLI/RPC tests, and `python3 -m unittest discover -s tests -p test_file_board_edits.py`; staged Windows builds run that Python regression suite before replacing the installed executable.


## File Board — Drag files between hosts (2.9.18)

Drag any regular file or folder from one File Board host card onto **another host card**, an expanded folder, or a specific File tab. Hovering a folder automatically expands it after a brief pause. A confirmation preview displays the source, destination and copy name; choose a different name if a target already exists. Transfers default to **copy** (not move), retaining the original on its host. A compact progress panel on the destination card shows the current job, completed copies, errors and a Cancel action. Closing File Board does not terminate a running transfer; progress remains accessible through the `station list` CLI.

Cross-host copy uses Mac/PC as the transfer controller, with two authenticated workspace connections and bounded 256-KiB binary chunks. The destination is assembled under a unique hidden staging name and published only after per-file SHA-256 verification and a second source check. Hidden files, Windows Hidden attributes and empty directories are fully enumerated; symlinks are explicitly rejected rather than followed. Atomic publication avoids overwriting existing destinations. Failed and cancelled jobs clean staged data. File Board's right-click menu also exposes **Copy to Host...** when the desired target card is offscreen.

The same operation is available from the terminal without opening a GUI:

```sh
cloud-hosts station copy --source-host local --source-directory /project --path docs \
  --host <registered-host-id> --directory /srv/projects --to backups/docs
cloud-hosts station list
cloud-hosts station cancel <job-id>
```

A copied folder remains at the original path. To intentionally move one, first verify the copy, then separately use the existing explicit Trash action. Transferring between remote hosts depends on the controller being online; do not expect transfers to continue while Mac sleeps or after its backend process exits.


### 2.9.19: Engine Origin and Mac Codex remote execution

The **Engine Origin** selector for a local Mac work host contains only **Local Mac**. For a remote work host, it contains only **Local Mac** and that target host. Every displayed origin is clickable; impossible cloud-to-cloud origins are removed rather than grayed out. Native engines detected as installed on their actual origin are listed as available. Local-Mac → remote-host offers each installed engine only after its own native execution compatibility check (Codex, Claude Code, Pi, Cline). The work host needs the corresponding execution runtime. Native histories and provider settings remain in the engine's standard profile; see [current acceptance and remaining limits](docs/AGENT_ROLE_SPLIT.md). The two lost `targetHostId` parameters in Core RPC and session-capabilities dispatch were corrected; regression tests verify the entire invocation chain and headless real WebKit selection. The official Cline CLI can be installed with `npm install -g cline`, with provider authentication managed by the original CLI.
