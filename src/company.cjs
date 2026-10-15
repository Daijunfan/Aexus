// Company is a permissioned orchestration layer over existing CloudHosts Agent IDs.
// Organization membership does not change native host, project or session identity.
const {randomUUID,createHash}=require('node:crypto');
const store=require('./collaboration-store.cjs');
const management=require('./company-policy.cjs');
const roles=['worker','manager','coordinator','administrator'];
const agents=()=>require('./agent-sessions.cjs').sessions();
const clone=value=>structuredClone(value),now=()=>new Date().toISOString();
const title=(value,label,max=160)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+' must contain 1–'+max+' characters');
 return value.trim();
};
const db=()=>{
 const sql=store.connection();
 sql.exec("CREATE TABLE IF NOT EXISTS company_teams (id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);");
 sql.exec("CREATE TABLE IF NOT EXISTS company_members (team_id TEXT NOT NULL REFERENCES company_teams(id),agent_id TEXT NOT NULL,PRIMARY KEY(team_id,agent_id));");
 sql.exec("CREATE TABLE IF NOT EXISTS company_policy (agent_id TEXT PRIMARY KEY,role TEXT NOT NULL);");
 sql.exec("CREATE TABLE IF NOT EXISTS company_bindings (id TEXT PRIMARY KEY,manager_id TEXT NOT NULL,employee_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(manager_id,employee_id));");
 sql.exec("CREATE TABLE IF NOT EXISTS company_tasks (id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,requested_by TEXT NOT NULL,parent_task_id TEXT,source_kind TEXT NOT NULL,source_id TEXT,client_key TEXT,fingerprint TEXT NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,turn_id TEXT,engine TEXT,host_id TEXT,session_id TEXT,result_text TEXT,error TEXT,created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,updated_at TEXT NOT NULL);");
 sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS company_task_idempotency ON company_tasks(requested_by,client_key) WHERE client_key IS NOT NULL;");
 sql.exec("CREATE INDEX IF NOT EXISTS company_task_dispatch ON company_tasks(status,created_at);");
 sql.exec("CREATE INDEX IF NOT EXISTS company_task_turn ON company_tasks(session_id,turn_id);");
 return sql;
};
function transaction(fn){
 const sql=db();sql.exec('BEGIN IMMEDIATE');
 try{const result=fn(sql);sql.exec('COMMIT');return result}
 catch(error){sql.exec('ROLLBACK');throw error}
}
function knownAgent(id){
 const found=agents().find(item=>item.id===id);
 if(!found)throw Error('Unknown persistent Agent identity');
 return found;
}
function roster(){
 const sql=db(),saved=new Map(sql.prepare('SELECT agent_id,role FROM company_policy').all().map(row=>[row.agent_id,row.role]));
 const memberships=sql.prepare('SELECT team_id,agent_id FROM company_members').all();
 return agents().map(item=>({...item,companyRole:saved.get(item.id)||'worker',
  teamIds:memberships.filter(link=>link.agent_id===item.id).map(link=>link.team_id)}));
}
function teams(){
 const sql=db(),members=sql.prepare('SELECT team_id,agent_id FROM company_members').all();
 return sql.prepare('SELECT id,name,description,revision,created_at AS createdAt,updated_at AS updatedAt FROM company_teams ORDER BY created_at,id').all()
  .map(team=>({...team,memberIds:members.filter(row=>row.team_id===team.id).map(row=>row.agent_id)}));
}
function ensureMembers(ids){
 if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'))throw Error('Choose at most 200 Agent IDs');
 const result=[...new Set(ids)];for(const id of result)knownAgent(id);return result;
}
function createTeam({name,description='',memberIds=[]}={}){
 name=title(name,'Team name',100);
 if(typeof description!=='string'||description.length>1000)throw Error('Team description too long');
 const ids=ensureMembers(memberIds),id='tm_'+randomUUID(),stamp=now();
 transaction(sql=>{
  sql.prepare('INSERT INTO company_teams(id,name,description,revision,created_at,updated_at) VALUES(?,?,?,?,?,?)')
   .run(id,name,description,1,stamp,stamp);
  const add=sql.prepare('INSERT INTO company_members(team_id,agent_id) VALUES(?,?)');
  for(const agentId of ids)add.run(id,agentId);
 });
 require('./core-events.cjs').publish('company-change');return teams().find(row=>row.id===id);
}
function updateTeam({id,name,description,memberIds,expectedRevision}={}){
 const ids=memberIds!==undefined?ensureMembers(memberIds):null;
 return transaction(sql=>{
  const team=sql.prepare('SELECT * FROM company_teams WHERE id=?').get(id);
  if(!team)throw Error('Unknown Team');
  if(expectedRevision!==undefined&&expectedRevision!==team.revision)throw Error('Team changed; refresh before saving');
  const stamp=now();
  sql.prepare('UPDATE company_teams SET name=?,description=?,revision=?,updated_at=? WHERE id=?')
   .run(name===undefined?team.name:title(name,'Team name',100),description===undefined?team.description:description===''?'':title(description,'Team description',1000),team.revision+1,stamp,id);
  if(ids){sql.prepare('DELETE FROM company_members WHERE team_id=?').run(id);
   const add=sql.prepare('INSERT INTO company_members(team_id,agent_id) VALUES(?,?)');
   for(const member of ids)add.run(id,member);
  }
  queueMicrotask(()=>require('./core-events.cjs').publish('company-change'));return {id,revision:team.revision+1};
 });
}
function assignRole({agentId,role}={}){
 const item=knownAgent(agentId);
 if(!roles.includes(role))throw Error('Select Worker, Manager, Coordinator or Administrator');
 if(role==='administrator'&&(item.engineHostId!=='local'||item.targetHostId!=='local'))
  throw Error('Application Administrator must run locally on the controller');
 db().prepare('INSERT INTO company_policy(agent_id,role) VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET role=excluded.role').run(agentId,role);
 require('./core-events.cjs').publish('company-change');return roster().find(row=>row.id===agentId);
}
function roleFor(id){return db().prepare('SELECT role FROM company_policy WHERE agent_id=?').get(id)?.role||'worker'}
function canManage(requester,targetId,action='delegate'){
 return management.can({requester,targetId,action,roster:roster(),teams:teams()});
}
function canDelegate(requester,targetId){return canManage(requester,targetId,'delegate')}
// Group membership is collaboration, not Company management authorization.
// Peer members of an existing team can talk without granting a peer control.
function canCollaborate(requester,targetId){
 if(requester?.kind==='operator')return true;
 const people=roster(),source=people.find(row=>row.id===requester?.agentId),target=people.find(row=>row.id===targetId);
 if(!source||!target)return false;
 if(source.id===target.id)return true;
 if(['coordinator','administrator'].includes(source.companyRole))return true;
 return teams().some(team=>team.memberIds.includes(source.id)&&team.memberIds.includes(target.id));
}
function requireDelegation(requester,targetId){
 if(!canDelegate(requester,targetId))throw Error('Forbidden delegation: target is outside Agent management scope');
 return knownAgent(targetId);
}
function bindings(){
 return db().prepare('SELECT id,manager_id AS managerId,employee_id AS employeeId,created_at AS createdAt FROM company_bindings ORDER BY created_at').all();
}
function bind({managerId,employeeId,enabled=true}={}){
 const source=knownAgent(managerId);knownAgent(employeeId);
 if(source.id===employeeId||!canManage({kind:'agent',agentId:managerId},employeeId,'configure'))throw Error('Only a real manager may bind a permitted subordinate');
 const sql=db();
 if(enabled===false)sql.prepare('DELETE FROM company_bindings WHERE manager_id=? AND employee_id=?').run(managerId,employeeId);
 else sql.prepare('INSERT OR IGNORE INTO company_bindings(id,manager_id,employee_id,created_at) VALUES(?,?,?,?)').run('cb_'+randomUUID(),managerId,employeeId,now());
 require('./core-events.cjs').publish('company-change');return {managerId,employeeId,bound:!!enabled,relations:bindings()};
}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function delegateAs(requester,{agentId,text,clientTaskId,parentTaskId,sourceKind='company',sourceId}={}){
 const target=requireDelegation(requester,agentId),body=title(text,'Delegated task',16000);
 if(!['company','group','message','plan'].includes(sourceKind))throw Error('Invalid delegation source');
 if(clientTaskId!==undefined&&(typeof clientTaskId!=='string'||!/^[\w:-]{6,160}$/.test(clientTaskId)))throw Error('Invalid delegation idempotency key');
 const requestedBy=requester.kind==='operator'?'operator':'agent:'+requester.agentId;
 const hash=fingerprint([agentId,body,parentTaskId||null,sourceKind,sourceId||null]);
 return transaction(sql=>{
  const previous=clientTaskId?sql.prepare('SELECT * FROM company_tasks WHERE requested_by=? AND client_key=?').get(requestedBy,clientTaskId):null;
  if(previous){if(previous.fingerprint!==hash)throw Error('Delegation retry key was reused');return task({id:previous.id})}
  if(parentTaskId){
   const original=sql.prepare('SELECT * FROM company_tasks WHERE id=?').get(parentTaskId);
   if(!original)throw Error('Unknown delegation parent');
   if(requester.kind==='agent'&&original.agent_id!==requester.agentId)throw Error('Cannot delegate an unrelated task');
   let current=original;
   for(let depth=0;current;depth++){
    if(depth>12)throw Error('Delegation chain too deep');
    if(current.agent_id===agentId)throw Error('Delegation loop detected');
    current=current.parent_task_id?sql.prepare('SELECT * FROM company_tasks WHERE id=?').get(current.parent_task_id):null;
   }
  }
  const id='dt_'+randomUUID(),timestamp=now();
  sql.prepare('INSERT INTO company_tasks(id,agent_id,requested_by,parent_task_id,source_kind,source_id,client_key,fingerprint,text,status,engine,host_id,session_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(id,agentId,requestedBy,parentTaskId||null,sourceKind,sourceId||null,clientTaskId||null,hash,body,'pending',target.engine,target.targetHostId,target.id,timestamp,timestamp);
  queueMicrotask(()=>require('./core-events.cjs').publish('company-task',{taskId:id,agentId,status:'pending'}));
  return {id,agentId,status:'pending',text:body,requestedBy,parentTaskId:parentTaskId||null,sourceKind,sourceId:sourceId||null,createdAt:timestamp};
 });
}
function delegate(args){const output=delegateAs({kind:'operator'},args);queueMicrotask(()=>require('./company-execution.cjs').kick());return output}
function agentDelegate(principal,args){const output=delegateAs({kind:'agent',agentId:principal},args);queueMicrotask(()=>require('./company-execution.cjs').kick());return output}
function task({id}){
 const row=db().prepare('SELECT * FROM company_tasks WHERE id=?').get(id);
 if(!row)throw Error('Unknown delegation');
 return map(row);
}
const map=row=>({id:row.id,agentId:row.agent_id,requestedBy:row.requested_by,parentTaskId:row.parent_task_id,
 sourceKind:row.source_kind,sourceId:row.source_id,text:row.text,status:row.status,
 turnId:row.turn_id,engine:row.engine,hostId:row.host_id,sessionId:row.session_id,
 resultText:row.result_text,error:row.error,createdAt:row.created_at,startedAt:row.started_at,finishedAt:row.finished_at,updatedAt:row.updated_at});
function tasks({agentId,limit=100}={}){
 if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid delegation history limit');
 const sql=db();
 return (agentId?sql.prepare('SELECT * FROM company_tasks WHERE agent_id=? OR requested_by=? ORDER BY created_at DESC LIMIT ?').all(agentId,'agent:'+agentId,limit)
  :sql.prepare('SELECT * FROM company_tasks ORDER BY created_at DESC LIMIT ?').all(limit)).map(map);
}
function pending(limit=40){return db().prepare("SELECT * FROM company_tasks WHERE status='pending' ORDER BY created_at LIMIT ?").all(limit).map(map)}
function change(id,from,patch){
 return transaction(sql=>{
  const prev=sql.prepare('SELECT * FROM company_tasks WHERE id=?').get(id);
  if(!prev||from&&!from.includes(prev.status))return null;
  const next={...prev,...patch,updated_at:now()};
  sql.prepare('UPDATE company_tasks SET status=?,turn_id=?,result_text=?,error=?,started_at=?,finished_at=?,updated_at=? WHERE id=?')
   .run(next.status,next.turn_id||null,next.result_text||null,next.error||null,next.started_at||null,next.finished_at||null,next.updated_at,id);
  queueMicrotask(()=>require('./core-events.cjs').publish('company-task',{taskId:id,agentId:next.agent_id,status:next.status}));
  return map(next);
 });
}
function byTurn(sessionId,turnId){
 return db().prepare('SELECT * FROM company_tasks WHERE session_id=? AND turn_id=?').all(sessionId,turnId).map(map);
}
function recover(){
 db().prepare("UPDATE company_tasks SET status='needs_review',error='Core restarted during native work. Check original session before retry.',updated_at=? WHERE status IN ('routing','submitted','running')").run(now());
}
function retry({id}){
 const prior=task({id});
 requireDelegation({kind:'operator'},prior.agentId);
 const result=change(id,['failed','needs_review'],{status:'pending',turn_id:null,result_text:null,error:null,started_at:null,finished_at:null});
 if(!result)throw Error('Only failed or uncertain tasks can be retried');
 queueMicrotask(()=>require('./company-execution.cjs').kick());
 return result;
}
module.exports={roles,roster,teams,createTeam,updateTeam,assignRole,bindings,bind,canManage,canDelegate,canCollaborate,delegate,agentDelegate,task,tasks,pending,change,byTurn,recover,retry};
