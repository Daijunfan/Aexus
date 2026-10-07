export const ENGINE_IDS=['codex','claude','cline','pi']
export const PHASES=[['scope','确认目标'],['plan','制定方案'],['direction','确认方案'],['research','并行调研'],['focus','确认重点'],['review','交叉审查'],['write','撰写与校验'],['complete','最终交付']]
const text=(value,label,max=16000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+' 缺失或过长');return value.trim()}
const list=(value,label,min=0,max=40)=>{if(!Array.isArray(value)||value.length<min||value.length>max)throw Error(label+' 数量无效');return value}
const questions=[
 {id:'decision',prompt:'这份调研将支持什么决定？谁会使用它？',recommended:'供我本人判断方向，重点给出可执行结论。'},
 {id:'scope',prompt:'需要限定地区、时间范围或排除哪些内容？',recommended:'全球范围，优先近一年资料，必要时补充历史背景。'},
 {id:'priority',prompt:'最关心哪些问题，或者需要比较哪些方案？',recommended:'现状、主要方案、差异、风险与下一步行动；用中文交付。'}
]
export function create(input){
 const topic=text(input.topic,'调研任务',4000),engines=input.engines??null
 if(engines!==null){list(engines,'Coding Agent',2,4);for(const e of engines){if(!ENGINE_IDS.includes(e.engine))throw Error('不支持的 Coding Agent');if(e.model!==undefined)text(e.model,'模型',160)}if(new Set(engines.map(e=>e.engine)).size<2)throw Error('深度调研需要至少两种不同 Coding Agent，不能用同一个引擎冒充多引擎协作。')}
 return {version:1,topic,phase:'scope',engines,answers:[],questions,workers:[],tasks:{},sources:[],findings:[],rejectedSources:[],reviewRound:0,repairRound:0,startedAt:new Date().toISOString()}
}
export function describe(state){
 const waiting=['scope','direction','focus'].includes(state.phase),phaseIndex=PHASES.findIndex(([id])=>id===state.phase)
 return {title:state.plan?.title??state.topic,topic:state.topic,phase:state.phase,phaseLabel:PHASES[phaseIndex]?.[1]??state.phase,progress:state.phase==='complete'?100:Math.max(0,Math.round(phaseIndex/8*100)),round:state.phase==='scope'?1:state.phase==='direction'?2:state.phase==='focus'?3:undefined,
  ...(waiting?{questions:state.questions}:{}),...(state.phase==='direction'?{plan:state.plan}:{}),...(state.phase==='focus'?{findings:state.findings.slice(0,5),gaps:state.gaps??[]}:{}),
  workers:state.workers.map(w=>({id:w.id,title:w.title,engine:w.engine,role:w.role})),
  tasks:Object.entries(state.tasks).map(([id,t])=>({id,title:t.title,employeeId:t.employeeId,engine:t.engine,status:t.status,startedAt:t.startedAt,finishedAt:t.finishedAt,error:t.error})),
  sourceCount:state.sources.length,domainCount:new Set(state.sources.map(s=>new URL(s.url).hostname)).size,rejectedCount:state.rejectedSources.length,
  attention:state.attention??null,team:state.team,language:state.language??'zh-CN',...(state.phase==='complete'?{headline:state.report.title,highlights:state.report.executiveSummary.map(p=>p.text)}:{})}
}
export function respond(state,answer){
 const values=answer.values??{},note=typeof answer.note==='string'?answer.note.trim():''
 if(typeof values!=='object'||Array.isArray(values)||note.length>8000)throw Error('请输入有效的回答')
 const answers=state.questions.map(q=>({question:q.prompt,answer:text(values[q.id]||q.recommended,'回答',6000)}))
 state.answers.push({round:state.phase,answers,note,at:new Date().toISOString()})
 if(state.phase==='scope'){state.language=/\benglish\b|英文/i.test(answers.map(a=>a.answer).join(' '))?'en':'zh-CN';state.phase='plan'}
 else if(state.phase==='direction')state.phase='research'
 else if(state.phase==='focus')state.phase='review'
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
export function validateReport(report,sources){
 text(report.title,'报告标题',200);const ids=new Set(sources.map(s=>s.id)),used=new Set()
 const paragraph=p=>{text(p.text,'报告段落',6000);if(!['fact','analysis'].includes(p.kind))throw Error('段落必须区分事实与分析');list(p.sourceIds,'段落引用',1,12).forEach(id=>{if(!ids.has(id))throw Error('报告引用了未通过核验的来源 '+id);used.add(id)})}
 list(report.executiveSummary,'摘要',2,8).forEach(paragraph)
 list(report.sections,'报告章节',3,12).forEach(s=>{text(s.title,'章节标题',200);list(s.paragraphs,'章节正文',1,12).forEach(paragraph)})
 list(report.recommendations,'行动建议',1,10).forEach(p=>{paragraph(p);if(p.kind!=='analysis')throw Error('行动建议必须标为分析判断')})
 list(report.limitations,'报告限制',1,12).forEach(l=>text(l,'限制',1600))
 list(report.comparisons??[],'比较条目',0,12).forEach(row=>{text(row.option,'比较对象',200);text(row.advantages,'优势',1600);text(row.tradeoffs,'取舍',1600);paragraph({text:row.option,kind:'analysis',sourceIds:row.sourceIds})})
 if(used.size<3)throw Error('报告必须实际使用至少三个已核验来源')
 if(report.sections.flatMap(s=>s.paragraphs.map(p=>p.text)).join('').length<1000)throw Error('正文过短，尚不足以作为深度调研报告')
 return report
}
