'use strict';
const {randomUUID}=require('node:crypto'),M=require('./study-model.cjs');
const {builtin}=require('./ink-toolbar.cjs');
const UUID=/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
/** Remap owned identities, not arbitrary UUIDs quoted in user-authored prose. */
function identities(manifest){
 const map=new Map(),register=id=>{if(typeof id==='string'&&M.UUID.test(id)&&!map.has(id))map.set(id,randomUUID());};
 function collect(value,key=''){
  if(typeof value==='string'){if(['id','fileKey','captureId'].includes(key))register(value);return;}
  if(Array.isArray(value)){value.forEach(item=>collect(key==='tools'&&builtin(item?.id)?{...item,id:undefined}:item,key));return;}
  if(value&&typeof value==='object')for(const [name,item] of Object.entries(value))collect(item,name);
 }
 collect(manifest);
 const replace=text=>text.replace(UUID,id=>map.get(id)||id);
 const prose=new Set(['title','text','editedText','note','description','front','back','cloze','label','name','tags','query','path','anchor','html','titleHtml','noteHtml','uri']);
 const inline=text=>text.replace(/margin-reader:\/\/(?:card|study|document)\/[^\s<>"')]+/g,replace).replace(/\[\[([^\]\n]+)\]\]/g,(_,body)=>{const [key,...alias]=body.split('|');return '[['+replace(key)+(alias.length?'|'+alias.join('|'):'')+']]';});
 function remap(value,key=''){
  if(['toolIds','lastToolId'].includes(key)&&typeof value==='string'&&builtin(value))return value;
  if(typeof value==='string')return prose.has(key)?inline(value):replace(value);
  if(key==='tools'&&Array.isArray(value))return value.map(tool=>builtin(tool?.id)?{...remap(tool),id:tool.id}:remap(tool));
  if(key==='activeTools'&&value&&typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.entries(value).map(([kind,id])=>[kind,kind==='ink'&&builtin(id)?id:remap(id,kind)]));
  if(Array.isArray(value))return value.map(item=>remap(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[replace(name),remap(item,name)]));
  return value;
 }
 return {map,remap};
}
module.exports={identities};
