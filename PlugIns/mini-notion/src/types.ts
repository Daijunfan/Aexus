import type { ButtonConfig, DatabaseAutomation, ActionRun } from './actions/types';
import type { RepeatRule, Reminder, SchedulerState, InboxItem } from './scheduling/types';
import type { PersonValue } from './database/formula';
import type { AppearanceColor, AppAppearance, PageAppearance, PageColor, ViewAppearance } from './core/appearance';
export type { PersonValue } from './database/formula';
export type FileValue = { id: string; name: string; url: string; size?: number; mimeType?: string };
export type StatusGroup = 'todo' | 'doing' | 'done';
export type JsonBlock = {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: any;
  children?: JsonBlock[];
};
export type DateValue = { start: string; end?: string | null; timeZone?: string };
export type SpaceEngine = 'claude' | 'codex';
export type SpaceFolder = { id: string; name: string; parentId: string | null; path?: string };
export type SpaceFileRecord = {
  id: string;
  name: string;
  folderId: string | null;
  url: string;
  bytes: number;
  mimeType?: string;
  createdAt: number;
  modifiedAt?: number;
};
export type AgentContext = { pageId: string; blockId?: string; quote?: string; title?: string };
export type AgentMessage = {
  id: string;
  conversationId?: string;
  role: 'user' | 'agent' | 'system';
  kind: 'text' | 'activity';
  text?: string;
  attachments?: SpaceFileRecord[];
  context?: AgentContext[];
  activity?: {
    name: string;
    status: 'running' | 'done' | 'error' | 'stopped';
    summary?: string;
    output?: string;
  };
  engineId?: string;
  sessionId?: string;
  request?: { id: string; method: string; params: Record<string, any>; answered?: boolean };
  data?: any;
  at: number;
};
export type AgentQueuedMessage = {
  id: string;
  text: string;
  fileIds: string[];
  context?: AgentContext[];
  at: number;
};
export type AgentConfig = {
  engine: SpaceEngine;
  conversationId?: string;
  conversationVersion?: number;
  forkSession?: boolean;
  sessionId?: string;
  status: 'idle' | 'running' | 'error' | 'stopped';
  startedAt?: number;
  endedAt?: number;
  error?: string;
  messages: AgentMessage[];
  queue?: AgentQueuedMessage[];
  queuePaused?: boolean;
  usage?: {
    input?: number;
    output?: number;
    costUsd?: number;
    turns?: number;
    contextTokens?: number;
    contextWindow?: number | null;
  };
  options?: {
    command?: string;
    model?: string;
    effort?: string;
    thinking?: boolean | null;
    serviceTier?: string;
    mode?: 'agent' | 'plan';
    approval?: string;
    config?: Record<string, any>;
    sdk?: Record<string, any>;
    followUpQueueMode?: 'queue' | 'steer' | 'interrupt';
    composerEnterBehavior?: 'enter' | 'cmdIfMultiline' | 'cmdAlways';
    focusView?: boolean;
  };
  sessions?: AgentSessionRecord[];
  capabilities?: { models: any[]; commands: any[]; [key: string]: any };
};
export type AgentSessionRecord = {
  id: string;
  conversationId?: string;
  title: string;
  at: number;
  queue?: AgentQueuedMessage[];
  state?: Omit<AgentConfig, 'sessions'>;
  closed?: boolean;
  unread?: boolean;
};
export type Space = {
  engine: SpaceEngine;
  title: string;
  agent: AgentConfig;
};
export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'status'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'person'
  | 'files'
  | 'createdTime'
  | 'editedTime'
  | 'createdBy'
  | 'editedBy'
  | 'uniqueId'
  | 'relation'
  | 'rollup'
  | 'formula'
  | 'button';
export type Property = {
  id: string;
  name: string;
  type: PropertyType;
  options?: string[];
  optionColors?: Record<string, string>;
  statusGroups?: Record<StatusGroup, string[]>;
  defaultStatus?: string;
  idPrefix?: string;
  personLimit?: 1;
  relationTo?: string;
  relationProperty?: string;
  targetProperty?: string;
  calculation?: 'count' | 'sum' | 'average' | 'min' | 'max' | 'show';
  formula?: string;
  button?: ButtonConfig;
  system?: 'parentItem' | 'subItems' | 'blockedBy' | 'blocking';
};
export type ViewType =
  'table' | 'board' | 'gallery' | 'list' | 'calendar' | 'plan' | 'timeline' | 'chart' | 'feed' | 'form';
export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'empty'
  | 'not_empty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after';
export type FilterRule = { id: string; property: string; operator: FilterOperator; value: string };
export type FilterGroup = { id: string; conjunction: 'and' | 'or'; rules: (FilterRule | FilterGroup)[] };
export type SortRule = { id: string; property: string; direction: 'asc' | 'desc' };
export type Aggregate =
  'count' | 'count_values' | 'count_unique' | 'empty' | 'percent_filled' | 'sum' | 'average' | 'min' | 'max';
export type DatabaseView = {
  appearance?: ViewAppearance | null;
  id: string;
  name: string;
  type: ViewType;
  defaultTemplateId?: string | null;
  subItemDisplay?: 'nested' | 'flat' | 'card';
  subItemFilter?: 'all' | 'parents' | 'children';
  collapsedItems?: string[];
  filters?: FilterGroup;
  sorts?: SortRule[];
  groupBy?: string;
  subGroupBy?: string;
  hideEmptyGroups?: boolean;
  hiddenGroups?: string[];
  collapsedGroups?: string[];
  groupOrder?: string[];
  hiddenProperties?: string[];
  propertyOrder?: string[];
  columnWidths?: Record<string, number>;
  calculations?: Record<string, Aggregate>;
  wrapCells?: boolean;
  cardSize?: 'small' | 'medium' | 'large';
  cardPreview?: 'none' | 'cover' | 'content';
  openPagesIn?: 'side' | 'center' | 'full';
  calendarBy?: string;
  calendarMode?: 'month' | 'week';
  dateAnchor?: string;
  planMode?: 'week' | 'day' | 'agenda' | 'hourWeek' | 'hourDay';
  timeZone?: string;
  planDoneBy?: string;
  planDoneValue?: string;
  planHideCompleted?: boolean;
  planShowBacklog?: boolean;
  timelineEnd?: string;
  timelineScale?: 'week' | 'month' | 'quarter' | 'year';
  chartType?: 'bar' | 'horizontal' | 'line' | 'donut';
  chartGroup?: string;
  chartValue?: string;
  chartAggregation?: Aggregate;
  formDescription?: string;
  formRequired?: string[];
  formSubmitLabel?: string;
};
export type Database = {
  columns: Property[];
  automations?: DatabaseAutomation[];
  view: ViewType;
  views?: DatabaseView[];
  activeViewId?: string;
  defaultTemplateId?: string | null;
  subItems?: boolean;
  dependencies?: {
    enabled: boolean;
    dateProperty: string;
    endProperty?: string;
    shift: 'none' | 'overlap' | 'maintain';
    avoidWeekends?: boolean;
  };
  calendarBy?: string;
  groupBy?: string;
  sort?: { field: string; direction: 'asc' | 'desc' };
  filter?: { field: string; value: string };
};
export type DatabaseViewState = { views: DatabaseView[]; activeViewId: string; view: ViewType };
export type CommentMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  reactions?: Record<string, boolean>;
};
export type CommentThread = {
  id: string;
  blockId?: string;
  quote?: string;
  createdAt: number;
  resolvedAt?: number | null;
  deletedAt?: number | null;
  messages: CommentMessage[];
};
export type Page = {
  sourceFile?: { path: string; kind: string; hash: string };
  color: PageColor;
  textColor: AppearanceColor;
  appearance?: PageAppearance | null;
  id: string;
  parentId: string | null;
  templateFor?: string;
  repeat?: RepeatRule;
  reminders?: Reminder[];
  automationOrigin?: { templateId: string; scheduledFor: string; manual?: boolean };
  syncedSource?: boolean;
  comments?: CommentThread[];
  subItemOf?: string | null;
  blockedBy?: string[];
  title: string;
  icon: string;
  cover: string | null;
  coverPosition: number;
  blocks: JsonBlock[];
  favorite: boolean;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  createdBy?: PersonValue;
  editedBy?: PersonValue;
  uniqueId?: { databaseId: string; number: number };
  fullWidth: boolean;
  showDescription?: boolean;
  smallText: boolean;
  font: 'default' | 'serif' | 'mono';
  locked: boolean;
  database?: Database;
  space?: boolean;
  folders?: SpaceFolder[];
  files?: SpaceFileRecord[];
  removedFileUrls?: string[];
  removedFolderPaths?: string[];
  values: Record<string, string | number | boolean | string[] | DateValue | PersonValue[] | FileValue[]>;
};
export type Workspace = {
  version: 1;
  revision?: number;
  name: string;
  pages: Page[];
  people?: PersonValue[];
  uniqueIds?: Record<string, { next: number; pages: Record<string, number> }>;
  activePageId: string | null;
  expanded: string[];
  recent: string[];
  scheduler?: SchedulerState;
  inbox?: InboxItem[];
  actionRuns?: ActionRun[];
  automationClocks?: Record<string, { cursor: number; error?: string }>;
  spaces?: Record<string, Space>;
  settings: {
    appearance?: AppAppearance | null;
    theme: 'light' | 'dark' | 'system';
    sidebarWidth: number;
    sidebarHidden: boolean;
    pageTabs?: (string | null)[];
    activeTab?: number;
    spellcheck: boolean;
    agentPanelPosition?: { x: number; y: number };
    agentPanelDocked?: boolean;
    overview?: Partial<import('./core/overview').OverviewConfig>;
    authorName?: string;
    authorEmail?: string;
    desktopNotifications?: boolean;
  };
};
export type Version = { id: string; at: number; page: Page };
export type NativeAPI = {
  rendererReady?: () => Promise<void>;
  folderMode?: boolean;
  loadDraft?: () => Promise<any>;
  saveDraft?: (draft:any) => Promise<void>;
  workspaceURL?: (path:string) => string;
  api: (
    method: string,
    params?: Record<string, any>,
    id?: string,
  ) => Promise<import('./core/protocol').ApiResponse>;
  onState: (callback: (event: import('./core/protocol').StateEvent) => void) => () => void;
  onUI: (callback: (event: import('./core/protocol').UiEvent) => void) => () => void;
  onAgent: (callback: (event: import('./core/protocol').AgentEventMessage) => void) => () => void;
  uploadToSpace: (
    pageId: string,
    folderId: string | null,
    name: string,
    bytes: ArrayBuffer,
  ) => Promise<SpaceFileRecord>;
  revealSpace: (pageId: string) => Promise<boolean>;
  chooseEngine: () => Promise<SpaceEngine | null>;
  onFlush: (callback: () => Promise<void>) => () => void;
  exportPage: (pageId: string, type: string) => Promise<boolean>;
  chooseImports: () => Promise<string[]>;
  load: () => Promise<{ workspace: Workspace | null; dataPath: string; version: string }>;
  save: (workspace: Workspace) => Promise<number>;
  saveAsset: (name: string, bytes: ArrayBuffer) => Promise<string>;
  exportAsset: (url: string, name: string) => Promise<boolean>;
  exportFile: (name: string, content: string) => Promise<boolean>;
  importFiles: () => Promise<{ name: string; content: string }[]>;
  exportBackup: () => Promise<boolean>;
  importBackup: () => Promise<Workspace | null>;
  revealData: () => Promise<void>;
  versions: (pageId: string) => Promise<Version[]>;
  snapshot: (page: Page) => Promise<void>;
  printPDF: (name: string) => Promise<boolean>;
  setTheme: (theme: string) => void;
  onCommand: (callback: (command: string) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
};
declare global {
  interface Window {
    native?: NativeAPI;
  }
}
