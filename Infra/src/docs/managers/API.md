# Aexus Manager CLI 完整手册

## 开始工作

这是由根 API、调度规范和注册表生成的全局参考手册，不是权限凭据。所有角色初始化只读取真实身份和 `agents api docs` 的共享短索引；之后按需用 `agents api describe COMMAND --all --json` 或 `agents api docs DOCUMENT` 阅读，不把整册手册自动载入上下文。Core 的 Company、Messages、Plan 三视图与 MiniNotion 等独立插件分列，执行权限仍由 Core 检查。

Governor / Manager / Employee 是员工自身的职位。Manager 管理本 Team 全部 Employee；Governor 跨 Team 管理团队与员工，并可调整其他 Governor 的位置。Governor 的任免由用户或 Secretary 操作；Governor 自己不能借整个 Team 删除或克隆绕过。

Manager/Governor 的职位与执行位置独立，可在 Cloud Team 使用 `workEnvironment:team` 或明确选择 `local`。已支持的原生云端引擎也允许这两个职位；Secretary 保留 Core 本地要求。加入旧管理 Team 或工作目录不会继承权限。

公司员工通过 `agents card create` 登记。Employee / Manager / Governor 都完成简短隐藏初始化，待 ready 后再派发任务；不执行文档示例或预加载全部 API。使用真实员工 ID 调用 `session.*` / `schedule.*`；引擎内置子 Agent 不替代公司员工。

Team 与员工可改显示名，既有目录与归属保持固定。所有公司管理操作走 CLI，不直接修改宿主 JSON。返回发送成功只表示请求已接受，完成状态需继续查询。

按操作系统建队先使用 `host list --summary --json`，按 os / distribution 选择已登记主机。云端使用 `group add NAME --mode cloud --host-id ID --directory-mode default`；Team/View 名称不代表操作系统。用 topology 的团队绑定和员工 workspace 字段核验；Cloud Team 中 Manager/Governor 可以明确选择 team 云端或 local 本地环境，不隐式切换；下属仍使用各自固定工作环境。完整步骤见下文“Governor: four actual operating-system teams”。

## 根项目 API 全文

# CLI and Core API

## Engine library, navigation and resource scope

`view.load-engine {engineId}` opens the selected installed Engine for this client;
`view.launcher {}` returns to the metadata-only homepage. Neither operation starts
or cancels work. Independent Engines run concurrently; a window views one at a time.
`infra.scope/bind/unbind` lets the user explicitly associate existing resources, with
revision checks and no cloning or deletion. Company, Messages, Plan, topology counts,
files and streaming reads respect the same scope while retaining original permissions.

Use `aexus --engine-scope ENGINE_ID ...` or `AEXUS_ENGINE_ID` for independent CLI
operations; local socket, HTTP and Contract transports all retain this scope.
See `agents api docs core/engine-workspaces` for exact rules and examples.


## File workspace browser and ownership filters

The Files/Assets panel projects the existing Company, Messages and Plan workspaces.
Display names come from live Team/employee/conversation identities; physical names,
workspace bindings and message histories are not renamed or copied when filtering.

```sh
agents assets tree --view Messages --employee EMPLOYEE_ID --json
agents assets children 'group:GROUP_ID' --employee EMPLOYEE_ID --limit 100 --json
agents assets search --team 'Research team' --kind document --sort modified --json
agents assets search --employee EMPLOYEE_ID --view Messages --storage local --json
agents assets locate 'WORKSPACE_ID|ENCODED_RELATIVE_PATH' --json
```

`assets.tree` includes current `facets` (Teams, stable employee IDs plus names, and
conversations). `assets.tree/children/search` accept optional `view`, `team`,
`employee` and `conversation` filters. An employee scope includes that employee's
personal files, named group/channel subfolders and related user originals; it does
not attribute peer-owned files to that employee. Filters never grant file permission.
`assets.search` also accepts `kind` (all/document/image/audio/video/code/archive/other),
`storage` (local/remote/cloud) and `sort` (name/modified/size). Query text treats `%`
and `_` literally. `offset/limit`, current ownership and read-only flags remain in
the response. Search results contain real source references, not duplicate copies.

`assets.locate {id}` resolves a returned asset ID to `node`, `workspace`, `parent`,
`breadcrumbs` and `canReveal`. This read-only human operation does not launch Finder
or download cloud documents. The UI folder button uses it to open the source folder
inside the application. Virtual view nodes have no filesystem target. Finder is a
separate desktop-only action for physical local files; remote files keep their
original host. Cloud-only records locate their channel, and only an explicit
open/download action calls `channel.file-download`.

For `assets.file`, use a node's `location.asset/path`, or a returned encoded nested
asset ID. Published channel image references include `postId/mediaId`; old
media-ID-only references remain compatible. All original workspace/conversation
checks, read-only published attachments, optimistic file hashes and copy semantics
remain in effect. File operations and downloads do not mark messages read or run Agents.


Start `npm run serve` (no window), or open the desktop. Both expose the same
Core over a private Unix socket on macOS/Linux or a data-directory-scoped named
pipe on Windows. The default data directory is `~/AgentsCompany`.
Run `node Infra/src/cli/agents help` for help. Every data command accepts `--json`.
Aexus also provides `node Infra/src/cli/anexus` (or installed `anexus`); it is an alias of
`agents` with the same commands, authentication, data directory and API protocol.

## Native API execution and focused discovery

Two native tools cover application work: `agents_company_documentation` reads the
identity/index/exact schema, and `agents_company_api {command,args?}` executes an
existing Core command using the current employee identity. It uses the same dispatcher
as desktop, browser and CLI, with no shell or operator token. Start Plan work with
`{"command":"plan.query","args":{}}`; use the returned task IDs and revisions.

`api.list {prefix?,search?,all?}` narrows the catalog without changing its permission
filter. `api.describe {command,all?}` returns the exact command contract. Deprecated
`management.request/decide/team/global` and `config.engine` are absent from normal
API discovery; `--all` describes their replacement or retained compatibility behavior.
No second task store, duplicated CRUD tool family or nested `api.call` Core route exists.

```sh
agents api list --prefix schedule. --json
agents api describe schedule.delete --all --json
agents api call plan.query --args '{"limit":50}' --json
agents api call schedule.delete --args '{"ids":["JOB_A","JOB_B"],"expectedRevisions":{"JOB_A":2,"JOB_B":4}}' --json
```

`agents api call` is a CLI spelling for a raw existing command payload, including
parameters without a short flag. It uses the same authenticated transport and returns
the same result/error. It neither launches a service nor grants execution permission.

Native read-only calls require no extra approval. Writes require a user decision in
Ask/acceptEdits/auto, are permitted without another prompt in Full access, and are
rejected in dontAsk or native planning mode. Mixed/unknown operations default to writes;
`conversation.file` read operations and unpatched `channel.settings` are classified
from their arguments. Initialization and private shared-message reading cannot use
the executor. Credential, current turn and permissions are checked again after waiting
for approval. Native permission is independent of application role authority.

Errors are returned as tool errors; successful calls contain `{ok:true,data}`.
There is no automatic write retry. Read back after an uncertain response and use the
existing request keys/revision checks instead of guessing whether a mutation occurred.

The full GUI/API comparison and Plan workflow are available as `core/secretary-api`
(`Infra/src/docs/SECRETARY_API_PARITY.md`).

## Message filtering and dynamic categories

`messenger.directory` lists current workers, groups, parent channels and social elements
without loading messages, starting engines or acknowledging reads. It is available to
the user and Secretary. The UI uses the same category/type predicates over live catalogs. Filter enables the type picker across the inbox and disables category controls; turning it off restores the saved category. Its switch, selected type and category are remembered on this client.
A one-source Telegram channel and its source appear once when both match: the channel
row keeps the shared discussion reachable. Source-only Telegram filters and categories
retain the source identity; X/YouTube aggregate channels remain separate.

```sh
agents messenger directory --type groups --json
agents messenger directory --type private --query "Research" --json
agents messenger directory --type x --query "@author" --json
agents messenger directory --folder CATEGORY_ID --archived include --offset 0 --limit 100 --json
```

Types: `all`, `private` (all workers, including management roles), `groups`, `channels`
(parent channel containers), `telegram`, `x`, `youtube` (individual social elements).
Search matches names, Team/role/engine labels, group member names or platform/accounts.
`archived` is `exclude` by default, `only`, or `include`; `limit` is 1–200, default 100.
The result contains `entries`, `total`, `hasMore`, `offset` and per-type `counts`.
Counts include the search/category/archive constraints but precede the type selection.

Dynamic categories must store `include: private|groups|telegram|x|youtube` rather than
a one-time ID list. They follow creation and deletion immediately; source rules also
follow subscription enable/disable. Explicit `conversations` and `excluded` selections
remain intentional overrides. Category names are labels and never silently determine
membership. Convert an old static category with `messenger.folder-save`, preserving its
ID/name and passing `conversations:[]`, the intended `include` and `expectedRevision`.
Deleting a category never deletes its objects, histories or workspaces.

The All Conversations button is independent of category tabs. Selecting it clears the
current category, type and search. Switching categories clears old search/type filters,
so a previous platform query cannot hide a group or worker category. Archived objects
remain in the existing unified archive and are queryable with `--archived include`.

## Personal message avatar

The user can upload a personal PNG, JPEG, GIF or WebP image up to 8 MiB, choose an
existing `avatar.list` ID, or reset to the default person icon. Group and channel
messages resolve Agent portraits by their real author employee ID; changing an avatar
never changes the stored author, role, permissions or message text.

```sh
agents messenger profile --image '@my-avatar.json' --json
agents messenger profile --avatar byte --json
agents messenger profile --avatar null --json
agents messenger state --json
```

The image JSON is `{name,mimeType,data}` with base64 image bytes. Core validates the
signature and size using the same validator as channel images. `messenger.state.profile`
contains only an avatar ID or `{image:{sha256}}`; image bytes live separately from drafts
and preferences. `messenger.profile-image --sha256 HASH` reads the currently saved image.
Both profile commands are user-only, including when called by a Secretary. Changes are
persisted and broadcast to connected clients. The Messages heading opens the editor.

## Employee profile across views

```sh
agents card profile EMPLOYEE_ID --json
agents card profile EMPLOYEE_ID --offset 12 --limit 12 --json
```

`card.profile {id,offset?,limit?}` is a read-only `employee.read` projection. It returns
`employee`, `company`, `memberships`, `plans` and `canEditProfile`. No engine opens,
read receipt changes or directory creation occur merely by viewing the profile.
`offset` is nonnegative; `limit` defaults to 12 and accepts 1–100.

Company identity includes Team, management role, fixed engine, personal workspace,
Team root and execution location. Memberships describe current groups as `member`
and current channel administrator assignments as `administrator`, independent of
Company management rank. Each entry includes the stable conversation reference,
shared root and the employee's named first-level subdirectory. Applications use
these returned paths rather than reconstructing them from display names.

Plans are paginated summaries with total/status counts, actual rule and state,
nextAt and event capability. Waiting event rules have no invented future date;
completed or paused event tasks remain distinguishable. No action prompts,
credentials, private message bodies or other employees' private files are returned.
Current target access is rechecked after the asynchronous plan read; non-application
administrators see only conversation memberships within their own member scope.

Employee Details keeps management role and engine read-only. The existing separate
role-management API retains its authorization; profile edits only change supported
display fields. Character choices are loaded after an explicit change request.
Company and Messages use the same profile and original employee identity.

The user opens **Workspaces → User originals** to edit shared root files through
`conversation.file`. Employee APIs keep originals and peer folders read-only while
allowing their own named subfolder and explicit copying to the personal Workspace.
See [CONVERSATION_WORKSPACES.md](Infra/src/docs/CONVERSATION_WORKSPACES.md) for exact operations.

## Custom categories and social elements

Messages has no mandatory All category. Users can name, reorder and delete every
category. With no category configured, the existing inbox remains accessible;
deleting a category never deletes its employees, groups, subscriptions or history.

```sh
agents messenger social --platform x --json
agents messenger folder-save --name "People" --conversations '[]' --include private --json
agents messenger folder-save --name "Groups" --conversations '[]' --include groups --json
agents messenger folder-save --name "X reading" --conversations '[]' --include x --json
agents messenger folder-save --name "Chosen authors" --conversations '["source:SOURCE_ID"]' --json
agents view open messages --source SOURCE_ID --json
```

`messenger.folder-save` accepts `include: private|groups|telegram|x|youtube` and
`excluded: string[]`. Rule categories include future matching entries. Explicit
`conversations` are additional inclusions. `include:null` removes an existing rule;
omitting it preserves the current rule on update. All category updates retain
`expectedRevision` conflict checks. The editor's Deselect all clears the rule and
starts a manual selection, so unchosen/new authors do not enter that manual list.

`source:SOURCE_ID` is a list reference, not a new chat history. It can be used in
category membership, `messenger.reorder` and `messenger.conversation` preferences.
`messenger.social` returns stable source IDs, current parent channel IDs, labels,
platforms, independently counted unread articles and the latest retained article.
Default discovery returns enabled sources; `--include-disabled` also exposes retained
identities, so existing selections/archive entries remain recoverable. It does not
subscribe to anything, fetch remote content, create channels, mark reads or start agents.

Opening a social element filters the original `channel.posts` queries by `sourceId`,
including older pages, search, saved articles and live updates. Shared discussion,
channel membership and workspaces remain on the original parent channel, reachable
through Open shared channel. Unfiltered channel navigation is still supported.

```sh
# Human-only explicit acknowledgment of this source's current retained articles.
# Other authors and the parent channel's discussion remain unchanged.
agents channel acknowledge CHANNEL_ID --all --source SOURCE_ID --json
```

The source must currently belong to the supplied channel. Ordinary channel
administrators cannot mark human reads. Source archive/preferences never mutate
private or group read receipts. Archived chats is shown only while there is at
least one archived existing entry, and disappears after the last restoration.

## Shared API documentation

```sh
agents auth whoami --json
agents api docs
agents api describe schedule.create --all --json
agents api docs core/plan
agents api docs plugin/mininotion/index
agents api docs plugin/mininotion/command/page.create --json
```

`api.docs {document?}` returns `{markdown,document,path,catalogRoot}`. Omit document
or use `index` for the short catalogue. Read only what the current task requires;
initialization reads identity and this index, not the complete command list or manuals.
Stable document IDs are `core/api`, `core/permissions`, `core/plan`, `core/scheduler`,
`core/architecture`, and `plugin/<installed-id>/index|api|schema`. The plugin `index`
lists methods and short summaries; `plugin/<installed-id>/command/<method>` returns
only that method's complete, current schema entry, including its declared parameters
and examples. Prefer these two steps when choosing one method instead of reading a
whole plugin manual. Full `api` and `schema` remain available. Schema/command text is
JSON in the same `markdown` field. Unknown IDs, unknown methods and filesystem paths
are rejected. A single-method response references the shared `schema.json` path;
Core does not create one file per method.

Core keeps one physical public copy at `APP_HOME/api-docs`, with `README.md` as its
entry point, `core/` references and `plugins/<id>/` API/schema files. Contents come
from the running application resources and validated installed plugin packages;
unchanged bytes are not rewritten. No plugin runtime or model starts to read docs.
The API and the native read-only documentation tool provide the same material in
isolated and remote environments without copying full manuals into workspaces.

The native tool is `agents_company_documentation`. Its `operation` is `identity`,
`index`, `document` (with a catalogued `document` ID), or `describe` (with one Core
`command`). It cannot execute commands or read arbitrary files. Initialization must
successfully call `identity` and `index` before returning `OK`; saying that they were
read is insufficient. The shared-message reading stage has no tools. Core records receipt only after
that native turn succeeds; no acknowledgment API call is required.

Company, Messages and Plan are the three **Core views**. Plan uses `agents plan`
and `agents schedule` over Core scheduling records. **MiniNotion is a separate
plugin**, with its own notes and databases; its commands do not replace Core Plan.
The catalogue lists all installed plugins after the Core views.

All roles may read complete public documentation. `api.list` and `api.describe`
retain their caller-filtered defaults; `--all` exposes public command metadata
without changing execution permissions. Prefer `api.describe COMMAND --all` over
loading the entire catalogue. Employee, Manager, Governor and Secretary write/control rules,
group/channel membership and plugin workspace checks remain unchanged.

## Desktop, browser and remote CLI (0.49)

`node Infra/src/cli/agents serve --web --port 5151` adds the authenticated browser interface.
Run `node Infra/src/cli/agents web token` locally to obtain the initial user credential.
Web login exchanges it for an HttpOnly session; do not put this credential in a URL.
HTTP requests, Electron IPC and the local CLI all call the same Core authorization.
See `Infra/src/docs/DEPLOYMENT.md` for HTTPS, SSH forwarding and `AGENTS_COMPANY_URL`.

“Local” means the Core host, not the browser's computer. `system.info` returns
its actual OS, architecture, capabilities and the calling browser client ID.
`system.directories` browses backend directories for the user or Secretary. Browser-local
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

Configuration accepts `path`, `baseUrl`, `model` (Cline/Pi compatible endpoint), and `apiKey`; an empty string clears the
specified setting. Secret values are encrypted on the Core host and never returned
by public settings APIs. A custom Cline/Pi `baseUrl` requires the exact `model` ID.
Use an HTTPS base URL without embedded credentials or query parameters; HTTP is
limited to loopback testing. This provider model becomes the default for new
employees; existing employee engines, models and native sessions are not rewritten.
Returned reasoning stays private and is reported as `thinkingManaged:true`, rather
than claiming that an arbitrary provider honors Thinking off. Unset `baseUrl` to
return to the built-in DeepSeek provider. No configured gateway falls back to a
different provider. Installation targets the Core host only, requires explicit
user confirmation, verifies the committed official checksum and does not change
system PATH. Cloud-native checks inspect the selected Team's actual remote host;
remote installation is not implied by a local Install button.

Checks distinguish program, protocol and authentication and do not run paid inference.
Configured authentication does not guarantee quota. Claude Agent uses supported
API-key/provider authentication; this application does not provide claude.ai
subscription login. Codex uses its official device authorization. The engine and
model are separate concepts. See `Infra/src/docs/ENGINE_ADAPTERS.md` for the driver contract.

## Cline / Pi: cloud workspace creation

`engine.capabilities {engine:"cline"|"pi"|"codex"|"claude"}` is read-only and available to employees, Managers and Governors. It returns `engine`, display/protocol metadata, `capabilities`, `workspaceModes`, `employeeKinds`, and `cloudWorkerTransport`. It does not expose credentials or start inference. `engine.models` retains its existing authorization.

```sh
agents engine capabilities --engine cline --json
agents engine capabilities --engine pi --json
agents card create --title Cline-Worker --group "Cloud Team" --engine cline --kind worker --work-environment team --model deepseek-flash --thinking off --json
agents card create --title Pi-Worker --group "Cloud Team" --engine pi --kind worker --work-environment team --model deepseek-flash --thinking off --json
```

Equivalent JSON: `card.create {title,group,engine:"cline"|"pi",kind:"worker",workEnvironment:"team",model:"deepseek-flash",thinking:false}`. Cline/Pi execute on the Core host and use the Cloud Team's existing MCP Tunnel for commands and files: `execute`, `read_file`, `write_file`, `edit_file`, `list_files`. Local tools are blocked in cloud mode even with Full access. Ask/Edit/Don't ask permissions still apply; Cline Plan permits remote reads only. Failures never switch execution to the local workspace. Work/plugin employees are also supported: they use their assigned plugin workspace, employee-authenticated CLI and existing file/API permissions. Cline/Pi cloud-native execution is not implemented; choose a Core-local worker with Tunnel explicitly.

Manager/Governor may use local workspaces, Tunnel cloud workspaces or supported cloud-native engines without changing their role scope. Secretary retains its Core-local requirement. This discovery API does not grant hiring or cross-Team authority; Governor appointment remains user/Secretary-authorized.

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
Flag-based creation is enabled by default. Use `--enabled false` (or `--enabled off`)
to create a disabled task; `--paused` remains its flag-only shorthand. `--enabled true`
and `--enabled on` explicitly enable it. Invalid/missing values and combining
`--enabled` with `--paused` are rejected before creation. With `--spec`, set the JSON
boolean `enabled` inside the spec instead of adding either flag. Governor targets
also require `--view VIEW_ID`; this is the stable Team view ID, not the current UI tab.
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
a registered Work Team root or the plugin's managed default root (the historical
`default/` root remains an explicit compatibility scope). Omitting all scope selectors
in `plugin.open`, `plugin.view` or `plugin.call` selects the manifest's default workspace
and creates it if missing; the direct sidebar uses the same operation. A manifest with
`defaultWorkspace: "collection"` selects its workspace base, including descendants;
otherwise the default remains its isolated `default/` folder. MiniNotion opts into the
collection view, so user pages, old `default/` content and Team pages in that collection
are visible together without moving files. It requires no Team. Existing Team roots
outside the collection stay bound and are accessed explicitly with `--team`.
`--employee` selects that employee's own folder, including descendants. The plugin ID must match the Work Team binding. `plugin.view` returns a scoped
local URL and view ID without opening a browser/window. Close it when finished.
Team nameplates open the scoped file browser for every Team type. `plugin.call` returns the domain result; pass `--raw` to preserve the plugin's JSON-RPC envelope (including structured business errors). In Web mode, sandboxed plugin frames broker calls through the authenticated parent; their page URL alone cannot execute RPC. The parent binds the view to its session, client, plugin and workspace;
the plugin's own CLI also supports full JSON-RPC envelopes.

`plugin.open` opens or focuses one independent native window per plugin/workspace,
sharing Aexus's Dock icon. The plugin loads directly at the top level;
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

Installing a validated package updates the shared catalogue and keeps matching
Work Team launchers bound to their existing workspaces. `workspace.docs` prepares
the shared documentation entry and authorized runtime launchers, not workspace manuals.
It preserves user-authored text around managed sections of AGENTS.md and CLAUDE.md.
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
agents session transcript <sessionId> [--limit N] [--thinking]
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

Regular `session.send/enqueue` messages accept an optional `clientMessageId`
(`--client-message-id ID`, a trimmed nonempty string up to 160 characters). Reuse
the same ID and content after a lost response. IDs belong to the authenticated
sender and stable employee; `send` and `enqueue` share the same attempt. Changed
content, attachments, reply, source presentation or task-view scope with the same ID is rejected.
Current authority is checked again before returning a saved confirmation. Confirming
an accepted attempt does not reopen its engine or reread expired source attachments.

`session.send/enqueue/steer` accept optional `sourceView:"company"|"messages"|"plan"`
(CLI `--source-view`). This is the sender-declared presentation for that message,
independent of Governor's `viewId` / `--view` target Team scope. All roles receive
this context; authorization and execution host remain unchanged. Omitted source
stays unknown, including CLI/Agent sends: Core does not inspect a different client's
current screen or reuse the preceding message's source.

The desktop/Web composer captures the originating presentation before awaiting
its first send. A workbench opened from Messages or Plan retains that origin.
Queues and unchanged retries preserve this snapshot even after navigation or reload;
editing content or explicitly sending as a new request captures the new origin.
New receipt records also bind an unknown origin, so adding/changing it under an
existing key rejects. Pre-upgrade accepted receipts remain confirmable without
replaying work or inventing historical provenance.

The employee receives a small per-message source block beside the original request:
Company suggests considering organization/delegation APIs; Messages suggests checking
existing conversations and using group collaboration when the task calls for it;
Plan suggests the existing schedule APIs. Explicit message instructions and the
employee's role take priority. No branch automatically creates a group, broadcasts,
starts a schedule or restricts work to one view. Discover relevant APIs with the
shared documentation tool as needed. Source metadata is not a grant of authority.

`currentTask.sourceView`, queue entries and user transcript items expose known
origins. The user message body, copy/quote text, author and attachments are unchanged.
The active task bar and the message's hover description show its origin. Steer
uses the new appended message's source without replacing the original task's source.

```sh
agents session send --employee SECRETARY_ID --source-view company --text 'Assign the implementation work.' --client-message-id REQUEST_A --json
agents session send SESSION_ID 'Discuss the release with the team.' --source-view messages --json
agents session steer SESSION_ID 'Prioritize this issue.' --source-view messages --json
```

Keyed responses are `{sent:true,status:"accepted"|"queued",employeeId,clientMessageId,
messageId?,queueId?,id?}`; `id` is the queue ID when present. These are Core acceptance
states, not Delivered/Read receipts or proof that the employee completed its work.
`queued` refers to the current live queue, not a durable scheduler. A cancelled queue
or one lost after restarting returns `PRIVATE_SEND_INTERRUPTED`; an uncertain native
submission returns `PRIVATE_SEND_UNCERTAIN`. Neither silently replays work. Retain the
draft and inspect the conversation before deliberately issuing a new request ID.
Known failures before dispatch can retry the original ID. Calls without a key retain
their existing behavior; control slash commands must omit the key.

```sh
agents session send --employee EMPLOYEE_ID --text 'Review this change' --client-message-id ATTEMPT_ID --json
# Confirm this same attempt after losing the response, even if the employee is now busy.
agents session enqueue --employee EMPLOYEE_ID --text 'Review this change' --client-message-id ATTEMPT_ID --json
```

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
- `session.enqueue {id,text,images?,replyTo?}`, `session.queue {id}`,
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
- `session.send/enqueue {id|employee,text,images?,replyTo?}` accepts a public message
  item ID from the **same employee conversation**. Use `session.transcript --json`
  to obtain item IDs; task IDs and reply-receipt IDs are different. Core validates the
  source before opening an idle employee and again when sending a queued message.
  Notice-only or thinking/tool-only items and foreign-conversation IDs are rejected.
  Replies cannot run slash commands; cancel the reply before using a control command.
  The normal send/queue authority, execution host, model, workspace and delegation
  checks still apply. A reference never changes the destination or automatically
  notifies the original sender. `--reply-to MESSAGE_ID` works with both positional session IDs
  and `--employee ID --text TEXT`.

  Core records a `reply` object on the new user transcript item: source `id`, `role`,
  optional authenticated `author`, a public text excerpt of up to 1200 Unicode
  characters, original image references and an optional `truncated` flag. Clients
  supply `replyTo` and an optional validated selection; they cannot forge the resolved
  excerpt or its authorship.
  The engine receives the public reference followed by the new request. The visible
  message body stays unchanged, and previous native messages are never rewritten.
  Referenced photos are not silently uploaded again; their existing scoped references
  remain part of the quote. Queued references resolve against the source at dispatch.

  Newly recorded transcript items have an observed Core `createdAt` timestamp. New
  user items also record their authenticated `author`. Streaming updates preserve the
  timestamp; restart/export/fork preserve these fields and reply links. Unknown dates
  and senders in old/imported history are not backfilled. Message item IDs are opaque.
  JSON transcripts expose the fields; text transcripts/export include a reply marker.

  For a precise quote, add `replyQuote: {text, offset}` alongside `replyTo`, or use
  `--reply-quote '{"text":"selected words","offset":12}'`. The offset is a zero-based
  UTF-16 position in the visible public Markdown/GFM text projection: formatting
  markers and link destinations are excluded, whitespace and block boundaries are
  collapsed to single spaces, and the result is trimmed. Private transcript text
  blocks are projected separately, then joined with spaces. The shared projection
  is implemented by `Infra/src/shared/message-quotes.ts` and retains the Markdown/GFM
  projection independently of rendered KaTeX glyphs. The UI does not create precise
  quotes from selections touching formulas; whole-message copy retains the original
  Markdown/TeX. Quotes contain at most 1200 Unicode characters; surrogate-pair splits,
  invalid offsets, forged text, stale selections and quotes without a reply are rejected.
  Core checks the exact substring before session opening and again at dispatch.
  The accepted `reply.quote` and selected `reply.text` persist with the message;
  changing the selection never changes the new message body or the source history.

  `chat.send/post` accept the same optional `replyQuote` and CLI `--reply-quote JSON`.
  The group reply target must exist in the same authorized group. All recipients
  receive its shared context. A user reply addresses a current same-group Agent
  author; employee work assignments still require explicit mentions and normal
  control authority. A quote never adds an outsider or grants additional authority.
  A group's retry fingerprint includes the selected text and offset when present,
  while unchanged requests without a quote keep their previous retry semantics.

  The operator can reply across conversations by adding `replyConversation`, a source
  reference such as `employee:SOURCE_ID` or `group:SOURCE_ID`, alongside `replyTo`.
  CLI: `--reply-conversation REF`, optionally `--reply-quote JSON`. This is supported
  by `session.send/enqueue` and `chat.send/post`; an explicit source equal to the
  destination keeps normal same-conversation semantics. Agents, including Governors,
  cannot initiate cross-conversation sharing through these fields.

  Core resolves the authorized public source before accepting the operation and
  records an immutable excerpt with `conversation`, `conversationTitle`, `authorName`
  and any selected range. The normal destination authority and original delegation
  checks remain. An accepted queued cross-reference uses this snapshot even if the
  operator later hides the source. It does not rewrite earlier messages or grant the
  recipient access to the source conversation. Group quotes are visible shared text;
  operator chat.send without a same-group dialogue target defaults to work for
  all current members, while chat.post sends context-only awareness to them. Accepted group retries retain the original recipient snapshot.

  Cross-references never pass source workspace attachment paths to another employee.
  If the whole source message has images or files, explicitly choose `replyTextOnly:true`
  (`--reply-text-only`) or forward its attachments through the existing forwarding API.
  Selecting a precise text quote already identifies the text being shared. Omitted
  images are recorded as `omittedImages`; their bytes stay in the source conversation.
  Image sharing and a text reference are distinct operations.

  `messenger.reference {conversation,id,quote?,textOnly?}` is an operator-only read
  operation returning the same canonical reference used by cross-conversation sends.
  CLI: `agents messenger reference REF MESSAGE_ID [--quote JSON] [--text-only]`.
  It rejects unavailable/hidden sources and invalid selections without opening an
  engine, sending work, changing source permissions, or acknowledging any reply.
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

`card.create` prepares the same brief hidden initialization for every role:
read the actual identity and shared documentation index, then return `OK`.
Employee, Manager and Governor must reach ready before receiving work; they do
not preload the full Core/plugin manuals or execute documentation examples.
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

## Employee initialization and topology layout

Employee、Manager、Governor 创建后都在真实原生会话完成简短隐藏初始化：只读本人身份与共享 API 索引，再返回 OK。初始化期间显示黄灯，就绪后才可派发请求；失败保留错误／重试入口，不假装已经完成。完整 Core 与插件文档按后续任务需要读取，不在初始化加载整册。

创建前可查询 Coding Agent 的模型列表，不创建会话、不发送推理请求：

```sh
agents engine models --engine codex --json
agents engine models --engine claude --json
agents engine models --engine codex --kind cloud-native-worker --team "Cloud Team" --json
agents settings set --default-codex-model gpt-6-luna --default-claude-model deepseek-flash
agents card create --title "Reviewer" --group "Build Team" --engine codex --model gpt-6-luna --effort low
```

`engine.models` 返回 `{models, defaultModel}`，只允许用户／已授权全局管理者调用。Local Worker 查询本机引擎；Cloud Native Worker 必须指定 Cloud Team，并从该主机查询，失败不退回本机。Claude Code 接入 DeepSeek 时返回对应的两个模型。

`settings.get/set` 的 `defaultCodexModel`、`defaultClaudeModel` 为之后创建的员工保存默认模型；空字符串恢复系统默认。`card.create --model` 优先于设置；各角色初始化和之后的会话均使用创建时选定的模型。修改默认模型不更改已有员工。云端原生引擎未提供本机设置中的默认模型时，使用该远端模型列表的默认项。新员工表单切换 Coding Agent 时重新读取模型，不沿用另一引擎的选择。

职位由 `managementRole` 决定，执行位置由 `kind: worker|cloud-native-worker` 决定。Manager / Governor 可在本地或云端工作，创建和任免不隐式改主机或工作目录。Core 与云端原生员工通过各自身份使用同一组 `session.*`、`schedule.*`、`card.*` API；Manager 本 Team、Governor 全局角色范围及严格下行排期保持不变。启动不会将云端 Manager/Governor 降为 Employee。

```bash
agents card create --title 'Cloud Lead' --group 'Cloud Team' --kind worker \
  --management-role manager --work-environment local --engine codex \
  --model gpt-6-luna --effort low
```

`card.create --management-role manager --kind worker` 为用户／全局管理者创建本地 Manager。普通 Manager 使用 `card.create` 只能创建本 Team 的 Employee；省略 group 时由 Core 使用调用者所属 Team。后台在同一次状态提交中保存创建者和有效管理关系，不能由参数伪造内部字段。

公司与全部插件公开文档统一位于 `APP_HOME/api-docs`，所有角色使用同一短索引和按需读取入口，不再在每个 `.agents-company/employees/<employeeId>/` 或插件目录复制大手册。本机 launcher 由 Core 运行目录提供并注入员工 PATH，仍绑定原工作区；远端入口沿用现有认证通道，用户原有说明保留。`workspace docs --employee ID` 可刷新入口。首次运行、恢复和职位变更更新简短身份路由指令，既有原生 ID 与历史保留；读取全部文档不会取得额外写入或管理权限。

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

绿色流动虚线是短暂通信提示：每次真实消息/控制请求、回复订阅建立或委派任务开始，最多高亮 600 毫秒；同一对端点的新通信会重新触发。长任务、长订阅、流式输出及普通查询不会维持或刷新高亮。到期后，已有绑定/创建来源线恢复普通常驻箭头，临时线消失；实际任务继续执行，员工的 busy、队列、调度和权限保持原样。

`management.activity.interactions[].highlighted` 由 Core 的单个截止时间计时器统一计算并推送，桌面、Web 和 `office.layout` 共用该显示状态，不依赖客户端时钟。高亮到期只将该字段变为 false，仍在执行的 kind=task 或 kind=request 记录继续保留到真正结束。不要用 highlighted=false 判断任务已完成；查询 session.status / currentTask。调用结束或授权撤销会立即清理已无真实任务/请求的记录，没有额外的完成后保留延迟。

Manager 自己创建的同 Team Employee，以及 Governor 在任意 Team 创建的 Employee / Manager，有常驻实线。消息/控制请求或订阅开始时，对应线短暂显示为绿色流动虚线，最多 600 毫秒后恢复常驻线或移除临时线；普通读取和持续订阅不会延长亮灯。真正并发的请求可同时显示；关闭上级会话、撤销身份或失去权限会清除相应活动。系统“减少动态效果”会关闭流动动画，保留颜色和线宽。创建来源和管理权限互相独立，没有常驻线也可使用完全相同的管理 API。

连线在目标工牌侧边收口；员工排列在 Manager 下方时，从 Manager 工牌下缘出线，并允许同一管理者的线路共用主干。不同管理者的线路仍优先错开。线路绕开完整工位，水平／垂直行进并使用小圆角。拖动员工时即时重算，不移动其他员工来迁就线条。两个工位完全重叠、封死所有通路时无法保证避障，但线段仍保持正交。Manager 可用上面的 `card.place` 调整自己或同 Team 的任意 Employee，或调用 `management.relayout` 自动整理。

## 员工职位：Secretary / Governor / Manager / Employee

权限属于 `managementRole`，不属于名字、Team、工作目录或视图。Secretary 是最高应用管理职位，帮助用户操作 Aexus 及全部已授权插件，组织与委派具体业务工作；完整矩阵见 [PERMISSIONS.md](PERMISSIONS.md)。

```sh
agents management roles --json
# 只有用户能任命 Secretary。
agents card create --title Secretary --group "Any Team" --management-role secretary --kind worker --json
agents card management-role EMPLOYEE_ID secretary --json
# 用户或 Secretary 可以任免 Governor。
agents card management-role EMPLOYEE_ID governor --json
# 秘书管理软件仍使用普通认证 API，保留真实 Agent 身份。
agents chat create --name "Release group" --members '["EMPLOYEE_ID"]' --json
agents chat update GROUP_ID --members '["EMPLOYEE_ID","ANOTHER_ID"]' --json
agents channel source-add --data '{"plugin":"x","locator":"author_handle"}' --json
agents channel source-add --data '{"plugin":"youtube","locator":"@creator"}' --json
agents channel source-remove SOURCE_ID --json
agents channel update CHANNEL_ID --admins '["EMPLOYEE_ID"]' --json
```

`management.roles` 返回 `value,label,description,scope,requiresLocal,userManaged,appAdministrator?,permissions,controls,creates,removes,assigns`。角色定义、Core 检查、CLI 发现和表单共用同一策略。

- Employee 仅操作自身会话与授权工作区。
- Manager 管理本 Team 的 Employee。
- Governor 保持跨 Team 管理 Employee/Manager 的能力，也能控制其他 Governor 的会话，但不能任免 Governor 或管理 Secretary。
- Secretary 管理应用、插件及下级角色，包括 Governor；只有用户能任免 Secretary。所有克隆仍默认为 Employee。

所有角色使用同一简短初始化路由，实际读取 `identity` 与 `index`。`auth.whoami` 返回真实 `managementRole`、`roleDescription` 和 `appAdministrator`；正式轮次附上当前认证职位，Secretary 额外说明操作软件、组织委派的职责，不预加载全部工具手册。更名为 Secretary 不授予任何权限，已有员工不自动升级。

Secretary 使用 Core 本机工作区，可属于普通 Build、Work 或 Cloud Team（Cloud Team 选择 local），可在 Company、Messages、Plan 中使用。它没有 Governor 的任务视图绑定。API 权限不改变原生引擎 Ask/Full access 或 OS 用户身份。

凭据签发/撤销、用户已读和用户作者编辑、跨会话分享、客户端文件/播放许可、UI 模拟写入仍为用户身份操作。Secretary 通过 Core 管理 API 操作，不获得 operator control token。插件调用及其 view RPC 保留创建者身份并重查权限；不能借插件转调获得用户身份。

旧显式 global 授权仍只迁移为 Governor，不升级为 Secretary。`management.global ID on|off` 是用户/Secretary 的 Governor/Manager 兼容入口，并复用同一任免检查。`globalManager` 对 Governor/Secretary 是兼容投影，不是独立授权来源。

## Authenticated management and collaboration

UI、用户 CLI 和员工 CLI 共用 Core。调用身份来自可信 IPC 或可撤销凭据，不能通过参数、目录标记或 Prompt 提升权限。

### Team 成员与工作环境

Team 表示组织归属，并提供默认工作环境。员工的 `workEnvironment` 缺省为 `team`，继承 Team；在 Cloud Team 中可选择 `local`，保持成员归属，同时使用 Mac 本地工作区。`kind: worker` 表示引擎在 Mac，`cloud-native-worker` 表示引擎在绑定云主机。

Cloud Team 可同时包含本地工作区员工、Core 引擎操作云端的员工和云端原生员工；Manager/Governor 不受位置限制，Secretary 仍需 Core 本地环境。云端原生引擎不能选择 `local`，Work 插件员工不能绕过插件目录规则。工作环境创建后固定；已有员工不自动改运行位置。

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

常驻连线由可信 `createdBy` 和显式绑定共同生成：同 Team 的 Manager 创建 Employee、Governor 在任意 Team 创建 Employee 或 Manager 后默认显示创建来源线；用户创建的员工也可通过 `management.bind` 增加逻辑绑定。连线不会授予或撤销权限。旧 `management.request` / `management.decide` 仍为明确报错的兼容入口；`management.unbind` 现用于取消显示关系。

#### 绑定 / 取消常驻有向箭头

```sh
# 用户指定来源管理者和目标员工。
agents management bind --manager MANAGER_ID --employee EMPLOYEE_ID --json
agents management bind --manager GOVERNOR_ID --employee EMPLOYEE_ID --json
# 同一个员工可以保留上面两条箭头；只取消指定的一条。
agents management unbind --manager MANAGER_ID --employee EMPLOYEE_ID --json
# Manager / Governor 调用时，省略 manager 默认为自己。
agents management bind --employee EMPLOYEE_ID --json
agents management unbind --employee EMPLOYEE_ID --json
# 也可使用 topology.edges 中的关系 ID 取消，不能与端点参数混用。
agents management unbind RELATION_ID --json
```

JSON 接口为 `management.bind {manager?,employee}` 和 `management.unbind {manager?,employee}`，解绑还支持 `{id:RELATION_ID}`。端点使用稳定员工 ID，不使用名字或原生会话 ID。用户调用必须指定 manager；Agent 缺省使用自己的 ID。参数必须是非空字符串，未知、正在删除的员工、自连、重复的目标选择形式和内部字段均拒绝。

Manager 可绑定自己到本 Team 的 Employee，只能增删自己发出的关系。Governor 和用户可指定其他 Manager/Governor 为来源，但新绑定仍须满足**来源职位**的控制范围：Manager 不能因此跨 Team 或指向同级 Manager；Governor 可以跨 Team 指向原本可控制的员工，包括 Manager/Governor。普通 Employee 不能绑定或解绑。取消已有关系不要求目标继续处于来源的控制范围，便于清理角色变化后的旧关系；Manager 仍不能修改别人的来源线。

两类 API 返回 `{managerId,employeeId,bound,changed,relation,revision}`。bind 的 relation 是有效常驻边；unbind 的 relation 为 null。新建的显式边有 `origin:"binding"`，自动创建来源边保持旧结构与 ID。重复绑定不产生多条相同方向的边，重复解绑成功返回 `changed:false`，不重复写状态。同一目标可以被多个 Manager/Governor 同时指向。

`createdBy` / `createdAt` 始终保留真实创建历史，`--creator` 筛选语义不变；逻辑绑定读取 `management.topology.edges`，最终显示路径读取 `office.layout.connections`。绑定会直接产生普通常驻实线箭头，没有消息时也显示；不会伪造绿色活动。解绑可隐藏自动创建来源线，后续保存、切换视图和重启不会把它重新生成。角色降级后，超出范围的显式线不再显示；重新恢复合规职位时仍尊重已保存的绑定/取消选择。员工删除后清理相关绑定记录。

绑定/解绑只改变指定方向的显示关系，不移动员工或 Team，不改引擎、形象、职位、权限、文件夹或原生历史，不停止任务，不清空队列，不撤销调度或凭据。解绑时若仍在通信高亮窗口内，现有绿色临时线只保留到本次最多 600 毫秒的窗口结束；解绑不延长高亮或停止实际协作，其他管理者的箭头不受影响。需要移动线段仍使用 `connector.*`；需要重新摆放工位才显式调用 `management.relayout`。

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

`auth.whoami` 返回真实身份，`session.status` 返回当前员工状态，`management.topology` 返回按当前身份计算的可操作范围。`api.list/describe` 默认过滤可调用命令；`api.docs` 与 `--all` 可读取完整公开说明，文档可见不代表可执行。拓扑的 `edges` 包含未取消的创建来源线及有效显式绑定，`pending` 恒为空；`allowedActions` 和执行时检查来自相同策略。原始 Socket、follow、斜杠命令、插件转调和调度都执行身份校验。完整文件隔离仍取决于操作系统／Coding Agent 沙箱；Trusted 不宣称系统级防篡改。

## Explicit engine test call

`agents engine probe --engine codex --model gpt-6-luna --confirm --json` makes one real, potentially billed model request on the Core host. Claude Agent uses `--engine claude` and an optional model ID. The prompt is fixed to an OK-only reply; execution uses a temporary directory, no persisted native session, and a 45-second timeout. Core requires `confirm:true`; ordinary `engine.check` stays inference-free. Results include actual response text, selected model, host, elapsed time and timestamp. Configuration can be present while the account has no credit; only a successful explicit probe demonstrates that the provider accepted this request.

## Company Views and Messages

The header centers equal-size **Company Views**, **Messages** and **Plan** buttons.
Clicking Company Views from Messages or a custom Company subview immediately selects
**All Team** without opening a menu. Clicking again while All Team is active opens
the saved subview menu. Arrow Down opens the menu directly for keyboard users.
**All Team** is the built-in default; existing saved views, including a view named
Plugins, retain their identities, team membership, order and individual cameras.
Clicking outside the menu (including the canvas), moving keyboard focus outside, or pressing Escape closes it.
The menu supports selection, creation, editing, deletion and drag reordering;
the editor also provides keyboard-accessible Move up / Move down controls.
Saved user-defined names are not translated or rewritten. New navigation and
Messages controls use English.

**Messages** is an alternative one-to-one presentation of the existing employee
conversations. It contains one row per employee across the company, with their
existing character, name, team, role, latest public message and unread indicator.
The **New group** text button beside the conversation-list caption opens group creation directly.
The built-in All tab combines direct messages, groups and news channels. Users may add their own
mixed conversation folders; no fixed Groups/Working/Unread tabs are required.
Search matches names, teams, roles, engines and the bounded latest-message preview;
it is not a full-history search. Folder selection affects only the list.
All merges conversations in a single list ordered by the latest message time,
rather than putting groups in a separate section. Group chats appear alongside direct messages; they never create new employee identities
or external messaging accounts. Group history contains only explicitly published messages.

```sh
agents view open messages
agents view open messages --employee EMPLOYEE_ID
agents session inbox --json
agents view open conversation --employee EMPLOYEE_ID
agents view close
```

`view.open {kind:"messages",employee?}` opens the inbox or a selected direct message.
Opening the inbox does not start engines, SSH terminals or file-tree polling. A
selected employee uses the same existing `session.open/send/enqueue/interrupt`,
approvals, image transport, native context and transcript as the company workbench.
The workspace button explicitly opens the full existing workbench; `view.close`
returns to the originating Messages conversation. Closing a direct message returns
to its list. Navigation remains Core-owned and browser-client-specific.

`session.inbox {}` returns an array of `{employeeId,text,role,updatedAt,hasMessages,
unread,error?}`. Text is capped at 240 Unicode characters and includes public
user/assistant content only, never thinking or tool input/output. Known stored
reply/user timestamps are returned as milliseconds; unavailable historical times
are null, not fabricated. Closed-history previews are cached by file revision;
opening the list does not load full transcripts into the renderer. A missing history
is empty; an unreadable history reports an error on that entry and is not replaced.
Employee sees only itself, Manager itself and its Team Employees, Governor/user
all currently readable employees, using the existing Core role checks.

Reading or searching the inbox never acknowledges replies. The existing exact-reply,
foreground-window and visible-transcript checks still govern read receipts. In-memory
text/image drafts are employee-scoped across view switches; async uploads remain
attached to their original employee. Image previews use the existing scoped
`workspace.image` API. File tools, engine inspection, cloning, removal and the full
profile remain accessible through the existing workspace. Messages does not change
permissions, workspaces, scheduling, bindings or the 600 ms communication highlight.

Conversation search (Cmd/Ctrl+F) searches loaded public text in the selected private or group
thread, with previous/next navigation and an explicit result count. It does not fetch other
histories; older group messages become searchable after loading them. Cmd/Ctrl+K focuses the
inbox search. Copy preserves the message text; Reply selects the existing authenticated
message reference. Dates use recorded timestamps only.
Composers grow with multiline drafts. Reading older content keeps its scroll position during
streaming, and Latest messages returns to the bottom. These are presentation operations;
no engine, authority, identity or storage protocol changes are introduced.

Private messages, group messages and channel articles share Markdown/GFM and LaTeX rendering.
Code blocks show their language, syntax colors, an independent Copy code action and optional
line wrapping. Copy excludes the fence and toolbar while preserving code whitespace; whole-message
copy still returns the original Markdown. Toolbar labels never enter selected-text quotes.
Long code keeps its toolbar reachable while reading. Common languages highlight locally;
unknown or very large blocks remain complete plain text without remote processing or truncation.

### Personal Messages organization and full-history discovery

These operator-only APIs share desktop/Web/CLI organization state in `messenger.json`;
news saves use the canonical channel store described below. They do not
open a session, run inference, change membership/permissions, rewrite native history,
or acknowledge real replies. Managers and Governors cannot inspect personal drafts,
saved items, or organization. The authenticated operator owns this single-owner state.
Conversation references are `employee:EMPLOYEE_ID`, `group:GROUP_ID` and
`channel:CHANNEL_ID` for supported reading and organization operations.

```sh
agents messenger state --json
agents messenger conversation --conversations '["employee:EMPLOYEE_ID"]' --patch '{"pinned":true,"favorite":true}' --json
agents messenger conversation --conversations '["employee:EMPLOYEE_ID","group:GROUP_ID"]' --patch '{"archived":true}' --json
agents messenger message employee:EMPLOYEE_ID MESSAGE_ID --patch '{"saved":true,"pinned":true,"reaction":"❤️"}' --json
agents messenger draft employee:EMPLOYEE_ID --data '{"text":"Keep this draft"}' --json
agents messenger search --query 'design' --filter saved --json
agents messenger search --conversation group:GROUP_ID --filter links --author you --offset 0 --limit 40 --json
agents chat history GROUP_ID --around MESSAGE_ID --limit 100 --json
```

`messenger.state` includes optional `folders:[{id,name,conversations,revision}]`;
older state without folders is preserved. All is the only fixed category in the UI.
User categories may mix private, group and channel references, and one conversation
may belong to several categories. A category never moves or copies its content.

```sh
agents messenger folder-save --name 'Reading and planning' --conversations '["employee:EMPLOYEE_ID","group:GROUP_ID","channel:CHANNEL_ID"]' --json
agents messenger folder-save --id FOLDER_ID --name 'Daily desk' --conversations '["channel:CHANNEL_ID"]' --expected-revision 1 --json
agents messenger folder-delete FOLDER_ID --expected-revision 2 --json
```

`messenger.folder-save {id?,name,conversations,expectedRevision?}` returns the updated
Messenger state. Names are trimmed, 1–80 characters; up to 2000 references are
validated, deduplicated and stored. For a retriable creation, clients may supply
`id:"mf_<UUID>"` with `expectedRevision:0`; omitting id creates a new ID. Each folder
has its own revision, so an unrelated draft or conversation preference write does
not cause a folder conflict. Updates with a differing expectedRevision reject;
retrying the same normalized name/membership returns the existing state unchanged.
`messenger.folder-delete {id,expectedRevision?}` checks that folder's revision when
provided, removes only the folder, and returns state. Existing conversations,
archives, favorites, messages and drafts remain. All is built in and has no editable
folder record.

`messenger.reorder {scope,order,expectedOrder?}` saves display positions in the same
Messenger state, under optional `orders:{[scope]:string[]}`. Scope is `categories`,
`all`, `favorites`, `archive` or an existing folder ID. Category keys are `all` and
folder IDs; conversation keys use the existing employee/group/channel references.
All can change position but remains built in and cannot be renamed or deleted.
Submitted IDs must exist, be unique, and number at most 10000; folder-scoped targets
must belong to that folder. A partial order replaces those keys in their existing
slots, preserving hidden/filtered positions. Unranked new items follow saved items.

The UI previews moves locally and commits once on release. Each category has its
own conversation order, independent of All, Favorites and Archive. Manual positions
take precedence over the automatic pinned/recent sort without changing pin, unread,
archive or favorite flags. New activity does not move manually arranged rows.
`order:null` restores the original automatic ordering for that scope. The menu can
also restore the default category order. Desktop supports dragging and Alt+arrow
keys; touch uses hold-then-drag. Escape, lost focus and outside drops cancel.

`expectedOrder` compares only the stored order of that scope (`[]` when absent), so
unrelated draft or preference writes do not create conflicts. An identical result
is a no-op, including an unchanged retry. A stale different order rejects; the UI
re-reads authoritative state without replaying the mutation. Category deletion
removes its saved positions but never its conversations, histories or drafts.

```sh
agents messenger reorder categories --order '["FOLDER_ID","all"]' --expected-order '[]' --json
agents messenger reorder all --order '["channel:CHANNEL_ID","employee:EMPLOYEE_ID","group:GROUP_ID"]' --expected-order '[]' --json
agents messenger reorder all --order null --json
```

`messenger.conversation {conversations,patch}` validates every target before an atomic
bulk write. Boolean fields are `pinned`, `favorite`, `archived`, and `unread`. The latter
is a personal reminder independent of the exact native reply receipt. Archive only
removes a conversation from the inbox; employees, tasks, schedules and histories remain.

`messenger.message {conversation,id,patch}` requires an existing public message.
Alternatively pass `ids` (1–200) instead of `id` for an atomic, preflighted batch update.
Boolean fields are `saved`, `pinned`, and `hidden`; `reaction` is one of 👍 ❤️ 🎉 ✅ 👀 💡,
or an empty string to remove it. Reactions are the operator's annotations, never
fabricated employee responses. Hiding is personal presentation and never deletes
an already executed task or its native context. Hidden messages can be restored in
place and are omitted from personal search results.
For channel news (`np_`), `messenger.message` accepts only `saved` and delegates to
`channel.save`; stable post IDs own the save rather than the current channel key.
Channel discussion (`cm_`) supports the ordinary personal save/pin/hide/reaction
annotations without rewriting its public text. Search, references and forwarding
retain the real operator/administrator author. Other news actions use the channel API.

`messenger.draft {conversation,text,images?,files?,mentions?,replyTo?,replyQuote?,replyConversation?,replyTextOnly?,clientMessageId?,viewId?,sourceView?,expectedClientMessageId?}` persists text and
references without uploading or sending. Text is limited to 100000 characters; image
and mention limits match the existing composer contracts. Empty drafts clear the record.
Actual sends still validate workspace and member authority through the original APIs.
Concurrent writes merge distinct records; the latest accepted draft for the same
conversation wins. The UI coalesces typing and flushes before protected navigation/close.
An optional `clientMessageId` (a trimmed, nonempty string up to 160 characters)
belongs to the current send snapshot. Private and group drafts also preserve that attempt's
`viewId`, so reopening another company view does not silently change a retry's scope.
Metadata alone does not retain an otherwise empty draft. Existing drafts without
these fields remain valid. A draft never grants send or task-view authority.

`expectedClientMessageId` applies a conditional replacement or clear: if the saved
draft's ID no longer matches, Core returns the current state without writing or
bumping its revision. This keeps a late send response from erasing a newer draft,
including a replacement made by another client. It also allows slash-command
completion to retain attachments in one atomic replacement.

The UI projects pending local drafts immediately and writes them through one serial
drain. An older failed write cannot be put back ahead of a newer successful draft.
Before a private/group/channel send it persists the exact draft and send ID, then checks
that the draft is still current. An unchanged retry uses the original ID and frozen
scope through the existing Core deduplication; it does not create a new message or
new employee delivery. A changed send payload gets a new identity. Successful sends
conditionally clear only their submitted draft. Private sends use the acceptance
contract above; preserving a draft does not make an interrupted queue durable.
Channel drafts persist text, images/files, mentions and same-channel replyTo through
the same draft interface. Cross-conversation and selected-quote draft fields remain
unsupported. Group/channel uploads live in the persistent shared conversation folder;
sending combines the user's text with a file-list notification, without copying file
bytes or image inputs into employee conversations. A draft may reference retained
channel news; an expired or deleted news source remains unavailable.

`messenger.search {conversation?,query?,filter?,author?,offset?,limit?}` reads full public
histories, including group messages outside the currently loaded UI page. Filters are
`all`, `saved`, `pinned`, `media`, `audio`, `files`, and `links`; author is `all`, `you`, or `employee`.
Results contain stable source references, text/image references, author, actual known
timestamp (otherwise null), authenticated `authorIdentity` when recorded, and annotations.
The author filter uses recorded identity rather than the model protocol role: requests
sent by a Manager count as teammate messages, not messages from you. Old user items
without recorded authors remain visible under `all` with an unknown sender label. Thinking/tool traces are excluded. Results
are paginated (default 50, max 100) and return `total` and `hasMore`; unreadable histories
fail visibly. Search is read-only and never acknowledges a reply. `chat.history` also
accepts `around` instead of `before` to retrieve a bounded context window around an ID.
Retained news joins global `all`, `saved`, `media` and `links` searches, or a chosen
channel search; external authors appear under `author:all` and are not assigned an
employee principal. News queries page in SQL and merge by timestamp descending,
conversation ascending and message ID ascending. Saved news follows its source’s
current channel after an author move. The private/group historical gallery remains
separate; channel images use `channel.post` and `channel.image`.

`messenger.forward {messages:[{conversation,id}],to,comment?,textOnly?,clientMessageId,retry?}`
forwards 1–50 explicitly selected public messages in one new message, with source
attribution and an optional note. An employee destination uses the existing authenticated
queue; an operator group destination broadcasts without explicit mentions. It never
modifies the original messages. Image and file forwarding copies authorized bytes into fresh recipient-scoped
attachment files before enqueueing or group sending. The broadcast retains its original
recipient snapshot across retries; `textOnly:true` deliberately omits attachments, never as a silent fallback.
Retained channel articles may be selected as forwarding or reference sources.
Forwarding destinations remain private/group conversations; a channel can receive
news only through its publication API. Source images keep their original download
names while copying through the same authenticated chunked transfer.

```sh
agents messenger forward --messages '[{"conversation":"employee:SOURCE","id":"MESSAGE_ID"}]' --to employee:DESTINATION --comment 'Please review this' --client-message-id UNIQUE_ID --json
```

A durable receipt prevents the same `clientMessageId` from dispatching again, including
after Core restart. Different content with the same key is rejected. `retry:true` permits
a deliberate retry of a known failed request; an uncertain acceptance is never replayed.
The user must inspect the destination before creating a new request in that case. This
operation can send work to an employee; reading/searching/saving alone still cannot.

`messenger.forward-draft {value,expectedClientMessageId?}` saves one pending forwarding
intent in `messenger.state.pendingForward`; `value:null` explicitly discards that draft,
not an accepted send or its receipt. `value` contains `clientMessageId`, 1–50 source
`messages`, optional `to`, `comment`, `textOnly`, `preview:{text,images}` and `attempted`.
Preview text is limited to 1200 Unicode characters; `images` is a count, not image bytes.
Core supplies `updatedAt`. A mismatched expected ID leaves the state unchanged. Another
pending ID must be discarded explicitly before replacement. After `attempted:true`,
its payload cannot be edited or reset to an unattempted request.

`messenger.forward-status {clientMessageId}` reads its receipt without dispatching:
`status` is `not-found|preparing|sent|failed|uncertain|interrupted`, with `active`,
`retryable`, and optional `result` or `error`. Only known failures before dispatch are
retryable. Both APIs are operator-only. Closing the dialog preserves the intent;
Continue forwarding restores it. A failure opening the destination after acceptance
does not turn a sent message into a failed send. Forwarding to a group delivers the
shared request to its current members through the existing broadcast work route.

```sh
agents messenger forward-draft --data '{"clientMessageId":"ATTEMPT_ID","messages":[{"conversation":"channel:SOURCE","id":"NEWS_ID"}],"comment":"Please review","textOnly":true,"preview":{"text":"News preview","images":0},"attempted":false}' --json
agents messenger forward-status --client-message-id ATTEMPT_ID --json
agents messenger forward-draft --data null --expected-client-message-id ATTEMPT_ID --json
```

`messenger:changed` emits only a revision and optional conversation reference. Actual
personal content is fetched through the authenticated user API. Invalid/corrupt state
is not silently replaced. See [MESSAGE_PARITY.md](Infra/src/docs/MESSAGE_PARITY.md) for the ongoing
feature audit; these APIs alone do not establish full commercial UI parity.

### Shared application views and read receipts

`agents view list --json` returns the `company`, `messages` and `plan` presentation definitions,
current navigation, saved company subviews, and the canonical APIs shared by every view.
Definitions live in `Infra/src/shared/app-views.ts`; adding another presentation does not create
another employee, transcript, role, binding or read-receipt store.

```sh
agents view select company --json
agents view select company --team-view SAVED_VIEW_ID --json
agents view select messages --json
agents view open messages --employee EMPLOYEE_ID --json
agents view open messages --chat GROUP_ID --json
agents view open messages --channel CHANNEL_ID --json
```

`view.select {id:"company"|"messages"|"plan",teamViewId?}` checks the destination and flushes
editors before changing it. Company defaults to All Team; Messages resumes this client’s
last employee/group/channel/source, or its list if that destination is unavailable. `view.open {kind:"messages",channelId}` validates one existing channel;
employee, chatId and channelId are mutually exclusive. Closing a covering settings
or workbench view returns to the originating channel just as for an existing chat.
Opening a news channel creates no native session or message-read receipt.
Navigation remains client-specific; employees, native conversations,
bindings and read receipts remain shared. A private reply read in Messages uses the same
exact `session.acknowledge` record as the workspace and Company canvas, so all private
unread indicators clear together. Merely listing or opening an obscured/background
conversation does not acknowledge it. Switching presentations reattaches the visible
reply observer, including when the same employee remains selected. Focus recovery, late
content and closing a covering dialog recheck the visible reply after layout. A stale
desktop visibility event cannot permanently suppress receipts; the native IPC endpoint
still verifies current foreground status for every acknowledgement.

### Group conversations and explicit mentions

Chat groups are independent of Company Teams. Every `chat.send` and `chat.post`
message is delivered to all current employee members; an Agent author receives no
self-echo. Mentions select work targets, not who can see the message.

- A user `chat.send` assigns work to explicit mentions and the current Agent author
  of a same-group `replyTo`. Without either target, it assigns work to all members.
- An employee `chat.send` assigns work only to explicitly mentioned employees within
  the sender's control authority.
- Other recipients receive `awareness`: the message enters their existing native
  conversation context without a work assignment. `chat.post` uses this mode for all peers.

```sh
agents chat create --name "Launch room" --members '["EMPLOYEE_A","EMPLOYEE_B"]' --json
agents chat get GROUP_ID --json
agents chat send GROUP_ID --text "Check the release checklist." --mentions '["EMPLOYEE_A"]' --json
agents chat context GROUP_ID --message MESSAGE_ID --json
agents chat history GROUP_ID --before 25 --limit 50 --json
agents chat post GROUP_ID --reply-to MESSAGE_ID --text "Checks passed." --kind result --json
```

Use stable group/employee/message IDs. Typed names are not explicit mentions.
An employee may join multiple groups; membership grants access only to those groups,
not other members' private conversations or employee-control authority.

`chat.create {name,team?,members?,ownerId?}` supports up to 200 employees. An Agent
creator is the Owner and must be a member; the user may select a member as Owner.
`chat.update {id,name?,members?,addTeams?,expectedRevision?}` replaces supplied members
and adds current employees from supplied Teams. Owner/Admin manage membership and
moderation; only Owner or the human user dissolves a group. See
[conversation roles](Infra/src/docs/CONVERSATION_CONTROLS.md).

`chat.get` returns group/member identities and unread metadata. `chat.history`
returns `{messages,nextBefore}` in chronological order, with `limit` 1–100 (default 50).
`chat.context` returns the selected message, current policy, shared workspace and
latest 20 public messages. Messages retain their author, ID, sequence, time, mentions,
reply reference and per-recipient delivery.

Deliveries freeze the current recipients and `work|awareness` mode when accepted.
They use each employee's existing native session and FIFO. Busy recipients queue
normally. Statuses are `pending`, `routing`, `queued`, `running`, `completed`, `failed`
and `interrupted`; an awareness completion means reading, not completed work.
Identical `clientMessageId` retries return the accepted message; changed payloads fail.
Restarts mark uncertain active deliveries interrupted rather than replaying them.

### Private reading, deliberate publication and group mutes

Core first sends the full message and its author/targets into the recipient's native
context. The tool-free reading stage records `deliveredAt/readAt` on success.
`work` then starts the assigned task; `awareness` completes after reading.
Publication requires an explicit `chat.post`, `channel.message-post` or response-stage
`agents_company_discussion_post` call. Ordinary assistant output stays private.

The response-stage tool takes the exact current conversation/message IDs:

```json
{"conversationType":"group","conversationId":"cg_actual_id","messageId":"gm_actual_id","text":"Reply text"}
```

Core checks task identity, credentials, membership and mute state. Agent posts require
nonempty text, at most 2,000 Unicode characters; user posts allow 16,000 and attachment-only
messages. Null and placeholder-only posts are invalid. Kind is `summary`, `decision`,
`blocker`, `question` or `result`; `message` is user-only.

```sh
agents chat mute GROUP_ID --member EMPLOYEE_ID --for 3600 --json
agents chat mute GROUP_ID --member EMPLOYEE_ID --off --json
```

Current Owner/Admin or the human user may mute. Omitted duration is indefinite.
Mute restricts posting while preserving reading, membership and private work.
Group/channel user read receipts remain independent of private-chat receipts.

### Correcting an operator's published message

```sh
agents chat edit GROUP_ID --message MESSAGE_ID --text "The review is at 15:30." --expected-revision 0 --json
agents chat edit GROUP_ID --message MESSAGE_ID --file ./caption.txt --expected-revision 1 --json
```

`chat.edit {id,messageId,text,expectedRevision}` is user-only and returns the updated
`ChatMessage`. Only messages whose authenticated author is the operator can be edited;
employee, Manager and Governor messages cannot be rewritten. Text must already be trimmed,
with the same 16,000 Unicode-character limit as an operator post. Empty text is accepted
only when the message already has attachments. `--file` reads text using the existing
CLI file-input convention; attachments themselves cannot be changed by this operation.

Legacy messages have an implicit `editRevision` of 0. A correction increments it and sets
`editedAt` to Core time in milliseconds. A different text with a stale `expectedRevision`
fails with `Message changed; reload before saving`. Retrying the current text returns the
current message unchanged even with an older valid revision, allowing recovery after a
lost response. Read `chat.history --around MESSAGE_ID` to inspect the latest revision.

Editing changes the shared text/caption only. IDs, sequence, author, original timestamp,
attachments, mentions, deliveries, replies, native histories and read cursors are preserved.
It does not enqueue, dispatch, restart or cancel work. Already accepted tasks keep their
original prompts and selected quote snapshots, including tasks still routing or queued.
New quotes are validated against the current published text. Existing forwarded copies
and reply snapshots remain as authored. The latest group preview reflects a correction
without changing conversation recency. `chat:changed` includes an optional
`editedMessageId` hint for corrections, without copying message text into the event.
Delivery-state and authenticated recipient acknowledgment changes can include `messageId`.
Clients can refresh that exact already-loaded message, including one outside the newest history
page. Both fields are refresh hints; clients still read the authenticated `chat.history` projection
and must not derive a delivered/read milestone from an event alone.
No edit-history content store is created.

The original `clientMessageId` and send fingerprint also remain unchanged: retrying the
original send returns the corrected record without redispatch; using its retry key with
different send content remains an error.

### What employees publish to a group

```sh
agents chat context GROUP_ID --message MESSAGE_ID --json
agents chat post GROUP_ID --kind result --reply-to MESSAGE_ID --text "Checks passed. Details are in my private conversation." --client-message-id report-001 --json
agents chat post GROUP_ID --kind blocker --text "Need a decision on the deployment window." --json
```

`chat.context {id,messageId?}` returns the selected group request, up to 20 recent published
messages, current members and `policy`. `chat.post {id,text,kind?,replyTo?,clientMessageId?}`
publishes as the authenticated member; authors cannot be supplied or impersonated. The
supported employee kinds are `summary`, `decision`, `blocker`, `question`, and `result`,
defaulting to summary. The operator may additionally use `kind:"message"` for a
context-only publication. Agent posts are capped at 2,000 Unicode characters; user messages
at 16,000. Agent posts require nonempty text.

`chat.post` publishes to the selected group; ordinary private replies are not copied
into it. Public replies enter other members' native context as awareness.

### Group read receipts and removal

```sh
agents chat acknowledge GROUP_ID --message MESSAGE_ID --json
agents chat delete GROUP_ID --json
```

Group administration follows current Owner/Admin authority, with the human recovery override. Human read acknowledgment remains user-only. An Agent
cannot mark the user's group or private messages read. A group's exact-message read cursor
is shared across views/clients; reading a brief group update does not mark an unseen full
private reply read. The UI retains foreground, visibility, and short dwell checks for both
receipt kinds. `chat.delete` removes the group from navigation while preserving its
recoverable stored history, all employees, their workspaces, private histories, bindings
and scheduled work. No group operation changes employee role authority.

## Independent news channels

News channels have independent identities and administrator assignments. The user
manages subscriptions and assigns any existing employees without changing their
company role, engine, host or permissions. Reading/managing news alone does not
start inference. With administrators configured, newly created external news is
delivered to those administrators for a real silent reading turn in their existing
sessions. User discussion may assign work as described below. Collectors keep
their own source credentials and retention; they gain no employee or discussion
authority. Channel management is available to the user or Secretary. The context/history/message-post
operations also admit currently assigned administrators, with a Core membership check.
Creation requires `engine`: `{kind:"employees",employeeIds:[...]}` or an external process
`{kind:"external",location:"local"|"remote",name,host?,endpoint?,collectorId?}`. Remote processes
require both host and a receiver URL reachable from that process. Employee publishers use
`channel.publish`/`channel.media-put` with channelId; Core binds authorship to their own current
membership. External collectors continue to use sourceId and separate credentials. Ordinary
employee channel reads do not expose external connection addresses or credential IDs.

`channel.connection {id}` exposes process configuration, source IDs and the last authenticated
request to application administrators. It does not claim live reachability. A new dedicated
token is returned once in `setup` at creation; `channel.collector-add {name,channelId}` replaces
the binding without changing unrelated channels. Creating a channel does not start a process
or task. Employee channel settings can create an existing `schedule.create` agent task with
explicit cadence and enablement. See [CHANNELS.md](Infra/src/docs/CHANNELS.md) for setup and publication examples.

`channel.create` and `channel.update` accept `avatar:{name,mimeType,data}` for independently
retained PNG/JPEG/GIF/WebP bytes up to 8 MiB. `channel.update {id,avatar:null}` restores the default
image; `channel.avatar-image {id}` reads custom image bytes. Names, membership, connection and
avatar edits support expectedRevision on update. Engine kind is fixed once configured.

```sh
agents channel list --json
agents channel source-add --data '{"plugin":"telegram","locator":"https://t.me/example","name":"Example news"}' --json
agents channel source-add --data '{"plugin":"x","locator":"@example"}' --json
agents channel source-add --data '{"plugin":"youtube","locator":"https://youtube.com/@example"}' --json
agents channel create --name Research --engine '{"kind":"external","location":"local","name":"Research worker"}' --json
agents channel create --name 'Team news' --engine '{"kind":"employees","employeeIds":["EMPLOYEE_ID"]}' --json
agents channel source-update SOURCE_ID --patch '{"channelId":"CHANNEL_ID"}' --json
agents channel sources --include-disabled --json
agents channel source-remove SOURCE_ID --json
agents channel posts --channel CHANNEL_ID --limit 50 --json
agents channel post POST_ID --json
agents channel save POST_ID on --json
agents channel delete POST_ID --json
agents channel export POST_ID --json
```

The initial channel list is empty. Each Telegram source creates its own channel;
X and YouTube lazily create one default aggregate channel each. X/YouTube sources
can be routed to any external-engine channel, including a Telegram source’s channel;
that source keeps its fixed corresponding channel. Routing projects all retained posts, including
saved posts, through the source's current channel without changing post IDs or
copying content. Unfollowing disables the source while preserving its identity,
history and saved posts; following it again reuses that source. Equivalent local
X/Twitter profile URL, handle and `@handle` forms are deduplicated; equivalent
YouTube `@handle` URLs are too. Core does not resolve network aliases between a
YouTube channel ID and a handle. An existing source cannot be changed to another
author; follow a new source instead.
X accepts a 1–15 character letter/digit/underscore handle or an X/Twitter profile
URL (including mobile.twitter.com), and rejects status URLs and functional pages.
YouTube accepts @handles and youtube.com channel homepages, including /channel/UC,
/c/, /user/ and legacy custom paths; supported browsing tabs are normalized for
identity. Individual watch/shorts/live URLs and other websites are rejected locally.

`channel.source-add` accepts `{plugin,locator,targetId?,name?,enabled?,pollSeconds?,channelId?}`;
`plugin` is `telegram|x|youtube`, `targetId` is the collector's opaque stable target
identifier, and Core assigns the unique `sourceId` (`id` in source records).
A new source without targetId receives a platform-prefixed value such as
`x:@example` or `youtube:@example`, so the same handle can be followed on both.
Existing/explicit target IDs are preserved; a new explicit ID already used by
another source is rejected before changing collector configuration.
New sources default to polling every 300 seconds for Telegram, 3600 for X and
7200 for YouTube; explicit pollSeconds overrides these existing platform cadences.
`channel.source-update {id,patch}` accepts name, enabled, pollSeconds and channelId;
a locator is accepted only when it denotes the same locally identifiable author.
Telegram's one-to-one route cannot change. Source records include current channelId
and may project a retained author avatar as `{postId,mediaId}`.

`channel.posts {channelId?,sourceId?,saved?,query?,cursor?,limit?}` returns
`{posts,total,nextCursor}`. The limit is 1–100, default 50; ordering is original
publishedAt descending then stable post ID descending. Search matches title, body
and source name. `channel.post {id}` returns a retained `ChannelPost`: stable id,
sourceId, externalId, current channelId/sourceName/plugin, title/body, optional url,
authorName/authorUrl/avatarMediaId, optional Telegram sourceAvatar `{sourceId,sha256}`,
publishedAt/receivedAt/updatedAt/expiresAt,
contentHash, saved/savedAt and local media descriptors
`{id,name,mimeType,bytes,sha256}`. `channel.get {id}` returns just the channel
identity, effective adminIds and revision; `channel.list` adds source/post/saved
counts, the latest retained post, optional lastMessage (including actual author),
and a Telegram source avatar `{sourceId,sha256}` when one has been uploaded. An independent
custom channel image takes priority and adds channelId to that avatar descriptor.

Unsaved news expires at `min(publishedAt + 48 hours, receivedAt + 48 hours)`;
updates and retries never extend that deadline. Core rejects expired replay,
cleans its own expired text and local image copies, and retains bounded identity
and hash tombstones long enough to suppress retries inside the receive window.
Expired old publication dates are rejected even after tombstones are reclaimed.
`channel.save {id,saved:true}` permanently retains both text and local images.
Saving/un-saving normally returns the current post; removing a save after the
original deadline immediately cleans it and returns `{id,saved:false,expired:true}`.
`channel.delete {id}` deletes local content and images, including saved content,
and is idempotent. Neither operation deletes anything on a collector host.

`channel.image {channelId,postId,mediaId}` returns `{data,mimeType,name}` only for an
image actually published by that retained item in its current channel. Staging
images and arbitrary paths/URLs cannot be read. The same image may be downloaded
through existing transfer APIs with `{channel:channelId,path:postId+"/"+mediaId}`.
`channel.export {id}` packages the Markdown article and original local images in a
self-contained archive and returns a Core-host download location; Web clients use
the existing authenticated chunked download. Moving a source invalidates its old
channel-scoped image location; stable post IDs continue to resolve the new route.
The export result is `{name,markdown,download:{local:true,path}}`; `path` belongs to
the Core host, not the browser device. Generated archives are temporary downloads
(cleaned periodically after about one hour), independent of permanent saved news.
Copy them through the normal download APIs when a durable exported file is needed.

### Channel administrators and discussion

```sh
agents channel update CHANNEL_ID --admins '["EMPLOYEE_ID"]' --expected-revision 1 --json
agents channel message-send CHANNEL_ID --text "Review this topic." --mentions '["EMPLOYEE_ID"]' --reply-to POST_OR_MESSAGE_ID --json
agents channel history CHANNEL_ID --limit 100 --json
agents channel context CHANNEL_ID --entry POST_OR_MESSAGE_ID --json
# Authenticated administrator, in a user discussion actually delivered to them:
agents channel message-post CHANNEL_ID --reply-to USER_MESSAGE_ID --text "A concise result." --kind result --json
# No public reply needed: do not call message-post.
```

`channel.list` is also available to initialized employees, Managers and Governors,
but returns only their current administrator assignments as `ChannelRecord[]`
(`id,name,kind,createdAt,updatedAt,adminIds,revision`). It omits user saved counts,
subscription summaries and previews. `channel.get {id}` returns the same identity
only for a channel the caller currently administers. The operator's existing
`ChannelView[]` listing is unchanged; Secretary receives the same complete application-management projection, including channels it does not administer. Publication and recipient acknowledgment still require actual membership. These reads never start engines, acknowledge
messages or grant permission to add administrators/manage subscriptions.

`channel.update {id,name?,adminIds?,expectedRevision?}` (user or Secretary) assigns up to 200 existing
employees using optimistic revision checking. Its `adminIds` is the sole authority;
there is no hidden group and no company-role or management-binding change. Deleted
employees are excluded from the projection. Adding an administrator does not replay
previously retained news or expand an accepted delivery snapshot.

`channel.message-send {id,text,mentions?:string[]|"all",replyTo?,clientMessageId?}`
is available to the user or a Secretary who is a current channel administrator. Other current administrators receive it. A Secretary keeps its authenticated Agent author and receives a Core-written `requestId=id` management-discussion root; ordinary posting cannot forge this marker. Replies may refer to a received user or Secretary root. Explicit mentions and a valid
same-channel reply's Agent author form the work targets; without such a target,
all current administrators receive work. Others receive awareness only. Targets
use the original employee engine, session, queue and permission checks. User text
is limited to 16000 Unicode characters. `replyTo` can identify retained `np_` news
or a `cm_` discussion message; external authors never become employees by name.

`channel.message-post {id,text:string,replyTo?,kind?,clientMessageId?}` accepts
concise administrator replies (up to 2000 Unicode characters). A public Agent reply
must trace to a user-authored or Core-marked Secretary management discussion delivered to that Agent; it cannot
be an unsolicited post in response to a news-only delivery. A user question about that
news is a normal discussion; reply to its user message through this API. Ordinary
questions, stories and casual conversation are valid requests as well as work tasks. Other current
administrators receive the reply as silent-only awareness, without a self-echo.
The historical acknowledgmentOf marker remains read-only. No acknowledgment-only
publications are created. Null, empty Agent text and --silent are rejected.
Operator message-post remains explicit context-only publication.

Reading has no tools and generates a recipient receipt only after native success.
The optional bound agents_company_discussion_post tool is available in the shared
response stage for an explicit nonempty answer, with the same exact-target checks as
groups. Ordinary output is private; news and awareness deliveries have a reading stage only.
Channel work preserves existing private lastReply and its read state.

### Other conversation history

`agents chat history GROUP_ID --limit 50 --json` reads up to 100 messages per page;
use `--before NEXT_BEFORE` from nextBefore for older pages, or `--around MESSAGE_ID`
for the surrounding page. It remains member-scoped and never acknowledges reads.
`agents session transcript EMPLOYEE_OR_SESSION_ID --limit 50 --json` and the
`--employee EMPLOYEE_ID` form both return the last N transcript items (supported
limit 1–1000). Omit limit for the complete authorized private transcript. Private
history uses existing employee-control permissions and has no older-page cursor.

### Reading channel news and earlier messages

Use `channel.timeline` when an Agent needs the news visible above a question.
`channel.history` and `channel.context.recentMessages` contain **discussion only**;
an empty discussion list does not mean the channel has no news. The existing
`channel.posts/post` management interfaces remain user/Secretary scoped.

```sh
# Read the latest 10 retained entries, including news and discussion.
agents channel timeline CHANNEL_ID --limit 10 --json
# Summarize news above a particular user question; choose the batch size.
agents channel timeline CHANNEL_ID --kind news --before-entry QUESTION_ID --limit 20 --json
# Continue farther back with the returned nextCursor and the SAME filters.
agents channel timeline CHANNEL_ID --kind news --before-entry QUESTION_ID --limit 20 --cursor NEXT_CURSOR --json
```

`channel.timeline {id,kind?:"all"|"news"|"message",limit?,beforeEntry?,cursor?}`
returns `{entries,nextCursor,order:"chronological"}`. The default kind is all and
limit is 20; choose an integer from 1 through 100 for each request. Fetch more than
100 total entries by following nextCursor until it is null or enough context is read.
The newest matching page is selected, then returned in chronological order; older
pages precede it. No total count or full-history load is required.

Each entry contains stable `id`, `time` and `kind`. News entries carry `post` with
full untruncated title/body, platform/source, original author/URLs, published/received/
updated/expiry times, and local media descriptors. They omit user `saved`/`savedAt`
preferences and do not inline image bytes. Discussion entries carry their existing
`message`, including the real author, body, timestamp and reply reference.

Ordering matches the channel's public timeline: news uses publishedAt, discussion
uses createdAt, ties use stable ID. `beforeEntry` must be a currently retained news
or discussion entry in the same channel; it excludes that entry and all entries
ordered after it, even when kind=news uses a discussion question as the anchor.
This is the current retained timeline, not a historical snapshot: newly received,
older-dated news can appear above an earlier question. The cursor is opaque and
bound to channel/kind/beforeEntry; keeping only cursor while dropping these filters
is rejected. The per-page limit may change.

Current channel administrators of every company role may read their own channel.
The user and Secretary retain application-wide read authority. Every request
rechecks membership, current source routing, deletion and retention. Expired or
deleted news stays unavailable; saved news remains readable beyond 48 hours.
Reads do not acknowledge deliveries, modify user unread state, start models, or
publish messages. Do not preload all history into initialization or reading ACKs;
fetch only the needed number of entries in the response stage. `channel.context`
and the native channel prompt include a small `history` route describing this API.

### The user's channel reading state

News and incoming administrator messages have a separate personal unread state.
`channel.list` includes `unreadCount` and optional `firstUnread {id,kind}` in the
user/Secretary management projection. This is independent of administrator
delivery/read receipts, manual unread reminders and task execution.

```sh
# Inspect only the entries currently needed; this does not mark them read.
agents channel read-state CHANNEL_ID --entries '["np_ARTICLE","cm_REPLY"]' --json
# The user confirms particular displayed entries.
agents channel acknowledge CHANNEL_ID --entries '["np_ARTICLE","cm_REPLY"]' --json
# An explicit user choice clears all currently unread updates in this channel.
agents channel acknowledge CHANNEL_ID --all --json
```

`channel.read-state {id,entryIds}` accepts at most 200 IDs and returns
`{id,entries:[{id,state:"unread"|"read"|"unknown",readAt?}],unreadCount,firstUnread?}`.
Only the user and Secretary may inspect this personal state. Ordinary channel
administrators can still read news through `channel.timeline`, without receiving
the user's personal reading metadata.

`channel.acknowledge` accepts either `{id,entryIds}` (up to 200 IDs) or `{id,all:true}`.
Only the user may call it; Secretary and every other Agent are prohibited. It
returns `{acknowledged:true,id,acknowledgedCount,unreadCount,firstUnread?}`, plus
`entryIds` for a batch or `all:true` for the explicit all operation. Batch IDs that
have expired, been deleted or disappeared are omitted; an active entry from a
different channel rejects the whole batch. `all` only changes currently unread
incoming entries, without loading all article bodies or returning a huge ID list.

Newly received, backdated news is unread. Updating a known article does not reset
its state; moving an author preserves the state of each stable article ID. Counts
include only currently retained content. During upgrade, older entries start at an
unknown baseline and do not suddenly produce unread badges; no past read timestamp
is fabricated. Reading an unknown entry can subsequently record a real confirmation.

The UI confirms individual visible entries after a foreground dwell, never from
search results, saved-item previews or administrator receipts. Native desktop also
checks the actual window's focus/visibility. Entering a channel positions the loaded
history at its first unread entry; earlier unread content is exposed through explicit
continuous history paging. Only the user's "Mark as read" action uses `all:true`.
The `channel:changed` event uses `kind:"reads"`, `channelIds`, and batch `entryIds`
where available. It changes the channel revision, not collector configuration, and
does not rewrite news, send messages, start an Agent or alter Agent receipts.

`channel.history {id,before?,around?,limit?}` returns `{messages,nextBefore}` in
sequence order (limit 1–100), excluding news. Use channel.timeline for the mixed feed. A `ChannelMessage` contains channelId, stable id,
sequence, createdAt, real author/authorName, text, kind, mentions, optional replyTo,
requestId and acknowledgmentOf, frozen deliveries, clientMessageId and fingerprint.
`channel.context {id,entryId?}` returns channel identity, the retained news or
message entry, recentMessages, reporting policy, entry deliveries, and the caller's
acknowledgment policy when it is a recipient. History/context reads do not mark
anything read. Existing `channel.post {id}` continues to mean reading a news item.

New external news is awareness + silent-only for the administrators captured at
creation. Duplicate/update/save/delete events do not dispatch another reading turn.
The queue stores a thin article reference, then resolves title, complete body,
original publishedAt, platform, source/author URLs and local media descriptors at
dispatch. Media descriptors are supplied as context; this release does not
automatically send image bytes as native vision inputs or perform image analysis.
Original news images remain viewable/downloadable in the channel UI.
Deletion, expiry, source movement and revoked administration are checked
again before reading. News is never copied into a permanent hidden discussion or
queue body. The 48-hour policy governs Core's news store and media; content actually
sent to an engine can remain in that engine's native history and is not rewritten
by Core cleanup. Work and reading reuse the existing ACK stage and native FIFO,
not a second executor. News publication never impersonates an operator author;
its narrow notification authority comes from the user's administrator assignment.

Delivery/read timestamps reflect actual native acceptance and authenticated ACKs,
not local enqueue or user viewing. Channel awareness does not alter private user
read receipts. Restart never replays uncertain routed work; only unstarted pending
news references are reconsidered, with current authorization and retention checks.
Identical client retries return the original message and frozen recipients.
`channel:changed` uses `kind:"messages"` and optional messageIds for discussion and
receipt updates; these frequent updates do not change collector configuration revision.

### Collector capability and wire contract

```sh
agents channel collector-add --name Newsroom --sources all --json
agents channel collectors --json
agents channel settings --patch '{"enabled":true,"port":5152}' --json
agents channel collector-revoke COLLECTOR_ID --json
```

`channel.settings {patch?:{enabled?,port?}}` defaults to
`{enabled:false,host:"127.0.0.1",port:5152}`. Core binds the dedicated loopback listener
only when enabled; the response includes runtime listener status. Ports are
1024–65535. Use TLS via a reverse proxy or an SSH tunnel for another host. The
transport is independent of source plugins and does not require desktop/Web UI.
`runtime` is `{listening,url?,error?}` and describes the listener, not collector
reachability. A failed bind retains the configured settings and reports its error;
this is not a claim that a remote collector is connected.

A collector token is a separate capability, never an operator or employee token.
`channel.collector-add {name,sourceIds?:"all"|string[]}` returns
`{collector:{id,name,sourceIds,createdAt},token}` once; Core stores only its hash.
Listings return metadata, never tokens or hashes. Revocation immediately rejects
subsequent requests. A restricted collector sees and submits only its allowed
source IDs. Source management, routing, saves, deletion, settings, employees and
all other Core operations remain inaccessible with this token.

Send `POST /api/channels/collector`, `Content-Type: application/json`,
`Authorization: Bearer <collector token>`, with `{cmd,args}`. Replies are
`{ok:true,data}` or `{ok:false,error,code}`. The narrow dispatcher permits only:

| Command | Arguments | Result |
| --- | --- | --- |
| `channel.collector-config` | `{sinceRevision?}` | `{revision,changed,targets?}`; unchanged revision omits targets |
| `channel.media-put` | `{sourceId,externalId,publishedAt,mediaKey,name,mimeType,data}` | `{media:{id,name,mimeType,bytes,sha256},duplicate}` |
| `channel.publish` | `{sourceId,externalId,publishedAt,title,body,url?,authorName?,authorUrl?,avatarMediaId?,mediaIds?,contentHash?}` | `{id,channelId,status,contentHash,expiresAt}` |
| `channel.source-avatar-put` | `{sourceId,name,mimeType,data}` | `{sourceId,sha256}`; independent source identity bytes |

Each target is `{sourceId,targetId,plugin,locator,name,enabled,pollSeconds}`. Core
configuration revisions change on source/configuration changes, not on every new
article; collectors may poll `sinceRevision` about every five seconds and apply
changed targets through their existing reload logic. Disabled targets remain in
configuration. Posting or uploading for one returns `SOURCE_DISABLED` (HTTP 409):
refresh configuration and stop retrying that source until it is enabled.

Publication time is Unix milliseconds and cannot be more than five minutes in
the future. Stable identity is `(sourceId,externalId)`; its original publishedAt
cannot change. Body is a string up to 1 MiB; title is at most 1000 characters. At least
one nonempty title/body, body image or source URL is required; title-only,
image-only and link-only items are accepted without fabricated text. Up to 16
uploaded body images may be referenced. Optional author avatar uses a
separate `avatarMediaId`, usually uploaded with `mediaKey:"avatar"`. Core never
fetches a supplied URL. Image data is base64 PNG/JPEG/GIF/WebP, at most 8 MiB per
image, checked against the declared type and owned by that exact source/item.

`channel.source-avatar-put` uses the same image validation but belongs to a source,
not an article. Its single SQLite image survives article expiry/deletion, replaces
atomically, and an identical hash is a no-op. `channel.source-image {sourceId}`
returns `{data,mimeType,name}` to the user. A collector can upload only its allowed,
enabled sources and gains no read, message, administrator or management APIs.

`status` is `created|updated|duplicate|deleted|expired`. Identical retry returns
`duplicate` without changing timestamps. A changed payload may update content
inside its original window; reusing a supplied contentHash for different content
fails with `CONTENT_HASH_CONFLICT` (409). Deleted/expired identities return a
terminal status and do not reappear. Uploads to them fail with `POST_DELETED` or
`POST_EXPIRED` (410). The collector can commit its existing publication marker
only after a successful result; it needs no duplicate Core task queue.

Source and article updates emit `channel:changed` with
`{kind:"settings"|"sources"|"posts"|"channels",revision,channelIds?,postIds?}`.
Clients refresh affected channel projections; news events neither dispatch work
nor acknowledge private/group messages.

## Team views

顶部的 Company Views 按钮展开全部已有视图。每个自定义视图旁提供编辑按钮；列表支持上下拖动排序，编辑器提供 Move up / Move down。编辑面板从 All Team 选择已有团队，增减勾选只影响视图显示，不删除团队、员工或工作目录；保存仍调用 `team-view.update`。All Team 默认包含全部团队，不可编辑或删除。

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
`bounds`, `editable`, `connections` (creation/binding edge IDs, endpoints, orthogonal `points` and rounded SVG `path`), and employees with stable IDs, titles, roles, Team-relative
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

Roster/creation-topology changes refit only affected rooms in the same atomic state
commit. Explicit visual bind/unbind operations preserve all existing geometry. Overlapping neighboring rooms move aside, including pinned rooms; this
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

## MiniNotion page folders and employee bindings

MiniNotion 1.19.0 adds `guide`, `page.write-markdown`, `page.read-markdown`,
`block.validate` and `page.audit`. `schema METHOD --compact` omits icon/appearance
catalogs while keeping method fields and examples. Work employees use their bound
runtime CLI through PATH and the same short documentation router as every other
employee. All roles perform the brief identity/index initialization; full plugin
guides are read only when the task needs them, without copying them into workspaces.
A coordinator must verify child task completion and read back actual native pages,
records and views rather than report dispatch or generated scripts as completion.
The detailed workflow is available from `agents api docs plugin/mininotion/api`
and through `mininotion guide delegation` / `mininotion guide verify`. Prefer
`plugin/mininotion/index`, then `plugin/mininotion/command/METHOD`, for a single operation.


MiniNotion 1.18.0 uses one physical folder per new main page:
`<main-folder>/index.mininotion.json`. Descendants, databases and records use
`<main-folder>/<page-id>.mininotion.json`; `page.parentId` stores recursive hierarchy.
UI and CLI edit the same files. Use `fs.path` for the actual directory: renaming a
page never renames the folder bound to an employee.

```sh
agents plugin call mininotion page.create --team Planning --params '{"title":"Knowledge","color":"white"}'
agents plugin call mininotion fs.path --team Planning --params '{"pageId":"RETURNED_PAGE_ID"}'
agents card create --title Writer --group Planning --engine codex --directory-mode bind --cwd '/absolute/path/from/absoluteDirectory'
agents plugin call mininotion fs.info --employee EMPLOYEE_ID
agents plugin open mininotion
```

`fs.bind {path:"."}` from the employee's bound launcher makes that existing folder
an editable main page; the user's directory page offers the same action.
For a page that will be assigned to an employee, create it in that Team's view
or via `--team`, then bind the returned main-page directory. The default collection
is an editable view of the same document. No new human/Agent permission layer is
introduced; employee API scopes remain unchanged.
Old `Documents` files remain in place. Back up first and inspect
`fs.organize {dryRun:true}` before explicitly applying `dryRun:false`.

## Workspace enforcement and existing data

New Work roots are auto-created under the plugin's workspace base, followed by
`<Team name at creation>`. Portable and user-installed packages use
`$AGENTS_COMPANY_HOME/workspaces/<workspaceDirectory>`. A valid development
`source-location.json` preserves `Infra/Plugins/<plugin>/workspaces` as the base;
`AGENTS_COMPANY_WORKSPACES` overrides either with `<override>/<workspaceDirectory>`.
Each Team has a separate fixed root; the App never writes new workspaces inside its own packaged resources. Existing Work
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
its Team root. Build excludes the app's data directory; Work permits the plugin's
managed workspace subtree there, but never arbitrary application metadata. A Build employee bound
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
agents workspace read Infra/src/main.ts --team Engineering
agents workspace write Infra/src/main.ts --team Engineering --content 'new text' --hash HASH
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

## Interface language

`settings.get` includes `language: "en" | "zh-CN"`. `settings.set {language}` persists
an explicit English or Simplified Chinese UI choice through the same Core path used
by desktop and browser settings. The setting defaults to English for stores without
this field and does not change a model, permission, conversation, workspace or user
content. Invalid language codes are rejected before saving.

```sh
agents settings set --language zh-CN --json
agents settings set --language en --json
```

Application settings provides a bilingual language selector; changes apply immediately
without restarting. Interface text, accessible labels and display dates use the selected
language. Names, custom view titles, message bodies, file names, prompts, model IDs,
external model output and raw protocol data retain their exact content. CLI command
names and machine-readable API values remain stable. The browser may cache only the
last language code to render its sign-in screen; authenticated Core preferences remain
authoritative. Independently implemented plugin interfaces are tracked separately in
the language coverage audit rather than being translated by mutating their documents.

## Appearance and pointer preferences

```sh
agents settings get --json
agents settings set --view company --theme white
agents settings set --view messages --theme teal
agents settings set --view plan --theme black
agents settings set --view company --theme custom --theme-color '#526dc3'
agents settings set --view-appearance '{"company":{"theme":"white"},"plan":{"theme":"light"}}'
agents settings set --page-zoom 1.1 --zoom-sensitivity 4 --pan-sensitivity 1.5
agents view open settings
```

`settings.get` returns independent `viewAppearance.company`, `.messages`, and `.plan`
objects, each containing `theme` and `themeColor`. `settings.set {viewAppearance:{...}}`
accepts partial views and partial fields; omitted values remain unchanged. Each edit is
validated before any data is written. `api.describe settings.set` includes the schema.
The CLI `--view company|messages|plan` scopes `--theme` and `--theme-color`; alternatively
`--view-appearance JSON|@file` applies a batch of explicit appearance changes.

Company and Plan default to `white`; Messages retains its previous color (new stores use
`violet`). Existing stores without `viewAppearance` are projected into these defaults
without changing employees, plans, workspace paths or native identities. Legacy top-level
`theme` / `themeColor` and the unscoped CLI flags remain aliases for **Messages only**.
An explicit nested Messages patch takes precedence if both forms are supplied. Settings
responses mirror the canonical Messages choice into those legacy fields; it is not a
second global appearance. Switching presentation changes the host tokens before paint.
Dialogs opened from Messages or Plan retain their originating presentation's theme.

All views accept `white|light|space|black|midnight|sage` and
`violet|blue|mint|teal|cyan|rose|coral|amber|indigo|graphite|custom` (`mint` is Green).
`themeColor` is a six-digit hex color, such as `#7953ce`, for the custom palette.
Company uses neutral, readable canvas surfaces; Plan uses document/database surfaces;
Messages keeps its conversation wallpaper and bubble palette. Explicit room palettes,
background colors and furnishings remain intact. A theme name does not
force these three presentations to share a layout or decorative background.

The compact settings dialog starts with Company, Messages and Plan tabs. Color choices,
language, page size and Company canvas controls apply and save automatically through
`settings.set`; no general Apply step is required. Dragging a color or range control
coalesces rapid input. Requests are serialized and contain only edited fields, so a later
response cannot overwrite a newer choice or an unrelated view. Navigation and closing
flush pending edits through the existing editor flush boundary. Failed saves retain the
selection and offer Retry without dismissing the dialog. Selecting a settings tab alone
does not recolor the working view. Each view retains its independent reset action.

Employee permission and model defaults are grouped in a collapsed section with their own
explicit Apply action; appearance autosave never submits these drafts. Engine management
and license details are collapsed separately. Shared display defaults and current-view
defaults reset independently from employee defaults.

### Messages wallpaper

The Messages settings tab includes five original micro-pattern collections (Daydream, Botanical, Cosmos, Studio, Geometry) and No pattern. Every collection supports ordered or naturally scattered placement, density and ink opacity with a live preview of the actual conversation renderer. The default uses small Daydream drawings in a deterministic scattered arrangement, density 115 and opacity 16.

`settings.get.messageWallpaper` contains `{pattern,layout,density,opacity}`. `settings.set {messageWallpaper:{...}}` merges only supplied fields: pattern is `daydream|botanical|cosmos|studio|geometric|none`, layout is `ordered|scattered`, density is 70–160 (%) and opacity is 0–45 (%). Unknown fields or out-of-range values reject the complete patch before persistence.

`agents settings set --message-wallpaper '{"pattern":"botanical","layout":"ordered","density":130,"opacity":16}' --json` uses the same API; JSON files are supported through `@file`. The native API tool also uses the unchanged authenticated settings dispatcher.

All private chats, groups, channel timelines and post views share one Messages decoration preference. Company, Plan, message data and execution permissions are unchanged. Color themes remain independent. Changing density/opacity is debounced and close/navigation flushes pending updates; late acknowledgements cannot remove newer local fields. Reset wallpaper restores only decoration; Reset Messages settings restores this view's color and wallpaper. No pattern keeps the theme's background wash without SVG marks.

The renderer repeats a small SVG tile (50 original motifs across five collections); layout is deterministic and bounded independently of message count or viewport size. Scattered tiles wrap edge motifs for seamless repeats. No downloaded art, remote requests, image files, animation loops or second background store are introduced.

Canvas zoom accepts 0.25–8 (default 2.5); pan accepts 0.25–4 (default 1). The sidebar width
range is 56–96 (default 64), with employee snapping enabled by default. These remain existing
Core preferences; appearance edits do not change canvas geometry or execution permissions.
Changes persist in `Store.preferences` and emit `store:changed`.

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

The separate Cloud Hosts plugin exposes these same commands as `hosts.list/get/create/update/remove/check/directories/credentials/fingerprints/trust` through its own CLI, schema and runtime. It is an application-scope service plugin: employees read the shared plugin documentation and use identity-bound runtime launchers/mailboxes; its API manages the shared host registry across Teams under existing authorization. No full handbook is copied to an employee workspace. To prepare a management team:

```sh
agents group add 'Cloud Managers' --mode work --plugin cloud-hosts
agents card create --title Operator --group 'Cloud Managers' --management-role governor
# After initialization is ready, in that employee's authenticated environment:
cloud-hosts hosts.list
cloud-hosts hosts.update --data '{"id":"HOST_ID","patch":{"name":"GPU Lab"}}'
```

`host.exec ID --command COMMAND|--command-file FILE [--directory PATH --timeout SECONDS]` executes exclusively through the registered host's Tunnel, with no local fallback. JSON API: `{id,command,directory?,timeout?}`; returns `{stdout,stderr,exit_code,cwd}`. Each call has an independent remote working directory; timeout is 0.1–600 seconds. Check exit_code, not only the RPC envelope.

VMs can be registered with `host.create/update` using `vm:{hypervisorId,name,projectDirectory,state,access,notes?}`. State is running/stopped/paused/unknown; access is ssh/serial/rdp/unconfigured. These are actual observed asset properties, not proof of SSH reachability. Non-SSH assets remain visible but cannot masquerade as usable cloud execution hosts. Use host.exec on the hypervisor to call its existing management CLI and inspect the real VM inventory. Registration does not start, stop or reconfigure VMs. Partial vm updates merge existing properties, duplicate VM identity is rejected, and hypervisors with registered VM children cannot be removed.

Plugin methods: `agents api docs plugin/cloud-hosts/index`; full reference:
`agents api docs plugin/cloud-hosts/api`. Existing cloud Teams migrate automatically with backup and connection deduplication. They persist only `{mode:"cloud",hostId,directory}`; API replies hydrate the read-only `remote` projection from the registry.

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

`engine.remote-sessions` lists native histories on that host under the Team root. `card.native-bind` accepts an existing native UUID only when its remote cwd exactly matches the employee cwd and the employee has no prior conversation. It imports readable messages into the host transcript, then resumes through the remote CLI. A manually bound history is marked `external`: removing the employee removes its host view, **not** the remote original. Native histories created by Aexus retain remote deletion ownership. Both types carry `hostId`, SSH endpoint/OS and original directory with every reference, so deletion or cloning cannot target a Mac record or another host. Codex remote cloning uses `thread/fork`; Claude remote cloning is explicitly rejected until a reliable native fork interface is available, leaving the source untouched. An existing running terminal process is not taken over; only its persisted history can be resumed. SSH disconnects never retry a model turn or fall back to the Mac.

New Cloud Native employees can still bind an existing session after their first hidden initialization. Core allows this only when its exact native-ID evidence still identifies a fresh, successfully initialized context with no public conversation. Any accepted ordinary or shared-message task clears that evidence, including silent awareness; cloned, external and legacy contexts do not gain eligibility merely because their public transcript is empty. Binding archives the owned initialization reference, preserves the selected history as `external`, and queues the same read-only initialization in that bound context before work. It never deletes or transfers ownership of the external original.

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
`node Infra/src/test/native-execution-test.mjs` uses a local model fixture with no inference.
Set `AGENTS_COMPANY_LIVE_HOST` and `AGENTS_COMPANY_LIVE_ROOT` to check an authorized SSH machine.
Unlike the native startup-only debug view, this captures the actual outgoing model request.

Cloud Codex employees use the native execution protocol and ordinary command/file tools.
If the remote executor misses Codex's 10-second initialization deadline, the
host closes that failed connection and makes one fresh remote connection before
starting any model turn. A second failure is reported; commands never fall back
to the Mac. The retry retains the employee's native thread ID and transcript.
Run `AGENTS_COMPANY_WINDOWS_MESSAGE_LIVE=1 node Infra/src/test/windows-message-live-test.mjs`
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
See [cloud safety verification](.aexus/artifacts/cloud-safety/README.md) for real GPT rounds
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


## Plan scheduling database

**Plan** is a third application view, backed by the existing host scheduler. It provides Table, Board, Timeline, Calendar, Planner, List, Gallery, Chart, Feed and Form, saved filtered views, employee assignment, priority, tags, notes, previews and real run history. All layouts share canonical jobs and employee conversations; they do not copy MiniNotion data or create another executor. See [PLAN.md](PLAN.md) for the full API and safety contract.

```sh
agents view select plan --json
agents plan schema --json
agents plan query --filter '{"states":["scheduled","attention"]}' --json
agents schedule create --name "Follow up" --employee self --after-seconds 1800 --prompt "Continue and report" --client-request-id followup-v1 --json
agents schedule create --name "Sunday review" --employee EMPLOYEE_ID --time 17:00 --days 7 --timezone Asia/Shanghai --prompt "Review the project" --json
agents schedule preview JOB_ID --count 5 --json
```

Every Agent can schedule itself through `self`, resolved from authentication. Scheduling others still requires its existing Manager/Governor control scope. One-time delays, absolute times, daily/weekly/monthly calendar schedules and intervals reuse `schedule.create/update/pause/resume/delete/run/history/cancel`. `maxOccurrences` limits scheduled attempts, including skips; `until` is an exclusive end. Creation supports retry-safe `clientRequestId`; edits support `expectedRevision`. The complete spec is in `schedule.schema.inputSchema` and `api.describe schedule.create`.

`plan.query` adds bounded database filters/sorting; `plan.calendar` projects future occurrences and actual retained runs; `plan.timeline` separates planned estimates from actual durations, `plan.analytics` aggregates all authorized pages, and `plan.feed` returns actual activity with stable cursor pagination; `plan.views/view-create/view-update/view-delete` manage presentation definitions only. Board status is computed, not a user claim that work succeeded. Core must remain running and its host awake; this does not wake a sleeping computer. Busy manual work is never interrupted to satisfy a timer. No inference runs merely from opening Plan or previewing dates.

Complete layout/API mapping and interactive design findings: [Plan view parity](Infra/src/docs/PLAN_VIEW_PARITY.md). Optional `plan.durationMinutes` is an estimate only, never a timeout or employee reservation. Saved-view `options` preserve timezone, temporal scale and chart configuration.

Small character avatars now use dedicated static head/shoulder or silhouette crops from the original art. The selectable catalog, native identities, palette settings and canvas animations remain unchanged.

### Message files and group media

`messenger.upload-begin CONVERSATION --name NAME --bytes N` is user-only. It creates
a uniquely named upload in the group/channel workspace root (or the existing private
attachment directory) and returns the chunk-upload protocol plus its planned `path`. Use consecutive `transfer.upload-chunk` calls, then
`upload-commit`; `upload-abort` removes incomplete staging bytes. Each regular file
is at most 2 GiB; messages accept up to 16 combined files/images. Browser and desktop
uploads send bytes, never interpret a browser-local path as a Core path.

`session.send/enqueue --files '["relative/path"]'` records trusted name, size and
MIME metadata. Paths enter the existing employee task context; uploading never runs
a task. `messenger.draft` persists `files` paths. `messenger.search --filter files`
searches filenames and public messages. Images keep their existing image protocol.

`chat.send/post --images JSON --files JSON` publishes paths uploaded to `group:ID`.
Attachment publication is currently user-only. Core keeps group media outside
employee workspaces. Every public send/post reaches the current recipient snapshot,
using work or awareness mode as described above. Group/channel recipients receive one
text notification containing the user's original text and all file names, types, sizes
and shared references. No attachment bytes or private-chat images/files are dispatched,
and no automatic workspace copy occurs. Employees explicitly read shared files or copy
them into their own named group folder or unchanged personal Workspace as needed. `chat.file ID --path PATH [--operation info|image|read|chunk]
[--offset N]` lets members read only published group attachments. Images use the
existing 10 MiB PNG/JPEG/GIF/WebP preview limit; other formats and larger images can
be uploaded as ordinary downloadable files.

`messenger.forward` copies images and files between private/group conversations via
bounded upload/download chunks. Operator group forwarding sends without explicit mentions
and therefore broadcasts to the frozen current-member snapshot. Text-only
cross-conversation reply references omit source file paths and record `omittedFiles`
and/or `omittedImages`; deliberate forwarding is the byte-sharing operation.

`transfer.download-save --from JSON --path ABSOLUTE_PATH [--overwrite]` streams an
operator-authorized file to the Core host and refuses to overwrite by default.
Desktop UI may omit the path to use the native save dialog; browsers stream through
authenticated `/api/download`. A transfer `FileLocation` selects exactly one of
`employee`, `team`, `shared`, `local`, or the user-only `group` scope.

### Historical image gallery

`messenger.gallery` is an operator-only, read-only projection of complete public image
histories. It returns at most 100 image references (default 40), never image bytes,
private thinking/tool traces, inference, or read acknowledgements. `conversation`
optionally limits the scope; otherwise the caller's visible employee/group histories
are searched. `query` and `author` match the existing message-search semantics.
`order` is `oldest` (default) or `newest`; images inside one album keep their order.

```sh
agents messenger gallery --conversation group:GROUP_ID --direction first --limit 40 --json
agents messenger gallery --conversation group:GROUP_ID --anchor '{"messageId":"MESSAGE_ID","path":"UPLOAD_DIR/photo.png"}' --direction around --json
```

A cursor has `messageId`, `path`, and an optional `conversation` (inherited from the
query scope when omitted). Use `anchor` with `direction:around|before|after`, or omit
it for `first|last`. Responses include `images`, `offset`, `total`, selected `index`,
and `through`. Each image carries its existing employee/group scope, message ID,
path, caption and source conversation name. Pass the returned `through` to keep later arrivals outside the
open gallery while paging. Cursor identities survive restart and do not depend on
which messages the UI has rendered. Current personal hidden/query/author filters
still apply. A hidden boundary cursor can page to adjacent visible entries; an
`around` request cannot select a hidden image. Invalid or removed cursors fail visibly.

Opening a gallery keeps browsing of already loaded images responsive while the full
metadata window is fetched. First/last and adjacent-page navigation read bounded
windows; the viewer's image-byte cache remains separate. An explicit source action
uses existing conversation navigation to reveal the original message. Draft images
remain local to their unsent draft and do not query historical media.

### Audio and video playback

`messenger.media-open CONVERSATION --path PATH` creates an operator-only, client-owned
preview for an existing employee/group file. It checks the scoped endpoint, regular-file
status, 2 GiB limit and a known media-container header. The response has an opaque `id`,
name, kind, MIME type, byte size, file version and expiry. It contains no Core control token,
provider credential or absolute host path. Preview IDs expire after eight hours; each
client has at most 64 live previews. Closing/disposal releases them earlier.

`messenger.media-info ID` revalidates the preview, workspace identity and file version.
`messenger.media-read ID --offset N` returns at most 256 KiB. `messenger.media-close ID`
revokes further reads. These APIs never infer, send messages or acknowledge replies.
A changed/deleted workspace or changed file fails explicitly; previews never retarget
another host or file silently. Playback depends on the client decoder; a recognized
container is not a promise that every codec will play on every platform.

Browsers use authenticated `GET/HEAD /api/media/ID?client=CLIENT_ID`. Cookie previews are
bound to the issuing Web session and client; normal Host/Origin checks remain. The route
supports single byte ranges, suffix/open-ended ranges, `206`, `416`, and backpressure.
HEAD returns metadata without bytes. Logout revokes active streams as well as later reads.
No control token is placed in a media URL. Desktop playback uses the registered
`agents-media://preview/ID` stream protocol and the same Core info/read operations, with
preview ownership bound to the trusted primary renderer. It does not start an HTTP server
or expose arbitrary filesystem paths. The custom scheme does not bypass CSP.

The UI uses actual native media decoding with lightweight previews, play/pause, seek,
volume/mute, speed and video fullscreen controls. Paused previews outside the view release
their source and retain their local resume position. Only one message player runs at a time.
The Media content filter includes photos and videos; the Audio filter lists audio files.
Files remains the complete attachment filter. Original file download remains available
when a decoder cannot play a file. No microphone/camera recording or voice/video calling
is implied by file playback.

### Client audio queue

Posted audio uses one client-owned playback element outside individual conversation views.
The mini player and inline controls share that element, so switching Messages/Company/Plan
or opening another conversation does not restart playback. Queueing, choosing next,
reordering/removing, repeat and source navigation are presentation actions over existing
public attachment references. They never create a task or another message. Each selected
file still opens through media-open and uses its existing authenticated Core read grant.
The queue is local to the current window/tab and is not persisted or shared with another
client. Reload/quit starts silent; logout clears buffered playback and queue state.

Draft audio and inline video retain their own local previews. A shared play-intent signal
prevents their late reads from stealing playback after a newer user choice. Starting video
or draft audio pauses the background player. Explicit source navigation uses the original
conversation/message ID. Media Session controls are registered only while audio owns the
session, when the client supports those actions.

## Group and channel workspaces

Full API and worked examples: [Conversation workspaces](Infra/src/docs/CONVERSATION_WORKSPACES.md),
also available through `agents api docs core/conversation-workspaces --json`.

`conversation.workspace {conversation,employee?}` and `conversation.workspaces {employee?}`
return stable named shared folders and member subfolders. `conversation.file` supports
list/read/image/info/chunk/write/mkdir/move/trash/restore. All current members can read;
Agent mutations normally use their own member subtree. A current-member Company Secretary
can additionally maintain direct root files; Owner/Admin office alone cannot. Peer folders
remain read-only. These Core checks do not sandbox arbitrary same-account native tools.
`conversation.copy {from,to}` explicitly copies between a shared folder and the caller's
personal workspace, or into their named member folder; it does not overwrite destinations.
`conversation.transfer {id,cancel?}` reports/cancels only the caller's copy.

New attachments use `@workspace/relative-path`; completed uploads are shared immediately,
and pressing Send notifies the members. Renaming a conversation or employee does not move
an existing workspace. The API returns the stable actual path. Old group attachments
remain at their original locations and stay readable through `chat.file`.

Messages has one **Archived chats** entry for employees, groups and channels, with direct
Restore controls. Archive/restore uses `messenger.conversation` with `patch.archived`, and
does not alter files, memberships, histories or read receipts. Only Company displays the
labelled Add Team and Add Employee controls. Employee work pages can browse both their
personal Workspace and joined group/channel member folders without changing native identity.

## Plan automation and channel schedules

Employee work explicitly scheduled in Plan uses the same Core `schedule.*` records for time, recurrence and event rules. Message fixed-text notices and per-member article-count prompts use their own APIs described below; they do not create Plan records. All roles may schedule themselves; other targets must be strictly lower roles within their existing Team/global management scope. No Agent can schedule another peer or a superior, including Secretary peers. The user can edit all plans. The complete contract is in PLAN.md and SCHEDULER.md.

`action.channelId` associates an employee publishing task with a channel whose membership is rechecked at execution. Channel settings reuse the full Plan editor and show current jobs from `plan.query {filter:{channel:CHANNEL_ID}}`; editing retains the same job ID and supports revision checks. An unconfigured employee channel does not silently create or start jobs.

`rule:{kind:"event",event:"signal"|"channel.posted",channelId?,cooldownSeconds?}` uses the existing executor, run history and occurrence quota. `channelId` is required only for channel.posted; signal rules instead accept `schedule.trigger {id,eventId}`. CLI: `agents schedule create --employee self --name NAME --prompt TEXT --on-event signal --cooldown-seconds 60`, then `agents schedule trigger JOB_ID --event-id KEY`. Use `--on-event channel.posted --event-channel CHANNEL_ID` for actual new publications, and `--channel CHANNEL_ID` for a publishing destination. Native events cannot be forged through the signal API.

Event schedules wait with nextAt:null; Plan shows waiting, while calendar dates derive from real runs only. Claims use bounded persistent deduplication (last 256 event IDs plus retained runs). Paused, expired, cooldown and out-of-window events are ignored; busy accepted attempts are recorded as skipped, without a separate retry queue. Credential/role/channel revocation also affects events. See PLAN.md for exact source permissions and offline behavior.

## Mention editing and independent engine credentials

Group and channel mention pickers follow the current caret/selection, including middle-of-draft edits, full-width ＠ and IME completion. Choosing a member removes only the query before the caret, retains the suffix and restores insertion position. Recipients continue to use stable employee-ID chips and the existing chat/channel send APIs.

`engine.configure` stores Cline, Pi and Claude credentials independently. Cline/Pi use only their own saved key and provider URL: no fallback to Claude native settings or a globally inherited DeepSeek key. Their spawned environments exclude Anthropic/OpenAI credentials from other engines. Cline’s local compatibility relay pins upstream Bearer authentication to the configured Cline key; it does not forward a stale personal key. Claude retains its own configuration and does not import Cline/Pi keys. Empty key fields in the UI retain that engine’s existing key; API `apiKey:""` clears only the selected engine.


## Cloud documents and channel storage

An external channel may bind `engine.fileStorage: {hostId,directory}` to an existing
Cloud Hosts record and the collector's content-addressed media root. Its collector
configuration advertises `collectFiles:true`. The collector sends only
`channel.publish.files` metadata: `{id,name,mimeType,bytes,sha256,thumbnailMediaId?}`.
Original document bytes remain on the cloud host; paths are always derived as
`directory/SHA256_PREFIX/SHA256`, never supplied arbitrarily by the collector.
The existing validated image protocol handles optional document thumbnails.

```sh
agents channel file-download --post POST_ID --file FILE_ID --json
agents channel file-status --post POST_ID --file FILE_ID --json
agents conversation workspace channel:CHANNEL_ID --json
```

`channel.file-download {postId,fileId}` is human-only and starts an existing SSH
transfer into the channel's shared workspace. `channel.file-status` reports
not-downloaded/queued/running/completed/failed, byte progress and the saved relative
path. Wait for completed: acceptance is not completion. Files up to 2 GiB are
streamed in chunks; size and SHA-256 are verified before atomic commit. A conflicting
user filename is retained, and a new suffix is used. Repeated downloads reuse the
completed copy. The channel Files button opens the same storage interface as groups.

For document channels, cloud posts and files expire seven days after publication.
The worker automatically removes expired records and unreferenced file bytes.
Initial backfill is the last 48 hours. Ordinary channels retain their existing
48-hour policy. Saving a local post does not extend cloud cache lifetime. Documents
explicitly copied into the local channel workspace survive cloud expiration, post
deletion and Core restart. SSH failure never reads a same-named file on the Mac.


Telegram document publications may include `telegram: {groupId,views,subscriberCount,reactions}`
with original platform counts. Same-source document messages sharing groupId render
as one ordered album while retaining every original post ID and download/read scope.
Document thumbnails use original Telegram images; `thumbnailOrigin: generated` is a
first-page preview shown after the user downloads that PDF, with the red folded PDF
icon retained beforehand. No source filename, size, caption or publication time is replaced.

## Conversation governance and static notifications

Group offices use Owner / Admin / Member and are held by Agent employees. They are independent of Company managementRole. Admins may appoint/revoke other Admins; only Owner transfers ownership or dissolves a group. The human user retains recovery access without occupying an Agent office. Existing unowned groups require explicit assignment.

Use `conversation.policy` to discover current offices, moderation state, revision and allowedActions. `conversation.role/mute/silence` require the current expectedRevision. Company Secretary is not a substitute for a conversation Admin. Legacy chat.update/delete/mute enforce the same office boundary. Group-wide mute restricts Members; channel-wide mute restricts all publishers. Quiet mode keeps notice messages and unread state but suppresses the connected application's attention banner.

`conversation.notice-list/get/create/update/delete/preview/history` manage fixed-text notifications. They use a separate Core timer and conversation-notices.sqlite, never Plan schedules, employee work queues or model calls. Creation requires a stable clientRequestId and spec {name,text,publisherId,rule,enabled}; rule is once, interval or weekly (all weekdays gives daily). Updates and deletion require expectedRevision. The automatic published message has noticeId, occurrenceId, scheduledFor and silent metadata. Replaying a pending occurrence after restart cannot duplicate its message. Revoked creators or publishers disable future publication; recurring downtime does not produce a backlog.

Read [Conversation controls](Infra/src/docs/CONVERSATION_CONTROLS.md) or `agents api docs core/conversation-controls` for the role matrix, exact schemas, quiet/mute distinction, creator/publisher constraints, timezone and recovery behavior. Explicit Plan schedules use `schedule.*`. Channel post-count Agent work uses its own `channel.post-trigger-*` contract below; a static fixed-text notice never substitutes for either form of Agent execution.

## Message collaboration: offices, workspaces, files and post-count prompts

The current contract is [MESSAGE_COLLABORATION.md](Infra/src/docs/MESSAGE_COLLABORATION.md), available through `agents api docs core/message-collaboration`. Both groups and channels distinguish Owner/Admin/Member. `conversation.member` adds/removes membership; `conversation.role` changes an office without treating demotion as removal. `conversation.audit` returns real governance actors and revision-protected actions.

`workspace.catalog` lists an Agent's Company workspace and all joined Message member workspaces with exact paths and access, without prescribing task placement. Members edit their own first-level named subtree. A current-member Company Secretary can additionally maintain direct root files; other conversation offices do not grant this exception, and peer folders remain read-only.

`conversation.entry` returns complete stored public text, links, media and documents. `conversation.download` copies an attachment into a selected own workspace; `conversation.download-status` reports actual progress and committed paths. Stable request keys deduplicate unchanged attempts, and staging plus size/SHA checks preserve originals and existing files.

Three automation contracts stay separate: `conversation.notice-*` posts timed literal text without Agent work; `channel.post-trigger-*` counts new article IDs independently for each member and executes its saved prompt on an exact batch; `schedule.*`/`plan.*` manage Plan schedules. Neither Message capability creates a Plan record. A saved count rule replaces that Agent's per-post automatic reading, including while paused; removing it restores ordinary per-post awareness. Each rule has an editable prompt, threshold, enabled state, configuration revision, progress and actual batch history.

## File library and storage information

`assets.browse` provides paged workspace shelves, folder navigation and recursive file/folder search, filtered by view, Team, employee, conversation, storage host, file type or storage class. `assets.info` explicitly returns physical location, host metadata, logical ownership and verification state. `assets.preview` derives a bounded cover from a local file or already-cached publication thumbnail; it never downloads remote originals. All three are user asset operations and do not broaden Agent workspace access. GUI actions reuse the same Core and existing file mutation APIs. Full interaction, limits and CLI examples: [FILES_WORKBENCH.md](Infra/src/docs/FILES_WORKBENCH.md).

<!-- BEGIN GENERATED CLI COMMAND INDEX -->
## 全部 CLI 命令索引

下面 344 项来自共享协议 `Infra/src/shared/api-registry.ts`。命令名中的句点在终端中写成空格；每项都可附加 `--json`。参数、返回值和限制见上文对应章节。

| 命令 | 参数 | 作用 | 对应界面 | 授权策略 |
| --- | --- | --- | --- | --- |
| <code>agents view load-engine</code> | <code>ENGINE_ID</code> | Load one installed Engine for this client; clear unrelated open panels without executing its workflow | Engine library load dock | operator |
| <code>agents view launcher</code> | <code>—</code> | Return to the Engine library; no Infra or Engine page is visible until another explicit load | Engine library Home | operator |
| <code>agents infra scope</code> | <code>[--engine-id ID] [--available]</code> | User-only: inspect current Engine associations; available explicitly opens the resource linking catalog | Linked resources | operator |
| <code>agents infra bind</code> | <code>--resources JSON [--engine-id ID] [--expected-revision N]</code> | User-only: explicitly link existing resources to an Engine without cloning them or granting Agent authority | Link existing resources | operator |
| <code>agents infra unbind</code> | <code>--resources JSON [--engine-id ID] [--expected-revision N]</code> | User-only: unlink resources from an Engine; files, employees and history are retained | Unlink Engine resources | operator |
| <code>agents contract info</code> | <code>—</code> | Read the independent Engine/Infra protocol version and capability boundaries | Engine layer | identity |
| <code>agents contract describe</code> | <code>[--version 1.0.0] [--command NAME] [--domain DOMAIN]</code> | Discover versioned Engine-facing capabilities; does not grant caller permissions | Engine capability discovery | identity |
| <code>agents contract call</code> | <code>--version 1.0.0 --command NAME [--args JSON]</code> | Invoke a declared Engine-facing capability as the unchanged authenticated caller | Engine workflow | identity |
| <code>agents contract engines</code> | <code>—</code> | List installed source Engine manifests without executing them | Engine catalog | identity |
| <code>agents view layer</code> | <code>engine&#124;infra [--engine ID]</code> | Select the application layer while retaining the Infra view and client-owned state | Engine / Infra | operator |
| <code>agents infra api</code> | <code>[--domain company&#124;messages&#124;plan&#124;files&#124;runtime] [--command NAME]</code> | Read employee collaboration and visualization APIs for Infra only, excluding plugin APIs | Infra API reference | identity |
| <code>agents workflow start</code> | <code>--engine-id ID --input JSON --client-request-id ID</code> | Start an installed Engine workflow durably as the authenticated caller; same request ID never creates a second job | Engine workflows | operator |
| <code>agents workflow list</code> | <code>[--engine-id ID]</code> | Read the caller-owned workflow summaries without exposing private runtime checkpoints | Engine workflows | operator |
| <code>agents workflow get</code> | <code>ID [--if-revision N]</code> | Read durable status and final files, or unchanged:true at the supplied revision; never runs or acknowledges a task | Engine workflows | operator |
| <code>agents workflow events</code> | <code>ID [--after-revision N] [--limit N]</code> | Read a bounded, owner-authorized history of public workflow status, phase, progress and source counts without exposing prompts or evidence | Engine workflows | operator |
| <code>agents workflow respond</code> | <code>ID --expected-revision N --answer JSON --client-request-id ID</code> | Answer the current clarification checkpoint exactly once; stale answers cannot change a later round | Engine workflows | operator |
| <code>agents workflow resume</code> | <code>ID --expected-revision N --client-request-id ID</code> | Explicitly resume a failed or paused Engine from its saved checkpoint, preserving completed steps and identities | Engine workflows | operator |
| <code>agents workflow pause</code> | <code>ID</code> | Pause a supported Engine and stop only its owned native tasks; preserve evidence and wait for explicit resume | Engine workflows | operator |
| <code>agents workflow amend</code> | <code>ID --expected-revision N --update JSON --client-request-id ID</code> | Apply an Engine-validated revision to a fully paused workflow; never starts work or overwrites completed deliverables | Engine workflows | operator |
| <code>agents workflow cancel</code> | <code>ID</code> | Cancel this workflow and its exact owned pending tasks; never interrupts unrelated employee work | Engine workflows | operator |
| <code>agents workflow file</code> | <code>ID --name FILE</code> | Read one hash-verified final deliverable from a completed workflow; intermediate files are not downloadable | Engine workflows | operator |
| <code>agents plan schema</code> | <code>—</code> | Discover all ten layouts, fields, policies, authorized targets and mutation APIs | Plan database | schedule |
| <code>agents plan query</code> | <code>[--filter JSON&#124;@file --sort nextAt&#124;name&#124;updatedAt&#124;priority --direction asc&#124;desc --offset N --limit N]</code> | Find real task IDs/revisions, assigned people/roles/Teams, complete rules/times and allowedActions; includes removed-target records for Secretary | Plan database | schedule |
| <code>agents plan calendar</code> | <code>--from ISO --to ISO [--timezone IANA --filter JSON&#124;@file --limit N]</code> | Return bounded future occurrences and recorded runs in a maximum 93-day range | Plan database | schedule |
| <code>agents plan timeline</code> | <code>--from ISO --to ISO [--timezone IANA --filter JSON&#124;@file --limit N]</code> | Project forecast estimates and actual/ongoing run spans, including overlaps; no inferred duration from timeout | Plan database | schedule |
| <code>agents plan analytics</code> | <code>[--metric schedules&#124;runs --group-by status&#124;employee&#124;team&#124;priority --filter JSON --outcomes JSON --from ISO --to ISO]</code> | Aggregate the complete authorized data set, never just the current UI page; explicitly distinguish schedules and retained runs | Plan database | schedule |
| <code>agents plan feed</code> | <code>[--filter JSON --outcomes JSON --from ISO --to ISO --before CURSOR --limit N]</code> | Read actual retained execution activity with stable cursor pagination, including removed schedules when authorized | Plan database | schedule |
| <code>agents plan views</code> | <code>—</code> | List built-in and authorized saved views; Secretary administers user-created views | Plan database | schedule |
| <code>agents plan view-create</code> | <code>--spec JSON&#124;@file</code> | Save any of ten database layouts with filters, sorting, grouping and presentation options | Plan database | schedule |
| <code>agents plan view-update</code> | <code>ID --patch JSON&#124;@file [--expected-revision N]</code> | Update an authorized saved view without changing schedules; options are a complete replacement object | Plan database | schedule |
| <code>agents plan view-delete</code> | <code>ID [--expected-revision N]</code> | Remove an authorized saved view only; schedules and histories remain | Plan database | schedule |
| <code>agents channel file-download</code> | <code>--post POST_ID --file FILE_ID</code> | User-only: copy a cloud document into this channel shared workspace, with SHA-256 verification; cloud cache retention never removes the local copy | Download to channel | operator |
| <code>agents channel file-status</code> | <code>--post POST_ID --file FILE_ID</code> | Read cloud-to-channel download progress and the saved relative workspace path; never starts a download | Channel document progress | operator |
| <code>agents channel connection</code> | <code>ID</code> | Read configured process origin, receiver URL, source IDs and last authenticated contact; saving configuration never claims a live connection | Channel connection | operator |
| <code>agents channel avatar-image</code> | <code>ID</code> | User or Secretary: read the independently retained custom channel avatar | Channel avatar | operator |
| <code>agents channel read-state</code> | <code>ID --entries JSON</code> | User or Secretary: read personal reading state for retained channel entries; does not acknowledge or execute anything | Channel unread state | operator |
| <code>agents channel acknowledge</code> | <code>ID (--entries JSON &#124; --all [--source SOURCE_ID])</code> | User-only: mark specific visible entries or explicitly mark all current unread channel entries read, independently of Agent delivery receipts | Channel user reading | operator |
| <code>agents channel timeline</code> | <code>ID [--kind all&#124;news&#124;message] [--before-entry ID] [--cursor CURSOR] [--limit N]</code> | Read retained channel news and discussion with full content; choose 1–100 entries and paginate older history. Current members may read their channels; no read receipts or model calls. | Channel history | chat |
| <code>agents channel history</code> | <code>ID [--before N] [--around ID] [--limit N]</code> | Discussion messages only, excluding news. Use channel.timeline for the visible news feed or mixed history. | Channel discussion | chat |
| <code>agents channel context</code> | <code>ID [--entry ID]</code> | Read retained news or discussion context within a current channel membership | Channel discussion | chat |
| <code>agents channel message-send</code> | <code>ID [--text TEXT] [--file PATH] [--images JSON] [--files JSON] [--mentions JSON&#124;all] [--reply-to ID] [--client-message-id ID]</code> | User or Secretary: share a channel message with all current members and assign work to its dialogue targets | Channel composer | operator |
| <code>agents channel message-post</code> | <code>ID [--text TEXT] [--file PATH] [--images JSON] [--files JSON] [--reply-to ID] [--kind summary&#124;decision&#124;blocker&#124;question&#124;result] [--client-message-id ID]</code> | Deliberately publish a nonempty reply within a received user or Secretary discussion; no acknowledgment call is needed | Channel replies | chat |
| <code>agents channel source-avatar-put</code> | <code>--data JSON&#124;@file</code> | Submit a source-scoped identity image using the collector capability; this grants no message or membership permissions | Channel source identity | operator |
| <code>agents channel source-image</code> | <code>SOURCE_ID</code> | User or Secretary: read the original independently retained source avatar bytes | Channel avatar | operator |
| <code>agents channel settings</code> | <code>[--patch JSON]</code> | User or Secretary: read or configure the local collector listener; disabled by default | News channel connection | operator |
| <code>agents channel list</code> | <code>—</code> | List your current channel memberships; the user additionally receives retained-item summaries | News channels | chat |
| <code>agents channel get</code> | <code>ID</code> | Read one channel identity as the user or a current member without scanning news histories | News channels | chat |
| <code>agents channel sources</code> | <code>[--channel ID] [--plugin telegram&#124;x&#124;youtube] [--include-disabled]</code> | User or Secretary: list authoritative subscriptions, routes and retained author avatars | News subscriptions | operator |
| <code>agents channel create</code> | <code>--name NAME --engine JSON [--avatar JSON&#124;@file]</code> | User or Secretary: explicitly choose employee or external-process publishing; an issued collector token is returned once in setup | Channel publishing engine | operator |
| <code>agents channel update</code> | <code>ID [--name NAME] [--admins JSON] [--engine JSON] [--avatar JSON&#124;null] [--expected-revision N]</code> | Update channel identity, publishing membership or external connection without changing company roles or engine type; null avatar restores the default | Channel settings | operator |
| <code>agents channel source-add</code> | <code>--data JSON&#124;@file</code> | User or Secretary: follow a source; Telegram creates a one-to-one channel, X/YouTube default to aggregators | News subscriptions | operator |
| <code>agents channel source-update</code> | <code>ID --patch JSON&#124;@file</code> | User or Secretary: change source settings or route all retained news, including saved items | News subscriptions | operator |
| <code>agents channel source-remove</code> | <code>ID</code> | User or Secretary: unfollow a source while retaining its identity and saved news | News subscriptions | operator |
| <code>agents channel posts</code> | <code>[--channel ID] [--source ID] [--saved] [--query TEXT] [--cursor CURSOR] [--limit N]</code> | User or Secretary: page current news and permanent saved items with stable item identities | News feed | operator |
| <code>agents channel post</code> | <code>POST_ID</code> | User or Secretary: read a retained news item with current channel routing | News detail | chat |
| <code>agents channel save</code> | <code>POST_ID on&#124;off</code> | User or Secretary: retain a news item and its local images permanently, or resume its original expiry | Saved news | operator |
| <code>agents channel delete</code> | <code>POST_ID</code> | User or Secretary: delete local news and images with bounded replay protection | News deletion | operator |
| <code>agents channel image</code> | <code>CHANNEL_ID --post POST_ID --media MEDIA_ID</code> | User or Secretary: read a published local news image, never staging or arbitrary URLs | News images | chat |
| <code>agents channel export</code> | <code>POST_ID</code> | User or Secretary: export a retained news article and original local images | News download | operator |
| <code>agents channel collector-add</code> | <code>--name NAME [--sources JSON&#124;all &#124; --channel ID]</code> | Issue a source-scoped credential or bind a replacement process credential to an external channel; plaintext is returned once | News collector connection | operator |
| <code>agents channel collectors</code> | <code>—</code> | User or Secretary: list collector metadata without tokens or token hashes | News collector connection | operator |
| <code>agents channel collector-revoke</code> | <code>ID</code> | User or Secretary: revoke a news collector credential | News collector connection | operator |
| <code>agents channel collector-config</code> | <code>[--since-revision N]</code> | Read authoritative collector targets; external access requires the dedicated channel capability | Collector protocol | operator |
| <code>agents channel media-put</code> | <code>--data JSON&#124;@file</code> | Upload an item-scoped image: employee publishers use channelId, external collectors use sourceId; the authenticated employee identity is enforced | Channel publishing | chat |
| <code>agents channel publish</code> | <code>--data JSON&#124;@file</code> | Publish an article using a current employee channelId or an external sourceId. Scheduled employees may publish without a discussion parent; identity, deduplication and retention remain enforced | Channel publishing | chat |
| <code>agents messenger profile</code> | <code>[--avatar ID&#124;null &#124; --image JSON&#124;@file]</code> | User-only: upload a personal image, choose an avatar.list ID or reset with null; author identity stays unchanged | Your message avatar | operator |
| <code>agents messenger profile-image</code> | <code>--sha256 HASH</code> | User-only: read the current personal avatar image at its exact saved revision | Your message avatar | operator |
| <code>agents messenger directory</code> | <code>[--type all&#124;private&#124;groups&#124;channels&#124;telegram&#124;x&#124;youtube] [--query TEXT] [--folder ID] [--archived exclude&#124;only&#124;include] [--offset N] [--limit N]</code> | User or Secretary: search current worker/group/channel/social identities and dynamic categories; no message bodies, read receipts or execution | Message type filtering | operator |
| <code>agents messenger social</code> | <code>[--platform telegram&#124;x&#124;youtube] [--include-disabled]</code> | User or Secretary: list each social element with stable source ID, parent channel, latest publication and per-source unread count; no reads acknowledged | Social category picker | operator |
| <code>agents messenger reorder</code> | <code>SCOPE --order JSON&#124;null [--expected-order JSON]</code> | User or Secretary: persist category or mixed conversation positions in categories/all/favorites/archive/a folder ID; null restores automatic order, unrelated drafts and hidden positions remain unchanged | Message drag ordering | operator |
| <code>agents messenger media-open</code> | <code>CONVERSATION --path PATH</code> | User-only: open a client-scoped audio/video preview with a bounded lifetime; no inference | Media playback | operator |
| <code>agents messenger media-info</code> | <code>ID</code> | User-only: validate the owned media preview and file version | Media playback | operator |
| <code>agents messenger media-read</code> | <code>ID --offset N</code> | User-only: read at most 256 KiB from an owned media preview at a validated offset | Media playback | operator |
| <code>agents messenger media-close</code> | <code>ID</code> | User-only: release a media preview and stop future reads | Media playback | operator |
| <code>agents messenger gallery</code> | <code>[--conversation REF] [--anchor JSON] [--direction around&#124;before&#124;after&#124;first&#124;last] [--through JSON] [--query TEXT] [--author all&#124;you&#124;employee] [--order oldest&#124;newest] [--limit N]</code> | User or Secretary: page full public image history around stable source cursors, without reading image bytes or acknowledging messages | Historical image gallery | operator |
| <code>agents messenger upload-begin</code> | <code>CONVERSATION --name NAME --bytes N</code> | User-only: allocate a unique conversation attachment and begin a chunked upload | Message attachments | operator |
| <code>agents messenger reference</code> | <code>CONVERSATION MESSAGE_ID [--quote JSON] [--text-only]</code> | User-only: resolve a public cross-conversation reference without sending, opening an engine or acknowledging a message | Reply destination preview | operator |
| <code>agents messenger forward</code> | <code>--messages JSON --to REF --client-message-id ID [--comment TEXT] [--text-only] [--retry]</code> | User-only: deliberately forward selected public messages through existing Core send/queue paths, with durable retry protection | Message forwarding | operator |
| <code>agents messenger forward-draft</code> | <code>--data JSON&#124;null [--expected-client-message-id ID]</code> | User-only: retain or discard one forwarding setup; discarding never cancels accepted work | Resume forwarding | operator |
| <code>agents messenger forward-status</code> | <code>--client-message-id ID</code> | User-only: check a forwarding receipt without sending, reading sources or starting work | Forwarding result | operator |
| <code>agents messenger state</code> | <code>—</code> | User or Secretary: read persisted conversation preferences, saved messages, reactions and drafts | Messages organization | operator |
| <code>agents messenger folder-save</code> | <code>--name NAME --conversations JSON [--include private&#124;groups&#124;telegram&#124;x&#124;youtube&#124;null] [--excluded JSON] [--id ID] [--expected-revision N]</code> | User or Secretary: create or update a personal folder of private, group and channel conversations without moving their content | Conversation folders | operator |
| <code>agents messenger folder-delete</code> | <code>ID [--expected-revision N]</code> | User or Secretary: remove a personal conversation folder while retaining every conversation and message | Conversation folders | operator |
| <code>agents messenger conversation</code> | <code>--conversations JSON --patch JSON</code> | User or Secretary: pin, favorite, archive or mark conversations unread in one atomic update | Messages list and bulk actions | operator |
| <code>agents messenger message</code> | <code>CONVERSATION [MESSAGE_ID &#124; --ids JSON] --patch JSON</code> | User or Secretary: save, pin, react to or hide an existing public message; native history stays intact | Messages actions | operator |
| <code>agents messenger draft</code> | <code>CONVERSATION --data JSON</code> | User or Secretary: persist a draft and its send identity, or conditionally clear the matching draft; never sends or opens an engine | Messages composer | operator |
| <code>agents messenger search</code> | <code>[--conversation REF] [--query TEXT] [--filter all&#124;saved&#124;pinned&#124;media&#124;audio&#124;files&#124;links] [--author all&#124;you&#124;employee] [--offset N] [--limit N]</code> | User or Secretary: search full public histories and saved/media/link references without inference or read acknowledgements | Messages search and shared content | operator |
| <code>agents assets browse</code> | <code>[--root ID --query TEXT --view Company&#124;Messages&#124;Plan --team NAME --employee ID --conversation REF --host ID --kind TYPE --storage local&#124;remote&#124;cloud --sort name&#124;modified&#124;size --offset N --limit N --hidden]</code> | User-only: page real workspace shelves, one folder or recursive file/folder search with stable IDs and ownership; no implicit cloud download | File library | workspace |
| <code>agents assets info</code> | <code>ID</code> | User-only: explicitly inspect a file/folder physical path, storage host, metadata and logical ownership. Cloud-only items return metadata without downloading originals. | Get Info | workspace |
| <code>agents assets preview</code> | <code>ID</code> | User-only: derive a bounded local PDF, article or image cover with the installed Reader renderer; never fetch remote originals or mutate files | Document cover | workspace |
| <code>agents assets naming</code> | <code>[--id PREVIEW_ID --apply]</code> | User-only: preview or apply English directory names across managed and externally bound workspaces, retaining identities and legacy references | English folder names | operator |
| <code>agents assets tree</code> | <code>[--view Company&#124;Messages&#124;Plan] [--team NAME] [--employee ID] [--conversation REF]</code> | User-only: read the fixed Company, Messages and Plan workspace tree | Files and assets | workspace |
| <code>agents assets children</code> | <code>ID [--hidden] [--offset N] [--limit N]</code> | User-only: lazily page one real directory and its direct nonempty-folder count | Files and assets tree | workspace |
| <code>agents assets search</code> | <code>[--query TEXT] [--root ID] [--offset N] [--limit N] [--hidden] [--refresh] [--view Company&#124;Messages&#124;Plan] [--team NAME] [--employee ID] [--conversation REF] [--kind TYPE] [--storage local&#124;remote&#124;cloud] [--sort name&#124;modified&#124;size]</code> | User-only: page background-indexed files with their Team, employee, group or channel ownership | Asset list | workspace |
| <code>agents assets locate</code> | <code>ID</code> | User-only: resolve a current asset, its parent workspace and human-readable breadcrumbs without opening Finder or downloading cloud documents | Show in folder | workspace |
| <code>agents assets file</code> | <code>ID --operation list&#124;read&#124;image&#124;info&#124;chunk&#124;write&#124;mkdir&#124;move&#124;trash&#124;restore [--path PATH] [--to PATH] [--content TEXT] [--hash HASH] [--create] [--hidden] [--offset N] [--trash-id ID]</code> | User-only: use existing workspace operations without changing scope or member permissions | Asset file editor | workspace |
| <code>agents conversation workspace</code> | <code>CONVERSATION [--employee ID]</code> | Read the shared folder and named member workspaces; members may read all shared files but write only their own subfolder | Group / channel workspace | chat |
| <code>agents conversation workspaces</code> | <code>[--employee ID]</code> | List an employee’s group/channel workspaces without changing their personal workspace or execution host | Employee workspace selector | chat |
| <code>agents conversation file</code> | <code>CONVERSATION --operation list&#124;read&#124;image&#124;info&#124;chunk&#124;write&#124;mkdir&#124;move&#124;trash&#124;restore [--path PATH] [--to PATH] [--content TEXT] [--hash HASH] [--create] [--hidden] [--offset N] [--id TRASH_ID]</code> | Operate shared files with current membership checks; own member folder is writable; only a member Secretary may modify direct root files; peer folders are read-only | Shared file browser | chat |
| <code>agents conversation copy</code> | <code>--from JSON --to JSON</code> | Copy a shared file/folder to your named member folder or personal workspace; source is retained and existing destinations are never overwritten | Shared workspace copy | chat |
| <code>agents conversation transfer</code> | <code>ID [--cancel]</code> | Read or cancel your shared-workspace copy; queued is not completed, and a restart does not replay copies | Shared workspace copy progress | chat |
| <code>agents conversation member</code> | <code>CONVERSATION --employee ID --action add&#124;remove --expected-revision N</code> | Owner/Admin adds an Agent as Member or removes membership without deleting the employee or files; transfer Owner first | Conversation members | chat |
| <code>agents conversation audit</code> | <code>CONVERSATION [--before ID --limit N]</code> | Owner/Admin reads paged governance events with the actual actor, action and time; no private model traces | Conversation audit history | chat |
| <code>agents conversation policy</code> | <code>CONVERSATION</code> | Read independent Owner/Admin/Member offices, moderation state and allowed actions; Company rank grants no conversation office | Conversation administration | chat |
| <code>agents conversation role</code> | <code>CONVERSATION --employee ID --role owner&#124;admin&#124;member --expected-revision N</code> | Owner/Admin may appoint or revoke Admins; only Owner transfers ownership. Member demotes an Admin without removing membership; use conversation.member to remove. Owner exists in both groups and channels. | Conversation roles | chat |
| <code>agents conversation mute</code> | <code>CONVERSATION --member ID&#124;all --muted true&#124;false [--duration-seconds N] --expected-revision N</code> | Owner/Admin changes public posting restrictions; all restricts Member posting in groups, all publishers in channels. Never changes Company work permissions. | Conversation moderation | chat |
| <code>agents conversation silence</code> | <code>CONVERSATION --silent true&#124;false --expected-revision N</code> | Owner/Admin enables quiet conversation notices: messages remain in history, but no notice attention banner is raised; not member posting mute | Quiet notices | chat |
| <code>agents conversation notice-list</code> | <code>CONVERSATION [--offset N --limit N]</code> | Owner/Admin lists independent static notifications; these IDs never belong to Plan | Conversation notifications | chat |
| <code>agents conversation notice-get</code> | <code>CONVERSATION --id ID</code> | Read one notification rule, saved text, publishing identity and next occurrence; no model work | Notification details | chat |
| <code>agents conversation notice-create</code> | <code>CONVERSATION --spec JSON&#124;@file --client-request-id ID</code> | Owner/Admin creates an idempotent static notice. Required spec: name, text, publisherId, rule, enabled. Once/interval/weekly (all days=daily), independent of Plan. | New notification | chat |
| <code>agents conversation notice-update</code> | <code>CONVERSATION --id ID --patch JSON&#124;@file --expected-revision N</code> | Edit text/rule/publisher or pause/resume with enabled. Rechecks conversation authority; no Plan or employee queue edits. | Edit or pause notification | chat |
| <code>agents conversation notice-delete</code> | <code>CONVERSATION --id ID --expected-revision N</code> | Remove an independent notification and cancel pending occurrences; published messages and audit history remain | Delete notification | chat |
| <code>agents conversation notice-preview</code> | <code>CONVERSATION --rule JSON&#124;@file [--from ISO]</code> | Read the next five notice occurrences in the stated timezone. No notification, agent or Plan task is created. | Notification preview | chat |
| <code>agents conversation notice-history</code> | <code>CONVERSATION [--id ID --limit N --offset N]</code> | Read bounded static notice publication/skipped/cancelled history, including removed notices; no model logs or Plan history | Notification history | chat |
| <code>agents workspace catalog</code> | <code>[--employee ID&#124;self]</code> | List your Company workspace and every joined group/channel member workspace with exact paths, location, permissions and file API; does not choose a workspace or move files | Employee workspace selector | chat |
| <code>agents conversation entry</code> | <code>CONVERSATION --id ENTRY_ID</code> | Read a complete published group message, channel message or post: text, links, replies, media and downloadable document descriptors; current membership required | Published content and files | chat |
| <code>agents conversation download</code> | <code>CONVERSATION --entry-id ID --attachment-id ID --client-request-id KEY [--workspace WORKSPACE_ID --employee ID --path DIR --name FILENAME]</code> | Copy one published attachment into your own Company or joined Message member workspace; defaults to this conversation’s member workspace. Streams documents/images with integrity checks, never writes shared originals or overwrites files. | Download to employee workspace | chat |
| <code>agents conversation download-status</code> | <code>ID [--cancel]</code> | Read your attachment copy progress, final path or failure; cancel affects only your copy. Restart never blindly replays interrupted downloads. | Attachment copy progress | chat |
| <code>agents channel post-trigger-list</code> | <code>CHANNEL_ID</code> | Read per-Agent post-count rules and progress. Owner/Admin sees all; Members see their own rule. Independent of Plan and static timed notices. | Channel post-count rules | chat |
| <code>agents channel post-trigger-set</code> | <code>CHANNEL_ID --employee ID --every-posts N --prompt TEXT --enabled true&#124;false --expected-revision N</code> | Owner/Admin explicitly enables a saved prompt for one channel member every N newly accepted posts. Revision 0 creates; edits reset only this member’s counter. No Plan record; may invoke the selected Agent. | Per-Agent post-count editor | chat |
| <code>agents channel post-trigger-remove</code> | <code>CHANNEL_ID --employee ID --expected-revision N</code> | Remove one post-count configuration and cancel its unstarted batches. Existing results and batch history remain; ordinary channel awareness resumes. | Remove post-count rule | chat |
| <code>agents channel post-trigger-history</code> | <code>CHANNEL_ID [--employee ID --offset N --limit N]</code> | Read counted batches and actual queued/running/completed/failed states, exact batch IDs and message references. Never reports a queued task as a completed summary. | Channel batch history | chat |
| <code>agents channel post-trigger-batch</code> | <code>CHANNEL_ID --batch-id ID [--offset N --limit N]</code> | Read the exact counted batch with paged complete posts and explicit unavailable entries; no approximate latest-N window, model call or user-read acknowledgment | Batch source posts | chat |
| <code>agents card profile</code> | <code>ID [--offset N] [--limit N]</code> | Read employee identity, authorized memberships, named workspaces and paged Plan tasks without opening an engine or changing read receipts | Employee profile | employee.read |
| <code>agents view list</code> | <code>—</code> | List application views and their shared data contracts | Shared views / group conversations | operator |
| <code>agents view select</code> | <code>company&#124;messages&#124;plan [--team-view ID]</code> | Select a presentation mode; Messages resumes the last conversation for this client | Shared views / group conversations | operator |
| <code>agents chat list</code> | <code>—</code> | List groups for the current authenticated member | Shared views / group conversations | chat |
| <code>agents chat create</code> | <code>--name NAME [--team TEAM] [--members JSON] [--owner-id ID]</code> | Create a group with an Agent Owner; Agent creators own their group, user selects ownerId (defaults to first selected member) | Shared views / group conversations | chat |
| <code>agents chat update</code> | <code>ID --patch JSON</code> | Conversation Owner/Admin: edit group name and membership; Company role does not confer access | Shared views / group conversations | chat |
| <code>agents chat delete</code> | <code>ID</code> | Conversation Owner (or the human user) removes a group; Admin cannot dissolve it; employees and private history are retained | Shared views / group conversations | chat |
| <code>agents chat mute</code> | <code>ID --member EMPLOYEE_ID&#124;all [--for SECONDS &#124; --off]</code> | Conversation Owner/Admin: mute visible posts; Company rank grants no moderation; reading and work remain available | Group member moderation | chat |
| <code>agents chat get</code> | <code>ID</code> | Read group metadata and member identities | Shared views / group conversations | chat |
| <code>agents chat history</code> | <code>ID [--before SEQUENCE &#124; --around MESSAGE_ID] [--limit 50]</code> | Read published group messages with pagination | Shared views / group conversations | chat |
| <code>agents chat file</code> | <code>ID --path PATH [--operation info&#124;image&#124;read&#124;chunk] [--offset N]</code> | Read a published group attachment as an authenticated member | Group attachments | chat |
| <code>agents chat context</code> | <code>ID [--message ID]</code> | Read published group context and concise reporting policy | Shared views / group conversations | chat |
| <code>agents chat send</code> | <code>ID [--text TEXT] [--images JSON] [--files JSON] [--mentions JSON&#124;all] [--client-message-id ID] [--view ID] [--reply-to ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only]</code> | Deliver to current members; mentions and user replies select work, other recipients receive context | Shared views / group conversations | chat |
| <code>agents chat edit</code> | <code>ID --message MESSAGE_ID --text TEXT [--file PATH] --expected-revision N</code> | User-only: correct own published group text or caption without changing accepted tasks or receipts | Group message editing | operator |
| <code>agents chat post</code> | <code>ID [--text TEXT] [--images JSON] [--files JSON] [--kind summary&#124;decision&#124;blocker&#124;question&#124;result&#124;message] [--reply-to ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only] [--client-message-id ID]</code> | Publish a public group message to all current members | Shared views / group conversations | chat |
| <code>agents chat acknowledge</code> | <code>ID --message ID</code> | User-only: mark group messages read; private receipts remain separate | Shared views / group conversations | operator |
| <code>agents system info</code> | <code>—</code> | Read Core host OS, architecture and deployment capabilities | 后端信息 | identity |
| <code>agents system directories</code> | <code>[--path PATH]</code> | Browse directories on the Core host (user or Secretary) | 后端目录选择 | operator |
| <code>agents engine capabilities</code> | <code>--engine codex&#124;claude&#124;cline&#124;pi</code> | Read adapter capabilities, workspace modes and employee kinds before hiring; no credentials or inference | 创建员工能力检查 | identity |
| <code>agents engine list</code> | <code>—</code> | List registered Coding Agent adapters and public configuration | 引擎管理 | operator |
| <code>agents engine check</code> | <code>--engine ID [--team NAME] [--force]</code> | Check executable, protocol and authentication without inference | 引擎检测 | operator |
| <code>agents engine probe</code> | <code>--engine ID --confirm [--model ID]</code> | Explicit, potentially billed OK-only inference on the Core host; temporary workspace and 45s timeout | 引擎测试调用 | operator |
| <code>agents engine configure</code> | <code>--engine ID --data JSON&#124;@file</code> | Set an executable path, encrypted key, or Cline/Pi compatible baseUrl and exact model ID (user or Secretary) | 引擎配置 | operator |
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
| <code>agents transfer download-save</code> | <code>--from JSON --path PATH [--overwrite]</code> | User-only: stream a scoped download to a Core-host file, or choose a destination in the desktop | Save attachment | operator |
| <code>agents transfer download-info</code> | <code>--from JSON&#124;@file</code> | Read download size and version | 浏览器文件下载 | operator |
| <code>agents transfer download-chunk</code> | <code>--from JSON&#124;@file --offset N [--modified-at N]</code> | Read a bounded file chunk and reject a changed version | 浏览器文件下载 | operator |
| <code>agents auth whoami</code> | <code>—</code> | Read authenticated caller and management role | 管理与协同 | identity |
| <code>agents auth agent-token</code> | <code>ID</code> | Issue or read an employee API credential (user only) | 管理与协同 | operator |
| <code>agents auth revoke</code> | <code>ID</code> | Revoke employee API credentials (user only) | 管理与协同 | operator |
| <code>agents api list</code> | <code>[--prefix DOMAIN --search TEXT --all]</code> | Discover callable APIs by domain or keyword; all includes retired and permission-restricted metadata, never authority | 管理与协同 | identity |
| <code>agents api describe</code> | <code>COMMAND [--all]</code> | Read an API schema; --all includes commands outside the caller execution authority | 管理与协同 | identity |
| <code>agents api docs</code> | <code>[DOCUMENT &#124; --document DOCUMENT]</code> | Read the shared documentation index or a Core/plugin document; no execution authority is granted | 管理与协同 | identity |
| <code>agents avatar list</code> | <code>[--query NAME] [--style default&#124;anime&#124;chibi] [--all]</code> | Discover exact avatar IDs, character names, styles and aliases from the live picker catalog; no inference | 人物形象目录 | identity |
| <code>agents connector get</code> | <code>--manager ID --employee ID</code> | Read endpoint anchors and 24 availablePoints, including all four corners of the uniform employee frame | 连线端点 | layout.read |
| <code>agents connector set</code> | <code>--manager ID --employee ID [--source auto&#124;top&#124;right&#124;bottom&#124;left --source-offset 0.5] [--target auto&#124;top&#124;right&#124;bottom&#124;left --target-offset 0.5] [--points JSON&#124;@file &#124; --auto-route]</code> | Persist endpoint sides and offsets; does not create management authority or a relation | 点击人物周围点位 / 拖动端点吸附 | layout.write |
| <code>agents connector segment</code> | <code>--manager ID --employee ID --index N --x X --y Y</code> | Move an orthogonal segment in source-Team coordinates; preserve attached employees | 拖动任意折线段 | layout.write |
| <code>agents connector reset</code> | <code>--manager ID --employee ID</code> | Restore automatic source and head-top target routing | 恢复自动连接点 | layout.write |
| <code>agents office layout</code> | <code>[--team NAME] [--view VIEW_ID]</code> | Read authorized Team bounds, employee coordinates and permitted layout actions; no filesystem access | Agent 布局工具 | layout.read |
| <code>agents session acknowledge</code> | <code>--employee ID --reply-id ID</code> | User-only acknowledgement of the exact displayed reply; stale acknowledgements do not clear newer replies | 可见回复已读 | operator |
| <code>agents management relayout</code> | <code>--team NAME</code> | Group related employees and fit this Team without changing the viewport | 整理团队拓扑 | layout.write |
| <code>agents management topology</code> | <code>[--team NAME] [--teams-only] [--creator self&#124;others&#124;operator&#124;unknown&#124;EMPLOYEE_ID]</code> | Read teams with isOwnTeam, employeeCount, governorIds, allowedActions and deleteBlockedReason; employee nodes include creation provenance and allowedActions | 管理与协同 | topology |
| <code>agents management activity</code> | <code>[--team NAME]</code> | Read live communication and delegated tasks; highlighted is a maximum 600ms visual cue, not task completion | 管理交互连线 | topology |
| <code>agents management roles</code> | <code>—</code> | List employee-owned role policies: Employee, Manager and Governor, scopes and protected lifecycle rules | 职位权限 | identity |
| <code>agents management bind</code> | <code>--employee ID [--manager ID]</code> | Add one persistent source-to-employee arrow; multiple managers allowed; permissions, true createdBy and positions unchanged | 常驻有向连线 | relation |
| <code>agents management unbind</code> | <code>--employee ID [--manager ID] &#124; RELATION_ID</code> | Remove only the selected persistent arrow, including a creator line; does not revoke control or stop work; idempotent | 取消常驻连线 | relation |
| <code>agents management request</code> | <code>--employee ID [--manager ID]</code> | Deprecated permission request; use management.bind for a visual arrow without granting authority | 已停用的管理关系操作 | relation |
| <code>agents management decide</code> | <code>ID approve&#124;deny</code> | Deprecated permission approval; visual bindings need no approval workflow | 已停用的管理关系操作 | operator |
| <code>agents management team</code> | <code>—</code> | Deprecated discovery only; Team and folder membership no longer grant authority | 旧接口兼容 | operator |
| <code>agents management global</code> | <code>ID on&#124;off</code> | User or Secretary compatibility alias: assign Governor or demote to Manager; Secretary lifecycle remains user-only | 旧接口兼容 | operator |
| <code>agents card management-role</code> | <code>ID employee&#124;manager&#124;governor&#124;secretary</code> | Assign a role; Secretary administers the app and lower roles, only the user appoints or removes Secretaries | 管理与协同 | operator |
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
| <code>agents schedule list</code> | <code>[--employee ID --source NAMESPACE]</code> | Read raw saved schedules, including orphan records for application administrators; prefer plan.query for people, times and capabilities | Plan database | schedule |
| <code>agents schedule get</code> | <code>ID</code> | Read the exact saved configuration and revision, even when its employee was removed; discover IDs through plan.query | Plan task editor | schedule |
| <code>agents schedule create</code> | <code>--spec @file.json &#124; --name NAME --employee ID&#124;self --prompt TEXT (--after-seconds N &#124; --at ISO &#124; --time HH:mm &#124; --every-seconds N &#124; --on-event signal&#124;channel.posted) [--enabled true&#124;false&#124;on&#124;off &#124; --paused] [--view VIEW_ID --days 7 --timezone IANA --month-day last --max-occurrences N --client-request-id KEY --duration-minutes N --channel ID --event-channel ID --cooldown-seconds N]</code> | Schedule an existing employee or yourself; enabled by default; --paused or --enabled false disables automatic runs; Governor requires --view; retry-safe clientRequestId | Plan task editor | schedule |
| <code>agents schedule update</code> | <code>ID --patch @file.json [--expected-revision N]</code> | Update an idle schedule; full action/rule replacement, optional revision; retains execution count | Plan task editor | schedule |
| <code>agents schedule pause</code> | <code>ID [--expected-revision N]</code> | Pause future triggers without stopping the current run | Plan task editor | schedule |
| <code>agents schedule resume</code> | <code>ID [--expected-revision N]</code> | Resume future triggers after rechecking the current target and original delegation | Plan task editor | schedule |
| <code>agents schedule delete</code> | <code>[ID &#124; --ids JSON] [--expected-revision N &#124; --expected-revisions JSON]</code> | Delete selected schedules, including orphaned records for Secretary; preflight all IDs and revisions before any cancellation; retain run history | Plan task editor | schedule |
| <code>agents schedule preview</code> | <code>[ID [--patch JSON&#124;@file] &#124; --spec @file.json] [--after ISO --count N]</code> | Preview saved or draft occurrences without executing; a saved job retains its consumed quota | Plan preview | schedule |
| <code>agents schedule run</code> | <code>ID [--expected-revision N]</code> | Run once now; may use a model, does not consume the next occurrence | Plan task editor | schedule |
| <code>agents schedule history</code> | <code>[ID] [--employee ID --limit N]</code> | Read durable run and job IDs, exact execution times and outcomes; deletion preserves authorized history | Plan execution history | schedule |
| <code>agents schedule trigger</code> | <code>ID --event-id KEY</code> | Submit a deduplicated signal to an event schedule; current caller and original scheduling authority are checked; native channel events cannot be forged | Plan event rule | schedule |
| <code>agents schedule cancel</code> | <code>ID</code> | Cancel an active run, preserving its history | Plan task editor | schedule |
| <code>agents settings get</code> | <code>—</code> | Read independent Company, Messages and Plan appearances, shared controls and default employee models | 应用设置 | operator |
| <code>agents engine models</code> | <code>--engine codex&#124;claude&#124;cline&#124;pi [--kind worker&#124;cloud-native-worker] [--team NAME]</code> | List available models before employee creation, without inference; Cloud Native reads the selected host | 创建员工和默认模型设置 | operator |
| <code>agents settings set</code> | <code>[--view company&#124;messages&#124;plan &#124; --view-appearance JSON&#124;@file] [--message-wallpaper JSON&#124;@file] [--language en&#124;zh-CN] [--theme violet&#124;blue&#124;mint&#124;teal&#124;cyan&#124;rose&#124;coral&#124;amber&#124;indigo&#124;graphite&#124;custom&#124;white&#124;light&#124;space&#124;black&#124;midnight&#124;sage] [--theme-color #RRGGBB] [--default-permission default&#124;acceptEdits&#124;bypassPermissions] [--explorer-width N] [--asset-drawer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on&#124;off] [--team-overview on&#124;off] [--default-codex-model ID] [--default-claude-model ID] [--default-cline-model ID] [--default-pi-model ID]</code> | Patch independent view appearances and shared settings; legacy theme flags target Messages only | 背景、灵敏度和团队索引 | operator |
| <code>agents view get</code> | <code>—</code> | Read service-owned navigation, including without a window | 当前面板 | operator |
| <code>agents view open</code> | <code>home&#124;messages&#124;plan&#124;team&#124;employee&#124;workspace&#124;conversation&#124;initialization&#124;plugin&#124;settings [--name NAME] [--employee ID &#124; --chat GROUP_ID &#124; --channel CHANNEL_ID] [--source SOURCE_ID] [--plugin ID] [--plan-view ID]</code> | Open a form, workspace, news channel or employee conversation | 打开资料或会话 | operator |
| <code>agents view close</code> | <code>—</code> | Close the current panel after saving workspace edits; keep engines running | × / Escape / 收起面板 | operator |
| <code>agents view details</code> | <code>on&#124;off</code> | Show or hide employee details inside a conversation | 员工资料 / 返回会话 | operator |
| <code>agents status</code> | <code>—</code> | Is the app running, and how many sessions are live | The app window being open | operator |
| <code>agents session inbox</code> | <code>—</code> | Read bounded direct-message previews for authorized employees; no model calls, terminal startup or read acknowledgements | Messages conversation list | employee.read |
| <code>agents session list</code> | <code>[--live] [--summary]</code> | List stored cards (or live sessions with --live) | The company floor | employee.read |
| <code>agents session new</code> | <code>[--engine claude&#124;codex] [--group NAME] [--model M]</code> | Create a session | “+ Hire employee” | operator |
| <code>agents session rename</code> | <code>&lt;card-or-session-id&gt; &lt;title&gt;</code> | Rename an employee and its one conversation without moving the folder | 会话名称 / 员工名牌 | operator |
| <code>agents session open</code> | <code>&lt;cardId&gt;</code> | Open a stored card (resumes its engine context) | Clicking a card | employee.message |
| <code>agents session send</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT [--source-view company&#124;messages&#124;plan] [--view VIEW_ID] [--client-message-id ID] [--images JSON] [--files JSON] [--reply-to MESSAGE_ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only]</code> | Send a message to a Worker session | 对话输入框 | employee.message |
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
| <code>agents session transcript</code> | <code>&lt;id&gt; &#124; --employee ID [--limit N] [--thinking]</code> | Read the full conversation by default, or its last 1–1000 items with --limit; no read acknowledgment | The transcript pane | employee.read |
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
| <code>agents session steer</code> | <code>&lt;id&gt; &lt;text&gt; [--source-view company&#124;messages&#124;plan]</code> | Append instructions to the active native turn with optional per-message presentation context | 运行中追加 | operator |
| <code>agents session background</code> | <code>&lt;id&gt;</code> | List agent-owned background terminals | 后台进程 | operator |
| <code>agents session background-stop</code> | <code>&lt;id&gt; [--process ID]</code> | Stop one or all agent-owned background terminals | 停止后台进程 | operator |
| <code>agents session review</code> | <code>&lt;id&gt; [--base BRANCH&#124;--commit SHA&#124;--instructions TEXT]</code> | Run native Codex review for a chosen target | /review | operator |
| <code>agents session enqueue</code> | <code>&lt;id&gt; &lt;text&gt; &#124; --employee ID --text TEXT [--source-view company&#124;messages&#124;plan] [--view VIEW_ID] [--client-message-id ID] [--images JSON] [--files JSON] [--reply-to MESSAGE_ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only]</code> | Queue a message after the active turn | 排队发送 | employee.message |
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
| <code>agents card initialize</code> | <code>&lt;employee-id&gt; [--model ID] [--effort LEVEL]</code> | Retry read-only initialization: every role reads its identity and the shared documentation index | 员工重试初始化 | employee.message |
| <code>agents card create</code> | <code>--title NAME [--group TEAM] [--character NAME --avatar-style anime&#124;chibi &#124; --avatar ID] [--profession TEXT] [--management-role employee&#124;manager&#124;governor&#124;secretary] [--kind worker&#124;cloud-native-worker] [--work-environment team&#124;local] [--engine E] [--model ID] [--thinking on&#124;off] [--effort LEVEL]</code> | Create an employee: title=name, character/avatar=appearance, managementRole=rank, profession=duties; discover appearances with avatar.list and verify via session.status | 添加员工 | employee.create |
| <code>agents card avatar</code> | <code>&lt;employee-id&gt; [--avatar ID &#124; --character NAME --avatar-style anime&#124;chibi]</code> | Set only a controlled employee appearance and its default palette; Manager own Team, Governor across Teams; discover IDs with avatar.list | 员工人物形象 | employee.configure |
| <code>agents card update</code> | <code>&lt;cardId&gt; [--title NAME] [--avatar ID &#124; --character NAME --avatar-style STYLE] [--profession TEXT]</code> | Application-wide general profile editing; supervisors use card.avatar for appearance; Team and folder stay fixed | 员工资料 | operator |
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
| <code>agents workspace docs</code> | <code>--team NAME &#124; --employee ID</code> | Prepare shared documentation and authorized CLI entry points without copying handbooks into the workspace | 自动准备 Agent 文档 | workspace |
| <code>agents workspace suggest</code> | <code>--team NAME [--work-environment team&#124;local]</code> | Suggest an external workspace directory without changing files | 默认工作目录 | operator |
| <code>agents workspace choose</code> | <code>[--path PATH]</code> | Choose a folder in the desktop directory picker | 选择文件夹 | operator |
| <code>agents remote check</code> | <code>--team NAME &#124; --employee ID &#124; --remote-host HOST --remote-dir PATH</code> | Check SSH and the target working directory; return remote OS details | 云端工作目录诊断 | operator |
| <code>agents terminal open</code> | <code>--employee ID [--cols N --rows N]</code> | Open a PTY in the employee working directory | 新建终端 | operator |
| <code>agents terminal list</code> | <code>[--employee ID]</code> | List employee terminals | 终端标签 | operator |
| <code>agents terminal read</code> | <code>ID [--cursor N]</code> | Read terminal output since an offset | 终端输出 | operator |
| <code>agents terminal input</code> | <code>ID --data TEXT [--enter]</code> | Send terminal input, including control keys | 终端输入 | operator |
| <code>agents terminal resize</code> | <code>ID --cols N --rows N</code> | Resize the PTY | 终端尺寸 | operator |
| <code>agents terminal close</code> | <code>ID</code> | Close a terminal and its shell | 关闭终端 | operator |
| <code>agents workspace reveal</code> | <code>--from JSON&#124;@file</code> | User-only: reveal an existing scoped Core-host file or folder in the local desktop file manager; remote and browser paths cannot be revealed on the client | Open in Finder | workspace |
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

另外还有不通过 socket 的 `agents help` 和 `agents serve`。前者查看终端帮助，后者启动无窗口服务；同一数据目录不要重复启动服务。`agents api call COMMAND --args JSON|@file --json` 将参数原样转发至该规范 Core 命令，不增加嵌套 Core 接口。
<!-- END GENERATED CLI COMMAND INDEX -->

## 定时任务完整规范

以下为宿主调度器全文，包括一次性、间隔和按周任务、时区与工作时段、模型/思考覆盖、运行记录和取消。

### Host scheduler CLI API

## Purpose

持久化地安排某个员工在指定时间使用指定模型、思考程度执行任务。调度器属于
Aexus Core，不依赖窗口或任何插件。CLI、Plan 视图与插件使用同一个
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
是排期和自动执行的截止时间。默认启用自动运行；`--enabled false`（或 `--enabled off`）
创建禁用任务，`--paused` 保留为同义的无值 flag；`--enabled true` / `--enabled on`
明确启用。`--enabled` 缺值或非法值、`--paused` 带值、两者同时出现都会在创建前拒绝，
不会静默启用。使用 `--spec` 时请在 JSON 内设置布尔值 `enabled`，不能再混用这两个 flag。
例如先保存、检查后再决定是否启用：

```sh
agents schedule create --name '待确认检查' --employee EMPLOYEE_ID \
  --after-seconds 1800 --prompt '检查项目并报告。' --enabled false --json
agents schedule get JOB_ID --json
```

Governor 目标还必须提供 `--view VIEW_ID`，见下文“Governor 任务的视图目标”。`--source plugin-id`
用于未来插件查询自己创建的任务，是调用方标签，不是权限凭证。

## Commands

所有命令支持 `--json`。Socket 请求为 `{cmd:"schedule.METHOD",args:{...}}`。
返回宿主统一 `{ok:true,data:...}` 或 `{ok:false,error:"..."}`；失败 CLI 非零退出。

| CLI | Socket args | 语义 |
| --- | --- | --- |
| `schedule schema` | `{}` | 机器可读的字段、默认值、运行策略 |
| `schedule status` | `{}` | 是否运行、错误、活动 run ID、持久化路径 |
| `schedule list [--employee ID --source NAME]` | `{employee?,source?}` | 查询排期 |
| `schedule get ID` | `{id}` | 完整配置和 nextAt；事件规则等待时为 null，不代表已完成 |
| `schedule create --spec @job.json` | `{spec}` | 创建排期；也可使用上述 flags |
| `schedule update ID --patch @patch.json` | `{id,patch}` | 顶层部分更新；action/rule/window 提供完整对象；活动任务先取消 |
| `schedule pause ID` | `{id}` | 暂停后续触发，不停止当前轮 |
| `schedule resume ID` | `{id}` | 从当前时间之后重新计算，不补跑暂停期间任务 |
| `schedule preview [ID [--patch JSON] / --spec @job.json] --after ISO --count 5` | `{id?,spec?,patch?,after?,count?}` | 只计算未来时间，不执行；保存任务的 patch 预览保留已用次数且不写入；count 1–100 |
| `schedule run ID` | `{id}` | 明确立即执行一次，即使排期暂停/已结束；忽略日历和工作时段，保留超时与权限；不消耗 nextAt |
| `schedule history [ID] --employee ID --limit 50` | `{id?,employee?,limit?}` | 最新在前；保留最近 1000 条完成记录及全部活动记录 |
| `schedule trigger ID --event-id KEY` | `{id,eventId}` | 向 signal 事件规划发送去重信号；校验当前调用者和原委派，无法伪造原生事件 |
| `schedule cancel RUN_ID` | `{id:runId}` | 终止该次执行，等待引擎停止；不暂停后续排期 |
| `schedule delete [ID \| --ids JSON]` | `{id,expectedRevision?}` 或 `{ids,expectedRevisions?}` | 整批校验确切 ID、权限与修订后暂停并取消活动执行，再删除排期；保留审计记录 |

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
- 源码：`Infra/src/shared/scheduler.ts`、`Infra/src/main/scheduler/{time,execute,service}.ts`。

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
插件自有的文档提醒可以继续独立存在。Plan 提供 Table、Board、Timeline、Calendar、Planner、List、Gallery、Chart、Feed、Form 十种调度数据库界面，仍使用同一套 API。

验证：`npm run test:scheduler`。测试使用隔离数据与确定性引擎替身，Codex 参数固定
`gpt-5.6-luna` / `low`，没有模型推理费用。

## Management authorization

Jobs and runs preserve the requesting principal. Visual relation IDs never grant scheduling authority.
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

## Detailed scenario checks

Saved-job preview accepts `{id,patch?,after?,count?}`. A patch is temporary and follows the update replacement rules; it is never persisted. Moving the preview cursor or calendar range does not reset a finite remaining quota. Notes-only edits preserve the next scheduled instant and can annotate a completed one-shot without replaying it. UI fields retain unchanged absolute seconds/milliseconds and the recurrence timezone's cutoff. See `Infra/src/docs/PLAN_SCENARIOS.md` for practical case-by-case assertions, including actual scheduled MiniNotion writes and rich database rendering.

## Plan extension (additive v1)

Plan is now a first-class view over this same scheduler. `afterSeconds`, `employeeId:"self"`, monthly rules, `maxOccurrences`, Plan metadata, creation idempotency and revision checks are documented in [PLAN.md](PLAN.md). All previous job IDs and schedules remain valid. Ordinary Employees may schedule themselves through a self-target-only delegation; scheduling others requires a strictly lower role within the existing Team/global control scope. `schedule:changed` broadcasts saved database changes. The host must remain online and awake.

## Read-model layout extension

`plan.durationMinutes` (1–43,200) supplies an optional future work estimate. It is not a timeout, scheduling reservation or automatic stop time. Timeline uses actual timestamps for recorded attempts, displays missing estimates as instants, and uses half-open spans at date boundaries. `plan.analytics` counts all authorized matching schedules or retained actual runs; `plan.feed` never fabricates activity from forecasts. See `Infra/src/docs/PLAN_VIEW_PARITY.md` for APIs and interactive cases.

## Plan 统一调度与严格下行权限

所有角色的定时、重复、事件触发员工工作统一使用本 API，并能在 Core Plan 中查询和调整。Employee 只能给自己排期；Manager 可给自己及本 Team 的 Employee 排期；Governor 可给自己及全局 Employee/Manager 排期；Secretary 可给自己及全局 Employee/Manager/Governor 排期。任何 Agent 均不能给其他同级或上级安排任务。用户可调整全部员工规划。一般管理/消息权限不因这一独立的调度规则改变。

`schedule.create/update/preview/run/resume/trigger` 等目标操作均受同一权限边界保护；原委派在实际执行和异步准备之后再次复核。新增 `action.channelId` 明确关联员工引擎频道，要求目标持续具有发布成员身份。旧 UI 的 `source:channel:ID` 仅迁移为经过校验的频道引用，不授予权限。移除成员会停用关联任务。

新增 `rule:{kind:"event",event:"signal"|"channel.posted",channelId?,cooldownSeconds?}`。信号通过 `schedule.trigger {id,eventId}` 提交；原生新帖事件仅由首次成功发布产生。冷却默认 60 秒，可选 0–86400 秒。每个任务保存最近 256 个事件 claim，并利用保留的运行历史去重；暂停/过期/冷却/不在工作窗口的事件不执行，不存在隐藏重试队列。已接受的忙碌事件保留 skipped 记录并消耗次数。重启不会补放离线事件。

事件计划立即出现在 Plan，等待时 nextAt 为 null；预览不虚构日期，日历展示真实执行记录。事件与定时任务共用原有持久化、保留策略、执行器和取消入口，不另建计时器或员工会话。频道表单复用完整 PlanEditor，尚未配置发布计划时明确显示自动发布未配置。详细字段和 CLI 示例见 PLAN.md 的 Unified automation 章节。

专项复验：`node Infra/src/test/plan-authority-core-test.mjs` 与 `node Infra/src/test/plan-authority-ui-test.mjs`，均使用隔离构建/数据和确定性协议替身。

## Record administration and bulk cleanup

For task discovery use `plan.query`: it returns IDs/revisions, names, target identity,
role/Team, exact rules/times and current action capabilities. `schedule.list/get` retain
the raw-job contract. Secretary reads all Plan records, including orphaned schedules;
maintenance of missing-target records is separated from actual execution authorization.
A removed target can be cleaned up or reassigned, never implicitly recreated or run.
See PLAN.md for the canonical permission and null-identity behavior.

`schedule.delete` accepts either `id` with optional `expectedRevision`, or `ids` with
an optional complete `expectedRevisions` map. Every selected record is preflighted
before any side effect; deletion preserves run history and workspace files. A pending
deletion cannot be re-enabled by a concurrent update/resume. `pause`, `resume` and `run`
also accept `--expected-revision` to guard against a changed task.

## Conversation notices are separate from Plan

Current conversation offices (Group Owner/Admin/Member, channel Admin) are independent of Company managementRole. Only actual conversation Owner/Admin configures mute, quiet mode and fixed-text notifications; Company Secretary has no conversation-office bypass. Owner alone dissolves groups or transfers ownership, with the human user's external recovery override. `conversation.notice-*` posts saved text through an independent Core timer/storage without running an Agent or entering Plan. Plan `schedule.*` remains the exclusive API for scheduled employee work. See [CONVERSATION_CONTROLS.md](Infra/src/docs/CONVERSATION_CONTROLS.md) for the current, detailed boundary.
