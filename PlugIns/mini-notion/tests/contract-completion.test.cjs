const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {startServer}=require('../dist-cli/server.cjs'),{BackendClient}=require('../dist-cli/client.cjs');
async function fixture(t,folder=true){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mn-contract-'))),client=new BackendClient(folder?{workspace:root,autoStart:false}:{directory:root,autoStart:false});
 const server=await startServer(client.directory,folder?root:undefined);server.service.stopScheduler();
 t.after(async()=>{await server.close();fs.rmSync(root,{recursive:true,force:true})});
 if(!folder)await client.call('workspace.init',{empty:true});else await client.call('fs.sync');
 const execute=require('node:util').promisify(require('node:child_process').execFile);
 const call=async(method,params={})=>{
   try {return JSON.parse((await execute(process.execPath,[path.resolve('dist-cli/cli.cjs'),...(folder?['--workspace',root]:['--data-dir',root]),'api',method,'--data',JSON.stringify(params)],{timeout:10000,maxBuffer:8e6})).stdout)}
   catch(error){let detail;try{detail=JSON.parse(error.stderr).error}catch{};if(detail)throw Object.assign(new Error(detail.message),detail);throw error}
 };
 return {root,server,client,call};
}
const page=(call,title,parentId)=>call('page.create',{title,color:'white',...(parentId?{parentId}:{})});
test('workspace, file listing, favorites, real UI protocol events and stop have concrete receipts',async t=>{
 const {call,server,root,client}=await fixture(t);const a=await page(call,'Receipt');
 await call('workspace.rename',{name:'Contract'});assert.equal((await call('workspace.get')).name,'Contract');
 await call('fs.mkdir',{path:'Assets'});assert.ok((await call('fs.list')).some(v=>v.path==='Assets'&&v.directory));
 await call('page.favorite',{pageId:a.id});assert.equal((await call('page.get',{pageId:a.id})).favorite,true);
 await call('page.favorite',{pageId:a.id,remove:true});assert.equal((await call('page.get',{pageId:a.id})).favorite,false);
 assert.ok(Array.isArray(await call('history.list',{pageId:a.id})));assert.ok(Array.isArray(await call('asset.list')));assert.ok((await call('person.list')).length);
 const events=[];const off=server.service.subscribe(event=>events.push(event));t.after(off);
 const registration=await server.service.request({jsonrpc:'2.0',id:'register',client:'gui-contract',method:'ui.register',params:{}});assert.equal(registration.result.connected,true);
 assert.equal((await call('ui.register')).connected,true);
 assert.equal((await call('page.open',{pageId:a.id})).sent,true);assert.ok(events.some(e=>e.type==='ui'&&e.params.pageId===a.id));
 assert.equal((await call('ui.command',{command:'search'})).sent,true);assert.ok(events.some(e=>e.command==='search'));
 await assert.rejects(call('ui.command',{command:'nonsense'}),{code:'INVALID_UI_COMMAND'});
 await server.service.request({jsonrpc:'2.0',id:'unregister',client:'gui-contract',method:'ui.register',params:{ready:false}});
 await assert.rejects(call('page.open',{pageId:a.id}),{code:'GUI_NOT_RUNNING'});
 assert.equal((await call('service.stop')).stopping,true);assert.ok(events.some(e=>e.type==='shutdown'));
});
test('record bulk, view ordering and overview share persistent database content',async t=>{
 const {call}=await fixture(t);const root=await page(call,'Plan'),db=await call('database.create',{parentId:root.id,title:'Tasks',color:'white'});
 const a=await call('record.create',{databaseId:db.id,title:'A',color:'white'}),b=await call('record.create',{databaseId:db.id,title:'B',color:'white'});
 assert.ok((await call('property.list',{databaseId:db.id})).some(p=>p.id==='status'));
 await call('record.bulk',{ids:[a.id,b.id],values:{status:'已完成'}});for(const row of await call('record.list',{databaseId:db.id}))assert.equal(row.values.status,'已完成');
 const v=await call('view.create',{databaseId:db.id,type:'board',name:'Board'});await call('view.select',{databaseId:db.id,viewId:v.id});assert.equal((await call('database.get',{databaseId:db.id})).activeViewId,v.id);
 const ids=(await call('view.list',{databaseId:db.id})).map(v=>v.id).reverse();await call('view.reorder',{databaseId:db.id,ids});assert.deepEqual((await call('view.list',{databaseId:db.id})).map(v=>v.id),ids);
 await assert.rejects(call('view.reorder',{databaseId:db.id,ids:['invalid']}));assert.deepEqual((await call('view.list',{databaseId:db.id})).map(v=>v.id),ids);
 await call('overview.configure',{changes:{view:'board',hideCompleted:false}});assert.equal((await call('workspace.get')).settings.overview.view,'board');
 assert.ok(await call('overview.get',{view:'board',hideCompleted:false}));assert.ok(await call('overview.render',{view:'table'}));
});
test('comments, synchronization, relations and dependency edits remain inspectable',async t=>{
 const {call}=await fixture(t);const root=await page(call,'Content'),db=await call('database.create',{parentId:root.id,title:'Relations',color:'white'});
 const a=await call('record.create',{databaseId:db.id,title:'A',color:'white'}),b=await call('record.create',{databaseId:db.id,title:'B',color:'white'});
 const comment=await call('comment.add',{pageId:a.id,text:'Review'});await call('comment.resolve',{pageId:a.id,threadId:comment.id});await call('comment.reopen',{pageId:a.id,threadId:comment.id});assert.equal((await call('comment.list',{pageId:a.id}))[0].resolvedAt,null);
 assert.ok(Array.isArray(await call('sync.list')));
 await call('dependency.add',{pageId:b.id,predecessorId:a.id});assert.equal((await call('dependency.list',{databaseId:db.id})).length,1);
 await call('dependency.remove',{pageId:b.id,predecessorId:a.id});assert.equal((await call('dependency.list',{databaseId:db.id})).length,0);
 const relation=await call('property.add',{databaseId:db.id,name:'Related',type:'relation',definition:{relationTo:db.id}});
 await call('relation.set',{pageId:a.id,propertyId:relation.id,ids:[b.id]});assert.deepEqual((await call('page.get',{pageId:a.id})).values[relation.id],[b.id]);
});
test('template repeat previews and notification lifecycle are non-destructive and repeatable',async t=>{
 const {call}=await fixture(t);const db=await call('database.create',{title:'Routine',color:'white'}),row=await call('record.create',{databaseId:db.id,title:'Check',color:'white'});
 const template=await call('template.create',{databaseId:db.id,title:'Daily',color:'white'});assert.equal((await call('template.get',{templateId:template.id})).id,template.id);
 await call('repeat.configure',{templateId:template.id,rule:{enabled:true,frequency:'daily',interval:1,timeZone:'UTC',time:'09:00',startDate:'2099-01-01',catchUp:'latest'}});
 assert.equal((await call('repeat.list',{databaseId:db.id})).length,1);const before=await call('workspace.get');assert.ok(await call('repeat.preview',{templateId:template.id,count:2,after:'2099-01-01T00:00:00Z'}));assert.deepEqual(await call('workspace.get'),before);
 await call('repeat.remove',{templateId:template.id});assert.equal((await call('repeat.list',{databaseId:db.id})).length,0);assert.ok(await call('template.get',{templateId:template.id}));
 const reminder=await call('reminder.add',{pageId:row.id,at:'2020-01-01T00:00:00Z',text:'Before'});await call('reminder.update',{pageId:row.id,reminderId:reminder.id,changes:{text:'After'}});
 await call('scheduler.run',{at:'2020-01-01T00:00:01Z'});const inbox=await call('inbox.list');assert.equal(inbox.length,1);const id=inbox[0].id;assert.equal((await call('inbox.get',{id})).text,'After');
 await call('inbox.read',{id});await call('inbox.unread',{id});assert.equal((await call('inbox.list',{status:'unread'})).length,1);
 await call('inbox.archive',{id});await call('inbox.restore',{id});assert.equal((await call('inbox.list')).length,1);
});
test('automation and button definitions, preview, pause and explicit run preserve real record values',async t=>{
 const {call}=await fixture(t);const db=await call('database.create',{title:'Actions',color:'white'}),row=await call('record.create',{databaseId:db.id,title:'Task',color:'white'});
 const button=await call('button.create',{pageId:row.id,label:'Done',actions:[{type:'set',values:{status:'已完成'}}]});assert.ok(await call('button.get',{pageId:row.id,blockId:button.blockId}));
 const rule=await call('automation.create',{databaseId:db.id,rule:{name:'Finish',triggers:[{type:'created'}],actions:[{type:'set',values:{status:'已完成'}}]}});
 const ref={databaseId:db.id,automationId:rule.id};await call('automation.update',{...ref,rule:{name:'Renamed'}});assert.equal((await call('automation.get',ref)).name,'Renamed');
 await call('automation.pause',ref);assert.equal((await call('automation.get',ref)).enabled,false);await call('automation.resume',ref);
 const before=await call('workspace.get');await call('automation.preview',{...ref,pageId:row.id});assert.deepEqual(await call('workspace.get'),before);
 await call('automation.run',{...ref,pageId:row.id});assert.equal((await call('page.get',{pageId:row.id})).values.status,'已完成');
});
test('standalone folder metadata and file lifecycle remain compatible with the shared catalog',async t=>{
 const {call,server}=await fixture(t,false);const root=await call('space.create',{title:'Legacy space',color:'white'}),pageId=root.id;
 const a=await call('folder.create',{pageId,name:'A'}),b=await call('folder.create',{pageId,name:'B'});
 await call('folder.rename',{pageId,folderId:a.id,name:'Renamed'});await call('folder.move',{pageId,folderId:a.id,parentId:b.id});const folders=await call('folder.list',{pageId});assert.equal(folders.find(f=>f.id===a.id).parentId,b.id);assert.equal(folders.find(f=>f.id===a.id).name,'Renamed');
 const physical=server.service.storage.spaceRoot(pageId);fs.mkdirSync(physical,{recursive:true});fs.writeFileSync(path.join(physical,'actual.txt'),'source text');
 assert.ok(await call('space.reveal',{pageId}));const resolved=await call('file.resolve',{pageId,path:'actual.txt:1'});assert.equal(resolved.line,1);assert.equal(fs.readFileSync(resolved.path,'utf8'),'source text');
 await call('file.remove',{pageId,fileId:resolved.fileId});assert.ok(!(await call('page.get',{pageId})).files.some(f=>f.id===resolved.fileId));
 await call('page.trash',{pageId});await call('page.purge',{pageId,confirm:true});assert.ok(await call('space.purge',{pageId}));assert.ok(!fs.existsSync(physical));
});

test('real CLI block documents and complete discussion lifecycle preserve readback and validation',async t=>{
 const {call}=await fixture(t);const a=await page(call,'Comments');
 await call('block.replace',{pageId:a.id,blocks:[{type:'paragraph',content:'Body'}]});let saved=await call('page.get',{pageId:a.id});assert.equal(saved.blocks[0].content,'Body');
 const thread=await call('comment.add',{pageId:a.id,blockId:saved.blocks[0].id,text:'Review'}),ref={pageId:a.id,threadId:thread.id};
 await call('comment.reply',{...ref,text:'Reply'});await call('comment.update',{...ref,commentId:thread.messages[0].id,text:'Edited'});await call('comment.react',{...ref,commentId:thread.messages[0].id,emoji:'👍'});
 let result=await call('comment.get',ref);assert.equal(result.messages.length,2);assert.equal(result.messages[0].text,'Edited');assert.equal(result.messages[0].reactions['👍'],true);
 await call('comment.delete',ref);assert.equal((await call('comment.list',{pageId:a.id})).length,0);await call('comment.restore',ref);assert.equal((await call('comment.get',ref)).messages.length,2);
 await call('block.delete',{pageId:a.id,ids:[saved.blocks[0].id]});assert.equal((await call('comment.get',ref)).quote,'Body');
 const before=await call('page.get',{pageId:a.id});await assert.rejects(call('block.replace',{pageId:a.id,blocks:[{type:'table',content:[]}]}),{code:'INVALID_TABLE'});assert.deepEqual(await call('page.get',{pageId:a.id}),before);
});
test('real CLI linked content detaches independently and cleans shared sources',async t=>{
 const {call}=await fixture(t);const root=await page(call,'Shared'),a=await page(call,'A',root.id),b=await page(call,'B',root.id);
 const synced=await call('sync.create',{pageId:a.id,blocks:[{type:'paragraph',content:'Shared text'}]});const ref=await call('sync.link',{sourceId:synced.sourceId,pageId:b.id});
 assert.equal((await call('sync.get',{sourceId:synced.sourceId})).references.length,2);await call('sync.unlink',{pageId:b.id,blockId:ref.id});assert.match(JSON.stringify((await call('page.get',{pageId:b.id})).blocks),/Shared text/);
 await assert.rejects(call('sync.delete',{sourceId:synced.sourceId}));await call('sync.delete',{sourceId:synced.sourceId,detach:true});assert.match(JSON.stringify((await call('page.get',{pageId:a.id})).blocks),/Shared text/);
});
test('real CLI property, person, template, repeat and reminder update lifecycles retain defaults',async t=>{
 const {call}=await fixture(t);const db=await call('database.create',{title:'Defaults',color:'white'});
 await call('property.update',{databaseId:db.id,propertyId:'priority',name:'Priority renamed'});assert.equal((await call('property.list',{databaseId:db.id})).find(p=>p.id==='priority').name,'Priority renamed');
 const person=await call('person.create',{name:'Author',email:'author@example.test'});await call('person.update',{id:person.id,name:'Renamed author'});assert.equal((await call('person.list')).find(p=>p.id===person.id).name,'Renamed author');await call('person.delete',{id:person.id});assert.ok(!(await call('person.list')).some(p=>p.id===person.id));
 const template=await call('template.create',{databaseId:db.id,title:'Default task',color:'white',blocks:[{type:'paragraph',content:'Default content'}]});
 await call('template.update',{templateId:template.id,changes:{icon:'📘'}});await call('template.default',{databaseId:db.id,templateId:template.id});
 const row=await call('record.create',{databaseId:db.id,color:'white'});assert.equal(row.title,'Default task');assert.equal(row.icon,'📘');
 await call('template.apply',{templateId:template.id,pageId:row.id});assert.match(JSON.stringify((await call('page.get',{pageId:row.id})).blocks),/Default content/);
 await call('repeat.configure',{templateId:template.id,rule:{enabled:true,frequency:'daily',interval:1,timeZone:'UTC',time:'09:00',startDate:'2099-01-01',catchUp:'latest'}});
 await call('repeat.pause',{templateId:template.id});assert.equal((await call('repeat.list'))[0].rule.enabled,false);await call('repeat.resume',{templateId:template.id});assert.equal((await call('repeat.list'))[0].rule.enabled,true);
 assert.ok(await call('scheduler.status'));
 const reminder=await call('reminder.add',{pageId:row.id,at:'2099-01-01T00:00:00Z',text:'Due'});await call('reminder.delete',{pageId:row.id,reminderId:reminder.id});assert.equal((await call('reminder.list',{pageId:row.id})).length,0);
 await call('reminder.restore',{pageId:row.id,reminderId:reminder.id});assert.equal((await call('reminder.list',{pageId:row.id})).length,1);
});
test('real CLI legacy space conversion and metadata removal preserve compatibility',async t=>{
 const {call}=await fixture(t,false);const root=await page(call,'Legacy'),pageId=root.id;
 assert.equal((await call('space.convert',{pageId,engine:'claude'})).id,pageId);
 const folder=await call('folder.create',{pageId,name:'Files'});const file=await call('file.record',{pageId,name:'meta.txt',url:'asset://local/meta.txt',folderId:folder.id,bytes:3});assert.ok(file.id);
 await assert.rejects(call('folder.delete',{pageId,folderId:folder.id}));await call('folder.delete',{pageId,folderId:folder.id,confirm:true});assert.equal((await call('folder.list',{pageId})).length,0);assert.equal((await call('page.get',{pageId})).files.length,0);
});
