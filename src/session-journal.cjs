// Core-only read projection of native session events. No model calls, prompt
// wrappers, scheduler instructions, or synthetic conversation messages.
// The native Agent remains the sole source of truth for execution.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const registry=require('./registry.cjs');
const directory=()=>path.join(registry.home,'session-events');
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
const clone=value=>structuredClone(value);
const recently=new Map(),subscribers=new Set();
function fileFor(sessionId){
 if(!validId(sessionId))throw Error('Invalid native session identifier');
 return path.join(directory(),sessionId+'.jsonl');
}
function rows(sessionId){
 const file=fileFor(sessionId);
 if(!fs.existsSync(file))return [];
 if(fs.lstatSync(file).isSymbolicLink())throw Error('Session event journal cannot be a symlink');
 const source=fs.readFileSync(file,'utf8');
 return source.split('\n').filter(Boolean).map((line,index)=>{
  try{return JSON.parse(line)}catch{throw Error('Corrupt native event journal record '+(index+1))}
 });
}
function append(record){
 if(!record||!validId(record.sessionId))throw Error('Invalid native event session');
 if(!['user','assistant','turn','tool','approval','approval-resolved'].includes(record.kind))throw Error('Invalid native event kind');
 if(record.text!==undefined&&(typeof record.text!=='string'||Buffer.byteLength(record.text)>131072))throw Error('Native event text exceeds 128 KiB');
 const file=fileFor(record.sessionId),id=String(record.key||'event:'+randomUUID());
 let known=recently.get(file);
 if(!known){known=new Set(rows(record.sessionId).map(item=>item.key));recently.set(file,known)}
 if(known.has(id))return null;
 const entry={id:'ne_'+randomUUID(),key:id,sessionId:record.sessionId,kind:record.kind,
  nativeThreadId:record.nativeThreadId||null,turnId:record.turnId||null,itemId:record.itemId||null,
  status:record.status||null,text:record.text||'',time:new Date().toISOString()};
 fs.mkdirSync(directory(),{recursive:true,mode:0o700});
 if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Session event journal cannot be a symlink');
 fs.appendFileSync(file,JSON.stringify(entry)+'\n',{mode:0o600});known.add(id);
 for(const subscriber of subscribers){try{subscriber(clone(entry))}catch(error){console.error('CloudHosts journal subscriber:',error.message)}}
 require('./core-events.cjs').publish('agent-event',{agentId:entry.sessionId,kindHint:entry.kind});
 return clone(entry);
}
function history({sessionId,before,limit=80,search}={}){
 if(!validId(sessionId))throw Error('Select a native session ID');
 if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Native history limit must be 1..200');
 if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw Error('Invalid native history cursor');
 if(search!==undefined&&(typeof search!=='string'||search.length>240))throw Error('Invalid native history query');
 let entries=rows(sessionId).map((entry,index)=>({...entry,sequence:index+1}));
 if(before!==undefined)entries=entries.filter(entry=>entry.sequence<before);
 if(search)entries=entries.filter(entry=>(entry.text||'').toLowerCase().includes(search.toLowerCase()));
 const page=entries.slice(-limit);
 return {sessionId,events:page,nextBefore:entries.length>page.length?page[0].sequence:null,
  lastSynchronizedAt:rows(sessionId).at(-1)?.time||null,source:'native-cache',readOnly:true};
}
function entry({sessionId,id}={}){
 // Retained native journals predate the ne_ prefix: compare exact saved IDs
 // without fabricating/reformatting the original native message reference.
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(id))throw Error('Invalid native message reference');
 return clone(rows(sessionId).find(item=>item.id===id)||null);
}
function summaries(){
 if(!fs.existsSync(directory()))return [];
 return fs.readdirSync(directory()).filter(name=>/^[a-zA-Z0-9_-]{1,128}\.jsonl$/.test(name)&&fs.lstatSync(path.join(directory(),name)).isFile())
  .map(name=>{
   const sessionId=name.slice(0,-6),entries=rows(sessionId),last=entries.at(-1);
   return {sessionId,count:entries.length,lastAt:last?.time||null,lastKind:last?.kind||null,
    preview:(entries.findLast(e=>e.kind==='assistant')?.text||'').slice(0,180)};
  });
}
function observe(role,event){
 if(!role?.id||!event||typeof event!=='object')return null;
 const params=event.params||{},method=event.method||'',threadId=params.threadId||role.threadId||null,
  turnId=params.turnId||params.turn?.id||null,item=params.item||{},itemId=params.itemId||item.id||null;
 const base={sessionId:role.id,nativeThreadId:threadId,turnId,itemId};
 if(method==='item/completed'&&item.type==='agentMessage')
  return append({...base,kind:'assistant',key:'assistant:'+threadId+':'+(item.id||randomUUID()),text:String(item.text||'')});
 if(method==='item/completed'&&item.type==='userMessage')
  return append({...base,kind:'user',key:'user-item:'+threadId+':'+(item.id||randomUUID()),text:(Array.isArray(item.content)?item.content:[]).map(value=>value.text||'').join('\n')});
 if(method==='turn/started')return append({...base,kind:'turn',status:'running',key:'turn-start:'+threadId+':'+turnId});
 if(method==='turn/completed')return append({...base,kind:'turn',status:params.turn?.status||'completed',
  text:params.turn?.error?.message||'',key:'turn-end:'+threadId+':'+turnId});
 if(method==='item/completed'&&['commandExecution','fileChange'].includes(item.type))
  return append({...base,kind:'tool',status:item.status||String(item.exitCode??''),key:'tool:'+threadId+':'+(item.id||randomUUID()),
   text:item.type==='fileChange'?'File changes completed':'Command completed'});
 if(method==='serverRequest/resolved')return append({...base,kind:'approval-resolved',key:'approval-resolved:'+threadId+':'+params.requestId});
 if(event.id!==undefined&&/requestApproval|requestUserInput/.test(method))
  return append({...base,kind:'approval',status:'pending',key:'approval:'+threadId+':'+event.id,text:'Native approval required'});
 return null;
}
function accepted(role,turnId,text){
 if(typeof turnId!=='string'||!turnId||typeof text!=='string'||!text.trim())return null;
 return append({sessionId:role.id,nativeThreadId:role.threadId,turnId,kind:'user',key:'user-accepted:'+role.threadId+':'+turnId,text});
}
function imported(role,thread){
 if(!thread||!Array.isArray(thread.turns))return;
 for(const turn of thread.turns){
  const turnId=turn.id||null;
  for(const item of turn.items||[]){
   if(item.type==='agentMessage')append({sessionId:role.id,nativeThreadId:thread.id,turnId,itemId:item.id,kind:'assistant',text:item.text||'',key:'assistant:'+thread.id+':'+item.id});
   if(item.type==='userMessage')append({sessionId:role.id,nativeThreadId:thread.id,turnId,itemId:item.id,kind:'user',text:(Array.isArray(item.content)?item.content:[]).map(v=>v.text||'').join('\n'),key:'user-item:'+thread.id+':'+item.id});
  }
 }
}
function subscribe(callback){subscribers.add(callback);return ()=>subscribers.delete(callback)}
module.exports={append,history,entry,summaries,observe,accepted,imported,subscribe};
