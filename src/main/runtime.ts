import {closeHostConnections} from './host-connections'
import {closeUploads} from './uploads'
import {closeInstallations} from './engines/installer'
import {closeEngineLogins} from './engines/login'
import {exposeClaudeSdk} from './engines/claude-sdk'
import {acquireRuntimeLock} from './runtime-lock'
import {publishReply} from './reply-receipts'
import {setManagementActivityEmitter,setManagementTask,clearManagementInteraction,pruneManagementActivity,resetManagementActivity} from './management-activity'
import {startInitializations,stopInitializations} from './initialization'
import {readStore,migrateEmployeePermissionDefaults} from './store'
import {employeeSettings} from '../shared/types'
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
import { conversation,transcriptItems,markTurnEnd, markTurnStart, recordClaude, recordCodex, recordAgent, recordUser, recordError, saveTranscript } from './transcripts'

/** One event stream for the CLI, persistence, and the optional desktop shell. */
export function startRuntime(notify: (channel: string, payload: any) => void = () => {}) {
  const releaseLock=acquireRuntimeLock()
  exposeClaudeSdk()
  setDesktopEvent(notify)
  setManagementActivityEmitter(state=>publishEvent('management:activity',state))
  migrateCloudTeams()
  migrateCloudHostBindings()
  migrateEmployeePermissionDefaults()
  initializeManagement()
  const initial=readStore()
  for(const card of initial.sessions)if(!card.deleting&&employeeSettings(initial,card).mode!=='cloud')try{ensureEmployeeBootstrap(card,initial)}catch(error){console.error('[employee initialization]',card.id,String(error))}
  const broadcast = (channel: string, payload: any) => {
    const id = payload?.sessionId
    if (id) {
      const state=getLive(id),cardId=payload.cardId??state?.cardId
      if(cardId&&channel==='session:turn-start'&&!state?.privateInitialization)setManagementTask(cardId,state?.currentTask)
      if(cardId&&['session:turn-end','session:interrupted','session:error','session:closed','session:end'].includes(channel))setManagementTask(cardId)
      if(['session:interrupted','session:error','session:closed','session:end'].includes(channel)){const cardId=payload.cardId??getLive(id)?.cardId;if(cardId)clearManagementInteraction(cardId)}
      if (channel === 'session:message') recordClaude(id, payload.message)
      if (channel === 'session:agent') recordAgent(id,payload.event)
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
  const unsubscribe = onStoreChange((store) => { reconcileSchedules();revokeInvalidDelegations();pruneManagementActivity(); broadcast('store:changed', store) })
  const unwindows=onPluginWindows(windows=>broadcast('plugin:windows',windows))
  const unview = onViewChange((state,clientId) => publishEvent('view:changed',state,clientId))
  startServer(() => {startInitializations();startScheduler(broadcast)})
  return async () => {closeEngineLogins();await closeInstallations();await closeUploads();resetManagementActivity(); await closePluginWindows(); unwindows(); unsubscribe(); unview(); await stopInitializations(); await stopScheduler(); await closeAll(); await closeTransfers(); closeRemoteFiles(); await closeHostConnections(); await closeTerminals(); stopServer(); setDesktopEvent(()=>{}); await closePlugins();releaseLock() }
}
