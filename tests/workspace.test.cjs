const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-workgroups-'));
process.env.CLOUD_HOSTS_HOME=home;
const registry=require('../src/registry.cjs');
const host=registry.create({name:'shared-host',host:'a.invalid',os:'linux',defaultDirectory:'/',password:'test-only'});
const workspaceFile=path.join(home,'workspace.json');
after(()=>fs.rmSync(home,{recursive:true,force:true}));
test('existing board migrates into a named workgroup without changing host credentials',()=>{
 const before=fs.readFileSync(path.join(home,'hosts.json'),'utf8');
 fs.writeFileSync(workspaceFile,JSON.stringify({mode:'board',board:[host.id],boardModes:{[host.id]:'desktop'},boardInitialized:true}));
 const state=registry.workspace();assert.equal(state.boards.length,1);assert.deepEqual(state.boards[0].hosts,[host.id]);assert.equal(state.boards[0].modes[host.id],'desktop');
 registry.workspace({boardPatch:{name:'Existing group',columns:3,cardHeight:480}});
 assert.deepEqual(registry.workspace().board,[host.id]);assert.equal(fs.readFileSync(path.join(home,'hosts.json'),'utf8'),before);assert.equal(registry.password(host.id),'test-only');
});
test('workgroups keep independent host sizes and views across a fresh process',()=>{
 const original=registry.workspace().activeBoard;
 const created=registry.workspace({createBoard:{name:'Second group'}});const second=created.activeBoard;
 assert.deepEqual(created.board,[]);
 registry.workspace({boardId:second,boardPatch:{hosts:[host.id],modes:{[host.id]:'terminal'},sizes:{[host.id]:{span:2,height:620}},columns:2}});
 registry.workspace({activeBoard:original});
 const previous=registry.workspace();assert.equal(previous.boardModes[host.id],'desktop');assert.deepEqual(previous.boards[0].sizes,{});
 // A queued save for another group must not change the currently selected group.
 registry.workspace({boardId:second,boardPatch:{sizes:{[host.id]:{span:1,height:510}}}});
 assert.equal(registry.workspace().activeBoard,original);
 const reloaded=JSON.parse(execFileSync(process.execPath,['-e',`console.log(JSON.stringify(require(${JSON.stringify(require.resolve('../src/registry.cjs'))}).workspace()))`],{env:{...process.env,CLOUD_HOSTS_HOME:home},encoding:'utf8'}));
 assert.equal(reloaded.boards.length,2);assert.deepEqual(reloaded.boards.find(b=>b.id===second).sizes[host.id],{span:1,height:510});
 const disk=fs.readFileSync(workspaceFile,'utf8');assert.throws(()=>registry.workspace({boardPatch:{columns:0}}),/size/);assert.equal(fs.readFileSync(workspaceFile,'utf8'),disk);
 assert.throws(()=>registry.workspace({activeBoard:'missing'}),/Unknown workgroup/);
});
test('operating system heights persist and reject invalid values without damaging saved state',()=>{
 registry.workspace({boardPatch:{osHeights:{windows:460,kali:540,linux:350}}});
 const loaded=JSON.parse(execFileSync(process.execPath,['-e',`console.log(JSON.stringify(require(${JSON.stringify(require.resolve('../src/registry.cjs'))}).workspace()))`],{env:{...process.env,CLOUD_HOSTS_HOME:home},encoding:'utf8'}));
 assert.deepEqual(loaded.boards.find(b=>b.id===loaded.activeBoard).osHeights,{windows:460,kali:540,linux:350});
 const disk=fs.readFileSync(workspaceFile,'utf8');
 for(const osHeights of [{windows:10},{linux:5000},{unknown:400}])assert.throws(()=>registry.workspace({boardPatch:{osHeights}}),/operating system height/);
 assert.equal(fs.readFileSync(workspaceFile,'utf8'),disk);
});
test('removing a workgroup and pruning removed hosts preserve unrelated groups',()=>{
 const state=registry.workspace(),second=state.boards[1].id;
 registry.workspace({removeBoard:second});assert.equal(registry.workspace().boards.length,1);assert.equal(registry.password(host.id),'test-only');
 assert.throws(()=>registry.workspace({removeBoard:state.activeBoard}),/至少保留/);
 registry.remove(host.id);assert.deepEqual(registry.workspace({mode:'single'}).board,[]);
});

test('Role Board migrates old collaboration tabs while native layout and credentials remain independent',()=>{
 fs.writeFileSync(workspaceFile,JSON.stringify({mode:'agent-board',viewOrder:['agent-board','single','hosts-board'],agentBoard:{hubTab:'messages',roleOrder:{local:['native-one']},projectViewId:'all'}}));
 const migrated=registry.workspace();
 assert.equal(migrated.mode,'role-board');
 assert.equal(migrated.roleBoard.tab,'messages');
 assert.deepEqual(migrated.viewOrder,['agent-board','single','hosts-board','role-board']);
 assert.deepEqual(migrated.agentBoard.roleOrder,{local:['native-one']});
 registry.workspace({mode:'agent-board',roleBoardPatch:{tab:'plan'}});
 registry.workspace({agentBoardPatch:{roleHeight:320}});
 assert.equal(registry.workspace().roleBoard.tab,'plan');
 assert.equal(registry.workspace().mode,'agent-board');
 registry.workspace({mode:'role-board'});
 assert.equal(registry.workspace().agentBoard.roleHeight,320);
 const before=fs.readFileSync(workspaceFile,'utf8');
 assert.throws(()=>registry.workspace({roleBoardPatch:{tab:'workspace'}}),/Invalid Role Board tab/);
 assert.equal(fs.readFileSync(workspaceFile,'utf8'),before);
});

test('Agent workgroups migrate host membership and stay independent across switches and restarts',()=>{
 fs.writeFileSync(workspaceFile,JSON.stringify({mode:'agent-board',agentBoard:{hosts:['local'],initialized:true,roleOrder:{local:['native-session']},projectViewId:'legacy-project'}}));
 const original=registry.workspace();
 assert.deepEqual(original.agentBoard.groups[0].hosts,['local']);
 const created=registry.workspace({createAgentGroup:{name:'Second Agent group'}}),second=created.agentBoard.activeGroup;
 assert.deepEqual(created.agentBoard.hosts,[]);
 assert.equal(created.agentBoard.initialized,true);
 registry.workspace({agentGroupId:second,agentBoardPatch:{hosts:['local']},agentGroupPatch:{name:'Renamed group'}});
 registry.workspace({activeAgentGroup:'default'});
 // Queued membership saves stay attached to their group, even after switching.
 registry.workspace({agentGroupId:second,agentBoardPatch:{hosts:[]}});
 const reloaded=JSON.parse(execFileSync(process.execPath,['-e',`console.log(JSON.stringify(require(${JSON.stringify(require.resolve('../src/registry.cjs'))}).workspace()))`],{env:{...process.env,CLOUD_HOSTS_HOME:home},encoding:'utf8'}));
 assert.deepEqual(reloaded.agentBoard.hosts,['local']);
 assert.deepEqual(reloaded.agentBoard.groups.find(g=>g.id===second).hosts,[]);
 assert.equal(reloaded.agentBoard.groups.find(g=>g.id===second).name,'Renamed group');
 assert.deepEqual(reloaded.agentBoard.roleOrder,{local:['native-session']});
 assert.deepEqual(reloaded.boards,original.boards);
 assert.deepEqual(reloaded.roleBoard,original.roleBoard);
 registry.workspace({removeAgentGroup:'default'});
 assert.equal(registry.workspace().agentBoard.activeGroup,second);
 assert.deepEqual(registry.workspace().agentBoard.roleOrder,{local:['native-session']});
 assert.throws(()=>registry.workspace({removeAgentGroup:second}),/至少保留/);
 const disk=fs.readFileSync(workspaceFile,'utf8');
 assert.throws(()=>registry.workspace({agentBoardPatch:{hosts:['missing']}}),/unknown host/);
 assert.throws(()=>registry.workspace({agentGroupPatch:{name:'  '}}),/Invalid Agent workgroup/);
 assert.equal(fs.readFileSync(workspaceFile,'utf8'),disk);
});


test('Agent workgroup columns migrate legacy layouts and persist independently across restarts',()=>{
 fs.writeFileSync(workspaceFile,JSON.stringify({mode:'agent-board',agentBoard:{hosts:['local'],columns:4,initialized:true,groups:[{id:'default',name:'Existing',hosts:['local'],initialized:true}],activeGroup:'default'}}));
 const migrated=registry.workspace();assert.equal(migrated.agentBoard.columns,4);assert.equal(migrated.agentBoard.groups[0].columns,4);
 const other=registry.workspace({createAgentGroup:{name:'Other'}}).agentBoard.activeGroup;
 assert.equal(registry.workspace().agentBoard.columns,2);
 registry.workspace({agentGroupId:other,agentGroupPatch:{columns:6}});
 registry.workspace({activeAgentGroup:'default'});
 assert.equal(registry.workspace().agentBoard.columns,4);
 registry.workspace({agentGroupId:other,agentBoardPatch:{columns:1}});
 assert.equal(registry.workspace().agentBoard.columns,4,'queued saves do not change the selected group');
 const reloaded=JSON.parse(execFileSync(process.execPath,['-e',`console.log(JSON.stringify(require(${JSON.stringify(require.resolve('../src/registry.cjs'))}).workspace()))`],{env:{...process.env,CLOUD_HOSTS_HOME:home},encoding:'utf8'}));
 assert.equal(reloaded.agentBoard.groups.find(g=>g.id===other).columns,1);assert.equal(reloaded.agentBoard.groups[0].columns,4);
 for(const columns of [0,7,1.5,'3']){const before=fs.readFileSync(workspaceFile,'utf8');assert.throws(()=>registry.workspace({agentGroupPatch:{columns}}),/columns/);assert.equal(fs.readFileSync(workspaceFile,'utf8'),before)}
});
