const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream'),{createHash}=require('node:crypto');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-hosts-station-'));
process.env.CLOUD_HOSTS_HOME=path.join(tmp,'support');
const station=require('../src/station.cjs');
const digest=data=>createHash('sha256').update(data).digest('hex');
test('binary imports preserve original names, source files and independent duplicates',async()=>{
 const source=path.join(tmp,'item.json'),bytes=Buffer.from([0,255,128,1,2,3,0]);fs.writeFileSync(source,bytes);
 const first=await station.importFile(source),second=await station.importFile(source);
 assert.notEqual(first.id,second.id);assert.equal(first.name,'item.json');assert.equal(first.sha256,digest(bytes));assert.deepEqual(fs.readFileSync(station.file(first.id)),bytes);assert.deepEqual(fs.readFileSync(source),bytes);
 const exported=path.join(tmp,'export.bin');station.exportFile(first.id,exported);assert.deepEqual(fs.readFileSync(exported),bytes);assert.throws(()=>station.exportFile(first.id,exported),/存在/);
 station.remove(first.id);assert.ok(station.list().items.some(item=>item.id===second.id));assert.ok(fs.existsSync(source));
});
test('incomplete or mismatched uploads never enter the ready file list',async()=>{
 const before=station.list().items.length;
 async function* broken(){yield Buffer.from('partial');throw Error('interrupted')}
 await assert.rejects(station.ingest(Readable.from(broken()),'broken.bin',{kind:'mac',name:'Mac'}),/interrupted/);
 await assert.rejects(station.ingest(Readable.from([Buffer.from('bad')]),'bad.bin',{kind:'mac',name:'Mac'},{expectedHash:digest(Buffer.from('good'))}),/校验/);
 assert.equal(station.list().items.length,before);assert.equal(fs.readdirSync(path.join(tmp,'support/station')).filter(name=>name.startsWith('.partial-')).length,0);
});
test('files survive a new CLI process and large uploads are streamed',async()=>{
 const block=Buffer.alloc(256*1024,0xa7),hash=createHash('sha256');let count=0;
 async function* chunks(){for(let i=0;i<40;i++){hash.update(block);yield block}}
 const item=await station.ingest(Readable.from(chunks()),'中文 空格 large.bin',{kind:'mac',name:'Mac'},{progress:bytes=>{count=bytes}});
 assert.equal(count,10*1024*1024);assert.equal(item.sha256,hash.digest('hex'));
 const {spawnSync}=require('node:child_process');const result=spawnSync(process.execPath,['-e','console.log(JSON.stringify(require(process.argv[1]).list()))',path.join(__dirname,'../src/station.cjs')],{env:process.env,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.ok(JSON.parse(result.stdout).items.some(row=>row.id===item.id&&row.bytes===count));
});
test('folder topology preserves contents through rename and move, and rejects cycles',()=>{
 const a=station.create('资料','folder'),b=station.create('子目录','folder',a.id),file=station.create('说明.txt','file',b.id,'nested text'),outside=station.create('其他','folder');
 station.update(a.id,{name:'项目资料'});assert.equal(fs.readFileSync(station.file(file.id),'utf8'),'nested text');
 assert.throws(()=>station.update(a.id,{parent:b.id}),/自己|子文件夹/);assert.throws(()=>station.update(a.id,{parent:a.id}),/自己|子文件夹/);
 station.update(b.id,{parent:outside.id});assert.equal(station.list().items.find(x=>x.id===file.id).logicalPath,'其他/子目录/说明.txt');
 station.write(file.id,'edited',station.read(file.id).sha256);assert.equal(station.read(file.id).text,'edited');station.remove(outside.id);assert.ok(!station.list().items.some(x=>x.id===file.id));assert.ok(station.list().items.some(x=>x.id===a.id));
});
test('folder imports and exports retain empty directories and binary contents',async()=>{
 const local=path.join(tmp,'folder-fixture');fs.mkdirSync(path.join(local,'empty'),{recursive:true});fs.mkdirSync(path.join(local,'nested'));fs.writeFileSync(path.join(local,'nested','a.bin'),Buffer.from([0,255,0]));
 const imported=await station.importFile(local),destination=path.join(tmp,'folder-export');station.exportFile(imported.id,destination);
 assert.ok(fs.statSync(path.join(destination,'empty')).isDirectory());assert.deepEqual(fs.readFileSync(path.join(destination,'nested/a.bin')),Buffer.from([0,255,0]));
 station.remove(imported.id);assert.ok(fs.existsSync(path.join(local,'nested/a.bin')));
});
process.on('exit',()=>fs.rmSync(tmp,{recursive:true,force:true}));
