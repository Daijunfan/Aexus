'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
exports.exercise=async({api,deny})=>{
 const info=await api('system.info');
 if(!info.formats.find(f=>f.format==='webm')?.available){
  const text=await api('document.open',{path:'Books/guide.md'}),set=await api('study.create',{mapMode:'cards',title:'AV unavailable guard'});
  await deny('document.av.info',{id:text.id},'INVALID_PARAMS');
  await deny('study.av.excerpt',{setId:set.id,expectedRevision:set.revision,documentId:text.id,expectedSourceVersion:text.sourceVersion,start:0},'NOT_MEMBER');return;
 }
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mr-agent-av-fixture-'));
 try{require('./fixtures-av.cjs').make(temp);const bytes=await fs.readFile(path.join(temp,'lesson.webm'));
  const upload=await api('import.begin',{path:'Books/media.webm',totalBytes:bytes.length});await api('import.chunk',{uploadId:upload.uploadId,offset:0,contentBase64:bytes.toString('base64')});const doc=await api('import.finish',{uploadId:upload.uploadId,activate:false});
  assert.equal((await api('document.av.info',{id:doc.id})).media.type,'video');let set=await api('study.create',{mapMode:'cards',title:'Employee media study'});set=await api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['Books/media.webm']});
  set=await api('study.av.excerpt',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,start:1,end:2,title:'Employee video note'});assert.equal(set.cards[0].anchor.locator.endTime,2);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
};
