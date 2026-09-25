import {publishReply} from './reply-receipts'
import {repairOfficeLayout} from './office'
import {startInitializations,stopInitializations} from './initialization'
import {readStore} from './store'
import {ensureEmployeeBootstrap} from './plugins/documents'
import {initializeManagement} from './management'
import {closeTransfers} from './transfers'
import {onPluginWindows,closePluginWindows} from './plugins/windows'
import { startScheduler, stopScheduler, reconcileSchedules } from './scheduler/service'
import { getLive,setEmitter, closeAll,revokeInvalidDelegations } from './sessions'
import { onStoreChange,migrateCloudTeams,migrateCloudHostBindings } from './store'
import { onViewChange } from './presentation'
import { publishEvent, setDesktopEvent, startServer, stopServer } from './server'
import { closePlugins } from './plugins/runtime'
import {setTerminalEmitter,closeTerminals} from './terminals'
import {closeRemoteFiles} from './tunnel'
import { conversation,transcriptItems,markTurnEnd, markTurnStart, recordClaude, recordCodex, recordUser, recordError, saveTranscript } from './transcripts'

/** One event stream for the CLI, persistence, and the optional desktop shell. */
export function startRuntime(notify: (channel: string, payload: any) => void = () => {}) {
  setDesktopEvent(notify)
  migrateCloudTeams()
  migrateCloudHostBindings()
  initializeManagement()
  repairOfficeLayout()
  const initial=readStore()
  for(const card of initial.sessions)if(!card.deleting&&initial.teamSettings?.[card.group]?.mode!=='cloud')try{ensureEmployeeBootstrap(card,initial)}catch(error){console.error('[employee initialization]',card.id,String(error))}
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
      if(channel==='session:turn-end'&&!conversation(id).error){const state=getLive(id);if(state&&!state.privateInitialization)publishReply(state.cardId,transcriptItems(id),state.currentTask?.messageId)}
    }
    publishEvent(channel, payload)
  }
  setEmitter(broadcast)
  setTerminalEmitter(broadcast)
  const unsubscribe = onStoreChange((store) => { reconcileSchedules();revokeInvalidDelegations(); broadcast('store:changed', store) })
  const unwindows=onPluginWindows(windows=>broadcast('plugin:windows',windows))
  const unview = onViewChange(state => broadcast('view:changed', state))
  startServer(() => {startInitializations();startScheduler(broadcast)})
  return async () => { await closePluginWindows(); unwindows(); unsubscribe(); unview(); await stopInitializations(); await stopScheduler(); await closeAll(); await closeTransfers(); closeRemoteFiles(); await closeTerminals(); stopServer(); setDesktopEvent(()=>{}); await closePlugins() }
}
