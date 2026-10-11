import type {GuardianEvent,GuardianEventFeed} from './guardian-events'

export const GUARDIAN_KIND_LABELS:Record<GuardianEvent['kind'],string>={
 'network-change':'连接变化',
 'cpu-rise':'CPU 负载变化',
 'memory-pressure':'内存压力变化',
 'security-change':'系统保护配置变化',
 manual:'人工登记'
}
export type GuardianReportSummary={
 periodStart:number;periodEnd:number
 total:number;open:number;reviewed:number;dismissed:number
 days:{date:string;count:number;reviewed:number}[]
 categories:{kind:GuardianEvent['kind'];label:string;count:number}[]
 observedOnly:boolean
}
export function summarizeGuardianEvents(feed:GuardianEventFeed|null,now=Date.now()):GuardianReportSummary{
 const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-6)
 const periodStart=start.getTime(),all=(feed?.events??[]).filter(event=>event.lastSeenAt>=periodStart&&event.lastSeenAt<=now)
 const days=Array.from({length:7},(_,index)=>{
  const at=new Date(periodStart);at.setDate(at.getDate()+index)
  const date=at.toLocaleDateString('sv-SE'),items=all.filter(item=>new Date(item.lastSeenAt).toLocaleDateString('sv-SE')===date)
  return {date,count:items.length,reviewed:items.filter(item=>item.status==='reviewed').length}
 })
 const categories=(Object.keys(GUARDIAN_KIND_LABELS) as GuardianEvent['kind'][]).map(kind=>({kind,label:GUARDIAN_KIND_LABELS[kind],count:all.filter(e=>e.kind===kind).length}))
 return {periodStart,periodEnd:now,total:all.length,open:all.filter(e=>e.status==='open').length,reviewed:all.filter(e=>e.status==='reviewed').length,dismissed:all.filter(e=>e.status==='dismissed').length,days,categories,observedOnly:true}
}
/** Intentionally contains no event titles, IPs, process names, paths, hostnames or investigation notes. */
export function guardianShareSummary(summary:GuardianReportSummary){
 const start=new Date(summary.periodStart).toLocaleDateString('zh-CN'),end=new Date(summary.periodEnd).toLocaleDateString('zh-CN')
 return ['Aexus Guardian · 匿名运营摘要',start+' 至 '+end,
  '有记录的变化：'+summary.total,
  '待核对：'+summary.open+'；人工已核对：'+summary.reviewed+'；已忽略：'+summary.dismissed,
  ...summary.categories.map(item=>item.label+'：'+item.count),
  '仅统计已保留的 Guardian 事件，含人工登记；没有采样的时间不代表系统正常。',
  '“已核对”代表人工检查记录，不证明已修复或节省成本。'
 ].join('\n')
}
