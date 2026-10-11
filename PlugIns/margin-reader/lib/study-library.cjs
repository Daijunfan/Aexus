'use strict';
const {randomUUID}=require('node:crypto');
const {assert}=require('./safety.cjs');
const M=require('./study-model.cjs');
const methods=new Set(['study.library.get','study.library.move','study.folder.create','study.folder.update','study.folder.remove','study.folder.restore']);
const defaults=()=>({revision:0,folders:[],locations:{}});
const normalize=s=>s.normalize('NFC').toLocaleLowerCase('en-US');
function title(value){assert(typeof value==='string'&&value.trim()&&value.trim().length<=100&&!/[\\/\x00-\x1f\x7f]/.test(value)&&!['.','..'].includes(value.trim()),'INVALID_PARAMS','Folder names need 1–100 characters and cannot contain path separators or control characters.');return value.trim();}
function data(state){return state.studyLibrary||defaults();}
function folder(library,id,includeDeleted=false){if(id===null||id===undefined)return null;assert(typeof id==='string'&&M.UUID.test(id),'INVALID_PARAMS','Use a folder UUID or null for the study library root.');const row=library.folders.find(f=>f.id===id);assert(row&&(includeDeleted||!row.deletedAt),'NOT_FOUND','Study folder does not exist or is in trash.');return row;}
function location(state,setId){const l=data(state),id=l.locations[setId];return id&&l.folders.some(f=>f.id===id&&!f.deletedAt)?id:null;}
function validate(state,code='STATE_CORRUPT'){
 const l=state.studyLibrary;if(l===undefined)return;
 assert(l&&typeof l==='object'&&!Array.isArray(l)&&Number.isSafeInteger(l.revision)&&l.revision>=0&&Array.isArray(l.folders)&&l.folders.length<=2000&&l.locations&&typeof l.locations==='object'&&!Array.isArray(l.locations),code,'Invalid study library structure.');
 const byId=new Map(),names=new Set();
 for(const f of l.folders){assert(f&&typeof f==='object'&&M.UUID.test(f.id)&&!byId.has(f.id)&&typeof f.title==='string'&&f.title.trim().length>0&&f.title.length<=100&&!['.','..'].includes(f.title.trim())&&!/[\\/\x00-\x1f\x7f]/.test(f.title)&&(f.parentId===null||M.UUID.test(f.parentId)),code,'Invalid study folder.');byId.set(f.id,f);if(!f.deletedAt){const key=(f.parentId||'')+':'+normalize(f.title);assert(!names.has(key),code,'Duplicate study folder name.');names.add(key);}}
 for(const f of l.folders){let id=f.parentId,seen=new Set([f.id]);while(id){assert(byId.has(id)&&!seen.has(id)&&seen.size<64,code,'Invalid or cyclic study folder hierarchy.');seen.add(id);const parent=byId.get(id);assert(f.deletedAt||!parent.deletedAt,code,'An active folder has a deleted parent.');id=parent.parentId;}}
 for(const [setId,id] of Object.entries(l.locations))assert(M.UUID.test(setId)&&Object.hasOwn(state.studySets,setId)&&(id===null||byId.has(id)),code,'Invalid study location.');
}
function unique(l,parentId,name,except){assert(!l.folders.some(f=>!f.deletedAt&&f.id!==except&&f.parentId===parentId&&normalize(f.title)===normalize(name)),'ALREADY_EXISTS','A study folder with this name already exists here.');}
function describe(state){
 validate(state);const l=data(state),activeFolders=new Set(l.folders.filter(f=>!f.deletedAt).map(f=>f.id));
 const sets=Object.values(state.studySets).filter(s=>!s.deletedAt).map(s=>({...M.summary(s),folderId:activeFolders.has(l.locations[s.id])?l.locations[s.id]:null}));
 const counts=new Map(),children=new Map();for(const s of sets)counts.set(s.folderId,(counts.get(s.folderId)||0)+1);for(const f of l.folders)if(!f.deletedAt)children.set(f.parentId,(children.get(f.parentId)||0)+1);
 return {revision:l.revision,folders:l.folders.map(f=>({...f,studyCount:counts.get(f.id)||0,folderCount:children.get(f.id)||0})),sets};
}
function assignNew(state,setId,folderId){if(folderId==null)return;const l=state.studyLibrary||=defaults();folder(l,folderId);l.locations[setId]=folderId;l.revision++;}
async function request(store,method,p){
 if(method==='study.library.get')return describe(await store.load());
 return store.transaction(state=>{
  validate(state);const l=state.studyLibrary||=defaults();assert(l.revision===p.expectedRevision,'CONFLICT','Study folders changed in another client. Refresh and explicitly retry.',{currentRevision:l.revision});
  const now=new Date().toISOString();
  if(method==='study.folder.create'){
   assert(l.folders.length<2000,'TOO_LARGE','At most 2000 study folders, including recoverable deleted folders.');const parentId=p.parentId??null;folder(l,parentId);const name=title(p.title);unique(l,parentId,name);
   l.folders.push({id:randomUUID(),title:name,parentId,createdAt:now,updatedAt:now});
  }else if(method==='study.library.move'){
   assert(Array.isArray(p.setIds)&&p.setIds.length>0&&p.setIds.length<=500,'INVALID_PARAMS','Choose 1–500 study sets.');const target=p.folderId??null;folder(l,target);
   const ids=[...new Set(p.setIds)];ids.forEach(id=>M.findSet(state,id));for(const id of ids){if(target)l.locations[id]=target;else delete l.locations[id];}
  }else{
   const f=folder(l,p.folderId,method==='study.folder.restore');
   assert(f,'INVALID_PARAMS','The study library root cannot be changed.');
   if(method==='study.folder.remove'){
    assert(!l.folders.some(c=>!c.deletedAt&&c.parentId===f.id)&&!Object.values(state.studySets).some(s=>!s.deletedAt&&location(state,s.id)===f.id),'NOT_EMPTY','Move the studies and child folders elsewhere before removing this folder.');f.deletedAt=now;
   }else if(method==='study.folder.restore'||method==='study.folder.update'){
    if(method==='study.folder.restore')assert(f.deletedAt,'INVALID_STATE','This folder is not deleted.');
    else assert(p.title!==undefined||p.parentId!==undefined,'INVALID_PARAMS','Supply a folder name or parent.');
    const parentId=p.parentId===undefined?f.parentId:p.parentId;folder(l,parentId);const name=p.title===undefined?f.title:title(p.title);unique(l,parentId,name,f.id);f.parentId=parentId;f.title=name;delete f.deletedAt;
   }
   f.updatedAt=now;
  }
  l.revision++;validate(state,'INVALID_HIERARCHY');
  if(state.settings.studyFolder&&!l.folders.some(f=>f.id===state.settings.studyFolder&&!f.deletedAt))state.settings.studyFolder=null;
  return describe(state);
 });
}
module.exports={methods,request,data,folder,location,validate,describe,assignNew};
