// Opt-in real SSH native Codex: cloud-source -> different cloud-target.
// The model provider is an isolated deterministic localhost fixture.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const [sourceOS,targetOS]=process.argv.slice(2);
if(!['gpu','windows'].includes(sourceOS)||!['gpu','windows'].includes(targetOS)||sourceOS===targetOS)
 throw Error('Usage: node tests/agent-remote-mesh-live.cjs gpu windows | windows gpu');
const sourceWindows=sourceOS==='windows',targetWindows=targetOS==='windows';
const tag=randomUUID().slice(0,8),proof='CLOUDHOSTS_MESH_PROOF_'+tag;
const sourceDir=sourceWindows?'C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-mesh-source-'+tag:'/tmp/cloudhosts-mesh-source-'+tag;
const cwd=targetWindows?'C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-mesh-work-'+tag:'/tmp/cloudhosts-mesh-work-'+tag;
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-mesh-')));
const winCommand=script=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64');
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
function remote(host,winScript,linuxScript){
 const args=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12',...(host==='windows'?['-J','bupt208']:[]),host==='windows'?'DJF-Windows':'bupt208',host==='windows'?winCommand(winScript):linuxScript];
 const result=spawnSync('ssh',args,{encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error(host+' command: '+(result.stderr||result.stdout).slice(-1500));
 return result.stdout.trim();
}
const setup=(host,cwd)=>remote(host,"New-Item -ItemType Directory -Path '"+cwd+"' -Force|Out-Null",'mkdir -p '+quote(cwd));
const cleanup=(host,cwd)=>remote(host,"Remove-Item -LiteralPath '"+cwd+"' -Recurse -Force -ErrorAction SilentlyContinue",'rm -rf -- '+quote(cwd));
const requests=[],prompt='Use the standard native command tool in the current workspace and verify the saved marker.';
const model=http.createServer(async(req,res)=>{
 let body='';for await(const c of req)body+=c;
 if(!req.url.endsWith('/responses')){res.writeHead(404).end();return;}
 const request=JSON.parse(body);requests.push(request);
 const tools=[...(request.tools||[]),...(request.input||[]).filter(item=>item.type==='additional_tools').flatMap(item=>item.tools||[])];
 const names=tools.flatMap(tool=>tool.type==='namespace'?tool.tools.map(i=>i.name):[tool.name]);
 const command=targetWindows?"Write-Output '"+proof+"' | Set-Content -LiteralPath route-proof.txt -Encoding UTF8; Get-Content route-proof.txt; (Get-Location).Path":"printf '"+proof+"' > route-proof.txt; cat route-proof.txt; pwd";
 let item;
 if(requests.length===1){
  const args={cmd:command,workdir:cwd,max_output_tokens:500,yield_time_ms:1000};
  if(names.includes('exec_command'))item={type:'function_call',id:'fc_1',call_id:'call_1',name:'exec_command',arguments:JSON.stringify(args)};
  else if(names.includes('exec'))item={type:'custom_tool_call',id:'fc_1',call_id:'call_1',name:'exec',input:'const result=await tools.exec_command('+JSON.stringify(args)+');text(result)'};
  else{res.writeHead(500).end('Native remote tool unavailable');return;}
 }else item={type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text:'MESH_COMPLETE'}]};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const e of [{type:'response.created',response:{id:'resp_'+requests.length,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp_'+requests.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n');
 res.end();
});
(async()=>{
 setup(sourceOS,sourceDir);setup(targetOS,cwd);
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
 const registry=require('../src/registry.cjs'),hosts=require('../src/agent-hosts.cjs'),native=require('../src/agent-native.cjs'),transport=require('../src/agent-route.cjs');
 const source=registry.create({name:'Mesh source',host:sourceWindows?'DJF-Windows':'bupt208',jump:sourceWindows?'bupt208':undefined,os:sourceWindows?'windows':'linux',defaultDirectory:sourceWindows?'C:\\Users\\djf':'/home/djf'});
 const target=registry.create({name:'Mesh target',host:targetWindows?'DJF-Windows':'bupt208',jump:targetWindows?'bupt208':undefined,os:targetWindows?'windows':'linux',defaultDirectory:cwd});
 let provider;let client;const original=hosts.processOn;
 const timer=setTimeout(()=>{console.error('CLOUDHOSTS_MESH_TIMEOUT');process.exit(1)},125000);
 try{
  provider=await transport.reverseForward(source,model.address().port);
  const flags=['-c','model="gpt-5.1-codex"','-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${provider.port}"`,'-c','model_providers.fixture.wire_api="responses"','-c','model_providers.fixture.requires_openai_auth=false','-c','model_providers.fixture.request_max_retries=0','-c','model_providers.fixture.stream_max_retries=0'];
  hosts.processOn=(host,engine,args,options={})=>host.id===source.id?original(host,engine,[...flags,...args],{...options,environment:{...options.environment,CODEX_HOME:sourceDir}}):original(host,engine,args,options);
  const role={id:randomUUID(),name:'Remote mesh test',engine:'codex',engineHostId:source.id,targetHostId:target.id,cwd,permission:'full'};
  client=await native.open(role,()=>{});
  assert.equal(role.running,true);assert.equal(requests.length,0,'No model turn when role is created');
  await client.send(prompt);
  for(let i=0;i<850&&client.busy;i++)await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(client.busy,false,'Routed native model turn did not finish');
  const events=client.read().events;
  assert.ok(events.some(x=>x.kind==='message'&&x.text==='MESH_COMPLETE'),JSON.stringify(events).slice(-3800));
  const output=remote(targetOS,"(Get-Content -LiteralPath '"+cwd+"\\route-proof.txt' -Raw).Trim()",'cat '+quote(cwd+'/route-proof.txt'));
  assert.equal(output,proof,'Remote-target native tool did not create the expected file');
  const noSourceProof=remote(sourceOS,"!(Test-Path -LiteralPath '"+sourceDir+"\\route-proof.txt')",'test ! -e '+quote(sourceDir+'/route-proof.txt')+' && echo True');
  assert.ok(/true/i.test(noSourceProof),'Native execution leaked to engine source');
  assert.ok(requests.length>=2,'Native tool reply did not return to remote source');
  const visible=JSON.stringify({instructions:requests[0].instructions,input:requests[0].input,tools:requests[0].tools});
  assert.ok(visible.includes(prompt));
  assert.doesNotMatch(visible,/CODEX_EXEC_SERVER_URL|exec-server|cloud_hosts|Remote mesh test|\\bSSH\\b/i);
  console.log('PASS_CLOUD_TO_CLOUD_NATIVE='+sourceOS+'->'+targetOS+'; correct_work_host=YES; source_clean=YES; no_route_prompt=YES');
 }finally{
  clearTimeout(timer);
  await client?.close();hosts.processOn=original;
  if(provider)await transport.stop(provider.child);
  model.closeAllConnections();await new Promise(resolve=>model.close(resolve));
  for(const [host,dir] of [[targetOS,cwd],[sourceOS,sourceDir]])try{cleanup(host,dir)}catch(error){console.error('Cleanup:',error.message)}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
