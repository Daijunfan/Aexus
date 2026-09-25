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

Cloud Team Managers obtain an identity-bound loopback gateway via SSH reverse
forwarding. The remote CLI can submit only that employee's credential; the operator
socket is not forwarded. Linux live verification uses bupt208. Closing the session
closes the gateway, and a failed connection has no local execution fallback.

## Presentation

Team views only filter the board. Relationships are shared across views. SVG arrows
are drawn from the current room/drag coordinates and only represent active edges.
Pending requests stay in the management panel. Main-window activity refreshes use
lightweight session metadata; only the viewed conversation fetches its full history.
