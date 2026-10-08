import {publicURL} from './sources.mjs'
import {researchInsights} from './insights.mjs'
import {depthConfig,sourcePolicy,materials,assertSourceAllowed} from './policy.mjs'
export const ENGINE_IDS=['codex','claude','cline','pi']
export const PHASES=[['scope','确认目标'],['plan','制定方案'],['direction','确认方案'],['research','并行调研'],['focus','确认重点'],['review','交叉审查'],['write','撰写与校验'],['complete','最终交付']]
/** Stage timestamps are only written when a real stage transition is checkpointed. */
export function markPhase(state,phase){
 if(!PHASES.some(([id])=>id===phase))throw Error('Unknown research phase: '+phase)
 state.phase=phase
 state.milestones??=[]
 if(!state.milestones.some(item=>item.phase===phase))state.milestones.push({phase,at:new Date().toISOString()})
 return state
}
const text=(value,label,max=16000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+' 缺失或过长');return value.trim()}
const list=(value,label,min=0,max=40)=>{if(!Array.isArray(value)||value.length<min||value.length>max)throw Error(label+' 数量无效');return value}
const questions=[
 {id:'decision',prompt:'这份调研将支持什么决定？谁会使用它？',recommended:'供我本人判断方向，重点给出可执行结论。'},
 {id:'scope',prompt:'需要限定地区、时间范围或排除哪些内容？',recommended:'全球范围，优先近一年资料，必要时补充历史背景。'},
 {id:'priority',prompt:'最关心哪些问题，或者需要比较哪些方案？',recommended:'现状、主要方案、差异、风险与下一步行动；用中文交付。'}
]
export function create(input){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['topic','engines','depth','sourcePolicy','materials','language'].includes(k)))throw Error('调研输入包含不支持的字段')
 const depth=input.depth??'standard';depthConfig(depth)
 const policy=sourcePolicy(input.sourcePolicy),references=materials(input.materials);policy.seedUrls.forEach(publicURL)
 if(input.language!==undefined&&!['zh-CN','en'].includes(input.language))throw Error('报告语言无效')
 const topic=text(input.topic,'调研任务',4000),engines=input.engines??null
 if(engines!==null){list(engines,'Coding Agent',2,4);for(const e of engines){if(!ENGINE_IDS.includes(e.engine))throw Error('不支持的 Coding Agent');if(e.model!==undefined)text(e.model,'模型',160)}if(new Set(engines.map(e=>e.engine)).size<2)throw Error('深度调研需要至少两种不同 Coding Agent，不能用同一个引擎冒充多引擎协作。')}
 const startedAt=new Date().toISOString()
 return {version:2,topic,depth,sourcePolicy:policy,materials:references,language:input.language??'zh-CN',amendments:[],phase:'scope',milestones:[{phase:'scope',at:startedAt}],engines,answers:[],questions,workers:[],tasks:{},sources:[],findings:[],rejectedSources:[],reviewRound:0,repairRound:0,startedAt}
}
export function describe(state){
 const waiting=['scope','direction','focus'].includes(state.phase),phaseIndex=PHASES.findIndex(([id])=>id===state.phase)
 const budget=depthConfig(state.depth),tasks=Object.values(state.tasks),done=tasks.filter(t=>t.status==='completed').length
 const range=[0,5,16,20,58,64,80,100],base=range[Math.max(0,phaseIndex)],next=range[phaseIndex+1]??100
 const phaseTasks=Object.entries(state.tasks).filter(([key])=>state.phase==='plan'?key.startsWith('plan'):state.phase==='research'?/research|source-repair/.test(key):state.phase==='review'?/review/.test(key):state.phase==='write'?/report|final-review/.test(key):false).map(([,t])=>t)
 const fraction=phaseTasks.length?phaseTasks.filter(t=>t.status==='completed').length/phaseTasks.length:0
 const evidenceFraction=Math.min(1,state.sources.length/budget.minSources)
 const progress=state.phase==='complete'?100:Math.min(next-1,Math.floor(base+(next-base)*.8*(state.phase==='research'?(fraction+evidenceFraction)/2:fraction)))
 return {title:state.plan?.title??state.topic,topic:state.topic,phase:state.phase,phaseLabel:PHASES[phaseIndex]?.[1]??state.phase,progress,round:state.phase==='scope'?1:state.phase==='direction'?2:state.phase==='focus'?3:undefined,
  ...(waiting?{questions:state.questions}:{}),...(state.plan?{plan:state.plan}:{}),findings:state.findings,gaps:state.gaps??[],
  depth:state.depth??'standard',budget,sourcePolicy:state.sourcePolicy??sourcePolicy(),startedAt:state.startedAt,finishedAt:state.finishedAt,
  milestones:PHASES.map(([id,label],index)=>({phase:id,label,status:index<phaseIndex?'completed':index===phaseIndex?'active':'upcoming',at:(state.milestones??[]).find(item=>item.phase===id)?.at??null})),
  materials:(state.materials??[]).map(m=>({name:m.name,characters:m.text.length})),amendments:state.amendments??[],
  evidence:state.sources.map(({id,url,finalUrl,title,quote,sourceType,format,retrievedAt,sha256,engines,reportedPublishedAt,excerpts,workerIds})=>({id,url:finalUrl??url,title,quote,sourceType,format:format??'web',retrievedAt,sha256,engines,workerIds:workerIds??[],reportedPublishedAt,excerpts:excerpts??[]})),
  rejectedSources:state.rejectedSources.slice(-40),rejectedFindings:(state.rejectedFindings??[]).slice(-40),review:state.review??null,reportReview:state.reportReview??null,peerReview:state.peerReview??null,
  verification:state.verification??null,insights:researchInsights(state),metrics:{completedTasks:done,totalTasks:tasks.length,activeTasks:tasks.filter(t=>['running','approval'].includes(t.status)).length,findings:state.findings.length,primarySources:state.sources.filter(s=>s.sourceType==='primary').length},
  workers:state.workers.map(w=>({id:w.id,title:w.title,engine:w.engine,role:w.role,label:w.label,model:w.model??null,status:[...tasks].reverse().find(t=>t.employeeId===w.id)?.status??'ready'})),
  tasks:Object.entries(state.tasks).map(([id,t])=>({id,title:t.title,employeeId:t.employeeId,engine:t.engine,status:t.status,startedAt:t.startedAt,finishedAt:t.finishedAt,error:t.error,kind:t.kind,tracks:t.tracks??[],approvalStartedAt:t.approvalStartedAt??null,approvalWaitMs:t.approvalWaitMs??0,activity:t.activity??null})),
  sourceCount:new Set(state.sources.map(s=>s.finalUrl??s.url)).size,sourceSnapshots:state.sources.length,domainCount:new Set(state.sources.map(s=>new URL(s.finalUrl??s.url).hostname)).size,rejectedCount:state.rejectedSources.length,
  approvals:tasks.filter(t=>t.status==='approval').map(t=>({employeeId:t.employeeId,title:state.workers.find(w=>w.id===t.employeeId)?.label??t.title,startedAt:t.approvalStartedAt??null})),
  attention:state.attention??null,team:state.team,language:state.language??'zh-CN',...(state.phase==='complete'?{headline:state.report.title,highlights:state.report.executiveSummary.map(p=>p.text)}:{})}
}
export function respond(state,answer){
 if(state.phase==='direction'&&answer.plan){state.plan=validatePlan({plan:{...state.plan,...answer.plan,questions:state.questions}})}
 const values=answer.values??{},note=typeof answer.note==='string'?answer.note.trim():''
 if(typeof values!=='object'||Array.isArray(values)||note.length>8000)throw Error('请输入有效的回答')
 const answers=state.questions.map(q=>({question:q.prompt,answer:text(values[q.id]||q.recommended,'回答',6000)}))
 state.answers.push({round:state.phase,answers,note,at:new Date().toISOString()})
 if(state.phase==='scope'){state.language=/\benglish\b|英文/i.test(answers.map(a=>a.answer).join(' '))?'en':state.language??'zh-CN';markPhase(state,'plan')}
 else if(state.phase==='direction')markPhase(state,'research')
 else if(state.phase==='focus')markPhase(state,'review')
 else throw Error('当前阶段不接受新的调研意见')
 state.questions=[];return state
}
export function parseJSON(source,taskId){
 let s=String(source).trim();if(s.startsWith('```'))s=s.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')
 let value;try{value=JSON.parse(s)}catch{throw Error('Agent 没有返回完整有效的 JSON，不能用未完成回复交付。')}
 if(!value||typeof value!=='object'||Array.isArray(value)||value.taskId!==taskId)throw Error('Agent 结果没有匹配当前任务 ID')
 return value
}
export function validatePlan(value){
 const plan=value.plan;if(!plan||typeof plan!=='object')throw Error('缺少调研方案')
 text(plan.title,'方案标题',200);text(plan.objective,'研究目标');list(plan.tracks,'独立调研路线',2,4).forEach(t=>text(t,'调研路线',2000));list(plan.successCriteria,'验收标准',2,8).forEach(t=>text(t,'验收标准',1000))
 list(plan.questions,'待确认问题',1,3).forEach((q,i)=>{q.id='plan-'+i;text(q.prompt,'具体问题',800);text(q.recommended,'建议回答',1600)})
 return plan
}
export function validateResearch(value){
 list(value.sources,'资料来源',1,12).forEach(s=>{text(s.url,'来源链接',2000);const u=new URL(s.url);if(!['https:','http:'].includes(u.protocol))throw Error('资料来源必须是公开网页');text(s.title,'来源标题',300);text(s.quote,'证据摘录',350);if(!['primary','secondary'].includes(s.sourceType))s.sourceType='secondary'})
 list(value.findings,'调研发现',1,12).forEach(f=>{text(f.statement,'发现',2400);list(f.urls,'发现引用',1,8).forEach(u=>text(u,'引用链接',2000));f.kind=f.kind==='analysis'?'analysis':'fact';if(f.limitation!==undefined)text(f.limitation,'限制',1200)})
 list(value.gaps??[],'证据缺口',0,12).forEach(g=>text(g,'缺口',1600));return value
}
export function validateReview(value,sources){
 if(!['pass','revise'].includes(value.verdict))throw Error('审查必须返回 pass 或 revise')
 list(value.issues,'审查意见',0,12).forEach(i=>{text(i.reason,'审查说明',2400);if(!['blocking','note'].includes(i.severity))throw Error('审查意见缺少严重级别')})
 list(value.disagreements??[],'分歧',0,12).forEach(d=>text(d,'分歧',2400))
 if(value.verdict==='pass'&&value.issues.some(i=>i.severity==='blocking'))throw Error('存在阻断问题，不能通过审查')
 if(!sources.length)throw Error('没有可审查的来源');return value
}
export function validateReport(report,sources,{language}={}){
 if(!report||typeof report!=='object'||Array.isArray(report))throw Error('报告缺失或格式无效')
 text(report.title,'报告标题',200);const ids=new Set(sources.map(s=>s.id)),used=new Set()
 const paragraph=p=>{text(p.text,'报告段落',6000);if(!['fact','analysis'].includes(p.kind))throw Error('段落必须区分事实与分析');list(p.sourceIds,'段落引用',1,12).forEach(id=>{if(!ids.has(id))throw Error('报告引用了未通过核验的来源 '+id);used.add(id)})}
 list(report.executiveSummary,'摘要',2,8).forEach(paragraph)
 list(report.sections,'报告章节',4,12).forEach(s=>{text(s.title,'章节标题',200);list(s.paragraphs,'章节正文',1,12).forEach(paragraph)})
 list(report.recommendations,'行动建议',1,10).forEach(p=>{paragraph(p);if(p.kind!=='analysis')throw Error('行动建议必须标为分析判断')})
 list(report.limitations,'报告限制',1,12).forEach(l=>text(l,'限制',1600))
 list(report.comparisons??[],'比较条目',2,12).forEach(row=>{text(row.option,'比较对象',200);text(row.advantages,'优势',1600);text(row.tradeoffs,'取舍',1600);paragraph({text:row.option,kind:'analysis',sourceIds:row.sourceIds})})
 if(used.size<3)throw Error('报告必须实际使用至少三个已核验来源')
 const body=report.sections.flatMap(s=>s.paragraphs.map(p=>p.text)).join(' ')
 const han=(body.match(/\p{Script=Han}/gu)??[]).length,words=(body.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)??[]).length
 const chinese=language==='zh-CN'||language!=='en'&&han>words
 if(chinese?han<1500:words<1000)throw Error('正文过短：中文正文至少1500个汉字，英文正文至少1000词；摘要和建议不计入正文')
 if(new Set(report.sections.map(s=>s.title.trim().toLowerCase())).size!==report.sections.length)throw Error('报告必须使用不同的章节标题')
 return report
}

/** Revisions are accepted only by Infra while fully paused. Never mutate a completed delivery. */
export function amend(state,update){
 if(!update||Object.keys(update).some(k=>!['note','sourcePolicy','depth'].includes(k)))throw Error('研究修订包含不支持的字段')
 const note=text(update.note,'研究修订',6000),policy=sourcePolicy(update.sourcePolicy??state.sourcePolicy),depth=update.depth??state.depth??'standard';depthConfig(depth);policy.seedUrls.forEach(publicURL)
 if((state.amendments??[]).length>=12)throw Error('单项研究最多接受 12 次方向修订，请新建研究保留清晰版本')
 state.amendments??=[];state.amendments.push({note,at:new Date().toISOString(),depth,sourcePolicy:policy})
 state.sourcePolicy=policy;state.depth=depth
 state.sources=state.sources.filter(s=>{try{assertSourceAllowed(s.url,policy);assertSourceAllowed(s.finalUrl??s.url,policy);return true}catch{return false}})
 const ids=new Set(state.sources.map(s=>s.id));state.findings=state.findings.filter(f=>f.sourceIds.every(id=>ids.has(id)))
 state.previousTasks=[...(state.previousTasks??[]),...Object.values(state.tasks).map(({prompt,result,...task})=>task)].slice(-100)
 state.tasks={};state.generation=(state.generation??0)+1;state.repairRound=0;state.reviewRound=0
 delete state.report;delete state.reportDraft;delete state.review;delete state.reportReview;delete state.peerReview;delete state.verification
 state.gaps=[];state.rejectedFindings=[];state.absorbedTasks=[];state.attemptCounts={};state.attention=null
 // Re-plan against the new owner instructions; retain the verified source ledger for reuse.
 if(state.phase!=='scope'){markPhase(state,'plan');state.questions=[]}
 return state
}
