// Opt-in reverse direction test: a real remote Codex controller uses Mac native tools
// through the private authenticated reverse-SSH route. No model turn is submitted.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const targetOS=process.argv[2];
if(!['gpu','windows'].includes(targetOS))throw Error('Usage: node tests/agent-origin-live.cjs gpu|windows');
const windows=targetOS==='windows',tag=randomUUID().slice(0,8),turn=process.argv.includes('--turn');
const proof='CLOUDHOSTS_REMOTE_SOURCE_PROOF_'+tag,requests=[],prompt='Use your native execution tool to create route-proof.txt with the verification marker in this workspace.';
const model=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 if(!req.url.endsWith('/responses')){res.writeHead(404).end();return;}
 const request=JSON.parse(body);requests.push(request);
 const tools=[...(request.tools||[]),...(request.input||[]).filter(x=>x.type==='additional_tools').flatMap(x=>x.tools||[])];
 const names=tools.flatMap(x=>x.type==='namespace'?x.tools.map(t=>t.name):[x.name]);
 let item;
 if(requests.length===1){
  const args={cmd:"printf '"+proof+"' > route-proof.txt; cat route-proof.txt; pwd",workdir:globalThis.__agentTestWorkdir,max_output_tokens:500,yield_time_ms:1000};
  if(names.includes('exec_command'))item={type:'function_call',id:'fc_1',call_id:'call_1',name:'exec_command',arguments:JSON.stringify(args)};
  else if(names.includes('exec'))item={type:'custom_tool_call',id:'fc_1',call_id:'call_1',name:'exec',input:'const result=await tools.exec_command('+JSON.stringify(args)+');text(result)'};
  else{res.writeHead(500).end('Native tool not available');return;}
 }else item={type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text:'REMOTE_SOURCE_COMPLETE'}]};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const e of [{type:'response.created',response:{id:'resp_'+requests.length,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp_'+requests.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n');res.end();
});
const remoteHome=windows?'C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-source-test-'+tag:'/tmp/cloudhosts-source-test-'+tag;
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-origin-test-')));
const winCommand=script=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64');
const remote=command=>{
 const result=spawnSync('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',...(windows?['-J','bupt208']:[]),windows?'DJF-Windows':'bupt208',command],{encoding:'utf8',timeout:25000});
 if(result.status)throw Error('Source host command failed: '+(result.stderr||result.stdout).slice(-1000));
};
const run=(win,linux)=>remote(windows?winCommand(win):linux);
(async()=>{
 const workDir=path.join(temp,'work');fs.mkdirSync(workDir);globalThis.__agentTestWorkdir=workDir;
 const setup=windows?"New-Item -ItemType Directory -Force -Path '"+remoteHome+"' | Out-Null":"mkdir -p '"+remoteHome+"'";
 const cleanup=windows?"Remove-Item -LiteralPath '"+remoteHome+"' -Force -Recurse -ErrorAction SilentlyContinue":"rm -rf -- '"+remoteHome+"'";
 run(setup,setup);
 process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
 process.env.CODEX_HOME=path.join(temp,'local-codex');fs.mkdirSync(process.env.CODEX_HOME);
 const registry=require('../src/registry.cjs'),hosts=require('../src/agent-hosts.cjs'),native=require('../src/agent-native.cjs'),routeTransport=require('../src/agent-route.cjs');
 const source=registry.create({name:windows?'Windows source':'GPU source',os:windows?'windows':'linux',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,defaultDirectory:windows?'C:\\Users\\djf':'/home/djf'});
 const initial=hosts.processOn;
 let providerForward;
 if(turn){await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));providerForward=await routeTransport.reverseForward(source,model.address().port)}
 const flags=turn?['-c','model="gpt-5.1-codex"','-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${providerForward.port}"`,'-c','model_providers.fixture.wire_api="responses"','-c','model_providers.fixture.requires_openai_auth=false','-c','model_providers.fixture.request_max_retries=0','-c','model_providers.fixture.stream_max_retries=0']:[];
 hosts.processOn=(host,engine,args,opts={})=>host.id===source.id?initial(host,engine,[...flags,...args],{...opts,environment:{...opts.environment,CODEX_HOME:remoteHome}}):initial(host,engine,args,opts);
 const role={id:randomUUID(),name:'Native source probe',engine:'codex',engineHostId:source.id,targetHostId:'local',cwd:workDir,permission:'full'};
 let client;const timer=setTimeout(()=>{console.error('REVERSE_ROUTING_TIMEOUT');process.exit(1)},110000);
 try{
  client=await native.open(role,()=>{});
  assert.equal(role.running,true);
  assert.ok(role.threadId);
  assert.equal(client.read().events.filter(event=>event.kind==='user').length,0,'No model task should be submitted on role creation');
  if(turn){
   await client.send(prompt);
   for(let i=0;i<900&&client.busy;i++)await new Promise(resolve=>setTimeout(resolve,60));
   assert.equal(client.busy,false,'Native source task did not complete');
   const events=client.read().events;
   assert.equal(fs.readFileSync(path.join(workDir,'route-proof.txt'),'utf8'),proof);
   assert.ok(events.some(e=>e.kind==='message'&&e.text==='REMOTE_SOURCE_COMPLETE'),JSON.stringify(events).slice(-2500));
   assert.ok(requests.length>=2,'Real remote source did not receive tool result');
   assert.doesNotMatch(JSON.stringify({instructions:requests[0].instructions,input:requests[0].input,tools:requests[0].tools}),/CODEX_EXEC_SERVER_URL|exec-server|cloud_hosts|Native source probe|\\bSSH\\b/i);
   console.log('PASS_REMOTE_SOURCE_EXECUTION='+targetOS+'; model_seen_no_route=YES; native_tool_ran_on_Mac=YES');
  }else console.log('PASS_REVERSE_SSH_SOURCE='+targetOS+'; engine_host='+source.name+'; work_host=Mac; routing=private_native; prompt_count=0');
 }finally{
  clearTimeout(timer);await client?.close();hosts.processOn=initial;
  if(providerForward)await routeTransport.stop(providerForward.child);
  if(model.listening){model.closeAllConnections();await new Promise(resolve=>model.close(resolve))}
  try{run(cleanup,cleanup)}catch(error){console.error('Source test cleanup:',error.message)}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
