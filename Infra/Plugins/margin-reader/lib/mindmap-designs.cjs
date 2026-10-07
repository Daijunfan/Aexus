'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),V=require('./mindmap-model.cjs');
const FORMAT='margin-reader/mindmap-design/1';
const KEYS=['skeleton','theme','palette','centralColor','levelStyles','structure','line','lineWidth','colorMode','background','textColor','spacing','branchSpacing','autoBalance','sameLevelWidth','gradient','shadow','showImages','showTags','showSources','numbering','numberPrefix','numberSuffix','fontFamily','fontSize','topicShape','rootShape','topicWidth','titleLines'];
const methods=new Set(['study.mindmap.design.list','study.mindmap.design.save','study.mindmap.design.archive','study.mindmap.design.apply','study.mindmap.design.export','study.mindmap.design.import']);
const entries=state=>state.settings.mindmapDesigns||[];
const version=state=>S.digest(JSON.stringify(entries(state)));
function expected(state,value){S.assert(typeof value==='string'&&value===version(state),'CONFLICT','Saved mind-map designs changed. Reload before editing.');}
function title(value){S.assert(typeof value==='string'&&value.trim()&&value.trim().length<=80,'INVALID_PARAMS','Use a design title of 1–80 characters.');return value.trim();}
function settings(value){S.assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>KEYS.includes(k)),'INVALID_PARAMS','Only mind-map visual settings may be stored in a design.');return V.patch(value,V.mapRules);}
function find(state,id){const d=entries(state).find(d=>d.id===id);S.assert(d,'NOT_FOUND','Saved design not found.');return d;}
function describe(state){return {version:version(state),designs:entries(state)};}
function readFormat(raw){S.assert(raw&&Object.keys(raw).every(k=>['schema','title','settings'].includes(k))&&raw.schema===FORMAT,'INVALID_PARAMS','Unsupported mind-map design document.');return {schema:FORMAT,title:title(raw.title),settings:settings(raw.settings)};}
async function source(store,rel){const file=await S.safePath(store.workspace,rel),bytes=await S.readBounded(file,256*1024);let value;try{value=JSON.parse(bytes);}catch{S.fail('INVALID_PARAMS','Design file must be valid JSON.');}return {document:readFormat(value),sourceVersion:S.digest(bytes)};}
async function request(store,method,p){
 if(method.endsWith('.list'))return describe(await store.load());
 if(method.endsWith('.export')){
  const state=await store.load();expected(state,p.expectedVersion);const d=find(state,p.designId),target=await S.safePath(store.workspace,p.path);await require('./files.cjs').parentExists(store.workspace,p.path);
  const bytes=Buffer.from(JSON.stringify({schema:FORMAT,title:d.title,settings:d.settings},null,2)+'\n');
  await store.transaction(async(fresh,rollback)=>{expected(fresh,p.expectedVersion);await S.safePath(store.workspace,p.path);await S.writeNew(target,bytes);rollback(()=>fs.rm(target,{force:true}));});return {path:p.path,bytes:bytes.length,format:FORMAT};
 }
 const input=method.endsWith('.import')?await source(store,p.path):null;
 if(input&&p.apply!==true)return {...input,applied:false};
 let applied;
 const id=await store.transaction(async state=>{
  expected(state,p.expectedVersion);
  if(input){S.assert(p.expectedSourceVersion===input.sourceVersion,'CONFLICT','Design file changed after inspection.');const fresh=await source(store,p.path);S.assert(fresh.sourceVersion===input.sourceVersion,'CONFLICT','Design file changed while importing.');}
  if(method.endsWith('.apply')){
   const d=find(state,p.designId);S.assert(!d.archived,'NOT_FOUND','Restore the archived design before using it.');const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);require('./study-history.cjs').checkpoint(set);set.map??={};
   const map={...set.map.mindmap};for(const k of KEYS)delete map[k];set.map.mindmap={...map,...structuredClone(d.settings),enabled:true};V.validateSet(set);M.touch(set);applied=set.id;return d.id;
  }
  state.settings.mindmapDesigns??=[];
  if(method.endsWith('.archive')){const d=find(state,p.designId);d.archived=p.archived!==false;d.updatedAt=new Date().toISOString();return d.id;}
  let spec,label;
  if(input){spec=input.document.settings;label=p.title?title(p.title):input.document.title;}
  else if(p.setId){S.assert(p.settings===undefined,'INVALID_PARAMS','Choose a source study or explicit settings, not both.');const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);spec=Object.fromEntries(KEYS.filter(k=>set.map?.mindmap?.[k]!==undefined).map(k=>[k,set.map.mindmap[k]]));
   const {mapStyle}=await import('../ui/mindmap-style.mjs'),resolved=mapStyle(spec);spec={skeleton:resolved.skeleton,theme:spec.theme||'radiance',...spec};label=title(p.title);
  }else{spec=settings(p.settings);label=title(p.title);}
  const now=new Date().toISOString(),d=p.designId?find(state,p.designId):{id:randomUUID(),createdAt:now};
  S.assert(p.designId||entries(state).length<200,'TOO_LARGE','At most 200 saved designs.');Object.assign(d,{title:label,settings:settings(spec),archived:false,updatedAt:now});if(!p.designId)entries(state).push(d);return d.id;
 });
 const state=await store.load();return applied?M.describe(store,state,M.findSet(state,applied)):{...describe(state),designId:id,applied:!!input};
}
module.exports={methods,request,settings,FORMAT,KEYS};
