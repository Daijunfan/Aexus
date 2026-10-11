const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {startServer} = require('../dist-cli/server.cjs');
const {BackendClient} = require('../dist-cli/client.cjs');
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-trash-sequence-')));
  const client = new BackendClient({workspace:root,autoStart:false});
  let server = await startServer(client.directory,root);
  t.after(async()=>{await server.close();fs.rmSync(root,{recursive:true,force:true})});
  return {root,client,call:client.call.bind(client),get server(){return server},restart:async()=>{await server.close();server=await startServer(client.directory,root)}};
}
const create=(call,title,parentId)=>call('page.create',{title,color:'white',...(parentId?{parentId}:{})});
const hidden=async(call,ids)=>{const pages=await call('page.list');for(const id of ids)assert.ok(!pages.some(p=>p.id===id),'trash revived '+id)};
test('consecutive native subtree trash remains hidden across file rescans, unrelated writes and restart',async t=>{
 const f=await fixture(t),{call}=f;
 const a=await create(call,'A'),ac=await create(call,'A child',a.id),b=await create(call,'B'),c=await create(call,'C');
 await call('page.trash',{pageId:a.id});await hidden(call,[a.id,ac.id]);
 await call('page.trash',{pageId:b.id});await hidden(call,[a.id,ac.id,b.id]);
 await call('page.update',{pageId:c.id,title:'C updated'});await call('fs.sync');await f.restart();await hidden(call,[a.id,ac.id,b.id]);
 await call('page.restore',{pageId:b.id});await hidden(call,[a.id,ac.id]);
 assert.ok((await call('page.list')).some(p=>p.id===b.id));
});
test('existing directory pages do not resurrect on the next command after trash',async t=>{
 const {root,call}=await fixture(t);
 fs.mkdirSync(path.join(root,'First'));fs.mkdirSync(path.join(root,'Second'));
 fs.writeFileSync(path.join(root,'First','notes.md'),'keep my file');
 await call('fs.sync');const pages=await call('page.list');
 const a=pages.find(p=>p.title==='First'),b=pages.find(p=>p.title==='Second');
 await call('page.trash',{pageId:a.id});await hidden(call,[a.id]);
 await call('page.trash',{pageId:b.id});await hidden(call,[a.id,b.id]);
});
test('pre-request fs.sync events cannot acknowledge a pending workspace.patch or revive an optimistic trash',async t=>{
 const f=await fixture(t),{root,client,call}=f;
 const bundle=path.join(root,'.sync-test.cjs');
 require('esbuild').buildSync({stdin:{contents:"export {WorkspaceSync} from './src/core/sync'; export {trashPage} from './src/model';",resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
 const {WorkspaceSync,trashPage}=require(bundle);
 const a=await create(call,'A'),b=await create(call,'B');
 const state=await call('workspace.get');const sync=new WorkspaceSync(state,(method,params,id)=>client.request(method,params,id));
 const traces=[];sync.subscribe(event=>traces.push(event.workspace.pages.filter(p=>!p.trashedAt).map(p=>p.id)));
 const off=f.server.service.subscribe(event=>{if(event.type==='state')sync.receive(event)});t.after(off);
 fs.writeFileSync(path.join(root,'external.md'),'external edit triggers scan');
 sync.update(trashPage(sync.workspace,a.id));await sync.flush();
 assert.equal(sync.error,'');
 assert.ok(traces.every(ids=>!ids.includes(a.id)),'an unrelated fs.sync prematurely acknowledged the trash patch');
 sync.update(trashPage(sync.workspace,b.id));await sync.flush();await hidden(call,[a.id,b.id]);
});

test('directory first edit is an ordinary page transaction; raw originals survive and parent IDs remain stable',async t=>{
 const f=await fixture(t),{root,call}=f;
 fs.mkdirSync(path.join(root,'Existing','Nested'),{recursive:true});
 fs.writeFileSync(path.join(root,'Existing','original.txt'),'original bytes');
 await call('fs.sync');let pages=await call('page.list');
 const a=pages.find(p=>p.title==='Existing'),b=pages.find(p=>p.title==='Nested');
 assert.equal((await call('page.get',{pageId:a.id})).locked,false);assert.equal(b.parentId,a.id);
 assert.ok(!fs.existsSync(path.join(root,'Existing/index.mininotion.json')),'read must not mutate ordinary folders');
 await call('block.append',{pageId:b.id,text:'editable without promotion'});
 const loc=await call('fs.path',{pageId:b.id});assert.equal(loc.path,'Existing/Nested/index.mininotion.json');
 assert.equal((await call('page.get',{pageId:b.id})).parentId,a.id);
 await call('page.update',{pageId:a.id,title:'Renamed'});
 assert.equal((await call('fs.path',{pageId:a.id})).path,'Existing/index.mininotion.json');
 assert.equal(fs.readFileSync(path.join(root,'Existing/original.txt'),'utf8'),'original bytes');
 await f.restart();assert.equal((await call('page.get',{pageId:a.id})).title,'Renamed');
});
test('trash and restore a directory subtree across restarts retains independent trash and restores raw bytes',async t=>{
 const f=await fixture(t),{root,call}=f;
 fs.mkdirSync(path.join(root,'Tree','Nested'),{recursive:true});
 fs.writeFileSync(path.join(root,'Tree','Nested','notes.md'),'original notes');
 await call('fs.sync');let pages=await call('page.list');const a=pages.find(p=>p.title==='Tree'),b=pages.find(p=>p.title==='Nested'),raw=pages.find(p=>p.title==='notes.md');
 const native=await create(call,'independently trashed',a.id);
 await call('page.trash',{pageId:native.id});await new Promise(r=>setTimeout(r,5));
 await call('page.trash',{pageId:a.id});await hidden(call,[a.id,b.id,raw.id,native.id]);
 await f.restart();await hidden(call,[a.id,b.id,raw.id,native.id]);
 await call('page.restore',{pageId:a.id});await hidden(call,[native.id]);
 assert.equal(fs.readFileSync(path.join(root,'Tree/Nested/notes.md'),'utf8'),'original notes');
 assert.ok((await call('page.list')).some(p=>p.id===b.id));
});
test('file-level removal of a main index and permanent purge never synthesize ghost directory pages',async t=>{
 const f=await fixture(t),{call,root}=f;
 const a=await create(call,'Gone'),b=await create(call,'Keep');
 const loc=await call('fs.path',{pageId:a.id});
 await call('fs.remove',{path:loc.path});await hidden(call,[a.id]);
 assert.ok(!(await call('page.list')).some(p=>p.title==='Gone'));
 await call('fs.restore',{path:loc.path});assert.ok((await call('page.list')).some(p=>p.id===a.id));
 await call('page.trash',{pageId:a.id});await call('page.purge',{pageId:a.id,confirm:true});
 await f.restart();assert.ok(!(await call('page.list')).some(p=>p.title==='Gone'));
 assert.ok(fs.existsSync(loc.absoluteDirectory),'bound physical folders are retained');
 assert.ok((await call('page.list')).some(p=>p.id===b.id));
});
test('many sequential real CLI trash/restore calls are monotone across parent and child workspace services',async t=>{
 const f=await fixture(t),{call,root}=f;
 const pages=[];for(let i=0;i<10;i++)pages.push(await create(call,'Batch '+i));
 const run=require('node:util').promisify(require('node:child_process').execFile);
 const cli=async(method,params)=>JSON.parse((await run(process.execPath,[path.resolve('dist-cli/cli.cjs'),'--workspace',root,'api',method,'--data',JSON.stringify(params)],{encoding:'utf8',timeout:10000})).stdout);
 const expected=new Set();
 for(const page of pages){await cli('page.trash',{pageId:page.id});expected.add(page.id);await hidden(call,[...expected]);await call('fs.sync')}
 for(const page of pages.filter((_,i)=>i%2===0)){await cli('page.restore',{pageId:page.id});expected.delete(page.id);await hidden(call,[...expected])}
 await f.restart();await hidden(call,[...expected]);
 for(const page of pages)assert.equal((await call('page.list')).some(p=>p.id===page.id),!expected.has(page.id));
 const visible=pages[0],loc=await call('fs.path',{pageId:visible.id});
 const childClient=new BackendClient({workspace:loc.absoluteDirectory,autoStart:false});const childServer=await startServer(childClient.directory,loc.absoluteDirectory);t.after(()=>childServer.close());
 const sub=await childClient.call('page.create',{title:'Scoped sub',parentId:visible.id,color:'white'});
 await call('page.trash',{pageId:visible.id});assert.ok((await childClient.call('workspace.get')).pages.find(p=>p.id===sub.id).trashedAt);
 await call('page.restore',{pageId:visible.id});assert.ok(!(await childClient.call('page.get',{pageId:sub.id})).trashedAt);
});

test('main and child are interchangeable page positions in folder mode, including batch and restart',async t=>{
 const f=await fixture(t),{call}=f;
 const a=await create(call,'Parent'),b=await create(call,'Former main'),leaf=await create(call,'Leaf',b.id);
 const oldLocation=await call('fs.path',{pageId:b.id});await call('fs.write',{path:oldLocation.directory+'/original.txt',content:'keep original'});
 const raw=(await call('page.list')).find(p=>p.title==='original.txt');
 await call('page.move',{pageId:b.id,parentId:a.id});
 assert.equal((await call('page.get',{pageId:b.id})).parentId,a.id);
 assert.equal((await call('page.get',{pageId:leaf.id})).parentId,b.id);
 await f.restart();assert.equal((await call('page.get',{pageId:b.id})).parentId,a.id);
 assert.equal((await call('page.list')).filter(p=>p.title==='Former main').length,1);
 assert.equal((await call('page.get',{pageId:raw.id})).parentId,b.id);
 assert.equal((await call('fs.read',{path:(await call('fs.path',{pageId:b.id})).directory+'/original.txt'})).content,'keep original');
 assert.ok(!fs.existsSync(oldLocation.absoluteDirectory), 'moving a page relocates its whole directory');
 await call('batch',{operations:[{method:'page.move',params:{pageId:b.id,parentId:'root'}}]});
 assert.equal((await call('page.get',{pageId:b.id})).parentId,null);
});
