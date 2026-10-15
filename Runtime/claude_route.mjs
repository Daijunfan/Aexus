// Original Claude tools are executed by the work host's native tool runtime.
let environment;
const controls=new Set(['Agent','AskUserQuestion','EnterPlanMode','ExitPlanMode','TodoWrite','TaskCreate','TaskGet','TaskList','TaskUpdate','ListAgents','SendMessage','Skill','ListSkills','ListPlugins','WaitForMcpServers']);
async function invoke($,operation,args={}){
 const node=await $.env.get('CLOUD_HOSTS_NODE'),file=await $.env.get('CLOUD_HOSTS_NATIVE_CALL');
 let stdout='',stderr='',code;
 const stream=$.process.spawn({argv:[node,file],input:JSON.stringify({operation,args})});
 try{for(;;){
  const item=await stream.next();
  if(item.done){code=item.value.code;break}
  if(item.value.stream==='stdout')stdout+=item.value.text;
  if(item.value.stream==='stderr')stderr+=item.value.text;
 }}finally{await stream.return()}
 if(code!==0)throw Error(stderr||'Native execution connection closed');
 return JSON.parse(stdout);
}
export function register(on){
 on('session.start',async($,event,next)=>{
  environment=await invoke($,'environment');await invoke($,'attached');return next(event);
 });
 on('prompt.compose',async($,event,next)=>{
  environment=await invoke($,'environment');
  const result=await next(event);
  return {...result,sections:result.sections.map(section=>{
   let text=section.text;
   if(section.id==='memory'&&environment.memoryDirectory){
    const original=text.match(/persistent file-based memory at `([^`]+)`/)?.[1];
    if(original)text=text.replaceAll(original,environment.memoryDirectory);
   }
   for(const cwd of environment.controllers)text=text.replaceAll(cwd,environment.cwd);
   return {...section,text};
  })};
 });
 on('prompt.attachment',{type:'environment'},async($,event,next)=>{
  environment=await invoke($,'environment');
  const result=await next(event);
  if(!result.text)return result;
  // Keep the engine's template and model identity; replace only work-host facts.
  const values={'Primary working directory':environment.cwd,'Is a git repository':String(environment.isGit),
   'Platform':environment.platform,'Shell':environment.shell,'OS Version':environment.osVersion};
  return {...result,text:result.text.replace(/^( - (Primary working directory|Is a git repository|Platform|Shell|OS Version): )[^\n]+/gm,(_,prefix,key)=>prefix+values[key])};
 });
 on('prompt.mention',async($,event,next)=>{
  const file=await invoke($,'mention',event);environment=file.environment;
  // The target's original Read enforces its rules and primes native edit state.
  // Only rendering the fetched bytes is local, using the unmodified mention UI.
  return next({...event,path:file.path});
 }).catch(($,event,next)=>({deny:'Native file read failed: '+next.error.message}));
 on('prompt.attachment',async($,event,next)=>{
  const result=await next(event);let text=result.text;
  if(text)for(const [local,target]of Object.entries(environment?.attachments||{}))text=text.replaceAll(local,target);
  return {...result,text};
 });
 on('tool.call',async($,event,next)=>{
  if(controls.has(event.tool))return next(event);
  const {tool_use_id,agentId,requestMeta,...tool}=event;
  const {tool:name,...input}=tool;
  const decision=await $.tool.check({tool:name,input});
  if(decision.decision==='deny')return {deny:decision.reason||'The native permission rules refused this operation.'};
  if(decision.decision==='ask'){
   const choice=await $.ui.ask('Run '+name+'?', ['Run once','Cancel']);
   if(choice!=='Run once')return {deny:'The user declined this operation.'};
  }
  const result=await invoke($,'call',{tool});
  environment=result.environment;
  // A message reference belongs to the executor's transcript, not this one.
  const {ref,...reply}=result.reply;return reply;
 }).catch(($,event,next)=>({deny:'Native execution failed: '+next.error.message}));
}
