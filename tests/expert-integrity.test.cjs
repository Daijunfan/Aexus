// Isolated, real local transport regressions for expert review items 1–7, 21.
// Runs in its own CloudHosts home, uses only 127.0.0.1, never a registered user host.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-expert-risk-'));
process.env.CLOUD_HOSTS_HOME=path.join(home,'state');
const registry=require('../src/registry.cjs'),core=require('../src/core.cjs'),station=require('../src/station.cjs');
const desktops=require('../src/desktops.cjs');
const wait=async(check,label)=>{const until=Date.now()+25000;while(Date.now()<until){const value=check();if(value)return value;await new Promise(resolve=>setTimeout(resolve,90))}throw Error('Timed out: '+label)};
const done=async(id)=>{const job=await wait(()=>station.list().jobs.find(j=>j.id===id&&j.state!=='running'),'transfer '+id);assert.equal(job.state,'done',job.error);return job.result};
const leafs=root=>{const rows=[];const walk=(dir,prefix='')=>{for(const f of fs.readdirSync(dir,{withFileTypes:true})){const rel=path.posix.join(prefix,f.name);if(f.isDirectory()){rows.push(rel+'/');walk(path.join(dir,f.name),rel)}else{rows.push(rel+'#'+fs.readFileSync(path.join(dir,f.name)).toString('hex'))}}};walk(root);return rows.sort()};
let servers=[];
test('1: deleting unrelated host A leaves desktop connections on B and C and their host metadata',async()=>{
 const tcp=net.createServer(socket=>socket.end());await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));servers.push(tcp);
 const profile={protocol:'rdp',address:'127.0.0.1',port:tcp.address().port};
 const a=registry.create({name:'Unused A',host:'example.invalid',os:'linux',defaultDirectory:home});
 const b=registry.create({name:'Desktop B',host:'example.invalid',os:'windows',defaultDirectory:home,desktop:profile,vm:{hypervisorId:a.id,name:'legacy',projectDirectory:'/legacy',state:'running',access:'ssh'}});
 const c=registry.create({name:'Desktop C',host:'example.invalid',os:'windows',defaultDirectory:home,desktop:profile});
 const db=await desktops.openHostDesktop(b.id),dc=await desktops.openHostDesktop(c.id);
 assert.equal(desktops.listHostDesktops().length,2);
 await core.dispatch('hosts.remove',{id:a.id});
 assert.deepEqual(desktops.listHostDesktops().map(x=>x.id).sort(),[db.id,dc.id].sort());
 assert.equal(desktops.listHostDesktops(b.id)[0].state,'ready');
 assert.equal(desktops.listHostDesktops(c.id)[0].state,'ready');
 // Connection profile stays usable when only the *display name* changes.
 const renamed=await core.dispatch('hosts.update',{id:b.id,patch:{name:'Desktop B Renamed'}});
 assert.equal(renamed.name,'Desktop B Renamed');
 assert.equal(desktops.listHostDesktops(b.id)[0].id,db.id);
 const independent=await core.dispatch('hosts.update',{id:b.id,patch:{vm:null}});
 assert.equal(independent.vm,undefined);
 assert.equal(desktops.listHostDesktops(b.id)[0].id,db.id,'Metadata migration preserves the active desktop');
 await assert.rejects(core.dispatch('hosts.update',{id:b.id,patch:{host:'moved.example.invalid'}}),/交互连接|关闭终端|连接/);
 await assert.rejects(core.dispatch('hosts.remove',{id:b.id}),/交互连接|关闭终端|连接/);
 await desktops.closeHostConnections(b.id);
 assert.equal(desktops.listHostDesktops(c.id)[0].id,dc.id);
 await desktops.closeHostConnections(c.id);
});
test('2+6: hidden dotfiles, deep hidden dirs, empty dirs and local Core roundtrip byte-for-byte',async()=>{
 const source=path.join(home,'source'),destination=path.join(home,'destination');fs.mkdirSync(source);fs.mkdirSync(destination);
 const folder=path.join(source,'bundle');fs.mkdirSync(folder);
 for(const dir of ['.git','nested','nested/.private','empty'])fs.mkdirSync(path.join(folder,dir),{recursive:true});
 for(const [name,data] of [['.env','SECRET=1'],['.git/HEAD','ref: refs/heads/main\n'],['visible.txt','Hello'],['nested/.private/secret.bin',Buffer.from([0xff,0x00,0x7f,0x08])]])fs.writeFileSync(path.join(folder,name),data);
 const expected=leafs(folder);
 const fetched=station.fetchFile('local',source,'bundle');
 const result=await done(fetched.id);
 const copy=station.file(result.id);
 assert.deepEqual(leafs(copy),expected);
 const sent=station.sendFile(result.id,'local',destination,'restored');
 await done(sent.id);
 assert.deepEqual(leafs(path.join(destination,'restored')),expected);
 assert.equal(station.list().jobs.find(j=>j.id===sent.id).host,'local');
 await assert.rejects(async()=>done(station.sendFile(result.id,'local',destination,'restored').id),/目标已有同名|already exists/);
});
test('4+5: invalid UTF-8 stays byte exact and stale editor hashes cannot overwrite newer changes',async()=>{
 const bad=path.join(home,'invalid.txt'),bytes=Buffer.from([0x48,0x80,0xfd,0x41]);fs.writeFileSync(bad,bytes);
 const item=await station.importFile(bad);
 assert.throws(()=>station.read(item.id),/UTF-8/);
 assert.throws(()=>station.write(item.id,'replacement','xyz'),/UTF-8/);
 assert.deepEqual(fs.readFileSync(station.file(item.id)),bytes);
 const doc=station.create('parallel.txt','file',null,'original');
 const initial=station.read(doc.id);
 station.write(doc.id,'first writer',initial.sha256);
 assert.throws(()=>station.write(doc.id,'overwriting second writer',initial.sha256),/修改/);
 assert.equal(fs.readFileSync(station.file(doc.id),'utf8'),'first writer');
 assert.equal(fs.readdirSync(path.dirname(station.file(doc.id))).filter(name=>name.includes('.save-')).length,0);
});
test('7: local host accepted in saved Terminal/File/Agent boards; unknown IDs still rejected',async()=>{
 const current=registry.workspace();
 const updated=registry.workspace({boardPatch:{hosts:['local']},fileBoardPatch:{hosts:['local']},agentBoardPatch:{hosts:['local']}});
 assert.deepEqual(updated.board,['local']);assert.deepEqual(updated.fileBoard.hosts,['local']);assert.deepEqual(updated.agentBoard.hosts,['local']);
 const options=[{boardPatch:{hosts:['not-a-host']}},{fileBoardPatch:{hosts:['bad-id']}},{agentBoardPatch:{hosts:['bad-id']}}];
 for(const patch of options)assert.throws(()=>registry.workspace(patch),/unknown host|not found|Unknown/);
 assert.deepEqual(registry.workspace().board,['local']);
});
after(async()=>{
 await core.shutdown();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
 fs.rmSync(home,{recursive:true,force:true});
});
