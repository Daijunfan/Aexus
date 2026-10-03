---
schema: agents-company.cli/v1
module: tunnel
version: 0.15.0
---

# Tunnel · Cloud Team workspaces

## Purpose

本模块集成自 `Modules/Tunnel`，作为 Avalon 的内部功能模块。
Agent 进程、模型请求及认证保留在 Mac；项目命令与文件工具通过 SSH 路由到所属 Team 指定的云主机。
不注册为插件，不安装另一个 APP，不修改全局 CLI、Shell 或 SSH 配置。
原 Tunnel 项目及其私有连接资料保留在原处，没有打包进本项目。

## Workspace

Team 分为 Work、本地 Build、cloud 三类。仅 **cloud Team** 保存 SSH 主机、团队根目录及连接参数；
员工选择 Team 后自动继承主机，不能覆盖连接配置。可使用 `user@IP` 或已有 SSH Host 别名。
创建 Team 时检查已有云端根目录。员工默认生成同名子目录，也可绑定团队根目录或其已有子目录；支持嵌套。

Work 插件团队（包括 MiniNotion）和本地 Build Team 继续使用本机目录。SSH 使用现有密钥或 ssh-agent，严格检查 known_hosts。
`session.snapshot.cwd` 和终端显示实际工作目录；`workspace.* --team NAME/--employee ID`
自动选择对应本地或云端文件系统，调用方无需拼 SSH。连接参数仅在 Team 中保存。
没有项目文件的本地镜像，也不会在远端连接失败后回退到本地操作。

## Quick start

```sh
agents group add Backend --mode cloud \
  --remote-host ubuntu@203.0.113.10 --remote-dir /home/ubuntu/project
agents card create --title CloudBuilder --group Backend --engine codex \
  --model gpt-5.6-luna --effort low
agents remote check --employee EMPLOYEE_ID
agents session open EMPLOYEE_ID
agents workspace list . --employee EMPLOYEE_ID
agents terminal open --employee EMPLOYEE_ID
agents terminal input TERMINAL_ID --data 'pwd; git status' --enter
agents terminal read TERMINAL_ID
```

请将示例地址替换为自己的主机。连接通过 `group configure NAME --mode cloud` 修改；新位置必须保留员工对应的目录。
员工用 `card move` 在 Team 之间迁移，或通过 `card update --cwd` 选择云端子目录。切换执行位置关闭旧引擎和终端，保留文件、历史及原生会话关联；忙碌任务需先停止。名称保持不可修改。
0.12 的旧员工级 SSH 设置会在备份后自动归入 cloud Team，原文件与会话不迁移。

## Commands

| CLI | JSON API / behavior |
| --- | --- |
| `group add/configure --mode cloud --remote-host HOST --remote-dir PATH` | `remote:{host,directory,os,port,identityFile,knownHosts,sshConfig,jump}` |
| `--remote-os linux\|macos\|windows` | 默认 Linux |
| `--ssh-port N --ssh-key FILE --known-hosts FILE --ssh-config FILE --ssh-jump HOST` | 可选连接设置；不接收或存储明文密码 |
| `remote check --team NAME` | `remote.check {team}`；检查团队云端根目录，返回 `info` 和包含 OS / Linux 发行版的 `environment` |
| `remote check --employee ID` | `remote.check {employee}`；只测试连接和目录 |
| `remote check --remote-host HOST --remote-dir PATH` | `remote.check {remote}`；不创建员工 |
| `workspace list/read/write/mkdir/move/trash/restore --employee ID` | 同一本地/远端文件协议，限制在员工根目录内 |
| `terminal open --employee ID [--cols N --rows N]` | 新建真实 PTY；每次从员工目录开始 |
| `terminal list [--employee ID]` | 列出终端元数据 |
| `terminal input ID --data TEXT [--enter]` | 写入字符、换行和控制字符；也可 `--file FILE` |
| `terminal read ID [--cursor N]` | 增量输出 `{output,cursor,reset,running,exitCode}` |
| `terminal resize ID --cols N --rows N` | 更新实际 PTY 尺寸 |
| `terminal close ID` | 关闭该终端及 Shell |

对话左侧为目录树；文件和会话共享中间标签区；终端位于下方。编辑器以内容哈希检查写入冲突，
切换员工、打开资料或关闭页面前保存修改；冲突时保留编辑内容并阻止退出，可显式重新载入文件。
终端支持多个标签、持续 `cd`、环境变量、交互程序和 Ctrl+C。关闭对话保留终端；
关闭终端、移除员工/Team 或退出应用时清理相应进程。终端输出保留最近 256 KB，应用重启后不恢复 Shell。

Codex 使用原生执行协议：保留标准命令和文件工具，由宿主绑定唯一的目标执行环境。
SSH 只作为内部传输，模型上下文里不添加 Tunnel/MCP/SSH/exec-server 说明，也不注册 `tunnel.*` 工具。
本机技能、插件及全局记忆不注入云端员工；不修改全局配置。目标须预先有可用的
`codex exec-server --listen stdio`，仅启动执行服务，不使用目标模型账户或传输本机认证凭据。
连接由私有 loopback WebSocket 转 SSH stdio，不在目标打开监听端口，关闭/取消会清理子进程。

完整的实际请求（包括工具定义）与文件落点由 `test/native-execution-test.mjs` 用真实 Codex 和本地模型替身验证。
旧 cloud Codex 线程已包含旧工具/提示，会在首次打开时换成干净的原生上下文，保留宿主聊天记录及旧会话删除关联。

Claude 暂时保留原有五种 MCP 工具：`execute`、`read_file`、`write_file`、`edit_file`、`list_files`；
该分支仍是模型可见的工具代理，不宣称为无上下文注入的原生路由。
文件浏览器仍使用内部 Python 协议，不进入 Codex 模型上下文。后台 Python 临时目录仅位于对应工作目录，结束后清理。

## Files

- `native_executor.py` / `src/main/codex-executor.ts` / `src/main/codex-native.ts`：Codex 原生执行通道。
- `adapters.py` / `remote.py` / `transport.py`：沿用 Tunnel 的客户端配置、MCP 服务及 SSH 传输。
- `bridge.py`：供宿主调用的 JSON 配置和连接检查入口。
- `workspace_files.py`：与宿主一致的目录、文本、哈希冲突及可恢复删除协议。
- `terminal.py`：POSIX PTY 与 SSH 交互终端，不需要 Electron 原生扩展。
- `src/main/tunnel.ts`、`terminals.ts`：宿主的生命周期和 CLI/API 接口。
- `~/AgentsCompany/tunnel/`、`terminals/`：本机会话连接配置，权限 `0600`；不复制私钥。

打包时仅包括模块源码、文档及示例配置；排除原项目 `.tunnel/`、私有 profiles、凭证、测试日志和缓存。

## Errors

- SSH 认证失败、主机公钥不可信、目录不存在：原样返回错误，不弹出系统登录窗口。
- 文件被 Agent 或其他程序修改：拒绝旧哈希写入，保留编辑草稿，不覆盖对方的内容。
- SSH 中断：文件请求失败，下一次操作重新连接；终端显示退出状态，可以新建终端。
- 本机缺少 Python/OpenSSH：返回启动错误。不会自行安装或改变用户 SSH 配置。

## Compatibility

本机要求 Python 3.9+、OpenSSH 和相应的 Codex/Claude Code CLI。目标要求 Python 3.8+，
以及 Bash（Linux/macOS）或 PowerShell（Windows）；目标不需要 Agent 或模型凭证。
交互终端宿主使用 POSIX PTY，当前应用目标是 macOS。Windows 远端已通过 Windows 11 Pro 实机验收：PowerShell 终端、中文文件读写、原生 Codex 命令路由和 gpt-5.6-luna / low 推理。

### Windows 主机准备

RDP 是桌面入口，不能代替 SSH 命令入口。Windows 需要 OpenSSH Server、Python 3.8+；原生 Codex 路由还需要与 Mac 控制端兼容的 Windows Codex 二进制（本次两端均为 0.145.0）。模型登录与凭证留在 Mac。

`windows/prepare-host.ps1` 是一次性管理员 PowerShell 引导脚本；旁边提供官方 OpenSSH ZIP、Python embedded ZIP、Codex Windows npm 包 `codex.tgz` 与 Mac 的 `authorized_key.pub`。脚本不包含密码，安装到 Program Files / ProgramData，使用 SID 配置管理员公钥权限。内置防火墙规则适用于本次 QEMU 网关 `10.0.2.2`；其他部署应按实际入口配置来源地址。

本次 `example-windows` SSH 别名通过 `example-linux` 跳板连接其回环端口 12222；Windows SSH 端口没有暴露到公网。已有 RDP 13389 转发保持不变。QEMU 运行脚本已备份并保存新转发，Windows sshd 自动启动。

Mac 控制器使用本机配置目录；原生执行环境单独携带 Windows 路径，不能把 `C:\...` 填进 Mac 的 `AbsolutePathBuf` 权限根目录。Windows cloud 模式使用 SSH 用户本身的权限。模型的环境、工具与目录全部来自所选 Windows 环境，不注入 SSH、Tunnel 或 exec-server 说明。不存在的目录必须在模型调用前失败，不能落回用户主目录。

来源：[Windows OpenSSH](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration)、[Codex Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox)。


Codex 当前原生执行对接基于已核对的 0.145.0 协议；目标 exec-server 需兼容其环境、文件和进程协议。
实现参考 [原生环境配置](https://github.com/openai/codex/blob/rust-v0.145.0/codex-rs/exec-server/src/environment_provider.rs)。
Claude 使用已安装 Agent SDK 的 `mcpServers`、`strictMcpConfig`、`tools:[]` 及 PreToolUse 路由限制。

```sh
npm run test:remote                 # PTY、远端协议 fixture 和隐藏 UI，无模型推理
npm run test:ssh                    # 临时本机 OpenSSH 服务，真实加密通道，无模型推理
AGENTS_COMPANY_LIVE_CODEX=1 npm run test:ssh  # 仅 gpt-5.6-luna / low
AGENTS_COMPANY_NATIVE_CLAUDE=1 npm run test:ssh # 原生 SDK 的 MCP 连接检查，无推理
```


实机验收入口（会运行真实的 `gpt-5.6-luna / low`，只对已授权主机使用）：

```sh
AGENTS_COMPANY_LIVE_HOST='user@ssh-alias' \
AGENTS_COMPANY_LIVE_ROOT='/home/user' npm run test:cloud-live
```

测试通过宿主 CLI 创建隔离的 cloud Team/员工，给模型普通的计算与报告任务，
随后使用独立 SSH 读取文件核对。校验 token 从输入文件直接读取，并用断言核验，
不能仅凭模型声称“完成”判定成功。默认保留云端专用测试目录和报告；本机测试员工及原生会话清理。
已有 SSH 别名应与 `~/.ssh/config` 中的 Host 一致；目标系统 hostname 不一定是本机可解析的 SSH 别名。

### Claude 云端追加说明

Claude Code 保留 `claude_code` 系统提示词，只通过 `append` 追加三项信息：工作在云端、命令和文件操作使用提供的 Tunnel MCP API、云端操作系统类别（Linux/macOS/Windows）。不再附加工作目录、SSH 操作方式、项目文档读取、子 Agent 或 Shell 语法说明。工具 schema、执行路由和 Hook 检查保持独立。说明由 `adapters.prepare` 生成，写入会话适配目录的 `AGENTS.md` 和 `CLAUDE.md`，再由宿主读取注入；Codex 的原生远端执行会话不使用这段追加说明。已启动会话不会因文件修改自动改变初始化选项。

### 云端工具边界

Claude 的本机工具默认关闭，只开放五个 Tunnel MCP API。PreToolUse Hook 是兜底检查：
任何不在精确白名单中的工具调用都拒绝，权限回调也不能批准本机调用；计划模式只允许读文件和列目录。
云端不加载用户、项目、本地 settings，避免本机 SessionStart 等 Hook 在工具检查前执行。
只将供应商认证、模型别名、代理和证书环境带入子进程，禁止 bypass 模式，不修改用户全局配置。

Codex 仍使用原生远端执行环境，不启用本机 Hook。远端不可用时直接失败，无本机执行回退。
真实 GPT 多轮读写验证和强制越权测试见 [验收记录](../../artifacts/cloud-safety/README.md)。
