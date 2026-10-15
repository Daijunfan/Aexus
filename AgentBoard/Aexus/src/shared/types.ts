import type {MessageAttachment} from './message-attachments'
import type {MessageQuote} from './message-quotes'
import type {ManagementRole,ManagementAccess,PrincipalRef,CurrentTask,Delegation} from './management'
// Plain data shared by the GUI and the CLI. Nothing here may import Electron,
// React, or any browser API — the CLI runs it in plain Node.

export type Engine = import('./engines').EngineId
export type EmployeeKind = 'worker' | 'cloud-native-worker'
export type WorkEnvironment = 'team' | 'local'
export type NativeOrigin = {kind:'cloud';hostId:string;host:string;os:'linux'|'macos'|'windows';directory:string}
export type NativeSession = {engine:Engine;id:string;profile?:string;origin?:NativeOrigin;ownership?:'external'}
export type TeamSettings = { mode: 'work' | 'build' | 'cloud'; pluginId?: string; hostId?:string; directory?:string; remote?: import('./remote').RemoteTarget; directoryMode?: 'default'|'bind' }
export const teamSettings = (store: Pick<Store,'teamSettings'>, name: string): TeamSettings => store.teamSettings?.[name] ?? {mode:'build'}
/** Team is organizational membership; a local workspace may coexist with cloud teammates. */
export function employeeSettings(store:Pick<Store,'teamSettings'>,card:{group:string;workEnvironment?:WorkEnvironment}):TeamSettings {
  const config=teamSettings(store,card.group)
  return config.mode==='cloud'&&card.workEnvironment==='local'?{mode:'build'}:config
}
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
  { value: 'claude', label: 'Claude Agent', hint: 'Anthropic Claude via the Agent SDK' },
  { value: 'codex', label: 'Codex', hint: 'OpenAI Codex CLI' },
  { value: 'cline', label: 'Cline', hint: 'Cline ACP · DeepSeek Flash' },
  { value: 'pi', label: 'Pi', hint: 'Pi RPC · DeepSeek Flash' }
]

/** Undefined on legacy employees: do not run paid onboarding when upgrading. */
export type EmployeeInitialization = {
  /** Core evidence: this native ID contains only the fresh hidden initialization. */
  nativeBindId?:string
  status: 'pending' | 'running' | 'ready' | 'failed'
  attemptId: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  error?: string
}
export const employeeInitializing = (card: Pick<StoredSession,'initialization'>) =>
  card.initialization?.status === 'pending' || card.initialization?.status === 'running'
export const employeeReady = (card: Pick<StoredSession,'initialization'>) =>
  !card.initialization || card.initialization.status === 'ready'

/** Latest published answer and the user's exact-version read receipt. */
export type EmployeeReply={id:string;itemId:string;text:string;createdAt:number;readAt?:number}

/** A session as persisted in the app's own store. */
export type StoredSession = {
  lastReply?:EmployeeReply
  initialization?: EmployeeInitialization
  managementRole?:ManagementRole
  createdBy?:PrincipalRef
  accessMode?:'trusted'|'isolated'
  deleting?:boolean

  id: string
  engine: Engine
  kind?: EmployeeKind
  /** Default inherits Team; local keeps a Mac workspace inside a cloud Team. */
  workEnvironment?: WorkEnvironment
  /** Host-generated local root, preserved when a cloud Team is renamed. */
  localWorkspaceRoot?: string
  title: string
  group: string
  cwd: string
  /** Directory choice at creation; changing it later does not rebind the workspace. */
  directoryMode?: 'default'|'bind'
  /** Read-only API projection from Team; persisted only in legacy 0.12 records. */
  remote?: import('./remote').RemoteTarget | null
  clonedFrom?: string
  clineSessionId?: string
  clineConfigRoot?:string
  piSessionId?: string
  piSessionFile?:string
  piConfigRoot?:string
  claudeSessionId?: string
  threadId?: string
  nativeSessions?: NativeSession[]
  nativeConfigRoot?:string
  nativeOrigin?: NativeOrigin
  nativeOwnership?: 'external'
  /** Native cloud execution uses a clean engine context; host history is preserved. */
  codexExecution?: 'native-v1'
  createdAt: number
  /** Manual position within a department; set by dragging. */
  orderIndex?: number
  model?: string
  planMode?: boolean
  usage?: Record<string,unknown>
  pendingMessages?: {id:string;text:string;images?:string[];files?:string[];delegation?:Delegation;viewId?:string;sourceView?:import('./message-source').MessageSourceView}[]
  remoteAdmin?: boolean
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
  /** Legacy storage name for the profession/duties description, never an avatar or authority. */
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

export const ALL_TEAM_VIEW='all'
export type TeamView={id:string;name:string;teams:string[];viewport?:Viewport}

export type Store = {
  revision?:number
  fullAccessDefaultApplied?:boolean
  connectorAnchors?:import('./connector').ConnectorSettings
  access?:ManagementAccess
  lastEmployeeTemplate?:Partial<StoredSession>
  lastTeamTemplate?:{settings:TeamSettings;design?:Partial<RoomDesign>;bounds?:RoomBounds}

  sessions: StoredSession[]
  groups: string[]
  teamViews?:TeamView[]
  activeTeamViewId?:string
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

/** A bounded public excerpt resolved by Core inside the same conversation. */
export type MessageReply={id:string;role:'user'|'assistant';author?:PrincipalRef;text:string;images?:string[];files?:MessageAttachment[];truncated?:boolean;quote?:MessageQuote;conversation?:string;conversationTitle?:string;authorName?:string;omittedImages?:number;omittedFiles?:number}
/** Outgoing evidence belongs to this task; incoming employee reply receipts are separate. */
export type OutboundReceipt={taskId:string;deliveredAt?:number;readAt?:number}
export type Item =
  | { role: 'user'; id: string; createdAt?:number; author?:PrincipalRef; sourceView?:import('./message-source').MessageSourceView; outbound?:OutboundReceipt; text: string; images?:string[];files?:MessageAttachment[];reply?:MessageReply }
  | { role: 'assistant'; id: string; createdAt?:number; blocks: Block[] }
  | { role: 'notice'; id: string; createdAt?:number; text: string; tone: 'info' | 'error' }

export type ActivityPreview={unread?:boolean;replyId?:string;kind:'speech'|'thinking'|'tool';text:string;detail?:string;tool?:string;running?:boolean}

/** A live session: everything the GUI needs to render one conversation. */
export type Session = {
  acknowledging?:boolean
  lastReply?:EmployeeReply
  initialization?: EmployeeInitialization
  currentTask?:CurrentTask

  id: string
  /** The stored card this session represents (equals id for a new session). */
  cardId?: string
  engine: Engine
  clineSessionId?: string
  clineConfigRoot?:string
  piSessionId?: string
  piSessionFile?:string
  piConfigRoot?:string
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
  thinkingManaged?: boolean
  planMode?: boolean
  usage?: Record<string,unknown>
  pendingMessages?: {id:string;text:string;images?:string[];files?:string[];viewId?:string;replyTo?:string;replyQuote?:MessageQuote;crossReply?:MessageReply}[]
  remoteAdmin?: boolean
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
  thinkingManaged?: boolean
  planMode?: boolean
  usage?: Record<string,unknown>
  pendingMessages?: {id:string;text:string;images?:string[];files?:string[];viewId?:string;replyTo?:string;replyQuote?:MessageQuote;crossReply?:MessageReply}[]
  remoteAdmin?: boolean
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

/** Empty native employees may bind an existing history; completed fresh onboarding is also empty. */
export function canBindNativeSession(card:StoredSession){
  const current=card.threadId??card.claudeSessionId
  return card.kind==='cloud-native-worker'&&employeeReady(card)&&card.nativeOwnership!=='external'&&(!current||!card.clonedFrom&&card.initialization?.status==='ready'&&card.initialization.nativeBindId===current)
}

/** Old native IDs survive workspace/context changes until the employee is removed. */
export function nativeSessionRefs(card:StoredSession):NativeSession[] {
  const refs=[...(card.nativeSessions??[])]
  if(card.clineSessionId)refs.push({engine:'cline',id:card.clineSessionId,profile:card.clineConfigRoot})
  if(card.piSessionId)refs.push({engine:'pi',id:card.piSessionId,profile:card.piConfigRoot})
  if(card.threadId)refs.push({engine:'codex',id:card.threadId,profile:card.nativeConfigRoot,origin:card.nativeOrigin,ownership:card.nativeOwnership})
  if(card.claudeSessionId)refs.push({engine:'claude',id:card.claudeSessionId,profile:card.nativeConfigRoot,origin:card.nativeOrigin,ownership:card.nativeOwnership})
  return refs.filter((ref,i)=>refs.findIndex(other=>other.engine===ref.engine&&other.id===ref.id&&other.ownership===ref.ownership&&JSON.stringify(other.origin??null)===JSON.stringify(ref.origin??null))===i)
}
