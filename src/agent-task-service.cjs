// One native submission contract shared by Messages, Company and Plan.
// Source-specific queues own durable claims and publication; this service
// binds exact Agent identity, session activation, authorization and receipt.
const agents=require('./agent-sessions.cjs'),journal=require('./session-journal.cjs');
const sources=new Set(['private','message','group','company','plan','delegation']);
const engines=new Set(['codex','claude','pi','cline']);
function sameIdentity(before,current){
 return !!current&&['id','engine','transport','targetHostId','engineHostId','cwd'].every(key=>before[key]===current[key])&&
  (!before.threadId||before.threadId===current.threadId)&&
  (!before.collaborationSessionId||before.collaborationSessionId===current.collaborationSessionId);
}
function ready(role){
 if(!role||!engines.has(role.engine)||!['native','pty'].includes(role.transport))throw Error('No structured native Agent execution protocol');
 if(role.busy||role.transport==='native'&&!role.running)throw Error('Exact native Agent is unavailable or busy');
 return role;
}
async function submit({role,scope,prepare,authorize=()=>{},activate=true}={}){
 if(!role?.id)throw Error('Persistent Agent identity is required');
 if(!scope||!sources.has(scope.source)||scope.agentId!==role.id)throw Error('Invalid native TaskContext source or executor');
 if(typeof prepare!=='function')throw Error('A Task must prepare its native instructions');
 const initial={...role};
 let current=agents.sessions().find(item=>item.id===initial.id);
 if(!sameIdentity(initial,current))throw Error('Exact native Agent identity changed before dispatch');
 if(!engines.has(current.engine)||!['native','pty'].includes(current.transport))throw Error('No structured native Agent execution protocol');
 if(activate&&current.transport==='native'&&!current.running){
  await agents.activate({id:current.targetHostId,session:current.id});
  current=agents.sessions().find(item=>item.id===initial.id);
 }
 if(!sameIdentity(initial,current))throw Error('Exact native Agent identity changed during activation');
 ready(current);
 await authorize(current);
 const text=await prepare(current);
 current=agents.sessions().find(item=>item.id===initial.id);
 if(!sameIdentity(initial,current))throw Error('Exact native Agent identity changed while preparing work');
 ready(current);
 await authorize(current);
 if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>65536)throw Error('Native task text must be 1–64 KiB');
 const accepted=await agents.send({id:current.targetHostId,session:current.id,text,scope});
 if(!accepted?.turnId)throw Error('Native Agent accepted work without an exact turn ID; inspect the original session');
 return {accepted,agent:current};
}
function finishedTurn(sessionId,turnId){
 return journal.history({sessionId,limit:200}).events.findLast(row=>row.kind==='turn'&&row.turnId===turnId&&row.status!=='running');
}
function finalAnswer(sessionId,turnId){
 return (journal.history({sessionId,limit:200}).events
  .filter(row=>row.kind==='assistant'&&row.turnId===turnId).at(-1)?.text||'').slice(0,16000);
}
module.exports={submit,finishedTurn,finalAnswer,sameIdentity};
