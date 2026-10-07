/** A presentation stamp describes the receiving window, never a task's execution owner. */
export type PresentationStamp = { engineScope: string | null; viewRevision: number }
export type PresentationEvent<T = unknown> = {
  channel: string
  payload: T
  presentation?: PresentationStamp
}

/** Attach metadata only to the presentation copy. The internal Core event stays unchanged. */
export function stampPresentationEvent<T>(
  event: PresentationEvent<T> | null,
  engineScope: string | null,
  viewRevision: number
): PresentationEvent<T> | null {
  return event && { ...event, presentation: { engineScope, viewRevision } }
}

/** Reject data queued for a previous Engine, including a previous visit to the same Engine. */
export function acceptsPresentationEvent(
  event: PresentationEvent,
  engineScope: string | null | undefined,
  minimumViewRevision: number
): boolean {
  // Navigation establishes the new scope; authentication/visibility messages can be unscoped.
  if (event.channel === 'view:changed') return true
  const stamp = event.presentation
  if (stamp === undefined) return true // Legacy transport and local lifecycle notifications.
  return stamp !== null &&
    stamp.engineScope === engineScope &&
    Number.isSafeInteger(stamp.viewRevision) &&
    stamp.viewRevision >= minimumViewRevision
}
