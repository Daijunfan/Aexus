'use strict';
const assert=require('node:assert/strict');
exports.exercise=async({api,deny})=>{
 let library=await api('study.library.get');const initial=library.revision;
 library=await api('study.folder.create',{expectedRevision:library.revision,title:'Employee study folder'});const folderId=library.folders.find(f=>f.title==='Employee study folder').id;
 const study=await api('study.create',{mapMode:'cards',title:'Folder scoped study',folderId});library=await api('study.library.get');assert.equal(library.sets.find(s=>s.id===study.id).folderId,folderId);
 library=await api('study.folder.update',{expectedRevision:library.revision,folderId,title:'Employee organized studies'});
 await deny('study.folder.create',{expectedRevision:initial,title:'Stale folder'},'CONFLICT');
 await deny('study.folder.remove',{expectedRevision:library.revision,folderId},'NOT_EMPTY');
 library=await api('study.library.move',{expectedRevision:library.revision,setIds:[study.id],folderId:null});assert.equal(library.sets.find(s=>s.id===study.id).folderId,null);
 library=await api('study.folder.remove',{expectedRevision:library.revision,folderId});assert(library.folders.find(f=>f.id===folderId).deletedAt);
 library=await api('study.folder.restore',{expectedRevision:library.revision,folderId,parentId:null});assert(!library.folders.find(f=>f.id===folderId).deletedAt);
 const before=await api('settings.get');await api('settings.set',{homeSection:'studies',studyFolder:folderId,studyLibraryView:'list',studyDocumentsView:'list',pdfTurnEffect:'none'});
 const settings=await api('settings.get');assert.equal(settings.studyFolder,folderId);assert.equal(settings.pdfTurnEffect,'none');assert.equal(settings.studyLibraryView,'list');
 await api('settings.set',{homeSection:before.homeSection,studyFolder:before.studyFolder,studyLibraryView:before.studyLibraryView,studyDocumentsView:before.studyDocumentsView,pdfTurnEffect:before.pdfTurnEffect});
 assert.equal((await api('study.get',{setId:study.id})).revision,study.revision);
 console.log('PASS Employee study-folder tree, rename, move, recoverable empty-folder deletion, restore and page/collection preferences use the same public scoped APIs');
};
