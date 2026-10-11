import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync,type SQLInputValue} from 'node:sqlite'
import {APP_HOME} from '../shared/protocol'
import type {ChannelEvent,ChannelPost,ChannelMedia,ChannelDocument} from '../shared/channels'
export const directory=path.join(APP_HOME,'channels'),mediaDirectory=path.join(directory,'media')
export type Row=Record<string,any>
let connection:DatabaseSync|undefined,emit:(event:ChannelEvent)=>void=()=>{}
export function setChannelStoreEmitter(handler:typeof emit){emit=handler}
export function closeChannelStore(){connection?.close();connection=undefined;emit=()=>{}}
export function db(){
 if(connection)return connection
 fs.mkdirSync(mediaDirectory,{recursive:true,mode:0o700});const file=path.join(directory,'channels.sqlite');connection=new DatabaseSync(file);fs.chmodSync(file,0o600)
 connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 INSERT OR IGNORE INTO metadata VALUES('revision','0'),('settings','{"enabled":false,"host":"127.0.0.1","port":5152}');
 INSERT OR IGNORE INTO metadata SELECT 'config_revision',value FROM metadata WHERE key='revision';
 CREATE TABLE IF NOT EXISTS channels(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,admin_ids TEXT NOT NULL DEFAULT '[]',revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS channel_post_rules(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,employee_id TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(channel_id,employee_id));
 CREATE TABLE IF NOT EXISTS channel_post_events(post_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_post_batches(id TEXT PRIMARY KEY,rule_id TEXT NOT NULL,channel_id TEXT NOT NULL,employee_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS channel_post_batches_scope ON channel_post_batches(channel_id,employee_id);
 CREATE INDEX IF NOT EXISTS channel_post_batches_pending ON channel_post_batches(json_extract(data,'$.state'));
 CREATE TABLE IF NOT EXISTS channel_message_triggers(message_id TEXT PRIMARY KEY REFERENCES channel_messages(id),metadata TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_downloads(id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_membership(channel_id TEXT PRIMARY KEY REFERENCES channels(id),owner_id TEXT,member_ids TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS conversation_audit_scope ON conversation_audit(conversation,id);
 CREATE TABLE IF NOT EXISTS channel_conversation_controls(channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,mutes TEXT NOT NULL DEFAULT '{}',silent INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,plugin TEXT NOT NULL,target_id TEXT NOT NULL,locator TEXT NOT NULL,name TEXT NOT NULL,enabled INTEGER NOT NULL,poll_seconds INTEGER NOT NULL,channel_id TEXT NOT NULL REFERENCES channels(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(plugin,target_id));
 CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),external_id TEXT NOT NULL,state TEXT NOT NULL,title TEXT,body TEXT,url TEXT,author_name TEXT,author_url TEXT,avatar_media_id TEXT,published_at INTEGER NOT NULL,received_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,saved_at INTEGER,content_hash TEXT NOT NULL,payload_hash TEXT NOT NULL,media_ids TEXT NOT NULL DEFAULT '[]',forget_at INTEGER,UNIQUE(source_id,external_id));
 CREATE INDEX IF NOT EXISTS posts_source_time ON posts(source_id,published_at DESC,id DESC);
 CREATE INDEX IF NOT EXISTS posts_time ON posts(state,published_at DESC,id DESC);
 CREATE INDEX IF NOT EXISTS posts_expiry ON posts(state,expires_at);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,post_id TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES sources(id),media_key TEXT NOT NULL,name TEXT NOT NULL,mime_type TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,file TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS media_post ON media(post_id);
 CREATE TABLE IF NOT EXISTS collectors(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,source_ids TEXT NOT NULL,created_at INTEGER NOT NULL,revoked_at INTEGER);
 CREATE TABLE IF NOT EXISTS source_avatars(source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,name TEXT NOT NULL,mime_type TEXT NOT NULL,data BLOB NOT NULL,sha256 TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_messages(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL REFERENCES channels(id),sequence INTEGER NOT NULL,created_at INTEGER NOT NULL,author TEXT NOT NULL,author_name TEXT NOT NULL,text TEXT NOT NULL,kind TEXT NOT NULL,mentions TEXT NOT NULL,reply_to TEXT,request_id TEXT,acknowledgment_of TEXT,client_message_id TEXT NOT NULL,fingerprint TEXT NOT NULL,UNIQUE(channel_id,sequence));
 CREATE TABLE IF NOT EXISTS channel_message_notices(message_id TEXT PRIMARY KEY REFERENCES channel_messages(id) ON DELETE CASCADE,metadata TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_message_attachments(message_id TEXT PRIMARY KEY REFERENCES channel_messages(id) ON DELETE CASCADE,attachments TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS channel_messages_time ON channel_messages(channel_id,sequence);
 CREATE INDEX IF NOT EXISTS channel_messages_created ON channel_messages(channel_id,created_at DESC,id DESC);
 CREATE TABLE IF NOT EXISTS channel_deliveries(channel_id TEXT NOT NULL REFERENCES channels(id),entry_id TEXT NOT NULL,kind TEXT NOT NULL,employee_id TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,session_id TEXT,queue_id TEXT,task_id TEXT,error TEXT,delivered_at INTEGER,read_at INTEGER,ack_message_id TEXT,PRIMARY KEY(channel_id,entry_id,employee_id));
 CREATE TABLE IF NOT EXISTS channel_user_reads(entry_id TEXT PRIMARY KEY,read_at INTEGER);
 CREATE TABLE IF NOT EXISTS channel_engines(channel_id TEXT PRIMARY KEY REFERENCES channels(id),config TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_source_owners(source_id TEXT PRIMARY KEY REFERENCES sources(id),employee_id TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_avatars(channel_id TEXT PRIMARY KEY REFERENCES channels(id),name TEXT NOT NULL,mime_type TEXT NOT NULL,data BLOB NOT NULL,sha256 TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS collector_activity(collector_id TEXT PRIMARY KEY REFERENCES collectors(id),last_seen_at INTEGER NOT NULL);
`)
 const columns=new Set((connection.prepare('PRAGMA table_info(channels)').all() as {name:string}[]).map(row=>row.name));if(!columns.has('admin_ids'))connection.exec("ALTER TABLE channels ADD COLUMN admin_ids TEXT NOT NULL DEFAULT '[]'");if(!columns.has('revision'))connection.exec('ALTER TABLE channels ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
 // Existing content has unknown user-reading history, not fabricated timestamps or retroactive unread.
 if(!one("SELECT 1 FROM metadata WHERE key='user_reads_initialized'"))transaction(()=>{
  run("INSERT OR IGNORE INTO channel_user_reads SELECT id,NULL FROM posts WHERE state='active' AND (saved_at IS NOT NULL OR expires_at>?)",Date.now())
  run("INSERT OR IGNORE INTO channel_user_reads SELECT id,NULL FROM channel_messages WHERE json_extract(author,'$.kind')='agent'")
  run("INSERT INTO metadata VALUES('user_reads_initialized','1')")
 })
 const postColumns=new Set((connection.prepare('PRAGMA table_info(posts)').all() as {name:string}[]).map(row=>row.name));if(!postColumns.has('remote_files'))connection.exec("ALTER TABLE posts ADD COLUMN remote_files TEXT NOT NULL DEFAULT '[]'");if(!postColumns.has('telegram'))connection.exec('ALTER TABLE posts ADD COLUMN telegram TEXT');
 connection.exec('CREATE TABLE IF NOT EXISTS channel_file_imports(post_id TEXT NOT NULL,file_id TEXT NOT NULL,sha256 TEXT NOT NULL,path TEXT NOT NULL,saved_at INTEGER NOT NULL,PRIMARY KEY(post_id,file_id))');
 return connection
}
export const one=(sql:string,...values:SQLInputValue[])=>db().prepare(sql).get(...values) as Row|undefined
export const all=(sql:string,...values:SQLInputValue[])=>db().prepare(sql).all(...values) as Row[]
export const run=(sql:string,...values:SQLInputValue[])=>db().prepare(sql).run(...values)
export const revision=(key='revision')=>Number(one('SELECT value FROM metadata WHERE key=?',key)!.value)
export function transaction<T>(work:()=>T):T{db().exec('BEGIN IMMEDIATE');try{const value=work();db().exec('COMMIT');return value}catch(error){db().exec('ROLLBACK');throw error}}
export function changed(kind:ChannelEvent['kind'],details:Omit<ChannelEvent,'kind'|'revision'>={}){run("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'");const content=['posts','messages','reads'].includes(kind);if(!content)run("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='config_revision'");emit({kind,revision:revision(content?'revision':'config_revision'),...details})}

const channelFailure=(message:string,code:string,status:number)=>Object.assign(Error(message),{code,status})
const channelKey=(id:unknown)=>{if(typeof id!=='string'||!id.trim()||id!==id.trim())throw Error('Provide a valid post ID');return id}
export function channelMedia(row:Row):ChannelMedia{return {id:row.id,name:row.name,mimeType:row.mime_type,bytes:row.bytes,sha256:row.sha256}}
export function projectChannelDocuments(row:Row){
 return (JSON.parse(row.remote_files??'[]') as ChannelDocument[]).map(file=>{const saved=one('SELECT path FROM channel_file_imports WHERE post_id=? AND file_id=? AND sha256=?',row.id,file.id,file.sha256);return {...file,...(saved&&fs.existsSync(saved.path)?{savedPath:path.basename(saved.path)}:{})}})
}
export function projectChannelPost(row:Row):ChannelPost{
 const documents=projectChannelDocuments(row)
 const ids=JSON.parse(row.media_ids) as string[],files=ids.map(id=>one('SELECT * FROM media WHERE id=? AND post_id=?',id,row.id)).filter((value):value is Row=>!!value)
 const avatar=row.plugin==='telegram'?one('SELECT sha256 FROM source_avatars WHERE source_id=?',row.source_id):undefined
 return {...(row.telegram?{telegram:JSON.parse(row.telegram)}:{}),...(documents.length?{files:documents}:{}),...(avatar?{sourceAvatar:{sourceId:row.source_id,sha256:avatar.sha256}}:{}),id:row.id,sourceId:row.source_id,externalId:row.external_id,channelId:row.channel_id,sourceName:row.source_name,plugin:row.plugin,title:row.title,body:row.body,...(row.url?{url:row.url}:{}),...(row.author_name?{authorName:row.author_name}:{}),...(row.author_url?{authorUrl:row.author_url}:{}),...(row.avatar_media_id?{avatarMediaId:row.avatar_media_id}:{}),publishedAt:row.published_at,receivedAt:row.received_at,updatedAt:row.updated_at,expiresAt:row.expires_at,contentHash:row.content_hash,saved:row.saved_at!==null,...(row.saved_at!==null?{savedAt:row.saved_at}:{}),media:files.map(channelMedia)}
}
export const postSelect='SELECT p.*,s.channel_id,s.name AS source_name,s.plugin FROM posts p JOIN sources s ON s.id=p.source_id'
export function liveChannelPost(id:unknown){const row=one(postSelect+' WHERE p.id=?',channelKey(id));if(!row)throw channelFailure('Unknown news item','POST_NOT_FOUND',404);if(row.state!=='active'||row.saved_at===null&&row.expires_at<=Date.now())throw channelFailure('This news item was deleted or expired','POST_GONE',410);return row}
