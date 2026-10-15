// Aexus Messenger preferences, folders and drafts on CloudHosts' sole
// group ledger and native journal. No duplicate conversation/message store.
const {randomUUID}=require('node:crypto');
const storage=require('./collaboration-store.cjs'),groups=require('./collaboration.cjs');
const sessions=require('./agent-sessions.cjs'),journal=require('./session-journal.cjs');
const channels=require('./channels.cjs');
const clone=value=>structuredClone(value);
const title=(raw,label,max=100)=>{if(typeof raw!=='string'||!raw.trim()||raw.trim().length>max)throw Error(label+' must contain 1–'+max+' characters');return raw.trim()};
const allowedConversation=/^(agent|employee|group|channel):[a-zA-Z0-9_-]{1,180}$/;
const typeOf=key=>key.startsWith('group:')?'group':key.startsWith('channel:')?'channel':'agent';
const idOf=key=>key.slice(key.indexOf(':')+1);
function normalize(value){
 if(typeof value!=='string'||!allowedConversation.test(value))throw Error('Invalid conversation reference');
 const key=value.startsWith('employee:')?'agent:'+value.slice(9):value,id=idOf(key);
 if(typeOf(key)==='group')groups.get({id});
 else if(typeOf(key)==='channel')channels.get({id});
 else if(!sessions.sessions().some(row=>row.id===id)&&!journal.summaries().some(row=>row.sessionId===id))
  throw Error('Unknown native Agent conversation');
 return key;
}
function db(){
 const sql=storage.connection();
 sql.exec("CREATE TABLE IF NOT EXISTS messenger_state (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL);");
 return sql;
}
const blank=()=>({version:1,revision:0,conversations:{},messages:{},drafts:{},folders:[],orders:{}});
function state(){
 const row=db().prepare('SELECT revision,body FROM messenger_state WHERE id=1').get();
 if(!row)return blank();
 const value=JSON.parse(row.body);
 if(value.version!==1||!['conversations','messages','drafts','orders'].every(key=>value[key]&&typeof value[key]==='object'&&!Array.isArray(value[key]))||!Array.isArray(value.folders))
  throw Error('Invalid persisted Messenger preferences');
 value.revision=row.revision;
 return value;
}
function save(value,expectedRevision){
 const sql=db(),stamp=new Date().toISOString();
 sql.exec('BEGIN IMMEDIATE');
 try{
  const old=sql.prepare('SELECT revision FROM messenger_state WHERE id=1').get()?.revision||0;
  if(old!==expectedRevision)throw Error('Messenger preferences changed; reload before saving');
  value.revision=old+1;
  sql.prepare('INSERT INTO messenger_state(id,revision,body) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body')
   .run(value.revision,JSON.stringify(value));
  sql.exec('COMMIT');
 }catch(error){sql.exec('ROLLBACK');throw error}
 require('./core-events.cjs').publish('messenger-change',{revision:value.revision});
 return clone(value);
}
function change(apply){
 const data=state(),outcome=apply(data);
 if(outcome?.unchanged)return data;
 save(data,data.revision);
 return outcome?.result===undefined?clone(data):clone(outcome.result);
}
const rawOnly=(data,keys)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!keys.includes(key)))throw Error('Invalid Messenger arguments')};
function patch(values,keys){
 if(!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).length)throw Error('Nonempty preference patch required');
 for(const [key,value] of Object.entries(values)){
  if(!keys.includes(key))throw Error('Unknown Messenger preference: '+key);
  if(key==='reaction'){if(!['','like','love','laugh','wow','sad','angry','check','heart','thumbs-up'].includes(value))throw Error('Invalid reaction')}
  else if(typeof value!=='boolean')throw Error(key+' must be boolean');
 }
 return values;
}
function ensureMessage(key,id){
 if(typeof id!=='string'||!id||id.length>180)throw Error('Invalid real message ID');
 if(typeOf(key)==='group'){
  if(!storage.find(idOf(key),id))throw Error('Unknown published group message');
 }else if(typeOf(key)==='channel'){
  const value=channels.entry({id});
  if(value.channelId!==idOf(key))throw Error('Channel message belongs to another conversation');
 }else{
  const message=journal.entry({sessionId:idOf(key),id});
  if(!message||!['user','assistant'].includes(message.kind))
   throw Error('Unknown real native message');
 }
}
function folderMatches(folder,entry,data){
 const requested=new Set(folder.conversations||[]);
 const filter=folder.include||'explicit';
 let dynamic=false;
 if(filter==='all')dynamic=true;
 if(filter==='agent'||filter==='group'||filter==='channel')dynamic=entry.kind===filter;
 if(filter==='favorites')dynamic=data.conversations[entry.key]?.favorite===true;
 if(filter==='unread')dynamic=data.conversations[entry.key]?.unread===true||entry.unreadCount>0;
 return (requested.has(entry.key)||dynamic)&&!(folder.excluded||[]).includes(entry.key);
}
function directory({type='all',query='',folder,archived='exclude',offset=0,limit=100}={}){
 rawOnly({type,query,folder,archived,offset,limit},['type','query','folder','archived','offset','limit']);
 if(!['all','agent','group','channel','favorites','unread'].includes(type)||typeof query!=='string'||query.length>500||
  !['exclude','only','include'].includes(archived)||!Number.isSafeInteger(offset)||offset<0||
  !Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid Messenger directory query');
 const data=state();
 const category=folder?data.folders.find(value=>value.id===folder):null;
 if(folder&&!category)throw Error('Unknown Messenger folder');
 const found=identityCatalog().map(entry=>({...entry,preferences:data.conversations[entry.key]||{},
  hasDraft:!!data.drafts[entry.key],archived:!!data.conversations[entry.key]?.archived||!!entry.sourceArchived}))
  .filter(entry=>(archived==='include'||entry.archived===(archived==='only'))&&(!category||folderMatches(category,entry,data))&&
   (type==='all'||entry.kind===type||type==='favorites'&&entry.preferences.favorite||type==='unread'&&(entry.preferences.unread||entry.unreadCount>0))&&
   (entry.title+' '+entry.subtitle).toLowerCase().includes(query.toLowerCase()));
 const preferred=data.orders?.[folder||type]||data.orders?.all||[],order=new Map(preferred.map((key,i)=>[key,i]));
 found.sort((a,b)=>Number(!!b.preferences.pinned)-Number(!!a.preferences.pinned)||
  (order.get(a.key)??Number.MAX_SAFE_INTEGER)-(order.get(b.key)??Number.MAX_SAFE_INTEGER)||
  a.title.localeCompare(b.title)||a.key.localeCompare(b.key));
 const counts=Object.fromEntries(['all','agent','group','channel','favorites','unread'].map(kind=>[kind,
  found.filter(entry=>kind==='all'||entry.kind===kind||kind==='favorites'&&entry.preferences.favorite||
   kind==='unread'&&(entry.preferences.unread||entry.unreadCount>0)).length]));
 return {entries:clone(found.slice(offset,offset+limit)),total:found.length,hasMore:offset+limit<found.length,offset,counts};
}
function conversation({conversations,patch:changeTo}={}){
 if(!Array.isArray(conversations)||!conversations.length||conversations.length>200)throw Error('Choose 1–200 conversations');
 const ids=[...new Set(conversations.map(normalize))],delta=patch(changeTo,['pinned','favorite','archived','unread']);
 return change(data=>{
  for(const key of ids)data.conversations[key]={...data.conversations[key],...delta};
 });
}
function message({conversation:source,id,ids,patch:changeTo}={}){
 const key=normalize(source),delta=patch(changeTo,['saved','pinned','hidden','reaction']);
 if(id!==undefined&&ids!==undefined)throw Error('Choose id or ids');
 const selected=[...new Set(ids??[id])];
 if(!selected.length||selected.length>200)throw Error('Choose 1–200 real message IDs');
 for(const messageId of selected)ensureMessage(key,messageId);
 return change(data=>{
  for(const messageId of selected){const hash=key+':'+messageId;
   data.messages[hash]={...data.messages[hash],...delta};
  }
 });
}
function draft({conversation:source,text='',replyTo=null,mentions=[],asNote=false,clientMessageId,
 expectedClientMessageId}={}){
 const key=normalize(source);
 if(typeof text!=='string'||text.length>100000||typeof asNote!=='boolean')throw Error('Invalid draft text or note preference');
 if(replyTo!==null&&(typeof replyTo!=='string'||replyTo.length>180))throw Error('Invalid draft reply');
 if(replyTo&&['group','channel'].includes(typeOf(key)))ensureMessage(key,replyTo);
 if(!Array.isArray(mentions)||mentions.length>200||mentions.some(value=>typeof value!=='string'))throw Error('Invalid draft mentions');
 if(typeOf(key)==='group'){
  const group=groups.get({id:idOf(key)});
  if(mentions.some(value=>!group.memberIds.includes(value)))throw Error('Draft mentions a non-member');
 }else if(typeOf(key)==='channel'){
  if(mentions.length||asNote)throw Error('Channel drafts are public notes without group mention fan-out');
 }else if(mentions.length||asNote||replyTo)throw Error('Native private drafts do not accept group-only fields');
 if(clientMessageId!==undefined&&(typeof clientMessageId!=='string'||!/^[\w:-]{4,160}$/.test(clientMessageId)))throw Error('Invalid draft idempotency key');
 if(expectedClientMessageId!==undefined&&(typeof expectedClientMessageId!=='string'||!expectedClientMessageId))
  throw Error('Invalid prior draft key');
 return change(data=>{
  const before=data.drafts[key];
  if(expectedClientMessageId!==undefined&&before?.clientMessageId!==expectedClientMessageId)return {unchanged:true};
  if(!text.trim()&&!replyTo&&!mentions.length){
   if(!before)return {unchanged:true};
   delete data.drafts[key];
  }else{
   data.drafts[key]={text,replyTo,mentions:[...new Set(mentions)],asNote,
    clientMessageId:clientMessageId||before?.clientMessageId||'draft-'+randomUUID(),
    updatedAt:new Date().toISOString()};
  }
 });
}
const includeOptions=['explicit','all','agent','group','channel','favorites','unread'];
function folderSave({id,name,conversations=[],include='explicit',excluded=[],expectedRevision}={}){
 name=title(name,'Messenger folder name',80);
 if(id!==undefined&&(typeof id!=='string'||!/^mf_[a-zA-Z0-9_-]{8,120}$/.test(id)))throw Error('Invalid Messenger folder ID');
 if(!Array.isArray(conversations)||conversations.length>2000||!Array.isArray(excluded)||excluded.length>2000||
  !includeOptions.includes(include))throw Error('Invalid Messenger folder members');
 const selected=[...new Set(conversations.map(normalize))].sort();
 const blocked=[...new Set(excluded.map(normalize))].sort();
 return change(data=>{
  const current=id?data.folders.find(row=>row.id===id):null;
  if(id&&!current)throw Error('Unknown Messenger folder');
  if(expectedRevision!==undefined&&expectedRevision!==(current?.revision||0))throw Error('Folder revision changed');
  const next={id:current?.id||'mf_'+randomUUID(),name,conversations:selected,
   include,excluded:blocked,revision:(current?.revision||0)+1};
  if(current)data.folders[data.folders.findIndex(row=>row.id===id)]=next;
  else data.folders.push(next);
  return {result:next};
 });
}
function folderDelete({id,expectedRevision}={}){
 if(typeof id!=='string')throw Error('Choose a Messenger folder');
 return change(data=>{
  const index=data.folders.findIndex(row=>row.id===id),folder=data.folders[index];
  if(!folder)throw Error('Unknown Messenger folder');
  if(expectedRevision!==undefined&&folder.revision!==expectedRevision)throw Error('Folder revision changed');
  data.folders.splice(index,1);delete data.orders[id];
  return {result:{deleted:true,id}};
 });
}
function reorder({scope='all',order=[],expectedOrder}={}){
 if(typeof scope!=='string'||!['all','agent','group','channel','favorites','unread','archive'].includes(scope)&&
  !state().folders.some(row=>row.id===scope))throw Error('Unknown Messenger ordering scope');
 if(!Array.isArray(order)||order.length>2000||order.some(row=>typeof row!=='string'))throw Error('Invalid conversation order');
 const normalized=[...new Set(order.map(normalize))];
 return change(data=>{
  const previous=data.orders[scope]||[];
  if(expectedOrder!==undefined&&JSON.stringify(expectedOrder)!==JSON.stringify(previous))throw Error('Conversation order changed');
  if(JSON.stringify(previous)===JSON.stringify(normalized))return {unchanged:true};
  if(normalized.length)data.orders[scope]=normalized;else delete data.orders[scope];
 });
}

function search({conversation:source,query='',filter='all',author='all',offset=0,limit=50}={}){
 if(typeof query!=='string'||query.length>500||!['all','saved','pinned'].includes(filter)||
  !['all','you','agent'].includes(author)||!Number.isSafeInteger(offset)||offset<0||
  !Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid Messenger search');
 const selected=source?normalize(source):null,known=identityCatalog();
 const wanted=selected?known.filter(row=>row.key===selected):known;
 const rows=[],term=query.trim().toLowerCase(),prefs=state().messages;
 let truncated=false;
 for(const entry of wanted){
  if(entry.kind==='group'){
   const args=[entry.id],parts=['group_id=?'];
   if(term){parts.push("(LOWER(json_extract(payload,'$.text')) LIKE ? ESCAPE char(92) OR LOWER(json_extract(payload,'$.author.name')) LIKE ? ESCAPE char(92))");
    const escaped=term.replace(/[\\%_]/g,'\\$&');args.push('%'+escaped+'%','%'+escaped+'%');}
   const sql="SELECT payload FROM messages WHERE "+parts.join(' AND ')+" ORDER BY sequence DESC LIMIT 5001";
   const records=storage.connection().prepare(sql).all(...args);
   if(records.length>5000)truncated=true;
   for(const record of records.slice(0,5000)){
    const value=JSON.parse(record.payload),key=entry.key+':'+value.id,preferences=prefs[key]||{};
    if(preferences.hidden)continue;
    const role=value.author.kind==='operator'?'you':'agent';
    if(author!=='all'&&role!==author||filter!=='all'&&!preferences[filter])continue;
    rows.push({conversation:entry.key,conversationTitle:entry.title,id:value.id,sequence:value.sequence,
     role,author:value.author.name||role,text:value.text,createdAt:value.createdAt,
     attachments:value.attachments||[],replyTo:value.replyTo||null,preferences});
   }
  }else{
   let before,scanned=0;
   do{
    const page=journal.history({sessionId:entry.id,limit:200,...(before?{before}:{})});
    for(const value of page.events){
     scanned++;
     if(!['user','assistant'].includes(value.kind)||!value.text?.trim())continue;
     const key=entry.key+':'+value.id,preferences=prefs[key]||{},role=value.kind==='user'?'you':'agent';
     if(preferences.hidden||filter!=='all'&&!preferences[filter]||author!=='all'&&role!==author||
      term&&!value.text.toLowerCase().includes(term))continue;
     rows.push({conversation:entry.key,conversationTitle:entry.title,id:value.id,role,
      author:role==='you'?'You':entry.title,text:value.text,createdAt:value.time,preferences,turnId:value.turnId});
    }
    before=page.nextBefore;
   }while(before!==null&&before!==undefined&&scanned<5000);
   if(before!==null&&before!==undefined)truncated=true;
  }
 }
 rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||a.conversation.localeCompare(b.conversation)||a.id.localeCompare(b.id));
 return {messages:clone(rows.slice(offset,offset+limit)),total:rows.length,hasMore:offset+limit<rows.length,
  truncated,readOnly:true};
}
function dispatch(command,args={}){
 if(!command.startsWith('messenger.'))throw Error('Unknown Messenger API command');
 switch(command.slice('messenger.'.length)){
  case 'state':rawOnly(args,[]);return state();
  case 'directory':return directory(args);
  case 'conversation':return conversation(args);
  case 'message':return message(args);
  case 'draft':return draft(args);
  case 'folder-save':return folderSave(args);
  case 'folder-delete':return folderDelete(args);
  case 'reorder':return reorder(args);
  case 'search':return search(args);
  case 'forward':return require('./messenger-forward.cjs').forward(args);
  case 'forward-status':return require('./messenger-forward.cjs').lookupStatus(args);
  default:throw Error('Unknown Messenger API command');
 }
}
module.exports={state,directory,conversation,message,draft,folderSave,folderDelete,reorder,search,dispatch,normalize};

function identityCatalog(){
 const native=new Map(sessions.sessions().map(row=>[row.id,{key:'agent:'+row.id,id:row.id,kind:'agent',title:row.name,
  subtitle:[row.engine,row.targetHostId].filter(Boolean).join(' · '),engine:row.engine,hostId:row.targetHostId}]));
 for(const row of journal.summaries())if(!native.has(row.sessionId))native.set(row.sessionId,
  {key:'agent:'+row.sessionId,id:row.sessionId,kind:'agent',title:'Archived native session',subtitle:'Retained history'});
 return [...groups.list({includeArchived:true}).map(row=>({key:'group:'+row.id,id:row.id,kind:'group',title:row.name,
  subtitle:row.description||row.memberIds.length+' Agents',sourceArchived:!!row.archived,unreadCount:row.unreadCount||0})),
  ...channels.list().map(row=>({key:'channel:'+row.id,id:row.id,kind:'channel',title:row.name,
   subtitle:row.description||(row.mode==='external'?'Published news':'Agent-published articles'),unreadCount:row.unreadCount||0})),
  ...native.values()];
}
