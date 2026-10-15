const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-route-check-'));
process.env.CLOUD_HOSTS_HOME=path.join(root,'core');
const registry=require('../src/registry.cjs'),route=require('../src/agent-route-io.cjs');
const {LocalWorker}=require('./fixtures/local-workspace.cjs');
const work=path.join(root,'work'),control=path.join(root,'controller');
fs.mkdirSync(work);fs.mkdirSync(control);
const host=registry.create({name:'Private native execution',host:'unused.invalid',os:'macos',defaultDirectory:work});

test('native execution streams, cancels only its command, times out, reconnects without replay',async()=>{
 const workers=[];
 const bridge=await route.open({targetHostId:host.id,cwd:work},{controlCwd:control,createWorker:(id,cwd)=>{const worker=new LocalWorker(cwd);workers.push(worker);return worker}});
 const request=(operation,args={},signal)=>fetch(bridge.environment.CLOUD_HOSTS_ROUTE_URL,{method:'POST',headers:{authorization:'Bearer '+bridge.environment.CLOUD_HOSTS_ROUTE_TOKEN},body:JSON.stringify({operation,args}),signal});
 const call=async(operation,args)=>{const response=await request(operation,args),value=await response.json();if(value.error)throw Error(value.error);return value.result};
 try{
  const running=await request('execute',{command:'printf EARLY; sleep 0.8; printf LATE'});
  const reader=running.body.getReader(),first=await reader.read();
  assert.match(Buffer.from(first.value).toString(),/output/);
  assert.equal(workers.at(-1).child.exitCode,null,'Output arrives while the native command is running');
  let output=Buffer.from(first.value).toString();for(;;){const next=await reader.read();if(next.done)break;output+=Buffer.from(next.value).toString()}
  const frames=output.trim().split('\n').map(JSON.parse);
  assert.equal(frames.filter(f=>f.output).map(f=>Buffer.from(f.output.data,'base64').toString()).join(''),'EARLYLATE');
  assert.equal(frames.at(-1).result.exit_code,0);

  const timed=await request('execute',{command:'exec 1>&- 2>&-; sleep 10',timeout:.2});
  const timeoutResult=(await timed.text()).trim().split('\n').map(JSON.parse).at(-1).result;
  assert.equal(timeoutResult.exit_code,124,'Timeout also applies after output pipes close');
  assert.equal(timeoutResult.timed_out,true);

  const abort=new AbortController();
  const cancelled=await request('execute',{command:'printf STARTED; sleep 3; printf wrong > cancelled.txt'},abort.signal);
  await cancelled.body.getReader().read();const cancelledWorker=workers.at(-1);
  const parallel=await request('execute',{command:'sleep .2; printf kept > parallel.txt'});
  abort.abort();await parallel.text();
  if(cancelledWorker.child.exitCode===null)await once(cancelledWorker.child,'close');
  assert.equal(fs.readFileSync(path.join(work,'parallel.txt'),'utf8'),'kept');
  assert.equal(fs.existsSync(path.join(work,'cancelled.txt')),false);

  const fileWorker=workers[0];const ended=once(fileWorker.child,'close');fileWorker.close();await ended;
  await call('write',{path:path.join(control,'reconnected.txt'),data:Buffer.from('restored').toString('base64')});
  assert.equal(fs.readFileSync(path.join(work,'reconnected.txt'),'utf8'),'restored');
  assert.equal(fs.existsSync(path.join(control,'reconnected.txt')),false);
  assert.equal(workers.length,6,'One replacement file connection; commands are never replayed');
 }finally{await bridge.close();fs.rmSync(root,{recursive:true,force:true})}
});
