'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs'),S=require('../lib/safety.cjs');
const aliases=['.MARGIN-READER','.Margin-Reader','.AGENTS-COMPANY','.GiT','.git.','.agents-company ','.margin-reader::$DATA','.ＧＩＴ'];
test('protected metadata aliases are rejected consistently before filesystem access',async t=>{
 const f=await setup(t);await f.api('fs.write',{path:'safe.md',content:'Original document'});
 const file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);
 for(const name of aliases){
  assert.throws(()=>S.relative(name+'/state.json'),{code:'SCOPE_DENIED'});
  await f.error('fs.list',{path:name},'SCOPE_DENIED');
  await f.error('fs.write',{path:name+'/bypass.md',content:'Never written'},'SCOPE_DENIED');
  await f.error('import.begin',{path:name+'/import.md',totalBytes:5},'SCOPE_DENIED');
  await f.error('fs.copy',{path:'safe.md',target:name+'/copy.md'},'SCOPE_DENIED');
 }
 assert.deepEqual(await fs.readFile(file),before);assert.equal(await S.exists(path.join(f.workspace,'.margin-reader/bypass.md')),null);
 assert.equal(S.relative('Notes/.git-notes.md'),'Notes/.git-notes.md');assert.equal(S.relative('Notes/数据.md'),'Notes/数据.md');
});
test('folder listing hides case variants and recursive copy/move/trash cannot smuggle protected metadata',async t=>{
 const f=await setup(t),parent=path.join(f.workspace,'Parent');await fs.mkdir(path.join(parent,'.GiT'),{recursive:true});await fs.writeFile(path.join(parent,'.GiT/secret'),'Disposable metadata');await fs.writeFile(path.join(parent,'safe.md'),'Visible');
 const names=(await f.api('fs.list',{path:'Parent'})).entries.map(e=>e.name);assert.deepEqual(names,['safe.md']);
 for(const method of ['fs.copy','fs.move','fs.trash'])await f.error(method,{path:'Parent',...(method==='fs.trash'?{}:{target:'Destination'})},'SCOPE_DENIED');
 assert.equal(await fs.readFile(path.join(parent,'.GiT/secret'),'utf8'),'Disposable metadata');assert.equal(await S.exists(path.join(f.workspace,'Destination')),null);
});
test('legacy and segmented backups exclude actual noncanonical Git/employee metadata and reject aliases in manifests',async t=>{
 const f=await setup(t);
 for(const name of ['.AGENTS-COMPANY','.GiT']){await fs.mkdir(path.join(f.workspace,name));await fs.writeFile(path.join(f.workspace,name,'secret'),'DO_NOT_BACK_UP');}
 await f.api('fs.write',{path:'safe.md',content:'Safe backup content'});
 const reader=require('../lib/backup-reader.cjs');for(const name of aliases)assert.throws(()=>reader.allowed(name+'/state.json'),{code:'SCOPE_DENIED'});
 assert.throws(()=>reader.allowed('.margin-reader/trash/.AGENTS-COMPANY/secret'),{code:'SCOPE_DENIED'});
 for(const format of ['zip','segmented']){
  const name=format+'.mrbackup';await f.api('library.backup.create',{path:name,format});
  const inspect=await f.api('library.backup.inspect',{path:name});assert(inspect.files>=2);
  await f.api('library.backup.restore',{path:name,folder:'Restored-'+format});
  assert.equal(await S.exists(path.join(f.workspace,'Restored-'+format,'.AGENTS-COMPANY')),null);
  assert.equal(await S.exists(path.join(f.workspace,'Restored-'+format,'.GiT')),null);
  assert.equal(await fs.readFile(path.join(f.workspace,'Restored-'+format,'safe.md'),'utf8'),'Safe backup content');
 }
});
test('case-variant host events do not feed back into library notifications while committed state still does',()=>{
 const changed=require('../runtime.cjs').meaningfulWorkspaceChange;
 for(const value of ['.AGENTS-COMPANY/ipc/events.json','child/.GiT/index','child/.MARGIN-READER/state.json','.MARGIN-READER/cache/file.json'])assert.equal(changed(value),false,value);
 for(const value of ['.MARGIN-READER/STATE.JSON','Library/普通文件.md','Library/cache/source.md'])assert.equal(changed(value),true,value);
});
