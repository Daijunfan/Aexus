import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkspace } from '../src/seed';
import { makePage } from '../src/model';
import { diffWorkspace, applyWorkspacePatch } from '../src/core/patch';
import { workspaceDelta, applyWorkspaceDelta } from '../src/core/stateDelta';
import { executeWorkspaceCommand } from '../src/core/commands';
import { normalizeWorkspace } from '../src/core/normalize';
import { WorkspaceSync } from '../src/core/sync';
import { DraftCheckpoint } from '../src/core/draftCheckpoint';
import { FolderStorage } from '../src/backend/folderStorage';

const fixture = () => normalizeWorkspace({ ...createWorkspace(), pages: Array.from({length:80},(_,i)=>makePage({title:'Page '+i,color:'white',blocks:[{type:'paragraph',content:'content '.repeat(300)}]})), revision:1 });

test('typing diff serializes only changed pages and remains a detached durable patch',()=>{
 const before=fixture();let visits=0;
 Object.defineProperty(before.pages[1],'toJSON',{value(){visits++;return {...this}},enumerable:false});
 const changed={...before.pages[0],title:'typed'};
 const next={...before,pages:[changed,...before.pages.slice(1)]};
 const patch=diffWorkspace(before,next);
 assert.equal(visits,0);assert.equal(patch.pages.length,1);
 changed.title='later';assert.equal(patch.pages[0].after!.title,'typed');
 const metadata=diffWorkspace(before,{...before,activePageId:changed.id,customUndefined:undefined} as any);
 assert.equal(metadata.pages.length,0);
 assert.equal(applyWorkspacePatch(before,metadata).pages,before.pages);
});

test('normalization retains unchanged page and block identities across metadata and title commands',()=>{
 const before=fixture();
 const next=executeWorkspaceCommand(before,'settings.set',{theme:'dark'}).workspace!;
 assert.ok(next.pages.every((page,i)=>page===before.pages[i]));
 const edited=executeWorkspaceCommand(next,'page.update',{pageId:before.pages[0].id,title:'Edited'}).workspace!;
 assert.equal(edited.pages[0].blocks,before.pages[0].blocks);
 assert.ok(edited.pages.slice(1).every((page,i)=>page===before.pages[i+1]));
});

test('delta roundtrip handles deletion, reordering and metadata without cloning untouched content',()=>{
 const before=fixture(),created=makePage({title:'New',color:'white'});
 const next={...before,revision:2,activePageId:created.id,pages:[created,{...before.pages[0],title:'Renamed'},...before.pages.slice(2)]};
 const delta=JSON.parse(JSON.stringify(workspaceDelta(before,next)));
 assert.equal(delta.pages.length,2);assert.equal(delta.removed.length,1);
 const reconstructed=applyWorkspaceDelta(before,delta)!;
 assert.deepEqual(reconstructed,next);
 assert.equal(reconstructed.pages[1].blocks,before.pages[0].blocks);
 assert.equal(reconstructed.pages[2],before.pages[2]);
 assert.equal(applyWorkspaceDelta(reconstructed,delta),reconstructed);
 assert.equal(applyWorkspaceDelta(null,delta),null);
 assert.equal(applyWorkspaceDelta({...before,revision:0},delta),null);
 const meta={...next,revision:3,activePageId:null};
 assert.equal(applyWorkspaceDelta(next,workspaceDelta(next,meta))!.pages,next.pages);
});

test('debounced edits coalesce without losing an overlapping external change and explicit flush drains immediately',async()=>{
 let server=fixture(),calls=0;
 const sync=new WorkspaceSync(server,async(_method,params,id)=>{
   calls++;server={...applyWorkspacePatch(server,params.patch),revision:(server.revision||0)+1};
   return {jsonrpc:'2.0',id:id!,result:{},workspace:server,revision:server.revision!};
 },{debounceMs:10000});
 for(let i=0;i<25;i++)sync.update({...sync.workspace,pages:sync.workspace.pages.map((page,n)=>n? page:{...page,title:'Typed '+i})});
 assert.equal(calls,0);assert.equal(sync.pending.length,1);
 server={...server,revision:2,pages:server.pages.map((page,n)=>n? page:{...page,icon:'📘'})};
 sync.receive({type:'state',workspace:server,revision:2,method:'fs.sync'});
 assert.equal(sync.workspace.pages[0].icon,'📘');assert.equal(sync.workspace.pages[0].title,'Typed 24');
 await sync.flush();assert.equal(calls,1);assert.equal(sync.pending.length,0);assert.equal(server.pages[0].icon,'📘');
});

test('draft checkpoints serialize writes and never let an older clear erase a newer edit',async()=>{
 const writes:any[]=[],releases:(()=>void)[]=[];
 const checkpoints=new DraftCheckpoint(async value=>{writes.push(value);await new Promise<void>(resolve=>releases.push(resolve))},error=>{throw error});
 const before=fixture(),patch=diffWorkspace(before,{...before,name:'one'}),later=diffWorkspace(before,{...before,name:'two'});
 checkpoints.update({patches:[patch],error:''});const first=checkpoints.flush();
 checkpoints.update({patches:[],error:''});checkpoints.update({patches:[later],error:''});
 releases.shift()!();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(writes.length,2);assert.equal(writes[1].patches[0].id,later.id);
 releases.shift()!();await first;
 checkpoints.update({patches:[],error:''});const clear=checkpoints.flush();releases.shift()!();await clear;
 assert.deepEqual(writes.at(-1),[]);
});

test('incremental folder snapshot reads legacy state, changes one object, and recovers through restart and garbage collection',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mn-cache-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const before=fixture(),legacy=JSON.stringify(before);fs.writeFileSync(path.join(directory,'workspace.json'),legacy);
 const storage=new FolderStorage(directory);assert.deepEqual(storage.load(),before);storage.save(before);
 const objects=path.join(directory,'cache/pages'),first=fs.readdirSync(objects);
 const next={...before,revision:2,pages:before.pages.map((page,i)=>i? page:{...page,title:'new'})};storage.save(next);
 assert.equal(fs.readdirSync(objects).length,first.length+1);
 assert.equal(fs.readFileSync(path.join(directory,'workspace.json'),'utf8'),legacy,'legacy snapshot is preserved');
 assert.deepEqual(new FolderStorage(directory).load(),next);
 storage.save({...next,revision:3});storage.collect();
 storage.save({...before,revision:4});assert.deepEqual(new FolderStorage(directory).load(),{...before,revision:4});
});

test('failed snapshot publication leaves the previous complete manifest readable',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mn-cache-fail-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const storage=new FolderStorage(directory),before=fixture();storage.save(before);
 const original=fs.renameSync;
 fs.renameSync=((from:any,to:any)=>{if(to===path.join(directory,'workspace-manifest.json'))throw Error('Injected manifest failure');return original(from,to)}) as any;
 try{assert.throws(()=>storage.save({...before,revision:2,pages:before.pages.map((p,i)=>i?p:{...p,title:'must not publish'})}),/Injected manifest failure/)}finally{fs.renameSync=original}
 assert.deepEqual(new FolderStorage(directory).load(),before);
});

test('segmented history imports legacy undo entries and persists only the edited history object',async t=>{
 const {Changes}=await import('../src/backend/changes');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mn-history-v2-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const before=fixture(),next={...before,name:'First'};
 const old=new Changes(directory);old.record(before,next,{jsonrpc:'2.0',id:'a',method:'workspace.rename'});
 const legacy=fs.readFileSync(path.join(directory,'changes.json'),'utf8');
 const changes=new Changes(directory,true);assert.equal(changes.list().length,1);
 const last={...next,name:'Second'};changes.record(next,last,{jsonrpc:'2.0',id:'b',method:'workspace.rename'});
 assert.equal(fs.readFileSync(path.join(directory,'changes.json'),'utf8'),legacy);
 const undo=changes.apply(last,false,{});assert.equal(undo.workspace.name,'First');undo.committed();
 const reopened=new Changes(directory,true),redo=reopened.apply(undo.workspace,true,{});
 assert.equal(redo.workspace.name,'Second');redo.committed();assert.equal(new Changes(directory,true).list().length,2);
});

test('a failed debounced patch retains its ID when later edits arrive for conflict recovery',async()=>{
 const before=fixture(),sync=new WorkspaceSync(before,async(_m,_p,id)=>({jsonrpc:'2.0',id:id!,error:{code:'CONFLICT',message:'retry',details:{id:'conflict'}},revision:1}),{debounceMs:10000});
 sync.update({...before,name:'first'});const id=sync.pending[0].id;await sync.flush();
 sync.update({...sync.workspace,name:'later'});assert.equal(sync.pending[0].id,id);assert.equal(sync.pending.length,2);
 await sync.flush();
});
