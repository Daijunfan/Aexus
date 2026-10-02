'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {assert,decodeBase64,digest,readBounded,writeNew,cleanName}=require('./safety.cjs');
const {createWorkerJobs}=require('./worker-jobs.cjs');
const M=require('./study-model.cjs');
function audioType(bytes,mime){
  const types={
    'audio/wav':()=>bytes.length>=44&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE',
    'audio/mpeg':()=>bytes.length>=4&&(bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224),
    'audio/mp4':()=>bytes.length>=16&&bytes.toString('ascii',4,8)==='ftyp',
    'audio/ogg':()=>bytes.length>=28&&bytes.toString('ascii',0,4)==='OggS',
    'audio/webm':()=>bytes.length>=8&&bytes.readUInt32BE(0)===0x1a45dfa3
  };
  assert(Object.hasOwn(types,mime)&&types[mime](),'INVALID_MEDIA','Choose a WAV, MP3, M4A, Ogg or WebM audio file with matching content.');
  return {'audio/wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg','audio/webm':'webm'}[mime];
}
function mediaInfo(set,id){const value=set.mediaAssets&&Object.hasOwn(set.mediaAssets,id)?set.mediaAssets[id]:null;assert(value,'NOT_FOUND','The media attachment is not in this study set.');return value;}
async function readMedia(store,setId,id){
  const set=M.findSet(await store.load(),setId),media=mediaInfo(set,id),bytes=await readBounded(await store.meta(`study-media/${set.id}/${media.id}.${media.extension}`),16*1024*1024);
  assert(digest(bytes)===media.sha256,'ASSET_CORRUPT','The stored attachment changed or is damaged. Restore it from backup.');
  return {bytes,mimeType:media.mimeType,metadata:media};
}
function asset(setId,media){return `study-media/${setId}/${media.id}.${media.extension}`;}
function describeCard(set,card){
  const attach=id=>{const m=set.mediaAssets?.[id];return m?{...m,asset:asset(set.id,m)}:null;};
  const media=card.mediaId?attach(card.mediaId):null;
  const comments=(card.comments||[]).filter(c=>!c.deletedAt).map(c=>({...c,media:c.mediaId?attach(c.mediaId):null}));
  return {...card,comments,media,...(media?.kind==='image'?{image:{...card.image,width:media.width,height:media.height,mimeType:media.mimeType},imageAsset:media.asset}:{})};
}
function text(value){assert(typeof value==='string'&&value.length<=20000,'INVALID_PARAMS','Comment text must contain at most 20000 characters.');return value;}
function findComment(card,id){const c=card.comments?.find(c=>c.id===id);assert(c,'NOT_FOUND','Comment does not exist on this card.');return c;}
function comments(set,method,p){
  const card=M.card(set,p.cardId);card.comments??=[];
  if(p.reviewSide!==undefined)assert(['front','back','both'].includes(p.reviewSide),'INVALID_PARAMS','Invalid comment side.');
  if(method==='study.comment.add'){
    assert(card.comments.filter(c=>!c.deletedAt).length<500,'TOO_LARGE','Card comment capacity reached.');
    const value=text(p.text||'');assert(value.trim()||p.mediaId,'INVALID_PARAMS','Add text or an attachment.');if(p.mediaId)mediaInfo(set,p.mediaId);
    const now=new Date().toISOString();card.comments.push({id:randomUUID(),text:value,...(p.reviewSide?{reviewSide:p.reviewSide}:{}),...(p.mediaId?{mediaId:p.mediaId}:{}),createdAt:now,updatedAt:now});
  }else{
    const comment=findComment(card,p.commentId);
    if(method==='study.comment.update'){
      assert(p.text!==undefined||p.deleted!==undefined||p.reviewSide!==undefined,'INVALID_PARAMS','Supply text or deleted.');
      if(p.reviewSide!==undefined)comment.reviewSide=p.reviewSide;if(p.text!==undefined)comment.text=text(p.text);if(p.deleted===true)comment.deletedAt=new Date().toISOString();if(p.deleted===false)delete comment.deletedAt;comment.updatedAt=new Date().toISOString();
    }else if(method==='study.comment.move'){
      const active=card.comments.filter(c=>!c.deletedAt&&c.id!==comment.id);assert(!comment.deletedAt&&p.index<=active.length,'INVALID_PARAMS','Comment insertion index is out of range.');
      const before=active[p.index],rest=card.comments.filter(c=>c.id!==comment.id);rest.splice(before?rest.indexOf(before):rest.length,0,comment);card.comments=rest;
    }
  }
  card.updatedAt=new Date().toISOString();
}
function createMedia(store){
  const jobs=createWorkerJobs(path.join(__dirname,'media-worker.cjs'),{timeout:30000,memory:256});
  async function prepare(p){
    const set=M.findSet(await store.load(),p.setId);M.revision(set,p.expectedRevision);if(p.cardId)M.card(set,p.cardId);if(p.text!==undefined)text(p.text);
    const bytes=decodeBase64(p.contentBase64,p.kind==='image'?8*1024*1024:16*1024*1024);
    assert(bytes.length>0,'INVALID_MEDIA','The attachment is empty.');
    if(p.kind==='image'){
      const result=await jobs.run({operation:'normalize',bytes});return {...result,bytes:Buffer.from(result.bytes),extension:'png',kind:'image'};
    }
    const mime=(p.mimeType||'').split(';')[0].trim(),extension=audioType(bytes,mime);return {bytes,mimeType:mime,extension,kind:'audio'};
  }
  async function apply(state,set,p,prepared,rollback,imageMappings){
    assert(!jobs.closed,'RUNTIME_CLOSED','Reader closed before saving the attachment.');
    set.mediaAssets??={};assert(Object.keys(set.mediaAssets).length<5000,'TOO_LARGE','This study contains too many media assets.');
    const id=randomUUID(),now=new Date().toISOString(),media={id,kind:prepared.kind,mimeType:prepared.mimeType,extension:prepared.extension,
      name:cleanName(p.name||p.title||'Attachment'),bytes:prepared.bytes.length,sha256:digest(prepared.bytes),createdAt:now,
      ...(prepared.width?{width:prepared.width,height:prepared.height}:{})};
    await store.mkdir(`study-media/${set.id}`);const file=await store.meta(`study-media/${set.id}/${id}.${media.extension}`);
    await writeNew(file,prepared.bytes);rollback(()=>fs.rm(file,{force:true}));set.mediaAssets[id]=media;
    const card=p.cardId?M.card(set,p.cardId):require('./study-advanced.cjs').note(set,p.title||media.name);
    let imageMarks;
    if(p.target==='comment'||prepared.kind==='audio'){
      card.comments??=[];assert(card.comments.length<500,'TOO_LARGE','Card comment capacity reached.');card.comments.push({id:randomUUID(),text:p.text||'',...(p.reviewSide?{reviewSide:p.reviewSide}:{}),mediaId:id,createdAt:now,updatedAt:now});
    }else{
      assert(!card.source,'INVALID_PARAMS','An excerpt image is immutable; attach a comment image or create an image card.');
      if(card.image)imageMarks=require('./image-marks.cjs').remap(card,set,imageMappings||[]);
      card.mediaId=id;card.image={kind:'attached-image',mimeType:media.mimeType,width:media.width,height:media.height};
    }
    if(p.anchor){
      const anchor=p.anchor;assert(anchor&&typeof anchor==='object'&&!Array.isArray(anchor)&&Object.keys(anchor).every(k=>['documentId','expectedSourceVersion','locator','display','height','rect','layerId'].includes(k)),'INVALID_PARAMS','Invalid attachment source anchor.');
      assert(typeof anchor.documentId==='string'&&typeof anchor.expectedSourceVersion==='string','INVALID_PARAMS','An attachment anchor requires document and source version.');
      assert(anchor.display===undefined||['margin','embedded','collapsed','overlay'].includes(anchor.display),'INVALID_PARAMS','Unsupported attachment display.');
      await require('./study-advanced.cjs').request(store,state,set,'study.note.anchor',{cardId:card.id,...anchor});
    }
    card.updatedAt=now;set.lastMedia={cardId:card.id,mediaId:id,...(imageMarks?{imageMarks}:{})};
  }
  async function transform(state,set,p,rollback){
    const card=M.card(set,p.cardId);assert(card.mediaId,'INVALID_PARAMS','Transform an attached image card; original excerpt snapshots are preserved.');
    const media=mediaInfo(set,card.mediaId);assert(media.kind==='image','INVALID_PARAMS','An audio attachment cannot be cropped.');
    const old=await readMedia(store,set.id,media.id),result=await jobs.run({operation:'transform',bytes:old.bytes,crop:p.crop,rotation:p.rotation||0});
    await apply(state,set,{cardId:card.id,name:media.name}, {...result,bytes:Buffer.from(result.bytes),kind:'image',extension:'png'},rollback,[{from:p.crop||require('./image-marks.cjs').unit,rotation:p.rotation||0}]);
  }
  return {prepare,apply,transform,combine:parts=>jobs.run({operation:'combine',parts}),close:()=>jobs.close(),get closed(){return jobs.closed;}};
}
async function cloneAssets(store,source,target,cards,rollback){
  const ids=new Set(cards.flatMap(c=>[c.mediaId,...(c.comments||[]).map(v=>v.mediaId)]).filter(Boolean));
  if(!ids.size)return;target.mediaAssets??={};await store.mkdir(`study-media/${target.id}`);
  for(const id of ids){const media=mediaInfo(source,id);if(target.mediaAssets[id]){assert(target.mediaAssets[id].sha256===media.sha256,'CONFLICT','Attachment identity collision.');continue;}
    const bytes=await readBounded(await store.meta(`study-media/${source.id}/${id}.${media.extension}`),16*1024*1024),file=await store.meta(`study-media/${target.id}/${id}.${media.extension}`);
    await writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));target.mediaAssets[id]={...media};
  }
}
module.exports={createMedia,readMedia,describeCard,comments,cloneAssets,mediaInfo,asset,audioType};
