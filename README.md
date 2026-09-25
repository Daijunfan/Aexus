# Agents Company

A CLI-first Codex and Claude Code office with three Team types, a plugin directory,
and animated companions on an expandable canvas. Desktop actions use the same
backend APIs as the terminal.

## 阅读入口

- [README.md](README.md)：产品概览、安装与基本使用。
- [API.md](API.md)：本项目全部 CLI / Core API。
- [PERMISSIONS.md](PERMISSIONS.md)：职位、运行位置、管理关系及 API 权限。

职位为 **Manager / Employee**，运行位置为 **本地 / 云端原生**。Manager 必须在本地运行，可以在本机工作或通过已授权的 Tunnel 工作环境操作云主机。云端原生员工只能担任 Employee。Agents Manager 表示用户明确授予的全局管理范围。

普通 Build 和 Work Manager 都会在自己的工作目录获得公司 API 手册、权限说明和 `agents` 启动器；Work 插件手册同时保留。通过本项目 API 创建的员工才会成为公司角色，不使用 Coding Agent 内置子 Agent 实现公司编排。

The host and each `PlugIns/<name>/` source directory use separate Git repositories.
The host does not track plugin source files. A fresh host checkout needs the
MiniNotion and Browser repositories checked out under `PlugIns/` before packaging.
`npm run build:plugins` builds the available plugin checkouts into the App.

The Browser plugin has two views: a home screen of saved websites with rendered
thumbnail cards, editable names and annotations, and the current website.
Its independent CLI can save, list, open and edit these pages without a window.
Clicking a home card opens it in a managed Chromium window. See
[Browser API](PlugIns/browser/API.md).

## Engine controls

Employee conversations use each installed engine's model catalog, per-model reasoning
levels and official Fast tiers. Settings persist per employee and are accessible through
`agents config`; Fast starts off. Type `/` or use `/ 命令` for available commands.
Common settings commands execute in Core, Claude SDK commands run through its native
command dispatcher, and Codex compaction/review use official app-server operations.
Employee cloning, plan mode, queued/steered input, scoped image attachments,
conversation export and native background-task controls are also available.
See [API.md](API.md#employee-cloning-and-native-workflow-tools) for CLI entrypoints
and [ENGINE_CAPABILITIES.md](ENGINE_CAPABILITIES.md) for the capability audit.

## Conversation workbench

The employee view uses a compact explorer, conversation/file tabs, and one bottom
terminal panel using VS Code Codicons. File names are edited in place; Enter confirms,
Escape or clicking elsewhere cancels. Cmd/Ctrl +, − and 0 control persisted page zoom.
Type `/` to browse commands; use arrow keys to select, Tab to
complete, Enter to execute and Escape to dismiss. Tools use searchable skill lists
and structured account, quota and configuration views. Raw protocol data remains
available in expandable details and CLI responses are unchanged.

`npm run test:coverage` also rejects CSS parser warnings. Hidden UI tests check actual
layout and slash-menu geometry so a successful build cannot hide missing styles.

## Scheduled employee tasks

The host now provides a durable, headless `agents schedule` API for one-shot,
interval and weekday tasks, IANA timezones, permitted windows, model/thinking overrides,
cancellation and execution history. Keep `agents serve` or the desktop running.
See [SCHEDULER.md](SCHEDULER.md); MiniNotion does not yet use this host scheduler.

MiniNotion uses neutral document surfaces, a compact page tree, recent pages and tasks,
with its own light/dark theme. Page colors are labels and event accents; content,
CLI operations and existing color metadata remain editable.

## Team types

| Mode | Workspace | Employee behavior |
| --- | --- | --- |
| Work | Binds one installed plugin, such as MiniNotion | Uses that plugin's CLI/API within the employee's own folder and descendants |
| Build | A local project folder | Uses Codex/Claude Code normally; employees can bind existing physical folders |
| Cloud | A shared SSH connection and remote root | Local Workers use Mac engines with remote tools; Cloud Native Workers run the installed Codex/Claude CLI on that host |

在 **添加 Team** 或 **Team 设置** 选择 Work（插件）或 Build（项目）。Build 再选择本地／SSH 工作环境；为了兼容已有数据，SSH Build 的 CLI 和存储仍使用 `mode: cloud`。 Team names are editable display names;
renaming never moves or renames the bound folder. A
Work Team requires an installed plugin. Empty Teams can change mode/plugin; a Team
with employees keeps its workspace type so existing files cannot be silently reassigned.
Existing unclassified Teams remain Build.

创建员工分别选择 **职位：Manager / Employee** 与 **运行位置：Local Worker / Cloud Native Worker**。云端原生运行只允许 Employee。 Existing employees remain Local Workers, including those already in Cloud Teams. Cloud Native Workers can join only a Cloud Team; creation checks that host's CLI and protocol before creating a folder. Their conversation still uses the common chat, approvals, file tree and terminal layout, with a small cloud beneath the pet to show where the engine runs. Run `agents engine remote-check --team TEAM --engine codex|claude` without a window, or see [API.md](API.md) for remote session binding and ownership rules.

- Work: `PlugIns/<plugin>/workspaces/<Team name at creation>` inside the persistent plugin source folder.
  Each Team gets its own fixed folder; Team creation does not offer a folder picker.
- Build: `~/develop/Agents-company-projects/<Team name at creation>`.
- Cloud: an existing remote root configured on the Team; employee subfolders can be created over SSH.
- Default local Team creation creates its directory automatically. Build Team names preserve
  case, spaces and Unicode, but cannot contain path separators.
- Hiring has exactly two choices: **默认生成** and **绑定已有文件夹**.
  Default creates `<Team root>/<exact employee name>`, preserving Chinese, spaces
  and case. Bind selects an existing physical folder. Work requires a strict
  descendant of its plugin permission root (nesting is allowed); Build may bind
  another macOS folder. Cloud employees choose folders inside their Team remote root. The application's own data directory is excluded.
  CLI: `--directory-mode default|bind`; `--cwd PATH` selects the bound folder.

Test/deployment overrides: `AGENTS_COMPANY_WORKSPACES` (Work base, followed by the plugin's
`workspaceDirectory` and Team name) and
`AGENTS_COMPANY_PROJECTS` (Build base). The defaults above apply on this Mac.

Work employees must use strict subfolders of the plugin root, including nested folders. There
is one employee per exact folder; an employee at a parent folder can operate its
descendants. A child employee cannot operate the Team parent or sibling folders.
Each employee gets a CLI launcher, standardized API Markdown/schema and managed
AGENTS.md / CLAUDE.md entries **inside its own scope**. Existing user instructions
are preserved. Work uses a fixed directory permission policy; it cannot be switched
to Full access. Build keeps the ordinary engine permission controls.

```sh
./bin/agents group add Planning --mode work --plugin mininotion
./bin/agents card create --title Manager --group Planning --directory-mode default
./bin/agents workspace mkdir Manager/writer --team Planning
./bin/agents card create --title Writer --group Planning --directory-mode bind --cwd Manager/writer
./bin/agents group add Engineering --mode build
./bin/agents group list --details --json
./bin/agents plugin call mininotion fs.list --employee EMPLOYEE_ID
```

The left directory opens each installed plugin in an independent native window,
using its managed plugin workspace and sharing Agents Company’s Dock icon.
The plugin loads directly without a host frame or iframe; the main canvas remains
open. Reopening
the same scope focuses its existing window. Window controls and geometry are also available through `agents plugin` CLI commands. Closing a plugin
flushes pending edits; save failures preserve the window. The resizable icon rail provides home, plugin, employee-portrait and settings
buttons. Names appear on hover; visible descriptions are omitted. The office header is 52px high. No Team is required and no Team is auto-created.
The sidebar never opens a Team-creation menu; use the two add buttons at the top.
The top bar also has **All Team** and custom Team views. Use **＋** to name a view
and choose its Teams, or edit the selected view to change membership. Each view
remembers its own canvas position and zoom; Teams and employees remain shared.
Clicking any Team nameplate opens its scoped file browser (Work, Build or Cloud). Clicking any employee
opens the conversation directly. If a legacy folder is missing, the conversation
shows a repair action; fixing the folder returns to chat without losing history.
Build supports directory navigation, text editing, new files/folders, rename,
recoverable deletion and restore through the same CLI APIs.

## Workspace plugins

MiniNotion renders files in the selected scope, with structured documents in
`Documents/*.mininotion.json` and metadata in `.mininotion/`. Parent workspaces
observe descendant document changes and can render their attachments. Documents
stay on disk; the standalone app's personal database is not imported.

```sh
./bin/agents plugin list
./bin/agents plugin call mininotion page.create --employee EMPLOYEE_ID \
  --params '{"title":"Project plan","color":"green"}'
# From the employee's working directory (paths are relative to that directory):
./.agents-company/bin/mininotion api fs.write --data '{"path":"plan.md","content":"# Plan\n"}'
```

See [the plugin contract](PLUGIN_SPEC.md) and [starter package](examples/plugin-starter).
The host prepares a local JSON-RPC channel for sandboxed CLIs, so API calls do not
require network access. Only the selected Work plugin is injected. Build does not
inject or run workspace plugins.

Plugin sources live in `PlugIns/<plugin>/`; MiniNotion is entirely contained in
`PlugIns/mini-notion`. Run `npm run build:plugins` to build every plugin declaring
`build:plugin` in its package scripts. Outputs go to `build/plugins/<plugin>/` and
are shipped under the app's `Resources/plugins/`. No adjacent checkout or standalone
MiniNotion App is required. See [PlugIns/README.md](PlugIns/README.md).

## Run

Requires Node.js 22.12+ and an installed, authenticated Codex and/or Claude Code.

```bash
npm install
npm --prefix PlugIns/mini-notion ci
npm run build:plugins
npm run build
npm run serve            # Node-only service, no window
```

Create a managed project folder:

```bash
./bin/agents group add Engineering --mode build
./bin/agents card create --title Codey --engine codex --group Engineering --cwd codey
./bin/agents session open <cardId>
./bin/agents session send <sessionId> "Describe the files in your workspace"
./bin/agents session follow <sessionId>
```

Omitting both directory mode and cwd uses default generation. Default names are
literal folder names, not lowercased slugs; names containing separators require
binding an existing folder or changing the name. Existing folders are selected
with `bind`, and are never erased. Team names may change without moving directories; employee names remain immutable.
For compatibility, explicit cwd calls without a mode and legacy `create|existing`
CLI modes retain their prior preparation behavior. These are not extra UI choices.

```bash
npm run dev              # opens the optional desktop
npm run app              # produces release/mac-arm64/Agents Company.app
```

Run one service per `AGENTS_COMPANY_HOME` (default `~/AgentsCompany`). Stop the
Node service before opening the desktop for the same home. A second service
will not steal the active socket.

## The canvas

The window is a viewport, not the size of the office. Team positions may be
positive or negative and have no fixed floor grid or preset page dimensions.

- Drag blank space or slide with two fingers to pan. Hold Space to pan from a
  component. Command/Ctrl + wheel or trackpad pinch zooms around the pointer.
- `0` frames the office; `+` and `-` zoom. The viewport is saved in backend state.
- Drag any blank Team interior to move it; click its centered title to open the workspace.
  Team appearance, directory information and layout remain available under **Team 设置**.
- Hover any edge or corner to see its resize cursor, then drag to resize. This also
  works directly on ellipse, hexagon and polygon outlines. Employee dragging does
  not change the Team frame; the full employee stays inside its outline. Shrinking a
  Team pulls employees inside while keeping the requested frame size.
- Employees keep a fixed 190 × 250 world-space footprint. Adding employees does
  not shrink them. Automatic layout creates more rows and grows both dimensions.
- Choose grid, ring, or free arrangement. Drag any employee to place them freely;
  this preserves other workstations' current positions rather than reshuffling them.
- Team settings expose a custom background color, wood/grid/dot/plain textures,
  palette and a scenery toggle. Reset the color to follow the application theme.
- Choose rounded, ellipse, hexagon or custom polygon outlines. In the custom
  outline editor, drag vertices, double-click an edge to add a vertex, and
  right-click a vertex to remove it.
- Offscreen Teams and employees are omitted from rendering. Zooming changes the
  camera, never the stored size of an employee.

The header contains Team views, 添加 Team and 添加员工. Clicking an employee opens their
conversation over the existing canvas; dragging does not also open a chat.
Hiring creates a card and starts its private initialization; it cannot receive tasks
until initialization succeeds. One employee corresponds to one avatar and one stored conversation. Its name is read-only in profiles,
the sidebar and conversation header. CLI rename attempts are rejected before
changing directories or sessions. Switching employees retains
unsent message drafts for each conversation.


### Agent layout tools and unread replies

Managers can adjust the office through the same CLI APIs used by the UI. Ask an
Agent to inspect `agents office layout --json`, then use `room bounds`, `card place`
or `management relayout`. Ordinary Team Managers adjust their own frame and linked
employees. Explicitly authorized global staff can adjust other Teams; changing their
own Team still requires the Manager role. Ordinary Employees do not gain cross-Team
permissions. See [PERMISSIONS.md](PERMISSIONS.md) for the exact boundaries.

Hiring/removing employees automatically refits the affected Team, including manually
positioned rooms. Overlapping neighbors move aside with a fixed gap; unrelated rooms
and the current camera stay in place. Active management groups remain together.

When a task finishes, its last answer paragraph stays in the employee bubble with a
red unread dot. It survives closing the native session, switching views and restarting
the app. Opening a background window or reading via a Manager API does not clear it.
The desktop marks the exact answer read only when the foreground conversation shows
its end; after reading, the bubble disappears while the conversation history remains.
Private initialization never creates unread replies. Old history is not retroactively
marked unread because its prior read status is unknown.

## Settings

Use **设置** at the bottom of the left sidebar, or:

```sh
agents view open settings
agents settings get --json
agents settings set --theme white --zoom-sensitivity 4 --pan-sensitivity 1.5
```

Themes: `white`, `light`, `space` (default), `black`, `midnight`, `sage`. Both the
canvas background and host controls adapt for readable light/dark presentation.
Zoom sensitivity ranges from 0.25–8 (default 2.5, faster than the previous release).
Pan sensitivity ranges from 0.25–4 (default 1). The icon sidebar is 56–96 px wide
(default 64); drag its divider or use the arrow keys on the divider. These controls affect mouse/trackpad scroll
and pinch gestures; dragging a Team remains one-to-one with the pointer. Settings
persist in the CLI store and survive restart.

Employee snapping is enabled by default. It gently attracts a dragged employee to
standard seats or existing row/column alignments within 13 screen pixels, releases
beyond 22 pixels, and avoids occupied seats. A temporary outline shows attraction.
Use the **磁吸** canvas switch, Settings, or `settings set --snap-employees off`.
Hold Option/Alt to temporarily drag freely. `card place --snap on|off --zoom N`
exposes the same placement algorithm to the CLI.

## Navigation API

`agents view get`, `view open`, `view close` and `view details on|off` own panel
state in the CLI service, independently of the renderer. X buttons, Escape and
backdrops call `view.close`. Closing a workspace flushes pending file/plugin edits;
a save conflict keeps it open and returns an error. Closing a conversation keeps
its engine running and returns to the plugin page when opened from its sidebar. Use `session.close` to end the engine explicitly.

```sh
agents view open team --name Engineering
agents view open employee
agents view open plugin --plugin mininotion
agents view open conversation --employee CARD_ID
agents view details on
agents view close
```

## Animated companions

The seven original companions have layered, replaceable vector bodies, editable colors
and accessories. The cloud terminal pet is inspired by ChatGPT's Codey shape and
motion: a soft cloud head, a terminal face, independent hands and a weighted body.
Working alternates typing and thinking; idle companions nap, breathe and yawn.
Dragging has pickup/landing motion. The 13 px badge lamp is green only while busy,
and fully unlit while idle. No background image or fixed sprite sheet is required.

The interaction reference is the official [ChatGPT Pets documentation](https://learn.chatgpt.com/docs/pets).
The eight official companions—Codey, Dewey, Fireball, Rocky, Seedy, Stacky, BSOD
and Null Signal—are also available. Their original frame artwork is bundled locally
and controlled by the same work/rest state. Official skins support personal color tinting while retaining their original
shading; **原色** restores the base palette. The seven SVG companions also support
editable accessories. Hovering a canvas employee shows a hand cursor and plays
the pickup animation; idle employees breathe/doze with animated capital Z marks.
See [artwork attribution](THIRD_PARTY_NOTICES.md).

The badge still has only the two operational states: green while the backend
session is busy, off while idle. Expressive motions do not invent job activity.
The operating system's reduced-motion preference is respected.

## Folder hierarchy

The backend validates directory ownership when hiring, transferring, opening a
session and sending a message. Managed roots are outside app-owned state. Work
employees must use descendants; Work rejects outward symlinks and traversal.
Build may bind an existing physical folder outside its Team root. Binding never
creates a missing directory.

Build Team creation offers **default generation** or **bind an existing folder**.
Build can reuse an existing project anywhere outside app data. Work automatically
uses the selected plugin's fixed `workspaces/<Team name>` directory and never asks
for a Team folder. Employees may create same-name subfolders or bind existing
subfolders within that Team. Later Team renames keep this original folder path.

```sh
agents group add MyProject --directory-mode bind --root /absolute/existing-project
agents group add Planning --mode work --plugin mininotion
```

Deleting a Team also removes every employee and all their local and native
Codex/Claude sessions. The app waits for active writers and retains Team/employee
records if cleanup fails, so deletion can be retried. Working folders and files
remain on disk.

```text
PlugIns/mini-notion/workspaces/Planning/ # fixed Team root
  research/                           # lead: research and descendants
    writing/                          # writer: writing and descendants
  design/                             # a sibling outside the writer's scope
```

Work forbids two employees from owning the exact same directory, but explicitly
allows nesting. Build allows shared project directories and ordinary engine
permission controls. Unclassified legacy Teams default to Build. Missing legacy
folders are reported inside the conversation with a repair button.
`agents group migrate NAME` migrates a legacy Team to its managed location, makes
a metadata backup, moves existing files and leaves an old-path symlink. Existing
destinations are never overwritten. For Build Teams, `group root NAME PATH --directory-mode bind`
instead binds an existing folder without migration. Work Team roots are fixed. Employee names remain fixed; changing scope starts fresh engine context while
retaining conversation history. Stop active work before changing a folder or mode.

## Cloud Teams and conversation workspace

Team creation offers **Work · 插件**, **Build · 本机**, and **云主机 · SSH**.
Only a cloud Team stores the SSH host, existing remote root, port, key path,
known_hosts, SSH config and jump host. Employees inherit that connection; hiring
has no local/cloud switch or per-employee host fields. The default employee folder
is `<remote Team root>/<employee name>`; an existing root or descendant can also
be bound. Work plugin Teams and ordinary Build Teams remain local.
Every Team header shows Plugin, Local or Cloud. Cloud headers use `agents host check`
to refresh the SSH lamp every 10 seconds and immediately after a manual host check;
the initial state is neutral until the first probe finishes. This check does not
require the Team working directory. `agents remote check --team NAME` separately
validates that directory and detects Linux distributions from `/etc/os-release`.
The host's configured distribution selects icons such as Kali even before connection.
The original Tunnel project is integrated as the independent
[Modules/Tunnel](Modules/Tunnel/README.md) module, not an installed software plugin.

Codex/Claude and model authentication stay on the Mac. Their command and file tools
use the SSH target; local project tools are disabled in remote mode. Failed SSH
connections are reported, without a local execution fallback. No project files are
mirrored. Remote access uses the SSH account's actual permissions.

Every employee conversation now has a left folder tree, file/conversation tabs,
and an interactive terminal below. File operations reuse the existing workspace
API, including hash conflicts and recoverable deletion. Draft files are flushed
before switching away; a conflict preserves the draft and blocks navigation until
resolved or explicitly reloaded. Each new terminal starts in that employee's local
or remote workspace; shell state, Ctrl+C and multiple terminal tabs are supported.
Terminals persist while switching conversations and close when the app, terminal,
employee or Team is closed/removed as appropriate.

```sh
agents group add Backend --mode cloud \
  --remote-host ubuntu@203.0.113.10 --remote-dir /home/ubuntu/project
agents card create --title CloudBuilder --group Backend --engine codex
agents remote check --employee EMPLOYEE_ID
agents workspace list . --employee EMPLOYEE_ID
agents terminal open --employee EMPLOYEE_ID
agents terminal input TERMINAL_ID --data 'pwd; git status' --enter
agents terminal read TERMINAL_ID
```

See the module's [CLI guide, prerequisites and verification commands](Modules/Tunnel/README.md).

## CLI foundation

All business actions are available through the shared Core and `agents` CLI,
without starting Electron: conversations, engine/model/thinking/effort controls,
permissions, Teams, employees, files, terminals and plugin APIs. `config engine
CARD_OR_LIVE_ID codex|claude` switches the employee engine, retains its conversation
and native session associations, and keeps its terminal open. Busy engine switches
are rejected. `session transcript CARD_ID` also reads saved history without starting
an engine or opening a window.

The repository [AGENTS.md](AGENTS.md) defines the rules for future development.
Plugins must include a CLI, shared runtime, nonempty command schema and standardized
Markdown. The host routes CLI, renderer and mailbox requests through the same
schema guard; undocumented methods are rejected. See [PLUGIN_SPEC.md](PLUGIN_SPEC.md).

## Engines and verification

Employee Codex sessions use persistent official app-server connections; cloud sessions
use native execution bindings over SSH without model-visible routing tools. Both use native sandbox and effort controls, and
structured text/tool/error events. Claude Code uses the official Agent SDK with
the installed CLI, streaming, command discovery, settings, permissions and resume.
Native approvals, user questions, MCP elicitation and streamed results share the
headless Core API. See [ENGINE_CAPABILITIES.md](ENGINE_CAPABILITIES.md) for the audit.

Codex defaults to **gpt-5.6-luna / low**. Every real Codex inference in tests is
guarded to exactly that model and effort, with no fallback. Claude live tests
use Haiku / low.

```bash
npm test
npm run test:preferences # themes, sensitivity, direct plugin page and 8 pet sheets
npm run test:managed      # automatic paths, strict scopes, migration and headless view API
npm run test:navigation-ui # close buttons, continuous drag frames, directory picker, new pet
npm run test:workspaces   # path escapes, symlinks, ownership, full-size layout
npm run test:service      # API persistence, restart, cancellation, directory changes
npm run test:ui           # hidden renderer, real drag/wheel events, no model calls
npm run test:headless     # real engines in temporary external Team folders
npm run test:modes        # mode binding, nested scopes, shared files and assets
npm run test:modes-ui     # plugin directory, direct chat, repair and Build file browser
npm run test:plugin-sandbox # native folder-denial checks without model calls
```

Tests use disposable homes and external Team roots. UI work happens in a hidden,
non-activating Electron window. `AGENTS_COMPANY_TEST_APP` selects a packaged
executable for the same UI checks. Snapshots are in `artifacts/canvas-*.png`.

## Code and state

- `src/shared/canvas.ts`: world coordinates, sizing, layouts and shape geometry.
- `src/main/workspaces.ts`: canonical filesystem ownership checks.
- `src/main/store.ts`: persisted employees, Team roots, room design and viewport.
- `src/main/server.ts`: common CLI / IPC request handler.
- `src/main/sessions.ts`: engine lifecycle, enforced cwd and configuration.
- `src/renderer/src/office/OfficeCanvas.tsx`: viewport and gestures.
- `CanvasRoom.tsx`, `Employee.tsx`, `Furniture.tsx`: independent scene components.
- `Mascot.tsx`, `usePetBehavior.ts`, `styles/pets.css`: rig, choreography and clips.

`~/AgentsCompany/sessions.json` stores app metadata and external-directory
references; `transcripts/` stores chat history. There is no shared fallback
working directory. See [API.md](API.md) for the command surface.

## macOS icon

The app uses [build/icon.png](build/icon.png), generated with imagegen and encoded
as `build/icon.icns`. The prompt and reproducible encoding command are in
[build/ICON.md](build/ICON.md). `npm run build:icon` rebuilds the ICNS without an
image/model call.

## Removing employees and native sessions

`agents card remove ID` stops the employee's engine, waits for its writer to exit,
then deletes its host transcript and associated native conversations. Codex uses
its `thread/delete` app-server API; Claude uses the Agent SDK's `deleteSession`.
Matching name/history index entries are removed by exact native session ID.
Work files and folders are retained. `session close` only stops the live session;
it remains the non-destructive operation for keeping history.

Native session IDs are retained across workspace/context resets. Removal also
recovers exact employee-ID associations from this app's migration backups. It
never matches by display name or deletes every session in a directory. A native
failure leaves the employee and references available for retry. Other employees'
shared references block deletion. Native APIs are used under the same configured
Codex/Claude profiles as the app's engines; Codex must support `thread/delete`
(verified with CLI 0.145.0). No inference turn is used for cleanup.

Workbench pane edges are draggable: the file tree’s right edge and terminal’s top
edge show resize cursors. Sizes persist through `agents settings set --explorer-width
N --terminal-height N`. Working employees show live speech, published thinking
summaries or tool previews on the office canvas, also available through
`agents session activity ID`. Team titles are plain centered text; drag any blank
interior area to move the Team and drag its outline to resize it.

## Multi-agent management

用户创建本地员工并设置职位为 Manager 后，该员工能够通过 `agents card create` 创建本 Team 的 Employee，后台同时记录创建者和有效管理箭头。管理已有员工需要申请关系并由用户或全局 Agents Manager 批准。没有 active 箭头的员工不能被该 Manager 管理，其他 Manager 和跨 Team 员工也不属于普通管理范围。

员工的工作目录包含 `AGENTS.md` / `CLAUDE.md`、`.agents-company/bin/agents`，以及按员工 ID 区分的 `.agents-company/employees/<id>/API.md` 和 `PERMISSIONS.md`。初始引擎上下文直接包含真实身份、手册路径和创建员工示例。升职、恢复会话和更新全局授权会刷新引导；不用删除原有员工或会话。

```sh
# 用户创建 Manager；运行位置为本地。
agents card create --title Lead --group Engineering --kind worker --management-role manager --json
# 以下命令从该员工的身份通道执行。
agents auth whoami --json
agents api docs
agents card create --title Reviewer --engine codex --json
agents management topology --json
agents session send --employee EMPLOYEE_ID --text '检查项目并报告发现的问题' --json
```

关系生效／解除、创建关联员工或删除员工时，Core 在同一次状态提交中更新关系、员工位置和 Team 外框：管理组聚合在一起，孤立员工填入剩余空间。直线段严格水平／垂直，只有拐角使用小圆角。用户可通过 `agents management relayout --team TEAM` 重新整理。布局不改变当前镜头；各视图共享同一 Team 的真实关系和位置。

[PERMISSIONS.md](PERMISSIONS.md) 说明所有授权限制；[ARCHITECTURE.md](ARCHITECTURE.md) 为开发者补充模块边界。Trusted 保留操作系统账号权限；Isolated 是独立的执行隔离选项，不改变公司管理权限。


### 新员工初始化

创建员工后，系统自动让执行引擎阅读隐藏的 `.agents-company/` 权限、API 和插件说明。界面只显示“正在初始化”，暂时不能点击员工或派发任务；最终确认 OK 后开放交互。初始化轮不显示在项目聊天历史中，后续对话保留已经读过的原生上下文。Manager 新建的员工也遵守相同规则。

初始化失败可查看状态、调整配置和重试；不会伪装成就绪。该过程会使用所选模型的正常额度。旧员工升级时不会被自动批量初始化。用户已有的根目录 AGENTS.md / CLAUDE.md 自定义内容保留，宿主生成的说明改放隐藏目录。

开发验证：`npm run test:initialization` 使用隔离数据目录、原生协议 fixture 和隐藏 Electron 窗口；`npm run test:initialization-engines` 使用真实 Codex / Claude 进程和本地模型响应 fixture。旧测试中创建后立即对话的步骤需要先等待初始化 ready，禁止让 fixture 测试意外调用个人模型服务。
