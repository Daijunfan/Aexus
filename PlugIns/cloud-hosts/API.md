---
schema: agents-company.cli/v1
plugin: cloud-hosts
version: '1.2.2'
workspace: required
---
# Cloud Hosts CLI API

## Purpose

统一管理 Avalon 的 SSH 云主机、账号、密码、私钥、系统类型、连接状态及目录浏览。Team 只引用已有主机 ID 和远端工作目录，不再复制账号配置。

这是宿主服务型插件：独立 CLI、插件 UI 和员工 mailbox 都调用同一套宿主 `host.*` Core API。启动 Avalon 或无窗口运行 `agents serve`，不需要 Electron 窗口。插件不启动自己的 Agent，也不维护第二套 SSH 连接。

## Workspace

Work Team 自动绑定插件目录下 `workspaces/<Team 名称>`；每位 Worker 的默认同名子目录自动获得本文档、schema 和 `.agents-company/bin/cloud-hosts` 启动器。启动器固定员工自己的工作目录；不要覆盖 `--workspace`。

**此插件授予共享基础设施管理能力**：`hosts.*` 操作的是整个应用的主机库，不限于当前 Team。文件工作范围仍是员工目录，但该插件的 API 可以修改其他 Team 引用的云主机账号。只有需要管理主机的员工才应加入本插件 Team。密码不会自动加入提示词或文档，只有显式 `hosts.credentials` 返回密码。

## Quick start

```sh
# 启动宿主服务（已打开 App 时不需要再次启动）
agents serve
# 在员工 Workspace 中，启动器路径可代替 PATH 中的 cloud-hosts
./.agents-company/bin/cloud-hosts hosts.list
# 创建说明文件（实际密码可添加 password 字段；使用后自行清理敏感输入文件）
cat > host.json <<'JSON'
{"name":"GPU Server","host":"user@server.example.com","os":"linux","defaultDirectory":"/home/user"}
JSON
./.agents-company/bin/cloud-hosts hosts.create --data @host.json
# 以下 HOST_ID 替换为创建结果 result.id
./.agents-company/bin/cloud-hosts hosts.check --data '{"id":"HOST_ID"}'
./.agents-company/bin/cloud-hosts hosts.directories --data '{"id":"HOST_ID","path":"/home/user"}'
./.agents-company/bin/cloud-hosts hosts.update --data '{"id":"HOST_ID","patch":{"name":"GPU 208"}}'
# 在宿主中绑定已有主机和已存在目录
agents group add Research --mode cloud --host-id HOST_ID --remote-dir /home/user/develop
```

独立运行：`node /path/to/cloud-hosts/cli.cjs --workspace /existing/folder hosts.list`。命令输出标准 JSON-RPC：`{"jsonrpc":"2.0","id":"...","result":...}`；错误退出码非零。`--data` 支持 JSON 或 `@文件路径`。Worker sandbox 内使用已有 mailbox，不需要放开本机网络或父目录。

## Commands

完整参数见同目录 `schema.json`。所有命令经过相同方法白名单。

| 插件命令 | 宿主等价命令 | 参数及作用 |
| --- | --- | --- |
| `hosts.exec` | `agents host exec ID --command COMMAND --directory PATH --timeout SECONDS` | `{id,command,directory?,timeout?}`；通过 Tunnel 仅在真实远端执行管理命令；返回 stdout/stderr/exit_code/cwd；不本机回退 |
| `hosts.list` | `agents host list` | 读取共享主机列表；没有明文密码 |
| `hosts.get` | `agents host get ID` | `{id}`；读取单个账号/配置 |
| `hosts.create` | `agents host create --data @host.json` | 必填 `name,host,os,defaultDirectory`；返回含 `id` 的主机 |
| `hosts.update` | `agents host update ID --data @patch.json` | `{id,patch}`；更新账号，影响所有引用它的 Team；忙碌 Worker 会阻止变更 |
| `hosts.remove` | `agents host remove ID` | `{id}`；有 Team 引用时拒绝删除 |
| `hosts.check` | `agents host check ID` | `{id}`；真实 SSH 连通性检查，不依赖工作目录，返回 `connected,checkedAt,environment,error`；失败返回 `connected:false` |
| `hosts.directories` | `agents host directories ID --path PATH` | `{id,path?}`；只读浏览指定绝对目录，返回 `path,entries`；不创建远端文件夹 |
| `hosts.fingerprints` | `agents host fingerprints ID` | `{id}`；读取指纹，不自动信任 |
| `hosts.trust` | `agents host trust ID --fingerprint SHA256:...` | `{id,fingerprint}`；再次核对并保存用户确认的主机指纹 |
| `hosts.credentials` | `agents host credentials ID` | `{id}`；明确请求查看已保存的密码；默认返回 `{id,password,files}`，包含有权读取的 SSH 文件；传 `files:false` 仅取密码，请勿记入公开日志 |

`host` 可以是 `user@IP`、`user@hostname` 或已有 SSH 别名。`os` 是 `linux|windows|macos`。`defaultDirectory` 必须是绝对路径，Windows 使用 `C:\Users\name`。可选：`port`（默认 22）、`distribution`（Linux 如 kali/ubuntu）、`identityFile`、`knownHosts`、`sshConfig`、`jump`。私钥/配置文件路径必须是绝对路径或 `~/`。

虚拟机资产使用同一主机库，可在 `hosts.create/update` 传 `vm: {hypervisorId,name,projectDirectory,state,access,notes?}`。`state` 为 running/stopped/paused/unknown；`access` 为 ssh/serial/rdp/unconfigured。内部 IP 可以记录为真实配置地址，但不得冒充已连通 SSH；access 不为 ssh 时，连接检查返回不可连接，不能绑定云端 Team 或执行命令。通过管理宿主机的 `hosts.exec` 调用虚拟机项目本来提供的 CLI（例如在 /home/user/vms 执行 `python3 console/lab.py status`）获取真实资产和状态，再登记。原有 Windows SSH 记录可以直接附加 vm 元数据，不要重复创建。同一宿主+项目+VM 名称不允许重复登记；删除宿主前必须处理子 VM 引用。更新 vm 支持局部字段，例如 `{"id":"...","patch":{"vm":{"state":"running"}}}`。若要将 VM 接入 SSH，应先实际配置和验证管理入口，再将 access 更新为 ssh。

`hosts.exec` 的 timeout 为 0.1–600 秒（默认 120）。每次调用使用独立远端会话，cwd 不污染下一次请求；非零 exit_code 仍是执行结果，必须检查。它是管理能力，不会自动启动 VM、改变网络或修改文件；实际动作来自明确传入的 command。不要把密码写入命令参数或报告。员工可通过自己的 mailbox 调用，无须本机 shell 越出 Workspace。

`password` 在创建/更新时可提供；更新省略则保留，空字符串则删除。密码通过本机私有 CLI socket 的 SSH askpass 提供，不会自动作为命令行参数、模型上下文或远端 target.json 内容出现；显式调用 credentials 的返回值包含密码，调用该 API 的管理 Agent 因而能看到它。默认列表只有 `hasPassword`。SSH 仍然验证 known_hosts；未知指纹可先调用 fingerprints，并与服务器提供方核对，再显式 trust。重新扫描不匹配则拒绝；不自动跳过验证。跳板机或 HostKeyAlias 仍使用已有 SSH 信任配置。主机需要支持 OpenSSH 和 Python；Windows 工作终端是 PowerShell，Codex 原生执行还需要远端 Codex exec-server。

## Interactive workspace

所有操作仍通过共享 Core。无需 Team 或员工即可使用持久 SSH PTY：

```sh
agents host terminal-open HOST_ID --cols 120 --rows 32 --json
agents host terminal-input HOST_ID --terminal TERMINAL_ID --data 'pwd' --enter
agents host terminal-read HOST_ID --terminal TERMINAL_ID --cursor 0 --json
agents host terminal-resize HOST_ID --terminal TERMINAL_ID --cols 100 --rows 28
agents host terminal-list HOST_ID --json
agents host terminal-close HOST_ID --terminal TERMINAL_ID
```

插件方法依次为 `hosts.terminal-open/list/read/input/resize/close`。参数始终包含主机 `id`；已有会话另传 `terminal`。open 可传 directory/cols/rows；input 的 data 可含控制字符；read 返回 output/cursor/reset/running/exitCode，下一次读取使用返回 cursor。可传 waitMs:0–15000，在没有新输出时等待，输出或退出时立即返回；默认 0 保持兼容。长等待返回前再次检查调用权限。终端支持 cd、环境变量、全屏 TUI、Ctrl+C 与 Unicode。切换页面或关闭窗口保留 Shell；使用 terminal-close 明确结束，Core 退出清理全部终端。输出缓存最多保留 256,000 个 UTF-16 单元，分块维护；reset 表示较早输出已淘汰，UI 会提示并显示最近内容。截断不保留孤立的低代理项。输入 API 等待数据写入 PTY 驱动管道后返回；客户端断开会取消其等待中的读取，不终止 Shell。不能将另一台主机的 terminal ID 用于输入。

`hosts.create/update` 可保存 `desktop`（传 null 清除）：

```json
{"desktop":{"protocol":"rdp","address":"127.0.0.1","port":3389,"viaHostId":"SSH_HOST_ID","username":"desktop-user","quality":"balanced"}}
```

- protocol 为 rdp 或 vnc；address/port 为桌面服务地址。viaHostId 可指向自己或一个登记的 SSH 跳板主机；省略则从 Core 直接连接。经 SSH 访问 VM 时填写从该 SSH 主机可达的 VM 地址。
- 不自动安装桌面服务、开启防火墙或更改远端安全策略。Windows 可使用 RDP；Linux 需已有 xrdp/GNOME RDP 或 VNC；macOS 可使用兼容的 VNC 服务。
- RDP 使用原生客户端独立窗口。macOS 需要 Windows App（com.microsoft.rdc.macos），Windows 使用 mstsc，Linux 通过已配置的 .rdp 文件关联打开。保留证书校验与 NLA，不把密码写入配置。剪贴板、磁盘和打印机重定向默认关闭。登录在原生客户端内完成。
- VNC 在本机桌面 App 内嵌显示，支持键鼠、适配画面、全屏、Ctrl+Alt+Del、只读及 fast/balanced/sharp 画质。密码仅用于当前握手，不保存；暂不支持需人工公钥确认的 RA2 验证，遇到时明确拒绝。远程 Web 的 VNC 不可使用本机 loopback 网关，需在 Core 所在电脑打开桌面 App。RDP launch 也总是在 Core 电脑启动。
- 推荐用 SSH 通道保护 VNC。转发和 WebSocket 网关仅监听 127.0.0.1，WebSocket 使用随机会话路径与 Origin 检查；路径是当前连接的访问凭据，不应分享。

```sh
agents host desktop-open HOST_ID --json
agents host desktop-list HOST_ID --json
agents host desktop-launch HOST_ID --session DESKTOP_ID --json
agents host desktop-close HOST_ID --session DESKTOP_ID --json
```

对应插件 `hosts.desktop-open/list/launch/close`，参数 `id`，launch/close 另传 `session`。open 返回 transport ID、protocol、state、端点，以及 RDP profile 内容或 VNC wsUrl。建立期间 desktop-list 返回 state=connecting，可以用返回的 session ID 调用 desktop-close 取消；只有端点发布完成才返回 ready。state=ready 仅表示连接通道准备完成，不表示桌面已登录，亦不保证服务协议兼容。VNC 必须完成 RFB 握手才显示桌面已连接；RDP 认证由原生客户端报告。连接失败不自动重试用户命令。断开会清理转发、网关和临时 .rdp 文件；direct RDP 客户端需在客户端内退出。窗口切换保留桌面通道，可在桌面页或 CLI 明确断开；Core 停止统一清理。

这些交互 API 使用原有主机管理权限，仅用户和 Governor；普通 Employee / Manager 的主机发现或凭据读取权限不等于交互控制权限。活动终端、桌面连接会阻止修改或删除其主机与桌面跳板，请先明确结束连接。

## Files

主机库由宿主共享服务保存于 `$AGENTS_COMPANY_HOME/cloud-hosts/hosts.json`（默认 `~/AgentsCompany/cloud-hosts/`）。密码使用 AES-256-GCM 加密，密钥 `credential.key` 与数据文件权限均为 0600，目录为 0700；这保护磁盘上的明文曝光，不能防御拥有同一 macOS 用户权限的程序。备份时需要同时备份数据及密钥。请用 API 更新，不直接修改内部文件。

Team 在 sessions.json 中只保存 `hostId` 和 `directory`。旧版云端 Team 会自动登记、去重并引用现有连接，迁移前备份。员工目录只保存文档、工作文件和 mailbox，不保存主机密码。删除主机不删除任何云端文件；被引用主机无法删除。

## Errors

未知方法：`-32601`。领域错误：`-32000`，说明位于 `error.message`，包括服务未启动、主机不存在、参数无效、Team 仍绑定、正在工作的员工、SSH 认证/主机指纹失败、目录不存在。连接检查的失败通过 `connected:false` 显示，不能把“已保存主机”当成“连接成功”。未配置密码时 `credentials` 返回空字符串。

## Compatibility

契约 agents-company.cli/v1、Node 22+。独立 CLI 依赖本机运行中的 Avalon Core 服务（`agents serve` 即可）；UI 不是依赖。数据由共享平台服务持有，插件代码可独立升级，边界仅为上述公开 API。Linux/macOS/Windows SSH 执行复用宿主 Tunnel，云端 Agent 的命令仍禁止在本机回退执行。

### Employee identities

Hosted host-management commands retain the upstream caller identity. User UI/CLI and explicitly authorized Agents Managers can administer hosts. An ordinary Employee or a Team Manager arrow does not grant host administration; use the user-controlled `agents management global EMPLOYEE_ID on` grant when appropriate. The Work folder and its documentation alone do not grant this capability.
