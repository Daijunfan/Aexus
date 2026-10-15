const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('Credential helper path selects Windows Credential Manager or macOS Keychain',()=>{
 const {helperForPlatform}=require('../src/rdp-credentials.cjs');
 assert.match(helperForPlatform('win32'),/Windows[\\/]RdpCredentials\.exe$/);
 assert.match(helperForPlatform('darwin'),/Runtime[\\/]rdp-credentials$/);
 assert.equal(helperForPlatform('linux'),null);
});

test('Native credential IPC passes UTF-8 inputs and never needs file-stored passwords',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-credentials-test-'));
 const prevHome=process.env.CLOUD_HOSTS_HOME, prevHelper=process.env.CLOUD_HOSTS_RDP_CREDENTIAL_HELPER;
 const username='测试\\alice',password='fixture-only';
 try {
  const helper=path.join(dir,'fixture-helper.cjs');
  fs.writeFileSync(helper,[
   '#!/usr/bin/env node',
   "let text=''; process.stdin.on('data',d=>text+=d); process.stdin.on('end',()=>{",
   "const req=JSON.parse(text); if(!/^[0-9a-f-]{36}$/.test(req.account))process.exit(4);",
   "if(req.action==='get') process.stdout.write(JSON.stringify({found:true,username:"+JSON.stringify(username)+",password:"+JSON.stringify(password)+",source:'fixture'}));",
   "else if(req.action==='set')process.stdout.write(JSON.stringify({saved:req.username==="+JSON.stringify(username)+"&&req.password==="+JSON.stringify(password)+"}));",
   "else {process.stdout.write(JSON.stringify({error:'credential provider unavailable'}));process.exitCode=2;}",
   '});'
  ].join('\n'),{mode:0o700});
  process.env.CLOUD_HOSTS_HOME=dir;
  process.env.CLOUD_HOSTS_RDP_CREDENTIAL_HELPER=helper;
  for(const module of ['../src/registry.cjs','../src/rdp-credentials.cjs']) delete require.cache[require.resolve(module)];
  const registry=require('../src/registry.cjs');
  const credentials=require('../src/rdp-credentials.cjs');
  const host=registry.create({name:'credential-fixture',host:'example.invalid',os:'windows',defaultDirectory:'C:\\Users\\test'});
  assert.deepEqual(await credentials.get(host.id,{importExisting:false}),{found:true,username,password,source:'fixture'});
  assert.deepEqual(await credentials.set(host.id,username,password),{saved:true});
  assert.deepEqual(await credentials.status(host.id),{hasSavedCredential:true,username,source:'fixture'});
  assert.ok(!JSON.stringify(registry.get(host.id)).includes(password));
 } finally {
  if(prevHome===undefined) delete process.env.CLOUD_HOSTS_HOME;else process.env.CLOUD_HOSTS_HOME=prevHome;
  if(prevHelper===undefined) delete process.env.CLOUD_HOSTS_RDP_CREDENTIAL_HELPER;else process.env.CLOUD_HOSTS_RDP_CREDENTIAL_HELPER=prevHelper;
  for(const module of ['../src/registry.cjs','../src/rdp-credentials.cjs'])delete require.cache[require.resolve(module)];
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('Closing a previously-closed desktop is idempotent',async()=>{
 const {closeHostDesktop}=require('../src/desktops.cjs');
 const result=await closeHostDesktop('fake-host','00000000-0000-0000-0000-000000000000');
 assert.equal(result.closed,true);
 assert.equal(result.alreadyClosed,true);
});
