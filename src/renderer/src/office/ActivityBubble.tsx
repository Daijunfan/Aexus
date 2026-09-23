import type {ActivityPreview} from '../../../shared/types'
import {Icon} from '../components/Icon'
export function ActivityBubble({activity}:{activity:ActivityPreview}){
 return <aside className={`activity-bubble bubble-${activity.kind}`} data-activity-kind={activity.kind} aria-label={activity.kind==='thinking'?'思考摘要':activity.kind==='speech'?'员工发言':'工具操作'}>
  <header><Icon name={activity.kind==='tool'?'terminal':activity.kind==='thinking'?'lightbulb':'comment'}/><span>{activity.kind==='tool'?activity.tool:activity.kind==='thinking'?'思考中':'正在说'}</span>{activity.kind==='tool'&&<small>{activity.running?'执行中':'已完成'}</small>}</header>
  <div className="activity-text">{activity.text}</div>{activity.detail&&<pre>{activity.detail}</pre>}
 </aside>
}
