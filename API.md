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
agents card move <cardId> <group> [--before cardId]
agents card remove <cardId>
```

Removing a Team cascades to its employees and native sessions, then clears its room/root metadata.
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
