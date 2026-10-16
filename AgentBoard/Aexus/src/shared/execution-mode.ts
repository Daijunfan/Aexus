import {engineCapabilities} from './engines'
import type {EngineId} from './engines'
import type {EmployeeKind,ExecutionMode,TeamSettings,WorkEnvironment} from './types'

/** Public readback vocabulary: where the engine runs and where its workspace lives. */
export type ExecutionOrigin = 'cloud-host' | 'core-host'
export type ExecutionTarget = 'team-cloud' | 'core-local'

export const EXECUTION_MODES: { value: ExecutionMode; label: string; hint: string }[] = [
  { value: 'default', label: 'Default · Cloud native', hint: 'Recommended: a cloud-native engine process on the selected cloud host with the Team workspace' },
  { value: 'local', label: 'Local', hint: 'The engine and its workspace stay on the Core host' },
  { value: 'cloud', label: 'Cloud workspace via Tunnel', hint: 'The Core engine works in the Team cloud workspace over Tunnel' }
]

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return value === 'default' || value === 'local' || value === 'cloud'
}

/** Whether an engine can run a cloud-native process on the selected host. */
export function supportsCloudNative(engine: EngineId): boolean {
  return engineCapabilities(engine).employeeKinds.includes('cloud-native-worker')
}

/**
 * Public readback. The effective mode is a pure projection of the stored legacy
 * fields and the Team mode; legacy records stay untouched and still resolve here.
 */
export function deriveExecutionMode(
  kind: EmployeeKind | undefined,
  workEnvironment: WorkEnvironment | undefined,
  teamMode: TeamSettings['mode']
): ExecutionMode {
  if (kind === 'cloud-native-worker') return 'default'
  if (teamMode === 'cloud' && workEnvironment !== 'local') return 'cloud'
  return 'local'
}

/** Engine location, workspace location and the derived mode, without credentials. */
export function executionSummary(
  card: { kind?: EmployeeKind; workEnvironment?: WorkEnvironment },
  teamMode: TeamSettings['mode']
): { executionMode: ExecutionMode; executionOrigin: ExecutionOrigin; executionTarget: ExecutionTarget } {
  const executionMode = deriveExecutionMode(card.kind, card.workEnvironment, teamMode)
  return {
    executionMode,
    executionOrigin: executionMode === 'default' ? 'cloud-host' : 'core-host',
    executionTarget: executionMode === 'local' ? 'core-local' : 'team-cloud'
  }
}

export type NormalizedExecution = {
  kind: EmployeeKind
  workEnvironment?: WorkEnvironment
  executionMode: ExecutionMode
}

/**
 * Single creation contract shared by card.create and session.new. An explicit
 * executionMode resolves to the underlying kind/workEnvironment; otherwise the
 * legacy kind/workEnvironment pair still wins, and omitting all of them on a
 * Cloud Team defaults to the recommended cloud-native worker (Tunnel for the
 * engines that cannot run a cloud-native process).
 */
export function normalizeExecutionMode(
  args: { executionMode?: unknown; kind?: EmployeeKind; workEnvironment?: WorkEnvironment; engine?: EngineId },
  teamMode: TeamSettings['mode'],
  engine: EngineId = args.engine ?? 'codex'
): NormalizedExecution {
  if (args.executionMode !== undefined) {
    if (!isExecutionMode(args.executionMode)) throw new Error('executionMode 必须为 default、local 或 cloud')
    switch (args.executionMode) {
      case 'default': {
        if (teamMode === 'cloud' && supportsCloudNative(engine)) return { kind: 'cloud-native-worker', workEnvironment: 'team', executionMode: 'default' }
        if (teamMode === 'cloud') return { kind: 'worker', workEnvironment: 'team', executionMode: 'cloud' }
        return { kind: 'worker', workEnvironment: undefined, executionMode: 'local' }
      }
      case 'local': {
        if (teamMode === 'cloud') return { kind: 'worker', workEnvironment: 'local', executionMode: 'local' }
        return { kind: 'worker', workEnvironment: undefined, executionMode: 'local' }
      }
      case 'cloud': {
        if (teamMode !== 'cloud') throw new Error('cloud 执行模式需要 Cloud Team；Build/Work Team 请使用 local')
        return { kind: 'worker', workEnvironment: 'team', executionMode: 'cloud' }
      }
    }
  }
  if (args.kind !== undefined || args.workEnvironment !== undefined) {
    const kind = args.kind ?? 'worker'
    const workEnvironment = args.workEnvironment
    return { kind, workEnvironment, executionMode: deriveExecutionMode(kind, workEnvironment, teamMode) }
  }
  if (teamMode === 'cloud' && supportsCloudNative(engine)) return { kind: 'cloud-native-worker', workEnvironment: 'team', executionMode: 'default' }
  if (teamMode === 'cloud') return { kind: 'worker', workEnvironment: 'team', executionMode: 'cloud' }
  return { kind: 'worker', workEnvironment: undefined, executionMode: 'local' }
}
