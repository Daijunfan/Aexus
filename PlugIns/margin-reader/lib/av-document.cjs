'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createNativeProcess}=require('./native-process.cjs');
const {assert,safePath,readBounded,version}=require('./safety.cjs');
const FORMATS=['mov','mp4','m4v','mp3','m4a','wav','ogg','webm'];
const MIME={mov:'video/quicktime',mp4:'video/mp4',m4v:'video/mp4',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',webm:'video/webm'};
// The media demuxer may only open its input pipe, never network; MOV external data references remain disabled.
function binary(name){const fsSync=require('node:fs');for(const directory of [...(process.env.PATH||'').split(path.delimiter),'/opt/homebrew/bin','/usr/local/bin']){if(!directory)continue;const file=path.join(directory,process.platform==='win32'?name+'.exe':name);try{fsSync.accessSync(file,fsSync.constants.X_OK);return file;}catch{}}return name;}
function available(){return binary('ffprobe')!=='ffprobe'&&binary('ffmpeg')!=='ffmpeg';}
const INPUT=['-protocol_whitelist','file,pipe','-format_whitelist','mov,mp3,wav,ogg,matroska,webm'];
async function probe(bytes,filename,resourceDir){
 const native=createNativeProcess(),input=path.join(resourceDir,'media-input'+path.extname(filename));await fs.chmod(resourceDir,0o700);await fs.writeFile(input,bytes,{flag:'wx',mode:0o600});
 try{
  const result=await native.run(binary('ffprobe'),['-v','error',...INPUT,'-show_entries','format=duration:format_tags=title:stream=codec_type,codec_name,width,height,duration:chapter=start_time,end_time:chapter_tags=title','-of','json','-i',input],{timeout:30000,maxOutput:1024*1024});
  const data=JSON.parse(result.stdout),video=data.streams?.find(s=>s.codec_type==='video'),audio=data.streams?.find(s=>s.codec_type==='audio');
  const duration=Number(data.format?.duration||video?.duration||audio?.duration);
  assert((video||audio)&&Number.isFinite(duration)&&duration>0,'INVALID_MEDIA','The media has no finite playable duration.');
  const title=String(data.format?.tags?.title||path.basename(filename,path.extname(filename))).slice(0,200);
  const toc=(data.chapters||[]).filter(c=>Number(c.start_time)<duration).map((c,i)=>({id:'original-'+(i+1),parentId:null,title:String(c.tags?.title||`Chapter ${i+1}`).slice(0,500),locator:{section:0,time:Number(c.start_time)},source:'original'}));
  return {title,kind:'media',media:{type:video?'video':'audio',duration,...(video?{width:Number(video.width),height:Number(video.height),videoCodec:video.codec_name}:{}),...(audio?{audioCodec:audio.codec_name}:{})},sections:[{title,text:title,html:'',anchors:[],blocks:[{text:title,anchor:null}]}],toc,warnings:[]};
 }finally{await native.close();}
}
function createAV(store,media){
 const native=createNativeProcess();let closed=false;
 async function info(p){
  const D=require('./documents.cjs'),state=await store.load(),doc=D.findDocument(state,p.id),parsed=await D.parsedDocument(store,doc);
  assert(doc.kind==='media','INVALID_PARAMS','Choose a local audio/video document.');
  return {id:doc.id,sourceVersion:doc.sourceVersion,media:parsed.media,position:doc.position};
 }
 async function excerpt(p){
  const D=require('./documents.cjs'),M=require('./study-model.cjs'),state=await store.load(),set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);
  assert(p.text===undefined||p.text.length<=20000,'INVALID_PARAMS','Note exceeds 20000 characters.');if(p.title!==undefined)M.title(p.title);M.color(p.color||'yellow');
  assert(set.documentIds.includes(p.documentId),'NOT_MEMBER','Add the audio/video document to this study.');
  const doc=D.findDocument(state,p.documentId),parsed=await D.parsedDocument(store,doc);
  assert(doc.kind==='media'&&doc.sourceVersion===p.expectedSourceVersion,'SOURCE_CHANGED','Select the unchanged media source.');
  const end=p.end??p.start;require('./outline.cjs').validateLocator({time:p.start,endTime:end},parsed);
  assert(p.start<parsed.media.duration&&end-p.start<=600,'INVALID_LOCATOR','Select a media interval of up to ten minutes.');
  const notebooks=require('./study-notebooks.cjs'),notebook=notebooks.active(set,doc.id);notebooks.editable(set,{documentId:doc.id,notebookId:notebook.id});
  const source=await safePath(store.workspace,doc.path),directory=await store.mkdir(`cache/av-${randomUUID()}`),frame=path.join(directory,'frame.png');
  try{
   await fs.chmod(directory,0o700);
   // A scoped copy removes extension-based playlist guessing and external file references.
   const input=path.join(directory,'source'+path.extname(doc.path));await fs.writeFile(input,await readBounded(source),{flag:'wx',mode:0o600});
   const duration=String(Math.max(.05,end-p.start||1));
   const args=['-v','error','-nostdin',...INPUT,'-ss',String(p.start),'-t',duration,'-i',input];
   if(parsed.media.type==='video')args.push('-map','0:v:0','-vf','scale=1280:720:force_original_aspect_ratio=decrease','-frames:v','1');
   else args.push('-filter_complex','[0:a:0]aformat=channel_layouts=mono,showwavespic=s=1200x240:colors=0x4b91ed[v]','-map','[v]','-frames:v','1');
   args.push('-f','image2','-c:v','png',frame);
   await native.run(binary('ffmpeg'),args,{timeout:60000,maxOutput:65536});
   const bytes=await readBounded(frame,8*1024*1024);
   const prepared=await media.prepare({setId:set.id,expectedRevision:p.expectedRevision,kind:'image',contentBase64:bytes.toString('base64')});
   await store.transaction(async(fresh,rollback)=>{
    assert(!closed,'RUNTIME_CLOSED','Reader closed during media capture.');
    const current=M.findSet(fresh,set.id);M.revision(current,p.expectedRevision);const original=D.findDocument(fresh,doc.id);
    assert(original.sourceVersion===p.expectedSourceVersion&&!(await D.sourceStatus(store,original)).changed,'SOURCE_CHANGED','Media changed during capture; nothing was saved.');
    require('./study-history.cjs').checkpoint(current);
    await media.apply(fresh,current,{title:p.title||`${doc.title} · ${p.start.toFixed(1)}s`,text:p.text||'',anchor:{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,locator:{time:p.start,endTime:end},display:'margin'}},prepared,rollback);
    const card=M.card(current,current.lastMedia.cardId);card.text=p.text||'';card.color=M.color(p.color||'yellow');card.mediaRange={start:p.start,end};card.anchor.notebookId=notebook.id;
    M.touch(current);
   });
   const updated=await store.load();return M.describe(store,updated,M.findSet(updated,set.id));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
 }
 return {info,excerpt,async close(){closed=true;await native.close();}};
}
module.exports={FORMATS,MIME,probe,createAV,binary,available};
