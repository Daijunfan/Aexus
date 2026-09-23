import type { ScheduledAction } from '../../shared/scheduler'
import { readStore } from '../store'
import { startSession, getLive, reserveEmployee, onSessionEvent, sendMessage, setPlanMode, setFastMode, setModel, setEffort, setThinking, closeSession } from '../sessions'

/** A scheduled turn uses the employee's one conversation and inherited scope.
 * Overrides are live-only: persisted/manual model preferences survive crashes. */
export async function executeTask(action: ScheduledAction, owner: string, signal: AbortSignal, opened: (id: string) => void) {
  const release = reserveEmployee(action.employeeId, owner)
  let id: string | undefined, unsubscribe = () => {}, restore: (() => Promise<void>) | undefined
  let abort = () => {}
  try {
    if (readStore().sessions.find(c => c.id === action.employeeId)?.engine !== action.engine) throw new Error('Employee engine changed; update this schedule before running it')
    signal.throwIfAborted()
    id = (await startSession({ cardId: action.employeeId }, owner)).sessionId
    opened(id)
    if (signal.aborted) { await closeSession(id); signal.throwIfAborted() }
    const state = getLive(id)!
    const original = { model: state.model, effort: state.effort, thinking: state.thinkingEnabled, fastMode:state.fastMode??false,planMode:state.planMode??false }
    restore = async () => {
      if (!getLive(id!)) return
      if (getLive(id!)!.model!==original.model) await setModel(id!, original.model, owner)
      if (getLive(id!)!.effort!==original.effort) await setEffort(id!, original.effort, owner)
      if (getLive(id!)!.thinkingEnabled!==original.thinking) await setThinking(id!, original.thinking, owner)
      if ((getLive(id!)!.planMode??false)!==original.planMode) await setPlanMode(id!,original.planMode,owner)
      if ((getLive(id!)!.fastMode??false)!==original.fastMode) await setFastMode(id!,original.fastMode,owner)
    }
    if (action.model !== undefined) await setModel(id, action.model, owner)
    if (action.effort !== undefined) await setEffort(id, action.effort, owner)
    if (action.thinking !== undefined && !await setThinking(id, action.thinking, owner)) throw new Error('Codex uses effort; thinking is a Claude-only setting')
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      let failure: string | undefined
      unsubscribe = onSessionEvent((channel, raw) => {
        const p = raw as any
        if (p?.sessionId !== id) return
        if (channel === 'session:codex' && p.event?.kind === 'notice' && p.event.level === 'error') failure = p.event.text
        if (channel === 'session:message' && p.message?.type === 'result' && (p.message.is_error || p.message.subtype !== 'success')) failure = p.message.errors?.join('; ') || p.message.subtype
        if (channel === 'session:turn-end') failure ? reject(new Error(failure)) : resolve()
        if (['session:error', 'session:end', 'session:closed', 'session:interrupted'].includes(channel)) reject(new Error(p.message || 'Employee conversation was stopped'))
      })
      abort = () => { void closeSession(id!).then(() => reject(signal.reason), reject) }
      signal.addEventListener('abort', abort, { once: true })
      try { signal.throwIfAborted(); void sendMessage(id!, action.prompt, owner).catch(reject) } catch (error) { reject(error) }
    })
  } catch (error) {
    if (id && getLive(id)?.running) await closeSession(id)
    throw error
  } finally {
    unsubscribe()
    signal.removeEventListener('abort', abort)
    try {
      // Wait for a Codex turn to release the native writer before restoring options.
      if (id && getLive(id)?.engine === 'codex') await getLive(id)?.finished
      await restore?.()
    } catch (error) { if (id) await closeSession(id); throw error }
    finally { release() }
  }
}
