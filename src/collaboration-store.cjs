// Canonical transactional Messages ledger. Legacy group JSON is imported once,
// without replaying historical posts as new model tasks.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const registry=require('./registry.cjs');
let db=null;
const imported=new Set();
const clone=value=>structuredClone(value);
function connection(){
 if(db)return db;
 fs.mkdirSync(path.join(registry.home,'collaboration'),{recursive:true,mode:0o700});
 const name=path.join(registry.home,'collaboration','messages.sqlite');
 if(fs.existsSync(name)&&fs.lstatSync(name).isSymbolicLink())throw Error('Messages database cannot be a symlink');
 db=new DatabaseSync(name);
 db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
 db.exec("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, sequence INTEGER NOT NULL, author_key TEXT NOT NULL, client_key TEXT, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(group_id,sequence));");
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency ON messages(group_id,author_key,client_key) WHERE client_key IS NOT NULL;");
 db.exec("CREATE INDEX IF NOT EXISTS messages_group_sequence ON messages(group_id,sequence DESC);");
 db.exec("CREATE TABLE IF NOT EXISTS deliveries (message_id TEXT NOT NULL REFERENCES messages(id), agent_id TEXT NOT NULL, status TEXT NOT NULL, turn_id TEXT, error TEXT, result_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, published_at TEXT, PRIMARY KEY(message_id,agent_id));");
 db.exec("CREATE INDEX IF NOT EXISTS deliveries_queue ON deliveries(status,created_at);");
 db.exec("CREATE INDEX IF NOT EXISTS deliveries_turn ON deliveries(agent_id,turn_id);");
 return db;
}
function tx(fn){
 const sql=connection();sql.exec('BEGIN IMMEDIATE');
 try{const result=fn(sql);sql.exec('COMMIT');return result}
 catch(error){sql.exec('ROLLBACK');throw error}
}
function migrate(id){
 if(imported.has(id))return;
 const name=path.join(registry.home,'collaboration',id+'.json');
 if(fs.existsSync(name)){
  if(fs.lstatSync(name).isSymbolicLink())throw Error('Legacy group history cannot be a symlink');
  const old=JSON.parse(fs.readFileSync(name,'utf8'));
  if(old.version!==1||!Array.isArray(old.items))throw Error('Invalid legacy group history');
  tx(sql=>{
   const insert=sql.prepare('INSERT OR IGNORE INTO messages(id,group_id,sequence,author_key,client_key,fingerprint,payload) VALUES(?,?,?,?,?,?,?)');
   for(const item of old.items){
    const key=item.author?.kind==='agent'?'agent:'+item.author.id:(item.author?.kind||'operator');
    insert.run(item.id,id,item.sequence,key,item.clientMessageId||null,item.fingerprint||'',JSON.stringify(item));
   }
  });
 }
 imported.add(id);
}
function hydrate(row){
 if(!row)return null;
 const item=JSON.parse(row.payload);
 item.deliveries=connection().prepare('SELECT agent_id AS agentId,status,turn_id AS turnId,error,result_text AS resultText,created_at AS createdAt,updated_at AS updatedAt,completed_at AS completedAt,published_at AS publishedAt FROM deliveries WHERE message_id=? ORDER BY created_at,agent_id').all(item.id);
 return item;
}
function append(item,targetIds=[]){
 migrate(item.groupId);
 const authorKey=item.author.kind==='agent'?'agent:'+item.author.id:item.author.kind;
 return tx(sql=>{
  const previous=item.clientMessageId?sql.prepare('SELECT * FROM messages WHERE group_id=? AND author_key=? AND client_key=?').get(item.groupId,authorKey,item.clientMessageId):null;
  if(previous){if(previous.fingerprint!==item.fingerprint)throw Error('Message retry ID was reused with different content');return {message:hydrate(previous),created:false}}
  item.sequence=Number(sql.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS seq FROM messages WHERE group_id=?').get(item.groupId).seq);
  sql.prepare('INSERT INTO messages(id,group_id,sequence,author_key,client_key,fingerprint,payload) VALUES(?,?,?,?,?,?,?)').run(item.id,item.groupId,item.sequence,authorKey,item.clientMessageId||null,item.fingerprint,JSON.stringify(item));
  const insert=sql.prepare('INSERT INTO deliveries(message_id,agent_id,status,created_at,updated_at) VALUES(?,?,?,?,?)');
  for(const target of targetIds)insert.run(item.id,target,'pending',item.createdAt,item.createdAt);
  queueMicrotask(()=>require('./core-events.cjs').publish('group-message',{groupId:item.groupId,messageId:item.id}));
  return {message:hydrate({payload:JSON.stringify(item)}),created:true};
 });
}
function find(groupId,messageId){migrate(groupId);return hydrate(connection().prepare('SELECT * FROM messages WHERE group_id=? AND id=?').get(groupId,messageId))}
function history(groupId,before,limit){
 migrate(groupId);
 const rows=before===undefined
  ?connection().prepare('SELECT * FROM messages WHERE group_id=? ORDER BY sequence DESC LIMIT ?').all(groupId,limit+1)
  :connection().prepare('SELECT * FROM messages WHERE group_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?').all(groupId,before,limit+1);
 const hasMore=rows.length>limit,page=rows.slice(0,limit).reverse().map(hydrate);
 return {groupId,messages:page,nextBefore:hasMore?page[0].sequence:null};
}
function search(groupId,query,before,limit=50){
 migrate(groupId);
 if(typeof query!=='string'||!query.trim()||query.length>160)throw Error('Search must contain 1–160 characters');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Search limit must be 1..100');
 if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw Error('Invalid search cursor');
 const wildcard='%'+query.trim().replace(/[\\%_]/g,'\\$&')+'%';
 const match="(json_extract(m.payload,'$.text') LIKE ? ESCAPE char(92) OR json_extract(m.payload,'$.author.name') LIKE ? ESCAPE char(92) OR EXISTS (SELECT 1 FROM json_each(m.payload,'$.attachments') AS att WHERE json_extract(att.value,'$.name') LIKE ? ESCAPE char(92)))";
 const sql='SELECT m.* FROM messages m WHERE m.group_id=? AND '+match+(before===undefined?'':' AND m.sequence<?')+' ORDER BY m.sequence DESC LIMIT ?';
 const params=[groupId,wildcard,wildcard,wildcard,...(before===undefined?[]:[before]),limit+1];
 const rows=connection().prepare(sql).all(...params),hasMore=rows.length>limit;
 const page=rows.slice(0,limit).reverse().map(hydrate);
 return {groupId,query:query.trim(),messages:page,nextBefore:hasMore?page[0].sequence:null};
}
function latest(groupId){migrate(groupId);return hydrate(connection().prepare('SELECT * FROM messages WHERE group_id=? ORDER BY sequence DESC LIMIT 1').get(groupId))}
// Recipient task context is a bounded projection of *published* group messages.
// Private Agent journals, future posts and unrelated groups never enter it.
function contextBefore(groupId,sequence,{limit=32,maxChars=22000}={}){
 if(!Number.isSafeInteger(sequence)||sequence<1||!Number.isSafeInteger(limit)||limit<1||limit>80||
    !Number.isSafeInteger(maxChars)||maxChars<1000||maxChars>64000)throw Error('Invalid shared context window');
 migrate(groupId);
 const rows=connection().prepare('SELECT payload FROM messages WHERE group_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?')
  .all(groupId,sequence,limit+1);
 const selected=[];let remaining=maxChars,truncated=rows.length>limit;
 for(const row of rows.slice(0,limit)){
  const item=JSON.parse(row.payload);
  const content=String(item.text||'');
  const entry={id:item.id,sequence:item.sequence,kind:item.kind,
   author:{kind:item.author?.kind||'unknown',id:item.author?.id||null,name:item.author?.name||'Unknown'},
   createdAt:item.createdAt,replyTo:item.replyTo||null,text:content.slice(0,3800),
   attachments:(item.attachments||[]).slice(0,8).map(file=>({name:String(file.name||'').slice(0,180),bytes:file.bytes}))};
  if(content.length>3800)entry.textTruncated=true;
  const size=JSON.stringify(entry).length;
  if(size>remaining){truncated=true;break}
  remaining-=size;selected.push(entry);
 }
 return {messages:selected.reverse(),truncated};
}
function unreadSince(groupId,sequence=0){
 migrate(groupId);
 if(!Number.isSafeInteger(sequence)||sequence<0)throw Error('Invalid read sequence');
 return Number(connection().prepare("SELECT COUNT(*) AS total FROM messages WHERE group_id=? AND sequence>? AND author_key<>'operator'")
  .get(groupId,sequence).total);
}
function pending(limit=40){
 return connection().prepare("SELECT d.message_id AS messageId,d.agent_id AS agentId,d.status,m.group_id AS groupId,m.payload FROM deliveries d JOIN messages m ON m.id=d.message_id WHERE d.status='pending' ORDER BY d.created_at,d.message_id LIMIT ?").all(limit)
  .map(row=>({...row,message:JSON.parse(row.payload)}));
}
function delivery(messageId,agentId){
 return connection().prepare('SELECT * FROM deliveries WHERE message_id=? AND agent_id=?').get(messageId,agentId);
}
function change(messageId,agentId,from,patch){
 return tx(sql=>{
  const current=sql.prepare('SELECT * FROM deliveries WHERE message_id=? AND agent_id=?').get(messageId,agentId);
  if(!current||from&&!from.includes(current.status))return null;
  const next={...current,...patch,updated_at:new Date().toISOString()};
  sql.prepare('UPDATE deliveries SET status=?,turn_id=?,error=?,result_text=?,updated_at=?,completed_at=?,published_at=? WHERE message_id=? AND agent_id=?')
   .run(next.status,next.turn_id||null,next.error||null,next.result_text||null,next.updated_at,next.completed_at||null,next.published_at||null,messageId,agentId);
  queueMicrotask(()=>require('./core-events.cjs').publish('group-delivery',{messageId,agentId,status:next.status}));
  return {...next};
 });
}
function active(){return connection().prepare("SELECT d.*,m.group_id AS groupId FROM deliveries d JOIN messages m ON m.id=d.message_id WHERE d.status IN ('routing','submitted','running','awaiting_reply')").all()}
function byTurn(agentId,turnId){return connection().prepare('SELECT d.*,m.group_id AS groupId FROM deliveries d JOIN messages m ON m.id=d.message_id WHERE d.agent_id=? AND d.turn_id=?').all(agentId,turnId)}
function recover(){
 connection().prepare("UPDATE deliveries SET status='needs_review',error='Core restarted during native execution. Verify the native turn before retrying.',updated_at=? WHERE status IN ('routing','submitted','running')").run(new Date().toISOString());
}
function retry(messageId,agentId){
 const outcome=change(messageId,agentId,['failed','needs_review','completed','awaiting_reply'],{status:'pending',error:null,turn_id:null,completed_at:null,published_at:null,result_text:null});
 if(!outcome)throw Error('Only a finished or failed recipient can be retried');
 return outcome;
}
module.exports={connection,migrate,append,find,history,search,latest,contextBefore,unreadSince,pending,delivery,change,active,byTurn,recover,retry};
