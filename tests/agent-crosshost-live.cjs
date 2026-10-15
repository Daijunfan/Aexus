// Opt-in live SSH regression: a real Codex controller and remote native exec-server,
// with a deterministic local Responses fixture and a temporary target directory.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const targetOS=process.argv[2];
if(!['gpu','windows'].includes(targetOS))throw Error('Usage: node tests/agent-crosshost-live.cjs gpu|windows');
const windows=targetOS==='windows';
const tag=randomUUID().slice(0,8),proof='CLOUDHOSTS_CROSSHOST_PROOF_'+tag;
const cwd=windows?'C:\\Users\\djf\\AppData\\Local\\Temp\\cloudhosts-agent-test-'+tag:'/tmp/cloudhosts-agent-test-'+tag;
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-ssh-test-')));
const executable=process.env.AGENT_TEST_CODEX||path.join(os.homedir(),'.npm-global/bin/codex');
if(!fs.existsSync(executable))throw Error('Real Codex CLI not installed at '+executable);
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const winCommand=script=>'powershell.exe -NoProfile -NonInteractive -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64');
const remote=(command)=>{
 const argv=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=12',...(windows?['-J','bupt208']:[]),windows?'DJF-Windows':'bupt208',command];
 const result=spawnSync('ssh',argv,{encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error('Remote command failed: '+(result.stderr||result.stdout).slice(-1000));
 return result.stdout.trim();
};
const remoteCommand=(win,linux)=>remote(windows?winCommand(win):linux);
const bodyDir=windows?"New-Item -ItemType Directory -Path '"+cwd+"' -Force | Out-Null":"mkdir -p "+quote(cwd);
const removeDir=windows?"Remove-Item -LiteralPath '"+cwd+"' -Force -Recurse -ErrorAction SilentlyContinue":"rm -rf -- "+quote(cwd);
const requests=[];
const prompt='Use your native shell tool to create route-proof.txt with the verification marker and print the target working directory.';
const model=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 if(!req.url.endsWith('/responses')){res.writeHead(404).end();return;}
 const request=JSON.parse(body);requests.push(request);
 const tools=[...(request.tools||[]),...(request.input||[]).filter(item=>item.type==='additional_tools').flatMap(item=>item.tools||[])];
 const names=tools.flatMap(tool=>tool.type==='namespace'?tool.tools.map(v=>v.name):[tool.name]);
 const command=windows?"Write-Output '"+proof+"' | Set-Content -LiteralPath route-proof.txt -Encoding UTF8; Get-Content route-proof.txt; (Get-Location).Path":"printf '"+proof+"' > route-proof.txt; cat route-proof.txt; pwd";
 let item;
 if(requests.length===1){
  const args={cmd:command,workdir:cwd,max_output_tokens:500,yield_time_ms:1000};
  if(names.includes('exec_command'))item={type:'function_call',id:'fc_1',call_id:'call_1',name:'exec_command',arguments:JSON.stringify(args)};
  else if(names.includes('exec'))item={type:'custom_tool_call',id:'fc_1',call_id:'call_1',name:'exec',input:'const result=await tools.exec_command('+JSON.stringify(args)+');text(result)'};
  else{res.writeHead(500).end('No native execution tool');return;}
 }else item={type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text:'CROSSHOST_COMPLETE'}]};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const event of [{type:'response.created',response:{id:'resp_'+requests.length,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp_'+requests.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');
 res.end();
});
(async()=>{
 fs.mkdirSync(path.join(temp,'codex-home'));
 Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CODEX_HOME:path.join(temp,'codex-home')});
 for(const key of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_EXEC_SERVER_URL'])delete process.env[key];
 remoteCommand(bodyDir,bodyDir);
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 const flags=['-c','model="gpt-5.1-codex"','-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${model.address().port}"`,'-c','model_providers.fixture.wire_api="responses"','-c','model_providers.fixture.requires_openai_auth=false','-c','model_providers.fixture.request_max_retries=0','-c','model_providers.fixture.stream_max_retries=0'];
 const wrapper=path.join(temp,'codex');fs.writeFileSync(wrapper,'#!/bin/sh\nexec '+[executable,...flags].map(quote).join(' ')+' "$@"\n',{mode:0o755});process.env.CLOUD_HOSTS_CODEX=wrapper;
 const registry=require('../src/registry.cjs'),native=require('../src/agent-native.cjs');
 const host=registry.create({name:windows?'Remote Windows Test':'Remote Linux Test',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:cwd});
 const role={id:randomUUID(),name:'Native remote work',engine:'codex',engineHostId:'local',targetHostId:host.id,cwd,permission:'full'};
 let client;
 const timeout=setTimeout(()=>{console.error('LIVE_CROSSHOST_TIMEOUT');void client?.close();model.closeAllConnections();process.exitCode=1;},120000);
 try{
  client=await native.open(role,()=>{});
  assert.equal(role.running,true);
  assert.equal(requests.length,0,'Creating a role must not call the model');
  await client.send(prompt);
  for(let i=0;i<850&&client.busy;i++)await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(client.busy,false,'Model turn did not finish');
  const events=client.read().events;
  assert.ok(events.some(x=>x.kind==='message'&&x.text==='CROSSHOST_COMPLETE'),JSON.stringify(events).slice(-3500));
  const data=remoteCommand("(Get-Content -LiteralPath '"+cwd+"\\route-proof.txt' -Raw).Trim()",'cat '+quote(cwd+'/route-proof.txt'));
  assert.equal(data,proof,'Tool output missing on actual remote work machine');
  assert.equal(fs.existsSync(path.join(temp,'route-proof.txt')),false,'Local controller was polluted');
  assert.ok(requests.length>=2,'Native tool result was not returned to model');
  const modelVisible=JSON.stringify({instructions:requests[0].instructions,input:requests[0].input,tools:requests[0].tools});
  assert.ok(modelVisible.includes(prompt));
  assert.doesNotMatch(modelVisible,/CODEX_EXEC_SERVER_URL|exec-server|CLOUDHOSTS_CROSSHOST_PROOF|\bSSH\b|cloud_hosts|Native remote work/i);
  assert.ok(events.some(x=>x.kind==='tool-result'&&x.text.includes(proof)));
  console.log('PASS_REAL_SSH_CROSSHOST='+targetOS+'; controller=Mac; work_host='+host.name+'; no_prompt_injection=YES; native_execution=YES');
 }finally{
  clearTimeout(timeout);await client?.close();model.closeAllConnections();await new Promise(resolve=>model.close(resolve));
  try{remoteCommand(removeDir,removeDir)}catch(error){console.error('Live fixture cleanup:',error.message)}
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
