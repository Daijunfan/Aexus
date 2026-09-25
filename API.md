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

### Worker employees

Every employee uses Codex or Claude Code and the same `session.*`, `config.*`, file and terminal UI/CLI. An omitted `kind` or `kind:worker` means **Local Worker**: the Coding Agent process runs on the Mac. A Local Worker in a Cloud Team still uses the existing local engine and remote Tunnel tools. `kind:cloud-native-worker` means **Cloud Native Worker**: the Coding Agent executable, auth/configuration, tools and native session records live on that Team's registered SSH host. The Team owns `hostId` and remote root; the employee cannot specify a different host or leave the Team's remote directory. Existing employees are never converted automatically. Browser is a separate saved-webpage plugin under the **B** icon and does not create employees.

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
agents config remote-admin <cloud-codex-session-id> on|off
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

`config.remote-admin` is an explicit opt-in for a cloud Codex employee that must administer its remote host (for example KVM devices and long-lived VM processes). Default is off. Enabled commands run with the SSH account's remote permissions instead of the remote workspace sandbox, after the remote executor handshake; this never enables a Mac fallback or changes the local Team policy. It is rejected for local/Work employees, Claude, and busy turns; moving the employee to another Team resets it. Read the effective `remoteAdmin` in `session.info/snapshot`. Use the normal workspace mode for document-only employees. Only the user or a globally authorized Agents Manager may grant this when the user's task explicitly authorizes remote host administration. Do not use SSH self-login to work around a denied sandbox.

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
Employee names remain immutable after creation. `group.rename OLD NEW` changes
the Team's display name and all employee membership references while keeping its
registered workspace root, employee directories, files, room layout, plugin and
cloud host binding unchanged. The folder originally generated from the Team name
is **not** renamed. The old Team name becomes available for reuse, but creation
still rejects an existing workspace root. Empty or duplicate new names are
rejected; the same name is an idempotent no-op. `card.rename`, `session.rename`
and a changed `card.update.title` still reject employee renaming. Role,
appearance and directory bindings remain editable.
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

## Employee initialization and topology layout

创建员工成功后直接返回看板，不自动弹出初始化提示框。`pending` / `running` 员工显示黄灯和“正在初始化”，完成后恢复正常忙闲灯；初始化失败保留错误／重试入口。

创建前可查询 Coding Agent 的模型列表，不创建会话、不发送推理请求：

```sh
agents engine models --engine codex --json
agents engine models --engine claude --json
agents engine models --engine codex --kind cloud-native-worker --team "Cloud Team" --json
agents settings set --default-codex-model gpt-6-luna --default-claude-model deepseek-flash
agents card create --title "Reviewer" --group "Build Team" --engine codex --model gpt-6-luna --effort low
```

`engine.models` 返回 `{models, defaultModel}`，只允许用户／已授权全局管理者调用。Local Worker 查询本机引擎；Cloud Native Worker 必须指定 Cloud Team，并从该主机查询，失败不退回本机。Claude Code 接入 DeepSeek 时返回对应的两个模型。

`settings.get/set` 的 `defaultCodexModel`、`defaultClaudeModel` 为之后创建的员工保存默认模型；空字符串恢复系统默认。`card.create --model` 优先于设置；初始化和之后的会话均使用创建时选定的模型。修改默认模型不更改已有员工。云端原生引擎未提供本机设置中的默认模型时，使用该远端模型列表的默认项。新员工表单切换 Coding Agent 时重新读取模型，不沿用另一引擎的选择。

职位为 `managementRole: employee|manager`，执行位置独立为 `kind: worker|cloud-native-worker`。Manager 和全局 Agents Manager 必须是本地引擎。所有创建、赋予职位、全局授权和启动入口都拒绝 cloud-native-worker 的 Manager 组合。SSH Team 中的本地 Manager 可以继续使用 Tunnel；云端原生 Employee 不回退本机。

`card.create --management-role manager --kind worker` 为用户／全局管理者创建本地 Manager。普通 Manager 使用 `card.create` 只能创建本 Team 的 Employee；省略 group 时由 Core 使用调用者所属 Team。后台在同一次状态提交中保存创建者和有效管理关系，不能由参数伪造内部字段。

公司手册按照目标员工实际身份生成。文件及 `AGENTS.md` / `CLAUDE.md` 引导位于 `.agents-company/employees/<employeeId>/` 隐藏目录；用户自己已有的根目录说明保留。Work 插件手册与公司说明分区共存。`workspace docs --employee ID` 可重新生成本人的手册。首次运行、恢复和职位变更均更新指令；旧会话及原生 ID 保留。

本项目 Multi-Agent 的命令是 `card.*`、`management.*`、`session.*`、`schedule.*`，不是引擎自带的 Agent / Task 或 native multi_agent。

```sh
agents management relayout --team TEAM --json
```

`management.relayout` 向用户、本 Team Manager 及拥有目标 Team 布局授权的全局员工开放。全局 Employee 只能修改其他 Team；修改自己的 Team 仍须 Manager 职位。成功返回 `{team,bounds,revision}`。招募、删除员工或同 Team 有效关系变化都会触发布局适配，把管理组和孤立员工放进合适的 Team 外框。所有坐标和关系在同次提交中保存。pending、任务输出、镜头移动和切换视图不会触发重排。

箭头为水平／垂直折线加小圆角，终点方向只允许上、下、左、右。`room.layout` 返回的员工坐标仍为 UI 的依据；`team-view.*` 不改变关系或权限。完整授权矩阵见 [PERMISSIONS.md](PERMISSIONS.md)。

## Authenticated management and collaboration

The operator UI/CLI retains complete control. Every employee has a distinct Core
identity; sending it a prompt never transfers the sender's identity or credential.
Use the role-specific handbook returned by `agents api docs` inside an employee
process. `agents help` is generated from the same command registry and is only a
catalog, not an authorization grant.

```sh
agents auth whoami --json
agents api list --json
agents api describe session.send --json
agents api docs
agents card management-role EMPLOYEE_ID manager
agents management topology --team TEAM --json
agents management request --employee EMPLOYEE_ID
# User or globally authorized Agents Manager only:
agents management request --manager MANAGER_ID --employee EMPLOYEE_ID
agents management decide RELATION_ID approve
agents management unbind RELATION_ID
# User only: global grant and credential administration
agents management global EMPLOYEE_ID on
agents auth agent-token EMPLOYEE_ID --json
agents auth revoke EMPLOYEE_ID
agents card access-mode EMPLOYEE_ID isolated
```

`auth.agent-token` explicitly returns a secret for operator-controlled integrations;
never put it in prompts or committed files. Normal employee processes receive their
own credential through their launcher. The user CLI reads `~/AgentsCompany/control.token`;
raw socket requests without authentication are rejected. Caller IDs, roles, `createdBy`,
`approvedBy`, and delegation data supplied by clients do not grant authority.

Team Managers may request relations only for themselves. Pending relations give no
control. Active control requires the Manager and an ordinary Employee to remain in
the same Team. Creating an Employee within that Team atomically records the creator
and an active management edge; deletion additionally requires the Manager to be that
creator. Ordinary arrows do not grant tool approval, execution-permission changes,
other employees' file writes, terminal input, or global host/Team/view configuration.
Global authority is separate, explicit and never drawn as cross-Team arrows.

```sh
agents session info --employee EMPLOYEE_ID
agents session status --employee EMPLOYEE_ID
agents session send --employee EMPLOYEE_ID --text "检查项目并告诉我测试结果"
agents session transcript --employee EMPLOYEE_ID --limit 100
agents session follow --employee EMPLOYEE_ID
agents session interrupt --employee EMPLOYEE_ID --expected-message-id MESSAGE_ID
agents schedule create --name "复查" --employee EMPLOYEE_ID --prompt "检查最近的修改" --at 2026-10-01T09:00:00+08:00
```

Queries do not start an engine. Sending opens/resumes the single employee session
only after authorization. An accepted send returns `messageId`; status includes the
originating principal, relation, start time and schedule run where applicable. An
accepted message is not a completed task. Slash commands are checked for the actual
operation, so `/permissions` or `/fork` cannot bypass the management policy.

Unbinding, demotion, a Team move, deletion or credential revocation invalidates the
corresponding pending messages, active delegations, future schedules and subscriptions.
Rebinding creates a new relation ID and does not resurrect old work. User tasks and
other Managers' valid delegations are preserved. Historical schedules without an
origin remain legacy operator tasks. Deletion persists a retryable `deleting` state
before native cleanup; remote failures retain references and never trigger local fallback.

**Process isolation:** Trusted employees run with their OS account privileges and
must not be described as tamper-proof. Isolated mode currently supports local macOS
processes, private native profiles and protected host credentials. Unsupported remote
or other-platform isolation fails closed. A workspace containing this running host's
source is not eligible. Switching an existing native history between execution
profiles is rejected. Locally running Managers in SSH Teams use employee-specific SSH return gateways;
remote Trusted mode still requires trusting processes that share that remote OS user.
See `ARCHITECTURE.md` for the execution and compatibility boundaries.

## Team views

The built-in `All Team` view always contains every Team and cannot be edited or
deleted. Custom views contain selected existing Teams and have independent canvas
pan/zoom. Switching views only changes what the board displays; employees, folders,
sessions and Team positions remain shared.

```bash
agents team-view list --json
agents team-view create --name '云端项目' --teams '["BUPT Linux VMs","BUPT Windows"]'
agents team-view update VIEW_ID --patch '{"name":"服务器","teams":["BUPT Linux VMs"]}'
agents team-view select VIEW_ID
agents team-view select all
agents team-view remove VIEW_ID
```

`--teams` and `--patch` also accept `@file.json`. Creating a view selects it;
`team-view.list` returns `{activeId,views:[{id,name,teams,viewport?}]}`. Names
must be unique, and unknown Teams are rejected. Renaming or deleting a Team
updates custom views. A Team created while a custom view is active joins that
view automatically. Deleting a view never deletes its Teams.

## Agent layout tools

```sh
agents office layout --json
agents office layout --team "Engineering" --json
agents room bounds "Engineering" --x 100 --y 200 --width 1200 --height 900 --json
agents card place EMPLOYEE_ID --x 430 --y 240 --snap off --json
agents management relayout --team "Engineering" --json
```

`office.layout` returns `{revision,coordinates,rooms}`. Each room has `name`, actual
`bounds`, `editable`, and employees with stable IDs, titles, roles, Team-relative
positions, full-size footprints and per-target `editable`. It contains no working
files, host credentials or conversation history. The unfiltered call returns all
Teams to the user/global staff and only the caller's Team to a Team Manager.
Ordinary Employees cannot call layout APIs.

Geometry changes reuse `room.bounds`, `room.place`, `card.place` and
`management.relayout`. A Team Manager may change its own frame and run automatic
packing, and individually move itself or linked ordinary Employees. Global staff
can edit other Teams; their own Team requires the Manager role even when globally
authorized. All target identifiers are rechecked by Core. Renaming a folder does
not grant layout authority. User-only `ui.click/type/drag/wheel` cannot be used by
Agents to bypass these limits.

Roster/active-topology changes refit only affected rooms in the same atomic state
commit. Overlapping neighboring rooms move aside, including pinned rooms; this
incidental collision displacement is not a cross-Team management grant. Existing
overlapping layouts are repaired once on startup. Camera and view selection remain
unchanged. Work directories, task ownership and management arrows do not change.

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
keeps workstations spaced apart. A changed Team stays anchored; colliding neighbors,
including pinned rooms, move aside with a 60-world-pixel gap. Roster changes refit the
frame, growing or shrinking it while preserving full-size workstations. Manual dragging
does not trigger roster re-packing. Cameras and unrelated non-colliding rooms stay fixed.

The viewport uses screen-pixel translation plus zoom (0.08–3). These operations
work from the CLI even without a desktop renderer. `ui.drag` / `ui.wheel` are
renderer diagnostics that dispatch real pointer/wheel events without opening or
focusing a window.

## Workspace enforcement and existing data

New Work roots are auto-created under the plugin's persistent source folder:
`PlugIns/<plugin>/workspaces/<Team name at creation>`. Each Team has a separate fixed root;
the App never writes new workspaces inside its own packaged resources. Existing Work
Teams keep their registered roots until explicitly migrated. Employees
must use strict subdirectories, which can be nested; exact directory aliases cannot
be assigned twice in Work. Build roots are auto-created under
`~/develop/Agents-company-projects/<Team name at creation>` and may be shared by their employees.
All paths are canonicalized; traversal and outward symlinks are rejected.

For a Work Team, `group.add NAME --mode work --plugin ID` selects that plugin's fixed
`workspaces/NAME` folder. `--root` and `--directory-mode bind` cannot choose a Work
Team folder. Build Teams still accept `--directory-mode default|bind` (`directoryMode`
in JSON); binding requires `--root` to be an existing physical folder and creates
no additional Team-named directory. `group.root NAME PATH --directory-mode bind`
changes a Build binding without moving files. Team names may change later;
the registered folder path remains the one chosen or generated at creation.
Legacy Work roots and their files stay registered; `group.migrate NAME` is an explicit
operation, never an automatic move during upgrade.

`card.create`, `card.update` and `session.new` accept `--directory-mode default|bind`
(`directoryMode` in JSON). `default` creates `<Team root>/<exact employee title>`;
Chinese, spaces and case are preserved. Path separators and `.` / `..` cannot be
used as generated folder names. A default request cannot override the derived path.
An existing employee may keep its own already-generated folder.

Employee `bind` requires an existing physical directory and never creates it. Work employee bindings
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

Team names may change without moving their directories. Empty Teams may change mode/plugin. Teams with
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
path without creating it. `AGENTS_COMPANY_WORKSPACES` overrides the Work base for
isolated deployments/tests; the plugin's `workspaceDirectory` and Team name are still
appended. `AGENTS_COMPANY_PROJECTS` overrides the Build base. `workspace choose
[--path PATH]` opens the desktop directory picker only on explicit request; CLI
callers can supply `--cwd` directly. Employee forms offer create/existing choices;
Team forms display their automatically computed directory. In the employee form,
the binding path is read-only: Build uses the macOS folder chooser; Work and Cloud
use a Team-scoped directory browser backed by `workspace.list --team NAME`.
Clicking a folder selects it, double-clicking selects and enters it, and Enter
confirms the focused folder. Work cannot select its Team root; Cloud may select
its root to grant the employee access to the whole Team tree. CLI agents may still
pass a path explicitly through `card.create/update`, under the same Core scope checks.

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

Create and manage hosts in **Cloud Hosts** (`cloud-hosts`) first. New cloud Teams can only bind an existing host ID and existing remote directory:

```sh
agents host create --data @host.json
# host.json: {"name":"GPU Server","host":"djf@10.92.35.208","os":"linux","defaultDirectory":"/home/djf"}
agents host list --json
agents host check HOST_ID --json
agents host directories HOST_ID --path /home/djf --json
agents group add Backend --mode cloud --host-id HOST_ID --remote-dir /home/djf/develop
```

JSON API: `group.add {name,mode:"cloud",hostId,directory}` and `group.configure {name,mode:"cloud",hostId,directory}`. Connection fields no longer create a host inside a Team. `host.create` accepts `name,host,os,defaultDirectory` and optional `port,identityFile,knownHosts,sshConfig,jump,distribution,password`; use `host.update ID --data @patch.json` for changes. Password omitted means unchanged; an empty string removes it. `host.list/get` expose `hasPassword`, never the secret; `host.credentials ID` explicitly returns `{id,password}`. Passwords use AES-256-GCM at rest under `~/AgentsCompany/cloud-hosts`, with a separate 0600 local key; they are obtained by SSH askpass via a 0600 local socket, never automatically passed in command arguments or model context. An explicit `host.credentials` response does contain the password, so a management Agent invoking that API can see it. This does not protect against another process with the same OS-user privileges.

`host.fingerprints ID` reads SSH server fingerprints. After independently checking with the host provider, `host.trust ID --fingerprint SHA256:...` rescans, requires an exact match, and saves the key to this host's managed known_hosts. It never disables SSH host key checks. Jump/HostKeyAlias configurations use their existing SSH trust setup.

`host.check` tests authenticated SSH reachability without requiring the host's default directory or a Team workspace. It returns `{connected,checkedAt,environment?,error?}`, stores the latest state, and immediately updates bound Team connection lamps; failure is `connected:false`. The operating system and distribution in `environment` come from the registered host configuration. `host.directories` returns `{path,entries}` containing existing child folders, not files. The Team picker can navigate to an existing directory; it does not create one. `host.remove ID` is rejected while Teams reference it. Editing connection settings closes idle employee sessions/terminals; busy workers block changes. No cloud work falls back to the Mac.

The separate Cloud Hosts plugin exposes these same commands as `hosts.list/get/create/update/remove/check/directories/credentials/fingerprints/trust` through its own CLI, schema and runtime. It is an application-scope service plugin: a Work employee receives its own document/launcher/mailbox, but its documented API manages the shared host registry across Teams. To prepare a management team:

```sh
agents group add 'Cloud Managers' --mode work --plugin cloud-hosts
agents card create --title Operator --group 'Cloud Managers'
# In that employee's generated Workspace:
./.agents-company/bin/cloud-hosts hosts.list
./.agents-company/bin/cloud-hosts hosts.update --data '{"id":"HOST_ID","patch":{"name":"GPU Lab"}}'
```

`host.exec ID --command COMMAND|--command-file FILE [--directory PATH --timeout SECONDS]` executes exclusively through the registered host's Tunnel, with no local fallback. JSON API: `{id,command,directory?,timeout?}`; returns `{stdout,stderr,exit_code,cwd}`. Each call has an independent remote working directory; timeout is 0.1–600 seconds. Check exit_code, not only the RPC envelope.

VMs can be registered with `host.create/update` using `vm:{hypervisorId,name,projectDirectory,state,access,notes?}`. State is running/stopped/paused/unknown; access is ssh/serial/rdp/unconfigured. These are actual observed asset properties, not proof of SSH reachability. Non-SSH assets remain visible but cannot masquerade as usable cloud execution hosts. Use host.exec on the hypervisor to call its existing management CLI and inspect the real VM inventory. Registration does not start, stop or reconfigure VMs. Partial vm updates merge existing properties, duplicate VM identity is rejected, and hypervisors with registered VM children cannot be removed.

Full plugin reference: `PlugIns/cloud-hosts/API.md`. Existing cloud Teams migrate automatically with backup and connection deduplication. They persist only `{mode:"cloud",hostId,directory}`; API replies hydrate the read-only `remote` projection from the registry.

Team creation checks and canonicalizes the existing root over SSH, without creating
a corresponding local project directory. Work and Build Teams use local folders.

`card.create/update`, `card.move`, and `session.new` inherit their Team's execution
location. They reject per-employee `remote` overrides. `--directory-mode default`
creates a same-name cloud child folder; `bind` checks an existing root or descendant.
Relative paths are based on the cloud Team root. Traversal and outward symlinks are
rejected. An explicit `--cwd . --directory-mode bind` can bind the Team root.
Persisted employees store their actual `cwd`; API replies include a read-only
`remote` projection from the Team. SSH accounts are stored in the shared host registry; Team stores only its host ID and directory.
The employee form lists only folders under the cloud Team root; it never asks
users to type a remote path. Browsing and selection use `workspace.list` through
the Team's remote file API, while the final `bind` call checks the selected
directory again before saving.

Cloud Native Worker uses the **remote** Codex `app-server` or Claude Code CLI through a persistent, bidirectional SSH stdio channel. It never starts the Mac Coding Agent or registers the Local Worker's Tunnel command executor. Preflight and launch share the same SSH user, host-key policy, directory and executable lookup. The CLI remains usable without any desktop window:

```sh
agents engine remote-check --team 'BUPT Linux VMs' --engine codex
agents engine remote-check --team 'BUPT Linux VMs' --engine claude
agents card create --title 'Remote engineer' --group 'BUPT Linux VMs' \
  --kind cloud-native-worker --engine codex --model gpt-6-luna --effort low \
  --directory-mode default
agents session open EMPLOYEE_ID
agents session send SESSION_ID '请查看当前工作目录，并简要说明项目结构。'
agents engine remote-sessions --team 'BUPT Linux VMs' --engine codex
agents card native-bind EMPLOYEE_ID REMOTE_NATIVE_SESSION_UUID
```

`engine.remote-check` checks SSH connectivity, the real remote folder, CLI version, Codex app-server or Claude stream-json support, and login status without sending a model prompt. `authentication` is `configured` or `unknown`; a definite sign-out is an error. It cannot prove remaining quota. The employee form runs this check after choosing the Cloud Team or engine and disables creation until it succeeds. `card.create` repeats the check **before** creating a default folder or employee record. Missing CLI, host failures or an out-of-scope path fail closed. The session page reuses the existing streaming/approval/file/terminal UI; a small cloud beneath the pet marks the process location, independently of its busy lamp.

`engine.remote-sessions` lists native histories on that host under the Team root. `card.native-bind` accepts an existing native UUID only when its remote cwd exactly matches the employee cwd and the employee has no prior conversation. It imports readable messages into the host transcript, then resumes through the remote CLI. A manually bound history is marked `external`: removing the employee removes its host view, **not** the remote original. Native histories created by Agents Company retain remote deletion ownership. Both types carry `hostId`, SSH endpoint/OS and original directory with every reference, so deletion or cloning cannot target a Mac record or another host. Codex remote cloning uses `thread/fork`; Claude remote cloning is explicitly rejected until a reliable native fork interface is available, leaving the source untouched. An existing running terminal process is not taken over; only its persisted history can be resumed. SSH disconnects never retry a model turn or fall back to the Mac.

Changing a cloud connection validates all employee directories at the destination,
closes idle engines/terminals and rebinds their relative paths. It does not move files.
Current resume IDs are reset but historical native IDs remain linked for deletion.
Busy agents block changes. Changing Team type with existing employees is rejected.
Version 0.12 per-employee connections are backed up and moved into corresponding
cloud Teams on startup; local teammates, employee names, files and native IDs remain.

`remote.check {team}`, `{employee}`, or `{remote}` tests SSH and the target folder
without inference. On success it returns the existing `info` string plus a structured
`environment` containing the remote OS and, for Linux, `distribution` and
`distributionName` from `/etc/os-release`. The Team header instead calls
`host.check` when opened, every 10 seconds, on window focus and after a manual
host check. The lamp is neutral until the first result, green for a reachable SSH
host and red otherwise. A missing Team directory can therefore leave the lamp
green while `remote.check` and workspace operations correctly report that error.
Its icon uses the registered Linux distribution or OS setting.
Connections use SSH batch authentication and known_hosts; there
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
[`PlugIns/browser/API.md`](PlugIns/browser/API.md) for its workspace, errors and
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

`agents session activity <id>` returns current published activity while working.
After completion it returns an unread speech preview until the exact reply is read,
then `null`. The shape is `{kind: "speech"|"thinking"|"tool", text, tool?, detail?,
running?, unread?, replyId?}`. This is also `activityPreview` in `session snapshot` and `session list --live`.
Working previews use the current turn's engine-published text/thinking summary/tool
input and output; live excerpts keep the most recent 360 characters. Idle unread
previews use the last answer paragraph, capped at 4000 Unicode characters, while the
full answer stays in the transcript. No hidden reasoning is inferred.
The office uses solid speech bubbles, dashed thinking bubbles and monospace tool bubbles.

`card.place` constrains the full 190×250 employee footprint to its Team's actual shape,
even with snapping off. The full wall region above the floor is a 170px Team header; employees start below it (y ≥ 182), and rooms are at least 520px high. The frame never grows from a manual drag. Resizing/changing a
Team repositions existing employees inside it, and unusably narrow shapes are rejected.
Legacy out-of-bounds seats are normalized by the shared layout and saved on the next
placement/resize. Team interiors drag the whole Team; the plain top-center name remains
the click/keyboard entry to its workspace. Resizing uses the outline, without a corner button.

Windows hosts use `os:"windows"` in Cloud Hosts and a drive-qualified working path,
for example `C:\Users\djf\AgentsCompany`. RDP bookmarks do not replace SSH
connectivity. With a configured SSH alias:

```sh
agents remote check --remote-host bupt-windows --remote-os windows --remote-dir 'C:\Users\djf\AgentsCompany'
agents host create --data '{"name":"BUPT Windows","host":"bupt-windows","os":"windows","defaultDirectory":"C:\\Users\\djf\\AgentsCompany"}'
agents group add 'BUPT Windows' --mode cloud --host-id HOST_ID --remote-dir 'C:\Users\djf\AgentsCompany'
agents card create --title Fireball --group 'BUPT Windows' --avatar fireball --engine codex --model gpt-5.6-luna --effort low
```

The terminal runs PowerShell. Native Codex tools execute through the selected
Windows environment without transport instructions in model context. Authentication
for the model stays on the Mac; no model login is needed on the Windows executor.

## Unread final replies

The stored employee and its `session.info/status/snapshot` expose optional
`lastReply: {id,itemId,text,createdAt,readAt?}`. It is created only from the completed
public assistant answer; private onboarding, thinking and tools do not create it.
The preview is the final paragraph, bounded to the last 4000 Unicode characters
with a leading ellipsis if truncated; complete text remains in the transcript.
A new answer creates a new ID even if its text repeats. Closing a native session,
switching Team views or restarting preserves unread state. Existing historical
messages are not retroactively marked unread.

```sh
agents session status --employee EMPLOYEE_ID --json
# Explicit user action only; an Agent cannot acknowledge for the user.
agents session acknowledge --employee EMPLOYEE_ID --reply-id REPLY_ID --json
```

`session.acknowledge` accepts only the exact current reply ID. It returns
`{acknowledged:true,replyId,readAt}` on success; a stale/missing current reply returns
`{acknowledged:false,replyId?}` without clearing a newer reply. Repeated successful
acknowledgements do not rewrite state. Directly patching `lastReply` is rejected.

The desktop acknowledges after the actual last-answer marker is visible in the
foreground conversation for 650 ms. Native window visibility/focus/minimization,
page focus, clipping, file tabs and obscuring dialogs are checked. A background
window can return `{acknowledged:false,reason:"window-not-active"}`. CLI queries,
subscriptions and Manager reads never imply user-read; the CLI command above is
an explicit user acknowledgement. Red dots and the final-speech bubble disappear
once read; the transcript is retained.

## Shared 文件中转站与跨主机传输

`Shared/` 是当前项目根目录下的真实本机文件夹。安装版仍指向构建时的项目目录，不把用户文件存进 App 包；文件不纳入 Git。`agents shared info --json` 返回实际路径。隔离测试或独立部署可在服务启动前设置 `AGENTS_COMPANY_SHARED_DIR`。

```sh
agents shared info --json
agents view shared on
agents workspace list . --shared --json
agents workspace mkdir incoming --shared
agents workspace write incoming/readme.md --shared --content 'Hello'
agents workspace read incoming/readme.md --shared
agents workspace move incoming/readme.md --to incoming/notes.md --shared
agents workspace trash incoming/notes.md --shared --json
agents workspace restore --id TRASH_ID --shared
agents view shared off
```

`workspace.list/read/image/write/mkdir/move/trash/restore` 均支持 `--shared`，与 `--team`、`--employee` 互斥。删除进入可恢复回收站；收起中转站不关闭员工会话，也不取消传输。

### transfer.start：复制文件或目录

业务 API 接受 `{from: FileLocation, to: FileLocation}`。CLI 的 `--from` 和 `--to` 接受 JSON 字符串或 `@文件.json`。源是文件或文件夹；目标是已有文件夹，结果使用源名称。每个位置必须指定 `path` 和下列一种范围：

| 范围 | FileLocation 示例 | 路径规则 |
| --- | --- | --- |
| 共享目录 | `{"shared":true,"path":"incoming/report.pdf"}` | 相对 Shared 根目录 |
| Team 工作区 | `{"team":"Linux","path":"reports/report.pdf"}` | 相对 Team 根目录，自动选择本地或 SSH |
| 员工工作区 | `{"employee":"EMPLOYEE_ID","path":"report.pdf"}` | 相对员工工作目录，不越过所属权限范围 |
| Mac 物理路径 | `{"local":true,"path":"/Users/me/Downloads/report.pdf"}` | 明确的本机绝对路径 |

```sh
# 本地 → Shared
agents transfer start --from '{"local":true,"path":"/Users/me/Downloads/archive.zip"}' --to '{"shared":true,"path":"incoming"}' --json
# 云端员工 → Shared
agents transfer start --from '{"employee":"EMPLOYEE_ID","path":"results"}' --to '{"shared":true,"path":"."}' --json
# Shared → 另一个云端 Team 的已有文件夹
agents transfer start --from '{"shared":true,"path":"results"}' --to '{"team":"Windows","path":"imports"}' --json
# 也可直接跨工作区复制；两个云端之间由本机分块转发
agents transfer start --from '{"team":"Linux","path":"data.bin"}' --to '{"team":"Windows","path":"incoming"}' --json
# 导出到任意已有本机文件夹
agents transfer start --from '{"shared":true,"path":"results"}' --to '{"local":true,"path":"/Users/me/Downloads"}' --json
agents transfer list --json
agents transfer get TRANSFER_ID --json
agents transfer cancel TRANSFER_ID --json
```

返回任务对象包含 `id/from/to/name/state/bytes/totalBytes/files/totalFiles/createdAt`。初始状态为 `queued` 或 `running`，终态为 `completed`、`failed`、`cancelled`。成功后 `destination` 为目标范围内的结果路径；失败时查看 `error`。必须通过 `transfer.get/list` 等到终态，不能把 `start` 返回成功误认为传输完成。扫描目录时 total 数值会增长。

复制规则：

- 保留源文件；同名目标失败，绝不自动覆盖、改名或删除。
- 支持二进制、空文件、多层目录、中文名和超过编辑器 4 MB 预览上限的大文件；使用 256 KiB 分块，内存不随整个文件大小增长。
- POSIX 之间保留文件执行/只读权限；Windows 使用本机属性，复制回 POSIX 时采用普通文件权限。
- 不复制软链接或特殊设备；目录中的 `.agents-company` 和本产品传输暂存目录跳过。路径及软链接不能越出指定工作区。
- 目标目录中的独立暂存树复制完成后才提交；失败、取消会清理暂存，源文件保持原样。断线导致清理失败时，`error` 会列出待清理路径。
- 同时最多两个任务，其余排队；最近约 100 条任务状态保留在本次服务运行内，不支持跨服务重启续传。已完成文件是永久物理文件；强制关闭应用可能中断尚未完成的任务。
- SSH 失败不会退回读取或写入 Mac 上的同名路径。

界面与这些 API 共用实现：侧栏文件夹图标展开共享中转站，员工会话可同时显示；从 Finder 或任意工作区文件栏拖入保存，再从中转站拖到另一个工作区文件夹或文件栏空白处上传。也可点击“上传本地文件”。传输列表提供路径方向、字节进度、结果、错误和取消。所有业务操作均可在 `agents serve` 无窗口完成，不需要模型推理。

<!-- BEGIN GENERATED CLI COMMAND INDEX -->
## 全部 CLI 命令索引

下面 161 项来自共享协议 `src/shared/api-registry.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。

| 命令 | 参数 | 作用 | 对应界面 | 授权策略 |
| --- | --- | --- | --- | --- |
| <code>agents auth whoami</code> | <code>—</code> | Read authenticated caller and management role | 管理与协同 | identity |
| <code>agents auth agent-token</code> | <code>ID</code> | Issue or read an employee API credential (user only) | 管理与协同 | operator |
| <code>agents auth revoke</code> | <code>ID</code> | Revoke employee API credentials (user only) | 管理与协同 | operator |
| <code>agents api list</code> | <code>—</code> | List caller-authorized APIs | 管理与协同 | identity |
| <code>agents api describe</code> | <code>COMMAND</code> | Describe an authorized API and its scope | 管理与协同 | identity |
| <code>agents api docs</code> | <code>—</code> | Read the caller role API handbook | 管理与协同 | identity |
| <code>agents office layout</code> | <code>[--team NAME]</code> | Read authorized Team bounds, employee coordinates and permitted layout actions; no filesystem access | Agent 布局工具 | layout.read |
| <code>agents session acknowledge</code> | <code>--employee ID --reply-id ID</code> | User-only acknowledgement of the exact displayed reply; stale acknowledgements do not clear newer replies | 可见回复已读 | operator |
| <code>agents management relayout</code> | <code>--team NAME</code> | Group related employees and fit this Team without changing the viewport | 整理团队拓扑 | layout.write |
| <code>agents management topology</code> | <code>[--team NAME]</code> | Read employee nodes, active relations and pending requests | 管理与协同 | topology |
| <code>agents management request</code> | <code>--employee ID [--manager ID]</code> | Request a same-Team management relation | 管理与协同 | relation |
| <code>agents management decide</code> | <code>ID approve&#124;deny</code> | Approve or deny a pending management relation | 管理与协同 | operator |
| <code>agents management unbind</code> | <code>ID</code> | Revoke a management relation and its delegations | 管理与协同 | relation |
| <code>agents management global</code> | <code>ID on&#124;off</code> | Grant or revoke global management (user only) | 管理与协同 | operator |
| <code>agents card management-role</code> | <code>ID employee&#124;manager</code> | Assign a Team management role | 管理与协同 | operator |
| <code>agents card access-mode</code> | <code>ID trusted&#124;isolated</code> | Set trusted or isolated engine execution | 管理与协同 | operator |
| <code>agents session status</code> | <code>[--employee ID]</code> | Read lightweight employee activity without full transcripts | 管理与协同 | employee.read |
| <code>agents shared info</code> | <code>—</code> | Locate the checkout Shared directory | 共享中转站物理目录 | operator |
| <code>agents view shared</code> | <code>on&#124;off</code> | Show or hide the shared transfer drawer without closing the conversation | 共享中转站侧栏 | operator |
| <code>agents transfer start</code> | <code>--from JSON&#124;@file --to JSON&#124;@file</code> | Copy a file or directory between local, shared and Team/employee workspaces | 跨工作区拖放复制 | operator |
| <code>agents transfer list</code> | <code>—</code> | List transfer progress and results for this service run | 传输列表 | operator |
| <code>agents transfer get</code> | <code>ID</code> | Read a transfer result and byte progress | 传输进度 | operator |
| <code>agents transfer cancel</code> | <code>ID</code> | Cancel a queued or running copy; preserve source files | 取消传输 | operator |
| <code>agents schedule schema</code> | <code>—</code> | Describe the host scheduling contract | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule status</code> | <code>—</code> | Read scheduler health and active runs | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule list</code> | <code>[--employee ID --source PLUGIN]</code> | List persistent schedules | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule get</code> | <code>ID</code> | Read a schedule | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule create</code> | <code>--spec @file.json &#124; --name NAME --employee ID --prompt TEXT --at ISO</code> | Create an employee task schedule | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule update</code> | <code>ID --patch @file.json</code> | Update a schedule while idle | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule pause</code> | <code>ID</code> | Pause future occurrences | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule resume</code> | <code>ID</code> | Resume from the next future occurrence | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule delete</code> | <code>ID</code> | Cancel active runs and delete the schedule, keeping audit history | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule preview</code> | <code>[ID &#124; --spec @file.json] [--after ISO --count N]</code> | Preview future occurrences without executing | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule run</code> | <code>ID</code> | Run once now without consuming the next scheduled occurrence | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule history</code> | <code>[ID] [--employee ID --limit N]</code> | Read durable run status and conversation IDs | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule cancel</code> | <code>RUN_ID</code> | Cancel an active scheduled turn | CLI 调度基础，供插件复用 | schedule |
| <code>agents settings get</code> | <code>—</code> | Read appearance controls and per-engine default employee models | 应用设置 | operator |
| <code>agents engine models</code> | <code>--engine codex&#124;claude [--kind worker&#124;cloud-native-worker] [--team NAME]</code> | List available models before employee creation, without inference; Cloud Native reads the selected host | 创建员工和默认模型设置 | operator |
| <code>agents settings set</code> | <code>[--theme white&#124;light&#124;space&#124;black&#124;midnight&#124;sage] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on&#124;off] [--default-codex-model ID] [--default-claude-model ID]</code> | Persist appearance, canvas controls and default employee models | 背景和灵敏度 | operator |
| <code>agents view get</code> | <code>—</code> | Read service-owned navigation, including without a window | 当前面板 | operator |
| <code>agents view open</code> | <code>home&#124;team&#124;employee&#124;workspace&#124;conversation&#124;initialization&#124;plugin&#124;settings [--name NAME] [--employee ID] [--plugin ID]</code> | Open a form, workspace or employee conversation | 打开资料或会话 | operator |
| <code>agents view close</code> | <code>—</code> | Close the current panel after saving workspace edits; keep engines running | × / Escape / 收起面板 | operator |
| <code>agents view details</code> | <code>on&#124;off</code> | Show or hide employee details inside a conversation | 员工资料 / 返回会话 | operator |
| <code>agents status</code> | <code>—</code> | Is the app running, and how many sessions are live | The app window being open | operator |
| <code>agents session list</code> | <code>[--live] [--summary]</code> | List stored cards (or live sessions with --live) | The company floor | employee.read |
| <code>agents session new</code> | <code>[--engine claude&#124;codex] [--group NAME] [--model M]</code> | Create a session | “+ Hire employee” | operator |
| <code>agents session rename</code> | <code>&lt;card-or-session-id&gt; &lt;title&gt;</code> | Compatibility endpoint; employee names are immutable | 会话名称 / 员工名牌 | operator |
| <code>agents session open</code> | <code>&lt;cardId&gt;</code> | Open a stored card (resumes its engine context) | Clicking a card | employee.message |
| <code>agents session send</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT</code> | Send a message to a Worker session | 对话输入框 | employee.message |
| <code>agents host fingerprints</code> | <code>&lt;id&gt;</code> | Read SSH host key fingerprints without trusting them | 查看主机指纹 | operator |
| <code>agents host trust</code> | <code>&lt;id&gt; --fingerprint SHA256:...</code> | Trust an explicitly confirmed and matching SSH host fingerprint | 确认信任主机 | operator |
| <code>agents host exec</code> | <code>&lt;id&gt; --command COMMAND&#124;--command-file FILE [--directory PATH --timeout SECONDS]</code> | Execute a management command exclusively on the registered remote host | 远端管理命令 | operator |
| <code>agents host list</code> | <code>—</code> | List registered cloud hosts without passwords | Cloud Hosts 插件 | operator |
| <code>agents host get</code> | <code>&lt;id&gt;</code> | Read a cloud host record without its password | Cloud Hosts 插件 | operator |
| <code>agents host create</code> | <code>--data @host.json</code> | Create a cloud host in the shared registry | Cloud Hosts 插件 | operator |
| <code>agents host update</code> | <code>&lt;id&gt; --data @patch.json</code> | Edit host connection and credentials | Cloud Hosts 插件 | operator |
| <code>agents host remove</code> | <code>&lt;id&gt;</code> | Remove an unbound cloud host | Cloud Hosts 插件 | operator |
| <code>agents host check</code> | <code>&lt;id&gt;</code> | Check SSH connectivity without requiring a Team working directory | Cloud Hosts 插件与 Team 连接灯 | operator |
| <code>agents host directories</code> | <code>&lt;id&gt; [--path PATH]</code> | Browse existing directories on a registered cloud host | Cloud Hosts 插件 | operator |
| <code>agents host credentials</code> | <code>&lt;id&gt;</code> | Explicitly reveal the saved host password | Cloud Hosts 插件 | operator |
| <code>agents engine remote-check</code> | <code>--team NAME --engine codex&#124;claude [--directory PATH]</code> | Check a Cloud Team native CLI, protocol, authentication and workspace before hiring | Cloud Native Worker 创建前检查 | operator |
| <code>agents engine remote-sessions</code> | <code>--team NAME --engine codex&#124;claude</code> | List native sessions on the selected Cloud Team host | 绑定已有云端会话 | operator |
| <code>agents card native-bind</code> | <code>&lt;employee-id&gt; &lt;native-session-id&gt;</code> | Bind an existing remote native session without taking deletion ownership | 绑定远端原生会话 | operator |
| <code>agents session follow</code> | <code>&lt;id&gt; [--raw]</code> | Stream a session’s events until its turn ends | Watching the transcript | employee.read |
| <code>agents session transcript</code> | <code>&lt;id&gt; [--thinking]</code> | Print a session’s conversation as text | The transcript pane | employee.read |
| <code>agents session interrupt</code> | <code>&lt;id&gt;</code> | Stop the current turn | The “■ Stop” button | employee.message |
| <code>agents session close</code> | <code>&lt;id&gt;</code> | Close a live session | Leaving the session view | operator |
| <code>agents session info</code> | <code>&lt;id&gt;</code> | Show a live session’s engines, models, commands | The toolbar dropdowns | employee.read |
| <code>agents session activity</code> | <code>&lt;id&gt;</code> | Current speech, published thinking or tool preview; null when idle | 员工活动气泡 | employee.read |
| <code>agents session snapshot</code> | <code>&lt;id&gt;</code> | Full frontend state | The conversation and toolbar | employee.read |
| <code>agents session search</code> | <code>&lt;query&gt;</code> | Search employees and workspaces | Office search | operator |
| <code>agents approval list</code> | <code>&lt;id&gt;</code> | Pending tool permissions | Permission requests | operator |
| <code>agents approval respond</code> | <code>&lt;id&gt; &lt;requestId&gt; allow&#124;deny [--answers JSON] [--form JSON]</code> | Answer a tool permission | Allow / Decline | operator |
| <code>agents config engine</code> | <code>&lt;card-or-live-id&gt; codex&#124;claude</code> | Switch employee engine while preserving conversation history | 引擎选择 | operator |
| <code>agents config model</code> | <code>&lt;id&gt; &lt;model&gt;</code> | Change model | Model dropdown | employee.configure |
| <code>agents config remote-admin</code> | <code>&lt;id&gt; on&#124;off</code> | Explicitly authorize SSH-user administration on a cloud Codex worker; never local execution | 远端主机管理权限 | operator |
| <code>agents config permission</code> | <code>&lt;id&gt; &lt;mode&gt;</code> | Change permission mode | 🔒 dropdown | operator |
| <code>agents config thinking</code> | <code>&lt;id&gt; on&#124;off</code> | Toggle thinking | 🧠 toggle | employee.configure |
| <code>agents config effort</code> | <code>&lt;id&gt; &lt;level&#124;default&gt;</code> | Change effort level | ⚡ dropdown | employee.configure |
| <code>agents config plan</code> | <code>&lt;id&gt; on&#124;off</code> | Switch the official planning mode | 计划模式 | employee.configure |
| <code>agents external open</code> | <code>&lt;https-url&gt;</code> | Validate an external URL and open it when a desktop is attached | 原生授权链接 | operator |
| <code>agents engine inspect</code> | <code>&lt;id&gt; [capabilities&#124;skills&#124;mcp&#124;account&#124;usage&#124;config]</code> | Inspect native engine capabilities and configuration | 引擎工具面板 | operator |
| <code>agents engine skill</code> | <code>&lt;id&gt; &lt;name&gt; [prompt]</code> | Invoke a discovered engine skill | 使用技能 | operator |
| <code>agents session steer</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Append instructions to the active native turn | 运行中追加 | operator |
| <code>agents session background</code> | <code>&lt;id&gt;</code> | List agent-owned background terminals | 后台进程 | operator |
| <code>agents session background-stop</code> | <code>&lt;id&gt; [--process ID]</code> | Stop one or all agent-owned background terminals | 停止后台进程 | operator |
| <code>agents session review</code> | <code>&lt;id&gt; [--base BRANCH&#124;--commit SHA&#124;--instructions TEXT]</code> | Run native Codex review for a chosen target | /review | operator |
| <code>agents session enqueue</code> | <code>&lt;id&gt; &lt;text&gt;</code> | Queue a message after the active turn | 排队发送 | employee.message |
| <code>agents session queue</code> | <code>&lt;id&gt;</code> | List queued messages | 待发送消息 | employee.read |
| <code>agents session dequeue</code> | <code>&lt;id&gt; &lt;messageId&gt;</code> | Remove a queued message | 取消排队 | employee.message |
| <code>agents session export</code> | <code>&lt;id&gt; [--format markdown&#124;json] [--path RELATIVE]</code> | Export conversation into the employee workspace | 导出会话 | operator |
| <code>agents view tools</code> | <code>&lt;skills&#124;mcp&#124;account&#124;usage&#124;config&#124;export&#124;off&gt;</code> | Open or close the engine tools panel | 引擎工具面板 | operator |
| <code>agents config fast</code> | <code>&lt;id&gt; on&#124;off</code> | Set the official Fast service tier | Fast 速度开关 | employee.configure |
| <code>agents commands run</code> | <code>&lt;id&gt; /command [args]</code> | Execute a discovered slash command through shared Core | 斜杠命令 | operator |
| <code>agents commands list</code> | <code>&lt;id&gt; [--filter X] [--all]</code> | Slash commands available to a session | The “/” menu | operator |
| <code>agents commands complete</code> | <code>&lt;id&gt; &lt;name&gt;</code> | What Tab would insert | Tab/⏎ in the “/” menu | operator |
| <code>agents group list</code> | <code>—</code> | List departments | Department headings | operator |
| <code>agents team-view list</code> | <code>—</code> | List All Team and saved Team views with the active selection | 顶部视图标签 | operator |
| <code>agents team-view create</code> | <code>--name NAME [--teams @teams.json]</code> | Create and select a named view of existing Teams | ＋ 添加视图 | operator |
| <code>agents team-view update</code> | <code>ID --patch @patch.json</code> | Rename a view or change its Team membership | 编辑视图 | operator |
| <code>agents team-view remove</code> | <code>ID</code> | Delete a custom view without deleting Teams | 删除视图 | operator |
| <code>agents team-view select</code> | <code>all&#124;ID</code> | Select a saved Team view and its canvas viewport | 切换视图 | operator |
| <code>agents group add</code> | <code>&lt;name&gt; [--mode work&#124;build&#124;cloud] [--plugin ID] [--host-id ID --remote-dir PATH]</code> | Create a Team; Work uses the fixed plugin workspace, Build may bind a folder | “+ Department” | operator |
| <code>agents group configure</code> | <code>&lt;name&gt; --mode work&#124;build&#124;cloud [--plugin ID] [--host-id ID --remote-dir PATH]</code> | Bind a Team to a plugin or registered cloud host and directory | Team 工作方式与连接 | operator |
| <code>agents group remove</code> | <code>&lt;name&gt;</code> | Delete a department | × beside a department | operator |
| <code>agents room place</code> | <code>&lt;name&gt; --col N --row N [--w N --h N]</code> | Position a department’s room on the floor | Dragging a room by its sign | layout.write |
| <code>agents card rename</code> | <code>&lt;cardId&gt; &lt;title&gt;</code> | Compatibility endpoint; employee names are immutable | ✎ on a card | operator |
| <code>agents card move</code> | <code>&lt;cardId&gt; &lt;group&gt; [--before id] [--cwd existing-path]</code> | Move an employee between Teams; --cwd binds an existing folder | Dragging a card | operator |
| <code>agents card remove</code> | <code>&lt;cardId&gt;</code> | Remove an employee and all associated host/native conversations, keeping work files | 移除员工及全部会话 | employee.delete |
| <code>agents card clone</code> | <code>&lt;id&gt; --title NAME [--directory-mode default&#124;bind] [--cwd PATH]</code> | Clone an employee with an independent native conversation | 克隆员工 | operator |
| <code>agents card initialize</code> | <code>&lt;employee-id&gt;</code> | Retry failed hidden onboarding; pending/ready requests are idempotent | 重试初始化 | employee.message |
| <code>agents card create</code> | <code>--title NAME [--group TEAM] [--kind worker&#124;cloud-native-worker] [--management-role employee&#124;manager] [--engine E] [--model ID] [--effort LEVEL] [--avatar cat]</code> | Hire an employee and start hidden initialization; wait for ready before interaction | 添加员工 | employee.create |
| <code>agents card update</code> | <code>&lt;cardId&gt; [--avatar fox] [--role ROLE] [--color HEX]</code> | Edit an employee and its avatar | 员工资料 | operator |
| <code>agents group rename</code> | <code>&lt;name&gt; &lt;newName&gt;</code> | Rename a Team without renaming or moving its workspace folder | Team 名称 | operator |
| <code>agents room design</code> | <code>&lt;name&gt; [--theme sage] [--wall windows] [--desk oak]</code> | Replace room surfaces and furnishings | 空间设计 | operator |
| <code>agents group migrate</code> | <code>&lt;name&gt;</code> | Move a legacy Team into its managed directory, preserving files | 修复旧工作目录 | operator |
| <code>agents group root</code> | <code>&lt;name&gt; &lt;absolute-folder&gt;</code> | Bind an external Team root | Team 外部文件夹 | operator |
| <code>agents room bounds</code> | <code>&lt;name&gt; --x N --y N --width N --height N [--shape S] [--arrangement A]</code> | Move and resize a canvas room | 拖动、缩放 Team | layout.write |
| <code>agents room layout</code> | <code>&lt;name&gt;</code> | Computed bounds and full-size employee positions | Team 画布布局 | layout.read |
| <code>agents card place</code> | <code>&lt;id&gt; --x N --y N [--snap on&#124;off] [--zoom N]</code> | Place an employee freely or snap to nearby seats | 拖动员工 | layout.write |
| <code>agents canvas view</code> | <code>—</code> | Read viewport position and zoom | 画布视野 | operator |
| <code>agents canvas set</code> | <code>--x N --y N --zoom N</code> | Pan and zoom the canvas | 平移、缩放画布 | operator |
| <code>agents plugin list</code> | <code>—</code> | List installed software plugins | Team 工作空间插件 | plugin |
| <code>agents plugin describe</code> | <code>&lt;id&gt;</code> | Read a plugin manifest, API schema and Markdown guide | 插件信息 | plugin |
| <code>agents plugin install</code> | <code>&lt;directory&gt;</code> | Install a compatible local plugin package | CLI 安装插件 | operator |
| <code>agents plugin call</code> | <code>&lt;id&gt; &lt;method&gt; --team NAME [--params JSON]</code> | Invoke a plugin API inside a Team workspace | 插件中的操作 | plugin |
| <code>agents plugin open</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open or focus an independent plugin window | 独立插件窗口 | operator |
| <code>agents plugin windows</code> | <code>—</code> | List plugin window state, also in headless mode | 独立插件窗口 | operator |
| <code>agents plugin place</code> | <code>&lt;windowId&gt; --x N --y N --width N --height N</code> | Move and resize a plugin window | 独立插件窗口 | operator |
| <code>agents plugin mode</code> | <code>&lt;windowId&gt; normal&#124;minimized&#124;maximized&#124;fullscreen</code> | Change native plugin window state | 插件窗口最小化、还原与全屏 | operator |
| <code>agents plugin dismiss</code> | <code>&lt;windowId&gt;</code> | Save and close an independent plugin window | 独立插件窗口 | operator |
| <code>agents plugin view</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open a plugin view in its managed root or selected scope | Team 工作空间 | operator |
| <code>agents plugin close</code> | <code>&lt;viewId&gt;</code> | Close an embedded plugin view | 关闭工作空间 | operator |
| <code>agents workspace docs</code> | <code>--team NAME</code> | Refresh standardized CLI documentation in the workspace | 自动准备 Agent 文档 | workspace |
| <code>agents workspace suggest</code> | <code>--team NAME</code> | Suggest an external workspace directory without changing files | 默认工作目录 | operator |
| <code>agents workspace choose</code> | <code>[--path PATH]</code> | Choose a folder in the desktop directory picker | 选择文件夹 | operator |
| <code>agents remote check</code> | <code>--team NAME &#124; --employee ID &#124; --remote-host HOST --remote-dir PATH</code> | Check SSH and the target working directory; return remote OS details | 云端工作目录诊断 | operator |
| <code>agents terminal open</code> | <code>--employee ID [--cols N --rows N]</code> | Open a PTY in the employee working directory | 新建终端 | operator |
| <code>agents terminal list</code> | <code>[--employee ID]</code> | List employee terminals | 终端标签 | operator |
| <code>agents terminal read</code> | <code>ID [--cursor N]</code> | Read terminal output since an offset | 终端输出 | operator |
| <code>agents terminal input</code> | <code>ID --data TEXT [--enter]</code> | Send terminal input, including control keys | 终端输入 | operator |
| <code>agents terminal resize</code> | <code>ID --cols N --rows N</code> | Resize the PTY | 终端尺寸 | operator |
| <code>agents terminal close</code> | <code>ID</code> | Close a terminal and its shell | 关闭终端 | operator |
| <code>agents workspace list</code> | <code>[path] [--shared&#124;--team NAME&#124;--employee ID]</code> | List real workspace files | 文件目录 | workspace |
| <code>agents workspace image</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID]</code> | Read a scoped image for preview or model input | 图片预览和附件 | workspace |
| <code>agents workspace read</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID]</code> | Read a workspace file | 文件预览 | workspace |
| <code>agents workspace write</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID] --content TEXT [--hash HASH]</code> | Save a workspace file | 保存文件 | workspace |
| <code>agents workspace mkdir</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID]</code> | Create a folder | 新建文件夹 | workspace |
| <code>agents workspace move</code> | <code>&lt;path&gt; --to PATH [--shared&#124;--team NAME&#124;--employee ID]</code> | Rename or move a file | 重命名文件 | workspace |
| <code>agents workspace trash</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID]</code> | Move a file to recoverable workspace trash | 移到回收站 | workspace |
| <code>agents workspace restore</code> | <code>--id ID [--shared&#124;--team NAME&#124;--employee ID]</code> | Restore a trashed file | 撤销删除 | workspace |
| <code>agents ui view</code> | <code>—</code> | Which view is showing (home or a session) | The screen itself | operator |
| <code>agents ui dom</code> | <code>[--sel CSS]</code> | Query the live interface | The screen itself | operator |
| <code>agents ui text</code> | <code>—</code> | All visible text, as rendered | The screen itself | operator |
| <code>agents ui click</code> | <code>&lt;selector&gt;</code> | Click an element in the interface | That click | operator |
| <code>agents ui type</code> | <code>&lt;selector&gt; &lt;text&gt;</code> | Type into an input | That typing | operator |
| <code>agents ui wait</code> | <code>&lt;selector&gt; [--timeout ms]</code> | Wait for an element to appear | Waiting for the UI to catch up | operator |
| <code>agents ui style</code> | <code>&lt;selector&gt;</code> | Computed styles of an element | How it actually looks | operator |
| <code>agents ui screenshot</code> | <code>&lt;path&gt;</code> | Save a screenshot | Rendered interface | operator |
| <code>agents ui drag</code> | <code>&lt;selector&gt; --dx N --dy N</code> | Drag a rendered component | 拖动控件 | operator |
| <code>agents ui wheel</code> | <code>&lt;selector&gt; --dx N --dy N [--zoom]</code> | Pan or zoom with the mouse wheel | 画布滚轮 | operator |

另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。
<!-- END GENERATED CLI COMMAND INDEX -->
