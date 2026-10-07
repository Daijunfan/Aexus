# Aexus 分层架构

业务应用在 `Engine/*`，层间协议在根 `Contract/`，协作基础设施在 `Infra/src`，独立软件插件在 `Infra/Plugins`。顶部 Engine/Infra 壳不创建第二份 Company、消息或调度状态。

业务 Engine 只能使用 Contract；Infra 的 `main/engines` 继续表示 Codex/Claude/Cline/Pi 执行适配器。物理目录、数据身份与运行视图是三个独立概念。源码迁移不迁移用户工作区，AGENTS_COMPANY_HOME 和原原生会话引用保留。

开发路由见根 README；协议见 `Contract/PROTOCOL.md`；内部协作接口见同目录 `INFRA_API.md`。

---

# Aexus Core and multi-agent boundaries

The desktop, operator CLI and employee CLI call the same Core operations. The
company does not use Codex/Claude's built-in subagents as employees.

## Request boundary

`api-registry.ts` is pure command metadata and permission classification.
`protocol.ts` keeps the wire types and compatibility exports. Electron's trusted
main-frame IPC explicitly supplies an operator context. Socket clients authenticate
with a control credential or a separately revocable employee credential.
`authorization.ts` resolves the current role and stable employee identity before
dispatch and uses current role and Team membership, never creation lines, views or prompt text.

The Core request context also follows plugin host calls. Employee mailboxes require
authentication. Plugin commands must explicitly declare `agentAccess: "workspace"`
to be available to a non-global employee; missing declarations remain user/global
only. The hosted MiniNotion profile excludes its independent Agent runtime.

## State and relations

The existing Store remains the authoritative state. Writes compare the current
revision, write a private temporary file and atomically rename it. Corrupt existing
state stops operations instead of returning an empty, permissive database.

`managementRole` is independent from engine kind and effective workspace. A local Manager
controls every Employee in the same Team, regardless of creator or execution location.
Creation provenance is stored in trusted `createdBy`; valid supervisor-created
employees get a default visible line. Explicit bindings add logical sources without rewriting history; cancelled pairs suppress their default line. Topology projects createdBy, createdAt and caller-relative
createdByMe, with creator filters applied inside the existing visible scope. Missing
legacy provenance stays null; creator deletion or role changes never rewrite history. Derived relations are presentation data, not grants.
Team renaming preserves stable identities and folders; moving or changing roles
recomputes visible creator lines and independently rechecks current authority.
Topology also projects complete Team membership and current `group.remove` authorization independently of employee creator filters. Instruction handbooks use this projection to resolve "other Teams" and report protected exceptions without changing role authority.
Legacy explicit/global-Team grants receive a one-time migration into each employee’s Governor role. Version 2 ignores Team-derived flags; grant epochs and native references survive migration. Directory names and markers confer no authority.

## Execution and revocation

Accepted messages, pending messages and schedules record their originating principal,
request ID and optional global grant. Legacy relation IDs are not authorization conditions. Execution rechecks the current authorization after
asynchronous preparation. Revocation drops invalid queued messages, cancels only
the affected delegated activity and disables its future schedules. Followers are
checked before sensitive events are delivered and closed when access is lost.

The session adapters keep the existing app-server/SDK transports. Scheduling and
management use the application's transcript mirror and session controls; native
history compatibility remains inside `native-sessions.ts`. Unsupported isolated
native-history cloning returns an explicit error. Deleted Employees first persist
`deleting`, which revokes access; a failed remote cleanup leaves native references
for retry. Externally owned native histories remain protected.

## Process boundary

API authorization alone cannot constrain arbitrary code running under the same
unrestricted OS identity. Legacy employees remain visibly **Trusted**. This is an
explicit compatibility mode with the user's OS-account privileges.

**Isolated** local macOS employees use an outer OS sandbox, a private native-engine
profile and an employee-specific API credential. Host state, operator credentials,
other employee credentials, arbitrary filesystem writes, process inspection and
Mach/Apple-event escape paths are not granted. Workspaces containing the executing
host source are refused. Existing native histories cannot silently switch profiles.
Other execution targets currently reject Isolated startup; selecting it never
falls back to Trusted. Remote OS-account/container isolation is a separate deployment
requirement, not something a bearer token can provide.

Managers and Governors must run and work on the Core host (macOS, Windows or Linux). Locally running Employees in SSH Teams obtain an identity-bound loopback gateway via SSH reverse
forwarding for their own scoped APIs. The remote Python client requires no Node runtime. It forwards argv plus remote input-file contents to the existing Core-host CLI parser in parse-only mode; that mode cannot read host input files or start a service. Shell commands remain on the remote execution channel. The remote CLI can submit only that employee's credential; the operator
socket is not forwarded. Linux live verification uses example-linux. Closing the session
closes the gateway, and a failed connection has no local execution fallback.

## Presentation

Company Views is a compact menu over the existing team-view Core APIs; it retains
saved view IDs, ordering, camera state and editing. Messages is a sibling Core view,
not a second messaging backend. The renderer reuses the same conversation state,
composer, approvals, transcript blocks and exact-reply read guard. The office canvas
is unmounted while Messages is displayed; workbench files/terminals are mounted only
when explicitly opened. A Core-owned returnTo descriptor returns from the full
workbench to its originating direct message, without changing execution state.

`session.inbox` authorizes employees before projecting bounded public previews.
Closed histories use a 256-entry file-version cache; live histories reuse the current
reducer arrays. No separate messages store, full-roster transcript subscription,
new credentials or implicit read acknowledgements are introduced.

Team views only filter the board. Relationships are shared across views. SVG arrows
are drawn from the current room/drag coordinates and represent creation provenance or explicit visual bindings. Idle bindings use the normal persistent arrow; genuine communication/task starts highlight an edge for at most 600ms. Core publishes the independent highlighted flag using one monotonic deadline timer; live task/subscription records remain until actual completion. Display expiry never stops execution, changes bindings, or grants/revokes authority. There is no binding approval queue. Main-window activity refreshes use
lightweight session metadata; only the viewed conversation fetches its full history.

## Employee bootstrap and grouped topology

`ensureEmployeeBootstrap` prepares a brief identity/document-routing prompt and the required
small launchers before creating or opening an employee and after role changes. It no longer
copies full Core or plugin handbooks into each workspace. Shared folders still never share
identity. Codex receives thread developer instructions; Claude receives a preset append and
a changed-role reminder without discarding history. Native subagent tools remain disabled.

`api-documents.ts` is a public documentation leaf, independent of authorization and plugin
runtime. It projects canonical application resources and validated installed plugin API/schema
into one `APP_HOME/api-docs` directory, replacing only changed contents. `readApiDocument`
accepts a catalogued ID and returns `{markdown,document,path,catalogRoot}`; `index` is short
and lists Company, Messages and Plan before plugins. Each plugin has a method/summary
`index`; its `command/<method>` virtual document selects one exact schema entry and
references the existing schema file, without producing a file per command. Core Plan is the `plan.*`/`schedule.*`
view of existing scheduler records, distinct from MiniNotion's document databases. The native
read-only documentation tool and `api.docs` reuse this source for remote and isolated engines.
No extra execution system, private per-role documentation store or workspace copy is introduced.
Public discovery (`api.list/describe --all`) never changes authorization at dispatch.

Ordinary local Managers can call the authenticated Core endpoint (Unix socket or Windows named pipe). New Coding Agents default to Ask; Full access is an explicit user choice, and upgrades preserve existing permission selections. Management commands remain identity-scoped in Core. An explicitly selected lower Codex permission profile can still allow the exact Core socket. Cloud-local Workers retain Tunnel-only tool routing with no Core-local command fallback. Scope and model-wire fixture tests exercise these paths using actual engines.

`management-layout.ts` is a bounded pure packing/routing module. Creation provenance defines visual groups; full-size Managers and Employees reserve a routing corridor, then isolated employees occupy available cells. Store writes apply it on creation topology or group membership changes; visual binding mutations skip re-layout. Explicit management.relayout uses all effective relations, including multiple sources. SVG paths share the Core coordinates, use only horizontal/vertical segments with bounded corner curves, and preserve the selected view camera. This is presentation over the existing relation state, not another authority graph.


### 隐藏初始化

`initialization-state.ts` 提供持久化状态、私有 Core 执行上下文与就绪检查。所有新建 Employee / Manager / Governor / Secretary 通过原有初始化队列执行简短真实原生轮：只读身份与共享索引，然后返回 OK；具体 API 文档在后续任务按需读取。`sessions.ts` 在公共事件分发前截取私有轮，不污染 transcript reducer、订阅、UI 或已读回执，保留原生会话 ID。失败保留明确错误与重试入口，不把缺少确认当作就绪，也不通过阅读文档授予新的管理或写入权限。

## Office geometry and reply receipts (0.40)

`office-layout.ts` fits Teams after roster or topology changes and moves colliding neighbors in one atomic Store write. Manual Team movement and resizing preserve all other Team positions, both in the drag preview and persisted Core state. Read receipts and streamed content do not repack the office; Team views do not own separate geometry.

`office.ts` exposes a geometry-only `office.layout` projection and repairs legacy overlaps on startup. Layout permission is checked before the global shortcut: Governors can edit all Team/employee geometry, including peers; Managers can adjust their own Team, themselves and its Employees. UI automation writes stay user-only to prevent geometry restrictions being bypassed through simulated user actions.

`reply-receipts.ts` records only the latest completed public assistant reply on the stored employee. Its ID hashes the task/answer identity and complete text; the final-paragraph preview is bounded. Completion and exact-version acknowledgement each write at most once. Full text remains in the transcript. Initialization is intercepted before this publication path; clones do not copy unread state.

The React read observer checks the last-answer marker, clipping, dialogs, tab visibility and foreground focus for a short dwell. The Electron adapter additionally verifies actual native visibility/focus/minimization; Chromium page visibility alone is insufficient when background throttling is disabled. Headless user CLI acknowledgement remains an explicit user action. Agents cannot acknowledge on the user's behalf. No task, filesystem or engine permission is implied by a layout change or a read receipt.

## Employee-owned role policies

`Infra/src/shared/roles.ts` is the single role definition registry: Employee, Manager, Governor and Secretary define scope, API categories, allowed target roles, local-execution requirements and user-managed lifecycle. `management.roles`, forms and Core authorization consume the same policies. Additive roles do not require another Team identity model or numeric privilege inheritance.

Role boundaries run before the global/application-administrator shortcut. Secretary alone among Agents administers the complete app and may manage Governor lifecycles; Secretary lifecycle remains user-managed. The common router stays identical, while formal turns carry current authenticated role metadata and Secretary responsibilities. Governors may read/control other Governors and edit their layout, but cannot create/delete them or change their roles. Group deletion preflights every affected employee; clone results are ordinary Employees. Token issuance and UI simulation remain user-only. Manager/Employee task identity is never inherited from the sender.

Access schema version 2 retains legacy fields only for migration compatibility. Existing explicit grants and designated-Team members become Governor records; later Team/folder membership grants nothing. Migration preserves grant epochs, sessions and workspaces without running models. Demotion invalidates global delegations through the existing grant mechanism.

## Effective employee workspace and creation provenance

Organizational group and execution location are separate. `employeeSettings` and `employeeRoot` resolve a Cloud Team member with `workEnvironment: local` to a stable Core-host root; other members continue using the Team remote target. Session adapters, files, terminals, plugins and native lifecycle use this effective context. No cloud failure falls back to a local engine.

Same-Team Manager authorization is independent of creation provenance. `access.relations` is the display projection of trusted `createdBy` plus optional `access.bindings`, never a permission grant. `managementRelations` merges one enabled/disabled override per directed source/target pair: multiple sources may share an employee, duplicate pairs collapse, and disabled creator lines stay suppressed across ordinary writes and startup. Missing bindings preserve the previous creation-line behavior. Deleted endpoints prune overrides; role-ineligible bindings are not displayed.

`management-bindings.ts` implements `management.bind` and `management.unbind` through the authenticated Core. Managers may mutate only their own outgoing bindings. Operator/Governor may select another supervisor, but binding must still satisfy that source's existing role/scope. Unbind may clean an old outgoing link after the target becomes ineligible. These operations never modify true createdBy, role, global-grant epochs, native references or geometry. Their atomic write uses reconcileOffice:false, and only existing store events refresh the canvas. Legacy permission request/approval endpoints remain rejected.

Existing tasks are reauthorized from current role, membership and credentials; historical relation IDs and visual bindings do not control execution. Unbinding during a real task leaves execution running without cancelling queues, followers or schedules. A temporary green cue may finish its remaining 600ms window; it does not remain green for the whole task.

## Cross-Team routing and task views

`room-geometry.ts` shares exact contours between SVG drawing and docking. `management-routing.ts` supplies the shared rectilinear visibility search; `cross-team-routing.ts` splits a logical employee connection into two room-local legs and one world-space leg. Headers are excluded geometrically, with hidden/blocked hints instead of unsafe fallback. `office.layout --view` and the renderer use the same projection; camera culling does not remove routing endpoints.

`task-view.ts` pins a Governor turn's view at request acceptance and injects it into engine input without altering the visible transcript. Queues and scheduled actions retain viewId and validate it before execution. `resolveTeamView` serves explicit layout/camera queries; camera writes never select a tab. Views share employee/Team coordinates and retain separate cameras.

Within a Team, below-Manager hierarchies prefer the badge bottom exit and shared same-creator trunks. Target arrows dock at badge sides. Other managers remain routing obstacles/costs, so the drawing does not invent a shared authorization edge.

## Desktop, Web and engine boundaries (0.49)

The Node daemon and Electron shell share `runtime.ts` and authenticated `handleRequest`. `web/server.ts` adds HTTP requests, a persistent WebSocket event stream and bounded mutation deduplication. `web/auth.ts` exchanges the operator token for an HttpOnly session, validates CSRF/origin and revokes subscriptions on logout. Employee bearer credentials retain their existing scope; they never become operators.

`client-state.ts` owns each client's navigation, selected Team view and camera. Company geometry and role data stay shared. Governor tasks pin their view at acceptance. Uploads transfer bytes and downloads stream authorized server files. Plugin UIs use view-scoped gateways and isolated frames; backend plugins remain trusted. The remote Electron shell is presentation-only and does not expose local Core powers.

`sessions.ts` retains project lifecycle/authority and delegates execution to `engines/runtime.ts` and its Codex/Claude drivers. Detection and installation resolve binaries at use time. Model providers remain separate from engine IDs. Capabilities, native-history compatibility and execution-host restrictions remain explicit.

`runtime-lock.ts` acquires data-directory ownership before migration. `atomic-file.ts` writes complete state/history files and retains recoverable history copies. Platform adapters own IPC, executable discovery, launchers and process termination. POSIX PTYs and Windows ConPTY expose the same terminal API. See `Infra/src/docs/DEPLOYMENT.md` and `Infra/src/docs/ENGINE_ADAPTERS.md`.

## Shared presentation modes and group conversations

`shared/app-views.ts` defines the Company and Messages modes. `view.list` exposes their
canonical data contracts and `view.select` routes through Core with editor flushing.
Company's primary click selects All Team before opening its subview menu on a later click.
The renderer reuses one button contract and canonical store data; presentation-specific
read copies are not introduced. `useVisibleReceipt` observes late-mounted transcript
markers and reattaches across modes, while native IPC still checks actual window focus.
Private receipts retain the same exact employee/reply ID in all views and clients.

`chat-groups.ts` stores a user-managed group catalog and separately persisted explicit
group messages under APP_HOME/chats, using the existing atomic-file helpers. Membership
is an editable snapshot of selected Team employees and explicit cross-Team additions.
Only group members can read/publish group content; that permission never expands private
transcript or employee-control authority. The application owns one lightweight group
catalog and reacts to chat:changed metadata events; group content is fetched only for
the selected group using sequence cursors. No private transcripts are broadcast as group data.

Explicit mentions carry original-sender delegation into existing employee queues. The
trusted CurrentTask.chat context survives queue dispatch and provides group/message IDs
and the concise reporting policy to the engine; original private message text is retained.
Ordinary session API callers cannot forge that context. Task lifecycle events update only
bounded delivery metadata. Published summaries require chat.post by the actual member;
no automatic final-answer mirroring or recursive group notification loop exists.

Stable client message keys prevent duplicate dispatch. Delivery preflight checks all
recipients; later individual startup failures are reported per recipient. After a crash,
uncertain deliveries are marked interrupted rather than replayed; summary projections
are recovered from durable group history. Group-storage errors do not cancel independent
private-session persistence or engine cleanup. Group read cursors acknowledge published
content only, independently of unseen detailed private replies.

## Plan database and portrait framing

The third shared presentation is Plan. plan.ts queries the existing scheduler jobs and runs; saved presentation definitions alone use plan-views.json. No new task executor or employee history is introduced. Scheduler mutations emit schedule:changed, and Plan mounts only lightweight job queries. Optional maxOccurrences, revision, plan metadata and retry keys extend the existing v1 records. Self-target-only scheduler delegations are validated separately from immediate session.send permission.

Small identity portraits use generated static crops; the original sprite players remain the canvas implementation. A single EmployeePortrait component serves message and Plan identity relations. Source art and all animation frames remain unchanged.

## Plan layout read models

Ten database layouts share the original scheduler records and identities. `plan.timeline`, `plan.analytics` and `plan.feed` form explicit read models over scheduler-authorized lists/history; rendering does not load raw global state or clone the executor. Estimated duration is additive metadata, separate from actual run timestamps and safety timeout. UI forms and one-off drag confirmations reuse the original mutation and revision guards. The source-catalog parity regression prevents layout drift against the bundled MiniNotion plugin. See `Infra/src/docs/PLAN_VIEW_PARITY.md`.

## Independent presentation appearance

`Preferences.viewAppearance` owns separate Company, Messages and Plan color selections.
The shared preferences helper normalizes legacy data and merges sparse patches; legacy
color fields mirror Messages only. Core validates and persists the same patch shape exposed
by CLI and GUI. App derives the active presentation from navigation (including dialog
return destinations) and applies its tokens before paint. Company and Plan own their
readable canvas/database styling; neither imports the conversation wallpaper. Plugin
themes, company geometry and scheduler records remain independently owned.

## Slimming boundaries and read-path reuse

The command registry now carries optional internal CLI input declarations. Schema-owned
flags and compact legacy positional mappings compile into `Infra/src/cli/command-inputs.json`;
`Infra/src/cli/command-inputs.cjs` uses the existing CLI tokenizer and remote-file reader. The
public `COMMANDS` projection excludes this internal metadata, retaining the exact
command schemas and permissions. Specialized commands keep explicit handlers. Regenerate
with `npm run docs:managers`; check-mode also verifies the compiled CLI map. CLI help is
loaded only for help/error output, not on each business request.

Engine adapters obtain explicit registration, lookup and private-turn checks from
`EngineHost` instead of mutable session-registry Maps. Shared queue/permission helpers
live in the dependency-free `engines/session-support.ts`; compatibility re-exports remain
in `sessions.ts`. Workspace-level bootstrap lives in `plugins/workspace-provision.ts`,
which does not depend on the employee Store. Static runtime dependency cycles are checked
by `Infra/src/test/architecture-boundaries-test.mjs`; type-only and dynamic edges are excluded
from this static graph, not asserted to be absent.

`ReadCache` owns one bounded eviction/version policy for source text and inbox summaries. File versions include inode, byte count and nanosecond
mtime/ctime; live transcripts use weak numeric revision tokens, never strong references
to older reducer arrays. Plugin discovery revalidates canonical entry paths and versions
before using a descriptor. Shared documentation rechecks both source and materialized
projection versions; changed, missing or corrupt resources are not hidden by cached data.

Message search and gallery pagination use a lazy, owned worker with a rebuildable
SQLite/FTS index at `APP_HOME/cache/message-index.sqlite`. Canonical transcripts and
chat records keep their existing formats. Only public text/media metadata is indexed;
raw thinking/tool blocks, image bytes and external news bodies are excluded. The worker
owns no credentials or execution authority. Core resolves current access and labels,
and rechecks personal visibility after asynchronous IO. Cold indexing takes additional
time and disk, while the main loop stays available. Shutdown drains accepted queries.
Both desktop and standalone server builds ship `message-index-worker.js`.

Group/channel delivery now shares one recipient-dispatch lifecycle and monotonic receipt
transition helper in `main/delivery.ts`; source-specific membership, acknowledgments,
attachments and work/awareness policies remain with their domain. `SingleFlight` shares
concurrent attempts only; persisted retry/uncertainty policy stays with its owner.
Engine/group request handlers live in `main/commands`, behind the same Core preflight.

Store events include additive changed-field, employee, authority, member and inbox hints.
Only authority changes revalidate scheduling/delegation. Visual and reading updates do
not trigger unrelated execution queries. Old events without hints remain conservative.
Frontend inbox/group/channel lists share `useCatalog`, and all composers share durable
pre-send identity checks. These mechanisms do not merge separate histories or read receipts.
See `Infra/src/docs/SLIMMING.md` for module ownership, invalidation, lifecycle and verification.

Action failures and background loading failures have separate owners in group conversations.
A successful history refresh cannot clear an uncertain-send warning or silently retry work.
