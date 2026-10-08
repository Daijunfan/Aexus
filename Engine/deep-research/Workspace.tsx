import {useEffect,useMemo,useRef,useState} from 'react'
import type {WorkflowView} from '../../Contract/workflow'
import {ResearchAtlas} from './ResearchAtlas'

export type ResearchConfig={depth:string;language:string;allowedDomains:string;preferredDomains:string;excludedDomains:string;seedUrls:string;materials:{name:string;text:string}[]}
export const initialConfig:ResearchConfig={depth:'standard',language:'zh-CN',allowedDomains:'',preferredDomains:'',excludedDomains:'',seedUrls:'',materials:[]}
const split=(text:string)=>text.split(/[\n,，;；]+/).map(s=>s.trim()).filter(Boolean)
export const policyInput=(value:ResearchConfig)=>({allowedDomains:split(value.allowedDomains),preferredDomains:split(value.preferredDomains),excludedDomains:split(value.excludedDomains),seedUrls:split(value.seedUrls)})
export function ResearchOptions({value,onChange,onError,disabled=false,allowMaterials=true,onBusyChange}:{value:ResearchConfig;onChange:(value:ResearchConfig)=>void;onError:(message:string)=>void;disabled?:boolean;allowMaterials?:boolean;onBusyChange?:(busy:boolean)=>void}){
 const [reading,setReading]=useState(false),latest=useRef(value);latest.current=value
 const patch=(key:keyof ResearchConfig,text:string)=>onChange({...value,[key]:text})
 const upload=async(files:FileList|null)=>{
  if(!files?.length)return;setReading(true);onBusyChange?.(true)
  try{
   if(value.materials.length+files.length>6)throw Error('最多添加 6 份文本参考材料')
   const added=[]
   for(const file of Array.from(files)){
    const pdf=/\.pdf$/i.test(file.name)
    if(!/\.(txt|md|csv|json|pdf)$/i.test(file.name)||file.size>(pdf?8*1024*1024:320000))throw Error('支持 TXT、Markdown、CSV、JSON（320 KB）或可选取文字的 PDF（8 MiB）')
    const text=pdf?await (await import('./document.mjs')).extractPdfText(await file.arrayBuffer(),{maxChars:80000}):await file.text()
    if(!text.trim()||text.length>80000||/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(text))throw Error('参考材料须包含有效文字，单份最多 80,000 字符')
    added.push({name:file.name,text})
   }
   const materials=[...latest.current.materials,...added];if(materials.length>6)throw Error('最多添加 6 份文本参考材料');if(materials.reduce((n,m)=>n+m.text.length,0)>200000)throw Error('参考材料总计最多 200,000 字符')
   onChange({...latest.current,materials})
  }catch(error){onError((error as Error).message)}finally{setReading(false);onBusyChange?.(false)}
 }
 return <div className="a-dr-options">
  <div className="a-dr-depth" role="group" aria-label="研究深度">{[['standard','标准研究','4+ 来源 · 2+ 网站'],['deep','深入研究','8+ 来源 · 3+ 网站'],['exhaustive','广泛研究','12+ 来源 · 4+ 网站']].map(([id,label,caption],i)=><button type="button" key={id} disabled={disabled} aria-pressed={value.depth===id} onClick={()=>patch('depth',id)}><span className="a-dr-depth-icon" aria-hidden="true">{'▰'.repeat(i+1)}</span><strong>{label}</strong><small>{caption}</small></button>)}</div>
  <details className="a-dr-source-options"><summary>{allowMaterials?'研究范围与参考材料':'修订来源范围'} <span>{allowMaterials?'网站约束 / 起始链接 / 文件 / 语言':'网站约束 / 起始链接'}</span></summary><div className="a-dr-options-grid">
   <label>仅使用这些网站<input disabled={disabled} aria-label="允许的来源网站" value={value.allowedDomains} onChange={e=>patch('allowedDomains',e.target.value)} placeholder="例如 nature.com, arxiv.org"/><small>留空可使用公开网络；填写域名，不含路径。</small></label>
   <label>优先使用的网站<input disabled={disabled} aria-label="优先来源网站" value={value.preferredDomains} onChange={e=>patch('preferredDomains',e.target.value)} placeholder="官方文档、原始数据的域名"/><small>优先搜索这些域名，同时保留其他可用来源。</small></label>
   <label>排除的网站<input disabled={disabled} aria-label="排除的来源网站" value={value.excludedDomains} onChange={e=>patch('excludedDomains',e.target.value)} placeholder="不希望引用的网站域名"/></label>
   {allowMaterials&&<label>报告语言<select disabled={disabled} aria-label="报告语言" value={value.language} onChange={e=>patch('language',e.target.value)}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>}
   <label className="a-dr-option-wide">起始来源链接<textarea disabled={disabled} aria-label="起始来源链接" value={value.seedUrls} onChange={e=>patch('seedUrls',e.target.value)} placeholder="每行一个公开网页链接；最多 12 个。" rows={2}/></label>
  </div>{allowMaterials&&<div className="a-dr-materials"><label className="a-dr-upload">{reading?'正在提取文字…':'＋ 添加参考材料 · 支持 PDF'}<input type="file" aria-label="添加参考材料" multiple accept=".txt,.md,.csv,.json,.pdf" disabled={disabled||reading} onChange={e=>{void upload(e.target.files);e.target.value=''}}/></label><small>PDF 会在本机提取文字（限 8 MiB、80 页，扫描件需先 OCR）；仅在确认目标后将提取文本发送至选定研究模型。附件作为背景，不计入独立核验证据；暂不支持云盘连接器。</small>{value.materials.map((m,i)=><div key={i}><span>{m.name} <small>{m.text.length.toLocaleString()} 字符</small></span><button disabled={disabled} type="button" aria-label={'移除 '+m.name} onClick={()=>onChange({...value,materials:value.materials.filter((_,j)=>j!==i)})}>×</button></div>)}</div>}</details>
 </div>
}
const statusText:Record<string,string>={ready:'已就绪',queued:'准备中',running:'执行中',approval:'等待审批',completed:'步骤完成',failed:'需要处理',paused:'已暂停'}
const clock=(value:number)=>{const seconds=Math.max(0,Math.floor(value/1000));return `${Math.floor(seconds/3600)?Math.floor(seconds/3600)+'h ':''}${Math.floor(seconds/60)%60}m ${seconds%60}s`}
const taskKinds:Record<string,string>={plan:'方案设计',research:'资料搜集',review:'证据审查',report:'综合撰写'}
function AgentLane({worker,index,tasks,onOpen}:{worker:any;index:number;tasks:any[];onOpen:(id:string)=>void}){
 const own=tasks.filter(task=>task.employeeId===worker.id),latest=own.at(-1),done=own.filter(task=>task.status==='completed').length
 const status=latest?.status??worker.status??'ready',stage=latest?taskKinds[latest.kind]??latest.title:'等待任务分派'
 return <button className="a-dr-lane" key={worker.id} type="button" data-status={status} onClick={()=>onOpen(worker.id)} aria-label={'查看 '+(worker.label??worker.title)+' 的原生会话'}>
  <span className="a-dr-agent-monogram">{['L','E','C','S'][index]??'A'}</span>
  <span className="a-dr-lane-body"><span className="a-dr-lane-head"><strong>{worker.label??worker.title}</strong><span className="a-dr-agent-state"><i/>{statusText[status]??status}</span></span>
   <small className="a-dr-lane-model">{worker.engine}{worker.model?' · '+worker.model:''}</small>
   <span className="a-dr-lane-track" aria-hidden="true"><span style={{width:(own.length?100*done/own.length:0)+'%'}}/></span>
   <span className="a-dr-lane-footer"><span>{stage}</span><span>{done} / {own.length} 步已完成</span></span>
  </span>
 </button>
}
export function ResearchMonitor({job,onOpen}:{job:WorkflowView;onOpen:(id:string)=>void}){
 const [now,setNow]=useState(Date.now())
 useEffect(()=>{if(job.status!=='running')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[job.status])
 const s=job.summary,metrics=s.metrics??{},progress=job.status==='completed'?100:Math.min(99,s.progress??0)
 const elapsed=(s.finishedAt?Date.parse(s.finishedAt):job.status==='running'?now:job.updatedAt)-Date.parse(s.startedAt??new Date(job.createdAt).toISOString())
 return <section className="a-dr-monitor" aria-label="研究进度监控">
  <div className="a-dr-monitor-top"><div><span className="a-dr-eyebrow">RESEARCH CONTROL</span><h2>{job.status==='paused'?'研究已暂停':s.phaseLabel}</h2><p>{metrics.completedTasks??0} / {metrics.totalTasks??0} 个步骤完成 <span>·</span> 已历时 {clock(elapsed)}</p></div><div className="a-dr-progress-value"><strong>{progress}<small>%</small></strong><span>工作流进度</span></div></div>
  <div className="a-dr-progress-track" role="progressbar" aria-label="研究工作流进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${s.phaseLabel}，阶段进度 ${progress}%`}><span style={{width:progress+'%'}}/></div>
  <p className="a-dr-progress-note">按阶段、已完成步骤及已核验来源计算；不代表结论置信度或预计剩余时间。状态确认于 {new Date(job.updatedAt).toLocaleTimeString()}。</p>
  <div className="a-dr-metric-grid">{[[s.sourceCount??0,'核验来源',`目标 ≥${s.budget?.minSources??4}`],[s.domainCount??0,'来源网站',`目标 ≥${s.budget?.minDomains??2}`],[metrics.findings??0,'有引证发现','事实与分析分开'],[metrics.activeTasks??0,'活跃任务','执行或等待审批']].map(([n,label,caption])=><div key={label}><strong>{n}</strong><span>{label}</span><small>{caption}</small></div>)}</div>
  {s.verification&&<div className="a-dr-verification" role="status">本轮来源核验 <b>{s.verification.checked} / {s.verification.total}</b>{s.verification.pendingAgents>0&&<small>另有 {s.verification.pendingAgents} 位研究员处理中</small>}<span>{s.verification.accepted} 接受 · {s.verification.rejected} 未通过</span></div>}
  {!!s.workers?.length&&<div className="a-dr-agent-flow" aria-label="多 Agent 协作状态">{s.workers.map((worker:any,i:number)=><AgentLane key={worker.id} worker={worker} index={i} tasks={s.tasks??[]} onOpen={onOpen}/>)}</div>}
 </section>
}
export function EvidenceExplorer({job}:{job:WorkflowView}){
 const [tab,setTab]=useState('atlas'),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[limit,setLimit]=useState(12)
 const s=job.summary,sourceList:any[]=s.evidence??[],findings:any[]=s.findings??[],tasks:any[]=s.tasks??[]
 const sources=useMemo(()=>sourceList.filter(source=>(filter==='all'||source.sourceType===filter)&&(/^S[0-9]+$/i.test(query.trim())?source.id.toLowerCase()===query.trim().toLowerCase():[source.id,source.title,source.url,source.quote,...(source.excerpts??[]).map((e:any)=>e.quote)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()))),[sourceList,filter,query])
 const selectSource=(id:string)=>{setTab('sources');setQuery(id);setFilter('all');setLimit(12)}
 const tabs=[['atlas','协作图',s.workers?.length??0],['sources','证据池',sourceList.length],['findings','研究发现',findings.length],['review','审查与缺口',(s.gaps?.length??0)+(s.review?.issues?.length??0)+(s.reportReview?.issues?.length??0)],['activity','活动记录',tasks.length]]
 return <section className="a-dr-card a-dr-explorer"><header><div><small className="a-dr-eyebrow">EVIDENCE WORKBENCH</small><h2>每个判断，都有出处。</h2></div><span>公开状态 · {job.status==='completed'?'已核验交付记录':'非最终交付'}</span></header>
  <div className="a-dr-evidence-tabs" role="tablist" aria-label="研究工作台" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')),index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;setTab(String(tabs[next][0]));buttons[next]?.focus()}}>{tabs.map(([id,label,n])=><button key={id} id={'research-tab-'+id} type="button" role="tab" tabIndex={tab===id?0:-1} aria-selected={tab===id} aria-controls="research-panel" onClick={()=>setTab(String(id))}>{label}<small>{n}</small></button>)}</div>
  <div id="research-panel" role="tabpanel" aria-labelledby={'research-tab-'+tab}>
   {tab==='atlas'&&<ResearchAtlas job={job} onInspect={selectSource}/>}
   {tab==='sources'&&<><div className="a-dr-evidence-search"><input type="search" aria-label="搜索研究证据" placeholder="搜索标题、网站、摘录或 S 编号" value={query} onChange={e=>{setQuery(e.target.value);setLimit(12)}}/><select aria-label="来源类型" value={filter} onChange={e=>{setFilter(e.target.value);setLimit(12)}}><option value="all">全部来源</option><option value="primary">一手来源</option><option value="secondary">二手来源</option></select></div>{sources.slice(0,limit).map(source=><article className="a-dr-evidence-item" key={source.id}><div className="a-dr-evidence-meta"><b>{source.id}</b><span>{new URL(source.url).hostname}</span><small>{source.sourceType==='primary'?'一手来源':'二手来源'} · {source.format==='pdf'?'PDF 原文':'网页原文'}</small></div><h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span aria-hidden="true"> ↗</span></a></h3><blockquote>{source.quote}</blockquote>{source.excerpts?.length>1&&<details><summary>另有 {source.excerpts.length-1} 条已核验摘录</summary>{source.excerpts.slice(1).map((excerpt:any,i:number)=><blockquote key={i}>{excerpt.quote}<small className="a-dr-excerpt-credit">{excerpt.engines?.join(' + ')} · {new Date(excerpt.retrievedAt).toLocaleString()}</small></blockquote>)}</details>}<footer><span>✓ {source.format==='pdf'?'PDF 文字已核验':'网页摘录已匹配'}</span><span>{source.engines?.join(' + ')}</span><time>{new Date(source.retrievedAt).toLocaleString()}</time></footer><details><summary>查看来源指纹与原始链接</summary><a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a><code>SHA-256 {source.sha256}</code>{source.reportedPublishedAt&&<p>研究员报告的发布日期（未独立核实）：{source.reportedPublishedAt}</p>}</details></article>)}{!sources.length&&<div className="a-dr-workbench-empty">{sourceList.length?'没有匹配的证据。':'研究员提交资料后，独立核验的来源会出现在这里。'}</div>}{sources.length>limit&&<button type="button" onClick={()=>setLimit(n=>n+12)}>显示更多来源（还有 {sources.length-limit} 项）</button>}</>}
   {tab==='findings'&&<>{findings.map((finding,i)=><article className="a-dr-finding" key={i}><small>{finding.kind==='analysis'?'分析判断':'有来源的事实'} · {finding.engine}</small><p>{finding.statement}</p><div className="a-dr-ref-chips">{finding.sourceIds.map((id:string)=><button type="button" key={id} onClick={()=>selectSource(id)}>{id} ↗</button>)}</div>{finding.limitation&&<aside>{finding.limitation}</aside>}</article>)}{!findings.length&&<div className="a-dr-workbench-empty">尚无已绑定有效来源的研究发现。</div>}</>}
   {tab==='review'&&<><div className="a-dr-review-banner"><strong>{s.reportReview?.verdict==='pass'?'最终报告审查通过':s.review?.verdict==='pass'?'证据审查通过':'审查尚未通过'}</strong><p>网页摘录核验、结论支持检查与最终报告审查分别进行。模型审查仍可能遗漏问题。</p></div>{[...(s.review?.issues??[]).map((issue:any)=>({...issue,stage:'证据审查'})),...(s.reportReview?.issues??[]).map((issue:any)=>({...issue,stage:'最终报告审查'}))].map((issue:any,i:number)=><article className="a-dr-review-issue" data-blocking={issue.severity==='blocking'} key={'i'+i}><b>{issue.stage} · {issue.severity==='blocking'?'阻断问题':'审查意见'}</b><p>{issue.reason}</p></article>)}{[...(s.review?.disagreements??[]),...(s.reportReview?.disagreements??[]),...(s.gaps??[])].map((text:string,i:number)=><article className="a-dr-review-issue" key={'g'+i}><b>分歧 / 待验证</b><p>{text}</p></article>)}{!!s.rejectedFindings?.length&&<details className="a-dr-rejected"><summary>{s.insights?.citations?.rejectedFindings??s.rejectedFindings.length} 条发现因来源未核验而拦截</summary>{s.rejectedFindings.map((finding:any,i:number)=><p key={i}><strong>{finding.engine}</strong><span>{finding.statement}</span><span>{finding.reason}</span></p>)}</details>}{!!s.rejectedSources?.length&&<details className="a-dr-rejected"><summary>{s.rejectedCount} 个来源未通过核验</summary>{s.rejectedSources.map((source:any,i:number)=><p key={i}><code>{source.url}</code><span>{source.reason}</span></p>)}</details>}</>}
   {tab==='activity'&&<div className="a-dr-timeline">{[...tasks].reverse().map(task=><article key={task.id} data-status={task.status}><i/><div><header><strong>{task.title}</strong><span>{statusText[task.status]??task.status}</span></header><p>{task.engine} · {new Date(task.startedAt).toLocaleTimeString()}{task.finishedAt?' → '+new Date(task.finishedAt).toLocaleTimeString():''}</p>{!!task.tracks?.length&&<p>研究路线：{task.tracks.join('；')}</p>}{(task.approvalWaitMs??0)>0&&<p>累计等待审批 {clock(task.approvalWaitMs)}（不计执行时限）</p>}{task.error&&<small>{task.error}</small>}</div></article>)}{!tasks.length&&<div className="a-dr-workbench-empty">确认目标后开始记录真实任务状态。</div>}{(s.amendments??[]).map((update:any,i:number)=><article key={'a'+i}><i/><div><strong>用户修订 #{i+1}</strong><p>{update.note}</p><small>{new Date(update.at).toLocaleString()}</small></div></article>)}</div>}
  </div>
 </section>
}
export function ReportPreview({html,onClose}:{html:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null)
 // The host forbids inline scripts. Keep the embedded report scriptless and bind
 // only our reviewed reader controls from the trusted, bundled renderer code.
 const previewHtml=useMemo(()=>{const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script').forEach(node=>node.remove());return '<!doctype html>'+doc.documentElement.outerHTML},[html])
 const bindReader=(frame:HTMLIFrameElement)=>{
  const doc=frame.contentDocument;if(!doc)return
  doc.getElementById('source-filter')?.addEventListener('input',event=>{const query=(event.target as HTMLInputElement).value.toLocaleLowerCase();doc.querySelectorAll<HTMLElement>('.source').forEach(source=>{source.hidden=!(source.textContent??'').toLocaleLowerCase().includes(query)})})
  doc.getElementById('print')?.addEventListener('click',()=>frame.contentWindow?.print())
 }
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();previous?.focus()}},[])
 return <dialog ref={ref} className="a-dr-report-dialog" aria-label="最终研究报告" onCancel={e=>{e.preventDefault();onClose()}}><header><div><small>FINAL REPORT</small><strong>最终报告 · 可追溯阅读</strong></div><button autoFocus onClick={onClose} aria-label="关闭最终报告预览">关闭 ×</button></header><iframe title="深度调研最终报告" srcDoc={previewHtml} sandbox="allow-same-origin allow-popups allow-modals" onLoad={e=>bindReader(e.currentTarget)}/></dialog>
}
