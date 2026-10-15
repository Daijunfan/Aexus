const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const project=path.resolve(__dirname,'..');
test('CLI copies binary/hidden folder between selected hosts without any GUI or moving the original',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-copy-cli-'));
 const env={...process.env,CLOUD_HOSTS_HOME:path.join(tmp,'app')};
 const from=path.join(tmp,'from'),to=path.join(tmp,'to');
 fs.mkdirSync(path.join(from,'Project','.git'),{recursive:true});fs.mkdirSync(path.join(to,'results'),{recursive:true});
 const raw=Buffer.from([0,255,133,0,34,99]);
 fs.writeFileSync(path.join(from,'Project','.git','HEAD'),'ref: main\n');fs.writeFileSync(path.join(from,'Project','binary.dat'),raw);
 const cli=(...args)=>{
  const proc=spawnSync(process.execPath,[path.join(project,'cli.cjs'),...args],{env,cwd:project,encoding:'utf8',timeout:75000});
  assert.equal(proc.status,0,proc.stderr||proc.stdout);
  return JSON.parse(proc.stdout);
 };
 try{
  const completed=cli('station','copy','--source-host','local','--source-directory',from,'--path','Project','--host','local','--directory',to,'--to','results/Project');
  assert.equal(completed.path,'results/Project');assert.equal(completed.files,2);
  assert.deepEqual(fs.readFileSync(path.join(to,'results/Project/binary.dat')),raw);
  assert.equal(fs.readFileSync(path.join(to,'results/Project/.git/HEAD'),'utf8'),'ref: main\n');
  assert.ok(fs.existsSync(path.join(from,'Project/binary.dat')));
  const repeated=spawnSync(process.execPath,[path.join(project,'cli.cjs'),'station','copy','--source-host','local','--source-directory',from,'--path','Project','--host','local','--directory',to,'--to','results/Project'],{env,cwd:project,encoding:'utf8',timeout:45000});
  assert.equal(repeated.status,1);assert.match(repeated.stderr,/already exists|目标已有/);
  assert.ok(!fs.readdirSync(to).some(value=>value.startsWith('.cloud-hosts-transfer-')));
  console.log('PASS_NATIVE_CLI_HOST_COPY_HIDDEN_BINARY_NO_OVERWRITE=YES');
 }finally{
  try{cli('stop')}catch{}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
