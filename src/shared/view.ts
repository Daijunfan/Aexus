import type { TeamSettings } from './types'

/** Navigation belongs to the CLI service, even when no desktop is attached. */
export type ViewState = {
  kind: 'home' | 'team' | 'employee' | 'workspace' | 'conversation' | 'initialization' | 'settings' | 'plugin' | 'clone' | 'messages' | 'plan'
  revision: number
  name?: string
  pluginId?: string
  employee?: string
  chatId?: string
  channelId?: string
  sourceId?: string
  planViewId?: string
  settings?: TeamSettings
  tools?:'skills'|'mcp'|'account'|'usage'|'config'|'export'|'background'
  details?: boolean
  shared?: boolean
  /** Return from an existing workbench or editor to its originating direct message. */
  returnTo?: {kind:'messages';employee?:string;chatId?:string;channelId?:string;sourceId?:string}|{kind:'plan';planViewId?:string}
}
