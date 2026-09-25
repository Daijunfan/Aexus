# Agents Company Core and multi-agent boundaries

The desktop, operator CLI and employee CLI call the same Core operations. The
company does not use Codex/Claude's built-in subagents as employees.

## Request boundary

`api-registry.ts` is pure command metadata and permission classification.
`protocol.ts` keeps the wire types and compatibility exports. Electron's trusted
main-frame IPC explicitly supplies an operator context. Socket clients authenticate
with a control credential or a separately revocable employee credential.
`authorization.ts` resolves the current role and stable employee identity before
dispatch and uses current management relations, never view membership or prompt text.

The Core request context also follows plugin host calls. Employee mailboxes require
authentication. Plugin commands must explicitly declare `agentAccess: "workspace"`
to be available to a non-global employee; missing declarations remain user/global
only. The hosted MiniNotion profile excludes its independent Agent runtime.

## State and relations

The existing Store remains the authoritative state. Writes compare the current
revision, write a private temporary file and atomically rename it. Corrupt existing
state stops operations instead of returning an empty, permissive database.

`managementRole` is independent from local/cloud execution kind and engine tool
permissions. A Team Manager controls only ordinary Employees in the same Team
through active relations. Requests start pending. The user or an explicitly granted
Agents Manager approves them. Manager-created Employees record the real creator
and acquire an active relation in the same Store commit. Only that creator can
delete through Team Manager authority.

Relations store employee IDs. Team renaming therefore preserves relations; moving,
deleting, promotion and demotion prune invalid edges. Rebinding creates a new ID.
Existing explicitly designated Manager workspaces receive a one-time migration
into `access.globalManagerIds`. Later directory names or markers confer no authority.

## Execution and revocation

Accepted messages, pending messages and schedules record their originating principal,
request and actual relation ID. Execution rechecks the current authorization after
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

Locally running Managers in SSH Teams obtain an identity-bound loopback gateway via SSH reverse
forwarding. The remote CLI can submit only that employee's credential; the operator
socket is not forwarded. Linux live verification uses bupt208. Closing the session
closes the gateway, and a failed connection has no local execution fallback.

## Presentation

Team views only filter the board. Relationships are shared across views. SVG arrows
are drawn from the current room/drag coordinates and only represent active edges.
Pending requests stay in the management panel. Main-window activity refreshes use
lightweight session metadata; only the viewed conversation fetches its full history.

## Employee bootstrap and grouped topology

`ensureEmployeeBootstrap` prepares the target employee's role-specific handbooks before committing a new employee, before opening existing sessions, and when changing a role or global grant. Company and Work-plugin instruction blocks are separate. Shared folders have per-employee documents and do not share identity. Codex receives public thread developer instructions; Claude receives a preset append and a changed-role reminder without discarding history. Native subagent tools remain disabled.

Ordinary local Managers can call the authenticated Core Unix socket while retaining their file permissions. Codex read-only/Work named profiles and Claude Work settings include only the exact Core socket path, not an all-sockets exception. Scope and model-wire fixture tests exercise this path using actual engines.

`management-layout.ts` is a bounded pure packing/routing module. Active relations define connected components; full-size Managers and Employees reserve a routing corridor, then isolated employees occupy available cells. Store writes apply it only when active topology or group membership changes. SVG paths share the Core coordinates, use only horizontal/vertical segments with bounded corner curves, and preserve the selected view camera. This is presentation over the existing relation state, not another authority graph.


### 隐藏初始化

`initialization-state.ts` 提供持久化状态结构的创建函数、私有 Core 执行上下文与就绪检查；`initialization.ts` 使用两并发内存队列驱动现有引擎会话，状态保存在原员工记录。`sessions.ts` 在公共事件分发前截取私有轮，不污染 transcript reducer、订阅或 UI，但保留原生会话 ID。权限授权与生命周期就绪校验分开，避免并行初始化被误判为委派撤销。启动只恢复 pending；中断的 running 显式失败；旧员工不触发推理迁移。

## Office geometry and reply receipts (0.40)

`office-layout.ts` composes the existing Team packing/routing function with deterministic collision displacement. The configuration commit compares only roster/topology/geometry signatures. It fits affected Teams and moves colliding neighbors, including pinned rooms, in one atomic Store write. Read receipts and streamed content do not repack the office. The renderer uses the same collision function for drag previews; Team views do not own separate geometry.

`office.ts` exposes a geometry-only `office.layout` projection and repairs legacy overlaps on startup. Layout permission is checked before the global shortcut: globally authorized Employees can edit other Teams, while own-Team editing requires Manager. Ordinary Managers can adjust their own Team and individually move themselves or linked Employees. UI automation writes stay user-only to prevent geometry restrictions being bypassed through simulated user actions.

`reply-receipts.ts` records only the latest completed public assistant reply on the stored employee. Its ID hashes the task/answer identity and complete text; the final-paragraph preview is bounded. Completion and exact-version acknowledgement each write at most once. Full text remains in the transcript. Initialization is intercepted before this publication path; clones do not copy unread state.

The React read observer checks the last-answer marker, clipping, dialogs, tab visibility and foreground focus for a short dwell. The Electron adapter additionally verifies actual native visibility/focus/minimization; Chromium page visibility alone is insufficient when background throttling is disabled. Headless user CLI acknowledgement remains an explicit user action. Agents cannot acknowledge on the user's behalf. No task, filesystem or engine permission is implied by a layout change or a read receipt.
