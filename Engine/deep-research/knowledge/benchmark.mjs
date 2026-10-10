import {performance} from 'node:perf_hooks';
import {projectKnowledge,projectTopics} from './index.mjs';

function build(size) {
  const sources = Array.from({length:size*2},(_,i)=>({id:'s'+i,dimensionId:'d'+(i%size),dimensionIds:['d'+((i*7)%size)],verified: i%3===0,acquisition:{status:'read',method:'independent-http',excerpts:[{excerpt:'Evidence '+i,sha256:'a'.repeat(64),finalUrl:'https://example.org/'+i,accessedAt:1790000000000}]}}));
  const dimensions = Array.from({length:size},(_,i)=>({id:'d'+i,query:'Research topic '+i}));
  const nodes = Array.from({length:size},(_,i)=>({id:'n'+i,kind:'search',dimensionId:'d'+i,sourceIds:['s'+i,'s'+(size+i)],status:'completed'}));
  const findings = Array.from({length:size*2},(_,i)=>({id:'f'+i,claim:'Finding '+i,sourceIds:['s'+i],dimensionIds:['d'+(i%size)],evidence:[{sourceId:'s'+i,excerpt:'Evidence '+i}]}));
  return {sources,dimensions,graph:{nodes},findings,scouting:{gaps:['Missing standards']}};
}
for(const size of [100,250,500,1000]){
  const state=build(size);
  for(let i=0;i<3;i++) projectKnowledge(state);
  const measurements=[];
  for(let i=0;i<25;i++){
    const t=performance.now();
    const view=projectKnowledge(state);
    measurements.push(performance.now()-t);
    if(view.topics.length!==size) throw Error('Unexpected topic count');
  }
  measurements.sort((a,b)=>a-b);
  console.log(JSON.stringify({size,sourceCount:state.sources.length,findingCount:state.findings.length,medianMs:+measurements[12].toFixed(3),p95Ms:+measurements[23].toFixed(3)}));
}
