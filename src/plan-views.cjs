// Saved Plan view projections of canonical CloudHosts Plan records.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const home=()=>require('./registry.cjs').home;
const layouts=['table','board','timeline','calendar','plan','list','gallery','chart','feed','form'];
const labels=['Table','Board','Timeline','Calendar','Planner','List','Gallery','Chart','Feed','Form'];
const builtin=layouts.map((layout,i)=>({id:layout,name:labels[i],layout,groupBy:'status',filter:{},sort:'nextAt',direction:'asc',revision:1,builtin:true}));
const file=()=>path.join(home(),'plan-views.json'),clone=value=>structuredClone(value);
const viewFields=['name','layout','groupBy','filter','sort','direction','options'];
function fields(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected an object');
 for(const key of Object.keys(value))if(!allowed.includes(key))throw Error('Unknown Plan view field: '+key);
}
function pick(value,choices,name){if(!choices.includes(value))throw Error('Invalid '+name);return value}
function viewSpec(value,actor='operator'){
 fields(value,viewFields);
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80)throw Error('View name must contain 1–80 characters');
 const filter=value.filter??{};fields(filter,['search','employee','team','channel','states','priorities','tags']);
 for(const name of ['search','employee','team','channel'])if(filter[name]!==undefined&&(typeof filter[name]!=='string'||filter[name].length>240))throw Error('Invalid '+name);
 for(const [name,choices] of [['states',['scheduled','running','paused','completed','attention','due']],['priorities',['low','normal','high','urgent']]]){
  if(filter[name]!==undefined&&(!Array.isArray(filter[name])||filter[name].some(row=>!choices.includes(row))))throw Error('Invalid '+name);
 }
 if(filter.tags!==undefined&&(!Array.isArray(filter.tags)||filter.tags.length>20||filter.tags.some(row=>typeof row!=='string'||!row.trim()||row.length>40)))throw Error('Invalid tags');
 const filtered={...filter};if(filtered.employee==='self'){
  if(actor?.kind!=='agent')throw Error('self requires an authenticated Agent');
  filtered.employee=actor.agentId;
 }
 const options=value.options;
 if(options!==undefined){
  fields(options,['timezone','timelineScale','plannerMode','chartMetric','chartGroupBy','chartType']);
  for(const [name,values] of Object.entries({timelineScale:['day','week','month'],plannerMode:['day','week','agenda'],
   chartMetric:['schedules','runs'],chartGroupBy:['status','employee','team','priority'],chartType:['bar','horizontal','line','donut']}))
   if(options[name]!==undefined)pick(options[name],values,name);
  if(options.timezone!==undefined){
   if(typeof options.timezone!=='string'||/^[+-]/.test(options.timezone))throw Error('Use an IANA timezone');
   new Intl.DateTimeFormat('en',{timeZone:options.timezone}).format(0);
  }
 }
 return {name:value.name.trim(),layout:pick(value.layout,layouts,'Plan layout'),
  groupBy:pick(value.groupBy??'status',['status','employee','priority'],'groupBy'),
  filter:filtered,sort:pick(value.sort??'nextAt',['nextAt','name','updatedAt','priority'],'sort'),
  direction:pick(value.direction??'asc',['asc','desc'],'direction'),
  ...(options===undefined?{}:{options:{...options}})};
}
function catalog(){
 const name=file();if(!fs.existsSync(name))return [];
 if(fs.lstatSync(name).isSymbolicLink())throw Error('Plan view store cannot be a symlink');
 const rows=JSON.parse(fs.readFileSync(name,'utf8'));
 if(!Array.isArray(rows)||rows.some(row=>typeof row.id!=='string'||!row.id.startsWith('pv_')||
  !Number.isInteger(row.revision)||!row.owner||!layouts.includes(row.layout)))throw Error('Invalid saved Plan views');
 return rows;
}
function save(rows){
 fs.mkdirSync(home(),{recursive:true,mode:0o700});
 const name=file(),tmp=name+'.'+process.pid+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(rows,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,name)}
 finally{fs.rmSync(tmp,{force:true})}
 require('./core-events.cjs').publish('plan-change');
}
function owner(actor){
 if(actor==='operator')return {kind:'operator'};
 if(actor?.kind==='agent'&&actor.agentId)return {kind:'agent',agentId:actor.agentId};
 throw Error('Invalid Plan view principal');
}
function owns(row,actor){
 if(actor==='operator')return true;
 return actor?.kind==='agent'&&(actor.role==='administrator'||
  row.owner.kind==='agent'&&row.owner.agentId===actor.agentId);
}
function list(_args={},actor='operator'){return clone([...builtin,...catalog().filter(row=>owns(row,actor))])}
function create({spec:value}={},actor='operator'){
 const made={...viewSpec(value,actor),id:'pv_'+randomUUID(),owner:owner(actor),revision:1};
 save([...catalog(),made]);return clone(made);
}
function mutate({id,patch,expectedRevision}={},actor='operator',remove=false){
 if(typeof id!=='string'||!id.startsWith('pv_'))throw Error('Built-in Plan views cannot be modified');
 const all=catalog(),at=all.findIndex(view=>view.id===id),current=all[at];
 if(!current||!owns(current,actor))throw Error('Unknown or unauthorized saved Plan view');
 if(expectedRevision!==undefined&&(!Number.isInteger(expectedRevision)||expectedRevision<1||expectedRevision!==current.revision))
  throw Error('Plan view changed; reload before saving');
 if(remove){all.splice(at,1);save(all);return {deleted:true,id}}
 fields(patch,viewFields);
 const merged=Object.fromEntries(viewFields.filter(field=>current[field]!==undefined).map(field=>[field,current[field]]));
 const next={...viewSpec({...merged,...patch},actor),id:current.id,owner:current.owner,revision:current.revision+1};
 all[at]=next;save(all);return clone(next);
}
const update=(args,actor='operator')=>mutate(args,actor);
const remove=(args,actor='operator')=>mutate(args,actor,true);
module.exports={layouts,builtin,viewSpec,list,create,update,remove};
