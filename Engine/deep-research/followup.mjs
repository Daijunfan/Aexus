import {create} from './model.mjs'
import {assertSourceAllowed} from './policy.mjs'

/** A follow-up gets new employees and freshly checked evidence; the parent's report stays immutable. */
export function fork(parent,input){
 if(parent.phase!=='complete'||!parent.report||parent.reportReview?.verdict!=='pass')throw Error('只能从已审查交付的报告继续研究')
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['topic','depth','sourcePolicy','language','reuseMaterials'].includes(k)))throw Error('继续研究的输入无效')
 if(input.reuseMaterials!==undefined&&typeof input.reuseMaterials!=='boolean')throw Error('reuseMaterials 必须为布尔值')
 const policy=input.sourcePolicy??parent.sourcePolicy??{}
 const seeds=[...new Set([...(policy.seedUrls??[]),...(parent.sources??[]).map(s=>s.finalUrl??s.url)])].filter(url=>{try{assertSourceAllowed(url,policy);return true}catch{return false}}).slice(0,12)
 const state=create({topic:input.topic,depth:input.depth??parent.depth??'standard',language:input.language??parent.language??'zh-CN',engines:parent.engines?.map(({engine,model})=>({engine,...(model?{model}:{})}))??undefined,sourcePolicy:{...policy,seedUrls:seeds},materials:input.reuseMaterials?(parent.materials??[]):[]})
 state.parentContext={title:parent.report.title,asOf:parent.finishedAt,objective:parent.plan?.objective??parent.topic,highlights:parent.report.executiveSummary.map(p=>p.text),limitations:parent.report.limitations,instruction:'这是先前研究的历史结论，只作为本次研究线索。重新检查时效、来源与反证，不得把历史摘录标为本次已核验事实。'}
 state.questions[0].recommended='在《'+parent.report.title+'》基础上回答：'+state.topic
 return state
}
