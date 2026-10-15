// Workspace is a stable (host, absolute directory) identity. Projects are
// saved selections of those identities, never roles or execution permissions.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const registry=require('./registry.cjs'),hosts=require('./agent-hosts.cjs');
const file=()=>path.join(registry.home,'workspaces.json');
const clone=value=>structuredClone(value);
function read(){
 if(!fs.existsSync(file()))return {version:1,entries:[],projects:[]};
 if(fs.lstatSync(file()).isSymbolicLink())throw Error('Workspace catalog cannot be a symlink');
 const data=JSON.parse(fs.readFileSync(file(),'utf8'));
 if(data.version!==1||!Array.isArray(data.entries)||!Array.isArray(data.projects))throw Error('Invalid Workspace catalog');
 return data;
}
function save(data){
 fs.mkdirSync(registry.home,{recursive:true,mode:0o700});
 const tmp=file()+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file())}
 finally{fs.rmSync(tmp,{force:true})}
}
function identity(hostId,directory){
 const host=hosts.get(hostId),absolute=hosts.directory(host,directory);
 const cwd=host.os==='windows'?path.win32.normalize(absolute):path.posix.normalize(absolute);
 const normalized=host.os==='windows'?cwd.toLocaleLowerCase('en-US'):cwd;
 const id='wk_'+createHash('sha256').update(host.id+'\0'+normalized).digest('hex').slice(0,24);
 return {id,hostId:host.id,directory:cwd};
}
function all(){
 const data=read(),sessions=require('./agent-sessions.cjs').sessions();
 const listed=new Map(data.entries.map(entry=>[entry.id,{...entry,sessionIds:[]}]));
 for(const session of sessions){
  if(!session.targetHostId||!session.cwd)continue;
  let item;
  try{item=identity(session.targetHostId,session.cwd)}catch{continue}
  if(!listed.has(item.id))listed.set(item.id,{...item,name:session.targetHost?.name||'Work directory',sessionIds:[],pinned:false});
  listed.get(item.id).sessionIds.push(session.id);
 }
 return [...listed.values()].map(item=>({...item,sessionCount:item.sessionIds.length}));
}
function list(){return clone(all())}
function get({id}){const item=all().find(item=>item.id===id);if(!item)throw Error('Unknown work directory');return clone(item)}
function register({hostId,directory,name}){
 const value=identity(hostId,directory),data=read(),existing=data.entries.find(entry=>entry.id===value.id);
 if(name!==undefined&&(typeof name!=='string'||!name.trim()||name.length>100))throw Error('Workspace name must be 1–100 characters');
 if(existing){if(name!==undefined){existing.name=name.trim();save(data)}return get({id:value.id})}
 data.entries.push({...value,name:name?.trim()||(hosts.get(hostId).os==='windows'?path.win32.basename(value.directory):path.posix.basename(value.directory)),pinned:true,createdAt:new Date().toISOString()});
 save(data);return get({id:value.id});
}
function unregister({id}){
 const data=read(),entry=data.entries.find(item=>item.id===id);
 if(!entry)throw Error('Workspace is not a saved directory');
 data.entries=data.entries.filter(item=>item.id!==id);
 // Removing a display bookmark never deletes files, projects or Agent roles.
 save(data);return {id,unregistered:true};
}
const projectName=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>100)throw Error('Project view name must be 1–100 characters');return name.trim()};
function members(ids){
 if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'))throw Error('Choose up to 200 Workspace IDs');
 const result=[...new Set(ids)],available=new Set(all().map(item=>item.id));
 for(const id of result)if(!available.has(id))throw Error('Unknown Workspace in view: '+id);
 return result;
}
function projects({includeArchived=false}={}){
 const data=read(),index=new Map(all().map(item=>[item.id,item]));
 return clone(data.projects.filter(row=>includeArchived||!row.archived).map(row=>({...row,
  workspaces:row.workspaceIds.map(id=>index.get(id)||{id,missing:true})})));
}
function project({id}){const item=projects({includeArchived:true}).find(p=>p.id===id);if(!item)throw Error('Unknown Project view');return item}
function createProject({name,workspaceIds=[]}={}){
 const data=read(),time=new Date().toISOString();
 const item={id:'sv_'+randomUUID(),name:projectName(name),workspaceIds:members(workspaceIds),revision:1,
  createdAt:time,updatedAt:time,archived:false};
 data.projects.push(item);save(data);return project({id:item.id});
}
function updateProject({id,name,workspaceIds,expectedRevision}){
 const data=read(),item=data.projects.find(row=>row.id===id&&!row.archived);
 if(!item)throw Error('Unknown or archived Project view');
 if(expectedRevision!==undefined&&expectedRevision!==item.revision)throw Error('Project view changed; reload before editing');
 if(name!==undefined)item.name=projectName(name);
 if(workspaceIds!==undefined)item.workspaceIds=members(workspaceIds);
 item.revision++;item.updatedAt=new Date().toISOString();save(data);return project({id});
}
function archiveProject({id,expectedRevision}){
 const data=read(),item=data.projects.find(row=>row.id===id&&!row.archived);
 if(!item)throw Error('Unknown Project view');
 if(expectedRevision!==undefined&&expectedRevision!==item.revision)throw Error('Project view changed; reload before archiving');
 item.archived=true;item.revision++;save(data);return {id,archived:true};
}
module.exports={identity,list,get,register,unregister,projects,project,createProject,updateProject,archiveProject};
