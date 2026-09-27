# Agents Company CLI Plugin Contract v1

插件是一份独立的软件包：领域逻辑和数据归插件自己的 CLI/API；Agents Company
负责发现插件、提供 Team 工作目录、安装文档与启动器，以及承载渲染界面。
宿主不根据 Team 名称识别软件，也不导入插件的业务类型。

## Package

复制 [`examples/plugin-starter`](examples/plugin-starter) 即可从一个无依赖示例开始。
每个包必须包含 `agents-company.plugin.json`：

```json
{
  "schemaVersion": 1,
  "id": "workspace-notes",
  "name": "Workspace Notes",
  "version": "1.0.0",
  "description": "A CLI-first workspace tool",
  "runtime": "runtime.cjs",
  "renderer": "ui/index.html",
  "cli": "cli.cjs",
  "documentation": "API.md",
  "schema": "schema.json",
  "autoAttach": true,
  "workspaceDirectory": "workspace-notes-workspace"
}
```

`id` 为稳定的小写字母、数字和连字符标识。所有入口是包内真实文件的相对路径，
不得通过路径或软链接越出包目录。运行环境为 Node 22+ / Electron 的 Node 模式；
运行时和 CLI 入口使用 CommonJS，包自带所需运行依赖。渲染入口使用相对静态资源。

安装、发现和调用：

```sh
agents plugin install /absolute/path/to/plugin
agents plugin list
agents plugin describe workspace-notes
agents plugin call workspace-notes notes.list --team '任意 Team 名称'
agents workspace docs --team '任意 Team 名称'
```

内置插件位于应用 `Resources/plugins/`；用户插件位于
`$AGENTS_COMPANY_HOME/plugins/`（默认 `~/AgentsCompany/plugins/`）。开发时可通过
`AGENTS_COMPANY_PLUGIN_DIRS` 提供额外目录。优先级依次为内置、用户、额外目录。
同一 ID 使用后读取的包。安装不会覆盖已有用户插件；更新时先停止使用该插件，
备份并替换对应包，然后重启宿主、执行 `workspace docs` 更新文档和启动器。

## Workspace contract

Team 有三种类型：**Work** 绑定已安装插件，**Build** 使用本机项目文件夹，**cloud** 绑定 Cloud Hosts 登记的 SSH 主机 ID 和远端根目录。cloud 员工继承连接，只选择工作子目录；Work 插件保持本地运行。
Build 不自动注入插件；`autoAttach` 作为旧 manifest 字段保留兼容，0.5 起以 Work
Team 明确选择的 `pluginId` 为准。左侧目录展示所有已安装插件。点击直接打开其完整页面，不创建 Team，不弹出 Team 菜单。

```sh
agents group add Planning --mode work --plugin mininotion
agents group configure Planning --mode build
agents group list --details --json
agents plugin call mininotion fs.list --employee EMPLOYEE_ID
```

新的 Work Team 根目录固定为插件源码文件夹下的 `workspaces/<创建时的 Team 名称>`，例如
`PlugIns/mini-notion/workspaces/Planning`。一个插件的多个 Team 各有独立目录；
创建 Team 时不能使用 `--directory-mode bind --root PATH` 选择其他位置。已登记的
旧 Team 继续使用原目录，升级不会自动移动文件。
`workspaceDirectory` 是兼容旧目录与隔离测试的可选单个文件夹名称，只允许字母、数字、
下划线和连字符；省略时使用 `<plugin-id>-workspace`。安装在应用数据目录中的插件则
在其自身插件文件夹下保留 `workspaces` 子目录。
员工必须使用所属 Team 根目录的**子目录**，支持任意层级嵌套，不能占用 Team 根目录。同一个确切目录对应一个员工；父目录员工可以操作所有子目录，子目录员工
不能操作父目录或兄弟目录。Build 可以让多名员工共用普通项目根目录。
Build 自动使用 `~/develop/Agents-company-projects/<创建时的 Team 名称>`。创建 Team 会创建
对应目录；也可绑定其他已有的物理文件夹。Team 可在 UI 与 CLI 中改名，但原工作目录与员工目录不变；员工名称仍在创建后固定。员工支持新建文件夹
（`--directory-mode default`，与员工同名）或绑定已有物理文件夹（`bind`）。
旧版本未指定模式的 Team 按 Build 兼容。`group migrate NAME` 保留文件迁入新目录，
保存元数据备份。已有员工的 Team 不可切换模式/插件，空 Team 可以更改。
更改员工目录会重建引擎上下文并保留历史；忙碌任务需要先停止。

每个 Work 员工的**自身目录**内生成：

```text
employee-scope/
  AGENTS.md                  # 受管理的工具入口，保留用户文本
  CLAUDE.md
  .agents-company/
    workspace.json           # schemaVersion 2、mode、scope、teamRoot、所选插件
    README.md                # 当前作用范围和 API 入口
    plugins/<id>/API.md
    plugins/<id>/schema.json
    bin/<id>                 # 固定 --workspace <employee-scope>
    ipc/<id>/                # 本地 JSON-RPC 通道
  nested-employee/            # 可作为另一个员工更小的作用范围
```

宿主设置 `AGENTS_WORKSPACE` 为员工目录、`AGENTS_TEAM_ROOT` 为 Team 根目录，并将
员工自己的 `.agents-company/bin` 加入 PATH。启动器拒绝覆盖 `--workspace`。
Worker 不需要读取父目录中的文档或管理文件；文档副本位于自身授权范围。

`createPlugin()` 收到的 `workspace` 就是本次操作的完整授权范围。Team 界面使用
Team 根目录，员工 CLI 使用该员工目录。插件不得自行向上查找另一个全局数据库，
必须限制 API 和附件读取在给定目录及其子目录内。父目录可以通过文件变更观察
子工作空间；子工作空间不得向父目录查找附件或数据。

Work 使用固定的目录写入策略：Codex 的目录权限 profile 限制 Team 内的读取和写入；
Claude 的 shell sandbox 和文件工具检查应用同一边界。不会为员工额外放行整个
Team 根目录，也不能切换到 Full access。Build 保留原有 Agent 权限选项。
插件运行时是受信任本地代码，插件作者仍须正确执行 workspace 边界。

切换到 Build 会移除已生成的 CLI 启动器和受管理指令块，保留用户文件及插件数据。
删除 Team 会同时删除其中的员工以及本地、Codex、Claude Code 会话；原生清理失败时保留 Team 和员工记录供重试。卸载软件或删除 Team 不删除工作文件夹。软件元数据应放在自己的隐藏目录，
文档必须明确可直接编辑的文件格式，以及只能通过 API 修改的状态。

## Runtime API

`runtime.cjs` 导出一个工厂；同一个插件在不同目录作用范围中获得不同实例；同一范围内的 GUI/CLI 共享服务：

```js
exports.createPlugin = async ({workspace, pluginRoot, executable}) => ({
  async request({jsonrpc, id, method, params}) {
    return {jsonrpc: '2.0', id, result: {}};
    // 或 {jsonrpc:'2.0',id,error:{code:-32000,message:'...',data:{code:'DOMAIN_ERROR'}}}
  },
  async subscribe(listener) { return () => {}; }, // 可选，返回取消订阅函数
  async readAsset(path) { return {bytes: new Uint8Array(), mimeType: 'text/plain'}; },
  async close() {} // 可选，释放自身持有的服务/资源
});
```

`workspace` 是规范化后的真实根目录；`pluginRoot` 是包目录；`executable` 是可使用
`ELECTRON_RUN_AS_NODE=1` 运行 Node 程序的绝对入口。CLI、运行时和 GUI 必须复用同一
领域实现/服务，不能拥有互不相通的持久化副本。多个写入者需要冲突检测。
JSON API 的 `id` 为字符串或数字，`params` 为对象，错误使用 JSON-RPC 数值错误码；
稳定领域错误码放在 `error.data.code`。CLI 失败必须非零退出。

## Sandboxed CLI transport

Work 员工启动前，宿主会准备所选插件的运行时和 Workspace 内的 JSON-RPC 通道。
生成的 CLI 启动器设置 `AGENTS_COMPANY_PLUGIN_RPC`，指向
`.agents-company/ipc/<plugin-id>`。此通道让受文件系统沙箱约束的 CLI 继续使用
同一个后端，不需要放开网络或任意 Unix socket 权限。

插件 CLI 可以采用以下可选协议（MiniNotion 已实现）：

- 检查目录中的 `host.json`（包含 pid 和已规范化的 workspace）；宿主未运行时可用软件自身的本地服务模式。
- 生成随机 UUID，将 JSON-RPC 请求先写入 `<uuid>.request.json.tmp`，再原子重命名
  为 `<uuid>.request.json`。等待 `<uuid>.response.json`，解析后删除响应。
- 宿主执行 `runtime.request()`，原样返回 JSON-RPC 响应，不另外实现业务操作。
- `events.json` 保存 `{sequence,events:[{seq,data}]}`，保留最近 128 个事件；
  长期订阅按序号去重，发现断档后重新读取领域状态。宿主正常退出时删除 `host.json`。
- CLI 必须有请求超时并报告失败。这个通道位于员工自身可写目录。CLI 使用宿主提供的规范化路径，避免再次遍历无权读取的父目录来 realpath。

普通终端和独立 App 继续使用软件自己的 CLI/后端连接方式。不要将宿主通道加入
个人全局配置，也不要让一个 Team 的 CLI 自动回退到另一个 Team 的数据。

## Renderer transport

点击 Team 标签统一打开工作目录的文件浏览器（Work / Build / Cloud），不打开插件。
点击左侧插件通过 `plugin open ID` 使用其默认工作区打开独立原生窗口，与宿主共用 Dock 图标。
窗口直接加载插件页面，不使用 iframe，也不增加宿主侧栏或工具框；公司画布仍在主窗口中。
没有 Team 也可使用插件。相同插件和工作区重复打开时聚焦已有窗口。
`view open plugin --plugin ID` 保留为兼容入口；`plugin view ID` 是仅返回 URL 的底层接口。
窗口打开、关闭、位置、尺寸、最小化/全屏都可用宿主 CLI 操作，见 [API.md](API.md)。
`agents serve` 同样支持这些 Core 命令，返回 `attached:false`，不需要 Electron。
每个插件视图使用独立的本机端口和随机令牌前缀。不暴露 Electron/Node 或宿主 IPC 对象。

从 `new URL('.', location.href)` 得到视图 base URL：

| 相对路由 | 用法 |
| --- | --- |
| `rpc` | POST JSON-RPC 请求，返回完整 JSON-RPC 响应 |
| `events` | GET Server-Sent Events，每个 data 是运行时事件 JSON |
| `data/<path>` | GET，传给 `runtime.readAsset(path)`；插件自行限定工作区路径 |
| 其他路径 | 包内静态文件；入口 URL 带 `?hosted=1` |

浏览器地址不是持久数据 ID。附件应保存稳定引用并在渲染适配层转换成视图 URL。
不要将端口、令牌写进用户文档。视图重开会更换 URL；需要恢复的草稿应通过 API 保存。

窗口消息协议：`token = location.pathname.split('/')[1]`。
独立窗口中 `parent === window`，原有 `parent.postMessage` 插件无须修改。
宿主专用 preload 只转发以下白名单消息，业务操作仍走 `rpc` / `runtime.request`。

1. UI 完成初始化并能处理 API 事件后发送
   `parent.postMessage({type:'agents-plugin:ready',token}, '*')`。
2. 宿主关闭窗口/退出前发送 `{type:'agents-plugin:flush',token,id}`。
   插件核对 `event.source === parent` 和 token，等待编辑器及后台写入完成，回复
   `{type:'agents-plugin:flushed',token,id,error?:'保存失败原因'}`。
   有错误或 12 秒超时，宿主保留视图；必须明确报告失败。
3. 用户点击外部网页时发送 `{type:'agents-plugin:external',token,url}`。
   宿主校验消息来源并仅允许 HTTP/HTTPS，由默认浏览器打开。

4. 可选：从插件自身 CLI 设置推导主题后发送 `{type:'agents-plugin:appearance',token,theme:'light'|'dark'}`。
   插件原生窗口背景随主题显示，不修改公司的主题设置；业务设置仍经插件 API 持久化。

宿主会检查发送窗口、来源和 token。运行时是**受信任的本地代码**，具有当前用户的
系统权限；独立来源和令牌用于隔离视图与路由，并不是恶意插件的系统沙箱。
只安装自己开发或信任的软件包。

## Standard Markdown

每个插件提供 UTF-8 `API.md`，使用统一 front matter：

```yaml
---
schema: agents-company.cli/v1
plugin: workspace-notes
version: '1.0.0'
workspace: required
---
```

正文必须依次包含以下二级标题（标题固定，内容可以中文）：

| 标题 | 必须说明 |
| --- | --- |
| `## Purpose` | 软件用途、主要能力 |
| `## Workspace` | 根目录选择、相对路径规则、员工 cwd 与数据关系 |
| `## Quick start` | 可复制的读取、创建、修改命令；返回值和 ID 获取方式 |
| `## Commands` | 命令入口、参数、读写性质、JSON 请求响应；引用 schema |
| `## Files` | 用户文件格式、内部状态目录、外部修改同步、备份方式 |
| `## Errors` | 稳定错误码、冲突与失败的处理方式 |
| `## Compatibility` | 契约版本、运行环境、独立模式与宿主模式的能力范围 |

`schema.json` 包含 `schemaVersion:1`、`pluginId`、`version`、`commands`；
每个命令至少定义 `method`、`description`，写操作标记 `mutates:true`，参数在
`options` 中声明类型、必填项、描述，复杂对象提供 `examples`。

## MiniNotion integration

MiniNotion 是第一个内置包，Browser 是第二个。两者的源码分别是
`PlugIns/mini-notion`、`PlugIns/browser` 中的独立 Git 仓库；宿主 Git 忽略插件源码。
每个插件在本地独立提交，再从宿主构建已检出的插件目录。

MiniNotion 构建：

```sh
npm run build:plugins
npm run build
npm run test:plugins
npm run test:plugin-ui
```

MiniNotion 的 `--workspace` 模式将 Markdown、代码/文本、CSV、图片、PDF 映射成
可浏览的文件页面，并将原生页面/数据库/记录保存为 `Documents/*.mininotion.json`。
原始 Markdown 使用源码编辑；富文本保持原生块结构。`fs.*` 是实际文件接口，
与独立模式原有的空间 `folder.*` 接口区分。

`.mininotion/` 保存共享服务的索引、设置、历史、附件和草稿。该模式不读取独立 App
的个人数据库，也不启动自身 Agent。完整备份应复制整个 Workspace；PDF 导出和
全库替换在此模式下明确拒绝，常规文档导出使用 Markdown/HTML/JSON/CSV。

后台 UI 验证使用隐藏窗口或离屏渲染，临时数据目录和禁止激活策略，不显示界面。

## Source layout and builds

所有集成软件的源代码按插件放在 `PlugIns/<name>/`；MiniNotion 为 `PlugIns/mini-notion`。
每个源码包用 `package.json` 的 `build:plugin` 脚本实现 `--out <directory>` 构建协议。
`npm run build:plugins` 自动遍历这些源码目录，输出到 `build/plugins/<name>/`。
宿主通过标准 manifest 发现生成包；不从插件源码导入业务实现。

交付 App 包含构建后的插件，不需要原来的 `<plugin-source>/mini-notion` checkout
或独立 MiniNotion macOS App。源码和用户数据分离，现有 Markdown/API 文档规范保持不变。

创建员工默认在 Team 根目录内生成与员工同名的文件夹，保留中文、空格和大小写。Work 员工绑定已有文件夹时必须在插件权限根目录的子级；Build 可以绑定项目根目录之外的物理文件夹。移除员工会清理其 Codex / Claude 原生会话，工作文件与插件文档仍保留。


## CLI-first enforcement

所有新插件以无窗口 Core/CLI 为基础，界面只渲染或调用这些接口。不能把业务数据、
业务动作或执行状态仅放在 renderer/localStorage 中，也不能通过私有 Electron 方法绕开 Core。
会话与引擎管理由宿主的 CLI API 提供，插件不得另开与宿主员工无关联的隐藏会话。

插件安装要求独立 CLI、共享 `runtime.request`、非空命令 schema 和上述规范 Markdown。
每个方法必须有唯一名称和说明。CLI、HTTP 界面和员工 mailbox 共用同一请求校验：
未声明的方法返回 `-32601`，不能从 GUI 偷渡。界面初始化/就绪等生命周期方法也应声明，
例如 MiniNotion 的 `ui.register`；这类命令本身不得以弹出窗口作为业务执行前提。

提交插件必须验证：无 Electron 环境下的创建/读取/修改/错误路径；schema 与 Markdown
同步；GUI 请求均能通过 CLI 重放；不可达接口或冲突不能导致静默数据丢失。
使用 `npm run test:coverage`、`npm run test:cli-foundation`、`npm run test:plugins`
以及插件自身的 headless 测试。`examples/plugin-starter` 提供共享运行时与 schema 校验样例。

## Host scheduling foundation (v1)

未来插件需要安排宿主员工工作时，复用 `agents schedule` / socket `schedule.*`。
完整规范见 [SCHEDULER.md](SCHEDULER.md)。`source` 可保存插件 ID 以便过滤；它不授予权限。
模型、思考覆盖是临时的，目录和引擎身份来自已有员工；不要另启隐藏会话或私自提升权限。
宿主运行才会触发，插件必须呈现真实的失败、跳过、取消结果。本版本没有把它接入 MiniNotion。

## Application service plugins

`scope: "application"` 表示插件通过宿主公开 API 管理跨 Team 的平台资源；默认为 `workspace`。这是显式的管理能力，员工文档入口会说明这一点。工作文件仍限定在员工目录内，插件不得通过读取父目录偷偷扩大文件权限。应用级业务能力通过文档和 schema 明确列出，不通过私有 IPC。

Cloud Hosts (`PlugIns/cloud-hosts`，独立 Git 仓库) 是此类插件：独立 CLI、runtime 和 UI 共用宿主 `host.*` Core 服务。可无窗口运行 `agents serve`；它不依赖 Electron、不导入宿主实现、不保存第二份主机库。创建 Work Team 并选择 `cloud-hosts` 后，每位 Worker 自动获得完整主机管理文档与 CLI；sandbox 内仍使用标准 mailbox。

新 cloud Team 只能使用已登记 `hostId` 和现有远端 `directory`。旧 SSH 配置自动迁入主机库，数据备份后去重；新 Team 不再新建账号。连接详情与凭据通过 `host` CLI 或 Cloud Hosts UI 修改，密码默认隐藏。

## 调用身份与授权

宿主传入的 `requestHost({cmd,args})` 保留实际调用者身份。插件不得自行读取用户控制凭据来代替员工调用。员工 mailbox 请求携带自己的认证凭据；目录位置不是身份。
每条允许普通员工使用的命令在 schema 声明 `agentAccess: "workspace"`，并且实现必须限制到 context.workspace；未声明的命令只向用户或显式全局 Manager 开放。应用级主机管理插件复用 host.* 的全局授权。插件内部的独立 Agent 启动入口不得向普通 Work 员工开放。

## Web transport

The host keeps plugin frames in an opaque-origin sandbox. It injects a bridge for same-view `fetch` POSTs to `rpc`; the parent sends declared methods through authenticated `plugin.call` with the original structured JSON-RPC result (`raw`). Plugins must not rely on Core cookies, tokens, or a browser-local loopback server. A page URL alone does not grant RPC authority. Keep existing fetch-based RPC and save/flush acknowledgement behavior shared between desktop and Web.
