// Plain data shared by the GUI and the CLI. Nothing here may import Electron,
// React, or any browser API — the CLI runs it in plain Node.

export type Engine = 'claude' | 'codex'
export type NativeSession = {engine:Engine;id:string}
export type TeamSettings = { mode: 'work' | 'build' | 'cloud'; pluginId?: string; remote?: import('./remote').RemoteTarget; directoryMode?: 'default'|'bind' }
export const teamSettings = (store: Pick<Store,'teamSettings'>, name: string): TeamSettings => store.teamSettings?.[name] ?? {mode:'build'}
import type { Accessory, AvatarKind, RoomDesign } from './office'
import type { Point, RoomBounds, Viewport } from './canvas'

export type SlashCommand = {
  name: string
  description: string
  argumentHint: string
  aliases?: string[]
}

export type ImageInput={path:string;mimeType:'image/png'|'image/jpeg'|'image/gif'|'image/webp';data:string}
export type ModelInfo = { inputModalities?:string[];value:string; displayName:string; description:string; resolvedModel?:string; isDefault?:boolean;
  supportsEffort?:boolean; supportedEffortLevels?:string[]; defaultEffort?:string; supportsAdaptiveThinking?:boolean; supportsFastMode?:boolean;
  serviceTiers?:{id:string;name:string;description:string}[] }

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions'

export type EffortLevel = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

export const PERMISSION_MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'default', label: 'Ask', hint: 'Prompt before dangerous operations' },
  { value: 'acceptEdits', label: 'Accept edits', hint: 'Auto-accept file edits' },
  { value: 'plan', label: 'Plan', hint: 'Plan only — no tool execution' },
  { value: 'auto', label: 'Auto', hint: 'Classifier approves or denies prompts' },
  { value: 'dontAsk', label: "Don't ask", hint: 'Deny anything not pre-approved' },
  {
    value: 'bypassPermissions',
    label: 'Bypass',
    hint: 'Skip all permission checks (dangerous)'
  }
]

export const EFFORT_LEVELS: { value: EffortLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' }
]

export const ENGINES: { value: Engine; label: string; hint: string }[] = [
  { value: 'claude', label: 'Claude Code', hint: 'Anthropic Claude via the Agent SDK' },
  { value: 'codex', label: 'Codex', hint: 'OpenAI Codex CLI' }
]

/** A session as persisted in the app's own store. */
export type StoredSession = {
  id: string
  engine: Engine
  title: string
  group: string
  cwd: string
  /** Read-only API projection from Team; persisted only in legacy 0.12 records. */
  remote?: import('./remote').RemoteTarget | null
  clonedFrom?: string
  claudeSessionId?: string
  threadId?: string
  nativeSessions?: NativeSession[]
  /** Native cloud execution uses a clean engine context; host history is preserved. */
  codexExecution?: 'native-v1'
  createdAt: number
  /** Manual position within a department; set by dragging. */
  orderIndex?: number
  model?: string
  planMode?: boolean
  usage?: Record<string,unknown>
  pendingMessages?: {id:string;text:string;images?:string[]}[]
  fastMode?: boolean
  fastModeState?: string
  fastModeDisabledReason?: string
  effort?: EffortLevel
  permissionMode?: PermissionMode
  thinking?: boolean
  /** A workstation in the illustrated office; independent of its display name. */
  seat?: string
  avatar?: AvatarKind
  accessory?: Accessory
  role?: string
  color?: string
  position?: Point
  /** Computed by the API; invalid legacy workspaces cannot launch an engine. */
  workspaceError?: string
}

/** Where a department's room sits on the floor, and how big it is. */
export type RoomLayout = {
  /** Grid column and row, in units of one room slot. */
  col: number
  row: number
  /** Spans, so rooms can be made wider or taller than one slot. */
  w: number
  h: number
  design?: Partial<RoomDesign>
  bounds?: RoomBounds
}

export type Store = {
  sessions: StoredSession[]
  groups: string[]
  /** Layout per department name; a missing entry means "not placed yet". */
  rooms?: Record<string, RoomLayout>
  teamRoots?: Record<string, string>
  teamSettings?: Record<string, TeamSettings>
  preferences?: import('./preferences').Preferences
  viewport?: Viewport
}

/** One rendered piece of an assistant turn. */
export type Block =
  | { kind: 'text'; text: string;id?:string }
  | { kind: 'thinking'; text: string; done: boolean;id?:string }
  | {
      kind: 'tool'
      id: string
      name: string
      /** Arbitrary tool input as sent by the engine. */
      input: any
      result?: string
      isError?: boolean
      running: boolean
      elapsed?: number
    }

export type Item =
  | { role: 'user'; id: string; text: string; images?:string[] }
  | { role: 'assistant'; id: string; blocks: Block[] }
  | { role: 'notice'; id: string; text: string; tone: 'info' | 'error' }

export type ActivityPreview={kind:'speech'|'thinking'|'tool';text:string;detail?:string;tool?:string;running?:boolean}

/** A live session: everything the GUI needs to render one conversation. */
export type Session = {
  id: string
  /** The stored card this session represents (equals id for a new session). */
  cardId?: string
  engine: Engine
  claudeSessionId?: string
  threadId?: string
  title: string
  /** Department this session belongs to; '' is the default bucket. */
  group: string
  createdAt: number
  items: Item[]
  commands: SlashCommand[]
  terminalCommands?: string[]
  models: ModelInfo[]
  model?: string
  permissionMode: PermissionMode
  thinking: boolean
  thinkingSupported: boolean
  planMode?: boolean
  usage?: Record<string,unknown>
  pendingMessages?: {id:string;text:string;images?:string[]}[]
  fastMode?: boolean
  fastModeState?: string
  fastModeDisabledReason?: string
  effort?: EffortLevel
  busy: boolean
  open?: boolean
  error?: string
  activity?: string
  activityPreview?: ActivityPreview|null
  cwd?: string
  approvals?: Approval[]
}

export type AgentQuestion={id:string;question:string;header?:string;options?:{label:string;description?:string}[]|null;multiSelect?:boolean;isOther?:boolean;isSecret?:boolean}
export type Approval = {schema?:Record<string,any>;allowNestedForm?:boolean;url?:string;questions?:AgentQuestion[]; id: string; tool: string; input: Record<string, unknown>; title: string }

/** Metadata pushed when a session finishes starting up. */
export type SessionMeta = {
  sessionId: string
  engine: Engine
  commands: SlashCommand[]
  models: ModelInfo[]
  requestedModel?: string
  permissionMode: PermissionMode
  thinking: boolean
  thinkingSupported: boolean
  planMode?: boolean
  usage?: Record<string,unknown>
  pendingMessages?: {id:string;text:string;images?:string[]}[]
  fastMode?: boolean
  fastModeState?: string
  fastModeDisabledReason?: string
  effort?: EffortLevel
}

export function groupLabel(name: string): string {
  return name || 'Unassigned'
}

/** Order cards for display: manual order wins, otherwise newest first. */
export function orderSessions(sessions: StoredSession[]): StoredSession[] {
  return [...sessions].sort((a, b) => {
    const ao = a.orderIndex
    const bo = b.orderIndex
    if (ao !== undefined && bo !== undefined) return ao - bo
    if (ao !== undefined) return -1
    if (bo !== undefined) return 1
    return b.createdAt - a.createdAt
  })
}

/** Bucket sessions into departments, always including the default bucket. */
export function groupSessions(
  sessions: StoredSession[],
  groups: string[]
): { name: string; items: StoredSession[] }[] {
  const departments = [
    { name: '', items: [] as StoredSession[] },
    ...groups.map((g) => ({ name: g, items: [] as StoredSession[] }))
  ]
  for (const card of orderSessions(sessions)) {
    const dept = departments.find((d) => d.name === (card.group ?? ''))
    ;(dept ?? departments[0]).items.push(card)
  }
  return departments
}

/** Old native IDs survive workspace/context changes until the employee is removed. */
export function nativeSessionRefs(card:StoredSession):NativeSession[] {
  const refs=[...(card.nativeSessions??[])]
  if(card.threadId)refs.push({engine:'codex',id:card.threadId})
  if(card.claudeSessionId)refs.push({engine:'claude',id:card.claudeSessionId})
  return refs.filter((ref,i)=>refs.findIndex(other=>other.engine===ref.engine&&other.id===ref.id)===i)
}
