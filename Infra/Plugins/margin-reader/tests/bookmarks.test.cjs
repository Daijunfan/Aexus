'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
test('bookmarks validate locators, preserve originals, survive rename/reparse, and remove recoverably',async t=>{
 const f=await setup(t);await f.api('fs.write',{path:'book.md',content:'# One\n\nFirst\n\n# Two\n\nSecond'});let doc=await f.api('document.open',{path:'book.md'});const bytes=await fs.readFile(path.join(f.workspace,'book.md'));
 await f.error('bookmark.add',{id:doc.id,expectedRevision:doc.revision,title:'Invalid',locator:{section:999}},'INVALID_LOCATOR');
 let data=await f.api('bookmark.add',{id:doc.id,expectedRevision:doc.revision,title:'Remember',locator:{section:0}});const id=data.bookmarks[0].id;
 await f.error('bookmark.update',{id:doc.id,expectedRevision:doc.revision,bookmarkId:id,title:'Stale'},'CONFLICT');
 await f.api('fs.move',{path:'book.md',target:'renamed.md'});doc=await f.api('document.open',{path:'renamed.md',refresh:true});data=await f.api('bookmark.list',{id:doc.id});assert.equal(data.bookmarks[0].unresolved,false);assert.deepEqual(await fs.readFile(path.join(f.workspace,'renamed.md')),bytes);
 data=await f.api('bookmark.update',{id:doc.id,expectedRevision:data.revision,bookmarkId:id,deleted:true});assert.equal(data.bookmarks.length,0);
 data=await f.api('bookmark.list',{id:doc.id,includeTrashed:true});assert(data.bookmarks[0].deletedAt);data=await f.api('bookmark.update',{id:doc.id,expectedRevision:data.revision,bookmarkId:id,deleted:false,title:'Restored'});assert.equal(data.bookmarks[0].title,'Restored');
 await fs.writeFile(path.join(f.workspace,'renamed.md'),'# Changed\n\nChanged content');assert.equal((await f.api('bookmark.list',{id:doc.id})).sourceChanged,true);await f.api('document.open',{path:'renamed.md'});assert.equal((await f.api('bookmark.list',{id:doc.id})).bookmarks[0].unresolved,true);
});
