'use strict';
const fs=require('node:fs/promises'),{randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),H=require('./study-history.cjs');
const writes=new Set(['study.versions.create','study.versions.restore','study.versions.update','study.versions.policy']);
const reads=new Set(['study.versions.list','study.versions.get']);
function candidate(set,now=Date.now()){
 const p=set.versionPolicy;if(!p?.enabled||set.deletedAt)return null;
 if(now-Date.parse(set.lastAutoVersionAt||0)<(p.intervalSeconds||600)*1000)return null;
 if((set.versionRecords||[]).length>=500)return null;
 return {id:set.id,revision:set.revision,versionCount:(set.versionRecords||[]).length,snapshot:H.snapshot(set),createdAt:new Date(now).toISOString()};
}
async function saveSnapshot(store,set,value,{title,automatic=false},rollback){
 set.versionRecords??=[];S.assert(set.versionRecords.length<500,'TOO_LARGE','A study supports at most 500 retained versions. Export a complete backup before starting a new study.');
 const id=randomUUID(),payload={schema:'margin-reader.version/v1',setId:set.id,sourceRevision:value.revision,createdAt:value.createdAt||new Date().toISOString(),snapshot:value.snapshot},bytes=Buffer.from(JSON.stringify(payload));
 S.assert(bytes.length<=32*1024*1024,'TOO_LARGE','A version snapshot exceeds 32 MiB. Use a complete workspace backup.');
 await store.mkdir(`versions/${set.id}`);const file=await store.meta(`versions/${set.id}/${id}.json`);await S.writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));
 const record={id,title:M.title(title||new Date().toLocaleString()),createdAt:payload.createdAt,sourceRevision:value.revision,sha256:S.digest(bytes),bytes:bytes.length,cardCount:value.snapshot.cards.length,automatic};set.versionRecords.push(record);set.lastVersionId=id;
 if(automatic)set.lastAutoVersionAt=new Date().toISOString();return record;
}
async function automatic(store,state,before,rollback){
 for(const value of before){const set=state.studySets[value.id];if(!set||set.revision===value.revision||!set.versionPolicy?.enabled||set.deletedAt||(set.versionRecords||[]).length!==value.versionCount)continue;
  await saveSnapshot(store,set,value,{title:'自动版本 · '+value.createdAt,automatic:true},rollback);
 }
}
async function readSnapshot(store,set,id){
 const record=set.versionRecords?.find(v=>v.id===id);S.assert(record,'NOT_FOUND','Version not found.');
 const bytes=await S.readBounded(await store.meta(`versions/${set.id}/${record.id}.json`),32*1024*1024);S.assert(S.digest(bytes)===record.sha256,'CHECKSUM_MISMATCH','Version data was modified or damaged.');
 let value;try{value=JSON.parse(bytes.toString());}catch{S.fail('STATE_CORRUPT','Version snapshot is not readable JSON.');}
 S.assert(value.schema==='margin-reader.version/v1'&&value.setId===set.id&&value.snapshot,'STATE_CORRUPT','Version belongs to a different study.');return {record,value};
}
async function read(store,method,p){
 const set=M.findSet(await store.load(),p.setId,true);
 if(method==='study.versions.list'){const rows=[...(set.versionRecords||[])].filter(v=>p.includeArchived||!v.archived).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),offset=p.offset||0,limit=p.limit||50;return {revision:set.revision,versions:rows.slice(offset,offset+limit),total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,policy:set.versionPolicy||{enabled:false,intervalSeconds:600}};}
 const {record,value}=await readSnapshot(store,set,p.versionId);const current=new Map(set.cards.map(c=>[c.id,c])),old=new Map(value.snapshot.cards.map(c=>[c.id,c]));
 return {revision:set.revision,version:record,summary:{title:value.snapshot.title,documents:value.snapshot.documentIds.length,cards:old.size},changes:{added:set.cards.filter(c=>!old.has(c.id)).map(c=>({id:c.id,title:c.title})),removed:value.snapshot.cards.filter(c=>!current.has(c.id)).map(c=>({id:c.id,title:c.title})),changed:set.cards.filter(c=>old.has(c.id)&&JSON.stringify(c)!==JSON.stringify(old.get(c.id))).map(c=>({id:c.id,title:c.title}))},...(p.includeContent?{snapshot:value.snapshot}:{})};
}
async function request(store,method,p){
 await store.transaction(async(state,rollback)=>{
  const set=M.findSet(state,p.setId,true);M.revision(set,p.expectedRevision);
  if(method==='study.versions.create')await saveSnapshot(store,set,{revision:set.revision,snapshot:H.snapshot(set)},{title:p.title},rollback);
  else if(method==='study.versions.restore'){
   const {value}=await readSnapshot(store,set,p.versionId);const otherIds=new Set(Object.values(state.studySets).filter(s=>s.id!==set.id&&!s.deletedAt).flatMap(s=>s.cards.map(c=>c.id)));S.assert(value.snapshot.cards.every(c=>!otherIds.has(c.id)),'CONFLICT','This version contains cards moved to another study. Use linked undo before restoring this snapshot.');H.checkpoint(set);Object.assign(set,structuredClone(value.snapshot));delete set.deletedAt;
   if(state.settings.activeStudySet===set.id&&!set.documentIds.includes(state.settings.lastDocument))state.settings.lastDocument=null;
  }else if(method==='study.versions.update'){
   const record=set.versionRecords?.find(v=>v.id===p.versionId);S.assert(record,'NOT_FOUND','Version not found.');S.assert(p.title!==undefined||p.archived!==undefined,'INVALID_PARAMS','Supply title or archived.');if(p.title!==undefined)record.title=M.title(p.title);if(p.archived!==undefined)record.archived=p.archived;
  }else if(method==='study.versions.policy')set.versionPolicy={...set.versionPolicy,enabled:p.enabled,...(p.intervalSeconds!==undefined?{intervalSeconds:p.intervalSeconds}:{})};
  else S.fail('METHOD_NOT_FOUND','Unknown version operation.');M.touch(set);
 });
 const state=await store.load();return M.describe(store,state,M.findSet(state,p.setId,true));
}
module.exports={writes,reads,candidate,automatic,saveSnapshot,readSnapshot,read,request};
