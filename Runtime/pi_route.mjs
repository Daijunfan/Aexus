// Pi's original tools and renderers, with execution delegated below the model.
import path from 'node:path';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {
 createReadToolDefinition,createWriteToolDefinition,createEditToolDefinition,
 createBashToolDefinition,createPowerShellToolDefinition,createLsToolDefinition,
 createFindToolDefinition,createGrepToolDefinition,truncateHead,truncateLine,SettingsManager
} from '@earendil-works/pi-coding-agent';

export default async function(pi){
 const url=process.env.CLOUD_HOSTS_ROUTE_URL,token=process.env.CLOUD_HOSTS_ROUTE_TOKEN;
 if(!url||!token)throw Error('Native execution connection is unavailable');
 const call=async(operation,args={},signal,onData)=>{
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({operation,args}),signal});
  if(operation==='execute'){
   const decoder=new TextDecoder();let pending='',result;
   for await(const chunk of response.body){
    pending+=decoder.decode(chunk,{stream:true});let end;
    while((end=pending.indexOf('\n'))>=0){
     const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line)continue;
     const reply=JSON.parse(line);if(reply.error)throw Error(reply.error);
     if(reply.output)onData(Buffer.from(reply.output.data,'base64'));
     if(reply.result)result=reply.result;
    }
   }
   if(!result)throw Error('Native command connection ended before its result');
   return result;
  }
  const reply=await response.json();if(reply.error)throw Error(reply.error);return reply.result;
 };
 const shell={exec:async(command,cwd,{onData,signal,timeout})=>{
  try{
   const result=await call('execute',{command,cwd,timeout},signal,onData);
   if(result.timed_out)throw Error('timeout:'+timeout);
   return {exitCode:result.exit_code};
  }catch(error){if(signal?.aborted)throw Error('aborted');throw error}

 }};
 // A failed command never falls through to a local shell.
 pi.on('user_bash',()=>({operations:shell}));
 const work=await call('environment'),cwd=process.cwd();
 const workPaths=work.os==='windows'?path.win32:path.posix;
 const defaults=SettingsManager.create(cwd).getDefaultTools()||['read','bash','edit','write'];
 const allowed=new Set(['read','write','edit',work.os==='windows'?'powershell':'bash','ls','find','grep']);
 const readFile=async(file)=>Buffer.from((await call('read',{path:file})).data,'base64');
 const writeFile=(file,content)=>call('write',{path:file,data:Buffer.from(content).toString('base64')});
 const access=file=>call('access',{path:file});
 const stat=file=>call('stat',{path:file});
 const read={readFile,access,detectImageMimeType:async file=>{
  const {mime}=await stat(file);return ['image/jpeg','image/png','image/gif','image/webp'].includes(mime)?mime:null;
 }};
 for(const tool of [
  createReadToolDefinition(cwd,{operations:read}),
  createWriteToolDefinition(cwd,{operations:{writeFile,mkdir:file=>call('mkdir',{path:file})}}),
  createEditToolDefinition(cwd,{operations:{readFile,writeFile,access}}),
  createLsToolDefinition(cwd,{operations:{
   exists:async file=>(await stat(file)).exists,
   stat:async file=>{const value=await stat(file);return {isDirectory:()=>value.directory}},
   readdir:file=>call('readdir',{path:file})
  }}),
  createFindToolDefinition(cwd,{operations:{exists:async file=>(await stat(file)).exists,glob:(pattern,folder,options)=>call('find',{path:folder,pattern,...options})}})
 ]){
  pi.registerTool({...tool,execute(id,args,signal,onUpdate,ctx){
   // Expand native home notation against the work account before Pi's
   // controller-side path utility can expand it against the Mac account.
   const name=args.path?.replace(/^@/,'');
   const input=name==='~'||/^~[\\/]/.test(name||'')?{...args,path:workPaths.join(work.home,name.slice(2))}:args;
   return tool.execute(id,input,signal,onUpdate,ctx);
  }});
 }
 // Native shell renderers spill large output on the CLI host. Transfer only
 // that generated cache to the work host and preserve Pi's original result.
 const shellTool=(work.os==='windows'?createPowerShellToolDefinition:createBashToolDefinition)(cwd,{operations:shell,exposeSessionEnvironment:false});
 pi.registerTool({...shellTool,async execute(id,args,signal,onUpdate,ctx){
  let spool,result,failure;
  try{result=await shellTool.execute(id,args,signal,value=>{spool=value.details?.fullOutputPath||spool;onUpdate?.(value)},ctx)}
  catch(error){failure=error}
  if(spool){
   const saved=await call('spill',{data:''});
   for await(const chunk of createReadStream(spool,{highWaterMark:1024*1024}))
    await call('write',{path:saved.path,data:chunk.toString('base64'),append:true});
   if(result){
    result.details.fullOutputPath=saved.path;
    result.content=result.content.map(part=>part.type==='text'?{...part,text:part.text.replaceAll(spool,saved.path)}:part);
   }
   if(failure)failure.message=failure.message.replaceAll(spool,saved.path);
   await fs.unlink(spool);
  }
  if(failure)throw failure;return result;
 }});
 const grep=createGrepToolDefinition(cwd);
 pi.registerTool({...grep,async execute(id,args,signal){
  const result=await call('grep',{...args,path:args.path||cwd},signal);
  const paths=work.os==='windows'?path.win32:path.posix,limit=Math.max(1,args.limit||100);
  const lines=[];let matches=0,linesTruncated=false;
  for(const line of result.output.split('\n')){
   if(!line)continue;const event=JSON.parse(line);
   if(!['match','context'].includes(event.type))continue;
   if(event.type==='match'&&++matches>limit)break;
   const data=event.data,file=data.path.text;
   const relative=result.directory?paths.relative(result.path,file).replaceAll('\\','/'):paths.basename(file);
   const text=data.lines.text.replace(/\r?\n$/,'');
   const shortened=truncateLine(text);linesTruncated||=shortened.wasTruncated;
   const separator=event.type==='match'?':':'-';
   lines.push(relative+separator+data.line_number+separator+' '+shortened.text);
  }
  const truncation=truncateHead(lines.join('\n'),{maxLines:Number.MAX_SAFE_INTEGER});
  const details={...(truncation.truncated?{truncation}:{}),...(matches>limit?{matchLimitReached:limit}:{}),...(linesTruncated?{linesTruncated:true}:{})};
  let text=truncation.content||'No matches found';
  if(matches>limit||truncation.truncated||linesTruncated)text+='\n\n[Output truncated. Narrow the search or read the matching files.]';
  return {content:[{type:'text',text}],details:Object.keys(details).length?details:undefined};
 }});
 pi.on('before_agent_start',event=>{
  // Pi renders its own standard environment section. No routing instructions
  // or application identity are appended to the prompt or conversation.
  event.systemPromptOptions.cwd=work.cwd;
 });
 pi.on('session_start',async(event,ctx)=>{
  pi.setActiveTools(defaults.map(name=>work.os==='windows'&&name==='bash'?'powershell':name).filter(name=>allowed.has(name)));
  ctx.ui.setStatus('work-host',work.hostname+' · '+work.cwd);
  await call('attached');
 });
}
