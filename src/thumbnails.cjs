const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const station=require('./station.cjs');
const inflight=new Map(),waiting=[];let active=0;
async function thumbnail(id){
 const item=station.get(id);if(item.type==='folder')return null;
 const key=item.id+'-'+(item.sha256||item.modifiedAt),cache=path.join(station.root,'thumbnails'),output=path.join(cache,key+'.png');
 if(fs.existsSync(output))return output;if(inflight.has(key))return inflight.get(key);
 const pending=(async()=>{
  if(active>=2)await new Promise(resolve=>waiting.push(resolve));else active++;
  const work=path.join(cache,'.'+key);fs.mkdirSync(work,{recursive:true,mode:0o700});
  try{await promisify(execFile)('/usr/bin/qlmanage',['-t','-s','384','-o',work,station.file(id)],{timeout:20000});const image=fs.readdirSync(work).find(name=>name.endsWith('.png'));if(!image)return null;fs.renameSync(path.join(work,image),output);return output;}
  catch{return null;}
  finally{fs.rmSync(work,{recursive:true,force:true});const next=waiting.shift();if(next)next();else active--;}
 })();inflight.set(key,pending);try{return await pending;}finally{inflight.delete(key);}
}
module.exports={thumbnail};
