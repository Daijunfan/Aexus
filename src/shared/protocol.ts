// The wire contract between the app and the `agents` CLI. Both sides import
// this so a change to the command surface breaks compilation, not runtime.

import {controlEndpoint} from '../../bin/platform.cjs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_HOME = process.env.AGENTS_COMPANY_HOME || join(homedir(), 'AgentsCompany')
export const SOCKET_PATH = controlEndpoint(APP_HOME)

export type Request = { cmd: string; args?: Record<string, unknown>; auth?:string }
// engine.probe {engine,confirm:true,model?}: explicitly billed OK-only call on the Core host.
// Returns engine/model/target/text/elapsedMs/checkedAt; checkEngine never invokes inference.

export type Response<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

/** Events pushed to a client that asked to follow a session. */
export type FollowEvent =
  | { type: 'event'; channel: string; payload: unknown }
  | { type: 'done' }

export {COMMANDS} from './api-registry'
export type {UiElement,UiSnapshot} from './api-registry'

// management.relayout is registered with all other authenticated commands in api-registry.ts.

// card.initialize retries onboarding; EMPLOYEE_INITIALIZING / EMPLOYEE_INITIALIZATION_FAILED are lifecycle error codes.
// engine.models discovers the selected engine/host catalog without a session or inference.
// card.remove accepts deleteWorkspace:boolean (default false); explicit true removes the employee directory recursively.

// office.layout and session.acknowledge share the registry and authenticated request path.
// lastReply / unread fields are additive; acknowledgement always names an exact replyId.

// management.roles exposes the shared employee-role registry. Governor lifecycle is user-only.
// management.team is legacy discovery only; Team membership and folder paths confer no authority.

// card.create workEnvironment: team|local selects execution scope independently of Team membership.
// management.topology accepts creator: self|others|operator|unknown|EMPLOYEE_ID.
// Its teams: ManagementTeam[] gives authoritative per-Team role permissions, including empty Teams.
// Team membership counts and deletion restrictions are unaffected by creator filtering on nodes.
export type {ManagementTeam} from './management'
// Nodes expose createdBy: PrincipalRef|null, createdByMe: boolean|null and createdAt.
// Missing legacy provenance is unknown (null), not operator or others; filters never expand scope.
// Edges show trusted creation provenance; they do not authorize control.
// management.activity [team] returns ManagementActivity; management:activity publishes the same snapshot.
// Activity is derived from authenticated calls, never client-set or persisted into the employee store.

// Layout/camera requests accept viewId; send/enqueue and scheduled action accept a pinned Governor viewId.
// office.layout.crossTeamConnections uses shared, three-part employee-to-employee routing.

// connector.get includes 24 availablePoints (twenty edge points and four corners).
// Offsets include 0 and 1; CLI and canvas use the same 190x250 employee footprint for all kinds.
export type {ConnectorAnchor,ConnectorSetting} from './connector'

// connector.segment moves a zero-based segment of connector.get.geometry.points (source-Team coordinates).

// host.check coalesces concurrent callers for the same host and bounds active SSH health probes to three.

// card.remove accepts id:string or ids:string[]; group.remove accepts name:string or names:string[].
// Both accept deleteWorkspace:boolean (default false). All targets are authorized and preflighted before cleanup.
// The batch shares one folder choice, deduplicates directories and deletes nested folders deepest-first.

// management.topology teamsOnly:true omits employee nodes/edges; summary counts the complete visible Team roster.
// host.list accepts os, distribution and summary; registry reads never trigger SSH.
// group.add accepts optional os/distribution assertions; hostId implies cloud unless mode is explicit.
// Cloud group.add directoryMode:default creates <host.defaultDirectory>/<name> exclusively over SSH;
// omit directoryMode or use bind to bind an existing directory (directory defaults to host.defaultDirectory).
// management.topology teams also expose mode, hostId, hostName, os, distribution and directory.
// Topology nodes expose workspace:{location,hostId?,os,distribution?,directory} for the effective employee environment.
// host.list is read-only discovery for every employee. credentials:true includes authorized host passwords/files.
// host.get/credentials: Governor all hosts, Manager its Cloud Team host only; Employee denied.
// host.credentials returns {id,password,files:{identityFile?,knownHosts?,sshConfig?}}, each file {path,content}.
// files:false omits file contents for internal SSH askpass. Other host management permissions are unchanged.

// host.terminal-{open,list,read,input,resize,close}: id is the registered host; terminal is its PTY ID.
// host.desktop-{open,list,launch,close}: id is the host; session is its desktop transport ID.
// Both use host management authorization. DesktopProfile is persisted by host.create/update.
export type {DesktopProfile} from './remote'

// host.terminal-read waitMs: 0..15000 (default 0) waits for data or exit; cursor semantics are unchanged.

// host.desktop-list states: connecting, ready, disconnected. desktop-close can cancel a connecting session.
