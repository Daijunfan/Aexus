import fs from 'node:fs'
import path from 'node:path'
import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {APP_HOME} from '../shared/core-paths'
import type {MessengerMessage,MessagePreferences} from '../shared/messenger'
export type PublicMessage=Omit<MessengerMessage,'conversationTitle'|'preferences'>
export type MessageSource={id:string;version:string;read:()=>PublicMessage[]}
const directory=path.join(APP_HOME,'cache'),file=path.join(directory,'message-index.sqlite')
const schema=`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA secure_delete=ON;
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,version TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(source TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,id TEXT NOT NULL,ordinal INTEGER NOT NULL,tie INTEGER NOT NULL,created INTEGER NOT NULL,author TEXT,media INTEGER NOT NULL,audio INTEGER NOT NULL,files INTEGER NOT NULL,links INTEGER NOT NULL,search TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(source,id));
CREATE TABLE IF NOT EXISTS images(source TEXT NOT NULL,id TEXT NOT NULL,path TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(source,id,path),FOREIGN KEY(source,id) REFERENCES messages(source,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS messages_order ON messages(source,created DESC,tie);
CREATE VIRTUAL TABLE IF NOT EXISTS message_text USING fts5(search,content='messages',content_rowid='rowid',tokenize='trigram case_sensitive 1');
CREATE TRIGGER IF NOT EXISTS message_insert AFTER INSERT ON messages BEGIN INSERT INTO message_text(rowid,search) VALUES(new.rowid,new.search);END;
CREATE TRIGGER IF NOT EXISTS message_delete AFTER DELETE ON messages BEGIN INSERT INTO message_text(message_text,rowid,search) VALUES('delete',old.rowid,old.search);END;
CREATE TRIGGER IF NOT EXISTS message_update AFTER UPDATE OF search ON messages WHEN new.search<>old.search BEGIN INSERT INTO message_text(message_text,rowid,search) VALUES('delete',old.rowid,old.search);INSERT INTO message_text(rowid,search) VALUES(new.rowid,new.search);END;
PRAGMA user_version=2;`
let connection:DatabaseSync|undefined
const statements=new Map<string,StatementSync>()
let scopeKey='',preferencesKey=''
function open(){
 if(connection)return connection
 fs.mkdirSync(directory,{recursive:true,mode:0o700})
 for(const target of [directory,file,file+'-wal',file+'-shm'])if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('Message index cannot use a symlink')
 const create=()=>{const db=new DatabaseSync(file);fs.chmodSync(file,0o600);return db}
 let db=create()
 try{const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);if(version!==0&&version!==2)throw Object.assign(Error('Obsolete message index'),{errcode:26});db.exec(schema)}
 catch(error){db.close();if(![11,26].includes((error as {errcode?:number}).errcode??0))throw error;for(const suffix of ['','-wal','-shm'])fs.rmSync(file+suffix,{force:true});db=create();db.exec(schema)}
 db.exec('CREATE TEMP TABLE allowed(source TEXT PRIMARY KEY,rank INTEGER NOT NULL);CREATE TEMP TABLE preferences(key TEXT PRIMARY KEY,saved INTEGER NOT NULL,pinned INTEGER NOT NULL,hidden INTEGER NOT NULL)')
 connection=db;return db
}
function statement(sql:string){const db=open();let value=statements.get(sql);if(!value){value=db.prepare(sql);if(statements.size>=32)statements.delete(statements.keys().next().value!);statements.set(sql,value)}return value}
function transaction<T>(work:()=>T){const db=open();db.exec('BEGIN');try{const value=work();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}}
export function closeMessageIndex(){connection?.close();connection=undefined;statements.clear();scopeKey='';preferencesKey=''}
export function removeIndexedConversation(id:string){
 if(!connection&&!fs.existsSync(file))return
 try{statement('DELETE FROM sources WHERE id=?').run(id)}catch(error){console.error('[Message index invalidation]',(error as Error).message)}
}
/** Only caller-authorized public projections enter the disposable, rebuildable index. */
export function syncMessageIndex(sources:MessageSource[],preferences:Record<string,MessagePreferences>){
 for(const source of sources){
  const previous=statement('SELECT version,hash FROM sources WHERE id=?').get(source.id)
  if(previous?.version===source.version)continue
  const rows=source.read(),body=JSON.stringify(rows),hash=createHash('sha256').update(body).digest('hex')
  transaction(()=>{
   statement('INSERT INTO sources VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,hash=excluded.hash').run(source.id,source.version,hash)
   if(previous?.hash===hash)return
   const order=new Map([...rows].sort((a,b)=>a.id.localeCompare(b.id)).map((row,index)=>[row.id,index]))
   const upsert=statement('INSERT INTO messages(source,id,ordinal,tie,created,author,media,audio,files,links,search,body) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,id) DO UPDATE SET ordinal=excluded.ordinal,tie=excluded.tie,created=excluded.created,author=excluded.author,media=excluded.media,audio=excluded.audio,files=excluded.files,links=excluded.links,search=excluded.search,body=excluded.body WHERE messages.body<>excluded.body OR messages.tie<>excluded.tie OR messages.ordinal<>excluded.ordinal')
   rows.forEach((row,index)=>{const result=upsert.run(source.id,row.id,index,order.get(row.id)!,row.createdAt??0,row.authorIdentity?.kind??null,Number(!!row.images.length||!!row.files?.some(file=>file.mimeType.startsWith('video/'))),Number(!!row.files?.some(file=>file.mimeType.startsWith('audio/'))),Number(!!row.files?.length),Number(/https?:\/\/\S+/i.test(row.text)),[row.text,...(row.files??[]).map(file=>file.name)].join(' ').toLocaleLowerCase(),JSON.stringify(row));if(Number(result.changes)){statement('DELETE FROM images WHERE source=? AND id=?').run(source.id,row.id);[...new Set(row.images)].forEach((image,position)=>statement('INSERT INTO images VALUES(?,?,?,?)').run(source.id,row.id,image,position))}})
   statement('DELETE FROM messages WHERE source=? AND id NOT IN (SELECT value FROM json_each(?))').run(source.id,JSON.stringify(rows.map(row=>row.id)))
  })
 }
 setMessageScope(sources.map(source=>source.id),preferences)
}
export function indexVersions(ids:string[]):Record<string,string>{return Object.fromEntries(statement('SELECT id,version FROM sources WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(ids)).map(row=>[String(row.id),String(row.version)]))}
export function setMessageScope(ids:string[],preferences:Record<string,MessagePreferences>){
 const scope=JSON.stringify(ids.sort((a,b)=>a.localeCompare(b))),prefs=JSON.stringify(preferences)
 if(scope!==scopeKey)transaction(()=>{open().exec('DELETE FROM allowed');const add=statement('INSERT INTO allowed VALUES(?,?)');(JSON.parse(scope) as string[]).forEach((id,index)=>add.run(id,index));scopeKey=scope})
 if(prefs!==preferencesKey)transaction(()=>{open().exec('DELETE FROM preferences');const add=statement('INSERT INTO preferences VALUES(?,?,?,?)');for(const [key,value] of Object.entries(preferences))if(value.saved||value.pinned||value.hidden)add.run(key,Number(!!value.saved),Number(!!value.pinned),Number(!!value.hidden));preferencesKey=prefs})
}
function searchFilter(query:string,author:string,filter:string){
 const where=['COALESCE(p.hidden,0)=0'],values:SQLInputValue[]=[]
 if(query){
  // Short Unicode strings and embedded NUL use the exact substring fallback.
  if(Array.from(query).length>=3&&!query.includes('\0')){where.push('m.rowid IN (SELECT rowid FROM message_text WHERE message_text MATCH ?)');values.push('"'+query.replaceAll('"','""')+'"')}
  where.push('instr(m.search,?)>0');values.push(query)
 }
 if(author!=='all'){where.push('m.author=?');values.push(author==='you'?'operator':'agent')}
 if(filter==='saved'||filter==='pinned')where.push('p.'+filter+'=1')
 else if(filter!=='all')where.push('m.'+({media:'media',audio:'audio',files:'files',links:'links'} as Record<string,string>)[filter]+'=1')
 return {where,values}
}
export function searchMessageIndex(options:{query:string;author:string;filter:string;offset:number;limit:number}){
 const {query,author,filter,offset,limit}=options,{where,values}=searchFilter(query,author,filter)
 const from=' FROM messages m JOIN allowed a ON a.source=m.source LEFT JOIN preferences p ON p.key=m.source||\'/\'||m.id WHERE '+where.join(' AND ')
 const total=Number(statement('SELECT count(*) AS n'+from).get(...values)!.n)
 const rows=statement('SELECT m.body'+from+' ORDER BY m.created DESC,a.rank,m.tie LIMIT ? OFFSET ?').all(...values,limit,offset).map(row=>JSON.parse(row.body as string) as PublicMessage)
 return {rows,total}
}

type ImageCursor={conversation:string;messageId:string;path:string}
export function galleryMessageIndex(options:{conversation?:string;anchor?:ImageCursor;through?:ImageCursor;order:string;direction:string;query:string;author:string;limit:number}){
 const {conversation,anchor,through,order,direction,query,author,limit}=options
 const baseOrder=conversation?'m.ordinal,i.position':'m.created,a.rank DESC,m.tie DESC,i.position'
 const base='WITH base AS (SELECT m.rowid AS rowid,m.source,m.id,m.created,a.rank,m.tie,i.path,i.position AS imagePosition,row_number() OVER (ORDER BY '+baseOrder+')-1 AS ordinal FROM images i JOIN messages m ON m.source=i.source AND m.id=i.id JOIN allowed a ON a.source=m.source) '
 const find=(cursor:ImageCursor)=>statement(base+'SELECT * FROM base WHERE source=? AND id=? AND path=?').get(cursor.conversation,cursor.messageId,cursor.path)
 const boundary=through?find(through):statement(base+'SELECT * FROM base ORDER BY ordinal DESC LIMIT 1').get()
 if(through&&!boundary)throw Error('Gallery boundary is unavailable; refresh the gallery')
 const tail=boundary?{conversation:String(boundary.source),messageId:String(boundary.id),path:String(boundary.path)}:null
 const end=Number(boundary?.ordinal??-1),sorted=order==='newest'?'created DESC,rank,tie,imagePosition':'ordinal'
 const bounded=base.trimEnd()+', bounded AS (SELECT *,row_number() OVER (ORDER BY '+sorted+')-1 AS position FROM base WHERE ordinal<=?) '
 const target=anchor?statement(bounded+'SELECT position FROM bounded WHERE source=? AND id=? AND path=?').get(end,anchor.conversation,anchor.messageId,anchor.path):undefined
 if(anchor&&!target)throw Error('Unknown gallery image cursor')
 const at=Number(target?.position??-1),{where,values}=searchFilter(query,author,'all')
 const visible=bounded.trimEnd()+', visible AS (SELECT b.*,row_number() OVER (ORDER BY b.position)-1 AS visibleIndex FROM bounded b JOIN messages m ON m.rowid=b.rowid LEFT JOIN preferences p ON p.key=m.source||\'/\'||m.id WHERE '+where.join(' AND ')+') '
 const totals=statement(visible+'SELECT count(*) AS total,COALESCE(SUM(position<?),0) AS preceding,MAX(CASE WHEN position=? THEN visibleIndex END) AS selected FROM visible').get(end,...values,at,at)!
 const total=Number(totals.total),preceding=Number(totals.preceding),selected=totals.selected===null?-1:Number(totals.selected)
 if(direction==='around'&&selected<0)throw Error('Image is unavailable or hidden')
 const offset=direction==='around'?Math.max(0,Math.min(selected-Math.floor(limit/2),total-limit)):direction==='last'?Math.max(0,total-limit):direction==='before'?Math.max(0,preceding-limit):direction==='after'?preceding+(selected>=0?1:0):0
 const count=direction==='before'?Math.min(limit,preceding-offset):limit
 const rows=statement(visible+'SELECT v.source,v.id,v.path,m.body FROM visible v JOIN messages m ON m.rowid=v.rowid ORDER BY v.position LIMIT ? OFFSET ?').all(end,...values,count,offset)
 return {images:rows.map(row=>({message:JSON.parse(row.body as string) as PublicMessage,path:String(row.path)})),offset,total,index:direction==='around'?selected-offset:direction==='before'||direction==='last'?Math.max(0,rows.length-1):0,through:tail}
}
