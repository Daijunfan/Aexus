import type { TeamSettings } from './types'

/** Navigation belongs to the CLI service, even when no desktop is attached. */
export type ViewState = {
  kind: 'home' | 'team' | 'employee' | 'workspace' | 'conversation' | 'settings' | 'plugin' | 'clone'
  revision: number
  name?: string
  pluginId?: string
  employee?: string
  settings?: TeamSettings
  tools?:'skills'|'mcp'|'account'|'usage'|'config'|'export'|'background'
  details?: boolean
}
