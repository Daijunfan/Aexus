'use strict';
const fs=require('node:fs/promises'),{randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),O=require('./study-organize.cjs');
const Toolbar=require('./ink-toolbar.cjs');
const methods=new Set(['study.ink.toolbar.set','study.tool.save','study.tool.apply','study.tool.remove','study.palette.set','study.menu.set','study.template.import']);
const MENU=['focus','camera','record','speech','clipboard-copy','clipboard-reference','clipboard-cut','clipboard-paste','insert','comments','uri','ink-manage','transform','source','image','edit','preview','parts','occlude','child','links','review','annotation','unmerge','batch','copy','submap','un-submap','split','outdent','root','remove'];
function shape(value){S.assert(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_PARAMS','Expected settings object.');return value;}
async function apply(store,state,set,kind,settings){
 if(kind==='ink')settings={vanish:false,...settings,...(settings.width!==undefined&&settings.cardWidth===undefined?{cardWidth:settings.width}:{})};
 const method=kind==='capture'?'study.capture.settings':'study.ink.settings';
 require('../runtime.cjs').validate(method,{setId:set.id,expectedRevision:set.revision,...settings});
 return kind==='capture'?O.request(store,state,set,method,settings):require('./study-ink-tools.cjs').request(store,state,set,method,settings);
}
function palette(value){
 S.assert(Array.isArray(value)&&value.length>=1&&value.length<=32,'INVALID_PARAMS','A color palette needs 1–32 entries.');
 const colors=new Set();return value.map(c=>{shape(c);S.assert(Object.keys(c).every(k=>['color','title'].includes(k)),'INVALID_PARAMS','Unknown palette property.');const color=M.color(c.color),title=M.title(c.title||c.color);S.assert(!colors.has(color),'INVALID_PARAMS','Palette colors must be unique.');colors.add(color);return {color,title};});
}
async function request(store,state,set,method,p){
 if(method==='study.ink.toolbar.set'){
  S.assert((p.context===undefined)===(p.placement===undefined),'INVALID_PARAMS','Provide context and placement together.');
  const value={...set.inkToolbar};if(p.widthMode!==undefined)value.widthMode=p.widthMode;if(p.toolIds!==undefined)value.toolIds=Toolbar.check(set,p.toolIds);
  if(p.context!==undefined){S.assert(Toolbar.contexts.includes(p.context),'INVALID_PARAMS','Unknown toolbar context.');value.placements={...value.placements,[p.context]:Toolbar.placement(p.placement)};}
  set.inkToolbar=value;Toolbar.validate(set);return;
 }
 if(method==='study.tool.save'){
  set.tools??=[];const before=Toolbar.describe(set).toolIds,tool=p.toolId?Toolbar.tools(set).find(t=>t.id===p.toolId&&!t.deletedAt):null;if(p.toolId)S.assert(tool,'NOT_FOUND','Tool no longer exists.');
  const kind=p.kind||tool?.kind;S.assert(['capture','ink'].includes(kind),'INVALID_PARAMS','Choose a capture or handwriting tool.');
  const settings=structuredClone(p.settings??(kind==='capture'?set.captureSettings||{}:set.inkSettings||{}));shape(settings);
  if(Object.keys(settings).length)await apply(store,state,structuredClone(set),kind,settings);
  const value={id:tool?.id||randomUUID(),kind,title:M.title(p.title),settings},owned=set.tools.find(t=>t.id===value.id);
  if(tool?.builtin)S.assert(kind==='ink'&&Toolbar.family(value)===tool.builtin,'INVALID_PARAMS','A base pen keeps its pen family. Copy it to create a different tool.');
  if(owned)Object.assign(owned,value);else{S.assert(Toolbar.builtin(value.id)||set.tools.filter(t=>!Toolbar.builtin(t.id)).length<100,'TOO_LARGE','At most 100 custom saved tools.');set.tools.push(value);}set.lastToolId=value.id;
  if(p.pin!==undefined){S.assert(kind==='ink','INVALID_PARAMS','Only pen tools belong in the handwriting toolbar.');set.inkToolbar={...set.inkToolbar,toolIds:Toolbar.check(set,p.pin?[...new Set([...before,value.id])]:before.filter(id=>id!==value.id))};}
  else if(before.includes(value.id))Toolbar.check(set,before);
  if(p.apply)await request(store,state,set,'study.tool.apply',{toolId:value.id});return;
 }
 if(method==='study.tool.apply'||method==='study.tool.remove'){
  const tool=Toolbar.tools(set).find(t=>t.id===p.toolId);S.assert(tool,'NOT_FOUND','Tool not found.');
  if(method==='study.tool.remove'){
   const before=Toolbar.describe(set).toolIds;set.tools??=[];let owned=set.tools.find(t=>t.id===tool.id);if(!owned){owned=structuredClone(tool);delete owned.builtin;set.tools.push(owned);}
   if(p.restore)delete owned.deletedAt;else{owned.deletedAt=new Date().toISOString();if(before.includes(tool.id))set.inkToolbar={...set.inkToolbar,toolIds:Toolbar.check(set,before.filter(id=>id!==tool.id))};}
   if(!p.restore&&set.activeTools?.ink===tool.id&&before.includes(tool.id)){const next=Toolbar.tools(set).find(t=>Toolbar.describe(set).toolIds.includes(t.id)&&Toolbar.family(t)===Toolbar.family(tool));if(next)await request(store,state,set,'study.tool.apply',{toolId:next.id});}return;
  }
  S.assert(!tool.deletedAt,'NOT_FOUND','Restore this tool before using it.');
  if(Object.keys(tool.settings).length)await apply(store,state,set,tool.kind,tool.settings);
  else if(tool.kind==='capture')set.captureSettings={};else set.inkSettings={};
  set.activeTools={...set.activeTools,[tool.kind]:tool.id};return;
 }
 if(method==='study.palette.set'){set.palette=palette(p.colors);return;}
 if(method==='study.menu.set'){
  S.assert(p.cardActions!==undefined||p.selectionActions!==undefined,'INVALID_PARAMS','Supply a menu configuration.');
  set.menuSettings??={};
  for(const key of ['cardActions','selectionActions'])if(p[key]!==undefined){const allowed=key==='cardActions'?MENU:['new','append','revise','note','toc','copy','research'];S.assert(Array.isArray(p[key])&&p[key].length<=allowed.length&&p[key].every(s=>allowed.includes(s)),'INVALID_PARAMS','Unsupported menu action.');set.menuSettings[key]=[...new Set(p[key])];}return;
 }
 if(method==='study.template.import'){
  const file=await S.safePath(store.workspace,p.path),bytes=await S.readBounded(file,128*1024);let value;
  try{value=JSON.parse(bytes.toString('utf8'));}catch{S.fail('INVALID_TEMPLATE','Template is not valid JSON.');}
  S.assert(value?.schema==='margin-reader.style/v1','INVALID_TEMPLATE','Not a Margin Reader style template.');shape(value.settings);
  const x=value.settings;S.assert(Object.keys(x).every(k=>['appearance','map','inkBinding','inkSettings','captureSettings','palette','tools','menuSettings'].includes(k)),'INVALID_TEMPLATE','Unsupported template property.');
  if(x.appearance){shape(x.appearance);const {paper,...style}=x.appearance;O.checkedStyle(style);S.assert(paper===undefined||['dots','grid','plain','lined'].includes(paper),'INVALID_TEMPLATE','Invalid map paper.');set.appearance=structuredClone(x.appearance);}
  if(x.map){shape(x.map);S.assert(Object.keys(x.map).every(k=>['layout','branchStyle'].includes(k))&&['tree','down','radial'].includes(x.map.layout||'tree')&&(!x.map.branchStyle||O.STYLES.includes(x.map.branchStyle)),'INVALID_TEMPLATE','Invalid map layout.');set.map={...set.map,...x.map};}
  if(x.inkBinding!==undefined){shape(x.inkBinding);if(Object.keys(x.inkBinding).length)require('./map-ink.cjs').settings(set,x.inkBinding);}
  if(x.palette)set.palette=palette(x.palette);
  for(const kind of ['capture','ink']){const settings=x[kind==='capture'?'captureSettings':'inkSettings'];if(settings&&Object.keys(settings).length)await apply(store,state,set,kind,shape(settings));}
  if(x.tools){S.assert(Array.isArray(x.tools)&&x.tools.length<=103,'INVALID_TEMPLATE','At most 100 custom tools and 3 base pens per template.');for(const tool of x.tools){const base=tool.builtin===undefined?null:Toolbar.builtins.find(t=>t.builtin===tool.builtin);S.assert(tool.builtin===undefined||base&&tool.kind==='ink','INVALID_TEMPLATE','Unknown base pen.');if(base&&Toolbar.tools(set).find(t=>t.id===base.id)?.deletedAt)await request(store,state,set,'study.tool.remove',{toolId:base.id,restore:true});await request(store,state,set,'study.tool.save',{...(base?{toolId:base.id}:{}),kind:tool.kind,title:tool.title,settings:shape(tool.settings)});}}
  if(x.menuSettings)await request(store,state,set,'study.menu.set',shape(x.menuSettings));
  return;
 }
 S.fail('METHOD_NOT_FOUND','Unknown tool operation.');
}
async function exportTemplate(store,p){
 return store.transaction(async(state,rollback)=>{
  const set=M.findSet(state,p.setId);if(p.expectedRevision!==undefined)M.revision(set,p.expectedRevision);
  const capture=value=>{const {parentId,deckId,...safe}=value||{};return safe;};
  const settings={appearance:set.appearance||{},map:{layout:set.map?.layout||'tree',...(set.map?.branchStyle?{branchStyle:set.map.branchStyle}:{})},inkSettings:set.inkSettings||{},inkBinding:set.inkBinding||{},captureSettings:capture(set.captureSettings),...(set.palette?{palette:set.palette}:{}),tools:Toolbar.tools(set).filter(t=>!t.deletedAt).map(t=>({... (t.builtin?{builtin:t.builtin}:{}),kind:t.kind,title:t.title,settings:t.kind==='capture'?capture(t.settings):t.settings})),...(set.menuSettings?{menuSettings:set.menuSettings}:{})};
  const rel=S.relative(p.path);S.assert(rel.endsWith('.json'),'INVALID_PARAMS','Save the style template as JSON.');const file=await S.safePath(store.workspace,rel);await require('./files.cjs').parentExists(store.workspace,rel);const bytes=JSON.stringify({schema:'margin-reader.style/v1',title:set.title,settings},null,2);S.assert(Buffer.byteLength(bytes)<=128*1024,'TOO_LARGE','Style template is too large.');await S.writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));return {path:rel,bytes:Buffer.byteLength(bytes),tools:settings.tools.length};
 });
}
function fonts(){const {GlobalFonts}=require('@napi-rs/canvas');let families=GlobalFonts.families;try{if(Buffer.isBuffer(families))families=JSON.parse(families.toString());}catch{families=[];}
 return {fonts:[...new Set((Array.isArray(families)?families:[]).map(f=>f.family).filter(n=>typeof n==='string'&&n.length<=100))].sort()};}
module.exports={methods,request,exportTemplate,fonts,MENU,palette};
