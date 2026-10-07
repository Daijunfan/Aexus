import {createHash} from 'node:crypto'
import {decodeBase64,inspectDocument,normalize,validatePatches} from './document.mjs'
export const ENGINE_ID='profile-improvement'
export const ENGINES=['pi','cline','codex','claude']
const error=(code,message)=>{throw Object.assign(new Error(message),{code})}
export function describe(state){
 return {title:'简历优化',phase:state.phase,activeTarget:state.activeTarget,resumeName:state.resume.name,targets:state.targets,engine:state.engine?.engine,model:state.engine?.model,attention:state.attention,team:state.team,workers:state.workers.map(({id,label,role,engine})=>({id,label,role,engine})),tasks:Object.values(state.tasks).map(({taskId,label,employeeId,status,startedAt,finishedAt,error})=>({taskId,label,employeeId,status,startedAt,finishedAt,error})),template:{tables:state.document.tables,images:state.document.images,editableUnits:state.document.editableUnits},variants:state.variants.map(({target,name,patches,fit,review,layout,verification})=>({target,name,changes:patches,fit,review,layout,verification})),formatPolicy:'原 DOCX 模板内逐文字段替换；字号、段落、表格、图片和分页设置不改。'}
}
export function respond(){error('WORKFLOW_NOT_WAITING','此引擎不需要额外问卷。失败时可修正环境后继续，或重新提交简历与岗位。')}
export function parseResult(text,taskId){
 if(typeof text!=='string'||text.length>160000)error('AGENT_RESULT_INVALID','员工未返回完整的结构化结果。')
 let raw=text.trim();if(raw.startsWith('```'))raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
 let result;try{result=JSON.parse(raw)}catch{error('AGENT_RESULT_INVALID','员工输出不是完整 JSON。')}
 if(!result||Array.isArray(result)||result.taskId!==taskId)error('AGENT_RESULT_INVALID','结果与本次员工任务不匹配。')
 return result
}
const strings=(values,label,max=20)=>{if(!Array.isArray(values)||values.length>max||values.some(v=>typeof v!=='string'||!v.trim()||v.length>1000))error('AGENT_RESULT_INVALID',label+'格式不正确');return values}
export function validateFacts(value,document){
 const ids=new Map(document.units.map(u=>[u.id,u.text]));if(!Array.isArray(value.facts)||!value.facts.length||value.facts.length>100)error('AGENT_RESULT_INVALID','事实核查必须提供原简历中的证据。')
 const facts=value.facts.map(f=>{if(!f||!ids.has(f.unitId)||typeof f.quote!=='string'||!f.quote.trim()||!normalize(ids.get(f.unitId)).includes(normalize(f.quote))||typeof f.category!=='string')error('FACT_UNSUPPORTED','事实条目不能脱离原简历文字');return {unitId:f.unitId,quote:f.quote,category:f.category}})
 if(!Array.isArray(value.protectedIds)||value.protectedIds.some(id=>!ids.has(id)))error('AGENT_RESULT_INVALID','受保护文字位置无效。')
 return {facts,protectedIds:[...new Set(value.protectedIds)],notes:strings(value.notes??[],'核查备注')}
}
export function validateMatch(value,state){
 if(!Array.isArray(value.roles)||value.roles.length!==state.targets.length)error('AGENT_RESULT_INVALID','岗位分析必须逐一对应用户的目标方向。')
 const units=new Set(state.document.units.map(u=>u.id))
 return state.targets.map(target=>{const r=value.roles.find(r=>r.target===target);if(!r||!Array.isArray(r.strengths)||r.strengths.length>15)error('AGENT_RESULT_INVALID','缺少岗位匹配结果：'+target)
  const strengths=r.strengths.map(s=>{if(typeof s.text!=='string'||!s.text.trim()||s.text.length>600||!Array.isArray(s.evidenceIds)||!s.evidenceIds.length||s.evidenceIds.some(id=>!units.has(id)))error('AGENT_RESULT_INVALID','岗位优势必须引用真实简历文字');return s})
  return {target,strengths,requirements:strings(r.requirements??[],'岗位要求',15),gaps:strings(r.gaps??[],'待补充内容',15),basis:state.jobDescription?'用户提供的岗位说明':'根据岗位名称推断的常见要求，非招聘方已确认的 JD'}
 })
}
export function validateDraft(value,state){
 const patches=validatePatches(state.document,value.patches,{protectedIds:state.facts.protectedIds})
 if(!patches.length)error('NO_IMPROVEMENT','未形成可保留原版式的有效修改，请提供更具体的岗位要求。')
 return {patches,notes:strings(value.notes??[],'修改说明',15)}
}
export function validateReview(value,patches){
 if(!['pass','revise'].includes(value.verdict)||!Array.isArray(value.issues)||value.issues.length>40||typeof value.summary!=='string'||value.summary.length>1500)error('AGENT_RESULT_INVALID','独立审校结果格式不正确。')
 const ids=new Set(patches.map(p=>p.id))
 for(const issue of value.issues)if(!issue||!['blocking','note'].includes(issue.severity)||typeof issue.reason!=='string'||!issue.reason.trim()||!Array.isArray(issue.ids)||issue.ids.some(id=>!ids.has(id)))error('AGENT_RESULT_INVALID','审校问题必须指向当前修改。')
 if(value.verdict==='pass'&&value.issues.some(i=>i.severity==='blocking'))error('AGENT_RESULT_INVALID','存在阻断问题时不能通过审校。')
 return {verdict:value.verdict,summary:value.summary,issues:value.issues}
}
export function modelDocument(document){
 const sensitive=new Set(document.paragraphs.filter(p=>document.units.some(u=>u.paragraphId===p.id&&['identity','contact'].includes(u.lockedReason))||/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{7,}\d))/.test(p.text)).map(p=>p.id))
 const units=document.units.map(u=>sensitive.has(u.paragraphId)?{...u,text:'[身份与联系方式：保留原文，不参与优化]',editable:false,lockedReason:'contact'}:{...u})
 const context=new Map(document.paragraphs.map(p=>[p.id,units.filter(u=>u.paragraphId===p.id).map(u=>u.text).join('')]))
 return {paragraphs:document.paragraphs.map(p=>({id:p.id,text:context.get(p.id),units:p.units})),units:units.map(({context:_,...u})=>u)}
}
export function filename(target,index){const stem=target.normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,45);return `resume-${String(index+1).padStart(2,'0')}${stem?'-'+stem:''}.docx`}
export function parseTargets(text){
 if(typeof text!=='string'||!text.trim()||text.length>4000)error('TARGET_INVALID','请填写目标岗位，可用分号或换行分开，最多三个方向。')
 const values=[...new Set(text.split(/[;；\n]/).map(t=>normalize(t)).filter(Boolean))]
 if(!values.length||values.length>3||values.some(t=>t.length>400))error('TARGET_INVALID','最多三个岗位，每个不超过400字；详细要求请填写岗位说明。')
 return values
}
export function create(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['resume','targets','jobDescription','engine','model'].includes(k)))error('INPUT_INVALID','请输入 Word 简历与目标岗位。')
 if(!input.resume||typeof input.resume!=='object'||Array.isArray(input.resume)||typeof input.resume.name!=='string'||!input.resume.name.trim()||input.resume.name.length>240||Object.keys(input.resume).some(k=>!['name','data'].includes(k)))error('INPUT_INVALID','简历输入必须包含 name 和 data。')
 const bytes=decodeBase64(input.resume.data),document=inspectDocument(bytes,input.resume.name),targets=parseTargets(input.targets)
 if(input.jobDescription!==undefined&&(typeof input.jobDescription!=='string'||input.jobDescription.length>12000))error('INPUT_INVALID','岗位说明最多 12,000 字。')
 if(input.engine!==undefined&&input.engine!=='auto'&&!ENGINES.includes(input.engine))error('INPUT_INVALID','请选择已支持的 Coding Agent。')
 if(input.model!==undefined&&(typeof input.model!=='string'||input.model.length>200))error('INPUT_INVALID','模型标识无效。')
 return {schemaVersion:1,phase:'prepare',resume:{name:document.name,data:input.resume.data,sha256:createHash('sha256').update(bytes).digest('hex')},document,targets,jobDescription:input.jobDescription?.trim()??'',requestedEngine:input.engine??'auto',model:input.model?.trim()||undefined,workers:[],tasks:{},variants:[],generation:0,attention:null}
}
