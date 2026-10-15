// Verified snapshots of station file metadata; delivery stages each attachment
// onto the selected work host using the existing checked file-transfer path.
const station=require('./station.cjs');
const path=require('node:path');
const MAX_COUNT=8,MAX_BYTES=50*1024*1024;
function capture(ids=[]){
 if(!Array.isArray(ids)||ids.length>MAX_COUNT||new Set(ids).size!==ids.length)throw Error('Select up to eight distinct Station files');
 return ids.map(id=>{
  if(typeof id!=='string'||!/^[\w-]{8,128}$/.test(id))throw Error('Invalid Station attachment ID');
  const item=station.get(id);
  if(item.type!=='file'||!Number.isSafeInteger(item.bytes)||item.bytes>MAX_BYTES||!item.sha256)throw Error('Attachments must be regular Station files at most 50 MiB');
  return {stationId:id,name:item.name,bytes:item.bytes,sha256:item.sha256};
 });
}
function stillSame(item){
 const existing=station.get(item.stationId);
 if(existing.type!=='file'||existing.bytes!==item.bytes||existing.sha256!==item.sha256)
  throw Error('Attached file changed or was deleted after posting: '+item.name);
}
const safeName=name=>name.normalize('NFC').replace(/[^A-Za-z0-9._-]/g,'_').slice(-78)||'attachment';
async function stage(message,role){
 const found=message.attachments||[];
 if(!found.length)return [];
 if(!role.cwd||!role.targetHostId)throw Error('Target Agent has no verified work directory');
 const files=[];
 for(let i=0;i<found.length;i++){
  const item=found[i];stillSame(item);
  const filename='cloudhosts_'+message.id.slice(-12).replaceAll('-','')+'_'+role.id.slice(0,8)+'_'+(i+1)+'_'+safeName(item.name);
  const job=station.sendFile(item.stationId,role.targetHostId,role.cwd,filename);
  const deadline=Date.now()+120000;
  let result=job;
  while(result.state==='running'){
   if(Date.now()>deadline)throw Error('Attachment transfer timed out; verify remote state before retry');
   await new Promise(resolve=>setTimeout(resolve,180));
   result=station.list().jobs.find(row=>row.id===job.id);
   if(!result)throw Error('Attachment transfer receipt missing');
  }
  if(result.state!=='done')throw Error('Attachment transfer failed: '+(result.error||'unknown'));
  if(result.result?.sha256!==item.sha256)throw Error('Attachment transfer checksum mismatch');
  files.push({name:item.name,hostId:role.targetHostId,
   path:role.cwd+(role.cwd.includes('\\')?'\\':'/')+filename,bytes:item.bytes,sha256:item.sha256});
 }
 return files;
}
module.exports={capture,stage};
