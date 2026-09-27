import {createWebApi} from './web/transport'
import type { Request } from '../../shared/protocol'

export type AgentsApi = {
  readonly mode?:'desktop'|'web'
  readonly platform?:'macos'|'linux'|'windows'
  filePath(file:File):string
  rendererReady(): void
  call<T = any>(cmd: Request['cmd'], args?: Request['args']): Promise<T>
  onEvent(handler: (event: { channel: string; payload: any }) => void): () => void
  onUiRequest(handler: (request: { id: string; op: string; args: Record<string, unknown> }) => void): () => void
  answerUi(answer: { id: string; data?: unknown; error?: string }): void
  openExternal(url: string): Promise<void>
}
declare global { interface Window { agents: AgentsApi } }
export const api:AgentsApi = window.agents??createWebApi()
if(!window.agents)window.agents=api
