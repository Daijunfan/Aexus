import {useMemo,useState} from 'react'
import type {GuardianEventFeed} from '../../../../shared/guardian-events'
import {summarizeGuardianEvents,guardianShareSummary} from '../../../../shared/guardian-report'
import {Icon} from '../Icon'

type Props={feed:GuardianEventFeed|null;error:string;onEvent:(id:string)=>void;onEvents:()=>void;onPlan:()=>void}
export function GuardianReport({feed,error,onEvent,onEvents,onPlan}:Props){
 const [copied,setCopied]=useState('')
 const [day,setDay]=useState<string|null>(null)
 const report=useMemo(()=>summarizeGuardianEvents(feed),[feed])
 const max=Math.max(...report.days.map(item=>item.count),1)
 const dayEvents=(feed?.events??[]).filter(event=>!day||new Date(event.lastSeenAt).toLocaleDateString('sv-SE')===day)
 const copy=async()=>{try{await navigator.clipboard.writeText(guardianShareSummary(report));setCopied('已复制脱敏摘要')}catch{setCopied('无法复制，请检查剪贴板权限')}}
 const label=(at:number)=>new Date(at).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})
 return <div className="g-domain go-report" data-testid="guardian-report-panel">
  <div className="g-section-intro"><div><span className="g-eyebrow">GUARDIAN / VERIFIED OBSERVATIONS</span><h2>最近七天，做过什么、还有什么要管。</h2><p>按本机留存的事件生成运营摘要，结果只反映已有观察与人工确认。没有观测区间不能换算成正常运行或风险降低。</p></div><button onClick={()=>void copy()}><Icon name="copy"/>{copied||'复制脱敏周报'}</button></div>
  {error&&<p className="g-error" role="alert">{error}</p>}
  <div className="go-report-metrics"><div><span>留存的变化</span><strong>{report.total}</strong><small>含人工登记 · 最近 7 天</small></div><div><span>仍待核对</span><strong>{report.open}</strong><small>请先判断与自己工作的关系</small></div><div><span>人工已核对</span><strong>{report.reviewed}</strong><small>仅人工状态；未证明修复</small></div><div><span>已忽略</span><strong>{report.dismissed}</strong><small>可在事件室重新打开</small></div></div>
  <div className="go-report-columns"><section className="g-card go-report-trend"><header><h3>变化活动日历</h3><p>事件最近关联日期，点击可查看当日留存记录</p></header><div className="go-report-bars">{report.days.map(item=><button key={item.date} aria-pressed={day===item.date} title={item.date+' '+item.count+' 项事件'} onClick={()=>setDay(day===item.date?null:item.date)}><span className="go-report-bar"><i style={{height:Math.max(item.count?8:2,item.count/max*100)+'%'}}/></span><b>{item.count}</b><small>{label(new Date(item.date+'T12:00:00').getTime())}</small></button>)}</div><p className="g-caption">图表记录的是最近关联时间，不能证明变化起始时间。用户离线或未采样时存在空白。</p></section><section className="g-card go-report-categories"><header><h3>这七天的事件类型</h3><p>按已保留事件数量统计，不涉及威胁分数。</p></header>{report.categories.map(item=><div key={item.kind} className="go-report-type"><div><strong>{item.label}</strong><span>{item.count} 项</span></div><i><b style={{width:(item.count/Math.max(1,report.total)*100)+'%'}}/></i></div>)}</section></div>
  <section className="g-card go-report-list"><header><div><h3>{day?day+' 的变化记录':'最近留存的变化记录'}</h3><p>本地视图包含对象名称；复制的分享版仅包含汇总数量，不包含 IP、主机名、路径、进程、任务或备注。</p></div><button onClick={onEvents}>查看事件调查 →</button></header>{dayEvents.slice(0,12).map(event=><button key={event.id} className="go-report-event" onClick={()=>onEvent(event.id)}><div><small>{new Date(event.lastSeenAt).toLocaleString('zh-CN',{hour12:false})}</small><strong>{event.title}</strong></div><span>{event.status==='open'?'待核对':event.status==='reviewed'?'人工已核对':'已忽略'}</span><Icon name="arrow-right"/></button>)}{!dayEvents.length&&<div className="g-empty">{feed?'当前没有留存的事件。此结果不能证明七天内持续正常。':'尚未读取 Guardian 事件记录。'}</div>}</section>
  <section className="go-report-foot"><div><Icon name="info"/><span>仅按需采样 · 最近运行期间采样 {feed?.coverage.sampleCount??0} 次 · 上次观测 {feed?.coverage.lastSampledAt?new Date(feed.coverage.lastSampledAt).toLocaleString('zh-CN'):'未知'}。未计算节省时间、费用或阻止攻击次数。</span></div><button onClick={onPlan}>打开 Plan 查看维护行动 <Icon name="arrow-right"/></button></section>
 </div>
}
