import {createHash} from 'node:crypto'
import {create,describe,respond,validateFacts,validateMatch,validateDraft,validateReview,modelDocument,filename} from './model.mjs'
import {provision,ask,retry as retryAgents,cancel} from './agents.mjs'
import {decodeBase64,encodeBase64,applyPatches,DOCX_MIME} from './document.mjs'
import {requireLayoutTools,verifyLayout} from './layout.mjs'
export {create,describe,respond,cancel}
export function retry(state){if(state.qualityFailed){state.roundBase=(state.roundBase??0)+3;state.qualityFailed=false}return retryAgents(state)}
const artifacts=state=>{const original=decodeBase64(state.resume.data);return state.variants.map(v=>{const {bytes}=applyPatches(original,v.patches,{protectedIds:state.facts.protectedIds});if(v.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('最终 Word 与已验收版本不一致，已阻止交付。');return {name:v.name,mediaType:DOCX_MIME,description:v.target+' · 保留原模板的优化简历',encoding:'base64',content:encodeBase64(bytes)}})}
const brief=state=>({targets:state.targets,jobDescription:state.jobDescription,document:modelDocument(state.document)})

/** All employee operations use the caller-preserving ContractClient. Domain processing stays in this Engine. */
export async function run(state,ctx){
 if(state.phase==='complete')return {status:'completed',state,artifacts:artifacts(state)}
 ctx.signal.throwIfAborted();const tools=requireLayoutTools()
 await provision(state,ctx)
 const auditor=state.workers.find(w=>w.role==='facts'),analyst=state.workers.find(w=>w.role==='match'),writer=state.workers.find(w=>w.role==='writer')
 if(state.phase==='prepare'||state.phase==='analyze'){
  state.phase='analyze';await ctx.checkpoint(state)
  const work=await Promise.allSettled([
   state.facts?Promise.resolve(state.facts):ask(state,ctx,'facts',auditor,'facts',brief(state),value=>validateFacts(value,state.document)).then(value=>{state.facts=value;return ctx.checkpoint(state).then(()=>value)}),
   state.matches?Promise.resolve(state.matches):ask(state,ctx,'match',analyst,'match',brief(state),value=>validateMatch(value,state)).then(value=>{state.matches=value;return ctx.checkpoint(state).then(()=>value)})
  ])
  const failed=work.find(r=>r.status==='rejected');if(failed)throw failed.reason
  state.phase='optimize';await ctx.checkpoint(state)
 }
 const original=decodeBase64(state.resume.data)
 for(let index=0;index<state.targets.length;index++){
  const target=state.targets[index];if(state.variants.some(v=>v.target===target))continue
  const fit=state.matches.find(m=>m.target===target);let feedback=state.feedback?.[target]??null,accepted=false
  for(let round=0;round<3;round++){
   ctx.signal.throwIfAborted();state.phase='optimize';state.activeTarget=target;await ctx.checkpoint(state)
   const key='target-'+index+'-round-'+((state.roundBase??0)+round)
   const draft=await ask(state,ctx,key+'-write',writer,'write',{...brief(state),target,fit,facts:state.facts,feedback,instruction:'针对本target给出原文字段级修改。其他岗位另做独立版本。不得改动模板；尽量保留文字行数；所有数字与证据保留。'},value=>validateDraft(value,state))
   state.phase='review';await ctx.checkpoint(state)
   const review=await ask(state,ctx,key+'-review',auditor,'review',{...brief(state),target,fit,facts:state.facts,patches:draft.patches},value=>validateReview(value,draft.patches))
   if(review.verdict!=='pass'){feedback={draft:draft.patches,review};state.feedback??={};state.feedback[target]=feedback;await ctx.checkpoint(state);continue}
   state.phase='layout';await ctx.checkpoint(state)
   const document=applyPatches(original,draft.patches,{protectedIds:state.facts.protectedIds}),layout=await verifyLayout(original,document.bytes,document.patches,{signal:ctx.signal,tools})
   if(!layout.passed){feedback={draft:draft.patches,layout,instruction:'不要改字号、段间距或增删段落。只调整after的措辞与长度，保持原稿每页行数和位置。必要时撤回导致重排的非关键修改。'};state.feedback??={};state.feedback[target]=feedback;await ctx.checkpoint(state);continue}
   state.variants.push({target,name:filename(target,index),sha256:createHash('sha256').update(document.bytes).digest('hex'),patches:document.patches,fit,review,layout,verification:document.verification});await ctx.checkpoint(state);accepted=true;break
  }
  if(!accepted){state.qualityFailed=true;await ctx.checkpoint(state);throw Object.assign(new Error('“'+target+'”的事实或版式验收仍未通过，未交付中间稿。请查看问题后继续，或补充更明确的岗位说明。'),{code:'QUALITY_GATE_FAILED'})}
 }
 state.phase='complete';state.finishedAt=Date.now();state.attention=null;await ctx.checkpoint(state)
 return {status:'completed',state,artifacts:artifacts(state)}
}
