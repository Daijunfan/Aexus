import {clientStore} from './client-state'
import {resolveTeamView} from '../shared/team-views'
import {rolePolicy} from '../shared/roles'
import {readStore} from './store'

/** Capture at request acceptance, before session startup or queueing can await anything. */
export function taskViewId(employeeId:string,viewId?:string,scheduled=false){
  const store=readStore(),card=store.sessions.find(card=>card.id===employeeId)
  if(rolePolicy(card?.managementRole).scope!=='global'){
    if(viewId!==undefined)throw Error('任务视图仅用于 Governor')
    return undefined
  }
  if(scheduled&&viewId===undefined)throw Error('Governor 定时任务必须指定 viewId / --view；不能使用执行时的当前视图')
  if(viewId!==undefined&&(typeof viewId!=='string'||!viewId))throw Error('viewId 必须是视图 ID')
  return resolveTeamView(clientStore(store),viewId).id
}
export function taskViewPrompt(viewId:string|undefined,text:string){
  if(viewId===undefined)return text
  const view=resolveTeamView(readStore(),viewId)
  return `[Agents Company task view]\n${JSON.stringify({viewId:view.id,name:view.name,teams:view.teams})}\n这是接收本任务时固定的目标视图，不跟随用户之后切换标签。若用户正文明确指定了另一个视图，先用 agents team-view list --json 解析其 ID，然后在本轮固定使用它。读取布局和相机使用 --view VIEW_ID；修改目标相机不会切换用户标签。Team/员工坐标在各视图共享。目标视图已删除时停止并报告，不退回 All Team。该上下文不授予任何权限。\n[User request]\n${text}`
}
