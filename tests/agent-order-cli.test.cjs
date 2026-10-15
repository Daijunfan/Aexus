const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-swap-cli-'));
const env={...process.env,CLOUD_HOSTS_HOME:home};
const role=(id,target='local')=>({id,name:'CLI Role '+id,engine:'pi',engineHostId:target,targetHostId:target,transport:'pty',cwd:home,kind:'agent',nativeSessionId:'none',createdAt:Date.now()});
fs.writeFileSync(path.join(home,'agents.json'),JSON.stringify([role('first'),role('second'),role('third')]));
function cli(...args){
 const result=spawnSync(process.execPath,[path.join(root,'cli.cjs'),...args],{env,encoding:'utf8',timeout:22000});
 if(result.status!==0)throw Error(`cloud-hosts ${args.join(' ')}: ${result.stderr||result.stdout}`);
 return JSON.parse(result.stdout);
}
test('CLI-only host enumeration always includes the Core computer',()=>{
 const rows=cli('list');assert.equal(rows[0].id,'local');assert.equal(rows[0].local,true);
 assert.equal(cli('get','local').id,'local');
});
test('CLI orders and swaps exact session slots without launching an engine or changing work machines',()=>{
 const first=cli('agent-order','local');
 assert.deepEqual(first.order,['first','second','third']);
 assert.equal(first.roles[0].targetHostId,'local');
 const swapped=cli('agent-swap','local','--first','first','--second','third');
 assert.deepEqual(swapped.order,['third','second','first']);
 assert.deepEqual(cli('agent-order','local').order,['third','second','first']);
 const raw=JSON.parse(fs.readFileSync(path.join(home,'agents.json'),'utf8'));
 assert.equal(raw.length,3);
 assert.deepEqual(raw.map(item=>item.targetHostId),['local','local','local']);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'workspace.json'),'utf8')).agentBoard.roleOrder.local,['third','second','first']);
});
test('CLI rejects cross-host or missing Agent IDs instead of mutating other host data',()=>{
 const result=spawnSync(process.execPath,[path.join(root,'cli.cjs'),'agent-swap','local','--first','first','--second','missing'],{env,encoding:'utf8',timeout:20000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/selected host/);
 assert.deepEqual(cli('agent-order','local').order,['third','second','first']);
});
test.after(()=>{
 try{cli('stop')}catch{}
 fs.rmSync(home,{recursive:true,force:true});
});
