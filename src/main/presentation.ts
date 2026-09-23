import type { ViewState } from '../shared/view'
let view: ViewState = { kind: 'home', revision: 0 }
const listeners = new Set<(state: ViewState) => void>()
export const getView = () => view
export function setView(next: Omit<ViewState, 'revision'>): ViewState {
  view = { ...next, revision: view.revision + 1 }
  for (const listener of listeners) listener(view)
  return view
}
export function onViewChange(listener: (state: ViewState) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
