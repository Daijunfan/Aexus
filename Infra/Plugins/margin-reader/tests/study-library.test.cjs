'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');const {createPlugin}=require('../runtime.cjs');
test('study folders are read-only additive defaults; create, nest, rename, move and restart retain identities',async t=>{
 const f=await setup(t);await f.api('fs.write',{path:'original.md',content:'Original'});const file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);
 assert.deepEqual(await f.api('study.library.get'),{revision:0,folders:[],sets:[]});assert.deepEqual(await fs.readFile(file),before);
 let l=await f.api('study.folder.create',{expectedRevision:0,title:'Research'}),parent=l.folders[0].id;
 l=await f.api('study.folder.create',{expectedRevision:l.revision,title:'主题',parentId:parent});const child=l.folders.at(-1).id;
 let s=await f.api('study.create',{title:'Reading',folderId:child});s=await f.api('study.note.create',{setId:s.id,expectedRevision:s.revision,title:'Keep ID',text:'Never copied'});const snapshot=structuredClone(s);
 l=await f.api('study.library.get');assert.equal(l.sets[0].folderId,child);
 l=await f.api('study.folder.update',{expectedRevision:l.revision,folderId:parent,title:'Renamed'});
 l=await f.api('study.library.move',{expectedRevision:l.revision,setIds:[s.id],folderId:parent});assert.equal(l.sets[0].folderId,parent);
 assert.deepEqual(await f.api('study.get',{setId:s.id}),snapshot);assert.equal(await fs.readFile(path.join(f.workspace,'original.md'),'utf8'),'Original');
 const other=await createPlugin({workspace:f.workspace});t.after(()=>other.close());const r=await other.request({jsonrpc:'2.0',id:1,method:'study.library.get',params:{}});assert.deepEqual(r.result,l);
});
test('folder conflicts, cycles, duplicate names and invalid targets fail atomically without deleting studies',async t=>{
 const f=await setup(t);let l=await f.api('study.folder.create',{expectedRevision:0,title:'A'});const a=l.folders[0].id;
 l=await f.api('study.folder.create',{expectedRevision:l.revision,title:'B',parentId:a});const b=l.folders.at(-1).id,s=await f.api('study.create',{title:'Keep',folderId:b});l=await f.api('study.library.get');
 const file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);
 await f.error('study.folder.update',{expectedRevision:l.revision,folderId:a,parentId:b},'INVALID_HIERARCHY');
 await f.error('study.folder.create',{expectedRevision:l.revision,title:'a'},'ALREADY_EXISTS');
 await f.error('study.folder.remove',{expectedRevision:l.revision,folderId:a},'NOT_EMPTY');
 await f.error('study.folder.remove',{expectedRevision:l.revision,folderId:b},'NOT_EMPTY');
 await f.error('study.library.move',{expectedRevision:l.revision,setIds:[s.id,'__proto__'],folderId:a},'NOT_FOUND');
 await f.error('study.folder.create',{expectedRevision:0,title:'Stale'},'CONFLICT');
 for(const title of ['../bad','a/b','x\\y','.','..','\u0000'])await f.error('study.folder.create',{expectedRevision:l.revision,title},'INVALID_PARAMS');
 await f.error('study.library.move',{expectedRevision:l.revision,setIds:[s.id],folderId:'../outside'},'INVALID_PARAMS');
 assert.deepEqual(await fs.readFile(file),before);
});
test('empty folder trash and restore retain study contents and library navigation remains valid',async t=>{
 const f=await setup(t);let l=await f.api('study.folder.create',{expectedRevision:0,title:'Folder'});const folderId=l.folders[0].id;
 const s=await f.api('study.create',{title:'Study',folderId});l=await f.api('study.library.get');
 await f.api('settings.set',{homeSection:'studies',studyFolder:folderId,studyLibraryView:'list',studyDocumentsView:'list',pdfTurnEffect:'book'});
 l=await f.api('study.library.move',{expectedRevision:l.revision,setIds:[s.id],folderId:null});l=await f.api('study.folder.remove',{expectedRevision:l.revision,folderId});assert(l.folders[0].deletedAt);assert.equal((await f.api('settings.get')).studyFolder,null);
 await f.error('settings.set',{studyFolder:folderId},'NOT_FOUND');
 l=await f.api('study.folder.restore',{expectedRevision:l.revision,folderId,parentId:null});assert(!l.folders[0].deletedAt);assert.equal(l.sets[0].folderId,null);assert.equal((await f.api('study.get',{setId:s.id})).id,s.id);
});
test('complete encrypted backup preserves study folders but portable studies import at the root',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());let l=await f.api('study.folder.create',{expectedRevision:0,title:'Reading'});const folderId=l.folders[0].id;
 let s=await f.api('study.create',{title:'Book',folderId});s=await f.api('study.documents.add',{setId:s.id,expectedRevision:s.revision,paths:['book.pdf']});
 l=await f.api('study.library.get');await f.api('library.backup.create',{path:'library.mrbackup',format:'segmented',password:'test local folders'});await f.api('library.backup.restore',{path:'library.mrbackup',folder:'Restored',password:'test local folders'});
 const restored=await createPlugin({workspace:path.join(f.workspace,'Restored')});t.after(()=>restored.close());const r=await restored.request({jsonrpc:'2.0',id:1,method:'study.library.get',params:{}});assert.deepEqual(r.result,l);
 await f.api('study.package.export',{setId:s.id,path:'study.mrpkg'});const imported=await f.api('study.package.import',{path:'study.mrpkg',folder:'Imported',activate:false});
 const index=await f.api('study.library.get');assert.equal(index.sets.find(v=>v.id===imported.setId).folderId,null);assert.equal(index.sets.find(v=>v.id===s.id).folderId,folderId);
});
