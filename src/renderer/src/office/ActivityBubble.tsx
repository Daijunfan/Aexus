import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import type {ActivityPreview} from '../../../shared/types'
import {Icon} from '../components/Icon'
export function ActivityBubble({activity}:{activity:ActivityPreview}){
  useI18n()

 return <aside className={`activity-bubble bubble-${activity.kind} ${activity.unread?'bubble-unread':''}`} data-unread={activity.unread?'true':undefined} data-activity-kind={activity.kind} aria-label={activity.unread?uiText("Unread reply"):activity.kind==='thinking'?uiText("Thinking summary"):activity.kind==='speech'?uiText("Employee message"):uiText("Tool operation")}>
  <header><Icon name={activity.kind==='tool'?'terminal':activity.kind==='thinking'?'lightbulb':'comment'}/>{activity.unread&&<i className="unread-dot" aria-label={uiText("Unread")}/>}<span>{activity.unread?uiText("Unread reply"):activity.kind==='tool'?activity.tool:activity.kind==='thinking'?uiText("Thinking"):uiText("Speaking")}</span>{activity.kind==='tool'&&<small>{activity.running?uiText("Running"):uiText("Completed")}</small>}</header>
  <div className="activity-text" title={activity.unread?activity.text:undefined}>{activity.text}</div>{activity.detail&&<pre>{activity.detail}</pre>}
 </aside>
}
