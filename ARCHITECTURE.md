# Agents Company Core and multi-agent boundaries

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
employees get a visible line. Topology projects createdBy, createdAt and caller-relative
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

Team views only filter the board. Relationships are shared across views. SVG arrows
are drawn from the current room/drag coordinates and only represent Manager creation provenance.
Pending requests stay in the management panel. Main-window activity refreshes use
lightweight session metadata; only the viewed conversation fetches its full history.

## Employee bootstrap and grouped topology

`ensureEmployeeBootstrap` prepares the target employee's role-specific handbooks before committing a new employee, before opening existing sessions, and when changing a role or global grant. Company and Work-plugin instruction blocks are separate. Shared folders have per-employee documents and do not share identity. Codex receives public thread developer instructions; Claude receives a preset append and a changed-role reminder without discarding history. Native subagent tools remain disabled.

Ordinary local Managers can call the authenticated Core endpoint (Unix socket or Windows named pipe). New Coding Agents default to Ask; Full access is an explicit user choice, and upgrades preserve existing permission selections. Management commands remain identity-scoped in Core. An explicitly selected lower Codex permission profile can still allow the exact Core socket. Cloud-local Workers retain Tunnel-only tool routing with no Core-local command fallback. Scope and model-wire fixture tests exercise these paths using actual engines.

`management-layout.ts` is a bounded pure packing/routing module. Creation provenance defines visual groups; full-size Managers and Employees reserve a routing corridor, then isolated employees occupy available cells. Store writes apply it only when active topology or group membership changes. SVG paths share the Core coordinates, use only horizontal/vertical segments with bounded corner curves, and preserve the selected view camera. This is presentation over the existing relation state, not another authority graph.


### 隐藏初始化

`initialization-state.ts` 提供持久化状态、私有 Core 执行上下文与就绪检查。普通 Employee 直接就绪，没有隐藏推理轮或宿主开发者提示词；`initialization.ts` 只为 Manager / Governor 使用两并发队列阅读手册。`sessions.ts` 在公共事件分发前截取 管理职位的私有轮，不污染 transcript reducer、订阅或 UI，但保留原生会话 ID。启动只恢复 Manager / Governor 的 pending；旧普通 Employee 的未完成状态直接变为 ready，不启动模型。

## Office geometry and reply receipts (0.40)

`office-layout.ts` fits Teams after roster or topology changes and moves colliding neighbors in one atomic Store write. Manual Team movement and resizing preserve all other Team positions, both in the drag preview and persisted Core state. Read receipts and streamed content do not repack the office; Team views do not own separate geometry.

`office.ts` exposes a geometry-only `office.layout` projection and repairs legacy overlaps on startup. Layout permission is checked before the global shortcut: Governors can edit all Team/employee geometry, including peers; Managers can adjust their own Team, themselves and its Employees. UI automation writes stay user-only to prevent geometry restrictions being bypassed through simulated user actions.

`reply-receipts.ts` records only the latest completed public assistant reply on the stored employee. Its ID hashes the task/answer identity and complete text; the final-paragraph preview is bounded. Completion and exact-version acknowledgement each write at most once. Full text remains in the transcript. Initialization is intercepted before this publication path; clones do not copy unread state.

The React read observer checks the last-answer marker, clipping, dialogs, tab visibility and foreground focus for a short dwell. The Electron adapter additionally verifies actual native visibility/focus/minimization; Chromium page visibility alone is insufficient when background throttling is disabled. Headless user CLI acknowledgement remains an explicit user action. Agents cannot acknowledge on the user's behalf. No task, filesystem or engine permission is implied by a layout change or a read receipt.

## Employee-owned role policies

`src/shared/roles.ts` is the single role definition registry: Employee, Manager and Governor currently define scope, API categories, allowed target roles, local-execution requirements and user-managed lifecycle. `management.roles`, forms and Core authorization consume the same policies. Additive roles do not require another Team identity model or numeric privilege inheritance.

Role boundaries run before the global shortcut. Governors may read/control other Governors and edit their layout, but cannot create/delete them or change their roles. Group deletion preflights every affected employee; clone results are ordinary Employees. Token issuance and UI simulation remain user-only. Manager/Employee task identity is never inherited from the sender.

Access schema version 2 retains legacy fields only for migration compatibility. Existing explicit grants and designated-Team members become Governor records; later Team/folder membership grants nothing. Migration preserves grant epochs, sessions and workspaces without running models. Demotion invalidates global delegations through the existing grant mechanism.

## Effective employee workspace and creation provenance

Organizational group and execution location are separate. `employeeSettings` and `employeeRoot` resolve a Cloud Team member with `workEnvironment: local` to a stable Core-host root; other members continue using the Team remote target. Session adapters, files, terminals, plugins and native lifecycle use this effective context. No cloud failure falls back to a local engine.

Same-Team Manager authorization is independent of creation provenance. `access.relations` is a derived display projection of trusted `createdBy`, never a permission grant. Manual relation mutation endpoints report that they are obsolete. Existing tasks are reauthorized from current role, membership and credentials; historical relation IDs do not control execution.

## Cross-Team routing and task views

`room-geometry.ts` shares exact contours between SVG drawing and docking. `management-routing.ts` supplies the shared rectilinear visibility search; `cross-team-routing.ts` splits a logical employee connection into two room-local legs and one world-space leg. Headers are excluded geometrically, with hidden/blocked hints instead of unsafe fallback. `office.layout --view` and the renderer use the same projection; camera culling does not remove routing endpoints.

`task-view.ts` pins a Governor turn's view at request acceptance and injects it into engine input without altering the visible transcript. Queues and scheduled actions retain viewId and validate it before execution. `resolveTeamView` serves explicit layout/camera queries; camera writes never select a tab. Views share employee/Team coordinates and retain separate cameras.

Within a Team, below-Manager hierarchies prefer the badge bottom exit and shared same-creator trunks. Target arrows dock at badge sides. Other managers remain routing obstacles/costs, so the drawing does not invent a shared authorization edge.

## Desktop, Web and engine boundaries (0.49)

The Node daemon and Electron shell share `runtime.ts` and authenticated `handleRequest`. `web/server.ts` adds HTTP requests, a persistent WebSocket event stream and bounded mutation deduplication. `web/auth.ts` exchanges the operator token for an HttpOnly session, validates CSRF/origin and revokes subscriptions on logout. Employee bearer credentials retain their existing scope; they never become operators.

`client-state.ts` owns each client's navigation, selected Team view and camera. Company geometry and role data stay shared. Governor tasks pin their view at acceptance. Uploads transfer bytes and downloads stream authorized server files. Plugin UIs use view-scoped gateways and isolated frames; backend plugins remain trusted. The remote Electron shell is presentation-only and does not expose local Core powers.

`sessions.ts` retains project lifecycle/authority and delegates execution to `engines/runtime.ts` and its Codex/Claude drivers. Detection and installation resolve binaries at use time. Model providers remain separate from engine IDs. Capabilities, native-history compatibility and execution-host restrictions remain explicit.

`runtime-lock.ts` acquires data-directory ownership before migration. `atomic-file.ts` writes complete state/history files and retains recoverable history copies. Platform adapters own IPC, executable discovery, launchers and process termination. POSIX PTYs and Windows ConPTY expose the same terminal API. See `docs/DEPLOYMENT.md` and `docs/ENGINE_ADAPTERS.md`.
