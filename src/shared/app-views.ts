/** Presentation modes share the same employees, histories, receipts and Core APIs. */
export const APP_VIEWS = [
  {id:'company', label:'Company', icon:'organization', kind:'home', defaultTeamView:'all'},
  {id:'messages', label:'Messages', icon:'comment-discussion', kind:'messages'},
  {id:'plan', label:'Plan', icon:'calendar', kind:'plan'},
  {id:'guardian', label:'Guardian', icon:'shield', kind:'guardian'}
] as const
export type AppViewId = typeof APP_VIEWS[number]['id']
export const appView = (id:unknown) => APP_VIEWS.find(view=>view.id===id)
