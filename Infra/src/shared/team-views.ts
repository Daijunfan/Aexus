import {ALL_TEAM_VIEW,type Store,type TeamView} from './types'

/** Views select membership and cameras; Team/employee positions remain global. */
export function resolveTeamView(store:Store,id=store.activeTeamViewId??ALL_TEAM_VIEW):TeamView {
  if(id===ALL_TEAM_VIEW)return {id,name:'All Team',teams:store.groups,viewport:store.viewport}
  const view=store.teamViews?.find(view=>view.id===id)
  if(!view)throw new Error('目标视图不存在或已删除：'+id)
  return view
}
