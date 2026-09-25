import type {ModelInfo,ImageInput} from '../shared/types'
import type {RemoteTarget} from '../shared/remote'
import { runNativeCodexTurn } from './codex-native'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { childEnv, resolveBinary } from './exec'
import {workCodexConfig} from './scope'

const CODEX_BIN = resolveBinary('codex', process.env.CODEX_BIN)

// Employee sessions use native app-server connections. The exec adapter below
// remains available for one-shot callers that do not supply native interaction hooks.

export type CodexEvent =
  | {kind:'child-thread';threadId:string}
  | {kind:'background-turn';busy:boolean}
  | {kind:'usage';usage:Record<string,unknown>}
  | { kind: 'thread'; threadId: string }
  | { kind: 'turn-start' }
  | { kind: 'text'; text: string;id?:string }
  | { kind:'text-delta'|'reasoning-delta';id:string;text:string }
  | { kind:'tool-delta';id:string;output:string }
  | { kind: 'reasoning'; text: string;id?:string }
  | { kind: 'tool-start'; id: string; command: string; name?: string }
  | { kind: 'tool-end'; id: string; command: string; output: string; exitCode: number | null; name?: string }
  | { kind: 'notice'; level: 'error' | 'info'; text: string }
  | { kind: 'turn-end' }

export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')

/** Real model list from Codex's own cache; falls back to the configured model. */
export function codexModels(): ModelInfo[] {
  try {
    const raw = JSON.parse(readFileSync(join(CODEX_HOME, 'models_cache.json'), 'utf8'))
    const list = Array.isArray(raw) ? raw : (raw.models ?? [])
    const seen = new Set<string>()
    const out: ModelInfo[] = []
    for (const m of list) {
      const value = m.slug ?? m.id
      if (!value || seen.has(value)) continue
      seen.add(value)
      out.push({
        value,
        displayName: m.display_name ?? value,
        description: m.description ?? '',
        supportedEffortLevels: m.supported_reasoning_levels?.map((e:any)=>e.effort),
        defaultEffort:m.default_reasoning_level,inputModalities:m.input_modalities,
        serviceTiers:m.service_tiers??(m.additional_speed_tiers?.includes('fast')?[{id:'fast',name:'Fast',description:'官方 Fast 档位，更高用量'}]:[])
      })
    }
    if (out.length) return out
  } catch {
    // fall through to the default below
  }
  return [{ value: 'default', displayName: 'Default', description: 'Configured model' }]
}

export function nativeModel(m:any):ModelInfo {
  return {inputModalities:m.inputModalities,value:m.model??m.id,displayName:m.displayName??m.model,description:m.description??'',isDefault:m.isDefault,
    supportedEffortLevels:m.supportedReasoningEfforts?.map((e:any)=>e.reasoningEffort),defaultEffort:m.defaultReasoningEffort,
    serviceTiers:m.serviceTiers??(m.additionalSpeedTiers?.includes('fast')?[{id:'fast',name:'Fast',description:'官方 Fast 档位，更高用量'}]:[])}
}

/** The native catalog is paginated; include hidden entries instead of silently dropping models. */
export async function allCodexModels(call:(method:string,params:Record<string,unknown>)=>Promise<any>):Promise<ModelInfo[]>{
  const models=new Map<string,ModelInfo>();let cursor:string|undefined
  do{
    const page=await call('model/list',{limit:100,includeHidden:true,...(cursor?{cursor}:{})})
    for(const raw of page.data??[]){const model=nativeModel(raw);models.set(model.value,model)}
    cursor=page.nextCursor??undefined
  }while(cursor)
  return [...models.values()]
}

export async function runCodexTurn(args: {
  employeeId?:string
  connectionId?:string
  prompt: string
  images?:ImageInput[]
  cwd: string
  workRoot?: string
  remote?:RemoteTarget|null
  nativeRemote?:RemoteTarget
  remoteAdmin?:boolean
  permissionRoot?: string
  resumeId?: string
  model?: string
  sandbox: SandboxMode
  effort?: string
  planMode?: boolean
  serviceTier?: string
  onRequest?:(method:string,params:any,signal:AbortSignal)=>Promise<unknown>
  approvalPolicy?:string
  onEvent: (e: CodexEvent) => void
  signal: AbortSignal
}): Promise<void> {
  if(args.onRequest||args.remote||args.nativeRemote||args.planMode||args.images?.length||/^\/(compact|review)(?:\s|$)/.test(args.prompt))return runNativeCodexTurn(CODEX_BIN,args)
  const cwd=args.cwd
  const cmd = ['exec', '--json', '--skip-git-repo-check',...(args.remote?[]:['-C', args.cwd])]
  const env=childEnv(args.cwd,args.workRoot)
  if(args.workRoot)cmd.push(...workCodexConfig(args.cwd,args.permissionRoot??args.workRoot))
  else cmd.push('--sandbox',args.sandbox)

  if (args.model && args.model !== 'default') cmd.push('-m', args.model)
  if (args.effort) cmd.push('-c', `model_reasoning_effort="${args.effort}"`)

  // Explicit default prevents a global Fast setting leaking into a Standard employee.
  cmd.push('-c',`service_tier=${JSON.stringify(args.serviceTier??'default')}`,'-c','features.fast_mode=true')

  if (args.resumeId) {
    cmd.push('resume', args.resumeId, '-')
  } else {
    // Read the prompt from stdin so long input is not an argv limit concern.
    cmd.push('-')
  }

  await new Promise<void>((resolve) => {
    const child = spawn(CODEX_BIN, cmd, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let buf = ''
    let settled = false
    let stderr = ''
    let reportedError = false
    let killTimer: NodeJS.Timeout | undefined
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      args.signal.removeEventListener('abort', abort)
      resolve()
    }

    const abort = () => {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1500)
    }
    args.signal.addEventListener('abort', abort)
    if (args.signal.aborted) abort()

    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('{')) continue
        let ev: any
        try {
          ev = JSON.parse(trimmed)
        } catch {
          continue
        }
        for (const mapped of mapEvent(ev)) {
          if (mapped.kind === 'notice' && mapped.level === 'error') reportedError = true
          args.onEvent(mapped)
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      stderr = (stderr + '\n' + text).slice(-6000)
      // Codex logs a noisy model-cache warning on some installs; not user-facing.
      if (text && !/models_cache|models cache/i.test(text)) {
        console.error('[codex]', text)
      }
    })

    child.on('error', (err) => {
      args.onEvent({ kind: 'notice', level: 'error', text: String(err) })
      done()
    })

    child.on('close', (code) => {
      if (code !== 0 && !args.signal.aborted && !reportedError) {
        args.onEvent({ kind: 'notice', level: 'error', text: stderr.trim() || `Codex exited with code ${code}` })
      }
      done()
    })

    // Always send the prompt: on a fresh run it is the instruction, and on a
    // resume it is the new turn's message.
    child.stdin.on('error', () => {}) // Spawn/exit errors are reported above.
    child.stdin.write(args.prompt)
    child.stdin.end()
  })
}

export function mapEvent(ev: any): CodexEvent[] {
  switch (ev?.type) {
    case 'thread.started':
      return ev.thread_id ? [{ kind: 'thread', threadId: ev.thread_id }] : []
    case 'turn.started':
      return [{ kind: 'turn-start' }]
    case 'turn.completed':
      return [...(ev.usage?[{kind:'usage' as const,usage:ev.usage}]:[]),{ kind: 'turn-end' }]
    case 'turn.failed':
      return [{ kind: 'notice', level: 'error', text: ev.error?.message || 'Codex turn failed' }]
    case 'item.started':
    case 'item.completed': {
      const it = ev.item
      if (!it) return []
      switch (it.type) {
        case 'command_execution': {
          if (ev.type === 'item.started') {
            return [{ kind: 'tool-start', id: it.id, command: it.command ?? '' }]
          }
          return [
            {
              kind: 'tool-end',
              id: it.id,
              command: it.command ?? '',
              output: it.aggregated_output ?? '',
              exitCode: it.exit_code ?? null
            }
          ]
        }
        case 'agent_message':
          // Codex re-emits the final message; only surface the last one per turn
          // is not knowable here, so the renderer de-duplicates identical text.
          return it.text ? [{ kind: 'text', text: it.text }] : []
        case 'reasoning':
          return it.text ? [{ kind: 'reasoning', text: it.text }] : []
        case 'file_change':
        case 'mcp_tool_call':
        case 'web_search': {
          const command = it.command || it.query || it.tool || (it.changes ?? []).map((c: any) => `${c.kind}: ${c.path}`).join('\n')
          if (ev.type === 'item.started') return [{ kind: 'tool-start', id: it.id, name: it.type, command }]
          return [{ kind: 'tool-end', id: it.id, name: it.type, command,
            output: JSON.stringify(it.result ?? it.changes ?? it.error ?? '', null, 2),
            exitCode: it.status === 'failed' ? 1 : 0 }]
        }
        case 'error': {
          const text = it.message ?? 'Codex error'
          return isBenignNotice(text) ? [] : [{ kind: 'notice', level: 'error', text }]
        }
        default:
          return []
      }
    }
    case 'error': {
      const text = ev.message ?? 'Codex error'
      return isBenignNotice(text) ? [] : [{ kind: 'notice', level: 'error', text }]
    }
    default:
      return []
  }
}

// Codex reports install-level conditions as item errors on every turn; they are
// diagnostics about the local setup, not failures of the turn being run.
function isBenignNotice(text: string): boolean {
  return (
    /Under-development features enabled/i.test(text) ||
    /--dangerously-bypass-hook-trust.*enabled/i.test(text) ||
    /Model metadata for .* not found/i.test(text) ||
    /failed to load models cache/i.test(text)
  )
}
