import {publicURL,normalize,verifySource,readSource} from './sources.mjs'
import {assertSourceAllowed} from './policy.mjs'

const unique=values=>[...new Set(values.filter(Boolean))]
const stampKey=source=>normalize(source.quote).toLocaleLowerCase()+'\n'+source.sha256

/** A contribution belongs to a checked excerpt, never just to a shared URL. */
function mergeSource(state,verified,contributions){
 // A changed page is a new, independently verifiable snapshot. Never merge
 // different SHA-256 bodies under one source ID, or silently credit historical
 // quotations against the currently served version of a webpage.
 let source=state.sources.find(s=>s.sha256===verified.sha256&&(s.url===verified.url||s.finalUrl===verified.finalUrl||(s.aliases??[]).includes(verified.url)))
 if(!source){
  const id='S'+(Math.max(0,...state.sources.map(s=>Number(s.id.slice(1))||0))+1)
  source={...verified,id,aliases:[],engines:[],excerpts:[]}
  state.sources.push(source)
 }
 // Older checkpoints retain the original checked quote, but cannot establish
 // which additional Agent actually supplied it. New attribution is checked below.
 source.excerpts??=[{quote:source.quote,sha256:source.sha256,retrievedAt:source.retrievedAt,engines:[],workerIds:[],taskIds:[]}]
 let excerpt=source.excerpts.find(item=>stampKey(item)===stampKey(verified))
 if(!excerpt){
  excerpt={quote:verified.quote,sha256:verified.sha256,retrievedAt:verified.retrievedAt,...(verified.locator?{locator:verified.locator}:{}),engines:[],workerIds:[],taskIds:[]}
  source.excerpts.push(excerpt)
 }
 excerpt.engines=unique([...(excerpt.engines??[]),...contributions.map(c=>c.engine)])
 excerpt.workerIds=unique([...(excerpt.workerIds??[]),...contributions.map(c=>c.workerId)])
 excerpt.taskIds=unique([...(excerpt.taskIds??[]),...contributions.map(c=>c.taskId)])
 source.engines=unique(source.excerpts.flatMap(item=>item.engines??[]))
 source.workerIds=unique(source.excerpts.flatMap(item=>item.workerIds??[]))
 source.aliases=unique([...(source.aliases??[]),verified.url,verified.finalUrl]).filter(url=>url!==source.url&&url!==source.finalUrl)
 return source
}

/**
 * Verify each distinct URL/excerpt pair independently. Reads are cached only for
 * this batch, after the normal network/redirect policy. Accepted findings may cite
 * only excerpts accepted from their own submission. Partial evidence is durable.
 */
export async function absorb(state,ctx,researches,{read,accumulate=false}={}){
 const candidates=new Map(),accepted=researches.map(()=>new Map()),cache=new Map()
 if(!accumulate||!state.verification)state.verification={total:0,checked:0,accepted:0,rejected:0,pendingAgents:0}
 const rejectSource=(source,error,submission)=>{
  state.rejectedSources.push({url:String(source.url).slice(0,2000),reason:error.message,engine:submission.engine,workerId:submission.workerId??null})
  state.verification.rejected++;state.verification.checked++
 }
 for(const [index,submission] of researches.entries())for(const candidate of submission.result.sources){
  try{
   const url=assertSourceAllowed(publicURL(candidate.url),state.sourcePolicy),quote=normalize(candidate.quote)
   if(!quote||quote.length>350)throw Error('证据摘录缺失或过长')
   const key=url+'\n'+normalize(quote).toLocaleLowerCase()
   if(!candidates.has(key)){candidates.set(key,{candidate:{...candidate,url},contributions:[]});state.verification.total++}
   candidates.get(key).contributions.push({index,engine:submission.engine,workerId:submission.workerId,taskId:submission.taskId})
  }catch(error){state.verification.total++;rejectSource(candidate,error,submission)}
 }
 await ctx.checkpoint(state)
 const reader=(url,signal)=>{
  if(!cache.has(url))cache.set(url,Promise.resolve().then(()=>read?read(url,signal):readSource(url,{signal,policy:state.sourcePolicy})))
  return cache.get(url)
 }
 const queue=[...candidates.values()]
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
  while(queue.length){
   ctx.signal.throwIfAborted()
   const {candidate,contributions}=queue.shift()
   try{
    const verified=await verifySource(candidate,{signal:ctx.signal,policy:state.sourcePolicy,read:reader})
    ctx.signal.throwIfAborted()
    const source=mergeSource(state,verified,contributions)
    for(const contribution of contributions){
     accepted[contribution.index].set(verified.url,source.id)
     accepted[contribution.index].set(verified.finalUrl,source.id)
    }
    state.verification.accepted++;state.verification.checked++
   }catch(error){
    ctx.signal.throwIfAborted()
    rejectSource(candidate,error,{engine:unique(contributions.map(c=>c.engine)).join(' + '),workerId:contributions[0]?.workerId})
   }
   await ctx.checkpoint(state)
  }
 }))
 for(const [index,submission] of researches.entries()){
  const {result,engine,workerId,taskId}=submission
  for(const finding of result.findings){
   const refs=finding.urls.map(url=>{try{return accepted[index].get(publicURL(url))}catch{return undefined}})
   if(!refs.length||refs.some(id=>!id)){
    state.rejectedFindings??=[]
    const rejection={statement:finding.statement,engine,workerId:workerId??null,reason:'此发现的部分来源未在该研究员本次提交中通过摘录核验。'}
    if(!state.rejectedFindings.some(f=>f.engine===engine&&normalize(f.statement)===normalize(finding.statement)))state.rejectedFindings.push(rejection)
    continue
   }
   const previous=state.findings.find(f=>normalize(f.statement)===normalize(finding.statement)&&f.kind===finding.kind)
   if(previous){
    previous.sourceIds=unique([...previous.sourceIds,...refs])
    previous.engines=unique([...(previous.engines??[previous.engine]),engine])
    previous.workerIds=unique([...(previous.workerIds??[]),workerId])
    previous.taskIds=unique([...(previous.taskIds??[]),taskId])
   }else state.findings.push({statement:finding.statement,kind:finding.kind,sourceIds:unique(refs),limitation:finding.limitation??'',engine,engines:[engine],workerIds:unique([workerId]),taskIds:unique([taskId])})
  }
  state.gaps=unique([...(state.gaps??[]),...(result.gaps??[])])
 }
 await ctx.checkpoint(state)
}
