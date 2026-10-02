'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const {mailboxBoundary}=require('../lib/mailbox-boundary.cjs'),{mailboxClient}=require('../lib/mailbox.cjs');
async function setup(t){
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mr-host-mailbox-'))),workspace=path.join(temp,'documents'),home=path.join(temp,'host'),employee='s_fixture_employee';
 const runtime=path.join(home,'agent-access',employee),mailbox=path.join(runtime,'ipc','margin-reader'),credential=path.join(runtime,'token');
 await fs.mkdir(mailbox,{recursive:true});await fs.mkdir(workspace);await fs.writeFile(credential,'fixture-private-credential',{mode:0o600});await fs.writeFile(path.join(mailbox,'host.json'),JSON.stringify({workspace,pid:process.pid}));
 const env={AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_EMPLOYEE:employee,AGENTS_COMPANY_TOKEN_FILE:credential};t.after(()=>fs.rm(temp,{recursive:true,force:true}));return {temp,workspace,home,employee,runtime,mailbox,credential,env};
}
test('central mailbox resolution requires the exact assigned runtime and credential, while legacy workspace mailboxes remain supported',async t=>{
 const f=await setup(t);const b=await mailboxBoundary(f.workspace,f.mailbox,f.env);assert.equal(b.layout,'host-runtime');assert.equal(await b.checkedFile('host.json'),path.join(f.mailbox,'host.json'));assert.equal(b.token,'fixture-private-credential');
 const legacy=path.join(f.workspace,'.agents-company/ipc/margin-reader/e');await fs.mkdir(legacy,{recursive:true});assert.equal((await mailboxBoundary(f.workspace,legacy,{})).layout,'workspace');
 for(const env of [{},{...f.env,AGENTS_COMPANY_EMPLOYEE:'../sibling'},{...f.env,AGENTS_COMPANY_EMPLOYEE:'s_other'}])await assert.rejects(mailboxBoundary(f.workspace,f.mailbox,env),{code:'SCOPE_DENIED'});
 for(const env of [{...f.env,AGENTS_COMPANY_TOKEN_FILE:undefined},{...f.env,AGENTS_COMPANY_TOKEN_FILE:path.join(f.home,'control.token')},{...f.env,AGENTS_COMPANY_TOKEN:'substituted-identity'}])await assert.rejects(mailboxBoundary(f.workspace,f.mailbox,env),{code:'AUTH_REQUIRED'});
 await assert.rejects(mailboxBoundary(f.workspace,path.join(f.home,'arbitrary'),f.env),{code:'SCOPE_DENIED'});
});
test('central mailbox transport still validates workspace and sends only the assigned employee token',async t=>{
 const f=await setup(t),keys=[...Object.keys(f.env),'AGENTS_COMPANY_TOKEN'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)delete process.env[k];Object.assign(process.env,f.env);t.after(()=>{for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];});
 const client=await mailboxClient(f.workspace,f.mailbox,{timeoutMs:1000,pollMs:5});t.after(()=>client.close());const request={jsonrpc:'2.0',id:randomUUID(),method:'settings.get',params:{}},pending=client.request(request);
 let envelope;for(let i=0;i<100;i++){try{envelope=JSON.parse(await fs.readFile(path.join(f.mailbox,request.id+'.request.json'),'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(r=>setTimeout(r,5));}}
 assert.equal(envelope.auth,'fixture-private-credential');const response={jsonrpc:'2.0',id:request.id,result:{theme:'dark'}};await fs.writeFile(path.join(f.mailbox,request.id+'.response.json'),JSON.stringify(response));assert.deepEqual(await pending,response);
 await fs.writeFile(path.join(f.mailbox,'host.json'),JSON.stringify({workspace:path.dirname(f.workspace),pid:process.pid}));await assert.rejects(client.request({...request,id:randomUUID()}),{code:'SCOPE_DENIED'});
 await assert.rejects(fs.stat(path.join(f.workspace,'.margin-reader')),{code:'ENOENT'});
});
test('symlink or hard-link credential/channel aliases are rejected before submitting any request',async t=>{
 const f=await setup(t);await fs.rename(f.mailbox,f.mailbox+'-original');await fs.symlink(f.mailbox+'-original',f.mailbox);
 await assert.rejects(mailboxBoundary(f.workspace,f.mailbox,f.env),{code:'SCOPE_DENIED'});await fs.unlink(f.mailbox);await fs.rename(f.mailbox+'-original',f.mailbox);
 await fs.rename(f.credential,f.credential+'-original');await fs.symlink(f.credential+'-original',f.credential);await assert.rejects(mailboxBoundary(f.workspace,f.mailbox,f.env),{code:'SCOPE_DENIED'});await fs.unlink(f.credential);
 await fs.link(f.credential+'-original',f.credential);await assert.rejects(mailboxBoundary(f.workspace,f.mailbox,f.env),{code:'SCOPE_DENIED'});
 assert.equal((await fs.readdir(f.mailbox)).filter(n=>n.endsWith('.request.json')).length,0);
});
