import {APP_VIEWS,type AppViewId} from './app-views.ts'

/** The sender's presentation at send time; independent of Governor's target team-view scope. */
export type MessageSourceView=AppViewId
export const SOURCE_VIEW_LABELS:Record<MessageSourceView,string>={company:'Company',messages:'Messages',plan:'Plan'}
export const SOURCE_VIEW_SCHEMA={type:'string',enum:APP_VIEWS.map(view=>view.id),description:'Optional sender-declared presentation at send time (company/messages/plan). Context only: not a target, permission or current-screen lookup. Preserve on unchanged retries.'}
export function messageSourceView(value:unknown):MessageSourceView|undefined{
 if(value===undefined)return undefined
 if(!APP_VIEWS.some(view=>view.id===value))throw Error('sourceView must be company, messages or plan')
 return value as MessageSourceView
}
