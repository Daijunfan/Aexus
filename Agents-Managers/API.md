# Agents Company Manager CLI 完整手册

## 开始工作

本文件由项目根目录的 `API.md`、`SCHEDULER.md` 和共享 CLI 注册表汇总生成。它是未来 Manager Team 员工的操作手册。**业务更改一律通过 CLI；不要直接编辑保存的 Team、员工或排期 JSON。**

1. Manager Team 应使用本地 **Build** 模式，并将 Team 根目录绑定到本 `Agents-Managers` 文件夹。员工默认使用本目录的子文件夹。cloud 员工在远端执行，不能连接 Mac 上的本地服务。
2. 本目录的 `agents` 启动器指向主项目 `bin/agents`，不是第二套 API。位于 Team 根目录时执行 `./agents`，位于直接子文件夹时执行 `../agents`；Agent 进程的 PATH 也会自动包含 Manager Team 根目录，因此可以直接执行 `agents`。
3. 桌面 App 或 `agents serve` 必须有一个正在运行。先执行 `agents status --json`；再执行 `agents session list --json` 获取**稳定员工 ID**，`agents session list --live --json` 获取**当前会话 ID**。会话关闭后 live ID 会改变，员工 ID 不变。通过 `agents group list --details --json` 查看 Team 根目录与模式。
4. 每个命令可追加 `--json`。成功返回 `{ "ok": true, "data": ... }`；失败返回 `{ "ok": false, "error": "..." }`，CLI 非零退出。读取上一条命令的结果与 ID，再执行依赖它的操作。

本目录不会自动创建 Team。如果要绑定它，先从此目录执行：

```sh
./agents group add Managers --mode build --directory-mode bind --root /Users/djf/develop/CS/Agents-company/Agents-Managers --json
./agents card create --title Director --group Managers --engine codex --directory-mode default --json
```

Team 和员工名称创建后不可更改。要修改其他员工或 Team，先读其稳定 ID、工作目录与忙碌状态；调用下文的 `card update`、`config ...`、`group configure`、`room design`、`room bounds` 等命令。删除 Team 会连带删除员工和会话，工作文件保留。Manager 权限来自运行中的本地宿主 CLI，不需要直接修改数据库。

一个常见流程：

```sh
agents status --json
agents group list --details --json
agents session list --json
agents group add Engineering --mode build --directory-mode default --json
agents card create --title Reviewer --group Engineering --engine codex --model gpt-5.6-luna --effort low --json
agents card update EMPLOYEE_ID --role 'Code reviewer' --color '#7089c4' --json
agents session open EMPLOYEE_ID --json
agents config model SESSION_ID gpt-5.6-luna --json
agents session send SESSION_ID 'Review the repository and report concrete issues.' --json
agents session follow SESSION_ID --json
```

插件领域命令先执行 `agents plugin list --json`、`agents plugin describe ID --json` 读取该插件独立的 Markdown/API schema，再用 `agents plugin call ID METHOD --team NAME --params @request.json`。Team 必须按插件契约授权。`ui.*` 只用于已有窗口的外观验收；Manager 在 `agents serve` 下仍可完成所有业务操作。目录选择器、屏幕截图等视觉行为需要窗口，CLI 管理文件夹时直接传入物理路径即可。

定时任务保存并执行在宿主 Core 中。先读 `agents schedule schema --json`，创建后用 `schedule preview` 检查触发时间，再 `schedule status` 和 `schedule history` 确认执行结果；使用 `schedule run` 会立刻启动模型工作，不用于试探排期。下面附有完整的定时契约。

## 根项目 API 全文

# CLI and local API

Start `npm run serve` (no window), or open the desktop. Both expose the same
Unix socket at `$AGENTS_COMPANY_HOME/agents.sock` (default `~/AgentsCompany`).
Run `./bin/agents help` for help. Every data command accepts `--json`.

Requests are newline-delimited JSON:

```json
{"cmd":"session.new","args":{"engine":"codex","model":"gpt-5.6-luna","effort":"low","title":"Codey","seat":"codey","group":"Engineering"}}
```

Replies are `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.
The renderer forwards identical requests over IPC to `handleRequest`; it has no
separate engine or storage implementation.

## Employee task scheduling

Scheduling is a host Core API, available without Electron. See [SCHEDULER.md](SCHEDULER.md)
for the complete v1 contract, JSON examples, timezone/window policies and recovery behavior.

```sh
agents schedule schema --json
agents schedule status --json
agents schedule create --name 'Daily check' --employee EMPLOYEE_ID \
  --time 09:00 --days 1,2,3,4,5 --timezone Asia/Shanghai \
  --model gpt-5.6-luna --effort low --prompt 'Run project checks and write a report.' --json
agents schedule preview JOB_ID --count 5 --json
agents schedule run JOB_ID --json
agents schedule history JOB_ID --json
agents schedule cancel RUN_ID --json
agents schedule pause JOB_ID
agents schedule resume JOB_ID
agents schedule update JOB_ID --patch @patch.json
agents schedule get JOB_ID --json
agents schedule list --employee EMPLOYEE_ID --json
agents schedule delete JOB_ID
```

Socket names: `schedule.schema/status/list/get/create/update/pause/resume/delete/preview/run/history/cancel`.
Task execution uses the employee's existing conversation and inherited Team scope. Model/effort/thinking
are temporary overrides. Busy employees are skipped; missed work is never replayed in a burst.
Keep `agents serve` or the desktop running. This API is not integrated into MiniNotion in this release.

## Workspace plugins

```sh
agents plugin list
agents plugin describe <pluginId>
agents plugin install /absolute/package-directory
agents workspace docs --team NAME|--employee ID
agents plugin call <pluginId> <method> --team NAME|--employee ID --params '{"key":"value"}'
agents plugin call mininotion fs.list --workspace /absolute/bound-team-root
agents plugin open <pluginId> [--team NAME|--employee ID]
agents plugin windows
agents plugin place <windowId> --x 900 --y 120 --width 1000 --height 780
agents plugin mode <windowId> normal|minimized|maximized|fullscreen
agents plugin dismiss <windowId>
agents plugin view <pluginId> [--team NAME|--employee ID]
agents plugin close <viewId>
```

`--params @request.json` reads parameters from a file. `--workspace` must match
a registered Work Team root. Omitting all scope selectors in `plugin.open`, `plugin.view` or
`plugin.call` selects that installed plugin's managed root and creates it if missing;
this is the same operation used by the direct sidebar entry. It requires no Team. `--employee` selects that employee's own folder, including descendants. The plugin ID must match the Work Team binding. `plugin.view` returns a scoped
local URL and view ID without opening a browser/window. Close it when finished.
Team nameplates open the scoped file browser for every Team type. `plugin.call` returns the domain result;
the plugin's own CLI also supports full JSON-RPC envelopes.

`plugin.open` opens or focuses one independent native window per plugin/workspace,
sharing Agents Company's Dock icon. The plugin loads directly at the top level;
the company canvas stays in the main window. `view.open {kind:"plugin",pluginId}`
is a compatibility alias. With `agents serve`, the same API creates a live HTTP
view and presentation state with `attached:false`, without loading Electron.
`plugin.windows` returns `{id,plugin,name,workspace,url,bounds?,mode,attached,error?}`
entries. Window state lasts for this process; document/settings data remains in the plugin workspace.

Socket commands: `plugin.open {id,team?,employee?,workspace?}`, `plugin.windows {}`,
`plugin.place {id,bounds:{x?,y?,width?,height?}}`, `plugin.mode {id,mode}`,
`plugin.dismiss {id}`. Bounds use desktop logical
pixels (negative coordinates allowed), minimum 480×360. Native moves, resizes and
window controls update the same Core state and emit `plugin:windows` events.

Closing the main
window leaves plugin windows usable. `plugin.dismiss`, native close and app quit
flush pending edits before releasing the HTTP view; a failed save keeps the window
open and reports the error. `plugin.close` also uses this lifecycle for managed
windows. `plugin.view` remains the low-level URL-only API for other render clients.

Installing a validated package refreshes docs in matching Work Team roots and
reports any per-workspace errors. `workspace.docs` is idempotent and preserves
user-authored text around the managed sections of AGENTS.md and CLAUDE.md.
See [PLUGIN_SPEC.md](PLUGIN_SPEC.md) for the package and documentation format.

## Sessions

```bash
agents status
agents session list [--live]
agents session new [--engine claude|codex] [--group NAME] [--title NAME] \
  [--cwd /absolute/workspace] [--seat codey] [--model MODEL] \
  [--effort low|medium|high|xhigh|max] [--permission MODE] [--thinking on|off]
agents session open <cardId>
agents session info <sessionId>
agents session snapshot <sessionId>
agents session search <query>
agents session send <sessionId> <text>
agents session follow <sessionId> [--raw]
agents session transcript <sessionId> [--thinking]
agents session interrupt <sessionId>
agents session close <sessionId>
```

A Team is required for every new session. Default engine: Claude. New Codex
sessions default to `gpt-5.6-luna` and `low`. Work employees require a strict subfolder of the plugin workspace. Default generation creates a folder with the exact employee name; `--directory-mode bind` requires an existing physical folder. Build may bind outside its Team root. Work allows one employee per exact folder, while Build permits sharing. Settings and engine resume IDs are
saved by the backend. `session open` reuses an already-live employee; after close
or service restart it resumes the persisted engine context and local transcript.
The live session ID may change; the stored card ID stays stable.

`session send` returns immediately; use `follow` to wait for the turn. Only one
turn can run per session. Sending another while busy returns an error instead
of interleaving messages. `follow` includes the current transcript and exits when
the turn completes, fails, or closes; following an idle session exits immediately.
`--raw` includes engine metadata events too.

`snapshot` returns the same state the GUI consumes, including transcript items,
current settings, busy status, errors, and pending approvals. Search matches
stored titles, departments, engines, and workspace paths.

The office displays every saved employee in its department. The previous `seat`
field is retained for compatibility but is no longer needed for placing an employee.

## Configuration

```bash
agents config model <id> <model>
agents config permission <id> <mode>
agents config thinking <id> on|off
agents config effort <id> <supported-level|default>
agents config fast <id> on|off
```

| Setting | Claude Code | Codex |
| --- | --- | --- |
| Model | Native runtime model control | Native `thread/settings/update` and `turn/start` controls |
| Permission | `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` | `default` / `plan` / `dontAsk` → read-only; `acceptEdits` / `auto` → workspace-write; `bypassPermissions` → full access |
| Thinking | Native thinking toggle | Uses the model’s supported reasoning efforts; no separate boolean toggle |
| Effort | Native effort control; validated against `supportedModels()` | Validated against `model/list` and sent unchanged as `model_reasoning_effort` / `turn.start.effort` |
| Fast | Native `applyFlagSettings({fastMode})` when the model supports it | Catalog Fast tier ID passed as `service_tier` / `turn/start.serviceTier`, both local and cloud |

The permission table applies to Build Teams. Work fixes `acceptEdits` with a folder
scope policy and rejects attempts to switch to Full access or another permission mode.
The Codex Build UI labels its policies Read only / Workspace write / Full access.
Local Build sessions expose native command/file approval requests. Work and cloud
folder restrictions do not become broader when an approval is accepted.
New Codex employees default to `gpt-5.6-luna / low`. Explicit `default` effort clears
the override and remains cleared after reopening; the native catalog supplies the
model default. Model changes clear incompatible effort/Fast selections. Fast is
persisted per employee and defaults off; turning it off explicitly requests the
Standard tier rather than inheriting a global Fast setting. The picker uses the
installed Codex `model/list` response, including hidden entries and every cursor page
(official model cache when offline), and Claude `supportedModels()`, including each
model's effort levels and service-tier descriptions. The installed Codex version
also affects its server catalog; an older CLI can omit newer models.

When Claude is configured for DeepSeek, Core exposes exactly `deepseek-flash` and
`deepseek-v4-pro`; old Claude aliases are resolved to the configured DeepSeek model.
Both use `low / high / max`, with a separate `config thinking <id> on|off` toggle;
`default` effort sends DeepSeek's `high`. Unsupported `medium`/`xhigh` selections
are rejected; stored legacy levels migrate to DeepSeek's equivalent on reopening.
The provider has no Claude Fast tier. The host uses the official runtime paired
with its Claude SDK and native custom-model settings, preserving explicit thinking
off and effort in outgoing requests. This does not patch the global Claude binary.
The menus and CLI use the same provider-aware Core controls. Cloud tool guards
remain enabled. No credentials are put in model catalog responses.

Socket: `config.fast {id,enabled:boolean}`. Fast means the provider's actual service
tier and increases usage; availability and realized speed depend on model/account.
The UI displays speed descriptions from the catalog, including 1.5x where advertised.
Model, effort and speed changes are rejected while the employee is working.

## Claude tool permissions

```bash
agents approval list <sessionId>
agents approval respond <sessionId> <requestId> allow
agents approval respond <sessionId> <requestId> deny
```

These are the same requests and one-time responses shown inline in the desktop.
Interrupting or closing a session clears pending requests. A response cannot
approve a different session's request.

## Slash commands

```bash
agents commands list <id> [--filter term] [--all]
agents commands complete <id> <name>
agents commands run <id> /fast status
agents commands run <id> /model gpt-5.6-luna low
agents session send <id> /status
```

`commands.run {id,text}` and `session.send {id,text}` share slash dispatch. `/help`,
`/model [model] [effort]`, `/effort [level|default]`, `/fast [on|off|status]`,
`/permissions [mode]` (alias `/approvals`) and `/status` use the same Core settings
and never become model prompts. Codex `/compact` and `/review [instructions]` use
native `thread/compact/start` and `review/start`, preserving the same native thread
and its local/remote execution environment. These two operations can use inference.
Codex `/new` (alias `/clear`) resets context while retaining the employee and workspace.
Claude `/clear` uses its native dispatcher. Context resets clear the visible transcript;
old native session IDs remain tracked for employee deletion, and subsequent messages
use the new native session identity.

Claude's remaining command list, aliases and project skills come from the installed
SDK/CLI; `commands_changed` replaces the native list at runtime, and native command
output appears in the shared transcript. Commands requiring the official TUI (for
example `/theme` and `/terminal-setup`) remain outside the SDK command surface;
`--all` exposes any terminal-only entries the installed CLI advertises. This host
does not claim to reproduce every TUI-only screen or every Codex slash command.
Unsupported commands report an error instead of becoming ordinary model prompts.

Typing `/` or clicking `/ 命令` opens the menu. Arrow keys select, Tab completes,
Enter executes an exact command, Escape dismisses the menu without closing chat.
Bare `/model`, `/effort` and `/permissions` also open their matching desktop pickers;
the same CLI commands return the available options/current setting.

Official references: [Codex commands](https://developers.openai.com/codex/cli/slash-commands),
[Codex speed](https://developers.openai.com/codex/speed),
[Claude SDK commands](https://code.claude.com/docs/en/agent-sdk/slash-commands).

## Employee cloning and native workflow tools

```sh
agents card clone EMPLOYEE_ID --title 'New employee'
agents card clone EMPLOYEE_ID --title Branch --directory-mode bind --cwd /existing/folder
agents view open clone --employee EMPLOYEE_ID
agents commands run SESSION_ID /fork New employee
agents config plan SESSION_ID on
agents commands run SESSION_ID /plan Propose an implementation
agents commands run SESSION_ID /normal
agents engine inspect SESSION_ID capabilities
agents engine inspect SESSION_ID skills
agents engine inspect SESSION_ID mcp
agents engine inspect SESSION_ID account
agents engine inspect SESSION_ID usage
agents engine skill SESSION_ID SKILL_NAME 'Task for this skill'
agents session enqueue SESSION_ID 'Run after this turn'
agents session queue SESSION_ID
agents session dequeue SESSION_ID MESSAGE_ID
agents session steer SESSION_ID 'Additional instruction for the current turn'
agents session background SESSION_ID
agents session background-stop SESSION_ID --process PROCESS_ID
agents session review SESSION_ID --base main
agents session review SESSION_ID --commit COMMIT_SHA
agents session export EMPLOYEE_OR_SESSION_ID --format markdown --path conversation.md
agents workspace image design.png --employee EMPLOYEE_ID
agents session send SESSION_ID 'Inspect this design' --images '["design.png"]'
agents approval respond SESSION_ID REQUEST_ID allow --answers '{"question-id":["Option A"]}'
agents approval respond SESSION_ID REQUEST_ID allow --form '{"name":"value"}'
agents view tools skills
agents external open https://example.com
```

`card.clone {id,title,cwd?,directoryMode?}` copies appearance, engine settings and
conversation into a new employee in the **same Team**. Codex uses `thread/fork`
and assigns the clone's native title; Claude uses the official `forkSession` API.
The new native ID is independent. Historical native IDs/deletion ownership, running
processes and queued messages are not copied. Empty conversations clone without
creating a fake native session. Busy, reserved or waiting-for-confirmation employees
must finish first. Forking does not start inference or a goal continuation.

The directory follows normal hiring rules: default creates `<Team root>/<new name>`;
bind uses an existing directory. Work requires a distinct permitted subfolder;
Build can intentionally share a directory, including the source's directory. Cloud
inherits the Team host and creates/checks the folder through SSH. Working files are
not copied. Visible history is a snapshot; running tool indicators are frozen.
Source deletion and clone deletion have separate native cleanup ownership.

Socket additions:

- `config.plan {id,enabled}`: native Codex planning mode or Claude plan permission
  mode, with the employee's normal permission restored on exit. Cloud Claude's
  plan guard blocks remote write/edit/execute tools while permitting file reads.
- `engine.inspect {id,section}`: `capabilities`, `skills`, `mcp`, `account`, `usage`,
  `config`; `engine.skill {id,name,prompt?}` invokes a discovered entry. Cloud Codex
  does not load local Skills/MCP into its remote environment.
- `session.enqueue {id,text,images?}`, `session.queue {id}`,
  `session.dequeue {id,messageId}`: live, ordered pending messages. They execute
  serially after the current turn. Interrupt/close discards pending messages;
  queues are not a durable scheduler. Use `schedule.*` for durable work.
- `session.steer {id,text}`: Codex `turn/steer` with the current turn precondition;
  Claude streaming input. This adds instructions without starting a second employee.
- `session.background {id}` / `session.background-stop {id,processId?}`: native
  Codex background terminals or Claude task notifications/`stopTask`. IDs are scoped
  to the current employee; omit `processId` to stop all its listed tasks.
- `session.review {id,base?|commit?|instructions?}`: choose exactly one Codex review
  target. `/review --base main` and `/review --commit SHA` use the same native flow.
- `session.export {id,format?,path?}`: Markdown or JSON; without `path` returns the
  content. With a relative path, creates a file inside the employee workspace using
  the existing local/SSH file API; existing files and outward paths are rejected.
- `workspace.image {employee|team,path}`: PNG/JPEG/GIF/WebP bytes as MIME/base64,
  at most 10 MB each. `session.send` and `session.enqueue` accept `images:string[]`
  (up to 16 scoped paths). The model receives image data, not host absolute paths.
  Queued image paths are read when dispatched. Control slash commands take no images.
- `approval.respond {id,requestId,decision,answers?,form?}` answers native questions,
  one-time permissions and MCP elicitation. `answers` maps question IDs to strings
  or string lists; `form` is the MCP schema's object. Invalid/missing answers keep
  the request pending. Cancellation removes pending requests.
- `view.tools {section}` opens `skills|mcp|account|usage|config|export|background`;
  `null` closes it. `external.open {url}` validates HTTP/HTTPS and returns the URL;
  a visible desktop additionally opens it. Headless/hidden operation never launches
  a browser.

Employee Codex sessions now retain one official app-server connection across turns.
Background processes survive ordinary responses. Closing/removing the employee or
quitting the host releases its connection and execution environment. Dead connections
are recreated on the next message using the saved native thread ID. Text, readable
reasoning, tool output and tool-state events stream into the same CLI/UI transcript;
late background output updates its original tool entry.

See [ENGINE_CAPABILITIES.md](ENGINE_CAPABILITIES.md) for the current audit and tests.

## Company management

```bash
agents group list
agents group add <name> [--mode work|build|cloud --plugin ID] [--directory-mode default|bind --root PATH]
agents group configure <name> --mode work|build|cloud [--plugin ID --directory-mode default|bind --root PATH]
agents group list --details
agents group migrate <name>
agents group root <name> /absolute/managed-folder
agents group root <name> /absolute/existing-folder --directory-mode bind
agents group remove <name>
agents group rename <name> <newName>
agents room place <name> --col N --row N [--w N] [--h N]
agents card create --title NAME [--engine codex|claude] [--group TEAM] [--cwd PATH] \
  [--directory-mode default|bind] [--avatar cat|fox|rabbit|panda|penguin|robot|cloud] [--role ROLE] \
  [--accessory headphones|glasses|none] [--color '#rrggbb']
agents card update <cardId> [--title NAME] [--group TEAM] [--avatar KIND] \
  [--accessory ACCESSORY] [--color '#rrggbb'] [--role ROLE] [--cwd PATH] [--directory-mode default|bind]
agents room design <name> [--theme sage|ocean|rose|amber|lavender|slate] \
  [--wall windows|panels|brick] [--desk walnut|oak|cloud] [--subtitle TEXT] \
  [--plants on|off] [--shelf on|off] [--lamp on|off] [--art on|off] \
  [--background HEX] [--pattern boards|grid|dots|plain] [--scenery on|off]
agents card rename <cardId> <title>
agents card move <cardId> <group> [--before cardId] [--cwd existing-path]
agents card remove <cardId>
```

Removing a Team cascades to its employees and native sessions, then clears its room/root metadata.
When moving an employee back to an existing folder, pass `--cwd` to bind that folder; without it, the destination Team creates a new folder under its root.
Working files are retained. Explicit directory migration preserves old-path compatibility links.
Removing a card stops its engine and deletes both host and associated native
conversation history. Actual work files and folders are retained. Rooms use nonnegative integer positions and
positive integer spans for legacy grid commands. The current canvas uses the
world-space bounds and employee positions below; it has no fixed column limit.

`card.create` hires an **idle** employee and returns the saved card. It starts no
engine or conversation. `session.open` starts or resumes that employee's engine.
`card.update` saves appearance and workspace fields; a directory change resets engine resume IDs and keeps visible conversation history.
Saving appearance within the same department does not change workstation order.
Team and employee names are immutable after creation, including bound folders.
`group.rename`, `card.rename`, `session.rename` and a changed `card.update.title`
return an error before creating/moving folders or stopping engines. Supplying
the same name is an idempotent no-op. Role, appearance and directory bindings remain editable.
`room.design` stores a partial design patch; its JSON API uses booleans for the
decoration and scenery switches. An empty department name customizes the Unassigned room.

`room.design` also accepts `background` (hex color, or an empty string to follow
app theme), `pattern` (`boards|grid|dots|plain`) and `scenery` (boolean). Team
settings expose these directly. The chosen palette tints the default surface;
custom colors override it. All shapes use the same background and texture.
Drag anywhere on a Team outline to resize from that edge/corner; the opposite
side stays anchored. Pointer deltas are converted through the canvas zoom, and
the resulting rectangle is persisted through `room.bounds`.

These commands back the two add buttons, department editor and employee editor.
There is one office view, with a conversation overlay on employee click. The
employee's two visual states come directly from the live session's `busy` field.

## Inspecting the desktop

```bash
agents ui view
agents ui dom [--sel CSS]
agents ui text
agents ui click <selector>
agents ui type <selector> <text>
agents ui wait <selector> [--timeout ms]
agents ui style <selector>
agents ui screenshot /absolute/path.png
```

These operate on an existing renderer, including an offscreen test renderer.
They report `no window is open` for a Node-only service. Screenshot commands
capture web content without opening a preview or showing the window.

The normal workflow needs only data commands. `ui.*` is for acceptance checks
and visual diagnostics, and is not required to run agents or manage the company.

## Canvas and freely placed employees

```bash
agents room bounds <team> --x -1200 --y 700 --width 1000 --height 700 \
  --shape rounded|ellipse|hexagon|custom --arrangement grid|circle|free
agents room bounds <team> --shape custom --points '[[0.1,0],[0.9,0],[1,0.8],[0.7,1],[0,0.8]]'
agents room layout <team>
agents card place <cardId> --x 450 --y 300
agents canvas view
agents canvas set --x 60 --y 120 --zoom 0.8
agents ui drag <selector> --dx 100 --dy 60
agents ui wheel .infinite-canvas --dx 100 --dy 50
agents ui wheel .infinite-canvas --dy -100 --zoom
```

`room.bounds` is a partial update. Position uses unbounded signed world
coordinates; dimensions must be at least 360 × 380. Automatic new-seat layout
can expand for additional full-size employees.
Employee dragging freezes the current frame and other seats; out-of-frame positions
remain visible without stretching the Team. Explicit width/height edits keep their
exact dimensions (minimum 360 × 380) and preserve full-size employee positions. `room.layout` returns effective bounds and each employee's position.
Changing arrangement clears prior manual placements. Custom polygon points use
normalized 0–1 coordinates and are editable as handles in the UI.

`card.place` stores Team-relative coordinates, switches to free arrangement and
freezes other employees' current positions. Employees remain 190 × 250 world
units; deliberate manual overlaps are possible. Automatic grid/ring arrangement
keeps workstations spaced apart. Pinning a Team position prevents automatic
placement from changing it; other Teams flow around occupied spaces.

The viewport uses screen-pixel translation plus zoom (0.08–3). These operations
work from the CLI even without a desktop renderer. `ui.drag` / `ui.wheel` are
renderer diagnostics that dispatch real pointer/wheel events without opening or
focusing a window.

## Workspace enforcement and existing data

Work roots are auto-created under `~/develop/Agents-company-workspace` using the
plugin manifest's `workspaceDirectory` (default `<plugin-id>-workspace`). MiniNotion
uses `mini-notion-workspace`. Teams for the same plugin share its root by default. Employees
must use strict subdirectories, which can be nested; exact directory aliases cannot
be assigned twice in Work. Build roots are auto-created under
`~/develop/Agents-company-projects/<Team name>` and may be shared by their employees.
All paths are canonicalized; traversal and outward symlinks are rejected.

`group.add` accepts `--directory-mode default|bind` (`directoryMode` in JSON).
Default generation uses the managed roots above. Binding requires `--root` to be
an existing physical folder and creates no additional Team-named directory. Work
Teams can bind their plugin permission root or an existing descendant. Build Teams
can bind other physical folders outside app-owned state. Employee defaults use the
selected Team root; Work employees must remain strict descendants of that root.
Binding preserves existing files. Team names are fixed after creation.
`group.root NAME PATH --directory-mode bind` changes an existing binding without
moving files; existing Work employees must still fit inside the new Team root.

`card.create`, `card.update` and `session.new` accept `--directory-mode default|bind`
(`directoryMode` in JSON). `default` creates `<Team root>/<exact employee title>`;
Chinese, spaces and case are preserved. Path separators and `.` / `..` cannot be
used as generated folder names. A default request cannot override the derived path.
An existing employee may keep its own already-generated folder.

`bind` requires an existing physical directory and never creates it. Work bindings
must remain strict descendants of their Team root, with outward symlinks and
exact duplicate ownership rejected. Build can bind another physical folder outside
its Team root; both modes exclude the app's data directory. A Build employee bound
outside its Team root retains that binding during migration.
The employee and its conversation share a fixed name.

Omitting both mode and cwd selects default generation. Legacy explicit-cwd calls
and `create|existing` modes remain CLI-compatible; the UI exposes only default
and bind. Legacy modes still enforce the Work permission boundary.

`group.migrate NAME` moves a legacy directory into the managed layout, preserving
its files, making a metadata backup under the app home's `backups/`, and leaving
an old-path symlink. A legacy Work root is moved beneath the plugin root into a
Team-named subfolder so even former root owners become strict descendants.
A pre-existing destination rejects migration without overwriting it. Without
`--directory-mode bind`, `group.root` is a compatibility alias requiring the
computed managed path; bound directories cannot be automatically migrated. A first binding
repairs unbound employees; the old unbound application workspace is left untouched.

Team names remain fixed. Empty Teams may change mode/plugin. Teams with
employees reject mode/plugin changes to preserve existing directory assignments.
Busy engines block folder changes. Idle engines are closed and resume IDs are
cleared; saved conversation history remains. `workspaceError` reports invalid old
folders so the desktop can show the repair action.

`group.remove {name}` / `agents group remove NAME` removes the Team and every
employee in it. It stops their engines, waits for transcript writers, and deletes
all associated current and historical Codex/Claude sessions through the same
native APIs as `card.remove`, including name/history indexes and host transcripts.
Membership changes and session reopening are blocked during cleanup. If native
cleanup fails, Team and employee records remain for an idempotent retry. Native
references shared with employees outside the Team block removal. Work directories,
plugin documents and user files are preserved; other Teams sharing a folder remain.


## Build files

These commands operate on actual files, with the same implementation used by the
Build file browser. Use `--employee ID` instead of `--team NAME` to choose the
employee scope. Paths are relative to that scope.

```sh
agents workspace list . --team Engineering [--hidden]
agents workspace read src/main.ts --team Engineering
agents workspace write src/main.ts --team Engineering --content 'new text' --hash HASH
agents workspace write README.md --team Engineering --file /path/to/content.txt --create
agents workspace mkdir src --team Engineering
agents workspace move old.txt --to new.txt --team Engineering
agents workspace trash new.txt --team Engineering
agents workspace restore --id RETURNED_ID --team Engineering
```

Text reads return a hash for conflict-aware saves. Binary files and files above
4 MB are listed without loading editable text. Trash is reversible and stored in
`.agents-company/trash`; deleting a file in the browser does not permanently erase it.


`workspace suggest --team NAME [--mode work|build --plugin ID]` returns the managed
path without creating it. `AGENTS_COMPANY_WORKSPACES` and `AGENTS_COMPANY_PROJECTS`
override their respective bases for isolated deployments/tests. `workspace choose
[--path PATH]` opens the desktop directory picker only on explicit request; CLI
callers can supply `--cwd` directly. Employee forms offer create/existing choices;
Team forms display their automatically computed directory.

## Navigation, including closing panels

```sh
agents view get
agents view open team [--name NAME] [--mode work --plugin ID]
agents view open employee [--employee CARD_ID]
agents view open home
agents view open settings
agents view open plugin --plugin ID
agents view open workspace --name NAME
agents view open conversation --employee CARD_ID [--details]
agents view details on|off
agents view close
```

The service owns `{kind, revision, name?, employee?, pluginId?, settings?, details?}`. All commands
work without a renderer. `view.open` selects a view; opening a conversation in the
desktop also calls `session.open` to connect its engine. Headless callers use
`session.open` explicitly when they need a live engine. `view.close` returns a plugin conversation/settings panel to that plugin; otherwise it selects `home`. Use `view.open` with `kind:home` to return directly to the office;
it never stops a session or deletes a draft's saved data. X, backdrop and Escape
use this command. `session.close` remains the explicit engine shutdown command.

With a desktop attached, navigation first flushes workspace editors. A failed
save returns an error and leaves the current view unchanged. In headless mode no
renderer is required. View changes emit `view:changed`; `revision` orders updates.

## Appearance and pointer preferences

```sh
agents settings get --json
agents settings set --theme white --page-zoom 1.1 --zoom-sensitivity 4 --pan-sensitivity 1.5
agents view open settings
```

JSON requests use `settings.get` and `settings.set` with optional `theme`,
`zoomSensitivity`, `panSensitivity`, `sidebarWidth` and `snapEmployees`. Themes are `white|light|space|black|midnight|sage`.
Defaults: space, zoom 2.5, pan 1, sidebar width 64, employee snapping on. Zoom accepts 0.25–8; pan accepts 0.25–4.
Changes persist in `Store.preferences` and emit `store:changed`. Invalid values
reject the whole update. Restore defaults by setting those three default values.

`card.create` and `card.update` additionally accept the official skin IDs:
`codex`, `dewey`, `fireball`, `rocky`, `seedy`, `stacky`, `bsod`, `null-signal`.
The previous `cat|fox|rabbit|panda|penguin|robot|cloud` SVG avatars remain supported.

## Employee conversation identity, sidebar and snapping

```sh
agents settings set --sidebar-width 72 --snap-employees on
agents card place CARD_ID --x 280 --y 69 --snap on --zoom 1
agents card place CARD_ID --x 280 --y 69 --snap off
agents view open conversation --employee CARD_ID --plugin mininotion
agents view open home
```

An employee, character and conversation share one immutable name. Creation sets
that name; existing profiles and headers display it read-only. Legacy rename APIs
remain callable but reject a different name, for both saved and live session IDs.

`sidebarWidth` accepts 56–96 pixels; legacy wide-sidebar settings display as the new 64px default. The sidebar shows icons only, with hover labels; it remains resizable within this range. `snapEmployees` is a boolean and defaults to true. Both persist via
`settings.set` and are included in `settings.get`.

`card.place` accepts optional `snap:boolean` and `zoom:number` (0.08–3, default 1).
Omitting `snap` uses the stored preference. The shared algorithm attracts to a
regular seat/row/column within 13 screen pixels and avoids occupied seats. During
pointer dragging, a 22-pixel release threshold prevents jitter. UI drag previews
use the same geometry, then commit the resolved point with `snap:false` to retain
that precise preview. Option/Alt temporarily bypasses attraction.

Plugin-context conversations open in the company window while the independent plugin
window stays open. The matching plugin ID is validated against the employee's Work
Team. Closing a conversation returns to the company canvas; `view.open home` does
not close plugin windows.

Official avatar `color` is now rendered as palette tinting. Restoring the original
hex color from `OFFICIAL_COLORS` removes the tint. Color changes use the existing
`card.update` API and do not require editing sprite files.

## Permanent employee/session removal

`card.remove {id}` / `agents card remove ID`:

1. Prevents new opens, stops the employee's live engine and waits for the native
   writer, including native IDs received while stopping.
2. Collects current and historical `nativeSessions` (`{engine,id}` records), plus
   exact employee-ID associations in this app's `backups/before-*.json` snapshots.
3. Calls Codex `thread/delete` and Claude SDK `deleteSession`; removes exact ID
   entries in native session-name/history indexes. Other native IDs are preserved.
4. Deletes `transcripts/<employee-id>.json`, cached host conversation data and the
   employee record, and closes its displayed conversation. Work folders are kept.

An already-missing native session is safe to retry. A real native/API failure keeps
its employee record and references for retry, rather than silently reporting success.
Shared references from another current employee block deletion. Codex must support
`thread/delete` (verified with 0.145.0); cleanup performs no inference. Native profile
locations respect `CODEX_HOME` and `CLAUDE_CONFIG_DIR` just as engine startup does.
`session.close` still stops a live session while retaining history.


## Cloud Team configuration and inheritance

`group.add` and `group.configure` accept `mode:"cloud"` and a `remote` object:

```json
{"name":"Backend","mode":"cloud","remote":{"host":"ubuntu@203.0.113.10","directory":"/home/ubuntu/project","os":"linux","port":22}}
```

Optional connection fields: `identityFile`, `knownHosts`, `sshConfig`, `jump`.
CLI flags: `--remote-host`, `--remote-dir`, `--remote-os`, `--ssh-port`, `--ssh-key`,
`--known-hosts`, `--ssh-config`, `--ssh-jump`, on `group add/configure --mode cloud`.
Team creation checks and canonicalizes the existing root over SSH, without creating
a corresponding local project directory. Work and Build Teams use local folders.

`card.create/update`, `card.move`, and `session.new` inherit their Team's execution
location. They reject per-employee `remote` overrides. `--directory-mode default`
creates a same-name cloud child folder; `bind` checks an existing root or descendant.
Relative paths are based on the cloud Team root. Traversal and outward symlinks are
rejected. An explicit `--cwd . --directory-mode bind` can bind the Team root.
Persisted employees store their actual `cwd`; API replies include a read-only
`remote` projection from the Team. SSH settings are stored only on the Team.

Changing a cloud connection validates all employee directories at the destination,
closes idle engines/terminals and rebinds their relative paths. It does not move files.
Current resume IDs are reset but historical native IDs remain linked for deletion.
Busy agents block changes. Changing Team type with existing employees is rejected.
Version 0.12 per-employee connections are backed up and moved into corresponding
cloud Teams on startup; local teammates, employee names, files and native IDs remain.

`remote.check {team}`, `{employee}`, or `{remote}` tests SSH and the target folder
without inference. Connections use SSH batch authentication and known_hosts; there
is no password popup or automatic trust. Model credentials remain local. Remote
permissions are those of the SSH user; the UI never presents them as a local sandbox.
A deleted remote working directory is reported explicitly by `remote.check`,
`session.open` and `workspace.*`. Retrying does not recreate deleted data. Restore
the original directory or bind an existing one through `card.update --cwd PATH
--directory-mode bind`; the employee and its visible conversation are retained.

`workspace.* {team}` and `{employee}` select the remote backend for cloud Teams.
File operations use the same schema and conflict checks as local workspaces. Native
session and terminal snapshots report the employee's remote cwd. No project mirror
is created, and an SSH failure never falls back to local file operations.

## Headless engine and conversation control

`config.engine {id,engine:"codex"|"claude"}` / `agents config engine ID ENGINE`
accepts an employee ID or live session ID. It switches the stored employee engine,
closes the old idle engine, retains the same employee and saved transcript, preserves
old native IDs, and leaves terminals running. Open the employee again using
`session.open`; the UI invokes those same two commands. `card.update --engine` uses
the same behavior. New Codex context defaults to `gpt-5.6-luna` and `low`; Claude uses
its configured default model. Busy switches are rejected before changing records.

`config.model`, `config.thinking`, `config.effort`, `config.permission`, approvals,
`session.send`, `session.follow`, `session.interrupt` and history reading all work
against `agents serve` without a GUI. `session.transcript` accepts an employee ID,
including when no live engine exists, or a current live session ID. Codex exposes
reasoning through effort; its unsupported thinking toggle stays disabled.

## Interactive terminals

| API | Args | Result |
| --- | --- | --- |
| `terminal.open` | `{employee,cols?:100,rows?:24}` | `{id,employee,cwd,host?,running}` |
| `terminal.list` | `{employee?}` | Terminal metadata array |
| `terminal.input` | `{id,data}` | Writes raw text/control characters to PTY |
| `terminal.read` | `{id,cursor?:0}` | Metadata plus `{output,cursor,reset}` |
| `terminal.resize` | `{id,cols,rows}` | Updates PTY rows/columns |
| `terminal.close` | `{id}` | Stops and removes that terminal |

CLI: `agents terminal open --employee ID`, `terminal list --employee ID`,
`terminal input ID --data TEXT --enter`, `terminal input ID --file FILE`,
`terminal read ID --cursor N`, `terminal resize ID --cols N --rows N`,
`terminal close ID`. Input may include Ctrl+C (`\u0003`); `--enter` appends CR.
Read cursors count decoded JS string units. Output retains the last 256 KB;
`reset:true` means older output was truncated. `terminal:data {id}` and
`terminal:changed` notify desktop clients to read or refresh.

PTYs start in the employee working directory. A remote terminal uses SSH with a
remote PTY and the selected remote cwd. Shell cwd/environment persist between
inputs. New terminals always start from the employee root, regardless of where
an existing terminal navigated. Closing a conversation keeps its terminals;
closing a terminal, changing execution target, employee/Team removal or app exit
cleans up its processes. Workfiles remain untouched. Terminal shells run with the
human user's local/SSH account permissions. Agent tools still obey their own Work
scope or Tunnel routing configuration.

`view.open`, `view.close`, and `view.details` flush file edits through these same
workspace APIs. Save conflicts keep the editor open; the user can explicitly
reload the current disk version. File editor and terminal are available for both
local and remote conversations.


## Native cloud execution and context audit

Browser plugin (independent Git repository at `PlugIns/browser`):

```sh
agents group add Web --mode work --plugin browser
agents plugin call browser browser.page.add --team Web --params '{"url":"http://10.92.35.208:8000/","title":"服务器监控","note":"云主机仪表盘"}'
agents plugin call browser browser.pages --team Web
agents plugin call browser browser.page.open --team Web --params '{"id":"PAGE_ID"}'
agents plugin open browser --team Web
```

`browser.current`, `browser.home`, `browser.pages`, `browser.page.add`,
`browser.page.open`, `browser.page.update`, `browser.page.remove`,
`browser.page.thumbnail`, `browser.open`, `browser.back`, `browser.forward`,
`browser.reload` and `browser.read` use one shared CLI/runtime request API.
The two views are the saved-page home screen and the current website. The
Chromium webview renders site scripts/CSS and saves screenshots through the
same `browser.page.thumbnail` API available in the CLI. Names, annotations,
URLs, thumbnails and view state persist under `.agents-browser/` in the selected
workspace. Previous bookmark records migrate into page cards with their IDs intact.
Only the browser plugin is allowed to attach a guest view; guest Node APIs are
disabled and only HTTP/HTTPS navigation is accepted. See
[`PlugIns/browser/API.md`](../PlugIns/browser/API.md) for its workspace, errors and
exact command schema. The host Git repository ignores all plugin source trees;
plugin code must be committed within each plugin directory.

Full request auditing (including tool definitions) and native tool routing verification:
`node test/native-execution-test.mjs` uses a local model fixture with no inference.
Set `AGENTS_COMPANY_LIVE_HOST` and `AGENTS_COMPANY_LIVE_ROOT` to check an authorized SSH machine.
Unlike the native startup-only debug view, this captures the actual outgoing model request.

Cloud Codex employees use the native execution protocol and ordinary command/file tools.
If the remote executor misses Codex's 10-second initialization deadline, the
host closes that failed connection and makes one fresh remote connection before
starting any model turn. A second failure is reported; commands never fall back
to the Mac. The retry retains the employee's native thread ID and transcript.
Run `AGENTS_COMPANY_WINDOWS_MESSAGE_LIVE=1 node test/windows-message-live-test.mjs`
for a single real `gpt-5.6-luna` / `low` CLI turn against an isolated Windows
employee; the test independently checks that the tool output names its Windows
working directory.
Routing configuration is process-side only: no Tunnel MCP, generated routing AGENTS.md,
or routing developer instructions are sent to the model. Host-side skills, plugins and
memory injection/generation are disabled for these cloud turns, without editing global settings.
The target must have `codex exec-server --listen stdio`; incompatibility is reported, with no local fallback.
Legacy cloud Codex contexts are restarted once to avoid resending old routing instructions;
the host transcript and native IDs retained for deletion remain intact.
Claude's existing MCP adapter is separate and has not been converted to native execution.

Cloud Claude sessions expose only the five Tunnel tools (`execute`, `read_file`,
`write_file`, `edit_file`, `list_files`). `PreToolUse` denies every other tool;
the permission callback applies the same rule and cannot approve local execution.
Plan mode permits only `read_file` and `list_files`. Built-in tools and permission
bypass are disabled. User/project/local settings are not loaded, so local startup
Hooks, plugins and permission rules cannot run inside a cloud session. Provider
authentication, model aliases and proxy/certificate environment values are retained
from user settings via the child environment, never command-line settings JSON.
The added prompt still contains only cloud location, remote API usage and OS type.

Codex uses native remote execution, with no local execution environment or local
Hooks. An unavailable directory or disconnected SSH transport fails instead of
falling back to Mac execution. These are runtime/tool restrictions, not an OS sandbox
around the host controller, which still runs the CLI and SSH transport on the Mac.
See [cloud safety verification](artifacts/cloud-safety/README.md) for real GPT rounds
and forced invalid-tool tests. Existing processes require reconnection to load changes.

`settings.set.pageZoom` (`--page-zoom`) is persisted independently of canvas zoom; range 0.75–1.5, default 1. The desktop applies the same setting for Cmd/Ctrl +, − and 0. File-tree drafts are not filesystem objects: Enter submits `workspace.write`/`mkdir`/`move`; Escape or clicking elsewhere cancels.

Additional community avatar IDs: `woodi`, `marmalade`, `voltcoin`, `inky`, `byte`,
`wondercube`. Set them with `agents card create --avatar ...` or
`agents card update ID --avatar ...`. Original classic sprite IDs remain available.
Legacy hand-drawn IDs remain accepted as aliases to replacement sprites so existing
employees and CLI integrations keep working. Attribution is in THIRD_PARTY_NOTICES.md.

## Resizable workbench and live office activity

`agents settings set --explorer-width 280 --terminal-height 260` persists pane sizes
without a window. Explorer range: 140–520 CSS px; terminal range: 120–600 CSS px.
The desktop constrains their displayed size on small windows. Both separators support
pointer dragging and arrow keys; Home/End set minimum/maximum sizes.

`agents session activity <id>` returns `null` while idle or before the engine emits
content. Otherwise it returns `{kind: "speech"|"thinking"|"tool", text, tool?, detail?,
running?}`. This is also `activityPreview` in `session snapshot` and `session list --live`.
Only the current turn's engine-published text/thinking summary/tool input and output
are shown; excerpts keep the most recent 360 characters. No hidden reasoning is inferred.
The office uses solid speech bubbles, dashed thinking bubbles and monospace tool bubbles.

`card.place` constrains the full 190×250 employee footprint to its Team's actual shape,
even with snapping off. The frame never grows from a manual drag. Resizing/changing a
Team repositions existing employees inside it, and unusably narrow shapes are rejected.
Legacy out-of-bounds seats are normalized by the shared layout and saved on the next
placement/resize. Team interiors drag the whole Team; the plain top-center name remains
the click/keyboard entry to its workspace. Resizing uses the outline, without a corner button.

Windows cloud Teams use `--remote-os windows` and a drive-qualified working path,
for example `C:\Users\djf\AgentsCompany`. RDP bookmarks do not replace SSH
connectivity. With a configured SSH alias:

```sh
agents remote check --remote-host bupt-windows --remote-os windows --remote-dir 'C:\Users\djf\AgentsCompany'
agents group add 'BUPT Windows' --mode cloud --remote-host bupt-windows --remote-os windows --remote-dir 'C:\Users\djf\AgentsCompany'
agents card create --title Fireball --group 'BUPT Windows' --avatar fireball --engine codex --model gpt-5.6-luna --effort low
```

The terminal runs PowerShell. Native Codex tools execute through the selected
Windows environment without transport instructions in model context. Authentication
for the model stays on the Mac; no model login is needed on the Windows executor.

<!-- BEGIN GENERATED CLI COMMAND INDEX -->
## 全部 CLI 命令索引

下面 116 项来自共享协议 `src/shared/protocol.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。

| 命令 | 参数 | 作用 | 对应界面 |
| --- | --- | --- | --- |
| <code>agents schedule schema</code> | <code>—</code> | Describe the host scheduling contract | CLI 调度基础，供插件复用 |
| <code>agents schedule status</code> | <code>—</code> | Read scheduler health and active runs | CLI 调度基础，供插件复用 |
| <code>agents schedule list</code> | <code>[--employee ID --source PLUGIN]</code> | List persistent schedules | CLI 调度基础，供插件复用 |
| <code>agents schedule get</code> | <code>ID</code> | Read a schedule | CLI 调度基础，供插件复用 |
| <code>agents schedule create</code> | <code>--spec @file.json &#124; --name NAME --employee ID --prompt TEXT --at ISO</code> | Create an employee task schedule | CLI 调度基础，供插件复用 |
| <code>agents schedule update</code> | <code>ID --patch @file.json</code> | Update a schedule while idle | CLI 调度基础，供插件复用 |
| <code>agents schedule pause</code> | <code>ID</code> | Pause future occurrences | CLI 调度基础，供插件复用 |
| <code>agents schedule resume</code> | <code>ID</code> | Resume from the next future occurrence | CLI 调度基础，供插件复用 |
| <code>agents schedule delete</code> | <code>ID</code> | Cancel active runs and delete the schedule, keeping audit history | CLI 调度基础，供插件复用 |
| <code>agents schedule preview</code> | <code>[ID &#124; --spec @file.json] [--after ISO --count N]</code> | Preview future occurrences without executing | CLI 调度基础，供插件复用 |
| <code>agents schedule run</code> | <code>ID</code> | Run once now without consuming the next scheduled occurrence | CLI 调度基础，供插件复用 |
| <code>agents schedule history</code> | <code>[ID] [--employee ID --limit N]</code> | Read durable run status and conversation IDs | CLI 调度基础，供插件复用 |
| <code>agents schedule cancel</code> | <code>RUN_ID</code> | Cancel an active scheduled turn | CLI 调度基础，供插件复用 |
| <code>agents settings get</code> | <code>—</code> | Read theme and pointer sensitivity | 应用设置 |
| <code>agents settings set</code> | <code>[--theme white&#124;light&#124;space&#124;black&#124;midnight&#124;sage] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on&#124;off]</code> | Persist appearance and canvas controls | 背景和灵敏度 |
| <code>agents view get</code> | <code>—</code> | Read service-owned navigation, including without a window | 当前面板 |
| <code>agents view open</code> | <code>home&#124;team&#124;employee&#124;workspace&#124;conversation&#124;plugin&#124;settings [--name NAME] [--employee ID] [--plugin ID]</code> | Open a form, workspace or employee conversation | 打开资料或会话 |
| <code>agents view close</code> | <code>—</code> | Close the current panel after saving workspace edits; keep engines running | × / Escape / 收起面板 |
| <code>agents view details</code> | <code>on&#124;off</code> | Show or hide employee details inside a conversation | 员工资料 / 返回会话 |
| <code>agents status</code> | <code>—</code> | Is the app running, and how many sessions are live | The app window being open |
| <code>agents session list</code> | <code>--live</code> | List stored cards (or live sessions with --live) | The company floor |
| <code>agents session new</code> | <code>[--engine claude&#124;codex] [--group NAME] [--model M]</code> | Create a session | “+ Hire employee” |
| <code>agents session rename</code> | <code>&lt;card-or-session-id&gt; &lt;title&gt;</code> | Compatibility endpoint; employee names are immutable | 会话名称 / 员工名牌 |
| <code>agents session open</code> | <code>&lt;cardId&gt;</code> | Open a stored card (resumes its engine context) | Clicking a card |
| <code>agents session send</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Send a message to a session | Typing in the composer |
| <code>agents session follow</code> | <code>&lt;id&gt; [--raw]</code> | Stream a session’s events until its turn ends | Watching the transcript |
| <code>agents session transcript</code> | <code>&lt;id&gt; [--thinking]</code> | Print a session’s conversation as text | The transcript pane |
| <code>agents session interrupt</code> | <code>&lt;id&gt;</code> | Stop the current turn | The “■ Stop” button |
| <code>agents session close</code> | <code>&lt;id&gt;</code> | Close a live session | Leaving the session view |
| <code>agents session info</code> | <code>&lt;id&gt;</code> | Show a live session’s engines, models, commands | The toolbar dropdowns |
| <code>agents session activity</code> | <code>&lt;id&gt;</code> | Current speech, published thinking or tool preview; null when idle | 员工活动气泡 |
| <code>agents session snapshot</code> | <code>&lt;id&gt;</code> | Full frontend state | The conversation and toolbar |
| <code>agents session search</code> | <code>&lt;query&gt;</code> | Search employees and workspaces | Office search |
| <code>agents approval list</code> | <code>&lt;id&gt;</code> | Pending tool permissions | Permission requests |
| <code>agents approval respond</code> | <code>&lt;id&gt; &lt;requestId&gt; allow&#124;deny [--answers JSON] [--form JSON]</code> | Answer a tool permission | Allow / Decline |
| <code>agents config engine</code> | <code>&lt;card-or-live-id&gt; codex&#124;claude</code> | Switch employee engine while preserving conversation history | 引擎选择 |
| <code>agents config model</code> | <code>&lt;id&gt; &lt;model&gt;</code> | Change model | Model dropdown |
| <code>agents config permission</code> | <code>&lt;id&gt; &lt;mode&gt;</code> | Change permission mode | 🔒 dropdown |
| <code>agents config thinking</code> | <code>&lt;id&gt; on&#124;off</code> | Toggle thinking | 🧠 toggle |
| <code>agents config effort</code> | <code>&lt;id&gt; &lt;level&#124;default&gt;</code> | Change effort level | ⚡ dropdown |
| <code>agents config plan</code> | <code>&lt;id&gt; on&#124;off</code> | Switch the official planning mode | 计划模式 |
| <code>agents external open</code> | <code>&lt;https-url&gt;</code> | Validate an external URL and open it when a desktop is attached | 原生授权链接 |
| <code>agents engine inspect</code> | <code>&lt;id&gt; [capabilities&#124;skills&#124;mcp&#124;account&#124;usage&#124;config]</code> | Inspect native engine capabilities and configuration | 引擎工具面板 |
| <code>agents engine skill</code> | <code>&lt;id&gt; &lt;name&gt; [prompt]</code> | Invoke a discovered engine skill | 使用技能 |
| <code>agents session steer</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Append instructions to the active native turn | 运行中追加 |
| <code>agents session background</code> | <code>&lt;id&gt;</code> | List agent-owned background terminals | 后台进程 |
| <code>agents session background-stop</code> | <code>&lt;id&gt; [--process ID]</code> | Stop one or all agent-owned background terminals | 停止后台进程 |
| <code>agents session review</code> | <code>&lt;id&gt; [--base BRANCH&#124;--commit SHA&#124;--instructions TEXT]</code> | Run native Codex review for a chosen target | /review |
| <code>agents session enqueue</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Queue a message after the active turn | 排队发送 |
| <code>agents session queue</code> | <code>&lt;id&gt;</code> | List queued messages | 待发送消息 |
| <code>agents session dequeue</code> | <code>&lt;id&gt; &lt;messageId&gt;</code> | Remove a queued message | 取消排队 |
| <code>agents session export</code> | <code>&lt;id&gt; [--format markdown&#124;json] [--path RELATIVE]</code> | Export conversation into the employee workspace | 导出会话 |
| <code>agents view tools</code> | <code>&lt;skills&#124;mcp&#124;account&#124;usage&#124;config&#124;export&#124;off&gt;</code> | Open or close the engine tools panel | 引擎工具面板 |
| <code>agents config fast</code> | <code>&lt;id&gt; on&#124;off</code> | Set the official Fast service tier | Fast 速度开关 |
| <code>agents commands run</code> | <code>&lt;id&gt; /command [args]</code> | Execute a discovered slash command through shared Core | 斜杠命令 |
| <code>agents commands list</code> | <code>&lt;id&gt; [--filter X] [--all]</code> | Slash commands available to a session | The “/” menu |
| <code>agents commands complete</code> | <code>&lt;id&gt; &lt;name&gt;</code> | What Tab would insert | Tab/⏎ in the “/” menu |
| <code>agents group list</code> | <code>—</code> | List departments | Department headings |
| <code>agents group add</code> | <code>&lt;name&gt; [--mode work&#124;build&#124;cloud] [--plugin ID] [--remote-host HOST --remote-dir PATH]</code> | Create a Team and its shared execution environment | “+ Department” |
| <code>agents group configure</code> | <code>&lt;name&gt; --mode work&#124;build&#124;cloud [--plugin ID] [--remote-host HOST --remote-dir PATH]</code> | Configure Team plugin or shared SSH connection | Team 工作方式与连接 |
| <code>agents group remove</code> | <code>&lt;name&gt;</code> | Delete a department | × beside a department |
| <code>agents room place</code> | <code>&lt;name&gt; --col N --row N [--w N --h N]</code> | Position a department’s room on the floor | Dragging a room by its sign |
| <code>agents card rename</code> | <code>&lt;cardId&gt; &lt;title&gt;</code> | Compatibility endpoint; employee names are immutable | ✎ on a card |
| <code>agents card move</code> | <code>&lt;cardId&gt; &lt;group&gt; [--before id] [--cwd existing-path]</code> | Move an employee between Teams; --cwd binds an existing folder | Dragging a card |
| <code>agents card remove</code> | <code>&lt;cardId&gt;</code> | Remove an employee and all associated host/native conversations, keeping work files | 移除员工及全部会话 |
| <code>agents card clone</code> | <code>&lt;id&gt; --title NAME [--directory-mode default&#124;bind] [--cwd PATH]</code> | Clone an employee with an independent native conversation | 克隆员工 |
| <code>agents card create</code> | <code>--title NAME [--engine E] [--avatar cat]</code> | Hire an idle employee without starting an engine | 添加员工 |
| <code>agents card update</code> | <code>&lt;cardId&gt; [--avatar fox] [--role ROLE] [--color HEX]</code> | Edit an employee and its avatar | 员工资料 |
| <code>agents group rename</code> | <code>&lt;name&gt; &lt;newName&gt;</code> | Compatibility endpoint; Team names are immutable | 部门设置 |
| <code>agents room design</code> | <code>&lt;name&gt; [--theme sage] [--wall windows] [--desk oak]</code> | Replace room surfaces and furnishings | 空间设计 |
| <code>agents group migrate</code> | <code>&lt;name&gt;</code> | Move a legacy Team into its managed directory, preserving files | 修复旧工作目录 |
| <code>agents group root</code> | <code>&lt;name&gt; &lt;absolute-folder&gt;</code> | Bind an external Team root | Team 外部文件夹 |
| <code>agents room bounds</code> | <code>&lt;name&gt; --x N --y N --width N --height N [--shape S] [--arrangement A]</code> | Move and resize a canvas room | 拖动、缩放 Team |
| <code>agents room layout</code> | <code>&lt;name&gt;</code> | Computed bounds and full-size employee positions | Team 画布布局 |
| <code>agents card place</code> | <code>&lt;id&gt; --x N --y N [--snap on&#124;off] [--zoom N]</code> | Place an employee freely or snap to nearby seats | 拖动员工 |
| <code>agents canvas view</code> | <code>—</code> | Read viewport position and zoom | 画布视野 |
| <code>agents canvas set</code> | <code>--x N --y N --zoom N</code> | Pan and zoom the canvas | 平移、缩放画布 |
| <code>agents plugin list</code> | <code>—</code> | List installed software plugins | Team 工作空间插件 |
| <code>agents plugin describe</code> | <code>&lt;id&gt;</code> | Read a plugin manifest, API schema and Markdown guide | 插件信息 |
| <code>agents plugin install</code> | <code>&lt;directory&gt;</code> | Install a compatible local plugin package | CLI 安装插件 |
| <code>agents plugin call</code> | <code>&lt;id&gt; &lt;method&gt; --team NAME [--params JSON]</code> | Invoke a plugin API inside a Team workspace | 插件中的操作 |
| <code>agents plugin open</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open or focus an independent plugin window | 独立插件窗口 |
| <code>agents plugin windows</code> | <code>—</code> | List plugin window state, also in headless mode | 独立插件窗口 |
| <code>agents plugin place</code> | <code>&lt;windowId&gt; --x N --y N --width N --height N</code> | Move and resize a plugin window | 独立插件窗口 |
| <code>agents plugin mode</code> | <code>&lt;windowId&gt; normal&#124;minimized&#124;maximized&#124;fullscreen</code> | Change native plugin window state | 插件窗口最小化、还原与全屏 |
| <code>agents plugin dismiss</code> | <code>&lt;windowId&gt;</code> | Save and close an independent plugin window | 独立插件窗口 |
| <code>agents plugin view</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open a plugin view in its managed root or selected scope | Team 工作空间 |
| <code>agents plugin close</code> | <code>&lt;viewId&gt;</code> | Close an embedded plugin view | 关闭工作空间 |
| <code>agents workspace docs</code> | <code>--team NAME</code> | Refresh standardized CLI documentation in the workspace | 自动准备 Agent 文档 |
| <code>agents workspace suggest</code> | <code>--team NAME</code> | Suggest an external workspace directory without changing files | 默认工作目录 |
| <code>agents workspace choose</code> | <code>[--path PATH]</code> | Choose a folder in the desktop directory picker | 选择文件夹 |
| <code>agents remote check</code> | <code>--team NAME &#124; --employee ID &#124; --remote-host HOST --remote-dir PATH</code> | Check SSH authentication and remote working directory | 测试云主机连接 |
| <code>agents terminal open</code> | <code>--employee ID [--cols N --rows N]</code> | Open a PTY in the employee working directory | 新建终端 |
| <code>agents terminal list</code> | <code>[--employee ID]</code> | List employee terminals | 终端标签 |
| <code>agents terminal read</code> | <code>ID [--cursor N]</code> | Read terminal output since an offset | 终端输出 |
| <code>agents terminal input</code> | <code>ID --data TEXT [--enter]</code> | Send terminal input, including control keys | 终端输入 |
| <code>agents terminal resize</code> | <code>ID --cols N --rows N</code> | Resize the PTY | 终端尺寸 |
| <code>agents terminal close</code> | <code>ID</code> | Close a terminal and its shell | 关闭终端 |
| <code>agents workspace list</code> | <code>[path] --team NAME</code> | List real workspace files | 文件目录 |
| <code>agents workspace image</code> | <code>&lt;path&gt; --employee ID&#124;--team NAME</code> | Read a scoped image for preview or model input | 图片预览和附件 |
| <code>agents workspace read</code> | <code>&lt;path&gt; --team NAME</code> | Read a workspace file | 文件预览 |
| <code>agents workspace write</code> | <code>&lt;path&gt; --team NAME --content TEXT [--hash HASH]</code> | Save a workspace file | 保存文件 |
| <code>agents workspace mkdir</code> | <code>&lt;path&gt; --team NAME</code> | Create a folder | 新建文件夹 |
| <code>agents workspace move</code> | <code>&lt;path&gt; --to PATH --team NAME</code> | Rename or move a file | 重命名文件 |
| <code>agents workspace trash</code> | <code>&lt;path&gt; --team NAME</code> | Move a file to recoverable workspace trash | 移到回收站 |
| <code>agents workspace restore</code> | <code>--id ID --team NAME</code> | Restore a trashed file | 撤销删除 |
| <code>agents ui view</code> | <code>—</code> | Which view is showing (home or a session) | The screen itself |
| <code>agents ui dom</code> | <code>[--sel CSS]</code> | Query the live interface | The screen itself |
| <code>agents ui text</code> | <code>—</code> | All visible text, as rendered | The screen itself |
| <code>agents ui click</code> | <code>&lt;selector&gt;</code> | Click an element in the interface | That click |
| <code>agents ui type</code> | <code>&lt;selector&gt; &lt;text&gt;</code> | Type into an input | That typing |
| <code>agents ui wait</code> | <code>&lt;selector&gt; [--timeout ms]</code> | Wait for an element to appear | Waiting for the UI to catch up |
| <code>agents ui style</code> | <code>&lt;selector&gt;</code> | Computed styles of an element | How it actually looks |
| <code>agents ui screenshot</code> | <code>&lt;path&gt;</code> | Save a screenshot | Rendered interface |
| <code>agents ui drag</code> | <code>&lt;selector&gt; --dx N --dy N</code> | Drag a rendered component | 拖动控件 |
| <code>agents ui wheel</code> | <code>&lt;selector&gt; --dx N --dy N [--zoom]</code> | Pan or zoom with the mouse wheel | 画布滚轮 |

另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。
<!-- END GENERATED CLI COMMAND INDEX -->

## 定时任务完整规范

以下为宿主调度器全文，包括一次性、间隔和按周任务、时区与工作时段、模型/思考覆盖、运行记录和取消。

### Host scheduler CLI API

## Purpose

持久化地安排某个员工在指定时间使用指定模型、思考程度执行任务。调度器属于
Agents Company Core，不依赖窗口或任何插件。CLI、未来的插件与 UI 使用同一个
`schedule.*` 协议。**本版本未向 MiniNotion 接入此调度器**；MiniNotion 原有的页面
提醒/重复事项是另一项领域功能。

`action.prompt` 是发给员工的完整指令，可以包含要执行的 CLI 命令，例如
“运行 npm test，将失败原因写入 test-report.md”。调度器不会把文本直接交给本机 shell，
而是复用员工的 Codex/Claude Code 会话。是否成功完成业务目标仍以员工结果和工作文件为准；
`succeeded` 表示引擎正常完成该轮，不是对测试、部署等业务结果的断言。

## Workspace

任务保存员工 ID，目录和权限始终由现有员工/Team 决定，执行前重新检查。
Build 使用本地目录，cloud 使用 Team 的 SSH 连接，Work 使用插件授权目录。
任务不会覆盖工作目录、切换引擎或提升权限。创建时记录员工当前引擎；员工后来切换
引擎后，需要更新任务的 `action`（省略 engine 可重新推导）再运行，防止模型错配。

## Quick start

先保持桌面应用运行，或者在终端/自己的进程管理器中运行无窗口服务：

```sh
agents serve
```

另一个终端创建任务（替换员工 ID）：

```sh
agents schedule schema --json
agents session list --json
agents schedule create --name '工作日检查' --employee EMPLOYEE_ID \
  --time 09:00 --days 1,2,3,4,5 --timezone Asia/Shanghai \
  --window 09:00-18:00 --window-days 1,2,3,4,5 \
  --model gpt-5.6-luna --effort low \
  --prompt '运行项目现有的检查命令，将结果写入 daily-check.md。' \
  --timeout 1800 --json
agents schedule preview JOB_ID --count 5 --json
agents schedule history JOB_ID --json
```

指定一次时间，必须带 UTC 偏移：

```sh
agents schedule create --name '一次检查' --employee EMPLOYEE_ID \
  --at '2026-12-01T09:00:00+08:00' --prompt-file ./task.md --json
```

每小时执行，并限制在工作日夜间（跨午夜时段归属于开始的那天）：

```sh
agents schedule create --name '夜间任务' --employee EMPLOYEE_ID \
  --every-seconds 3600 --timezone Asia/Shanghai \
  --window 22:00-02:00 --window-days 1,2,3,4,5 \
  --prompt '检查工作目录中的任务清单并处理待办。' --json
```

`--start ISO` 指定间隔锚点；省略则从创建后一个间隔开始。`--time` 不带 `--days`
表示每日；不带 `--timezone` 使用当前机器时区并在创建时固定保存。`--until ISO`
是排期和自动执行的截止时间。`--paused` 创建后暂不自动运行。`--source plugin-id`
用于未来插件查询自己创建的任务，是调用方标签，不是权限凭证。

## Commands

所有命令支持 `--json`。Socket 请求为 `{cmd:"schedule.METHOD",args:{...}}`。
返回宿主统一 `{ok:true,data:...}` 或 `{ok:false,error:"..."}`；失败 CLI 非零退出。

| CLI | Socket args | 语义 |
| --- | --- | --- |
| `schedule schema` | `{}` | 机器可读的字段、默认值、运行策略 |
| `schedule status` | `{}` | 是否运行、错误、活动 run ID、持久化路径 |
| `schedule list [--employee ID --source NAME]` | `{employee?,source?}` | 查询排期 |
| `schedule get ID` | `{id}` | 完整配置和 nextAt，null 表示没有下一次 |
| `schedule create --spec @job.json` | `{spec}` | 创建排期；也可使用上述 flags |
| `schedule update ID --patch @patch.json` | `{id,patch}` | 顶层部分更新；action/rule/window 提供完整对象；活动任务先取消 |
| `schedule pause ID` | `{id}` | 暂停后续触发，不停止当前轮 |
| `schedule resume ID` | `{id}` | 从当前时间之后重新计算，不补跑暂停期间任务 |
| `schedule preview [ID / --spec @job.json] --after ISO --count 5` | `{id?,spec?,after?,count?}` | 只计算未来时间，不执行；count 1–100 |
| `schedule run ID` | `{id}` | 明确立即执行一次，即使排期暂停/已结束；忽略日历和工作时段，保留超时与权限；不消耗 nextAt |
| `schedule history [ID] --employee ID --limit 50` | `{id?,employee?,limit?}` | 最新在前；保留最近 1000 条完成记录及全部活动记录 |
| `schedule cancel RUN_ID` | `{id:runId}` | 终止该次执行，等待引擎停止；不暂停后续排期 |
| `schedule delete ID` | `{id}` | 先暂停并取消活动执行，再删除排期；保留审计记录 |

配置例子（`engine` 创建时可省略；下例为 Claude；Codex 使用 effort，不接受 thinking）：

```json
{
  "name": "整理工作清单",
  "source": "my-plugin",
  "enabled": true,
  "action": {
    "type": "agent",
    "employeeId": "EMPLOYEE_ID",
    "engine": "claude",
    "prompt": "阅读工作目录中的任务并更新清单。",
    "model": "YOUR_CLAUDE_MODEL_ID",
    "effort": "low",
    "thinking": true
  },
  "rule": {"kind":"weekly","time":"09:00","days":[1,2,3,4,5],"timezone":"Asia/Shanghai"},
  "window": {"start":"09:00","end":"18:00","timezone":"Asia/Shanghai","days":[1,2,3,4,5]},
  "timeoutSeconds": 1800,
  "graceSeconds": 60
}
```

`rule` 还支持 `{kind:"once",at:"ISO"}`、`{kind:"interval",everySeconds:3600,anchor:"ISO"}`。
`window:null` 和 `until:null` 清除限制。模型 ID 原样交给员工引擎，权限和可用性由引擎检查，
引擎拒绝会记为失败，不会偷偷切换模型。`effort` 支持 low/medium/high/xhigh/max，
具体模型仍须支持该值。模型/思考覆盖仅用于当前轮，不写入员工持久设置，完成后恢复。

## Files

- `$AGENTS_COMPANY_HOME/schedules.json`：版本 1 配置与有界运行记录，原子替换写入。
- 员工原有 transcript：包含定时任务的指令与输出，可用 `agents session transcript EMPLOYEE_ID` 读取。
- 每次记录含 jobId、执行时的 action、scheduledAt、startedAt、finishedAt、sessionId、status、message。
- 源码：`src/shared/scheduler.ts`、`src/main/scheduler/{time,execute,service}.ts`。

## Errors

- 员工忙碌或被另一任务占用：记录 `skipped`，不会打断人工对话，也不排无限队列。
- 执行期间：可读取/查看同一会话；发送新指令、修改模型/权限/引擎或目录需要先取消任务。
- `failed`：引擎报错、目录/引擎改变、连接失败等；不自动重试有副作用的命令。
- `timed_out`：达到 timeoutSeconds，或自动执行时抵达 window/until 截止；终止当前轮。
- `cancelled`：显式取消、任务删除或正常服务关闭。`interrupted`：上次进程异常结束。
- 删除员工或 Team：关闭会话，相关任务自动停用并标记 employee_removed，不能再次运行。
- 超过 graceSeconds（默认 60 秒）的过期触发记为 skipped，一次推进到未来；不连续补跑。
- 先保存执行声明，再启动员工。重启后不重放已声明的任务；这不是外部命令“恰好一次”的保证。
  崩溃、网络断开时应先检查工作文件，再决定手动重跑。
- 时段开始包含、结束不包含；夏令时缺失时刻向后平移，重复时刻只取较早一次。
  带窗口的未来匹配最多查找 366 天，不匹配的启用排期会被拒绝。
- 系统休眠、关机或没有服务进程时不能执行。恢复后按 graceSeconds 跳过或执行，**不会自动唤醒 Mac**。
  此版本不自动修改 launchd 或登录项。损坏的调度文件停止调度并通过 status 报错，不重置文件。

## Compatibility

契约为宿主 `schedule.*` v1；通过宿主 CLI/socket 使用，不依赖 MiniNotion 或 Electron。
未来插件复用此接口，不能为宿主员工再创建自己的隐藏会话或绕过员工目录权限。
插件自有的文档提醒可以继续独立存在。本次只交付基础 API，没有新增调度界面。

验证：`npm run test:scheduler`。测试使用隔离数据与确定性引擎替身，Codex 参数固定
`gpt-5.6-luna` / `low`，没有模型推理费用。

## 全部 CLI 命令索引

下面 116 项来自共享协议 `src/shared/protocol.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。

| 命令 | 参数 | 作用 | 对应界面 |
| --- | --- | --- | --- |
| <code>agents schedule schema</code> | <code>—</code> | Describe the host scheduling contract | CLI 调度基础，供插件复用 |
| <code>agents schedule status</code> | <code>—</code> | Read scheduler health and active runs | CLI 调度基础，供插件复用 |
| <code>agents schedule list</code> | <code>[--employee ID --source PLUGIN]</code> | List persistent schedules | CLI 调度基础，供插件复用 |
| <code>agents schedule get</code> | <code>ID</code> | Read a schedule | CLI 调度基础，供插件复用 |
| <code>agents schedule create</code> | <code>--spec @file.json &#124; --name NAME --employee ID --prompt TEXT --at ISO</code> | Create an employee task schedule | CLI 调度基础，供插件复用 |
| <code>agents schedule update</code> | <code>ID --patch @file.json</code> | Update a schedule while idle | CLI 调度基础，供插件复用 |
| <code>agents schedule pause</code> | <code>ID</code> | Pause future occurrences | CLI 调度基础，供插件复用 |
| <code>agents schedule resume</code> | <code>ID</code> | Resume from the next future occurrence | CLI 调度基础，供插件复用 |
| <code>agents schedule delete</code> | <code>ID</code> | Cancel active runs and delete the schedule, keeping audit history | CLI 调度基础，供插件复用 |
| <code>agents schedule preview</code> | <code>[ID &#124; --spec @file.json] [--after ISO --count N]</code> | Preview future occurrences without executing | CLI 调度基础，供插件复用 |
| <code>agents schedule run</code> | <code>ID</code> | Run once now without consuming the next scheduled occurrence | CLI 调度基础，供插件复用 |
| <code>agents schedule history</code> | <code>[ID] [--employee ID --limit N]</code> | Read durable run status and conversation IDs | CLI 调度基础，供插件复用 |
| <code>agents schedule cancel</code> | <code>RUN_ID</code> | Cancel an active scheduled turn | CLI 调度基础，供插件复用 |
| <code>agents settings get</code> | <code>—</code> | Read theme and pointer sensitivity | 应用设置 |
| <code>agents settings set</code> | <code>[--theme white&#124;light&#124;space&#124;black&#124;midnight&#124;sage] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on&#124;off]</code> | Persist appearance and canvas controls | 背景和灵敏度 |
| <code>agents view get</code> | <code>—</code> | Read service-owned navigation, including without a window | 当前面板 |
| <code>agents view open</code> | <code>home&#124;team&#124;employee&#124;workspace&#124;conversation&#124;plugin&#124;settings [--name NAME] [--employee ID] [--plugin ID]</code> | Open a form, workspace or employee conversation | 打开资料或会话 |
| <code>agents view close</code> | <code>—</code> | Close the current panel after saving workspace edits; keep engines running | × / Escape / 收起面板 |
| <code>agents view details</code> | <code>on&#124;off</code> | Show or hide employee details inside a conversation | 员工资料 / 返回会话 |
| <code>agents status</code> | <code>—</code> | Is the app running, and how many sessions are live | The app window being open |
| <code>agents session list</code> | <code>--live</code> | List stored cards (or live sessions with --live) | The company floor |
| <code>agents session new</code> | <code>[--engine claude&#124;codex] [--group NAME] [--model M]</code> | Create a session | “+ Hire employee” |
| <code>agents session rename</code> | <code>&lt;card-or-session-id&gt; &lt;title&gt;</code> | Compatibility endpoint; employee names are immutable | 会话名称 / 员工名牌 |
| <code>agents session open</code> | <code>&lt;cardId&gt;</code> | Open a stored card (resumes its engine context) | Clicking a card |
| <code>agents session send</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Send a message to a session | Typing in the composer |
| <code>agents session follow</code> | <code>&lt;id&gt; [--raw]</code> | Stream a session’s events until its turn ends | Watching the transcript |
| <code>agents session transcript</code> | <code>&lt;id&gt; [--thinking]</code> | Print a session’s conversation as text | The transcript pane |
| <code>agents session interrupt</code> | <code>&lt;id&gt;</code> | Stop the current turn | The “■ Stop” button |
| <code>agents session close</code> | <code>&lt;id&gt;</code> | Close a live session | Leaving the session view |
| <code>agents session info</code> | <code>&lt;id&gt;</code> | Show a live session’s engines, models, commands | The toolbar dropdowns |
| <code>agents session activity</code> | <code>&lt;id&gt;</code> | Current speech, published thinking or tool preview; null when idle | 员工活动气泡 |
| <code>agents session snapshot</code> | <code>&lt;id&gt;</code> | Full frontend state | The conversation and toolbar |
| <code>agents session search</code> | <code>&lt;query&gt;</code> | Search employees and workspaces | Office search |
| <code>agents approval list</code> | <code>&lt;id&gt;</code> | Pending tool permissions | Permission requests |
| <code>agents approval respond</code> | <code>&lt;id&gt; &lt;requestId&gt; allow&#124;deny [--answers JSON] [--form JSON]</code> | Answer a tool permission | Allow / Decline |
| <code>agents config engine</code> | <code>&lt;card-or-live-id&gt; codex&#124;claude</code> | Switch employee engine while preserving conversation history | 引擎选择 |
| <code>agents config model</code> | <code>&lt;id&gt; &lt;model&gt;</code> | Change model | Model dropdown |
| <code>agents config permission</code> | <code>&lt;id&gt; &lt;mode&gt;</code> | Change permission mode | 🔒 dropdown |
| <code>agents config thinking</code> | <code>&lt;id&gt; on&#124;off</code> | Toggle thinking | 🧠 toggle |
| <code>agents config effort</code> | <code>&lt;id&gt; &lt;level&#124;default&gt;</code> | Change effort level | ⚡ dropdown |
| <code>agents config plan</code> | <code>&lt;id&gt; on&#124;off</code> | Switch the official planning mode | 计划模式 |
| <code>agents external open</code> | <code>&lt;https-url&gt;</code> | Validate an external URL and open it when a desktop is attached | 原生授权链接 |
| <code>agents engine inspect</code> | <code>&lt;id&gt; [capabilities&#124;skills&#124;mcp&#124;account&#124;usage&#124;config]</code> | Inspect native engine capabilities and configuration | 引擎工具面板 |
| <code>agents engine skill</code> | <code>&lt;id&gt; &lt;name&gt; [prompt]</code> | Invoke a discovered engine skill | 使用技能 |
| <code>agents session steer</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Append instructions to the active native turn | 运行中追加 |
| <code>agents session background</code> | <code>&lt;id&gt;</code> | List agent-owned background terminals | 后台进程 |
| <code>agents session background-stop</code> | <code>&lt;id&gt; [--process ID]</code> | Stop one or all agent-owned background terminals | 停止后台进程 |
| <code>agents session review</code> | <code>&lt;id&gt; [--base BRANCH&#124;--commit SHA&#124;--instructions TEXT]</code> | Run native Codex review for a chosen target | /review |
| <code>agents session enqueue</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Queue a message after the active turn | 排队发送 |
| <code>agents session queue</code> | <code>&lt;id&gt;</code> | List queued messages | 待发送消息 |
| <code>agents session dequeue</code> | <code>&lt;id&gt; &lt;messageId&gt;</code> | Remove a queued message | 取消排队 |
| <code>agents session export</code> | <code>&lt;id&gt; [--format markdown&#124;json] [--path RELATIVE]</code> | Export conversation into the employee workspace | 导出会话 |
| <code>agents view tools</code> | <code>&lt;skills&#124;mcp&#124;account&#124;usage&#124;config&#124;export&#124;off&gt;</code> | Open or close the engine tools panel | 引擎工具面板 |
| <code>agents config fast</code> | <code>&lt;id&gt; on&#124;off</code> | Set the official Fast service tier | Fast 速度开关 |
| <code>agents commands run</code> | <code>&lt;id&gt; /command [args]</code> | Execute a discovered slash command through shared Core | 斜杠命令 |
| <code>agents commands list</code> | <code>&lt;id&gt; [--filter X] [--all]</code> | Slash commands available to a session | The “/” menu |
| <code>agents commands complete</code> | <code>&lt;id&gt; &lt;name&gt;</code> | What Tab would insert | Tab/⏎ in the “/” menu |
| <code>agents group list</code> | <code>—</code> | List departments | Department headings |
| <code>agents group add</code> | <code>&lt;name&gt; [--mode work&#124;build&#124;cloud] [--plugin ID] [--remote-host HOST --remote-dir PATH]</code> | Create a Team and its shared execution environment | “+ Department” |
| <code>agents group configure</code> | <code>&lt;name&gt; --mode work&#124;build&#124;cloud [--plugin ID] [--remote-host HOST --remote-dir PATH]</code> | Configure Team plugin or shared SSH connection | Team 工作方式与连接 |
| <code>agents group remove</code> | <code>&lt;name&gt;</code> | Delete a department | × beside a department |
| <code>agents room place</code> | <code>&lt;name&gt; --col N --row N [--w N --h N]</code> | Position a department’s room on the floor | Dragging a room by its sign |
| <code>agents card rename</code> | <code>&lt;cardId&gt; &lt;title&gt;</code> | Compatibility endpoint; employee names are immutable | ✎ on a card |
| <code>agents card move</code> | <code>&lt;cardId&gt; &lt;group&gt; [--before id] [--cwd existing-path]</code> | Move an employee between Teams; --cwd binds an existing folder | Dragging a card |
| <code>agents card remove</code> | <code>&lt;cardId&gt;</code> | Remove an employee and all associated host/native conversations, keeping work files | 移除员工及全部会话 |
| <code>agents card clone</code> | <code>&lt;id&gt; --title NAME [--directory-mode default&#124;bind] [--cwd PATH]</code> | Clone an employee with an independent native conversation | 克隆员工 |
| <code>agents card create</code> | <code>--title NAME [--engine E] [--avatar cat]</code> | Hire an idle employee without starting an engine | 添加员工 |
| <code>agents card update</code> | <code>&lt;cardId&gt; [--avatar fox] [--role ROLE] [--color HEX]</code> | Edit an employee and its avatar | 员工资料 |
| <code>agents group rename</code> | <code>&lt;name&gt; &lt;newName&gt;</code> | Compatibility endpoint; Team names are immutable | 部门设置 |
| <code>agents room design</code> | <code>&lt;name&gt; [--theme sage] [--wall windows] [--desk oak]</code> | Replace room surfaces and furnishings | 空间设计 |
| <code>agents group migrate</code> | <code>&lt;name&gt;</code> | Move a legacy Team into its managed directory, preserving files | 修复旧工作目录 |
| <code>agents group root</code> | <code>&lt;name&gt; &lt;absolute-folder&gt;</code> | Bind an external Team root | Team 外部文件夹 |
| <code>agents room bounds</code> | <code>&lt;name&gt; --x N --y N --width N --height N [--shape S] [--arrangement A]</code> | Move and resize a canvas room | 拖动、缩放 Team |
| <code>agents room layout</code> | <code>&lt;name&gt;</code> | Computed bounds and full-size employee positions | Team 画布布局 |
| <code>agents card place</code> | <code>&lt;id&gt; --x N --y N [--snap on&#124;off] [--zoom N]</code> | Place an employee freely or snap to nearby seats | 拖动员工 |
| <code>agents canvas view</code> | <code>—</code> | Read viewport position and zoom | 画布视野 |
| <code>agents canvas set</code> | <code>--x N --y N --zoom N</code> | Pan and zoom the canvas | 平移、缩放画布 |
| <code>agents plugin list</code> | <code>—</code> | List installed software plugins | Team 工作空间插件 |
| <code>agents plugin describe</code> | <code>&lt;id&gt;</code> | Read a plugin manifest, API schema and Markdown guide | 插件信息 |
| <code>agents plugin install</code> | <code>&lt;directory&gt;</code> | Install a compatible local plugin package | CLI 安装插件 |
| <code>agents plugin call</code> | <code>&lt;id&gt; &lt;method&gt; --team NAME [--params JSON]</code> | Invoke a plugin API inside a Team workspace | 插件中的操作 |
| <code>agents plugin open</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open or focus an independent plugin window | 独立插件窗口 |
| <code>agents plugin windows</code> | <code>—</code> | List plugin window state, also in headless mode | 独立插件窗口 |
| <code>agents plugin place</code> | <code>&lt;windowId&gt; --x N --y N --width N --height N</code> | Move and resize a plugin window | 独立插件窗口 |
| <code>agents plugin mode</code> | <code>&lt;windowId&gt; normal&#124;minimized&#124;maximized&#124;fullscreen</code> | Change native plugin window state | 插件窗口最小化、还原与全屏 |
| <code>agents plugin dismiss</code> | <code>&lt;windowId&gt;</code> | Save and close an independent plugin window | 独立插件窗口 |
| <code>agents plugin view</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open a plugin view in its managed root or selected scope | Team 工作空间 |
| <code>agents plugin close</code> | <code>&lt;viewId&gt;</code> | Close an embedded plugin view | 关闭工作空间 |
| <code>agents workspace docs</code> | <code>--team NAME</code> | Refresh standardized CLI documentation in the workspace | 自动准备 Agent 文档 |
| <code>agents workspace suggest</code> | <code>--team NAME</code> | Suggest an external workspace directory without changing files | 默认工作目录 |
| <code>agents workspace choose</code> | <code>[--path PATH]</code> | Choose a folder in the desktop directory picker | 选择文件夹 |
| <code>agents remote check</code> | <code>--team NAME &#124; --employee ID &#124; --remote-host HOST --remote-dir PATH</code> | Check SSH authentication and remote working directory | 测试云主机连接 |
| <code>agents terminal open</code> | <code>--employee ID [--cols N --rows N]</code> | Open a PTY in the employee working directory | 新建终端 |
| <code>agents terminal list</code> | <code>[--employee ID]</code> | List employee terminals | 终端标签 |
| <code>agents terminal read</code> | <code>ID [--cursor N]</code> | Read terminal output since an offset | 终端输出 |
| <code>agents terminal input</code> | <code>ID --data TEXT [--enter]</code> | Send terminal input, including control keys | 终端输入 |
| <code>agents terminal resize</code> | <code>ID --cols N --rows N</code> | Resize the PTY | 终端尺寸 |
| <code>agents terminal close</code> | <code>ID</code> | Close a terminal and its shell | 关闭终端 |
| <code>agents workspace list</code> | <code>[path] --team NAME</code> | List real workspace files | 文件目录 |
| <code>agents workspace image</code> | <code>&lt;path&gt; --employee ID&#124;--team NAME</code> | Read a scoped image for preview or model input | 图片预览和附件 |
| <code>agents workspace read</code> | <code>&lt;path&gt; --team NAME</code> | Read a workspace file | 文件预览 |
| <code>agents workspace write</code> | <code>&lt;path&gt; --team NAME --content TEXT [--hash HASH]</code> | Save a workspace file | 保存文件 |
| <code>agents workspace mkdir</code> | <code>&lt;path&gt; --team NAME</code> | Create a folder | 新建文件夹 |
| <code>agents workspace move</code> | <code>&lt;path&gt; --to PATH --team NAME</code> | Rename or move a file | 重命名文件 |
| <code>agents workspace trash</code> | <code>&lt;path&gt; --team NAME</code> | Move a file to recoverable workspace trash | 移到回收站 |
| <code>agents workspace restore</code> | <code>--id ID --team NAME</code> | Restore a trashed file | 撤销删除 |
| <code>agents ui view</code> | <code>—</code> | Which view is showing (home or a session) | The screen itself |
| <code>agents ui dom</code> | <code>[--sel CSS]</code> | Query the live interface | The screen itself |
| <code>agents ui text</code> | <code>—</code> | All visible text, as rendered | The screen itself |
| <code>agents ui click</code> | <code>&lt;selector&gt;</code> | Click an element in the interface | That click |
| <code>agents ui type</code> | <code>&lt;selector&gt; &lt;text&gt;</code> | Type into an input | That typing |
| <code>agents ui wait</code> | <code>&lt;selector&gt; [--timeout ms]</code> | Wait for an element to appear | Waiting for the UI to catch up |
| <code>agents ui style</code> | <code>&lt;selector&gt;</code> | Computed styles of an element | How it actually looks |
| <code>agents ui screenshot</code> | <code>&lt;path&gt;</code> | Save a screenshot | Rendered interface |
| <code>agents ui drag</code> | <code>&lt;selector&gt; --dx N --dy N</code> | Drag a rendered component | 拖动控件 |
| <code>agents ui wheel</code> | <code>&lt;selector&gt; --dx N --dy N [--zoom]</code> | Pan or zoom with the mouse wheel | 画布滚轮 |

另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。
