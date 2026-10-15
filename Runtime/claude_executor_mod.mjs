// Private execution worker: invoke Claude Code's original tools, without a model turn.
async function restoreToolEnvironment($,inherited){
 let original={...inherited};
 for(const source of ['user','project','local','policy'])original={...original,...(await $.settings.read({source})).env};
 await $.env.set('ANTHROPIC_BASE_URL',original.ANTHROPIC_BASE_URL??undefined);
 await $.env.set('ANTHROPIC_API_KEY',original.ANTHROPIC_API_KEY??undefined);
 await $.env.set('ANTHROPIC_AUTH_TOKEN',original.ANTHROPIC_AUTH_TOKEN??undefined);
}
function memoryDirectory(prompt){return prompt.sections.find(section=>section.id==='memory')?.text.match(/persistent file-based memory at `([^`]+)`/)?.[1]}
export function register(on){
 // No model loop is started by this worker. Tool-internal behavior stays native.
 on('turn.step',async function*($,event){return {turnId:event.turnId,index:event.index,answer:'',toolUses:[],stopReason:null,usage:null}})
  .catch(async function*($,event){return {turnId:event.turnId,index:event.index,answer:'',toolUses:[],stopReason:null,usage:null}});
 on('session.start',async($,event,next)=>{
  await $.command.register({name:'native-executor',description:'Native tool execution worker'});
  return next(event);
 });
 on('command.run',{command:'native-executor'},async($,event,next)=>{
  const url=await $.env.get('CLOUD_HOSTS_EXEC_URL'),token=await $.env.get('CLOUD_HOSTS_EXEC_TOKEN');
  const inherited=JSON.parse(await $.env.get('CLOUD_HOSTS_EXEC_ORIGINAL_ENV')||'{}');
  await $.env.set('CLOUD_HOSTS_EXEC_URL',undefined);await $.env.set('CLOUD_HOSTS_EXEC_TOKEN',undefined);await $.env.set('CLOUD_HOSTS_EXEC_ORIGINAL_ENV',undefined);
  await restoreToolEnvironment($,inherited);
  const prompt=await $.prompt.compose({traits:['analysis']});
  const shell=await $.env.get('CLAUDE_CODE_SHELL')||await $.env.get('SHELL')||await $.env.get('CLAUDE_CODE_GIT_BASH_PATH')||'bash';
  await $.http.fetch(url+'/ready',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({tools:await $.tool.list(),memoryDirectory:memoryDirectory(prompt),shell,isGit:!!await $.session.repo()})});
  while(!next.signal.aborted){
   const response=await $.http.fetch(url+'/next',{headers:{authorization:'Bearer '+token}});
   if(!response.ok)break;
   const request=JSON.parse(response.text);if(!request.id)continue;
   let result;
   try{await restoreToolEnvironment($,inherited);result=await $.tool.call(request.tool)}catch(error){result={isError:true,result:error.message,text:error.message}}
   const updated=await $.prompt.compose({traits:['analysis']});
   await $.http.fetch(url+'/result',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({id:request.id,result,environment:{cwd:await $.session.cwd(),isGit:!!await $.session.repo(),
    memoryDirectory:memoryDirectory(updated)}})});
  }
  return {text:''};
 }).catch(()=>({text:''}));
}
