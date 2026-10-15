const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-workspaces-'));
process.env.CLOUD_HOSTS_HOME=root;
const agents=require('../src/agent-sessions.cjs'),saved=agents.sessions;
const rows=[
 {id:'session-one',engine:'codex',name:'CLI session A',targetHostId:'local',cwd:path.join(root,'project-a'),running:true},
 {id:'session-two',engine:'pi',name:'CLI session B',targetHostId:'local',cwd:path.join(root,'project-a'),running:false},
 {id:'session-three',engine:'codex',name:'CLI session C',targetHostId:'local',cwd:path.join(root,'project-b'),running:true}
];
agents.sessions=()=>structuredClone(rows);
const workspace=require('../src/workspaces.cjs');
after(()=>{agents.sessions=saved;fs.rmSync(root,{recursive:true,force:true})});
test('Workspace identity is stable for same host+canonical directory, not a role name',()=>{
 const a=workspace.identity('local',root+'/project-a/../project-a');
 assert.equal(a.id,workspace.identity('local',root+'/project-a').id);
 assert.notEqual(a.id,workspace.identity('local',root+'/project-b').id);
 assert.equal(workspace.list().length,2);
 assert.deepEqual(workspace.get({id:a.id}).sessionIds,['session-one','session-two']);
 assert.equal(fs.existsSync(path.join(root,'workspaces.json')),false,'Workspace discovery remains read-only');
});
test('project selections persist across Core reads and never change Agent routes or work dirs',()=>{
 const a=workspace.register({hostId:'local',directory:root+'/project-a',name:'Mac project'});
 const b=workspace.register({hostId:'local',directory:root+'/project-b',name:'Build project'});
 const project=workspace.createProject({name:'Toolbox development',workspaceIds:[a.id,b.id]});
 assert.equal(project.workspaces.length,2);
 assert.deepEqual(project.workspaces.map(w=>w.sessionCount),[2,1]);
 assert.deepEqual(workspace.projects()[0].workspaceIds,[a.id,b.id]);
 const changed=workspace.updateProject({id:project.id,name:'Toolbox CI',workspaceIds:[b.id],expectedRevision:1});
 assert.equal(changed.name,'Toolbox CI');assert.equal(changed.workspaces.length,1);
 assert.throws(()=>workspace.updateProject({id:project.id,workspaceIds:[],expectedRevision:1}),/changed/);
 assert.deepEqual(rows.map(x=>x.targetHostId),['local','local','local']);
 assert.deepEqual(rows.map(x=>x.cwd),[root+'/project-a',root+'/project-a',root+'/project-b']);
 assert.equal(workspace.archiveProject({id:project.id,expectedRevision:2}).archived,true);
 assert.equal(workspace.projects().length,0);
 assert.equal(workspace.projects({includeArchived:true}).length,1);
});
test('unregistering a saved workspace never deletes files, native session identities or project selections',()=>{
 const a=workspace.register({hostId:'local',directory:root+'/project-a'});
 const file=path.join(root,'project-a','test.txt');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'permanent file');
 assert.equal(workspace.unregister({id:a.id}).unregistered,true);
 assert.equal(fs.readFileSync(file,'utf8'),'permanent file');
 assert.equal(workspace.get({id:a.id}).sessionIds.length,2,'Native sessions still derive the workspace');
});
test('workspace project input rejects unknown IDs and invalid paths before creating metadata',()=>{
 assert.throws(()=>workspace.register({hostId:'local',directory:'relative/path'}),/绝对路径|absolute/);
 assert.throws(()=>workspace.createProject({name:'Bad',workspaceIds:['wk_missing']}),/Unknown Workspace/);
 assert.throws(()=>workspace.createProject({name:'',workspaceIds:[]}),/1–100/);
});
test('CLI workspace metadata APIs dispatch without executing commands or opening SSH',async()=>{
 const core=require('../src/core.cjs');
 const list=await core.dispatch('workspaces.list');assert.equal(list.length,2);
 const project=await core.dispatch('workspaces.projectCreate',{name:'CLI project',workspaceIds:[list[0].id]});
 assert.equal((await core.dispatch('workspaces.project',{id:project.id})).id,project.id);
 assert.equal((await core.dispatch('workspaces.projects')).length,1);
});
