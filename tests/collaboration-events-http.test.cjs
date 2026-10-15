const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-live-events-'));
const app=path.resolve(__dirname,'..');
async function wait(fn){
 for(let i=0;i<120;i++){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,75))}
 throw Error('Native SSE test server did not become ready; rebuild release fingerprint before testing');
}
test('authenticated native SSE refresh emits actual group changes without leaking content',async()=>{
 const child=spawn(process.execPath,['cli.cjs','serve'],{cwd:app,env:{...process.env,CLOUD_HOSTS_HOME:home},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',data=>logs+=String(data));child.stderr.on('data',data=>logs+=String(data));
 let reader;
 try{
  const state=await wait(()=>{
   const file=path.join(home,'server.json');
   if(!fs.existsSync(file))return null;return JSON.parse(fs.readFileSync(file,'utf8'));
  });
  const payload=async(method,params={})=>{
   const response=await fetch(state.url+'rpc',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(row=>row.json());
   if(response.error)throw Error(response.error.message);return response.result;
  };
  const unauthenticated=await fetch('http://127.0.0.1:'+state.port+'/events');
  assert.equal(unauthenticated.status,404);
  const forged=await fetch(state.url+'events',{headers:{origin:'https://unauthorized.example'}});
  assert.equal(forged.status,403);
  const stream=await fetch(state.url+'events',{headers:{accept:'text/event-stream'}});
  assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  reader=stream.body.getReader();
  const group=await payload('messages.create',{name:'Events',memberIds:[]});
  await payload('messages.post',{id:group.id,text:'Privacy-sensitive content',kind:'note'});
  const decode=new TextDecoder();let received='',event;
  for(let i=0;i<30;i++){
   const value=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error('SSE timeout')),1800))]);
   if(value.done)break;received+=decode.decode(value.value,{stream:true});
   const entry=received.match(/^data: (.+)$/m);
   if(entry){event=JSON.parse(entry[1]);break}
  }
  assert.equal(event?.kind,'group-message');assert.equal(event?.groupId,group.id);
  assert.equal('text' in event,false);assert.equal(received.includes('Privacy-sensitive content'),false);
 }finally{
  if(reader)await Promise.race([reader.cancel().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('close',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);
  }
  fs.rmSync(home,{recursive:true,force:true});
 }
});
