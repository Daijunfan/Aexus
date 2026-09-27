'use strict';
const {assert}=require('./safety.cjs');
const M=require('./study-model.cjs');
async function optimize(store,p){
 const set=M.findSet(await store.load(),p.setId);M.revision(set,p.expectedRevision);
 const {FSRSBindingItem,FSRSBindingReview,computeParameters}=require('@open-spaced-repetition/binding');
 const items=[];let observations=0;const {dateDiffInDays}=require('ts-fsrs');
 for(const card of set.cards){const logs=card.review?.logs||[],reviews=[];let previous;
  for(const log of logs){const time=new Date(log.review);const days=previous===undefined?0:Math.max(0,dateDiffInDays(previous,time));reviews.push(new FSRSBindingReview(log.rating,days));previous=time;if(reviews.length>=2&&days>0){items[observations%10000]=new FSRSBindingItem([...reviews]);observations++;}}
 }
 assert(items.length>=50,'INSUFFICIENT_HISTORY','Accumulate at least 50 across-day review observations before training.');
 const deadline=Date.now()+30000,parameters=await computeParameters(items,{enableShortTerm:true,numRelearningSteps:1,progress:()=>Date.now()<deadline});
 assert(Array.isArray(parameters)&&parameters.length===21&&parameters.every(Number.isFinite),'TRAINING_FAILED','Optimizer did not return valid parameters.');
 await store.transaction(async state=>{const fresh=M.findSet(state,p.setId);M.revision(fresh,p.expectedRevision);require('./study-history.cjs').checkpoint(fresh);fresh.reviewSettings={...fresh.reviewSettings,w:parameters,trainedAt:new Date().toISOString(),trainingSamples:items.length};M.touch(fresh);});
 const state=await store.load();return M.describe(store,state,M.findSet(state,p.setId));
}
module.exports={optimize};
