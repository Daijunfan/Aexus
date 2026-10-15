const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const project=path.resolve(__dirname,'..');
test('CLI-only File Board operations share the same native workspace and protect edits',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-fb-cli-'));
 const env={...process.env,CLOUD_HOSTS_HOME:path.join(tmp,'service')};
 const work=path.join(tmp,'workspace');fs.mkdirSync(work);
 const cli=(...args)=>{
  const result=spawnSync(process.execPath,[path.join(project,'cli.cjs'),...args],{cwd:project,env,encoding:'utf8',timeout:35000});
  if(result.status!==0)throw Error(result.stderr||result.stdout);
  return result.stdout.trim()?JSON.parse(result.stdout):null;
 };
 const action=(operation,args={})=>{
  const file=path.join(tmp,'action.json');
  fs.writeFileSync(file,JSON.stringify({arguments:{operation,args}}));
  return cli('files','local','--directory',work,'--operation','workspace','--data','@'+file);
 };
 try{
  action('mkdir',{path:'docs'});
  action('write',{path:'docs/hello.md',content:'CLI-first File Board',create:true});
  const read=action('read',{path:'docs/hello.md'});
  assert.equal(read.content,'CLI-first File Board');
  action('write',{path:'docs/hello.md',hash:read.hash,content:'Saved safely with hash'});
  const conflict=spawnSync(process.execPath,[path.join(project,'cli.cjs'),'files','local','--directory',work,'--operation','workspace','--data',JSON.stringify({arguments:{operation:'write',args:{path:'docs/hello.md',hash:read.hash,content:'Stale draft'}}})],{cwd:project,env,encoding:'utf8',timeout:35000});
  assert.equal(conflict.status,1);
  assert.match(conflict.stderr,/其他操作修改/);
  action('move',{path:'docs/hello.md',to:'docs/renamed.md'});
  assert.equal(action('list',{path:'docs'}).entries[0].name,'renamed.md');
  const trash=action('trash',{path:'docs/renamed.md'});
  action('restore',{path:'.',id:trash.id});
  assert.equal(action('read',{path:'docs/renamed.md'}).content,'Saved safely with hash');
  console.log('CLOUDHOSTS_FILE_BOARD_CLI_CREATE_EDIT_RENAME_TRASH_RESTORE=PASS');
 }finally{
  try{cli('stop')}catch{}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
