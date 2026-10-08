import {create,describe,respond,amend,validatePlan,validateResearch,validateReview,validateReport} from './model.mjs'
import {ask,provision,retry,cancel,pause} from './agents.mjs'
import {verifySource,publicURL,normalize} from './sources.mjs'
import {renderReport} from './report.mjs'
export {create,describe,respond,retry,cancel,pause,amend}
export const compatibleVersions=['1.0.0']
import {depthConfig,assertSourceAllowed} from './policy.mjs'
const brief=state=>({topic:state.topic,agreedScope:state.answers,plan:state.plan,asOf:new Date().toISOString(),language:state.language,depth:depthConfig(state.depth),sourcePolicy:state.sourcePolicy??{},materials:state.materials??[],amendments:state.amendments??[]})
const pool=state=>({sources:state.sources,findings:state.findings,gaps:state.gaps??[]})
async function absorb(state,ctx,researches){
 const candidates=new Map()
 for(const {result,engine} of researches)for(const s of result.sources){try{const key=assertSourceAllowed(publicURL(s.url),state.sourcePolicy);if(!candidates.has(key))candidates.set(key,{...s,url:key,engines:[]});candidates.get(key).engines.push(engine)}catch(error){state.rejectedSources.push({url:String(s.url).slice(0,2000),reason:error.message})}}
 state.verification={total:candidates.size,checked:0,accepted:0,rejected:0};await ctx.checkpoint(state)
 const queue=[...candidates.values()],verified=[]
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){
  ctx.signal.throwIfAborted();const candidate=queue.shift();let accepted=false
  try{
  const previous=state.sources.find(s=>s.url===candidate.url||s.finalUrl===candidate.url)
  if(previous){assertSourceAllowed(previous.finalUrl??previous.url,state.sourcePolicy);verified.push({...previous,engines:[...new Set([...(previous.engines??[]),...candidate.engines])]})}
  else verified.push({...await verifySource(candidate,{signal:ctx.signal,policy:state.sourcePolicy}),engines:[...new Set(candidate.engines)]})
  accepted=true
  }catch(error){ctx.signal.throwIfAborted();state.rejectedSources.push({url:candidate.url,reason:error.message})}
  state.verification.checked++;state.verification[accepted?'accepted':'rejected']++;await ctx.checkpoint(state)
 }}))
 for(const source of verified.filter(Boolean)){
  const prior=state.sources.find(s=>s.url===source.url||s.finalUrl===source.finalUrl)
  if(prior){prior.engines=[...new Set([...(prior.engines??[]),...source.engines])];prior.aliases=[...new Set([...(prior.aliases??[]),source.url])]}
  else state.sources.push({...source,id:'S'+(Math.max(0,...state.sources.map(s=>Number(s.id.slice(1))||0))+1),aliases:[]})
 }
 const byURL=new Map(state.sources.flatMap(s=>[s.url,s.finalUrl,...(s.aliases??[])].map(url=>[url,s.id])))
 for(const {result,engine} of researches){
  for(const finding of result.findings){
   const refs=finding.urls.map(url=>{try{return byURL.get(publicURL(url))}catch{return undefined}})
   if(refs.some(id=>!id))continue
   if(!state.findings.some(f=>normalize(f.statement)===normalize(finding.statement)))state.findings.push({statement:finding.statement,kind:finding.kind,sourceIds:[...new Set(refs)],limitation:finding.limitation??'',engine})
  }
  state.gaps=[...new Set([...(state.gaps??[]),...(result.gaps??[])])]
 }
 await ctx.checkpoint(state)
}
function quality(state){
 const domains=new Set(state.sources.map(s=>new URL(s.finalUrl??s.url).hostname)),engines=new Set(state.sources.flatMap(s=>s.engines??[]))
 const budget=depthConfig(state.depth);return state.sources.length>=budget.minSources&&domains.size>=budget.minDomains&&engines.size>=2&&state.findings.length>=budget.minFindings
}
async function collect(state,ctx,key,extra={}){
 const researchers=state.workers.filter(w=>w.role!=='lead')
 const outcomes=await Promise.allSettled(researchers.map((worker,index)=>ask(state,ctx,key+'-'+worker.role,worker,'research',{...brief(state),role:worker.label,tracks:state.plan.tracks.filter((_,i)=>i%researchers.length===index),...extra},validateResearch).then(result=>({result,engine:worker.engine}))))
 ctx.signal.throwIfAborted()
 const results=outcomes.filter(result=>result.status==='fulfilled').map(result=>result.value)
 if(results.length)await absorb(state,ctx,results)
 const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason
}
export async function run(state,ctx){
 if(['scope','direction','focus'].includes(state.phase))return {status:'waiting',state}
 if(state.phase==='complete')return {status:'completed',state,artifacts:renderReport(state)}
 await provision(state,ctx)
 const lead=state.workers.find(w=>w.role==='lead'),writer=state.workers.find(w=>w.role==='source'),generation=state.generation??0
 if(state.phase==='plan'){
  state.plan=await ask(state,ctx,'plan'+(state.generation?'-g'+state.generation:''),lead,'plan',brief(state),validatePlan)
  state.questions=state.plan.questions;state.phase='direction';await ctx.checkpoint(state);return {status:'waiting',state}
 }
 if(state.phase==='research'){
  await collect(state,ctx,'research'+(state.generation?'-g'+state.generation:''))
  for(;!quality(state)&&state.repairRound<depthConfig(state.depth).repairRounds;state.repairRound++){
   await collect(state,ctx,'source-repair-'+state.repairRound+'-g'+generation,{existing:pool(state),instruction:'先前来源未达到交付标准。寻找可直接打开、可逐字核对摘录的原始网页。最终来源、网站与发现数量必须达到当前 depth 预算，并包含两类引擎的独立有效贡献。不要复制先前无效链接。',rejected:state.rejectedSources});await ctx.checkpoint(state)
  }
  if(!quality(state))throw Error('证据尚不足：本档要求 '+depthConfig(state.depth).minSources+' 个来源、'+depthConfig(state.depth).minDomains+' 个网站、两种引擎贡献及 '+depthConfig(state.depth).minFindings+' 条有引证发现。未生成交付文件；请调整范围或补证后重试。')
  state.phase='focus';state.questions=[
   {id:'focus',prompt:'已获得初步证据。最终报告应优先解决哪个判断？',recommended:state.plan.objective},
   {id:'tradeoff',prompt:state.gaps?.[0]?'仍有一个待明确的问题：'+state.gaps[0]+'。你希望如何处理？':'对于证据之间的分歧，你希望采用什么决策标准？',recommended:'保留分歧和适用边界，优先可验证证据，明确哪些部分还需要验证。'}
  ];await ctx.checkpoint(state);return {status:'waiting',state}
 }
 if(state.phase==='review'){
  for(let round=0;round<3;round++){
   state.reviewRound=round
   const result=await ask(state,ctx,'review-'+round+'-g'+generation,lead,'review',{...brief(state),...pool(state),instruction:'你没有参与两条独立调研的撰写。检查引文是否实际支持发现，标出反证和适用范围。不能用来源数量替代证据支持。'},value=>validateReview(value,state.sources))
   state.review=result;await ctx.checkpoint(state)
   if(result.verdict==='pass')break
   if(round===2)throw Error('独立审查仍有阻断问题：'+result.issues.filter(i=>i.severity==='blocking').map(i=>i.reason).join('；')+'。中间稿不会作为最终报告交付。')
   await collect(state,ctx,'review-repair-'+round+'-g'+generation,{existing:pool(state),review:result,instruction:'针对审查问题补证或收窄结论，不要仅重复原结论。'})
  }
  state.phase='write';await ctx.checkpoint(state)
 }
 if(state.phase==='write'){
  for(let revision=0;revision<2;revision++){
   const report=await ask(state,ctx,'report-'+revision+'-g'+generation,writer,'report',{...brief(state),...pool(state),independentReview:state.review,revisionFeedback:state.reportReview??null,instruction:'交付内容围绕用户决策。引用仅用给定S编号；每个段落都要提供依据，建议标为分析。正文至少4章并有实质比较与反证。不输出文件路径、内部任务日志或工作草稿。'},value=>validateReport(value.report,state.sources))
   state.reportDraft=report;await ctx.checkpoint(state)
   state.reportReview=await ask(state,ctx,'final-review-'+revision+'-g'+generation,lead,'review',{...brief(state),sources:state.sources,report,instruction:'对最终报告逐段核对引用支持、事实/分析区分、遗漏分歧和用户需求。发现虚构事实或不受摘录支持的关键结论必须revise。'},value=>validateReview(value,state.sources))
   await ctx.checkpoint(state)
   if(state.reportReview.verdict==='pass'){
    state.report=report;state.finishedAt=new Date().toISOString();state.phase='complete';await ctx.checkpoint(state)
    return {status:'completed',state,artifacts:renderReport(state)}
   }
  }
  throw Error('最终报告未通过引用与结论审查。已保留研究证据；不会向用户提供中间稿。')
 }
 throw Error('Unknown deep-research phase: '+state.phase)
}
