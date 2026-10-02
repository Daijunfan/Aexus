const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {startServer} = require('../dist-cli/server.cjs');
const {BackendClient} = require('../dist-cli/client.cjs');
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mn-tree-'))), servers=[];
  const connect = async directory => {const client=new BackendClient({workspace:directory,autoStart:false});const server=await startServer(client.directory,directory);servers.push(server);return {client,server,call:client.call.bind(client)}};
  const f=await connect(root);t.after(async()=>{for(const s of servers.reverse())await s.close();fs.rmSync(root,{recursive:true,force:true})});return {...f,root,connect};
}
const create=(call,title,parentId)=>call('page.create',{title,color:'white',...(parentId?{parentId}:{})});
async function topology(call,root){
  const audit=await call('fs.audit');assert.equal(audit.valid,true,JSON.stringify(audit.errors));
  const w=await call('workspace.get'), dirs=new Set();
  for(const p of w.pages.filter(p=>!p.sourceFile&&!p.syncedSource&&!p.trashedAt)){
    const loc=await call('fs.path',{pageId:p.id});assert.equal(path.basename(loc.path),'index.mininotion.json');assert.ok(!dirs.has(loc.directory),'two pages share one directory');dirs.add(loc.directory);
    const actual=JSON.parse(fs.readFileSync(loc.absolutePath));assert.equal(actual.page.id,p.id);
    if(p.parentId){const parent=await call('fs.path',{pageId:p.parentId});assert.equal(path.dirname(loc.absoluteDirectory),parent.absoluteDirectory,`folder parent != page parent for ${p.title}`)}
    else assert.equal(path.dirname(loc.absoluteDirectory),root,`top-level ${p.title} is not a direct child`);
  }
}
test('every page, database and record occupies its own folder at exactly its logical depth',async t=>{
 const {call,root}=await fixture(t);const a=await create(call,'主页面'),b=await create(call,'子页面',a.id),c=await create(call,'孙页面',b.id);
 const db=await call('database.create',{title:'任务库',parentId:b.id,color:'blue',view:'board'});await call('record.create',{databaseId:db.id,title:'任务一',color:'white'});
 await topology(call,root);assert.equal((await call('fs.path',{pageId:c.id})).path,'主页面/子页面/孙页面/index.mininotion.json');
 const duplicate=await create(call,'子页面',a.id);assert.notEqual((await call('fs.path',{pageId:duplicate.id})).directory,(await call('fs.path',{pageId:b.id})).directory);
});
test('a child workspace sees its own index and new children; collection never flattens ancestors',async t=>{
 const {call,root,connect}=await fixture(t);const a=await create(call,'项目'),b=await create(call,'研究',a.id);const loc=await call('fs.path',{pageId:b.id});const employee=await connect(loc.absoluteDirectory);
 const c=await create(employee.call,'员工子页',b.id);await employee.call('block.append',{pageId:c.id,text:'real workspace write'});await topology(call,root);
 assert.equal((await call('page.get',{pageId:b.id})).parentId,a.id);assert.equal((await call('page.get',{pageId:c.id})).parentId,b.id);
});
test('moving a subtree moves physical folders and ordinary files; external folder moves override stale parentId',async t=>{
 const {call,root}=await fixture(t);const a=await create(call,'甲'),b=await create(call,'乙'),c=await create(call,'子',a.id),d=await create(call,'孙',c.id);
 const before=await call('fs.path',{pageId:c.id});fs.writeFileSync(path.join(before.absoluteDirectory,'readme.txt'),'keep bytes');await call('fs.sync');
 await call('page.move',{pageId:c.id,parentId:b.id});await topology(call,root);const after=await call('fs.path',{pageId:c.id});assert.equal(fs.readFileSync(path.join(after.absoluteDirectory,'readme.txt'),'utf8'),'keep bytes');assert.ok(!fs.existsSync(before.absoluteDirectory));
 const target=path.join(root,'甲','子');fs.renameSync(after.absoluteDirectory,target);await call('fs.sync');assert.equal((await call('page.get',{pageId:c.id})).parentId,a.id);await topology(call,root);
 await call('page.move',{pageId:d.id,parentId:'root'});await topology(call,root);
});
test('copy, repeat trash, selective restore and restart retain physical tree without ghost pages',async t=>{
 const {call,root,server,connect}=await fixture(t);const a=await create(call,'原页'),b=await create(call,'子页',a.id),c=await create(call,'另一页');
 const copied=await call('page.duplicate',{pageId:a.id});await topology(call,root);await call('page.trash',{pageId:a.id});await call('page.trash',{pageId:c.id});
 for(let i=0;i<4;i++){await call('fs.sync');assert.ok((await call('page.get',{pageId:a.id,trash:true})).trashedAt)}
 await call('page.restore',{pageId:a.id});assert.equal((await call('page.get',{pageId:b.id})).parentId,a.id);await topology(call,root);
 await server.close();const reopened=await connect(root);await topology(reopened.call,root);assert.ok((await reopened.call('page.get',{pageId:c.id,trash:true})).trashedAt);assert.ok(await reopened.call('page.get',{pageId:copied.id}));
});
test('failed persistence rolls back directory relocation and raw file bytes',async t=>{
 const {call,root,server}=await fixture(t);server.service.stopScheduler();
 const a=await create(call,'Left'),b=await create(call,'Right'),child=await create(call,'Child',a.id);
 const location=await call('fs.path',{pageId:child.id});fs.writeFileSync(path.join(location.absoluteDirectory,'raw.txt'),'unchanged');await call('fs.sync');
 const save=server.service.storage.save.bind(server.service.storage);server.service.storage.save=()=>{throw Error('injected storage failure')};
 await assert.rejects(call('page.move',{pageId:child.id,parentId:b.id}),/injected storage failure/);server.service.storage.save=save;
 assert.equal(fs.readFileSync(path.join(location.absoluteDirectory,'raw.txt'),'utf8'),'unchanged');
 assert.equal((await call('page.get',{pageId:child.id})).parentId,a.id);await topology(call,root);
 assert.ok(!fs.existsSync(path.join(root,'Right','Child')));
});
test('batch parent and grandchild moves retain exact folder ancestry and collision-safe siblings',async t=>{
 const {call,root}=await fixture(t);const a=await create(call,'A'),b=await create(call,'B'),c=await create(call,'C',a.id),d=await create(call,'D',c.id);
 await create(call,'C',b.id);
 await call('batch',{operations:[{method:'page.move',params:{pageId:c.id,parentId:b.id}},{method:'page.move',params:{pageId:d.id,parentId:'root'}}]});
 assert.equal((await call('fs.path',{pageId:c.id})).directory,'B/C (2)');assert.equal((await call('fs.path',{pageId:d.id})).directory,'D');await topology(call,root);
});
test('collection roots are containers; employee roots and omitted parents keep the global hierarchy',async t=>{
 const {call,root,connect}=await fixture(t);
 fs.writeFileSync(path.join(root,'.mininotion','collection.json'),JSON.stringify({format:'mininotion.collection/v1'}));
 await assert.rejects(call('fs.bind',{path:'.'}),{code:'WORKSPACE_CONTAINER'});
 const a=await create(call,'主'),b=await create(call,'子',a.id);const employee=await connect((await call('fs.path',{pageId:b.id})).absoluteDirectory);
 const c=await create(employee.call,'默认子页');assert.equal(c.parentId,b.id);
 const loc=await employee.call('fs.path',{pageId:c.id});assert.equal(loc.mainPage,false);assert.equal(loc.depth,3);assert.equal(loc.collectionRoot,root);
 await topology(call,root);
});
test('database subitems have their own nested folders while retaining database identity',async t=>{
 const {call,root}=await fixture(t);
 const db=await call('database.create',{title:'库',color:'blue'}), row=await call('record.create',{databaseId:db.id,title:'父记录',color:'white'});
 const child=await call('subitem.create',{pageId:row.id,title:'子记录',color:'white'});
 const loc=await call('fs.path',{pageId:child.id});assert.equal(loc.directory,'库/父记录/子记录');
 assert.equal((await call('page.get',{pageId:child.id})).parentId,db.id);assert.equal((await call('fs.audit')).valid,true);
 const tree=await call('page.tree');assert.equal(tree[0].children[0].children[0].id,child.id);
});
