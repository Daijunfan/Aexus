// Aexus Channels business model, adapted for the single CloudHosts Core.
// Uses the canonical collaboration SQLite DB; collectors receive source-bound
// capabilities and never an operator/Agent identity or host credentials.
'use strict';
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const store=require('./collaboration-store.cjs');
const agents=require('./agent-sessions.cjs');
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const iso=()=>new Date().toISOString();
const clone=value=>structuredClone(value);
const text=(value,label,max=16000)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(label+' must contain 1–'+max+' characters');return value.trim()};
const optional=(value,label,max=1000)=>value===undefined?'':value===''?'':text(value,label,max);
const id=(value,label='ID')=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(value))throw Error('Invalid '+label);return value};
const fields=(args,allowed)=>{if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!allowed.includes(key)))throw Error('Invalid or unknown Channel fields')};
const principal=actor=>actor?.kind==='agent'?'agent:'+id(actor.agentId,'Agent ID'):'operator';
const time=value=>{const number=value===undefined?Date.now():typeof value==='number'?value:Date.parse(value);if(!Number.isSafeInteger(number)||number<0)throw Error('Invalid channel publishedAt');return number};
const limit=value=>{if(value===undefined)return 20;if(!Number.isInteger(value)||value<1||value>100)throw Error('Channel history limit must be 1–100');return value};
const membership=values=>{if(!Array.isArray(values)||values.length>200)throw Error('Choose up to 200 existing Agents');const known=new Set(agents.sessions().map(row=>row.id));const result=[...new Set(values.map(value=>id(value,'Agent ID')))];for(const value of result)if(!known.has(value))throw Error('Unknown Agent: '+value);return result};
function db(){
 const sql=store.connection();
 sql.exec("CREATE TABLE IF NOT EXISTS channel_rooms (id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,mode TEXT NOT NULL,owner_id TEXT,publishers_json TEXT NOT NULL,members_json TEXT NOT NULL,admins_json TEXT NOT NULL,retention_days INTEGER NOT NULL,revision INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);");
 sql.exec("CREATE TABLE IF NOT EXISTS channel_sources (id TEXT PRIMARY KEY,channel_id TEXT NOT NULL REFERENCES channel_rooms(id),plugin TEXT NOT NULL,locator TEXT NOT NULL,name TEXT NOT NULL,enabled INTEGER NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(plugin,locator));");
 sql.exec("CREATE INDEX IF NOT EXISTS channel_source_rooms ON channel_sources(channel_id,enabled);");
 sql.exec("CREATE TABLE IF NOT EXISTS channel_entries (id TEXT PRIMARY KEY,channel_id TEXT NOT NULL REFERENCES channel_rooms(id),sequence INTEGER NOT NULL,kind TEXT NOT NULL,source_id TEXT REFERENCES channel_sources(id),external_id TEXT,author_key TEXT NOT NULL,client_key TEXT,fingerprint TEXT NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active',expires_at INTEGER,saved_at TEXT,created_at TEXT NOT NULL,UNIQUE(channel_id,sequence));");
 sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS channel_entry_source_external ON channel_entries(source_id,external_id) WHERE source_id IS NOT NULL AND external_id IS NOT NULL;");
 sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS channel_entry_client_dedup ON channel_entries(channel_id,author_key,client_key) WHERE client_key IS NOT NULL;");
 sql.exec("CREATE INDEX IF NOT EXISTS channel_entry_feed ON channel_entries(channel_id,sequence DESC);");
 sql.exec("CREATE TABLE IF NOT EXISTS channel_reads (principal TEXT NOT NULL,channel_id TEXT NOT NULL,entry_id TEXT NOT NULL REFERENCES channel_entries(id),created_at TEXT NOT NULL,PRIMARY KEY(principal,channel_id,entry_id));");
 sql.exec("CREATE TABLE IF NOT EXISTS channel_collectors (id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,source_ids TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT);");
 return sql;
}
function tx(work){const sql=db();sql.exec('BEGIN IMMEDIATE');try{const value=work(sql);sql.exec('COMMIT');return value}catch(error){sql.exec('ROLLBACK');throw error}}
const rowRoom=(row)=>({...row,memberIds:JSON.parse(row.members_json),adminIds:JSON.parse(row.admins_json),
 publisherIds:JSON.parse(row.publishers_json),ownerId:row.owner_id,archived:!!row.archived,retentionDays:row.retention_days,
 createdAt:row.created_at,updatedAt:row.updated_at});
function requireRoom(roomId,actor,allowArchived=false){
 const row=db().prepare('SELECT * FROM channel_rooms WHERE id=?').get(id(roomId,'channel ID'));
 if(!row||row.archived&&!allowArchived)throw Error('Unknown or unavailable channel');
 const room=rowRoom(row);
 if(actor?.kind==='agent'&&!room.memberIds.includes(actor.agentId))throw Error('Channel membership is required');
 return room;
}
function publicRoom(room){return {id:room.id,name:room.name,description:room.description,mode:room.mode,
  memberIds:room.memberIds,adminIds:room.adminIds,publisherIds:room.publisherIds,ownerId:room.ownerId,
  retentionDays:room.retentionDays,revision:room.revision,archived:room.archived,createdAt:room.createdAt,updatedAt:room.updatedAt};}
const roomView=(row,actor)=>{const room=publicRoom(rowRoom(row));
 const count=db().prepare("SELECT COUNT(*) AS n FROM channel_entries WHERE channel_id=? AND state='active' AND kind='news' AND (expires_at>? OR saved_at IS NOT NULL)").get(room.id,Date.now()).n;
 return {...room,postCount:count,unreadCount:unreadCount(room.id,actor)};
};
function unreadCount(channelId,actor){
 const sql=db(),p=principal(actor);
 return Number(sql.prepare("SELECT COUNT(*) AS n FROM channel_entries e WHERE e.channel_id=? AND e.state='active' AND (e.kind='message' OR e.expires_at>? OR e.saved_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM channel_reads r WHERE r.principal=? AND r.entry_id=e.id)").get(channelId,Date.now(),p).n);
}
function publishChange(channelId,entryId){queueMicrotask(()=>require('./core-events.cjs').publish('channel-change',{channelId,entryId}));}
const rowSource=row=>({id:row.id,channelId:row.channel_id,plugin:row.plugin,locator:row.locator,name:row.name,enabled:!!row.enabled,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at});
function findEntry(entryId,actor,includeRemoved=false){
 const row=db().prepare('SELECT * FROM channel_entries WHERE id=?').get(id(entryId,'entry ID'));
 if(!row)throw Error('Unknown channel entry');
 requireRoom(row.channel_id,actor,true);
 if(!includeRemoved&&(row.state!=='active'||row.expires_at!==null&&!row.saved_at&&row.expires_at<=Date.now()))throw Error('Channel entry is unavailable or expired');
 return row;
}
function entryView(row){const body=JSON.parse(row.payload_json);
 return {...body,sequence:row.sequence,saved:!!row.saved_at,channelId:row.channel_id,
  ...(row.expires_at!==null?{expiresAt:new Date(row.expires_at).toISOString()}:{})};
}
function nextSequence(sql,channelId){return Number(sql.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM channel_entries WHERE channel_id=?').get(channelId).next)}
function verifyPublisher(room,actor){
 if(actor?.kind!=='agent')return;
 if(room.mode!=='agents'||!room.publisherIds.includes(actor.agentId)||!room.memberIds.includes(actor.agentId))
  throw Error('This Agent has no active publishing permission in the channel');
}
function collectorIdentity(token){
 if(typeof token!=='string'||!/^news_[a-f0-9]{64}$/.test(token))throw Error('Collector token is invalid');
 const saved=db().prepare('SELECT * FROM channel_collectors WHERE token_hash=? AND revoked_at IS NULL').get(digest(token));
 if(!saved)throw Error('Collector token is invalid or revoked');
 return {id:saved.id,name:saved.name,sourceIds:JSON.parse(saved.source_ids)};
}
function create({name,description='',mode='agents',memberIds=[],publisherIds=[],adminIds=[],ownerId=null,retentionDays=2}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may create channels');
 name=text(name,'Channel name',100);description=optional(description,'description',1000);
 if(!['agents','external'].includes(mode))throw Error('Channel engine must be agents or external');
 if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>365)throw Error('Channel retention must be 1–365 days');
 const members=membership(memberIds),admins=membership(adminIds),publishers=membership(publisherIds);
 for(const member of [...admins,...publishers])if(!members.includes(member))throw Error('Administrators and publishers must be current channel members');
 if(ownerId!==null&&!members.includes(ownerId))throw Error('Owner must be a current channel member');
 if(mode==='external'&&publishers.length)throw Error('External channel publishing uses source-scoped collector tokens');
 const stamp=iso(),roomId='nc_'+randomUUID();
 db().prepare('INSERT INTO channel_rooms VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)')
  .run(roomId,name,description,mode,ownerId,JSON.stringify(publishers),JSON.stringify(members),
   JSON.stringify(admins),retentionDays,1,stamp,stamp);
 publishChange(roomId);return get({id:roomId},actor);
}
function update({id:channelId,name,description,memberIds,adminIds,publisherIds,ownerId,expectedRevision,archived}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may configure channels');
 const room=requireRoom(channelId,actor,true);
 if(expectedRevision!==undefined&&expectedRevision!==room.revision)throw Error('Channel changed; reload before saving');
 const members=memberIds===undefined?room.memberIds:membership(memberIds);
 const admins=adminIds===undefined?room.adminIds:membership(adminIds);
 const publishers=publisherIds===undefined?room.publisherIds:membership(publisherIds);
 const owner=ownerId===undefined?room.owner_id:ownerId;
 if(owner!==null&&!members.includes(owner))throw Error('Transfer Owner before removing their membership');
 for(const member of [...admins,...publishers])if(!members.includes(member))throw Error('Administrators and publishers must be current members');
 if(room.mode==='external'&&publishers.length)throw Error('External channels publish through source-scoped collectors');
 if(archived!==undefined&&typeof archived!=='boolean')throw Error('Invalid channel archived state');
 const row=db().prepare('SELECT * FROM channel_rooms WHERE id=?').get(channelId);
 db().prepare('UPDATE channel_rooms SET name=?,description=?,owner_id=?,members_json=?,admins_json=?,publishers_json=?,archived=?,revision=revision+1,updated_at=? WHERE id=?')
  .run(name===undefined?room.name:text(name,'Channel name',100),description===undefined?room.description:optional(description,'description',1000),
   owner,JSON.stringify(members),JSON.stringify(admins),JSON.stringify(publishers),archived===undefined?row.archived:Number(archived),iso(),channelId);
 publishChange(channelId);return get({id:channelId},actor);
}
function list(_args={},actor={kind:'operator'}){
 return db().prepare('SELECT * FROM channel_rooms WHERE archived=0 ORDER BY created_at,id').all()
  .filter(row=>actor?.kind!=='agent'||JSON.parse(row.members_json).includes(actor.agentId))
  .map(row=>roomView(row,actor));
}
function get({id:channelId}={},actor={kind:'operator'}){
 const room=requireRoom(channelId,actor,true),row=db().prepare('SELECT * FROM channel_rooms WHERE id=?').get(room.id);
 return roomView(row,actor);
}
function grantSnapshot(agentId){
 return db().prepare('SELECT id,revision,members_json,admins_json,publishers_json,archived FROM channel_rooms').all()
  .filter(row=>JSON.parse(row.members_json).includes(agentId))
  .map(row=>({id:row.id,revision:row.revision,admins:JSON.parse(row.admins_json).includes(agentId),
   publisher:JSON.parse(row.publishers_json).includes(agentId),archived:!!row.archived}));
}
function canonicalLocator(plugin,value){
 const raw=text(value,'Source locator',4096).trim().replace(/\/+$/,'');
 if(plugin==='process')return raw;
 if(plugin==='telegram'){
  if(!/^(@[a-zA-Z0-9_]{5,32}|https:\/\/(?:t|telegram)\.me\/[a-zA-Z0-9_+-]{5,64})$/i.test(raw))throw Error('Use a Telegram channel handle or t.me link');
  return raw.toLowerCase();
 }
 if(plugin==='x'){
  const normalized=raw.replace(/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i,'').replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_]{1,15}$/.test(normalized))throw Error('Use an X profile handle or profile URL');
  return normalized;
 }
 if(plugin==='youtube'){
  const normalized=raw.replace(/^https:\/\/(?:www\.|m\.)?youtube\.com\//i,'');
  if(!/^(@[\w.-]{3,100}|channel\/UC[\w-]{12,100})$/i.test(normalized))throw Error('Use a YouTube handle or channel URL');
  return normalized.toLowerCase();
 }
 throw Error('Select a supported Channel source plugin');
}
function sourceAdd({channelId,plugin,locator,name,enabled=true}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may register sources');
 const room=requireRoom(channelId,actor),normalized=canonicalLocator(plugin,locator);
 if(room.mode!=='external')throw Error('Source subscriptions require an external publishing channel');
 if(typeof enabled!=='boolean')throw Error('Invalid source enabled state');
 const sql=db(),existing=sql.prepare('SELECT * FROM channel_sources WHERE plugin=? AND locator=?').get(plugin,normalized);
 if(existing){if(existing.channel_id!==room.id)throw Error('Source already belongs to another channel');return rowSource(existing)}
 const stamp=iso(),sid='ns_'+randomUUID();
 sql.prepare('INSERT INTO channel_sources VALUES(?,?,?,?,?, ?,1,?,?)')
  .run(sid,room.id,plugin,normalized,name===undefined?normalized:text(name,'Source name',160),Number(enabled),stamp,stamp);
 publishChange(room.id);return rowSource(sql.prepare('SELECT * FROM channel_sources WHERE id=?').get(sid));
}
function sourceUpdate({id:sourceId,patch={},expectedRevision}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may change channel sources');
 fields(patch,['name','enabled']);const old=db().prepare('SELECT * FROM channel_sources WHERE id=?').get(id(sourceId,'source ID'));
 if(!old)throw Error('Unknown channel source');
 if(expectedRevision!==undefined&&expectedRevision!==old.revision)throw Error('Source changed; reload');
 if(patch.enabled!==undefined&&typeof patch.enabled!=='boolean')throw Error('Source enabled must be boolean');
 db().prepare('UPDATE channel_sources SET name=?,enabled=?,revision=revision+1,updated_at=? WHERE id=?')
  .run(patch.name===undefined?old.name:text(patch.name,'Source name',160),patch.enabled===undefined?old.enabled:Number(patch.enabled),iso(),sourceId);
 publishChange(old.channel_id);return rowSource(db().prepare('SELECT * FROM channel_sources WHERE id=?').get(sourceId));
}
function sources({channelId,plugin,includeDisabled=false}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may enumerate collector source configuration');
 if(channelId)requireRoom(channelId,actor,true);
 if(plugin!==undefined&&!['process','telegram','x','youtube'].includes(plugin))throw Error('Invalid source plugin');
 if(typeof includeDisabled!=='boolean')throw Error('Invalid source listing');
 return db().prepare('SELECT * FROM channel_sources ORDER BY created_at,id').all()
  .filter(row=>(!channelId||row.channel_id===channelId)&&(!plugin||row.plugin===plugin)&&(includeDisabled||row.enabled))
  .map(rowSource);
}
function collectorAdd({name,sourceIds}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Collector credentials are operator-managed');
 name=text(name,'Collector name',100);
 if(!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>200)throw Error('Choose 1–200 exact external source IDs');
 const ids=[...new Set(sourceIds.map(value=>id(value,'source ID')))],sql=db();
 for(const sid of ids){const row=sql.prepare('SELECT * FROM channel_sources WHERE id=?').get(sid);
  if(!row||!row.enabled)throw Error('Unknown or inactive collector source');}
 const token='news_'+randomBytes(32).toString('hex'),cid='ncc_'+randomUUID();
 sql.prepare('INSERT INTO channel_collectors VALUES(?,?,?,?,?,NULL)').run(cid,name,digest(token),JSON.stringify(ids),iso());
 return {collector:{id:cid,name,sourceIds:ids,createdAt:iso()},token};
}
function collectors(_args={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Collector management requires the operator');
 return db().prepare('SELECT id,name,source_ids,created_at,revoked_at FROM channel_collectors ORDER BY created_at').all()
  .map(row=>({id:row.id,name:row.name,sourceIds:JSON.parse(row.source_ids),createdAt:row.created_at,revokedAt:row.revoked_at}));
}
function collectorRevoke({id:collectorId}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Collector management requires the operator');
 const changed=db().prepare('UPDATE channel_collectors SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').run(iso(),id(collectorId,'collector ID'));
 if(!changed.changes)throw Error('Unknown collector');
 return {id:collectorId,revoked:true};
}
function collectorConfig(token){
 const collector=collectorIdentity(token);
 return {collectorId:collector.id,sources:collector.sourceIds.map(sourceId=>db().prepare('SELECT * FROM channel_sources WHERE id=?').get(sourceId))
  .filter(source=>source?.enabled).map(rowSource)};
}
function publish({sourceId,channelId,externalId,publishedAt,title='',body='',url='',authorName='',clientMessageId,files=[]}={},
 actor={kind:'operator'},collector=null){
 fields({sourceId,channelId,externalId,publishedAt,title,body,url,authorName,clientMessageId,files},
  ['sourceId','channelId','externalId','publishedAt','title','body','url','authorName','clientMessageId','files']);
 if((sourceId===undefined)===(channelId===undefined))throw Error('Choose sourceId or channelId for channel publication');
 const sql=db(),source=sourceId?sql.prepare('SELECT * FROM channel_sources WHERE id=?').get(id(sourceId,'source ID')):null;
 if(sourceId&&!source)throw Error('Unknown channel publishing source');
 const room=requireRoom(source?.channel_id||channelId,collector?{kind:'operator'}:actor);
 if(room.archived)throw Error('Channel is archived');
 if(collector){
  if(!source||!collector.sourceIds.includes(source.id))throw Error('Collector is not authorized for this source');
 }else if(actor?.kind==='agent')verifyPublisher(room,actor);
 if(source&&!source.enabled)throw Error('Publishing source is disabled');
 if(collector&&source?.plugin==='employee')throw Error('External collectors cannot publish as employees');
 if(typeof title!=='string'||title.length>1000||typeof body!=='string'||Buffer.byteLength(body,'utf8')>1024*1024)
  throw Error('Channel news must have title <=1000 characters and body <=1 MiB');
 if(typeof url!=='string'||url.length>4096||url&&!/^https?:\/\/[^\s/?#]+(?:[^\s]*)?$/.test(url))throw Error('Invalid article URL');
 if(typeof authorName!=='string'||authorName.length>160)throw Error('Invalid article author');
 if(!title.trim()&&!body.trim()&&!url)throw Error('Article requires title, body or URL');
 if(typeof externalId!=='string'||!externalId.trim()||externalId.length>1024)throw Error('A stable externalId is required to deduplicate article publications');
 if(clientMessageId!==undefined&&(typeof clientMessageId!=='string'||!/^[\w:-]{6,160}$/.test(clientMessageId)))throw Error('Invalid article idempotency key');
 if(collector&&files.length)throw Error('External collector file metadata requires a separately authorized transfer');
 const attachments=files.length?require('./collaboration-attachments.cjs').capture(files):[];
 const timestamp=time(publishedAt),now=Date.now(),expires= Math.min(timestamp+room.retentionDays*86400000,now+room.retentionDays*86400000);
 const author=collector?{kind:'collector',name:source.name,collectorId:collector.id}:
  actor?.kind==='agent'?{kind:'agent',id:actor.agentId,name:agents.sessions().find(row=>row.id===actor.agentId)?.name||'Agent'}:
  {kind:'operator',name:'You'};
 if(actor?.kind==='agent'&&authorName&&authorName!==author.name)throw Error('Agent cannot publish with another author identity');
 const data={id:'np_'+randomUUID(),channelId:room.id,kind:'news',sourceId:source?.id||null,
  externalId,title,body,url,authorName:collector||actor?.kind==='agent'?author.name:authorName||author.name,
  author,attachments,publishedAt:new Date(timestamp).toISOString(),createdAt:iso()};
 const fingerprint=digest([room.id,source?.id||null,externalId,timestamp,title,body,url,data.authorName,attachments]);
 const authorKey=source?'source:'+source.id:principal(actor),clientKey=clientMessageId||(!source?'article:'+externalId:null);
 const result=tx(sql=>{
  const old=source?sql.prepare('SELECT * FROM channel_entries WHERE source_id=? AND external_id=?').get(source.id,externalId):
   sql.prepare('SELECT * FROM channel_entries WHERE channel_id=? AND author_key=? AND client_key=?').get(room.id,authorKey,clientKey);
  if(old){
   if(old.fingerprint!==fingerprint)throw Error('Publication ID reused with different content; use a new article revision ID');
   return {status:old.state==='active'?'duplicate':old.state,id:old.id,channelId:room.id,duplicate:true};
  }
  const expired=expires<=now,state=expired?'expired':'active';
  if(expired){data.title='';data.body='';data.url='';data.attachments=[]}
  const sequence=nextSequence(sql,room.id);
  sql.prepare('INSERT INTO channel_entries(id,channel_id,sequence,kind,source_id,external_id,author_key,client_key,fingerprint,payload_json,state,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .run(data.id,room.id,sequence,'news',source?.id||null,externalId,authorKey,clientKey,fingerprint,JSON.stringify(data),state,expires,data.createdAt);
  return {id:data.id,channelId:room.id,status:expired?'expired':'created',duplicate:false,expiresAt:new Date(expires).toISOString()};
 });
 if(!result.duplicate)publishChange(room.id,result.id);
 return result;
}
function postMessage({id:channelId,text:body,replyTo,kind='message',clientMessageId,files=[]}={},actor={kind:'operator'}){
 const room=requireRoom(channelId,actor),valid=['message','summary','decision','blocker','question','result'];
 if(!valid.includes(kind))throw Error('Invalid Channel discussion kind');
 if(actor?.kind==='agent'&&!room.memberIds.includes(actor.agentId))throw Error('Current channel membership required');
 const attachments=require('./collaboration-attachments.cjs').capture(files);
 if(!attachments.length)body=text(body,'Channel message',16000);
 else if(!String(body||'').trim())body='Please review the attached files.';
 else body=text(body,'Channel message',16000);
 let parent=null;
 if(replyTo!==undefined){
  const prior=findEntry(replyTo,actor);if(prior.channel_id!==room.id)throw Error('Channel reply must remain within this channel');
  parent=entryView(prior);
 }
 if(clientMessageId!==undefined&&(typeof clientMessageId!=='string'||!/^[\w:-]{6,160}$/.test(clientMessageId)))throw Error('Invalid channel message idempotency key');
 const author=actor?.kind==='agent'?{kind:'agent',id:actor.agentId,name:agents.sessions().find(row=>row.id===actor.agentId)?.name||'Agent'}:
  {kind:'operator',name:'You'};
 const fingerprint=digest([room.id,body,replyTo||null,kind,attachments]);
 const key=clientMessageId||null,p=principal(actor),row={id:'cm_'+randomUUID(),channelId:room.id,kind:'message',messageKind:kind,
  text:body,replyTo:replyTo||null,replyPreview:parent?{id:parent.id,title:parent.title||parent.text?.slice(0,120)||'Article',authorName:parent.authorName||parent.author.name}:null,
  attachments,author,createdAt:iso()};
 const saved=tx(sql=>{
  const old=key?sql.prepare('SELECT * FROM channel_entries WHERE channel_id=? AND author_key=? AND client_key=?')
   .get(room.id,p,key):null;
  if(old){if(old.fingerprint!==fingerprint)throw Error('Channel message retry ID reused with different content');
   return {row:old,created:false};}
  const sequence=nextSequence(sql,room.id);
  sql.prepare('INSERT INTO channel_entries(id,channel_id,sequence,kind,source_id,external_id,author_key,client_key,fingerprint,payload_json,state,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,\'active\',NULL,?)')
   .run(row.id,room.id,sequence,'message',null,null,p,key,fingerprint,JSON.stringify(row),row.createdAt);
  return {row:sql.prepare('SELECT * FROM channel_entries WHERE id=?').get(row.id),created:true};
 });
 if(saved.created)publishChange(room.id,saved.row.id);
 return entryView(saved.row);
}
function parseCursor(value,channelId,kind){
 if(value===undefined)return null;
 if(typeof value!=='string'||value.length>500)throw Error('Invalid channel cursor');
 let data;
 try{data=JSON.parse(Buffer.from(value,'base64url').toString('utf8'))}catch{throw Error('Invalid channel cursor')}
 if(data?.channelId!==channelId||data.kind!==kind||!Number.isSafeInteger(data.before)||data.before<1)
  throw Error('Channel cursor belongs to another scope');
 return data.before;
}
function visible(row){return row.state==='active'&&(row.kind==='message'||!!row.saved_at||row.expires_at>Date.now())}
function timeline({id:channelId,kind='all',cursor,beforeEntry,limit:count}={},actor={kind:'operator'}){
 const room=requireRoom(channelId,actor,true);
 if(!['all','news','message'].includes(kind)||cursor&&beforeEntry)throw Error('Invalid timeline kind or cursor');
 let before=parseCursor(cursor,room.id,kind);
 if(beforeEntry){const anchor=findEntry(beforeEntry,actor,true);if(anchor.channel_id!==room.id)throw Error('Timeline anchor belongs to another channel');before=anchor.sequence}
 const rows=db().prepare('SELECT * FROM channel_entries WHERE channel_id=? AND sequence<? ORDER BY sequence DESC')
  .all(room.id,before??Number.MAX_SAFE_INTEGER).filter(row=>visible(row)&&(kind==='all'||row.kind===kind));
 const size=limit(count),page=rows.slice(0,size),last=page.at(-1);
 return {id:room.id,kind,entries:page.reverse().map(entryView),hasMore:rows.length>size,
  nextCursor:rows.length>size&&last?Buffer.from(JSON.stringify({channelId:room.id,kind,before:last.sequence})).toString('base64url'):null,
  unreadCount:unreadCount(room.id,actor)};
}
function posts({channelId,sourceId,query='',saved=false,cursor,limit:count}={},actor={kind:'operator'}){
 if(typeof query!=='string'||query.length>500||typeof saved!=='boolean')throw Error('Invalid Channel post query');
 if(channelId)requireRoom(channelId,actor,true);
 const sql=db(),source=sourceId?sql.prepare('SELECT * FROM channel_sources WHERE id=?').get(id(sourceId,'source ID')):null;
 if(sourceId&&!source)throw Error('Unknown source');
 if(source&&actor.kind==='agent')requireRoom(source.channel_id,actor,true);
 const allowed=actor.kind==='agent'?new Set(list({},actor).map(row=>row.id)):null;
 const all=sql.prepare("SELECT * FROM channel_entries WHERE kind='news' ORDER BY created_at DESC,id DESC").all()
  .filter(row=>visible(row)&&(!channelId||row.channel_id===channelId)&&(!sourceId||row.source_id===sourceId)&&(!saved||!!row.saved_at)&&(!allowed||allowed.has(row.channel_id)))
  .map(entryView).filter(row=>!query||[row.title,row.body,row.authorName].some(value=>String(value||'').toLowerCase().includes(query.toLowerCase())));
 let after=null;
 if(cursor!==undefined){
  if(typeof cursor!=='string'||cursor.length>500)throw Error('Invalid news cursor');
  try{after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'))}catch{throw Error('Invalid news cursor')}
  if(after?.channelId!==(channelId||null)||after.sourceId!==(sourceId||null)||
   typeof after.createdAt!=='string'||typeof after.id!=='string')throw Error('News cursor belongs to another scope');
 }
 const filtered=after?all.filter(item=>item.createdAt<after.createdAt||item.createdAt===after.createdAt&&item.id<after.id):all;
 const size=limit(count),page=filtered.slice(0,size),last=page.at(-1);
 return {posts:page,total:all.length,nextCursor:filtered.length>size&&last?
  Buffer.from(JSON.stringify({channelId:channelId||null,sourceId:sourceId||null,createdAt:last.createdAt,id:last.id})).toString('base64url'):null};
}
function entry({id:entryId}={},actor={kind:'operator'}){return entryView(findEntry(entryId,actor))}
function post({id:entryId}={},actor={kind:'operator'}){
 const row=findEntry(entryId,actor);
 if(row.kind!=='news')throw Error('This ID is a discussion message, not a news item');
 return entryView(row);
}
function readState({id:channelId,entryIds}={},actor={kind:'operator'}){
 const room=requireRoom(channelId,actor,true),sql=db();
 if(entryIds!==undefined&&(!Array.isArray(entryIds)||entryIds.length>200))throw Error('Read state accepts at most 200 entries');
 const requested=entryIds||sql.prepare('SELECT id FROM channel_entries WHERE channel_id=? ORDER BY sequence DESC LIMIT 200').all(room.id).map(row=>row.id);
 const rows=[];
 for(const entryId of requested){
  const entry=findEntry(entryId,actor,true);
  if(entry.channel_id!==room.id)throw Error('Read state entry belongs to another channel');
  if(!visible(entry))continue;
  rows.push({entryId,read:!!sql.prepare('SELECT 1 FROM channel_reads WHERE principal=? AND channel_id=? AND entry_id=?')
   .get(principal(actor),room.id,entryId)});
 }
 return {channelId:room.id,entries:rows,unreadCount:unreadCount(room.id,actor)};
}
function acknowledge({id:channelId,entryIds,all,sourceId}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may update personal Channel reading');
 const room=requireRoom(channelId,actor,true);
 if((entryIds===undefined)===(all===undefined)||all!==undefined&&all!==true)
  throw Error('Choose exact entryIds or all:true');
 if(entryIds!==undefined&&(!Array.isArray(entryIds)||entryIds.length>200||entryIds.some(value=>typeof value!=='string')))
  throw Error('Choose 1–200 explicit channel entries');
 if(entryIds!==undefined&&sourceId!==undefined)throw Error('A source filter requires all:true');
 if(sourceId){const src=db().prepare('SELECT * FROM channel_sources WHERE id=?').get(id(sourceId,'source ID'));
  if(!src||src.channel_id!==room.id)throw Error('Source is not part of this channel');}
 const rows=entryIds?entryIds.map(entry=>findEntry(entry,actor,true)):
  db().prepare('SELECT * FROM channel_entries WHERE channel_id=? ORDER BY sequence DESC').all(room.id)
   .filter(row=>!sourceId||row.source_id===sourceId);
 for(const row of rows)if(row.channel_id!==room.id)throw Error('Cannot acknowledge another channel');
 let added=0;
 tx(sql=>{
  const statement=sql.prepare('INSERT OR IGNORE INTO channel_reads(principal,channel_id,entry_id,created_at) VALUES(?,?,?,?)');
  for(const row of rows)if(visible(row))added+=Number(statement.run('operator',room.id,row.id,iso()).changes);
 });
 if(added)publishChange(room.id);
 return {channelId:room.id,acknowledged:added,unreadCount:unreadCount(room.id,actor)};
}
function save({id:entryId,saved=true}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may change saved news');
 if(typeof saved!=='boolean')throw Error('Invalid saved flag');
 const row=findEntry(entryId,actor,true);
 if(row.kind!=='news'||row.state!=='active')throw Error('This news item is no longer available');
 if(saved&&row.expires_at<=Date.now()&&!row.saved_at)throw Error('Expired news cannot be restored by saving');
 if(!saved&&row.expires_at<=Date.now()){redact(row,'expired');return {id:entryId,saved:false,expired:true}}
 db().prepare('UPDATE channel_entries SET saved_at=? WHERE id=?').run(saved?row.saved_at||iso():null,entryId);
 publishChange(row.channel_id,entryId);return entryView(db().prepare('SELECT * FROM channel_entries WHERE id=?').get(entryId));
}
function redact(row,state){
 if(row.state!=='active')return;
 const old=JSON.parse(row.payload_json);
 const tombstone={id:old.id,channelId:old.channelId,kind:'news',sourceId:old.sourceId,externalId:old.externalId,
  author:{kind:'removed'},title:'',body:'',url:'',attachments:[],publishedAt:old.publishedAt,createdAt:old.createdAt};
 tx(sql=>{
  sql.prepare('UPDATE channel_entries SET state=?,payload_json=?,saved_at=NULL WHERE id=?')
   .run(state,JSON.stringify(tombstone),row.id);
  sql.prepare('DELETE FROM channel_reads WHERE entry_id=?').run(row.id);
 });
 publishChange(row.channel_id,row.id);
}
function remove({id:entryId}={},actor={kind:'operator'}){
 if(actor.kind!=='operator')throw Error('Only the operator may delete Channel news');
 const row=findEntry(entryId,actor,true);
 if(row.kind!=='news')throw Error('Delete a news item, not a channel discussion');
 if(row.state==='active')redact(row,'deleted');
 return {id:entryId,deleted:true};
}
function prune(now=Date.now()){
 let count=0;
 for(const row of db().prepare("SELECT * FROM channel_entries WHERE kind='news' AND state='active' AND saved_at IS NULL AND expires_at<=?").all(now)){
  redact(row,'expired');count++;
 }
 return {expired:count};
}
function ingest(token,{method,args={}}={}){
 const collector=collectorIdentity(token);
 if(method==='config')return collectorConfig(token);
 if(method!=='publish')throw Error('Collector may only read its source config or publish');
 if(!args||typeof args!=='object'||Array.isArray(args)||!args.sourceId||!collector.sourceIds.includes(args.sourceId))
  throw Error('Collector cannot publish an unauthorized source');
 const publication=publish(args,{kind:'operator'},collector);
 return publication;
}
function dispatch(method,args={},actor={kind:'operator'}){
 if(typeof method!=='string'||!method.startsWith('channel.'))throw Error('Unknown Channel API');
 switch(method.slice('channel.'.length)){
  case 'list':fields(args,[]);return list(args,actor);
  case 'get':fields(args,['id']);return get(args,actor);
  case 'create':fields(args,['name','description','mode','memberIds','publisherIds','adminIds','ownerId','retentionDays']);return create(args,actor);
  case 'update':fields(args,['id','name','description','memberIds','adminIds','publisherIds','ownerId','expectedRevision','archived']);return update(args,actor);
  case 'sources':fields(args,['channelId','plugin','includeDisabled']);return sources(args,actor);
  case 'source-add':fields(args,['channelId','plugin','locator','name','enabled']);return sourceAdd(args,actor);
  case 'source-update':fields(args,['id','patch','expectedRevision']);return sourceUpdate(args,actor);
  case 'source-remove':fields(args,['id','expectedRevision']);return sourceUpdate({id:args.id,expectedRevision:args.expectedRevision,patch:{enabled:false}},actor);
  case 'publish':fields(args,['channelId','sourceId','externalId','publishedAt','title','body','url','authorName','clientMessageId','files']);return publish(args,actor);
  case 'post':fields(args,['id']);return post(args,actor);
  case 'posts':fields(args,['channelId','sourceId','query','saved','cursor','limit']);return posts(args,actor);
  case 'timeline':fields(args,['id','kind','cursor','beforeEntry','limit']);return timeline(args,actor);
  case 'history':fields(args,['id','cursor','beforeEntry','limit']);return timeline({...args,kind:'message'},actor);
  case 'message-send':case 'message-post':
   fields(args,['id','text','replyTo','kind','clientMessageId','files']);return postMessage(args,actor);
  case 'read-state':fields(args,['id','entryIds']);return readState(args,actor);
  case 'acknowledge':fields(args,['id','entryIds','all','sourceId']);return acknowledge(args,actor);
  case 'save':fields(args,['id','saved']);return save(args,actor);
  case 'delete':fields(args,['id']);return remove(args,actor);
  case 'collectors':fields(args,[]);return collectors(args,actor);
  case 'collector-add':fields(args,['name','sourceIds']);return collectorAdd(args,actor);
  case 'collector-revoke':fields(args,['id']);return collectorRevoke(args,actor);
  default:throw Error('Unknown Channel command: '+method);
 }
}
function authorize(method,args={},actor){
 if(actor?.kind!=='agent')return;
 if(!['channel.list','channel.get','channel.timeline','channel.history','channel.post','channel.posts','channel.message-post','channel.publish'].includes(method))
  throw Error('Channel command is unavailable to this Agent');
 if(method==='channel.publish'){
  if(args.sourceId)throw Error('Agent publication uses its authorized channelId, not collector source IDs');
  return verifyPublisher(requireRoom(args.channelId,actor),actor);
 }
 if(method==='channel.post'){findEntry(args.id,actor);return}
 if(method==='channel.posts'){
  if(args.channelId)requireRoom(args.channelId,actor,true);
  if(args.sourceId){const source=db().prepare('SELECT channel_id FROM channel_sources WHERE id=?').get(id(args.sourceId,'source ID'));
   if(!source)throw Error('Unknown source');requireRoom(source.channel_id,actor,true)}
  return;
 }
 if(method==='channel.list')return;
 requireRoom(args.id,actor,method!=='channel.message-post');
}
module.exports={dispatch,authorize,ingest,grantSnapshot,prune,list,get,entry,timeline,posts,publish,postMessage,collectorIdentity};



