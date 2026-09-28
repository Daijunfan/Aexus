# Agents Company Manager CLI 完整手册

## 开始工作

这是由根 API、调度规范和注册表生成的全局参考手册，不是权限凭据。员工执行 `agents auth whoami --json`、`agents management roles --json`、`agents api docs` 读取自己的实际身份与能力。

Governor / Manager / Employee 是员工自身的职位。Manager 管理本 Team 全部 Employee；Governor 跨 Team 管理团队与员工，并可调整其他 Governor 的位置。Governor 的创建、删除、晋升、降级仅限用户；禁止借整个 Team 删除或克隆绕过。

管理职位必须在 Core 所在主机本地运行与工作，所属 Team 可任意。在 Cloud Team 创建管理职位需 `--work-environment local`。不需要绑定 Agents-Managers 文件夹，加入旧管理 Team 不会继承权限。

公司员工通过 `agents card create` 登记。普通 Employee 直接就绪；Manager / Governor 有隐藏初始化，待 ready 后再派发任务。使用真实员工 ID 调用 `session.*` / `schedule.*`；引擎内置子 Agent 不替代公司员工。

Team 与员工可改显示名，既有目录与归属保持固定。所有公司管理操作走 CLI，不直接修改宿主 JSON。返回发送成功只表示请求已接受，完成状态需继续查询。

按操作系统建队先使用 `host list --summary --json`，按 os / distribution 选择已登记主机。云端使用 `group add NAME --mode cloud --host-id ID --directory-mode default`；Team/View 名称不代表操作系统。用 topology 的团队绑定和员工 workspace 字段核验；Cloud Team 中 Manager 用 local，招的 Employee 继承 team。完整步骤见下文“Governor: four actual operating-system teams”。

## 根项目 API 全文

# CLI and Core API

Start `npm run serve` (no window), or open the desktop. Both expose the same
Core over a private Unix socket on macOS/Linux or a data-directory-scoped named
pipe on Windows. The default data directory is `~/AgentsCompany`.
Run `node bin/agents help` for help. Every data command accepts `--json`.

## Desktop, browser and remote CLI (0.49)

`node bin/agents serve --web --port 5151` adds the authenticated browser interface.
Run `node bin/agents web token` locally to obtain the initial user credential.
Web login exchanges it for an HttpOnly session; do not put this credential in a URL.
HTTP requests, Electron IPC and the local CLI all call the same Core authorization.
See `docs/DEPLOYMENT.md` for HTTPS, SSH forwarding and `AGENTS_COMPANY_URL`.

“Local” means the Core host, not the browser's computer. `system.info` returns
its actual OS, architecture, capabilities and the calling browser client ID.
`system.directories` browses backend directories and is user-only. Browser-local
files must use the upload APIs; a browser path cannot be used as a server path.

Browser navigation, active view and per-view camera are client-specific. Team
membership, employee positions and Team bounds remain shared. The native desktop
retains its existing view behavior. `AGENTS_COMPANY_CLIENT` explicitly targets a
browser for user CLI presentation commands; employee tokens cannot impersonate it.

## Engine discovery, installation and configuration

```sh
agents engine list --json
agents engine check --engine codex --force --json
agents engine check --engine claude --team "Remote Team" --json
agents engine install-plan --engine codex --json
agents engine install --engine codex --confirm --json
agents engine install-status INSTALL_ID --json
agents engine cancel-install INSTALL_ID --json
agents engine configure --engine claude --data @private-provider.json --json
agents engine login --engine codex --json
agents engine login-status LOGIN_ID --json
```

Configuration accepts `path`, `baseUrl`, and `apiKey`; an empty string clears the
specified setting. Secret values are encrypted on the Core host and never returned
by public settings APIs. Installation targets the Core host only, requires explicit
user confirmation, verifies the committed official checksum and does not change
system PATH. Cloud-native checks inspect the selected Team's actual remote host;
remote installation is not implied by a local Install button.

Checks distinguish program, protocol and authentication and do not run paid inference.
Configured authentication does not guarantee quota. Claude Agent uses supported
API-key/provider authentication; this application does not provide claude.ai
subscription login. Codex uses its official device authorization. The engine and
model are separate concepts. See `docs/ENGINE_ADAPTERS.md` for the driver contract.

## Cline / Pi: cloud workspace creation

`engine.capabilities {engine:"cline"|"pi"|"codex"|"claude"}` is read-only and available to employees, Managers and Governors. It returns `engine`, display/protocol metadata, `capabilities`, `workspaceModes`, `employeeKinds`, and `cloudWorkerTransport`. It does not expose credentials or start inference. `engine.models` retains its existing authorization.

```sh
agents engine capabilities --engine cline --json
agents engine capabilities --engine pi --json
agents card create --title Cline-Worker --group "Cloud Team" --engine cline --kind worker --work-environment team --model deepseek-flash --thinking off --json
agents card create --title Pi-Worker --group "Cloud Team" --engine pi --kind worker --work-environment team --model deepseek-flash --thinking off --json
```

Equivalent JSON: `card.create {title,group,engine:"cline"|"pi",kind:"worker",workEnvironment:"team",model:"deepseek-flash",thinking:false}`. Cline/Pi execute on the Core host and use the Cloud Team's existing MCP Tunnel for commands and files: `execute`, `read_file`, `write_file`, `edit_file`, `list_files`. Local tools are blocked in cloud mode even with Full access. Ask/Edit/Don't ask permissions still apply; Cline Plan permits remote reads only. Failures never switch execution to the local workspace. Cloud-native workers and Work/plugin directories remain unsupported for these two adapters.

Manager/Governor runtime and workspace requirements are unchanged. In a Cloud Team they require `kind:"worker",workEnvironment:"local"`; their Employees normally use `workEnvironment:"team"`. This discovery API does not grant hiring or cross-Team authority. Only the user can create or assign a Governor.

`engine.inspect SESSION_ID capabilities|mcp|usage|config` reports the selected adapter's own data and never uses Codex as a substitute for Cline/Pi. A Tunnel `status:"configured"` entry is configuration metadata, not a live connectivity result. Unsupported native skills/account/quota inspection is reported explicitly.

### Cline image input

Cline with `deepseek-flash` accepts the existing `session.send` and `session.enqueue` `images` paths, including pasted screenshots and cloud-workspace images. `deepseek-v4-pro` remains text-only. Pi image support is unchanged. Core retains the existing workspace-boundary, 16-image and 10-MB-per-image checks.

Cline 3.0.65 advertises ACP images but drops the image content before constructing a provider request. The adapter therefore uses an employee-private loopback relay to add approved image bytes to the native Chat Completions request. All other model parameters and streamed responses pass through unchanged; no extra inference turn is added. Attachment references remain in native history and resolve on resume. Missing image conversion is reported as an error. The relay is closed with the employee session and changes only that employee's private provider settings, never the installed engine or global Cline configuration.

```sh
agents session send SESSION_ID 'Inspect this screenshot' --images '[".agents-attachments/pasted.png"]' --json
```

## Browser file transport

`transfer.upload-begin {to,name,bytes}` returns an upload ID and chunk limit.
`transfer.upload-chunk {id,offset,data}` accepts ordered base64 chunks up to 256 KiB.
`transfer.upload-commit {id}` publishes the complete file without overwriting an
existing name; `transfer.upload-abort {id}` cancels it. Uploads are bound to the
calling user/client and selected backend workspace, with a 2 GiB file limit.
`transfer.download-info {from}` returns size and version; `transfer.download-chunk
{from,offset,modifiedAt}` rejects a changed source. The Web download endpoint streams
these chunks. All these operations are user-only and reuse workspace boundaries.

## Request format

Requests are newline-delimited JSON:

```json
{"cmd":"session.status","args":{},"auth":"<credential supplied by your CLI channel>"}
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
Team nameplates open the scoped file browser for every Team type. `plugin.call` returns the domain result; pass `--raw` to preserve the plugin's JSON-RPC envelope (including structured business errors). In Web mode, sandboxed plugin frames broker calls through the authenticated parent; their page URL alone cannot execute RPC. The parent binds the view to its session, client, plugin and workspace;
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

Every employee uses Codex, Claude Code, Cline or Pi and the same `session.*`, `config.*`, file and terminal UI/CLI. An omitted `kind` or `kind:worker` means **Local Worker**: the Coding Agent process runs on the Mac. A Local Worker in a Cloud Team still uses the existing local engine and remote Tunnel tools. `kind:cloud-native-worker` means **Cloud Native Worker**: the Coding Agent executable, auth/configuration, tools and native session records live on that Team's registered SSH host. The Team owns `hostId` and remote root; the employee cannot specify a different host or leave the Team's remote directory. Existing employees are never converted automatically. Browser is a separate saved-webpage plugin under the **B** icon and does not create employees.

```bash
agents status
agents session list [--live]
agents session new [--engine claude|codex|cline|pi] [--group NAME] [--title NAME] \
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

New employees default to `bypassPermissions`, which gives the Coding Agent full
filesystem access on its execution host, including `cd` outside its initial
workspace. Choosing a lower engine permission mode remains possible. The
first upgrade changes existing automatic `default` / `acceptEdits` settings to
this new default once; an explicitly selected Plan or Don't ask mode remains.
The `workspace.*` file APIs and Work plugin APIs still use their explicit workspace
paths; those API scopes do not restrict the agent's ordinary shell tools.
Management API authorization remains identity based. For a Mac-running agent
assigned to a cloud Team, only the Tunnel remote tools are exposed; full remote
access never enables local Mac command fallback.
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
- `workspace.write {employee,path,contentBase64,create:true}` writes a PNG/JPEG/GIF/WebP
  image (at most 10 MB) in the employee workspace. Pasting a screenshot into the
  composer uses this same command, then sends its saved relative path. CLI:
  `agents workspace write .agents-attachments/pasted.png --employee ID --base64-file screenshot.b64 --create`.
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
agents group list --details
agents group remove <name>
agents group rename <name> <newName>
agents room place <name> --col N --row N [--w N] [--h N]
agents card create --title NAME [--engine codex|claude] [--group TEAM] [--cwd PATH] \
  [--directory-mode default|bind] [--avatar cat|fox|rabbit|panda|penguin|robot|cloud] [--role ROLE] \
  [--accessory headphones|glasses|none] [--color '#rrggbb']
agents card update <cardId> [--title NAME] [--avatar KIND] \
  [--accessory ACCESSORY] [--color '#rrggbb'] [--role ROLE]
agents room design <name> [--theme sage|ocean|rose|amber|lavender|slate] \
  [--wall windows|panels|brick] [--desk walnut|oak|cloud] [--subtitle TEXT] \
  [--plants on|off] [--shelf on|off] [--lamp on|off] [--art on|off] \
  [--background HEX] [--pattern boards|grid|dots|plain] [--scenery on|off]
agents card rename <cardId> <title>
agents card move <cardId> <same-group> [--before cardId]
agents card remove <cardId>
agents card remove <cardId> --delete-workspace
```

Removing a Team cascades to its employees and native sessions, then clears its room/root metadata.
Team and employee work folders are chosen at creation. `group.configure`,
`group.root` and `group.migrate` remain only for legacy Teams without a bound
root; they reject rebinding a created Team. `card.move` may only reorder an
employee inside its current Team, not change its Team or working folder.
Working files are retained when an employee or Team is removed unless explicit
employee workspace deletion is requested.
Removing a card stops its engine and deletes both host and associated native
conversation history. Actual work files and folders are retained unless `--delete-workspace` is explicitly supplied. Rooms use nonnegative integer positions and
positive integer spans for legacy grid commands. The current canvas uses the
world-space bounds and employee positions below; it has no fixed column limit.
The conversation's × only closes that view. Its **删除会话** button calls
`card.remove` after choosing both, only employee, or cancel; `session.close`
remains a separate CLI command to stop the engine while keeping the employee.

`card.create` saves a regular Employee as immediately ready, without a hidden
model turn or injected employee instructions. A Manager or Governor reads its private documents before interaction.
`session.open` starts or resumes the visible conversation.
The Core stores the last successfully created Team and employee configuration for
new-form defaults, even if that Team or employee is later removed. New names and
work folders remain new selections; the previous Team/mode, model, character,
appearance, directory mode and Team design are preselected when applicable.
`card.update` saves the display name and appearance without rebinding the workspace.
The engine is fixed at creation; use a new employee to select another engine.
Saving appearance within the same department does not change workstation order.
Employee names can be changed with `card.rename`, `session.rename` or
`card.update --title`; the one associated conversation follows that name while
its folder keeps the original path. `group.rename OLD NEW` changes
the Team's display name and all employee membership references while keeping its
registered workspace root, employee directories, files, room layout, plugin and
cloud host binding unchanged. The folder originally generated from the Team name
is **not** renamed. The old Team name becomes available for reuse, but creation
still rejects an existing workspace root. Empty or duplicate new Team names are
rejected; the same name is an idempotent no-op. Role and appearance remain
editable; Team membership and both folder bindings do not.
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

## Manager / Governor initialization and topology layout

普通 Employee 创建后立即可对话，不执行隐藏初始化轮。Manager / Governor 创建成功后返回看板；初始化期间显示黄灯，完成后恢复正常忙闲灯，失败保留错误／重试入口。

创建前可查询 Coding Agent 的模型列表，不创建会话、不发送推理请求：

```sh
agents engine models --engine codex --json
agents engine models --engine claude --json
agents engine models --engine codex --kind cloud-native-worker --team "Cloud Team" --json
agents settings set --default-codex-model gpt-6-luna --default-claude-model deepseek-flash
agents card create --title "Reviewer" --group "Build Team" --engine codex --model gpt-6-luna --effort low
```

`engine.models` 返回 `{models, defaultModel}`，只允许用户／已授权全局管理者调用。Local Worker 查询本机引擎；Cloud Native Worker 必须指定 Cloud Team，并从该主机查询，失败不退回本机。Claude Code 接入 DeepSeek 时返回对应的两个模型。

`settings.get/set` 的 `defaultCodexModel`、`defaultClaudeModel` 为之后创建的员工保存默认模型；空字符串恢复系统默认。`card.create --model` 优先于设置；Manager 初始化和之后的会话均使用创建时选定的模型。修改默认模型不更改已有员工。云端原生引擎未提供本机设置中的默认模型时，使用该远端模型列表的默认项。新员工表单切换 Coding Agent 时重新读取模型，不沿用另一引擎的选择。

职位为 `managementRole: employee|manager|governor`，执行位置独立为 `kind: worker|cloud-native-worker`。Manager / Governor 必须在 Mac 运行并使用 Mac 本地工作目录，但所属 Team 可以是 Cloud Team。在 Cloud Team 创建 Manager 时，CLI 使用 `--work-environment local`；界面选择 Manager 会自动切换到 Mac 本地工作区。远端工作的本地 Worker 和 Cloud Native Worker 只能担任 Employee。创建、赋予职位、全局授权和启动入口共同执行限制。Mac 本地 Manager 使用同一组 `session.*`、`schedule.*` 和 `card.*` API 管理本 Team 的两类云端 Employee；云端执行失败不回退本机。

```bash
agents card create --title 'Cloud Lead' --group 'Cloud Team' --kind worker \
  --management-role manager --work-environment local --engine codex \
  --model gpt-6-luna --effort low
```

`card.create --management-role manager --kind worker` 为用户／全局管理者创建本地 Manager。普通 Manager 使用 `card.create` 只能创建本 Team 的 Employee；省略 group 时由 Core 使用调用者所属 Team。后台在同一次状态提交中保存创建者和有效管理关系，不能由参数伪造内部字段。

公司手册按照目标员工实际身份生成。文件及 `AGENTS.md` / `CLAUDE.md` 引导位于 `.agents-company/employees/<employeeId>/` 隐藏目录；用户自己已有的根目录说明保留。Work 插件手册与公司说明分区共存。`workspace docs --employee ID` 可重新生成本人的手册。首次运行、恢复和职位变更均更新指令；旧会话及原生 ID 保留。

本项目 Multi-Agent 的命令是 `card.*`、`management.*`、`session.*`、`schedule.*`，不是引擎自带的 Agent / Task 或 native multi_agent。

```sh
agents management relayout --team TEAM --json
```

`management.relayout` 向用户、本 Team Manager 及拥有目标 Team 布局授权的全局员工开放。Governor 可修改任意 Team 和任意员工的位置，包括自己与其他 Governor。成功返回 `{team,bounds,revision}`。招募、删除员工或同 Team 创建来源变化都会触发布局适配，把管理组和孤立员工放进合适的 Team 外框。所有坐标和关系在同次提交中保存。pending、任务输出、镜头移动和切换视图不会触发重排。

箭头为水平／垂直折线加小圆角，终点方向只允许上、下、左、右。`room.layout` 返回的员工坐标仍为 UI 的依据；`team-view.*` 不改变关系或权限。完整授权矩阵见 [PERMISSIONS.md](PERMISSIONS.md)。

### 实时协作连线

```sh
agents management activity --json
agents management activity --team "Engineering" --json
agents office layout --team "Engineering" --json
agents card place EMPLOYEE_ID --x 430 --y 240 --snap off --json
```

`management.activity` 返回 `{revision,interactions}`。每项包含 `managerId`、`employeeId`、实际调用的 `command`、`requestId`、`startedAt`，不再返回旧版的 `expiresAt`：请求完成或订阅断开后立即从列表移除。状态由后台从通过身份校验的 API 调用中产生，不能通过参数伪造。用户可查看全部；Team Manager 只查看本 Team；普通 Employee 只查看涉及本人的交互。`management:activity` 事件向可信桌面界面推送同一结构，刷新连线不重新读取会话全文。

`management.activity` 同时返回真实通信请求与正在执行的委派任务。`kind=request` 表示 `session.send/enqueue/steer/interrupt` 或正在连接的 `session.follow`；`kind=task` 表示引擎已开始、尚未结束的任务，附带 `messageId` 和原始派发请求的 `requestId`。任务线只连接 `currentTask.delegation.requestedBy` 中经过授权的管理者与接收者，不从创建关系、普通 busy 状态或历史记录猜测。用户直接派发的独立任务不生成管理协作线。每对管理者与员工合并显示，同对任务和通信不重复绘线。

绿色表示“协作中”：并行派发给多名员工且仍在执行的任务可以同时亮起；任务完成、失败、中断、关闭或授权撤销时立即清除。读取状态、会话记录、布局或配置不亮灯，完成的调用没有延时残留。任务指示不持久化、不重放；引擎实际执行时角色显示“工作中”，参与协作但没有执行轮时显示“协作中”并保持清醒，不伪造引擎 busy。

Manager 自己创建的同 Team Employee，以及 Governor 在任意 Team 创建的 Employee / Manager，有常驻实线。真正进行中的消息/控制请求和回复订阅会将对应线显示为绿色流动虚线；结束立即恢复常驻线或移除临时线。没有延长亮灯的计时器，普通读取不会产生通信指示。真正并发的请求可同时显示；关闭上级会话、撤销身份或失去权限会清除相应活动。系统“减少动态效果”会关闭流动动画，保留颜色和线宽。创建来源和管理权限互相独立，没有常驻线也可使用完全相同的管理 API。

连线在目标工牌侧边收口；员工排列在 Manager 下方时，从 Manager 工牌下缘出线，并允许同一管理者的线路共用主干。不同管理者的线路仍优先错开。线路绕开完整工位，水平／垂直行进并使用小圆角。拖动员工时即时重算，不移动其他员工来迁就线条。两个工位完全重叠、封死所有通路时无法保证避障，但线段仍保持正交。Manager 可用上面的 `card.place` 调整自己或同 Team 的任意 Employee，或调用 `management.relayout` 自动整理。

## 员工职位：Governor / Manager / Employee

权限属于员工的 `managementRole`，不属于 Team 或文件夹。任何普通 Build、Work 或 Cloud Team 都可以有本地 Governor；Cloud Team 中须选择 Mac 本地工作区。完整矩阵见 [PERMISSIONS.md](PERMISSIONS.md)。

```sh
agents management roles --json
# 以下 Governor 生命周期命令只允许用户 CLI / UI。
agents card create --title Governor --group "Any Team" --management-role governor --kind worker --model gpt-6-luna --effort low --json
agents card management-role EMPLOYEE_ID governor --json
# Governor 可以跨 Team 调整布局，目标可以是其他 Governor。
agents office layout --json
agents card place GOVERNOR_OR_EMPLOYEE_ID --x 430 --y 240 --snap off --json
```

`management.roles` 返回共享职位定义：`value,label,description,scope,requiresLocal,userManaged,permissions,controls,creates,removes,assigns`。运行时授权、CLI 发现、员工表单与手册复用该定义。未定义职位拒绝处理，不凭职位名称猜测权限。

- Employee：管理自身会话与授权工作区，不管理他人。
- Manager：管理本 Team 全部 Employee，包含用户或其他 Manager 创建的员工；可调整本 Team 外框、自己及 Employee 的位置。
- Governor：跨 Team 管理团队和员工，控制会话与配置，调整任意 Team / 员工位置（包括 Governor）；可创建、删除 Employee / Manager。
- Governor 的创建、删除、晋升、降级只允许用户操作。Governor 不能删除含 Governor 的 Team，不能借克隆或内部字段制造同级身份。所有克隆默认为 Employee。

所有 Team / 员工删除入口都在副作用前检查受保护职位。`management.topology.allowedActions` 使用同一策略，不能用发送消息、定时任务或插件转调继承用户权限。`ui.*` 模拟操作和凭据操作继续仅限用户。

升级时，已有显式全局授权和旧全局管理 Team 的已授权成员逐一迁移为 Governor，保存 ID、目录、原生会话、历史和委派授权标识；不额外执行模型初始化。之后加入同名 Team 不再获权。旧 `management.team` 不再接受 `--team/--clear`，无参返回无授权团队的兼容投影；`management.global ID on|off` 仅供用户兼容，分别设为 Governor / Manager。

`auth.whoami` 的 `managementRole` 是权威职位；`globalManager` 只是 Governor 的兼容投影，`managerTeam:null`、`globalByTeam:false`。旧目录标记和版本 2 中残留的 Team/列表字段不授予权限。Governor 降级会撤销其跨 Team 委派；重新授予不重放旧任务。

## Authenticated management and collaboration

UI、用户 CLI 和员工 CLI 共用 Core。调用身份来自可信 IPC 或可撤销凭据，不能通过参数、目录标记或 Prompt 提升权限。

### Team 成员与工作环境

Team 表示组织归属，并提供默认工作环境。员工的 `workEnvironment` 缺省为 `team`，继承 Team；在 Cloud Team 中可选择 `local`，保持成员归属，同时使用 Mac 本地工作区。`kind: worker` 表示引擎在 Mac，`cloud-native-worker` 表示引擎在绑定云主机。

Manager 的引擎和实际工作目录必须都在 Mac。因此 Cloud Team 可以同时包含 Mac 本地 Manager、本地引擎操作云端的 Employee、云端原生 Employee。云端原生引擎不能选择 `local`，Work 插件员工不能绕过插件目录规则。工作环境创建后固定；已有员工不自动改运行位置。

```sh
agents workspace suggest --team "Cloud Team" --work-environment local --json
agents card create --title "Lead" --group "Cloud Team" --kind worker --work-environment local --management-role manager --model gpt-6-luna --effort low
agents card create --title "Remote worker" --group "Cloud Team" --kind worker --model gpt-6-luna --effort low
agents card create --title "Native worker" --group "Cloud Team" --kind cloud-native-worker --model gpt-6-luna --effort low
```

Cloud Team 中的 Mac 本地目录默认位于 `Agents-company-projects/<Team 创建时名称>/<员工名称>`，也可绑定已有 Mac 目录。Core 保存本地根目录；Team 改名不移动目录。文件树、终端、会话、文档、克隆和删除均按目标员工的实际环境解析；Cloud Team 的远程目录仍供云端员工使用。

### 跨 Team 端口路由与任务视图

跨 Team 的一条员工连接分为来源 Team 内、Team 间、目标 Team 内三段。端口位于真实轮廓的左右侧或底边，全部低于 `ROOM_HEADER_HEIGHT=170`；只在目标员工名牌旁绘制箭头。内部线路避开完整工位，外部避开当前视图中的 Team。三段共用关系 ID、活动颜色和虚实状态，不移动员工或 Team 来求通路。

`office.layout` 增加 `crossTeamConnections`：每项有 `id,managerId,employeeId,sourceTeam,targetTeam,sourceName,targetName,active,temporary,status`。`status=routed` 时含 `source`、`external`、`target`，各段都有 `points/path`；内部段另有 Team 内坐标 `port`，外部段使用世界坐标。`hidden` 表示另一端被此次 Team/视图筛选隐藏，`blocked` 表示没有合法通道；后两者不返回伪造的线路，界面在工牌附近显示提示。屏幕外但仍属于此视图的 Team 继续参与路由。

```sh
agents team-view list --json
agents office layout --view VIEW_ID --json
agents canvas view --view VIEW_ID --json
agents canvas set --view VIEW_ID --x 100 --y 80 --zoom 0.8
agents session send --employee GOVERNOR_ID --view VIEW_ID --text "整理这些团队的位置"
agents session enqueue --employee GOVERNOR_ID --view VIEW_ID --text "之后检查工位间距"
agents schedule create --name "布局检查" --employee GOVERNOR_ID --view VIEW_ID --prompt "检查此视图" --every-seconds 3600 --paused
```

`team-view.list` 返回 `activeId` 与 `views[{id,name,teams,viewport?}]`；`all` 是固定 All Team。`view.get` 查询首页、会话、设置等面板，不能用来判断顶部标签。`office.layout --view` 只筛选返回的 Team，仍沿用全局坐标和原有授权；`--team` 与 `--view` 同时传入时取交集。不传 `--view` 时 office.layout 仍返回有权读取的全部 Team，canvas.view/set 仍针对当前视图。

Governor 的消息和排队入口接受 `viewId`（CLI 为 `--view`）。显式参数优先，否则在接收请求时固定当前视图 ID，早于引擎启动等异步操作；排队中保留此 ID，执行前复核存在性。`session.info.currentTask.viewId` 与队列条目返回该目标。目标信息送入当轮引擎上下文，用户聊天历史仍只显示原始消息。普通 Employee 不添加这段上下文。

若用户正文明确点名其他视图，Governor 的手册要求先查询名称对应的 ID，再固定本轮目标；不能猜测 ID，也不跟随用户之后换页。该字段是任务目标提示，不授予权限、不限制原有 Governor 全局权限。

Governor 的定时任务必须显式填写 `action.viewId` / `--view`，保存后及每次执行按此 ID 校验。视图不存在或已删除时明确报错，不回退 All Team。修改非当前视图的相机不会调用 team-view.select；界面延迟保存也携带操作发生时的视图 ID。

各视图共享 Team 与员工的位置；整理一个视图中的 Team，其位置会同步反映到其他包含它们的视图。视图的显示名单和相机各自保存。

### Manager 权限与创建来源连线

Manager 可以管理本 Team 的全部 Employee，与运行位置、创建者或是否存在连线无关。普通 Manager 不管理同级 Manager，也不跨 Team；跨 Team 管理使用独立的 Governor 职位。Manager 可读取状态和历史、发消息、排队、停止、配置已开放的模型参数、定时派发和删除员工。删除员工默认保留目录，目录删除仍需用户／全局授权。

连线只由可信 `createdBy` 生成：同 Team 的 Manager 创建 Employee、Governor 在任意 Team 创建 Employee 或 Manager 后显示该创建来源线。用户创建的员工没有连线；其他 Manager 仍可以管理它。连线不会授予或撤销权限。旧手动申请、批准和解绑接口保留为明确报错的兼容入口，不再出现在员工可用 API 文档中。

拖动源团队或目标团队时，跨团队连线会按新位置重新规划整条路径，清除旧的手动中间拐点，保留已选择的两端连接点。拖动预览与 `room.bounds` / `room.place` 保存使用同一规则；无位移操作不清除手动路径，同 Team 内部手动连线随团队整体移动。移动后可继续拖动线段调整。

```sh
agents auth whoami --json
agents api list --json
agents management topology --team "Cloud Team" --json
agents session send --employee EMPLOYEE_ID --text "检查项目并报告结果" --json
agents session transcript --employee EMPLOYEE_ID --limit 100 --json
agents session interrupt --employee EMPLOYEE_ID --json
agents schedule create --name "检查任务" --employee EMPLOYEE_ID --prompt "检查项目" --every-seconds 3600 --paused
```

上述接口对本地、远程工具执行和云端原生 Employee 完全相同。Core 通过员工 ID 找到实际引擎和工作环境；云端失败不会回退 Mac。Manager 与 Employee 不共享身份凭据，任务接收者不继承发送者的权限。管理范围不会自动授予其他员工的文件写入、终端输入或工具提权审批权限。

排队消息、活动任务和调度保留发起者身份；接受、派发、异步准备完成时再次授权。Manager 降级、员工移出 Team、删除或凭据撤销会取消失效委派、队列、订阅和调度；其他 Manager／用户的任务保持独立。创建来源线的显示不影响任务。旧委派中的 `relationId` 仅作为历史兼容字段，不再决定授权。

### 团队级删除权限与自然语言范围

`agents management topology --teams-only --json` 返回简短的团队权限列表和 summary，避免员工详情过多时被模型工具截断。Socket 对应 `teamsOnly:true`；省略该选项仍返回原有完整拓扑。summary 包含 teams、employees、deletableTeams、blockedTeams，直接给出完整可见范围的数量。

`management.topology.teams` 返回当前调用者可见的全部 Team，包括空 Team。每项包含：

| 字段 | 含义 |
| --- | --- |
| `name` | 当前 Team 名称 |
| `isOwnTeam` | 是否为调用员工自身所属 Team；用户调用时为 false |
| `employeeCount` | 完整团队成员数，不受 creator 筛选影响 |
| `governorIds` | 此 Team 中 Governor 的稳定 ID，空数组表示没有 |
| `allowedActions` | 当前职级允许的团队操作；包含 `delete` 才允许删除该 Team |
| `deleteBlockedReason` | 无删除权限时的真实 Core 原因，允许时为 null |

这些字段来自执行 `group.remove` 的相同授权入口，不根据连线、团队名称或模型推断授予权限。`delete` 表示职级允许，实际执行仍要通过文件范围、共享资源和 SSH 等预检查；不是保证一定成功。`--team` 限制 teams 的范围，`--creator` 只筛选员工 nodes，不隐藏团队里的受保护 Governor。

用户说“其他团队”时，按 `isOwnTeam=false` 解析。用户在同一对话中已明确的范围和文件处理选择仍然有效，除非后来修改或撤销。明确授权的操作先核对实时权限，再执行允许部分并报告例外；若用户要求全有或全无，不自行执行子集。没有明确删除文件夹的授权时，不添加 `--delete-workspace`；只读预览不产生删除操作。

### 按创建来源查询员工

```sh
agents management topology --creator self --json
agents management topology --creator others --json
agents management topology --creator operator --json
agents management topology --creator EMPLOYEE_ID --team "Cloud Team" --json
agents management topology --creator unknown --json
```

复用 `management.topology`，Socket 参数为 `{team?, creator?}`。省略 creator 返回可见范围内全部节点；self 表示当前调用者创建，others 表示已知由其他调用者创建，operator 表示用户创建，员工 ID 匹配该员工的创建记录，unknown 表示缺少来源的旧记录。Manager 只能查询本 Team，Governor 可跨 Team；筛选不会扩大权限，也不依赖创建来源线。

每个节点返回 `createdBy`（`{kind:"operator"}`、`{kind:"agent",employeeId}` 或 `null`）、`createdAt`（毫秒时间戳）、`createdByMe`（true / false，来源未知为 null），以及现有的 `allowedActions`。缺少旧来源不会被误报成用户或其他管理者创建；创建者后来离职、降级，来源仍保留原始 ID。`session list` 的员工记录也提供原始创建来源与时间。筛选后的 edges 仅保留两端都在结果中的连线；请用节点来源判断创建关系，用 allowedActions 判断当前可执行操作。

### 员工外框与角点

所有员工（包括 Cloud Native Worker、Manager、Governor）使用同一 190×250 外框。`connector get` 的 `availablePoints` 包含原有 20 个边上点位以及四个角点，共 24 个。角点采用 top / bottom 的 offset 0 或 1；`connector set` 支持闭区间 0–1，原有锚点保持兼容。UI 点击或拖动角点与 CLI 使用相同坐标。

`auth.whoami`、`api.list/describe/docs`、`session.status` 和 `management.topology` 返回当前真实权限。拓扑的 `edges` 只含创建来源线，`pending` 恒为空；`allowedActions` 和执行时检查来自相同策略。原始 Socket、follow、斜杠命令、插件转调和调度都执行身份校验。完整文件隔离仍取决于操作系统／Coding Agent 沙箱；Trusted 不宣称系统级防篡改。

## Explicit engine test call

`agents engine probe --engine codex --model gpt-6-luna --confirm --json` makes one real, potentially billed model request on the Core host. Claude Agent uses `--engine claude` and an optional model ID. The prompt is fixed to an OK-only reply; execution uses a temporary directory, no persisted native session, and a 45-second timeout. Core requires `confirm:true`; ordinary `engine.check` stays inference-free. Results include actual response text, selected model, host, elapsed time and timestamp. Configuration can be present while the account has no credit; only a successful explicit probe demonstrates that the provider accepted this request.

## Team views

自定义视图被选中时，编辑图标紧邻该标签显示；标签较多时会将当前标签和图标一起滚动到可见位置。编辑面板从 All Team 列出已有团队，勾选加入此视图、取消勾选仅移出此视图；保存调用 `team-view.update {id,patch:{name,teams}}`，不会创建或删除团队、员工和文件。空视图会提示从 All Team 选择已有团队。All Team 固定显示全部团队，不提供成员编辑。

在画布新增员工时，所属 Team 只列出当前视图内仍存在的团队；All Team 列出全部团队。团队被删除或移出当前视图后，已打开表单会清除失效选择，必须重新选择后才能保存。删除团队也会清除上次创建员工模板中的对应团队引用，保留其他形象和引擎偏好。视图筛选不改变 CLI/API 的职级权限。

The built-in `All Team` view always contains every Team and cannot be edited or
deleted. Custom views contain selected existing Teams and have independent canvas
pan/zoom. Switching views only changes what the board displays; employees, folders,
sessions and Team positions remain shared.

```bash
agents team-view list --json
agents team-view create --name '云端项目' --teams '["BUPT Linux VMs","BUPT Windows"]'
agents team-view update VIEW_ID --patch '{"name":"服务器","teams":["BUPT Linux VMs"]}'
agents team-view update VIEW_ID --patch '{"index":0}'
agents team-view select VIEW_ID
agents team-view select all
agents team-view remove VIEW_ID
```

`--teams` and `--patch` also accept `@file.json`. Creating a view selects it;
`team-view.list` returns `{activeId,views:[{id,name,teams,viewport?}]}`. Names
must be unique, and unknown Teams are rejected. Renaming or deleting a Team
updates custom views. A Team created while a custom view is active joins that
view automatically. `index` is the zero-based position among custom views;
the built-in All Team view is always first and cannot be moved. Deleting a view
never deletes its Teams.

## Agent layout tools

```sh
agents office layout --json
agents office layout --team "Engineering" --json
agents room bounds "Engineering" --x 100 --y 200 --width 1200 --height 900 --json
agents card place EMPLOYEE_ID --x 430 --y 240 --snap off --json
agents management relayout --team "Engineering" --json
```

`office.layout` returns `{revision,coordinates,rooms}`. Each room has `name`, actual
`bounds`, `editable`, `connections` (creation-edge IDs, endpoints, orthogonal `points` and rounded SVG `path`), and employees with stable IDs, titles, roles, Team-relative
positions, full-size footprints and per-target `editable`. It contains no working
files, host credentials or conversation history. The unfiltered call returns all
Teams to the user/global staff and only the caller's Team to a Team Manager.
Ordinary Employees cannot call layout APIs.

Geometry changes reuse `room.bounds`, `room.place`, `card.place` and
`management.relayout`. A Team Manager may change its own frame and run automatic
packing, and individually move itself or any same-Team ordinary Employee. Global staff
with the Governor role can edit every Team and every employee, including other Governors. All target identifiers are rechecked by Core. Renaming a folder does
not grant layout authority. User-only `ui.click/type/drag/wheel` cannot be used by
Agents to bypass these limits.

Roster/active-topology changes refit only affected rooms in the same atomic state
commit. Overlapping neighboring rooms move aside, including pinned rooms; this
incidental collision displacement is not a cross-Team management grant. Camera
and view selection remain unchanged. Manual `room.bounds` movement or resizing
changes only the selected Team and may overlap another Team; its position remains
the same after restart. Work directories, task ownership and management arrows
do not change.

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
Employee dragging freezes the current frame and other seats and stays inside the Team.
Resizing preserves every employee's world position: moving a left/top edge compensates
their Team-relative coordinates. Shrinking stops before the outline or header intersects
any full-size employee footprint; Core clamps requested dimensions to the occupied minimum
(at least 360 × 520). UI previews and CLI use the same rule for all supported shapes.
Position-only updates still move the Team and its employees together. Combined CLI placement
and size updates that do not anchor an opposite edge likewise move the Team before resizing.
`room.layout` returns
the effective bounds and each employee's position after clamping.
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
Teams keep their registered roots for their entire lifetime. Employees
must use strict subdirectories, which can be nested; exact directory aliases cannot
be assigned twice in Work. Build roots are auto-created under
`~/develop/Agents-company-projects/<Team name at creation>` and may be shared by their employees.
All paths are canonicalized; traversal and outward symlinks are rejected.

For a Work Team, `group.add NAME --mode work --plugin ID` selects that plugin's fixed
`workspaces/NAME` folder. `--root` and `--directory-mode bind` cannot choose a Work
Team folder. Build Teams still accept `--directory-mode default|bind` (`directoryMode`
in JSON); binding requires `--root` to be an existing physical folder and creates
no additional Team-named directory. Team names may change later;
the registered folder path remains the one chosen or generated at creation.
Legacy Work roots and their files stay registered.

`card.create` and `session.new` accept `--directory-mode default|bind`
(`directoryMode` in JSON). `default` creates `<Team root>/<exact employee title>`;
Chinese, spaces and case are preserved. Path separators and `.` / `..` cannot be
used as generated folder names. A default request cannot override the derived path.
An existing employee keeps its original folder even after its display name changes.

Employee `bind` requires an existing physical directory and never creates it. Work employee bindings
must remain strict descendants of their Team root, with outward symlinks and
exact duplicate ownership rejected. Build can bind another physical folder outside
its Team root; both modes exclude the app's data directory. A Build employee bound
outside its Team root retains that binding. The employee and its conversation
share one editable display name.

Omitting both mode and cwd selects default generation. Legacy explicit-cwd calls
and `create|existing` modes remain CLI-compatible; the UI exposes only default
and bind. Legacy modes still enforce the Work permission boundary.

`group.root` and `group.migrate` remain compatibility commands for legacy Teams
that have no registered root. Both reject changing an existing registered root.

Team names may change without moving their directories. Team mode, plugin, host
and root cannot change after creation, even when the Team is empty.
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

## Character catalog and explicit employee creation

`avatar.list {query?,style?:"default"|"anime"|"chibi",all?:boolean}` / `agents avatar list`
returns the actual appearance catalog. Each entry has `id`, `name`, `characterId`,
`character`, `style`, `aliases`, `legacyIds`, `color`, and `selectable`. The default
list contains all 57 current picker choices; `--all` also includes retired skins.
All employee roles may read it, including during Manager/Governor initialization.

```sh
agents avatar list --query "英雄王" --style chibi --json
agents card create --title "英雄王可爱版" --group TEAM --character "吉尔伽美什" --avatar-style chibi --profession "代码审查" --management-role employee --engine claude --model deepseek-flash --thinking off --kind worker --work-environment team --json
agents session status --employee EMPLOYEE_ID --json
agents card avatar EMPLOYEE_ID --avatar fate-gilgamesh-chibi --json
```

Creation parameters have distinct meanings:

| Parameter | Meaning |
| --- | --- |
| `title` | Employee display name; never determines appearance |
| `character` + `avatarStyle` | Known character name/ID/alias and the desired appearance style |
| `avatar` | Exact catalog appearance ID, as an alternative to character/style |
| `managementRole` | Employee/Manager/Governor authority, independently checked by Core |
| `profession` | Free-text occupation/duties, stored in the legacy `role` field |
| `engine`, `model`, `thinking` | Coding Agent and runtime configuration |
| `kind`, `workEnvironment`, `group` | Execution kind, work environment and Team |

`role` remains a compatibility alias for the profession description. Do not use it
for an illustrated character or for management authority. Unknown characters,
ambiguous styles and conflicting appearance parameters fail before creating a
workspace; they never fall back to an animal. Omitting appearance entirely retains
legacy default behavior for ordinary unnamed-character employees.

`card.avatar {id,avatar? ,character?,avatarStyle?}` updates only the selected
appearance and its default palette. Manager may target itself and its Team's
Employees; Governor may target controlled employees across Teams. It does not
change engine, management role, name, history, folder or position. General
`card.update` stays user-only. Existing create and update requests may use the new
character/style and profession fields, and `api.describe card.create` includes a
machine-readable `inputSchema`.

`session.status`, `session.list` and management topology expose effective `avatar`,
`avatarName`, `character`, `avatarStyle` and `profession`, including legacy default
appearances. `session.info` exposes them for both open and closed employees. Both
Manager and Governor must read back the actual appearance after creating a
specified character; a matching employee title alone is not sufficient.

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
`codex`, `dewey`, `fireball`, `rocky`, `seedy`, `stacky`, `bsod`, `null-signal`, `hoots`.
Claude artwork: `clawd` uses the original Claude Code mascot. Official Anthropic Buddy character animations use `claude-axolotl`, `claude-blob`, `claude-cactus`, `claude-capybara`, `claude-cat`, `claude-chonk`, `claude-dragon`, `claude-duck`, `claude-ghost`, `claude-goose`, `claude-mushroom`, `claude-octopus`, `claude-owl`, `claude-penguin`, `claude-rabbit`, `claude-robot`, `claude-snail`, `claude-turtle`. These retain the upstream character-frame format. No engine call is needed to select or animate a character.
Community IDs `woodi`, `marmalade`, `voltcoin`, `inky`, `byte`, `wondercube` remain selectable with their original artwork.
Fate character skins use `fate-<character>-anime` (original-series-inspired proportions)
or `fate-<character>-chibi` (cute companion proportions). The 14 servant slugs are
`saber`, `archer`, `cu-chulainn`, `medusa`, `medea`, `sasaki`, `cursed-arm`,
`heracles`, `gilgamesh`, `diarmuid`, `iskandar`, `gilles`, `hundred-faces`,
`lancelot`. Seven selected Master slugs are `shirou`, `rin`, `sakura`, `illya`,
`kiritsugu`, `kirei`, `waver`, using the same two style suffixes. For example: `agents card update ID --avatar fate-saber-chibi`.
Both variants appear in the same flat picker. These are newly generated fan-art
animation frames, not official production animation assets. Selecting a skin does
not change the employee's identity, engine, role, directory or position.

Historical generic IDs retain their original community aliases.

## Employee conversation identity, sidebar and snapping

```sh
agents settings set --sidebar-width 72 --snap-employees on
agents card place CARD_ID --x 280 --y 69 --snap on --zoom 1
agents card place CARD_ID --x 280 --y 69 --snap off
agents view open conversation --employee CARD_ID --plugin mininotion
agents view open home
```

An employee, character and conversation share one editable display name. Rename
APIs accept the employee ID or its live session ID; the original workspace
folder name and path stay unchanged.

`sidebarWidth` accepts 56–96 pixels; legacy wide-sidebar settings display as the new 64px default. The sidebar shows icons only, with hover labels; it remains resizable within this range. `snapEmployees` is a boolean and defaults to true. Both persist via
`settings.set` and are included in `settings.get`.

`card.place` accepts optional `snap:boolean` and `zoom:number` (0.08–3, default 1).
The desktop Team minimap is hidden by default. The left-sidebar button below
the shared transfer folder toggles it through `settings.set`; the equivalent CLI
is `agents settings set --team-overview on|off`. It reads the same `room.layout`
geometry and saves each focus/overview jump with `canvas.set`.
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

`card.remove {id, deleteWorkspace?: boolean}` / `agents card remove ID [--delete-workspace]`:

1. Prevents new opens, stops the employee's live engine and waits for the native
   writer, including native IDs received while stopping.
2. Collects current and historical `nativeSessions` (`{engine,id}` records), plus
   exact employee-ID associations in this app's `backups/before-*.json` snapshots.
3. Calls Codex `thread/delete` and Claude SDK `deleteSession`; removes exact ID
   entries in native session-name/history indexes. Other native IDs are preserved.
4. Deletes `transcripts/<employee-id>.json`, cached host conversation data and the
   employee record, and closes its displayed conversation. Work folders are kept by default.

删除确认框只有三个选项：`both` 将员工、关联会话及当前工作文件夹（含全部子目录和文件）一起删除；`only employee` 保留目录；`cancel` 不发出删除请求。框内显示实际目录及云主机（如适用）。

`both` 对应 `deleteWorkspace:true` / `--delete-workspace`。本地通过 Core 删除，云端通过 SSH 在对应 Team 范围内执行，不回退本机。默认生成和绑定的目录采用同一规则；已不存在的目录允许重试。Team 根目录、包含其他已登记员工／Team 目录的文件夹、宿主数据目录及其父目录，以及包含 Cloud Hosts 正在引用的 SSH 私钥、known_hosts 或 SSH 配置的本地目录均拒绝删除，可改选 `only employee`；删除子目录不会跟随其内部的软链接删除外部文件。普通 Manager 的删除员工权限不包含删工作文件夹，后者要求用户或全局管理授权。

### 画布批量编辑与删除

左侧插件栏下方的“编辑画布”开关显示“选中员工”和“选中团队”。点击对象多选，点击“删除所选”后只出现一次确认：同时删除所有对应员工工作文件夹，或保留全部文件夹。团队模式会包含所选 Team 的全部员工。切换选择模式、退出编辑或切换视图会清空选择。

```sh
agents card remove EMPLOYEE_ID_1 EMPLOYEE_ID_2 --delete-workspace --json
agents group remove "Team A" "Team B" --delete-workspace --json
# 省略 --delete-workspace 保留员工目录。
```

Socket 分别为 `card.remove {ids:[ID1,ID2],deleteWorkspace?}` 和 `group.remove {names:[TEAM1,TEAM2],deleteWorkspace?}`，兼容原有单个 `id` / `name`。不能同时提交单个字段和数组字段，数组必须非空。每一项单独检查权限，Governor 仍不能借批量删除移除其他 Governor，Manager 仍只可删除本 Team 的 Employee，且不能删除工作文件夹。

整批先检查员工、权限与目录保护，预检查失败不移除任何对象。同批选中员工的共享目录只删除一次，嵌套目录先子后父；未选中员工、未删除 Team、宿主目录、共享 SSH 文件仍受保护。团队根目录默认保留；仅当该目录也是所选员工的工作目录且所属 Team 同时删除时，才按同一次文件夹选择处理。远端用户主目录和文件系统根目录始终受到保护。

本地与云端使用同一 Core 删除流程，会清理关联原生会话、应用会话、凭据、连线及团队视图引用；远端文件只经 SSH 删除。实际执行失败时保留未完成的记录和错误供重试，不把部分清理冒充成功。

预检查失败不移除员工或会话。通过预检查后先停止员工并清理原生会话，再删除目录；删除过程中发生实际错误会保留员工记录供重试，已完成的原生会话清理不会回滚。Team 删除默认保留员工工作文件夹，显式传入 `--delete-workspace` 时统一清理所选 Team 内员工的目录。

An already-missing native session is safe to retry. A real native/API failure keeps
its employee record and references for retry, rather than silently reporting success.
Shared references from another current employee block deletion. Codex must support
`thread/delete` (verified with 0.145.0); cleanup performs no inference. Native profile
locations respect `CODEX_HOME` and `CLAUDE_CONFIG_DIR` just as engine startup does.
`session.close` still stops a live session while retaining history.


## Cloud Team configuration and inheritance

Create and manage hosts in **Cloud Hosts** (`cloud-hosts`) first. Cloud Teams bind a registered host ID. Bind an existing remote directory, or create a new Team folder under the host's default directory:

```sh
agents host create --data @host.json
# host.json: {"name":"GPU Server","host":"user@203.0.113.10","os":"linux","defaultDirectory":"/home/user"}
agents host list --summary --json
agents host list --os linux --distribution ubuntu --summary --json
agents host check HOST_ID --json
agents host directories HOST_ID --path /home/user --json
agents group add Backend --mode cloud --host-id HOST_ID --remote-dir /home/agent/projects
agents group add Ubuntu-Team --mode cloud --host-id HOST_ID --directory-mode default --os linux --distribution ubuntu --json
```

`host.list {os?,distribution?,summary?,credentials?}` filters the registered operating system/distribution without SSH. `summary:true` returns only `id,name,os,distribution,defaultDirectory,sshConfigured,status`; `status` is the last cached result, not a live verification. All employees may call this API; Employee always receives the summary projection. Manager can read full connection records for its Cloud Team host and summaries for other hosts. Operator and Governor can read all connection records. The registry is the same one managed by the Cloud Hosts plugin, not a separate inventory; read access does not grant host management or cross-Team work. Do not truncate discovery with `head`: use the compact summary or filters.

`group.add` accepts `directoryMode:"default"` for cloud creation: exclusively create `<host.defaultDirectory>/<Team name>` over SSH and bind its canonical path. Do not combine this with `directory` / `--remote-dir`. Existing folders fail without being overwritten. Omit this flag (or use `bind`) to bind an existing directory, defaulting to the host's default directory. Missing base folders and SSH errors fail; there is no local fallback. Supplying `hostId` without `mode` implies cloud; an explicit local mode with remote fields is rejected. Optional `os` / `distribution` are assertions against the actual host, not labels; mismatches fail before any directory or Team is created.

### Governor: four actual operating-system teams

1. Discover registered hosts using `host list --summary`; select Ubuntu, Kali and Windows by actual `os` / `distribution`. Use local Build for macOS. Team/View names do not identify operating systems. Missing hosts must be reported, never replaced with renamed local teams.
2. Create each cloud Team with its selected `--host-id`, `--directory-mode default`, and `--os` / `--distribution` assertions as above. Use `agents group add Mac-Team --mode build --os macos` for local Mac.
3. Create each Manager with `--management-role manager --kind worker --work-environment local --engine claude --model deepseek-flash --effort low`. Managers run and work on Mac even when members of Cloud Teams. Wait for initialization ready, then send the hiring task to that Manager using `session send --employee ID`.
4. Managers create their own Employees with `--work-environment team` (the default), `--kind worker --engine claude --model deepseek-flash --effort low`. A local engine can operate a genuinely remote workspace through Tunnel; cloud-native engine installation is not required. Only use `cloud-native-worker` when remote engine execution is explicitly wanted.
5. Verify `management topology --teams-only --json`: `teams` includes `mode,hostId,hostName,os,distribution,directory`. Full topology nodes include `workspace:{location,hostId?,os,distribution?,directory}` computed from each employee's effective environment, independently of the Team and engine location. Confirm Employees inherit the cloud host and `createdBy.employeeId` is their Manager ID. A sent `messageId` is not completion. Managers can query their own Team topology and all registered host summaries without host administration privileges.

JSON API: `group.add {name,mode:"cloud",hostId,directory}` and `group.configure {name,mode:"cloud",hostId,directory}`. Connection fields no longer create a host inside a Team. `host.create` accepts `name,host,os,defaultDirectory` and optional `port,identityFile,knownHosts,sshConfig,jump,distribution,password`; use `host.update ID --data @patch.json` for changes. Password omitted means unchanged; an empty string removes it. `host.list/get` normally expose `hasPassword`. `host.credentials ID` returns `{id,password,files}`: files maps each registered `identityFile`, `knownHosts`, and `sshConfig` to `{path,content}`, including the private key text. `host.list --credentials` (JSON `credentials:true`) includes a `credentials` object on every host the caller can read: Governor/Operator all hosts, Manager its Cloud Team host, other hosts remain summaries. Employee credential requests are rejected. `host.get/credentials` use the same host scope; Manager cannot read another Team host or gain host mutation/exec permissions. Internal SSH askpass uses `host.credentials {id,files:false}` to request only the password. Passwords use AES-256-GCM at rest under `~/AgentsCompany/cloud-hosts`, with a separate 0600 local key; they are obtained by SSH askpass via a 0600 local socket, never automatically passed in command arguments or model context. An explicit `host.credentials` or `host.list --credentials` response contains the password and registered SSH file contents, so a management Agent invoking that API can see it. This does not protect against another process with the same OS-user privileges.

主画布左下角“刷新主机状态”按钮手动检查当前视图的主机。打开页面、切换视图、聚焦窗口和等待均不会自动发起 SSH 检查；页面读取并显示上次结果，悬停可见检查时间。Cloud Hosts 插件同样只在用户点击检测／刷新时检查。

`host.check` 在 Core 中合并同一主机的并发请求，并将后台 SSH 健康检查限制为最多 3 个并发，避免多个 Team 或窗口同时刷新挤占员工连接。检查完成后的新请求仍会重新探测，不缓存旧结果。

SSH 文件属于主机连接资源，建议放在稳定的主机凭据目录中，不要放在可能删除的员工工作区。连接前会检查显式配置的 SSH 文件是否存在，缺失时明确提示在 Cloud Hosts 修复路径，不将它误报为员工职位权限错误。删除工作区也会保护这些引用，包括共享文件及其符号链接目标。

`host.fingerprints ID` reads SSH server fingerprints. After independently checking with the host provider, `host.trust ID --fingerprint SHA256:...` rescans, requires an exact match, and saves the key to this host's managed known_hosts. It never disables SSH host key checks. Jump/HostKeyAlias configurations use their existing SSH trust setup.

`host.check` tests authenticated SSH reachability without requiring the host's default directory or a Team workspace. It returns `{connected,checkedAt,environment?,error?}`, stores the latest state, and immediately updates bound Team connection lamps; failure is `connected:false`. The operating system and distribution in `environment` come from the registered host configuration. `host.directories` returns `{path,entries}` containing existing child folders, not files. The Team picker can navigate to an existing directory; it does not create one. `host.remove ID` is rejected while Teams reference it. Editing connection settings closes idle employee sessions/terminals; busy workers block changes. No cloud work falls back to the Mac.

The separate Cloud Hosts plugin exposes these same commands as `hosts.list/get/create/update/remove/check/directories/credentials/fingerprints/trust` through its own CLI, schema and runtime. It is an application-scope service plugin: a Work employee receives its own document/launcher/mailbox, but its documented API manages the shared host registry across Teams. To prepare a management team:

```sh
agents group add 'Cloud Managers' --mode work --plugin cloud-hosts
agents card create --title Operator --group 'Cloud Managers' --management-role governor
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

An employee's Coding Agent engine is fixed at creation, for all roles and execution
locations. Choose `engine` in `card.create` / `session.new`. Changing it requires
explicitly deleting that employee and creating a new one. `card.update` rejects a
different engine before changing state or closing its session. Legacy
`config.engine` always rejects with this guidance. The UI displays the existing
engine as read-only; model and supported thinking/effort controls remain available.
Existing employees and historical native references are retained unchanged.

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

All six community IDs render their original artwork. The picker preserves 34
characters in OpenAI, Claude (including Clawd), and saved community collections. `card.update ID --avatar clawd` changes appearance without
altering employee identity, conversation, workspace, position or management lines.
Attribution and animation adaptations are recorded in THIRD_PARTY_NOTICES.md.

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
for example `C:\Users\user\AgentsCompany`. RDP bookmarks do not replace SSH
connectivity. With a configured SSH alias:

```sh
agents remote check --remote-host windows-host --remote-os windows --remote-dir 'C:\Users\user\AgentsCompany'
agents host create --data '{"name":"Windows Server","host":"windows-host","os":"windows","defaultDirectory":"C:\\Users\\user\\AgentsCompany"}'
agents group add 'Windows Server' --mode cloud --host-id HOST_ID --remote-dir 'C:\Users\user\AgentsCompany'
agents card create --title Fireball --group 'Windows Server' --avatar fireball --engine codex --effort low
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

下面 200 项来自共享协议 `src/shared/api-registry.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。

| 命令 | 参数 | 作用 | 对应界面 | 授权策略 |
| --- | --- | --- | --- | --- |
| <code>agents system info</code> | <code>—</code> | Read Core host OS, architecture and deployment capabilities | 后端信息 | identity |
| <code>agents system directories</code> | <code>[--path PATH]</code> | Browse directories on the Core host (user only) | 后端目录选择 | operator |
| <code>agents engine capabilities</code> | <code>--engine codex&#124;claude&#124;cline&#124;pi</code> | Read adapter capabilities, workspace modes and employee kinds before hiring; no credentials or inference | 创建员工能力检查 | identity |
| <code>agents engine list</code> | <code>—</code> | List registered Coding Agent adapters and public configuration | 引擎管理 | operator |
| <code>agents engine check</code> | <code>--engine ID [--team NAME] [--force]</code> | Check executable, protocol and authentication without inference | 引擎检测 | operator |
| <code>agents engine probe</code> | <code>--engine ID --confirm [--model ID]</code> | Explicit, potentially billed OK-only inference on the Core host; temporary workspace and 45s timeout | 引擎测试调用 | operator |
| <code>agents engine configure</code> | <code>--engine ID --data JSON&#124;@file</code> | Set an executable path or encrypted provider API key (user only) | 引擎配置 | operator |
| <code>agents engine install-plan</code> | <code>--engine ID</code> | Read the pinned official package and Core-host install destination | 引擎安装 | operator |
| <code>agents engine install</code> | <code>--engine ID --confirm</code> | Install a pinned engine into application storage, never global PATH | 引擎安装 | operator |
| <code>agents engine install-status</code> | <code>ID</code> | Read bounded installation progress without credentials | 引擎安装 | operator |
| <code>agents engine cancel-install</code> | <code>ID</code> | Cancel an application-owned installation | 引擎安装 | operator |
| <code>agents engine login</code> | <code>--engine codex</code> | Start official Codex device authorization on the Core host | Codex 登录 | operator |
| <code>agents engine login-status</code> | <code>ID</code> | Read device authorization progress | Codex 登录 | operator |
| <code>agents engine cancel-login</code> | <code>ID</code> | Cancel a pending device authorization | Codex 登录 | operator |
| <code>agents transfer upload-begin</code> | <code>--to JSON&#124;@file --name NAME --bytes N</code> | Begin a scoped upload with a hidden staging file | 浏览器文件上传 | operator |
| <code>agents transfer upload-chunk</code> | <code>ID --offset N --data BASE64&#124;--data-file FILE</code> | Write the next bounded upload chunk | 浏览器文件上传 | operator |
| <code>agents transfer upload-commit</code> | <code>ID</code> | Atomically publish a completed upload without overwriting existing files | 浏览器文件上传 | operator |
| <code>agents transfer upload-abort</code> | <code>ID</code> | Cancel and clean an upload owned by this client | 浏览器文件上传 | operator |
| <code>agents transfer download-info</code> | <code>--from JSON&#124;@file</code> | Read download size and version | 浏览器文件下载 | operator |
| <code>agents transfer download-chunk</code> | <code>--from JSON&#124;@file --offset N [--modified-at N]</code> | Read a bounded file chunk and reject a changed version | 浏览器文件下载 | operator |
| <code>agents auth whoami</code> | <code>—</code> | Read authenticated caller and management role | 管理与协同 | identity |
| <code>agents auth agent-token</code> | <code>ID</code> | Issue or read an employee API credential (user only) | 管理与协同 | operator |
| <code>agents auth revoke</code> | <code>ID</code> | Revoke employee API credentials (user only) | 管理与协同 | operator |
| <code>agents api list</code> | <code>—</code> | List caller-authorized APIs | 管理与协同 | identity |
| <code>agents api describe</code> | <code>COMMAND</code> | Describe an authorized API and its scope | 管理与协同 | identity |
| <code>agents api docs</code> | <code>—</code> | Read the caller role API handbook | 管理与协同 | identity |
| <code>agents avatar list</code> | <code>[--query NAME] [--style default&#124;anime&#124;chibi] [--all]</code> | Discover exact avatar IDs, character names, styles and aliases from the live picker catalog; no inference | 人物形象目录 | identity |
| <code>agents connector get</code> | <code>--manager ID --employee ID</code> | Read endpoint anchors and 24 availablePoints, including all four corners of the uniform employee frame | 连线端点 | layout.read |
| <code>agents connector set</code> | <code>--manager ID --employee ID [--source auto&#124;top&#124;right&#124;bottom&#124;left --source-offset 0.5] [--target auto&#124;top&#124;right&#124;bottom&#124;left --target-offset 0.5] [--points JSON&#124;@file &#124; --auto-route]</code> | Persist endpoint sides and offsets; does not create management authority or a relation | 点击人物周围点位 / 拖动端点吸附 | layout.write |
| <code>agents connector segment</code> | <code>--manager ID --employee ID --index N --x X --y Y</code> | Move an orthogonal segment in source-Team coordinates; preserve attached employees | 拖动任意折线段 | layout.write |
| <code>agents connector reset</code> | <code>--manager ID --employee ID</code> | Restore automatic source and head-top target routing | 恢复自动连接点 | layout.write |
| <code>agents office layout</code> | <code>[--team NAME] [--view VIEW_ID]</code> | Read authorized Team bounds, employee coordinates and permitted layout actions; no filesystem access | Agent 布局工具 | layout.read |
| <code>agents session acknowledge</code> | <code>--employee ID --reply-id ID</code> | User-only acknowledgement of the exact displayed reply; stale acknowledgements do not clear newer replies | 可见回复已读 | operator |
| <code>agents management relayout</code> | <code>--team NAME</code> | Group related employees and fit this Team without changing the viewport | 整理团队拓扑 | layout.write |
| <code>agents management topology</code> | <code>[--team NAME] [--teams-only] [--creator self&#124;others&#124;operator&#124;unknown&#124;EMPLOYEE_ID]</code> | Read teams with isOwnTeam, employeeCount, governorIds, allowedActions and deleteBlockedReason; employee nodes include creation provenance and allowedActions | 管理与协同 | topology |
| <code>agents management activity</code> | <code>[--team NAME]</code> | Read live communication and running delegated tasks; no completed-call linger | 管理交互连线 | topology |
| <code>agents management roles</code> | <code>—</code> | List employee-owned role policies: Employee, Manager and Governor, scopes and protected lifecycle rules | 职位权限 | identity |
| <code>agents management request</code> | <code>--employee ID [--manager ID]</code> | Deprecated: creation lines are derived from createdBy and cannot be edited; all same-Team Employees are manageable | 已停用的管理关系操作 | relation |
| <code>agents management decide</code> | <code>ID approve&#124;deny</code> | Deprecated: creation lines are derived from createdBy and cannot be edited; all same-Team Employees are manageable | 已停用的管理关系操作 | operator |
| <code>agents management unbind</code> | <code>ID</code> | Deprecated: creation lines are derived from createdBy and cannot be edited; all same-Team Employees are manageable | 已停用的管理关系操作 | relation |
| <code>agents management team</code> | <code>—</code> | Deprecated discovery only; Team and folder membership no longer grant authority | 旧接口兼容 | operator |
| <code>agents management global</code> | <code>ID on&#124;off</code> | User-only compatibility alias: assign Governor, or demote Governor to Manager | 旧接口兼容 | operator |
| <code>agents card management-role</code> | <code>ID employee&#124;manager&#124;governor</code> | Assign an employee-owned role; Governor lifecycle is user-only | 管理与协同 | operator |
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
| <code>agents schedule create</code> | <code>--spec @file.json &#124; --name NAME --employee ID --prompt TEXT --at ISO [--view VIEW_ID]</code> | Create an employee task schedule | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule update</code> | <code>ID --patch @file.json</code> | Update a schedule while idle | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule pause</code> | <code>ID</code> | Pause future occurrences | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule resume</code> | <code>ID</code> | Resume from the next future occurrence | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule delete</code> | <code>ID</code> | Cancel active runs and delete the schedule, keeping audit history | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule preview</code> | <code>[ID &#124; --spec @file.json] [--after ISO --count N]</code> | Preview future occurrences without executing | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule run</code> | <code>ID</code> | Run once now without consuming the next scheduled occurrence | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule history</code> | <code>[ID] [--employee ID --limit N]</code> | Read durable run status and conversation IDs | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule cancel</code> | <code>RUN_ID</code> | Cancel an active scheduled turn | CLI 调度基础，供插件复用 | schedule |
| <code>agents settings get</code> | <code>—</code> | Read appearance controls and per-engine default employee models | 应用设置 | operator |
| <code>agents engine models</code> | <code>--engine codex&#124;claude&#124;cline&#124;pi [--kind worker&#124;cloud-native-worker] [--team NAME]</code> | List available models before employee creation, without inference; Cloud Native reads the selected host | 创建员工和默认模型设置 | operator |
| <code>agents settings set</code> | <code>[--theme white&#124;light&#124;space&#124;black&#124;midnight&#124;sage] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on&#124;off] [--team-overview on&#124;off] [--default-codex-model ID] [--default-claude-model ID] [--default-cline-model ID] [--default-pi-model ID]</code> | Persist appearance, canvas controls and default employee models | 背景、灵敏度和团队索引 | operator |
| <code>agents view get</code> | <code>—</code> | Read service-owned navigation, including without a window | 当前面板 | operator |
| <code>agents view open</code> | <code>home&#124;team&#124;employee&#124;workspace&#124;conversation&#124;initialization&#124;plugin&#124;settings [--name NAME] [--employee ID] [--plugin ID]</code> | Open a form, workspace or employee conversation | 打开资料或会话 | operator |
| <code>agents view close</code> | <code>—</code> | Close the current panel after saving workspace edits; keep engines running | × / Escape / 收起面板 | operator |
| <code>agents view details</code> | <code>on&#124;off</code> | Show or hide employee details inside a conversation | 员工资料 / 返回会话 | operator |
| <code>agents status</code> | <code>—</code> | Is the app running, and how many sessions are live | The app window being open | operator |
| <code>agents session list</code> | <code>[--live] [--summary]</code> | List stored cards (or live sessions with --live) | The company floor | employee.read |
| <code>agents session new</code> | <code>[--engine claude&#124;codex] [--group NAME] [--model M]</code> | Create a session | “+ Hire employee” | operator |
| <code>agents session rename</code> | <code>&lt;card-or-session-id&gt; &lt;title&gt;</code> | Rename an employee and its one conversation without moving the folder | 会话名称 / 员工名牌 | operator |
| <code>agents session open</code> | <code>&lt;cardId&gt;</code> | Open a stored card (resumes its engine context) | Clicking a card | employee.message |
| <code>agents session send</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT [--view VIEW_ID]</code> | Send a message to a Worker session | 对话输入框 | employee.message |
| <code>agents host fingerprints</code> | <code>&lt;id&gt;</code> | Read SSH host key fingerprints without trusting them | 查看主机指纹 | operator |
| <code>agents host trust</code> | <code>&lt;id&gt; --fingerprint SHA256:...</code> | Trust an explicitly confirmed and matching SSH host fingerprint | 确认信任主机 | operator |
| <code>agents host terminal-open</code> | <code>&lt;id&gt; [--directory PATH --cols N --rows N]</code> | Open a persistent SSH PTY without an employee | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-list</code> | <code>&lt;id&gt;</code> | List host PTYs | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-read</code> | <code>&lt;id&gt; --terminal ID [--cursor N --wait-ms N]</code> | Read incremental host PTY output, optionally waiting up to 15000ms for new data | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-input</code> | <code>&lt;id&gt; --terminal ID --data TEXT&#124;--file FILE [--enter]</code> | Send host PTY input and control keys | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-resize</code> | <code>&lt;id&gt; --terminal ID --cols N --rows N</code> | Resize a host PTY | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-close</code> | <code>&lt;id&gt; --terminal ID</code> | Close a host PTY | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-list</code> | <code>&lt;id&gt;</code> | List active remote desktop transports | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-open</code> | <code>&lt;id&gt;</code> | Open configured RDP or VNC transport; does not imply desktop login | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-launch</code> | <code>&lt;id&gt; --session ID</code> | Launch native RDP client on the Core machine | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-close</code> | <code>&lt;id&gt; --session ID</code> | Close desktop transport and SSH forward | Cloud Hosts 工作台 | operator |
| <code>agents host exec</code> | <code>&lt;id&gt; --command COMMAND&#124;--command-file FILE [--directory PATH --timeout SECONDS]</code> | Execute a management command exclusively on the registered remote host | 远端管理命令 | operator |
| <code>agents host list</code> | <code>[--os linux&#124;macos&#124;windows] [--distribution ubuntu&#124;kali&#124;ID] [--summary] [--credentials]</code> | Discover the shared host registry; credentials optionally includes passwords and SSH files for authorized Manager/Governor hosts; no SSH probes | Cloud Hosts 插件 | topology |
| <code>agents host get</code> | <code>&lt;id&gt;</code> | Read a cloud host connection record; Governor all hosts, Manager its Team host | Cloud Hosts 插件 | host.read |
| <code>agents host create</code> | <code>--data @host.json</code> | Create a cloud host in the shared registry | Cloud Hosts 插件 | operator |
| <code>agents host update</code> | <code>&lt;id&gt; --data @patch.json</code> | Edit host connection and credentials | Cloud Hosts 插件 | operator |
| <code>agents host remove</code> | <code>&lt;id&gt;</code> | Remove an unbound cloud host | Cloud Hosts 插件 | operator |
| <code>agents host check</code> | <code>&lt;id&gt;</code> | Check SSH connectivity without requiring a Team working directory | Cloud Hosts 插件与 Team 连接灯 | operator |
| <code>agents host directories</code> | <code>&lt;id&gt; [--path PATH]</code> | Browse existing directories on a registered cloud host | Cloud Hosts 插件 | operator |
| <code>agents host credentials</code> | <code>&lt;id&gt;</code> | Read authorized host password and registered private key, known_hosts and SSH config contents | Cloud Hosts 插件 | host.read |
| <code>agents engine remote-check</code> | <code>--team NAME --engine codex&#124;claude [--directory PATH]</code> | Check a Cloud Team native CLI, protocol, authentication and workspace before hiring | Cloud Native Worker 创建前检查 | operator |
| <code>agents engine remote-sessions</code> | <code>--team NAME --engine codex&#124;claude</code> | List native sessions on the selected Cloud Team host | 绑定已有云端会话 | operator |
| <code>agents card native-bind</code> | <code>&lt;employee-id&gt; &lt;native-session-id&gt;</code> | Bind an existing remote native session without taking deletion ownership | 绑定远端原生会话 | operator |
| <code>agents session follow</code> | <code>&lt;id&gt; [--raw]</code> | Stream a session’s events until its turn ends | Watching the transcript | employee.read |
| <code>agents session transcript</code> | <code>&lt;id&gt; [--thinking]</code> | Print a session’s conversation as text | The transcript pane | employee.read |
| <code>agents session interrupt</code> | <code>&lt;id&gt;</code> | Stop the current turn | The “■ Stop” button | employee.message |
| <code>agents session close</code> | <code>&lt;id&gt;</code> | Close a live engine while retaining the employee and history | CLI 显式结束引擎 | operator |
| <code>agents session info</code> | <code>&lt;id&gt;</code> | Show a live session’s engines, models, commands | The toolbar dropdowns | employee.read |
| <code>agents session activity</code> | <code>&lt;id&gt;</code> | Current speech, published thinking or tool preview; null when idle | 员工活动气泡 | employee.read |
| <code>agents session snapshot</code> | <code>&lt;id&gt;</code> | Full frontend state | The conversation and toolbar | employee.read |
| <code>agents session search</code> | <code>&lt;query&gt;</code> | Search employees and workspaces | Office search | operator |
| <code>agents approval list</code> | <code>&lt;id&gt;</code> | Pending tool permissions | Permission requests | operator |
| <code>agents approval respond</code> | <code>&lt;id&gt; &lt;requestId&gt; allow&#124;deny [--answers JSON] [--form JSON]</code> | Answer a tool permission | Allow / Decline | operator |
| <code>agents config engine</code> | <code>&lt;card-or-live-id&gt; ENGINE</code> | Retired: always rejects; delete the employee and create a new one to choose another engine | 创建后引擎固定 | operator |
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
| <code>agents session enqueue</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT [--view VIEW_ID]</code> | Queue a message after the active turn | 排队发送 | employee.message |
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
| <code>agents team-view update</code> | <code>ID --patch @patch.json</code> | Rename, reorder, or change Team membership of a custom view | 编辑或拖动视图 | operator |
| <code>agents team-view remove</code> | <code>ID</code> | Delete a custom view without deleting Teams | 删除视图 | operator |
| <code>agents team-view select</code> | <code>all&#124;ID</code> | Select a saved Team view and its canvas viewport | 切换视图 | operator |
| <code>agents group add</code> | <code>&lt;name&gt; [--mode work&#124;build&#124;cloud] [--plugin ID] [--host-id ID] [--directory-mode default&#124;bind] [--remote-dir PATH] [--os linux&#124;macos&#124;windows] [--distribution ID]</code> | Create a real cloud Team with host-id; directory-mode default creates a new remote child folder; os/distribution assert actual host, never labels | “+ Department” | operator |
| <code>agents group configure</code> | <code>&lt;name&gt; --mode work&#124;build&#124;cloud [--plugin ID] [--host-id ID --remote-dir PATH]</code> | Configure a legacy unbound Team; created Team bindings are fixed | 创建 Team 时配置工作方式 | operator |
| <code>agents group remove</code> | <code>&lt;name&gt; [name ...] [--delete-workspace]</code> | Delete selected Teams and all their employees; optionally delete their employee folders after one batch preflight | 侧栏编辑 · 多选团队 · 一次确认删除 | operator |
| <code>agents room place</code> | <code>&lt;name&gt; --col N --row N [--w N --h N]</code> | Position a department’s room on the floor | Dragging a room by its sign | layout.write |
| <code>agents card rename</code> | <code>&lt;cardId&gt; &lt;title&gt;</code> | Rename an employee without moving its working folder | 员工资料中的名字 | operator |
| <code>agents card move</code> | <code>&lt;cardId&gt; &lt;same-group&gt; [--before id]</code> | Reorder within the existing Team; group and directory are fixed | 同 Team 内排序 | operator |
| <code>agents card remove</code> | <code>&lt;cardId&gt; [cardId ...] [--delete-workspace]</code> | Remove selected employees and owned sessions; optionally delete all their folders after one batch preflight | 侧栏编辑 · 多选员工 · 一次确认删除 | employee.delete |
| <code>agents card clone</code> | <code>&lt;id&gt; --title NAME [--directory-mode default&#124;bind] [--cwd PATH]</code> | Clone an employee with an independent native conversation | 克隆员工 | operator |
| <code>agents card initialize</code> | <code>&lt;employee-id&gt; [--model ID] [--effort LEVEL]</code> | Retry Manager/Governor onboarding; Employees stay ready without a model turn | Manager 重试初始化 | employee.message |
| <code>agents card create</code> | <code>--title NAME [--group TEAM] [--character NAME --avatar-style anime&#124;chibi &#124; --avatar ID] [--profession TEXT] [--management-role employee&#124;manager&#124;governor] [--kind worker&#124;cloud-native-worker] [--work-environment team&#124;local] [--engine E] [--model ID] [--thinking on&#124;off] [--effort LEVEL]</code> | Create an employee: title=name, character/avatar=appearance, managementRole=rank, profession=duties; discover appearances with avatar.list and verify via session.status | 添加员工 | employee.create |
| <code>agents card avatar</code> | <code>&lt;employee-id&gt; [--avatar ID &#124; --character NAME --avatar-style anime&#124;chibi]</code> | Set only a controlled employee appearance and its default palette; Manager own Team, Governor across Teams; discover IDs with avatar.list | 员工人物形象 | employee.configure |
| <code>agents card update</code> | <code>&lt;cardId&gt; [--title NAME] [--avatar ID &#124; --character NAME --avatar-style STYLE] [--profession TEXT]</code> | User-only general profile editing; supervisors use card.avatar for appearance; Team and folder stay fixed | 员工资料 | operator |
| <code>agents group rename</code> | <code>&lt;name&gt; &lt;newName&gt;</code> | Rename a Team without renaming or moving its workspace folder | Team 名称 | operator |
| <code>agents room design</code> | <code>&lt;name&gt; [--theme sage] [--wall windows] [--desk oak]</code> | Replace room surfaces and furnishings | 空间设计 | operator |
| <code>agents group migrate</code> | <code>&lt;name&gt;</code> | Move a legacy Team into its managed directory, preserving files | 修复旧工作目录 | operator |
| <code>agents group root</code> | <code>&lt;name&gt; &lt;absolute-folder&gt;</code> | Bind a legacy unbound Team; an existing Team root cannot be changed | 创建 Team 时选择文件夹 | operator |
| <code>agents room bounds</code> | <code>&lt;name&gt; --x N --y N --width N --height N [--shape S] [--arrangement A]</code> | Move and resize a canvas room | 拖动、缩放 Team | layout.write |
| <code>agents room layout</code> | <code>&lt;name&gt;</code> | Computed bounds and full-size employee positions | Team 画布布局 | layout.read |
| <code>agents card place</code> | <code>&lt;id&gt; --x N --y N [--snap on&#124;off] [--zoom N]</code> | Place an employee freely or snap to nearby seats | 拖动员工 | layout.write |
| <code>agents canvas view</code> | <code>[--view VIEW_ID]</code> | Read viewport position and zoom | 画布视野 | operator |
| <code>agents canvas set</code> | <code>--x N --y N --zoom N [--view VIEW_ID]</code> | Pan and zoom the canvas | 平移、缩放画布 | operator |
| <code>agents plugin list</code> | <code>—</code> | List installed software plugins | Team 工作空间插件 | plugin |
| <code>agents plugin describe</code> | <code>&lt;id&gt;</code> | Read a plugin manifest, API schema and Markdown guide | 插件信息 | plugin |
| <code>agents plugin install</code> | <code>&lt;directory&gt;</code> | Install a compatible local plugin package | CLI 安装插件 | operator |
| <code>agents plugin call</code> | <code>&lt;id&gt; &lt;method&gt; --team NAME [--params JSON] [--raw]</code> | Invoke the shared plugin runtime; raw preserves the JSON-RPC error/result envelope | 插件中的操作 | plugin |
| <code>agents plugin open</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open or focus an independent plugin window | 独立插件窗口 | operator |
| <code>agents plugin windows</code> | <code>—</code> | List plugin window state, also in headless mode | 独立插件窗口 | operator |
| <code>agents plugin place</code> | <code>&lt;windowId&gt; --x N --y N --width N --height N</code> | Move and resize a plugin window | 独立插件窗口 | operator |
| <code>agents plugin mode</code> | <code>&lt;windowId&gt; normal&#124;minimized&#124;maximized&#124;fullscreen</code> | Change native plugin window state | 插件窗口最小化、还原与全屏 | operator |
| <code>agents plugin dismiss</code> | <code>&lt;windowId&gt;</code> | Save and close an independent plugin window | 独立插件窗口 | operator |
| <code>agents plugin view</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open a plugin view in its managed root or selected scope | Team 工作空间 | operator |
| <code>agents plugin close</code> | <code>&lt;viewId&gt;</code> | Close an embedded plugin view | 关闭工作空间 | operator |
| <code>agents workspace docs</code> | <code>--team NAME</code> | Refresh standardized CLI documentation in the workspace | 自动准备 Agent 文档 | workspace |
| <code>agents workspace suggest</code> | <code>--team NAME [--work-environment team&#124;local]</code> | Suggest an external workspace directory without changing files | 默认工作目录 | operator |
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
| <code>agents workspace write</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID] --content TEXT&#124;--base64-file IMAGE_B64 [--hash HASH]</code> | Save text or a PNG/JPEG/GIF/WebP image in a workspace | 保存文件或粘贴截图 | workspace |
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
| <code>agents ui screenshot</code> | <code>&lt;path&gt; [--privacy]</code> | Capture a fresh desktop frame; privacy hides Team paths, activity bubbles and dimensions only during export | Rendered interface | operator |
| <code>agents ui drag</code> | <code>&lt;selector&gt; --dx N --dy N</code> | Drag a rendered component | 拖动控件 | operator |
| <code>agents ui wheel</code> | <code>&lt;selector&gt; --dx N --dy N [--zoom]</code> | Pan or zoom with the mouse wheel | 画布滚轮 | operator |

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

## Management authorization

Jobs and runs preserve the requesting principal and the exact active relation ID.
Creation, manual run, resume and actual launch revalidate that authority. Revocation
disables future jobs and cancels matching active runs; unrelated user/Manager work
is retained. Legacy jobs without delegation remain operator-owned. `source` is only
a label and never grants permission. Manager schedule listings include their own
jobs and runs, not the global scheduler store.

## Governor 任务的视图目标

Governor 定时任务必须在 `action.viewId` 指定稳定 Team 视图 ID，简写命令可用 `--view VIEW_ID`。创建、修改和执行时校验；模型收到同一目标视图，运行时不查询当前标签作为兜底。视图删除后任务失败，不退回 All Team；此字段不授予权限。普通 Employee / Team Manager 不接收该字段。

```sh
agents schedule create --name "研发视图检查" --employee GOVERNOR_ID --view VIEW_ID --prompt "查看这个视图的团队布局" --every-seconds 3600 --paused
```

## 全部 CLI 命令索引

下面 200 项来自共享协议 `src/shared/api-registry.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。

| 命令 | 参数 | 作用 | 对应界面 | 授权策略 |
| --- | --- | --- | --- | --- |
| <code>agents system info</code> | <code>—</code> | Read Core host OS, architecture and deployment capabilities | 后端信息 | identity |
| <code>agents system directories</code> | <code>[--path PATH]</code> | Browse directories on the Core host (user only) | 后端目录选择 | operator |
| <code>agents engine capabilities</code> | <code>--engine codex&#124;claude&#124;cline&#124;pi</code> | Read adapter capabilities, workspace modes and employee kinds before hiring; no credentials or inference | 创建员工能力检查 | identity |
| <code>agents engine list</code> | <code>—</code> | List registered Coding Agent adapters and public configuration | 引擎管理 | operator |
| <code>agents engine check</code> | <code>--engine ID [--team NAME] [--force]</code> | Check executable, protocol and authentication without inference | 引擎检测 | operator |
| <code>agents engine probe</code> | <code>--engine ID --confirm [--model ID]</code> | Explicit, potentially billed OK-only inference on the Core host; temporary workspace and 45s timeout | 引擎测试调用 | operator |
| <code>agents engine configure</code> | <code>--engine ID --data JSON&#124;@file</code> | Set an executable path or encrypted provider API key (user only) | 引擎配置 | operator |
| <code>agents engine install-plan</code> | <code>--engine ID</code> | Read the pinned official package and Core-host install destination | 引擎安装 | operator |
| <code>agents engine install</code> | <code>--engine ID --confirm</code> | Install a pinned engine into application storage, never global PATH | 引擎安装 | operator |
| <code>agents engine install-status</code> | <code>ID</code> | Read bounded installation progress without credentials | 引擎安装 | operator |
| <code>agents engine cancel-install</code> | <code>ID</code> | Cancel an application-owned installation | 引擎安装 | operator |
| <code>agents engine login</code> | <code>--engine codex</code> | Start official Codex device authorization on the Core host | Codex 登录 | operator |
| <code>agents engine login-status</code> | <code>ID</code> | Read device authorization progress | Codex 登录 | operator |
| <code>agents engine cancel-login</code> | <code>ID</code> | Cancel a pending device authorization | Codex 登录 | operator |
| <code>agents transfer upload-begin</code> | <code>--to JSON&#124;@file --name NAME --bytes N</code> | Begin a scoped upload with a hidden staging file | 浏览器文件上传 | operator |
| <code>agents transfer upload-chunk</code> | <code>ID --offset N --data BASE64&#124;--data-file FILE</code> | Write the next bounded upload chunk | 浏览器文件上传 | operator |
| <code>agents transfer upload-commit</code> | <code>ID</code> | Atomically publish a completed upload without overwriting existing files | 浏览器文件上传 | operator |
| <code>agents transfer upload-abort</code> | <code>ID</code> | Cancel and clean an upload owned by this client | 浏览器文件上传 | operator |
| <code>agents transfer download-info</code> | <code>--from JSON&#124;@file</code> | Read download size and version | 浏览器文件下载 | operator |
| <code>agents transfer download-chunk</code> | <code>--from JSON&#124;@file --offset N [--modified-at N]</code> | Read a bounded file chunk and reject a changed version | 浏览器文件下载 | operator |
| <code>agents auth whoami</code> | <code>—</code> | Read authenticated caller and management role | 管理与协同 | identity |
| <code>agents auth agent-token</code> | <code>ID</code> | Issue or read an employee API credential (user only) | 管理与协同 | operator |
| <code>agents auth revoke</code> | <code>ID</code> | Revoke employee API credentials (user only) | 管理与协同 | operator |
| <code>agents api list</code> | <code>—</code> | List caller-authorized APIs | 管理与协同 | identity |
| <code>agents api describe</code> | <code>COMMAND</code> | Describe an authorized API and its scope | 管理与协同 | identity |
| <code>agents api docs</code> | <code>—</code> | Read the caller role API handbook | 管理与协同 | identity |
| <code>agents avatar list</code> | <code>[--query NAME] [--style default&#124;anime&#124;chibi] [--all]</code> | Discover exact avatar IDs, character names, styles and aliases from the live picker catalog; no inference | 人物形象目录 | identity |
| <code>agents connector get</code> | <code>--manager ID --employee ID</code> | Read endpoint anchors and 24 availablePoints, including all four corners of the uniform employee frame | 连线端点 | layout.read |
| <code>agents connector set</code> | <code>--manager ID --employee ID [--source auto&#124;top&#124;right&#124;bottom&#124;left --source-offset 0.5] [--target auto&#124;top&#124;right&#124;bottom&#124;left --target-offset 0.5] [--points JSON&#124;@file &#124; --auto-route]</code> | Persist endpoint sides and offsets; does not create management authority or a relation | 点击人物周围点位 / 拖动端点吸附 | layout.write |
| <code>agents connector segment</code> | <code>--manager ID --employee ID --index N --x X --y Y</code> | Move an orthogonal segment in source-Team coordinates; preserve attached employees | 拖动任意折线段 | layout.write |
| <code>agents connector reset</code> | <code>--manager ID --employee ID</code> | Restore automatic source and head-top target routing | 恢复自动连接点 | layout.write |
| <code>agents office layout</code> | <code>[--team NAME] [--view VIEW_ID]</code> | Read authorized Team bounds, employee coordinates and permitted layout actions; no filesystem access | Agent 布局工具 | layout.read |
| <code>agents session acknowledge</code> | <code>--employee ID --reply-id ID</code> | User-only acknowledgement of the exact displayed reply; stale acknowledgements do not clear newer replies | 可见回复已读 | operator |
| <code>agents management relayout</code> | <code>--team NAME</code> | Group related employees and fit this Team without changing the viewport | 整理团队拓扑 | layout.write |
| <code>agents management topology</code> | <code>[--team NAME] [--teams-only] [--creator self&#124;others&#124;operator&#124;unknown&#124;EMPLOYEE_ID]</code> | Read teams with isOwnTeam, employeeCount, governorIds, allowedActions and deleteBlockedReason; employee nodes include creation provenance and allowedActions | 管理与协同 | topology |
| <code>agents management activity</code> | <code>[--team NAME]</code> | Read live communication and running delegated tasks; no completed-call linger | 管理交互连线 | topology |
| <code>agents management roles</code> | <code>—</code> | List employee-owned role policies: Employee, Manager and Governor, scopes and protected lifecycle rules | 职位权限 | identity |
| <code>agents management request</code> | <code>--employee ID [--manager ID]</code> | Deprecated: creation lines are derived from createdBy and cannot be edited; all same-Team Employees are manageable | 已停用的管理关系操作 | relation |
| <code>agents management decide</code> | <code>ID approve&#124;deny</code> | Deprecated: creation lines are derived from createdBy and cannot be edited; all same-Team Employees are manageable | 已停用的管理关系操作 | operator |
| <code>agents management unbind</code> | <code>ID</code> | Deprecated: creation lines are derived from createdBy and cannot be edited; all same-Team Employees are manageable | 已停用的管理关系操作 | relation |
| <code>agents management team</code> | <code>—</code> | Deprecated discovery only; Team and folder membership no longer grant authority | 旧接口兼容 | operator |
| <code>agents management global</code> | <code>ID on&#124;off</code> | User-only compatibility alias: assign Governor, or demote Governor to Manager | 旧接口兼容 | operator |
| <code>agents card management-role</code> | <code>ID employee&#124;manager&#124;governor</code> | Assign an employee-owned role; Governor lifecycle is user-only | 管理与协同 | operator |
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
| <code>agents schedule create</code> | <code>--spec @file.json &#124; --name NAME --employee ID --prompt TEXT --at ISO [--view VIEW_ID]</code> | Create an employee task schedule | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule update</code> | <code>ID --patch @file.json</code> | Update a schedule while idle | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule pause</code> | <code>ID</code> | Pause future occurrences | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule resume</code> | <code>ID</code> | Resume from the next future occurrence | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule delete</code> | <code>ID</code> | Cancel active runs and delete the schedule, keeping audit history | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule preview</code> | <code>[ID &#124; --spec @file.json] [--after ISO --count N]</code> | Preview future occurrences without executing | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule run</code> | <code>ID</code> | Run once now without consuming the next scheduled occurrence | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule history</code> | <code>[ID] [--employee ID --limit N]</code> | Read durable run status and conversation IDs | CLI 调度基础，供插件复用 | schedule |
| <code>agents schedule cancel</code> | <code>RUN_ID</code> | Cancel an active scheduled turn | CLI 调度基础，供插件复用 | schedule |
| <code>agents settings get</code> | <code>—</code> | Read appearance controls and per-engine default employee models | 应用设置 | operator |
| <code>agents engine models</code> | <code>--engine codex&#124;claude&#124;cline&#124;pi [--kind worker&#124;cloud-native-worker] [--team NAME]</code> | List available models before employee creation, without inference; Cloud Native reads the selected host | 创建员工和默认模型设置 | operator |
| <code>agents settings set</code> | <code>[--theme white&#124;light&#124;space&#124;black&#124;midnight&#124;sage] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on&#124;off] [--team-overview on&#124;off] [--default-codex-model ID] [--default-claude-model ID] [--default-cline-model ID] [--default-pi-model ID]</code> | Persist appearance, canvas controls and default employee models | 背景、灵敏度和团队索引 | operator |
| <code>agents view get</code> | <code>—</code> | Read service-owned navigation, including without a window | 当前面板 | operator |
| <code>agents view open</code> | <code>home&#124;team&#124;employee&#124;workspace&#124;conversation&#124;initialization&#124;plugin&#124;settings [--name NAME] [--employee ID] [--plugin ID]</code> | Open a form, workspace or employee conversation | 打开资料或会话 | operator |
| <code>agents view close</code> | <code>—</code> | Close the current panel after saving workspace edits; keep engines running | × / Escape / 收起面板 | operator |
| <code>agents view details</code> | <code>on&#124;off</code> | Show or hide employee details inside a conversation | 员工资料 / 返回会话 | operator |
| <code>agents status</code> | <code>—</code> | Is the app running, and how many sessions are live | The app window being open | operator |
| <code>agents session list</code> | <code>[--live] [--summary]</code> | List stored cards (or live sessions with --live) | The company floor | employee.read |
| <code>agents session new</code> | <code>[--engine claude&#124;codex] [--group NAME] [--model M]</code> | Create a session | “+ Hire employee” | operator |
| <code>agents session rename</code> | <code>&lt;card-or-session-id&gt; &lt;title&gt;</code> | Rename an employee and its one conversation without moving the folder | 会话名称 / 员工名牌 | operator |
| <code>agents session open</code> | <code>&lt;cardId&gt;</code> | Open a stored card (resumes its engine context) | Clicking a card | employee.message |
| <code>agents session send</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT [--view VIEW_ID]</code> | Send a message to a Worker session | 对话输入框 | employee.message |
| <code>agents host fingerprints</code> | <code>&lt;id&gt;</code> | Read SSH host key fingerprints without trusting them | 查看主机指纹 | operator |
| <code>agents host trust</code> | <code>&lt;id&gt; --fingerprint SHA256:...</code> | Trust an explicitly confirmed and matching SSH host fingerprint | 确认信任主机 | operator |
| <code>agents host terminal-open</code> | <code>&lt;id&gt; [--directory PATH --cols N --rows N]</code> | Open a persistent SSH PTY without an employee | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-list</code> | <code>&lt;id&gt;</code> | List host PTYs | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-read</code> | <code>&lt;id&gt; --terminal ID [--cursor N --wait-ms N]</code> | Read incremental host PTY output, optionally waiting up to 15000ms for new data | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-input</code> | <code>&lt;id&gt; --terminal ID --data TEXT&#124;--file FILE [--enter]</code> | Send host PTY input and control keys | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-resize</code> | <code>&lt;id&gt; --terminal ID --cols N --rows N</code> | Resize a host PTY | Cloud Hosts 工作台 | operator |
| <code>agents host terminal-close</code> | <code>&lt;id&gt; --terminal ID</code> | Close a host PTY | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-list</code> | <code>&lt;id&gt;</code> | List active remote desktop transports | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-open</code> | <code>&lt;id&gt;</code> | Open configured RDP or VNC transport; does not imply desktop login | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-launch</code> | <code>&lt;id&gt; --session ID</code> | Launch native RDP client on the Core machine | Cloud Hosts 工作台 | operator |
| <code>agents host desktop-close</code> | <code>&lt;id&gt; --session ID</code> | Close desktop transport and SSH forward | Cloud Hosts 工作台 | operator |
| <code>agents host exec</code> | <code>&lt;id&gt; --command COMMAND&#124;--command-file FILE [--directory PATH --timeout SECONDS]</code> | Execute a management command exclusively on the registered remote host | 远端管理命令 | operator |
| <code>agents host list</code> | <code>[--os linux&#124;macos&#124;windows] [--distribution ubuntu&#124;kali&#124;ID] [--summary] [--credentials]</code> | Discover the shared host registry; credentials optionally includes passwords and SSH files for authorized Manager/Governor hosts; no SSH probes | Cloud Hosts 插件 | topology |
| <code>agents host get</code> | <code>&lt;id&gt;</code> | Read a cloud host connection record; Governor all hosts, Manager its Team host | Cloud Hosts 插件 | host.read |
| <code>agents host create</code> | <code>--data @host.json</code> | Create a cloud host in the shared registry | Cloud Hosts 插件 | operator |
| <code>agents host update</code> | <code>&lt;id&gt; --data @patch.json</code> | Edit host connection and credentials | Cloud Hosts 插件 | operator |
| <code>agents host remove</code> | <code>&lt;id&gt;</code> | Remove an unbound cloud host | Cloud Hosts 插件 | operator |
| <code>agents host check</code> | <code>&lt;id&gt;</code> | Check SSH connectivity without requiring a Team working directory | Cloud Hosts 插件与 Team 连接灯 | operator |
| <code>agents host directories</code> | <code>&lt;id&gt; [--path PATH]</code> | Browse existing directories on a registered cloud host | Cloud Hosts 插件 | operator |
| <code>agents host credentials</code> | <code>&lt;id&gt;</code> | Read authorized host password and registered private key, known_hosts and SSH config contents | Cloud Hosts 插件 | host.read |
| <code>agents engine remote-check</code> | <code>--team NAME --engine codex&#124;claude [--directory PATH]</code> | Check a Cloud Team native CLI, protocol, authentication and workspace before hiring | Cloud Native Worker 创建前检查 | operator |
| <code>agents engine remote-sessions</code> | <code>--team NAME --engine codex&#124;claude</code> | List native sessions on the selected Cloud Team host | 绑定已有云端会话 | operator |
| <code>agents card native-bind</code> | <code>&lt;employee-id&gt; &lt;native-session-id&gt;</code> | Bind an existing remote native session without taking deletion ownership | 绑定远端原生会话 | operator |
| <code>agents session follow</code> | <code>&lt;id&gt; [--raw]</code> | Stream a session’s events until its turn ends | Watching the transcript | employee.read |
| <code>agents session transcript</code> | <code>&lt;id&gt; [--thinking]</code> | Print a session’s conversation as text | The transcript pane | employee.read |
| <code>agents session interrupt</code> | <code>&lt;id&gt;</code> | Stop the current turn | The “■ Stop” button | employee.message |
| <code>agents session close</code> | <code>&lt;id&gt;</code> | Close a live engine while retaining the employee and history | CLI 显式结束引擎 | operator |
| <code>agents session info</code> | <code>&lt;id&gt;</code> | Show a live session’s engines, models, commands | The toolbar dropdowns | employee.read |
| <code>agents session activity</code> | <code>&lt;id&gt;</code> | Current speech, published thinking or tool preview; null when idle | 员工活动气泡 | employee.read |
| <code>agents session snapshot</code> | <code>&lt;id&gt;</code> | Full frontend state | The conversation and toolbar | employee.read |
| <code>agents session search</code> | <code>&lt;query&gt;</code> | Search employees and workspaces | Office search | operator |
| <code>agents approval list</code> | <code>&lt;id&gt;</code> | Pending tool permissions | Permission requests | operator |
| <code>agents approval respond</code> | <code>&lt;id&gt; &lt;requestId&gt; allow&#124;deny [--answers JSON] [--form JSON]</code> | Answer a tool permission | Allow / Decline | operator |
| <code>agents config engine</code> | <code>&lt;card-or-live-id&gt; ENGINE</code> | Retired: always rejects; delete the employee and create a new one to choose another engine | 创建后引擎固定 | operator |
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
| <code>agents session enqueue</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT [--view VIEW_ID]</code> | Queue a message after the active turn | 排队发送 | employee.message |
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
| <code>agents team-view update</code> | <code>ID --patch @patch.json</code> | Rename, reorder, or change Team membership of a custom view | 编辑或拖动视图 | operator |
| <code>agents team-view remove</code> | <code>ID</code> | Delete a custom view without deleting Teams | 删除视图 | operator |
| <code>agents team-view select</code> | <code>all&#124;ID</code> | Select a saved Team view and its canvas viewport | 切换视图 | operator |
| <code>agents group add</code> | <code>&lt;name&gt; [--mode work&#124;build&#124;cloud] [--plugin ID] [--host-id ID] [--directory-mode default&#124;bind] [--remote-dir PATH] [--os linux&#124;macos&#124;windows] [--distribution ID]</code> | Create a real cloud Team with host-id; directory-mode default creates a new remote child folder; os/distribution assert actual host, never labels | “+ Department” | operator |
| <code>agents group configure</code> | <code>&lt;name&gt; --mode work&#124;build&#124;cloud [--plugin ID] [--host-id ID --remote-dir PATH]</code> | Configure a legacy unbound Team; created Team bindings are fixed | 创建 Team 时配置工作方式 | operator |
| <code>agents group remove</code> | <code>&lt;name&gt; [name ...] [--delete-workspace]</code> | Delete selected Teams and all their employees; optionally delete their employee folders after one batch preflight | 侧栏编辑 · 多选团队 · 一次确认删除 | operator |
| <code>agents room place</code> | <code>&lt;name&gt; --col N --row N [--w N --h N]</code> | Position a department’s room on the floor | Dragging a room by its sign | layout.write |
| <code>agents card rename</code> | <code>&lt;cardId&gt; &lt;title&gt;</code> | Rename an employee without moving its working folder | 员工资料中的名字 | operator |
| <code>agents card move</code> | <code>&lt;cardId&gt; &lt;same-group&gt; [--before id]</code> | Reorder within the existing Team; group and directory are fixed | 同 Team 内排序 | operator |
| <code>agents card remove</code> | <code>&lt;cardId&gt; [cardId ...] [--delete-workspace]</code> | Remove selected employees and owned sessions; optionally delete all their folders after one batch preflight | 侧栏编辑 · 多选员工 · 一次确认删除 | employee.delete |
| <code>agents card clone</code> | <code>&lt;id&gt; --title NAME [--directory-mode default&#124;bind] [--cwd PATH]</code> | Clone an employee with an independent native conversation | 克隆员工 | operator |
| <code>agents card initialize</code> | <code>&lt;employee-id&gt; [--model ID] [--effort LEVEL]</code> | Retry Manager/Governor onboarding; Employees stay ready without a model turn | Manager 重试初始化 | employee.message |
| <code>agents card create</code> | <code>--title NAME [--group TEAM] [--character NAME --avatar-style anime&#124;chibi &#124; --avatar ID] [--profession TEXT] [--management-role employee&#124;manager&#124;governor] [--kind worker&#124;cloud-native-worker] [--work-environment team&#124;local] [--engine E] [--model ID] [--thinking on&#124;off] [--effort LEVEL]</code> | Create an employee: title=name, character/avatar=appearance, managementRole=rank, profession=duties; discover appearances with avatar.list and verify via session.status | 添加员工 | employee.create |
| <code>agents card avatar</code> | <code>&lt;employee-id&gt; [--avatar ID &#124; --character NAME --avatar-style anime&#124;chibi]</code> | Set only a controlled employee appearance and its default palette; Manager own Team, Governor across Teams; discover IDs with avatar.list | 员工人物形象 | employee.configure |
| <code>agents card update</code> | <code>&lt;cardId&gt; [--title NAME] [--avatar ID &#124; --character NAME --avatar-style STYLE] [--profession TEXT]</code> | User-only general profile editing; supervisors use card.avatar for appearance; Team and folder stay fixed | 员工资料 | operator |
| <code>agents group rename</code> | <code>&lt;name&gt; &lt;newName&gt;</code> | Rename a Team without renaming or moving its workspace folder | Team 名称 | operator |
| <code>agents room design</code> | <code>&lt;name&gt; [--theme sage] [--wall windows] [--desk oak]</code> | Replace room surfaces and furnishings | 空间设计 | operator |
| <code>agents group migrate</code> | <code>&lt;name&gt;</code> | Move a legacy Team into its managed directory, preserving files | 修复旧工作目录 | operator |
| <code>agents group root</code> | <code>&lt;name&gt; &lt;absolute-folder&gt;</code> | Bind a legacy unbound Team; an existing Team root cannot be changed | 创建 Team 时选择文件夹 | operator |
| <code>agents room bounds</code> | <code>&lt;name&gt; --x N --y N --width N --height N [--shape S] [--arrangement A]</code> | Move and resize a canvas room | 拖动、缩放 Team | layout.write |
| <code>agents room layout</code> | <code>&lt;name&gt;</code> | Computed bounds and full-size employee positions | Team 画布布局 | layout.read |
| <code>agents card place</code> | <code>&lt;id&gt; --x N --y N [--snap on&#124;off] [--zoom N]</code> | Place an employee freely or snap to nearby seats | 拖动员工 | layout.write |
| <code>agents canvas view</code> | <code>[--view VIEW_ID]</code> | Read viewport position and zoom | 画布视野 | operator |
| <code>agents canvas set</code> | <code>--x N --y N --zoom N [--view VIEW_ID]</code> | Pan and zoom the canvas | 平移、缩放画布 | operator |
| <code>agents plugin list</code> | <code>—</code> | List installed software plugins | Team 工作空间插件 | plugin |
| <code>agents plugin describe</code> | <code>&lt;id&gt;</code> | Read a plugin manifest, API schema and Markdown guide | 插件信息 | plugin |
| <code>agents plugin install</code> | <code>&lt;directory&gt;</code> | Install a compatible local plugin package | CLI 安装插件 | operator |
| <code>agents plugin call</code> | <code>&lt;id&gt; &lt;method&gt; --team NAME [--params JSON] [--raw]</code> | Invoke the shared plugin runtime; raw preserves the JSON-RPC error/result envelope | 插件中的操作 | plugin |
| <code>agents plugin open</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open or focus an independent plugin window | 独立插件窗口 | operator |
| <code>agents plugin windows</code> | <code>—</code> | List plugin window state, also in headless mode | 独立插件窗口 | operator |
| <code>agents plugin place</code> | <code>&lt;windowId&gt; --x N --y N --width N --height N</code> | Move and resize a plugin window | 独立插件窗口 | operator |
| <code>agents plugin mode</code> | <code>&lt;windowId&gt; normal&#124;minimized&#124;maximized&#124;fullscreen</code> | Change native plugin window state | 插件窗口最小化、还原与全屏 | operator |
| <code>agents plugin dismiss</code> | <code>&lt;windowId&gt;</code> | Save and close an independent plugin window | 独立插件窗口 | operator |
| <code>agents plugin view</code> | <code>&lt;id&gt; [--team NAME&#124;--employee ID]</code> | Open a plugin view in its managed root or selected scope | Team 工作空间 | operator |
| <code>agents plugin close</code> | <code>&lt;viewId&gt;</code> | Close an embedded plugin view | 关闭工作空间 | operator |
| <code>agents workspace docs</code> | <code>--team NAME</code> | Refresh standardized CLI documentation in the workspace | 自动准备 Agent 文档 | workspace |
| <code>agents workspace suggest</code> | <code>--team NAME [--work-environment team&#124;local]</code> | Suggest an external workspace directory without changing files | 默认工作目录 | operator |
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
| <code>agents workspace write</code> | <code>&lt;path&gt; [--shared&#124;--team NAME&#124;--employee ID] --content TEXT&#124;--base64-file IMAGE_B64 [--hash HASH]</code> | Save text or a PNG/JPEG/GIF/WebP image in a workspace | 保存文件或粘贴截图 | workspace |
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
| <code>agents ui screenshot</code> | <code>&lt;path&gt; [--privacy]</code> | Capture a fresh desktop frame; privacy hides Team paths, activity bubbles and dimensions only during export | Rendered interface | operator |
| <code>agents ui drag</code> | <code>&lt;selector&gt; --dx N --dy N</code> | Drag a rendered component | 拖动控件 | operator |
| <code>agents ui wheel</code> | <code>&lt;selector&gt; --dx N --dy N [--zoom]</code> | Pan or zoom with the mouse wheel | 画布滚轮 | operator |

另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。
