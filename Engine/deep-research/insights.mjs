import {depthConfig} from './policy.mjs'

const unique=values=>[...new Set(values.filter(Boolean))]
/** Public, deterministic observations shared by the quality gate and the UI. */
export function researchInsights(state){
 const sources=state.sources??[],findings=state.findings??[],tasks=Object.values(state.tasks??{}),budget=depthConfig(state.depth)
 const ids=new Set(sources.map(s=>s.id)),domains=new Map()
 for(const source of sources){
  const domain=new URL(source.finalUrl??source.url).hostname
  if(!domains.has(domain))domains.set(domain,{domain,count:0,sourceIds:[]})
  const row=domains.get(domain);row.count++;row.sourceIds.push(source.id)
 }
 const contributors=unique(sources.flatMap(s=>s.engines??[]))
 const supported=findings.filter(f=>f.sourceIds?.length&&f.sourceIds.every(id=>ids.has(id)))
 const criteria=[
  {id:'sources',label:'核验来源',current:sources.length,required:budget.minSources},
  {id:'domains',label:'来源网站',current:domains.size,required:budget.minDomains},
  {id:'engines',label:'有效引擎贡献',current:contributors.length,required:2},
  {id:'findings',label:'有引用的发现',current:supported.length,required:budget.minFindings}
 ].map(item=>({...item,met:item.current>=item.required}))
 return {
  criteria,evidenceReady:criteria.every(item=>item.met),contributors,
  domains:[...domains.values()].sort((a,b)=>b.count-a.count||a.domain.localeCompare(b.domain)),
  citations:{linkedFindings:supported.length,rejectedFindings:(state.rejectedFindings??[]).length,citedSources:unique(supported.flatMap(f=>f.sourceIds)).length,checkedExcerpts:sources.reduce((count,s)=>count+(s.excerpts?.length||1),0),multiEngineSources:sources.filter(s=>new Set(s.engines??[]).size>1).length},
  routes:(state.workers??[]).filter(w=>w.role!=='lead').map(worker=>{
   const own=tasks.filter(t=>t.employeeId===worker.id),latest=own.at(-1),research=own.filter(t=>t.kind==='research').at(-1)
   const sourceIds=sources.filter(s=>(s.workerIds??[]).includes(worker.id)).map(s=>s.id)
   return {workerId:worker.id,label:worker.label,engine:worker.engine,model:worker.model??null,status:latest?.status??'ready',tracks:research?.tracks??[],sourceIds,findings:supported.filter(f=>(f.workerIds??[]).includes(worker.id)).length,completedTasks:own.filter(t=>t.status==='completed').length,totalTasks:own.length}
  }),
  reviews:{evidence:state.review?.verdict??'pending',report:state.reportReview?.verdict??'pending',blocking:[...(state.review?.issues??[]),...(state.reportReview?.issues??[])].filter(i=>i.severity==='blocking').length}
 }
}
