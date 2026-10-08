import {create,describe,respond,amend,markPhase,validatePlan,validateResearch,validateReview,validateReport} from './model.mjs'
import {ask,provision,retry,cancel,pause} from './agents.mjs'
import {absorb} from './evidence.mjs'
import {researchInsights} from './insights.mjs'
import {renderReport} from './report.mjs'
export {create,describe,respond,retry,cancel,pause,amend}
export const compatibleVersions=['1.0.0','1.1.0','1.2.0','1.3.0']
import {depthConfig} from './policy.mjs'
const brief=state=>({topic:state.topic,agreedScope:state.answers,plan:state.plan,asOf:new Date().toISOString(),language:state.language,depth:depthConfig(state.depth),sourcePolicy:state.sourcePolicy??{},materials:state.materials??[],amendments:state.amendments??[]})
const pool=state=>({sources:state.sources,findings:state.findings,gaps:state.gaps??[]})
const quality=state=>researchInsights(state).evidenceReady
async function collect(state,ctx,key,extra={}){
 const researchers=state.workers.filter(w=>w.role!=='lead')
 state.verification={total:0,checked:0,accepted:0,rejected:0,pendingAgents:researchers.length}
 state.absorbedTasks??=[]
 await ctx.checkpoint(state)
 // Native searches run concurrently; evidence commits are serialized so one
 // completed researcher can become visible while another is still working.
 let ingestion=Promise.resolve()
 const commit=(work)=>{const next=ingestion.then(work);ingestion=next.catch(()=>{});return next}
 const outcomes=await Promise.allSettled(researchers.map(async(worker,index)=>{
  const taskKey=key+'-'+worker.role,tracks=state.plan.tracks.filter((_,i)=>i%researchers.length===index)
  const assignment=tracks.length?tracks:[worker.role==='challenge'?'独立检查反证、失效边界与替代解释':'独立核对证据缺口与跨来源一致性']
  try{
   const result=await ask(state,ctx,taskKey,worker,'research',{...brief(state),role:worker.label,tracks:assignment,...extra},validateResearch)
   const task=state.tasks[taskKey+'-format-repair']?.status==='completed'?state.tasks[taskKey+'-format-repair']:state.tasks[taskKey]
   await commit(async()=>{
    ctx.signal.throwIfAborted()
    if(!state.absorbedTasks.includes(task.taskId)){
     await absorb(state,ctx,[{result,engine:worker.engine,workerId:worker.id,taskId:task.taskId}],{accumulate:true})
     state.absorbedTasks.push(task.taskId)
    }
   })
  }finally{
   await commit(async()=>{ctx.signal.throwIfAborted();state.verification.pendingAgents=Math.max(0,state.verification.pendingAgents-1);await ctx.checkpoint(state)})
  }
 }))
 ctx.signal.throwIfAborted()
 const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason
}
export async function run(state,ctx){
 if(['scope','direction','focus'].includes(state.phase))return {status:'waiting',state}
 if(state.phase==='complete')return {status:'completed',state,artifacts:renderReport(state)}
 await provision(state,ctx)
 const lead=state.workers.find(w=>w.role==='lead'),writer=state.workers.find(w=>w.role==='source'),peer=state.workers.find(w=>w.role==='specialist')??state.workers.find(w=>w.role==='challenge'),generation=state.generation??0
 if(state.phase==='plan'){
  state.plan=await ask(state,ctx,'plan'+(state.generation?'-g'+state.generation:''),lead,'plan',brief(state),validatePlan)
  state.questions=state.plan.questions;markPhase(state,'direction');await ctx.checkpoint(state);return {status:'waiting',state}
 }
 if(state.phase==='research'){
  await collect(state,ctx,'research'+(state.generation?'-g'+state.generation:''))
  for(;!quality(state)&&state.repairRound<depthConfig(state.depth).repairRounds;state.repairRound++){
   await collect(state,ctx,'source-repair-'+state.repairRound+'-g'+generation,{existing:pool(state),instruction:'先前来源未达到交付标准。寻找可直接打开、可逐字核对摘录的原始网页。最终来源、网站与发现数量必须达到当前 depth 预算，并包含两类引擎的独立有效贡献。不要复制先前无效链接。',rejected:state.rejectedSources});await ctx.checkpoint(state)
  }
  if(!quality(state))throw Error('证据尚不足：本档要求 '+depthConfig(state.depth).minSources+' 个来源、'+depthConfig(state.depth).minDomains+' 个网站、两种引擎贡献及 '+depthConfig(state.depth).minFindings+' 条有引证发现。未生成交付文件；请调整范围或补证后重试。')
  markPhase(state,'focus');state.questions=[
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
  markPhase(state,'write');await ctx.checkpoint(state)
 }
 if(state.phase==='write'){
  for(let revision=0;revision<2;revision++){
   const feedback={lead:state.reportReview??null,peer:state.peerReview??null}
   state.peerReview=null
   const report=await ask(state,ctx,'report-'+revision+'-g'+generation,writer,'report',{...brief(state),...pool(state),independentReview:state.review,revisionFeedback:feedback,instruction:'交付内容围绕用户决策。引用仅用给定S编号；每个段落都要提供依据，建议标为分析。正文至少4章并有实质比较与反证。不输出文件路径、内部任务日志或工作草稿。'},value=>validateReport(value.report,state.sources,{language:state.language}))
   validateReport(report,state.sources,{language:state.language});state.reportDraft=report;await ctx.checkpoint(state)
   state.reportReview=await ask(state,ctx,'final-review-'+revision+'-g'+generation,lead,'review',{...brief(state),sources:state.sources,report,instruction:'对最终报告逐段核对引用支持、事实/分析区分、遗漏分歧和用户需求。发现虚构事实或不受摘录支持的关键结论必须revise。'},value=>validateReview(value,state.sources))
   await ctx.checkpoint(state)
   if(state.reportReview.verdict==='pass'){
    // A second native session challenges the report without sharing the lead's
    // response. The report author never acts as their own final reviewer.
    state.peerReview=await ask(state,ctx,'peer-review-'+revision+'-g'+generation,peer,'review',{...brief(state),sources:state.sources,report,reviewRole:'independent challenger',instruction:'独立审查最终报告。不要复述主编的结论；逐项检查原始来源、反证、关键数字、范围与适用条件。阻断问题必须 verdict=revise。'},value=>validateReview(value,state.sources))
    await ctx.checkpoint(state)
    if(state.peerReview.verdict==='pass'){
     state.report=report;state.finishedAt=new Date().toISOString();markPhase(state,'complete');await ctx.checkpoint(state)
     return {status:'completed',state,artifacts:renderReport(state)}
    }
   }
  }
  throw Error('最终报告未通过主编与独立审查员的双重审查。已保留研究证据；不会向用户提供中间稿。')
 }
 throw Error('Unknown deep-research phase: '+state.phase)
}
