// The wire contract between the app and the `agents` CLI. Both sides import
// this so a change to the command surface breaks compilation, not runtime.

import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_HOME = process.env.AGENTS_COMPANY_HOME || join(homedir(), 'AgentsCompany')
export const SOCKET_PATH = join(APP_HOME, 'agents.sock')

export type Request = { cmd: string; args?: Record<string, unknown>; auth?:string }

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

// office.layout and session.acknowledge share the registry and authenticated request path.
// lastReply / unread fields are additive; acknowledgement always names an exact replyId.
