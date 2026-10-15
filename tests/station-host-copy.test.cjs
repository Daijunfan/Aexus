const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-hostcopy-'));
process.env.CLOUD_HOSTS_HOME=path.join(tmp,'core');
const station=require('../src/station.cjs');
const source=path.join(tmp,'source'),target=path.join(tmp,'target');
fs.mkdirSync(source);fs.mkdirSync(target);
fs.mkdirSync(path.join(target,'drop'));
const wait=async id=>{
 for(let i=0;i<650;i++){
  const result=station.list().jobs.find(row=>row.id===id);
  if(result&&result.state!=='running')return result;
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 throw Error('Host copy fixture timed out');
};
const copy=({from='.',destination='drop',src='local',dst='local',sourceDirectory=source,targetDirectory=target}={})=>
 station.copyBetweenHosts({sourceHost:src,sourceDirectory,path:from,host:dst,directory:targetDirectory,to:destination});
after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
test('copy a binary file in multiple chunks, preserving its exact hash and original source',async()=>{
 const bytes=Buffer.alloc(591181);for(let i=0;i<bytes.length;i++)bytes[i]=i%253;
 fs.writeFileSync(path.join(source,'archive.bin'),bytes);
 const job=copy({from:'archive.bin',destination:'drop/archive.bin'});
 assert.equal(job.kind,'copy');assert.equal(job.source.hostId,'local');assert.equal(job.destination.path,'drop/archive.bin');
 const result=await wait(job.id);assert.equal(result.state,'done',result.error);
 assert.equal(result.bytes,bytes.length);assert.equal(result.result.files,1);
 assert.deepEqual(fs.readFileSync(path.join(target,'drop/archive.bin')),bytes);
 assert.deepEqual(fs.readFileSync(path.join(source,'archive.bin')),bytes);
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('folders copy hidden files and directories, empty directories and zero-length files, independent of UI hidden setting',async()=>{
 fs.mkdirSync(path.join(source,'Project'));fs.mkdirSync(path.join(source,'Project/.git'));fs.mkdirSync(path.join(source,'Project/.secret'));fs.mkdirSync(path.join(source,'Project/empty'));
 fs.writeFileSync(path.join(source,'Project/.env'),'TOKEN=fixture\n');fs.writeFileSync(path.join(source,'Project/.git/HEAD'),'ref: refs/heads/main\n');
 fs.writeFileSync(path.join(source,'Project/.secret/.credentials'),'no real credentials');fs.writeFileSync(path.join(source,'Project/zero'),'');
 const result=await wait(copy({from:'Project',destination:'drop/Project'}).id);
 assert.equal(result.state,'done',result.error);assert.equal(result.result.folders,4);
 for(const name of ['.env','.git/HEAD','.secret/.credentials','zero'])
  assert.deepEqual(fs.readFileSync(path.join(target,'drop/Project',name)),fs.readFileSync(path.join(source,'Project',name)));
 assert.ok(fs.statSync(path.join(target,'drop/Project/empty')).isDirectory());
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('repeated copy never overwrites destination, never deletes source, and cleans staging',async()=>{
 const before=fs.readFileSync(path.join(target,'drop/Project/.env'));
 const result=await wait(copy({from:'Project',destination:'drop/Project'}).id);
 assert.equal(result.state,'failed');assert.match(result.error,/already exists|目标已有/);
 assert.deepEqual(fs.readFileSync(path.join(target,'drop/Project/.env')),before);
 assert.ok(fs.existsSync(path.join(source,'Project/.env')));
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('symbolic link source is rejected without committing incomplete folder',async()=>{
 fs.mkdirSync(path.join(source,'with-symlink'));
 fs.writeFileSync(path.join(source,'with-symlink/normal'),'should not be copied alone');
 fs.symlinkSync(path.join(source,'archive.bin'),path.join(source,'with-symlink/link'));
 const result=await wait(copy({from:'with-symlink',destination:'drop/with-symlink'}).id);
 assert.equal(result.state,'failed');assert.match(result.error,/symbolic link|ordinary|普通/);
 assert.ok(!fs.existsSync(path.join(target,'drop/with-symlink')));
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('cancelled job cleans target staging and leaves source intact',async()=>{
 const job=copy({from:'Project',destination:'drop/cancelled-folder'});
 station.cancel(job.id);
 const result=await wait(job.id);
 assert.equal(result.state,'cancelled');
 assert.ok(!fs.existsSync(path.join(target,'drop/cancelled-folder')));
 assert.ok(fs.existsSync(path.join(source,'Project/.env')));
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('unsafe paths and recursively overlapping destination roots fail before starting a job',()=>{
 for(const from of ['../archive.bin','/tmp/archive.bin','.','Project/../archive.bin'])
  assert.throws(()=>copy({from,destination:'drop/another'}),/Unsafe|Invalid/);
 assert.throws(()=>copy({from:'archive.bin',destination:'../target/escape'}),/Unsafe/);
 assert.throws(()=>copy({from:'Project',destination:'Project/copy',targetDirectory:path.join(source,'Project')}),/Cannot copy/);
 assert.throws(()=>copy({from:'archive.bin',destination:'archive.bin',targetDirectory:source}),/same file/);
});
test('concurrent folder copies to the same target publish exactly one complete tree',async()=>{
 const pathName='drop/concurrent-unique';
 const first=copy({from:'Project',destination:pathName});
 const second=copy({from:'Project',destination:pathName});
 const results=await Promise.all([wait(first.id),wait(second.id)]);
 assert.deepEqual(results.map(job=>job.state).sort(),['done','failed']);
 assert.ok(fs.statSync(path.join(target,pathName,'empty')).isDirectory());
 assert.equal(fs.readFileSync(path.join(target,pathName,'.git/HEAD'),'utf8'),'ref: refs/heads/main\n');
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')||name.startsWith('.cloud-hosts-copy-lock-')).length,0);
});
test('mid-stream cancellation never exposes a partial binary or leaves transfer staging',async()=>{
 const file=path.join(source,'large-cancel.dat');fs.writeFileSync(file,Buffer.alloc(3*1024*1024,67));
 const job=copy({from:'large-cancel.dat',destination:'drop/large-cancel.dat'});
 for(let i=0;i<1500;i++){
  const state=station.list().jobs.find(item=>item.id===job.id);
  if(state.bytes>=256*1024||state.state!=='running')break;
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 station.cancel(job.id);
 const result=await wait(job.id);
 assert.equal(result.state,'cancelled',result.error);
 assert.equal(fs.existsSync(path.join(target,'drop/large-cancel.dat')),false);
 assert.ok(fs.existsSync(file));
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('source modified during streaming never commits an inconsistent destination',async()=>{
 const filename='modified-during-stream.bin',file=path.join(source,filename);
 fs.writeFileSync(file,Buffer.alloc(3*1024*1024,40));
 const job=copy({from:filename,destination:'drop/'+filename});
 for(let i=0;i<1500;i++){
  const state=station.list().jobs.find(item=>item.id===job.id);
  if(state.bytes>=256*1024||state.state!=='running')break;
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 fs.appendFileSync(file,Buffer.from('later writer'));
 const result=await wait(job.id);
 assert.equal(result.state,'failed');assert.match(result.error,/changed during transfer/);
 assert.equal(fs.existsSync(path.join(target,'drop',filename)),false);
 assert.equal(fs.readdirSync(target).filter(name=>name.startsWith('.cloud-hosts-transfer-')).length,0);
});
test('POSIX filenames with literal backslashes are copied byte-for-byte, Windows reserved names are rejected',async()=>{
 const name='odd\\literal.txt';fs.writeFileSync(path.join(source,name),'not a directory separator');
 const result=await wait(copy({from:name,destination:'drop/'+name}).id);
 assert.equal(result.state,'done',result.error);
 assert.equal(fs.readFileSync(path.join(target,'drop',name),'utf8'),'not a directory separator');
 const registry=require('../src/registry.cjs');
 const windows=registry.create({name:'Validate Windows names without opening SSH',host:'localhost.invalid',os:'windows',defaultDirectory:'C:\\Temp'});
 const stationHost=require('../src/station.cjs');
 assert.throws(()=>stationHost.copyBetweenHosts({sourceHost:'local',sourceDirectory:source,path:'archive.bin',host:windows.id,directory:'C:\\Temp',to:'CON'}),/Invalid Windows filename/);
 assert.throws(()=>stationHost.copyBetweenHosts({sourceHost:'local',sourceDirectory:source,path:'archive.bin',host:windows.id,directory:'C:\\Temp',to:'folder/bad?.txt'}),/Invalid Windows filename/);
});
