// The wire contract between the app and the `agents` CLI. Both sides import
// this so a change to the command surface breaks compilation, not runtime.

import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_HOME = process.env.AGENTS_COMPANY_HOME || join(homedir(), 'AgentsCompany')
export const SOCKET_PATH = join(APP_HOME, 'agents.sock')

export type Request = { cmd: string; args?: Record<string, unknown>; auth?:string }

export type Response<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** Events pushed to a client that asked to follow a session. */
export type FollowEvent =
  | { type: 'event'; channel: string; payload: unknown }
  | { type: 'done' }

export {COMMANDS} from './api-registry'
export type {UiElement,UiSnapshot} from './api-registry'
