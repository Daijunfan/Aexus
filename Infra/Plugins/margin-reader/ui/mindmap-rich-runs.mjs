// Replace the format only inside the explicit title range. Existing styles
// outside it survive, including the two fragments of a partly covered run.
export function applyTitleRun(existing,start,end,style){
 const next=[];
 for(const run of existing||[]){if(run.end<=start||run.start>=end){next.push({...run});continue;}if(run.start<start)next.push({...run,end:start});if(run.end>end)next.push({...run,start:end});}
 next.push({start,end,...style});next.sort((a,b)=>a.start-b.start);const result=[];
 const format=run=>JSON.stringify(Object.fromEntries(Object.entries(run).filter(([key])=>key!=='start'&&key!=='end').sort(([a],[b])=>a.localeCompare(b))));
 for(const run of next){const last=result.at(-1);if(last&&last.end===run.start&&format(last)===format(run))last.end=run.end;else result.push(run);}
 return result;
}
