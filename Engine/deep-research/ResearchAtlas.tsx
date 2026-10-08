import type {WorkflowView} from '../../Contract/workflow'
import './atlas.css'

type Criterion={id:string;label:string;current:number;required:number;met:boolean}
type Route={workerId:string;label:string;engine:string;model:string|null;status:string;tracks:string[];sourceIds:string[];findings:number;completedTasks:number;totalTasks:number}
type Domain={domain:string;count:number;sourceIds:string[]}
const statuses:Record<string,string>={ready:'等待分派',queued:'准备执行',running:'正在研究',approval:'等待审批',completed:'步骤完成',paused:'已暂停',failed:'需要处理'}
function Glyph({kind}:{kind:'network'|'evidence'|'review'}){
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{kind==='network'?<><circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="M10.5 7.5 6.5 15.5M13.5 7.5l4 8M8 18h8"/></>:kind==='evidence'?<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>:<><path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>}</svg>
}

/** Visualizes recorded workflow dependencies and checked evidence, not private reasoning. */
export function ResearchAtlas({job,onInspect}:{job:WorkflowView;onInspect:(query:string)=>void}){
 const s=job.summary,insights=s.insights
 if(!insights)return <div className="a-dr-workbench-empty">此历史任务未记录逐研究员贡献。原有证据、审查和最终报告仍可在其他标签中查看。</div>
 const routes:Route[]=insights.routes??[],criteria:Criterion[]=insights.criteria??[],domains:Domain[]=insights.domains??[]
 const lead=s.workers?.find((w:any)=>w.role==='lead'),review=insights.reviews??{},citations=insights.citations??{}
 const live=job.status==='running',ready=insights.evidenceReady,complete=job.status==='completed'
 return <div className="a-dr-atlas" data-live={live}>
  <div className="a-dr-atlas-heading"><div><span className="a-dr-eyebrow">RESEARCH ATLAS</span><h3>从独立研究，到可核对的结论</h3></div><span className="a-dr-atlas-live" data-live={live}><i/>{live?'研究进行中':complete?'研究已交付':job.status==='paused'?'已暂停':'已保存检查点'}</span></div>
  <div className="a-dr-atlas-layout">
   <section className="a-dr-flow-map" aria-label="多 Agent 研究协作图">
    <div className="a-dr-flow-lead"><span className="a-dr-atlas-symbol"><Glyph kind="network"/></span><div><small>01 · 规划与协调</small><strong>{lead?.label??'研究主编'}</strong><p>{lead?lead.engine+(lead.model?' · '+lead.model:''):'确认目标后创建独立原生会话'}</p></div><span className="a-dr-flow-role">LEAD</span></div>
    <div className="a-dr-flow-branches" style={{'--route-count':Math.max(1,routes.length)} as React.CSSProperties}>
     {routes.length?routes.map((route,i)=>{const total=Math.max(0,route.totalTasks||0),done=Math.max(0,Math.min(total,route.completedTasks||0)),percent=total?Math.round(100*done/total):0;return <article className="a-dr-flow-route" key={route.workerId} data-status={route.status}>
      <header><span className="a-dr-route-number">{String(i+1).padStart(2,'0')}</span><span className="a-dr-route-state"><i/>{statuses[route.status]??route.status}</span></header>
      <strong>{route.label}</strong><small className="a-dr-route-engine" title={route.engine+(route.model?' · '+route.model:'')}>{route.engine}{route.model?' · '+route.model:''}</small>
      <p title={route.tracks.join('；')}>{route.tracks.join('；')||'方案确认后分配独立研究路线'}</p>
      <div className="a-dr-route-progress">
       <div className="a-dr-route-progress-label"><span>任务进度</span><strong>{total?done+' / '+total+' 步':'等待分派'}</strong></div>
       <div className="a-dr-route-progress-track" role="progressbar" aria-label={route.label+' 已完成步骤'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={total?done+' / '+total+' 步完成':'尚未分配步骤'}><span style={{width:percent+'%'}}/></div>
      </div>
      <footer><span><b>{route.sourceIds.length}</b> 核验来源</span><span><b>{route.findings}</b> 引证发现</span></footer>
     </article>}):<div className="a-dr-flow-await">确认目标 → 制定方案 → 并行分派</div>}
    </div>
    <div className="a-dr-flow-hub" data-ready={ready}><span className="a-dr-atlas-symbol"><Glyph kind="evidence"/></span><div><small>02 · 汇集与独立核验</small><strong>共享证据池</strong><p>逐条匹配摘录 · 保留贡献者 · 绑定页面指纹</p></div><b>{s.sourceCount??0}<small>来源</small></b></div>
    <div className="a-dr-flow-review"><span className="a-dr-atlas-symbol"><Glyph kind="review"/></span><div><small>03 · 审查与交付</small><strong>独立复核，再生成报告</strong><div className="a-dr-review-checks"><span data-passed={review.evidence==='pass'}>{review.evidence==='pass'?'✓':'○'} 证据审查</span><span data-passed={review.report==='pass'}>{review.report==='pass'?'✓':'○'} 报告审查</span><span data-passed={complete}>{complete?'✓':'○'} 最终交付</span></div></div></div>
    <p className="a-dr-atlas-caption">连线表示工作流依赖；状态来自已保存的原生任务记录，不展示内部推理，也不模拟实时消息。</p>
   </section>
   <aside className="a-dr-quality-panel" aria-label="研究质量门槛">
    <header><span className="a-dr-eyebrow">EVIDENCE GATES</span><h4>交付前，逐项检查。</h4><p>{criteria.filter(c=>c.met).length} / {criteria.length} 项证据数量门槛达到</p></header>
    {criteria.map(criterion=><div className="a-dr-quality-gate" key={criterion.id} data-met={criterion.met}><div><span>{criterion.label}</span><strong>{criterion.current}<small> / {criterion.required}</small></strong></div><meter min={0} max={Math.max(criterion.required,criterion.current,1)} value={criterion.current} low={criterion.required} optimum={criterion.required} aria-label={criterion.label+'数量门槛'}/><small>{criterion.met?'已达到最低数量':'还需 '+Math.max(0,criterion.required-criterion.current)+' 项'}</small></div>)}
    <div className="a-dr-quality-notes"><span><b>{citations.checkedExcerpts??0}</b> 条已匹配摘录</span><span><b>{citations.multiEngineSources??0}</b> 个来源有多引擎贡献</span><span data-warning={!!citations.rejectedFindings}><b>{citations.rejectedFindings??0}</b> 条发现因引用未核验而拦截</span></div>
    <p className="a-dr-atlas-caption">数量达标仍须通过结论支持检查与最终报告审查。以上数值不表示正确率。</p>
   </aside>
  </div>
  {!!domains.length&&<section className="a-dr-domain-map" aria-label="来源网站分布"><header><div><span className="a-dr-eyebrow">SOURCE DIVERSITY</span><h4>检查证据来自哪里</h4></div><span>{domains.length} 个网站 · {citations.citedSources??0} 个来源已被发现引用</span></header><div className="a-dr-domain-grid">{domains.map(domain=><button type="button" key={domain.domain} onClick={()=>onInspect(domain.domain)} aria-label={'查看 '+domain.domain+' 的来源'}><span><strong>{domain.domain}</strong><b>{domain.count}</b></span><span className="a-dr-domain-bar"><i style={{width:(domain.count/Math.max(s.sourceCount??1,1)*100)+'%'}}/></span><small>{domain.sourceIds.slice(0,6).join(' · ')}{domain.sourceIds.length>6?' · …':''}<span>查看证据 ↗</span></small></button>)}</div><p className="a-dr-atlas-caption">网站按域名统计；不同网站可能引用同一原始材料，不能据此认定来源相互独立。</p></section>}
 </div>
}
