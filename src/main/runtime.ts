import {closeTransfers} from './transfers'
import {onPluginWindows,closePluginWindows} from './plugins/windows'
import { startScheduler, stopScheduler, reconcileSchedules } from './scheduler/service'
import { setEmitter, closeAll } from './sessions'
import { onStoreChange,migrateCloudTeams,migrateCloudHostBindings } from './store'
import { onViewChange } from './presentation'
import { publishEvent, setDesktopEvent, startServer, stopServer } from './server'
import { closePlugins } from './plugins/runtime'
import {setTerminalEmitter,closeTerminals} from './terminals'
import {closeRemoteFiles} from './tunnel'
import { markTurnEnd, markTurnStart, recordClaude, recordCodex, recordUser, recordError, saveTranscript } from './transcripts'

/** One event stream for the CLI, persistence, and the optional desktop shell. */
export function startRuntime(notify: (channel: string, payload: any) => void = () => {}) {
  setDesktopEvent(notify)
  migrateCloudTeams()
  migrateCloudHostBindings()
  const broadcast = (channel: string, payload: any) => {
    const id = payload?.sessionId
    if (id) {
      if (channel === 'session:message') recordClaude(id, payload.message)
      if (channel === 'session:codex') recordCodex(id, payload.event)
      if (channel === 'session:user') recordUser(id, payload.text,payload.images)
      if (channel === 'session:turn-start') markTurnStart(id)
      if (channel === 'session:turn-end' || channel === 'session:interrupted') markTurnEnd(id)
      if (channel === 'session:error') recordError(id, payload.message)
      if (['session:user', 'session:turn-end', 'session:interrupted', 'session:error'].includes(channel)) saveTranscript(id)
    }
    publishEvent(channel, payload)
  }
  setEmitter(broadcast)
  setTerminalEmitter(broadcast)
  const unsubscribe = onStoreChange((store) => { reconcileSchedules(); broadcast('store:changed', store) })
  const unwindows=onPluginWindows(windows=>broadcast('plugin:windows',windows))
  const unview = onViewChange(state => broadcast('view:changed', state))
  startServer(() => startScheduler(broadcast))
  return async () => { await closePluginWindows(); unwindows(); unsubscribe(); unview(); await stopScheduler(); await closeAll(); await closeTransfers(); closeRemoteFiles(); await closeTerminals(); stopServer(); setDesktopEvent(()=>{}); await closePlugins() }
}
