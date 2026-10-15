// Real Mac Claude model loop + original tools over SSH. Model replies are local fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const temp=fs.mkdtempSync('/tmp/cloudhosts-claude-route-'),profile=path.join(temp,'profile');let control=path.join(temp,'controller');
fs.mkdirSync(control);fs.mkdirSync(profile);Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CLAUDE_CONFIG_DIR:profile,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'});
fs.writeFileSync(path.join(profile,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,lastOnboardingVersion:'2.1.299'}));
const registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs'),route=require('../src/agent-claude-route.cjs');
const windows=process.argv.includes('windows'),base=windows?'C:\\Users\\djf':'/tmp';
const host=registry.create({name:'Native work',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:base}),work=windows?path.win32.join(base,'AppData','Local','Temp',path.basename(temp)+'-work'):'/tmp/'+path.basename(temp)+'-work';
const command=(linux,win)=>windows?win:linux;
const requests=[],metadataRequests=[],turns=[['Write',{file_path:work+'/proof.txt',content:'ORIGINAL_CLAUDE_PROOF\n'}],['Read',{file_path:work+'/proof.txt'}],
 ['Edit',{file_path:work+'/proof.txt',old_string:'ORIGINAL_CLAUDE_PROOF',new_string:'ORIGINAL_CLAUDE_CHANGED'}],['Bash',{command:'cat proof.txt; pwd'}]];
const model=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 if(!/^\/v1\/messages(?:\?|$)/.test(req.url)){res.writeHead(200,{'content-type':'application/json'}).end('{}');return}
 const body=JSON.parse(raw),main=body.tools?.some(tool=>tool.name==='Write');
 (main?requests:metadataRequests).push(body);const turn=main?turns[requests.length-1]:undefined,id='native-'+requests.length+'-'+metadataRequests.length;
 res.writeHead(200,{'content-type':'text/event-stream'});
 const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n');
 event('message_start',{message:{id,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:100,output_tokens:1}}});
 event('content_block_start',{index:0,content_block:turn?{type:'tool_use',id,name:turn[0],input:{}}:{type:'text',text:''}});
 event('content_block_delta',{index:0,delta:turn?{type:'input_json_delta',partial_json:JSON.stringify(turn[1])}:{type:'text_delta',text:main?'ORIGINAL_CLAUDE_DONE':'Native route QA'}});
 event('content_block_stop',{index:0});event('message_delta',{delta:{stop_reason:turn?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});event('message_stop',{});res.end();
});
(async()=>{let role;const agents=require('../src/agent-sessions.cjs'),terminals=require('../src/terminals.cjs');try{
 if(process.argv.includes('--lifecycle')){
  const close=terminals.close;let sequence=0;
  terminals.close=async id=>{try{fs.writeFileSync('/tmp/cloudhosts-claude-lifecycle-close-'+(++sequence)+'.txt',(await terminals.read(id,0)).output)}catch{};return close(id)};
 }
 const identity=await ssh.execute(host.id,command('hostname','[Environment]::MachineName; (Get-CimInstance Win32_ComputerSystem).Model'),base,20);assert.ok(windows?identity.stdout.includes('DJF')&&identity.stdout.includes('90YS0006CP'):identity.stdout.trim()==='gpubupt208');
 assert.equal((await ssh.execute(host.id,command('mkdir -p -- '+ssh.quote(work),'New-Item -ItemType Directory -Path '+ssh.psquote(work)+' -Force|Out-Null'),base,20)).exit_code,0);
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({model:'native-fixture',env:{ANTHROPIC_BASE_URL:'http://127.0.0.1:'+model.address().port,ANTHROPIC_AUTH_TOKEN:'fixture-only'}}));
 role=await agents.open({engineHostId:'local',targetHostId:host.id,engine:'claude',directory:work,name:'Native Claude route QA',permission:'full'});
 control=role.controlCwd;const sessionId=role.nativeSessionId;
 assert.equal(requests.length+metadataRequests.length,0,'Attaching the native TUI must not send a prompt');
 await new Promise(r=>setTimeout(r,900));
 await terminals.close(role.terminalId);
 role=await agents.activate({id:host.id,session:role.id});assert.equal(role.nativeSessionId,sessionId);
 assert.equal(requests.length+metadataRequests.length,0,'An untouched native session reconnect must not invent a prompt');
 await new Promise(r=>setTimeout(r,900));
 await terminals.input(role.terminalId,'Perform the requested file operations and finish.');
 await new Promise(r=>setTimeout(r,200));await terminals.input(role.terminalId,'\r');
 const deadline=Date.now()+35000;while(Date.now()<deadline&&requests.length<turns.length+1)await new Promise(r=>setTimeout(r,100));
 fs.writeFileSync('/tmp/cloudhosts-claude-product-screen.txt',(await terminals.read(role.terminalId,0)).output);
 assert.equal(requests.length,turns.length+1);
 const results=requests.at(-1).messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(block=>block.type==='tool_result');
 assert.equal(results.length,turns.length);assert.ok(results.every(result=>!result.is_error),JSON.stringify(results));
 const content=await ssh.files(host.id,'native_io',{operation:'read',args:{path:'proof.txt'}},work);
 assert.equal(Buffer.from(content.data,'base64').toString(),'ORIGINAL_CLAUDE_CHANGED\n');assert.equal(fs.existsSync(path.join(control,'proof.txt')),false);
 const first=JSON.stringify({system:requests[0].system,messages:requests[0].messages});
 if(first.includes(control)||first.includes(fs.realpathSync(control)))fs.writeFileSync('/tmp/cloudhosts-claude-route-first.json',JSON.stringify({system:requests[0].system,messages:requests[0].messages},null,2));
 assert.ok(!first.includes(control)&&!first.includes(fs.realpathSync(control)),'Controller directory must not enter model context');
 assert.ok(first.includes(JSON.stringify(work).slice(1,-1)),'The native model sees the work directory');
 assert.ok(first.includes('Platform: '+(windows?'win32':'linux')));
 assert.doesNotMatch(first,/cloud_docs|cloud_api|CLOUD_HOSTS_|native-execution|native-session-state|session-state.json|via SSH|routing instructions/);
 await new Promise(r=>setTimeout(r,700));
 await terminals.close(role.terminalId);const before=requests.length;
 role=await agents.activate({id:host.id,session:role.id});assert.equal(role.nativeSessionId,sessionId);
 const until=Date.now()+15000;let output='';while(Date.now()<until){output=(await terminals.read(role.terminalId,0)).output;if(output.includes('ORIGINAL_CLAUDE_DONE'))break;await new Promise(r=>setTimeout(r,150))}
 fs.writeFileSync('/tmp/cloudhosts-claude-product-resumed.txt',output);
 assert.ok(output.includes('ORIGINAL_CLAUDE_DONE'),'Native TUI must restore its exact history');
 assert.equal(requests.length,before,'Recovery must not submit a prompt');
 if(process.argv.includes('--lifecycle')){
  await terminals.input(role.terminalId,'/clear');await new Promise(r=>setTimeout(r,200));await terminals.input(role.terminalId,'\r');
  const deadline=Date.now()+10000;let cursor;
  while(Date.now()<deadline){cursor=JSON.parse(fs.readFileSync(role.nativeStateFile,'utf8'));if(cursor.sessionId!==sessionId&&!cursor.hasInput)break;await new Promise(r=>setTimeout(r,100))}
  assert.notEqual(cursor.sessionId,sessionId,'The native clear action creates its own new identity');assert.equal(cursor.hasInput,false);
  await terminals.close(role.terminalId);role=await agents.activate({id:host.id,session:role.id});assert.equal(role.nativeSessionId,cursor.sessionId);
  assert.equal(requests.length,before,'Reconnecting a cleared native session must not manufacture a turn');
  await new Promise(r=>setTimeout(r,900));await terminals.input(role.terminalId,'Reply after native clear.');await new Promise(r=>setTimeout(r,200));await terminals.input(role.terminalId,'\r');
  const done=Date.now()+15000;while(Date.now()<done&&requests.length===before)await new Promise(r=>setTimeout(r,100));
  assert.equal(requests.length,before+1);assert.doesNotMatch(JSON.stringify(requests.at(-1).messages),/ORIGINAL_CLAUDE_PROOF|Perform the requested file operations/);
 }
 if(process.argv.includes('--interactions')){
  await terminals.input(role.terminalId,'Read @proof.txt and reply.');await new Promise(r=>setTimeout(r,200));await terminals.input(role.terminalId,'\r');
  const mentionDeadline=Date.now()+15000;while(Date.now()<mentionDeadline&&requests.length===before)await new Promise(r=>setTimeout(r,100));
  assert.equal(requests.length,before+1);
  assert.ok(JSON.stringify(requests.at(-1).messages.at(-1)).includes('ORIGINAL_CLAUDE_CHANGED'),'Native @file must attach the target file');
  assert.ok(!JSON.stringify(requests.at(-1)).includes('native-attachments'),'Attachment staging paths must not enter model context');
  await new Promise(r=>setTimeout(r,600));
  await terminals.input(role.terminalId,'!printf NATIVE_DIRECT_SHELL > direct-shell.txt');await new Promise(r=>setTimeout(r,200));await terminals.input(role.terminalId,'\r');
  const shellDeadline=Date.now()+10000;let direct;while(Date.now()<shellDeadline){direct=await ssh.files(host.id,'native_io',{operation:'stat',args:{path:'direct-shell.txt'}},work);if(direct.exists)break;await new Promise(r=>setTimeout(r,200))}
  fs.writeFileSync('/tmp/cloudhosts-claude-interactions-screen.txt',(await terminals.read(role.terminalId,0)).output);console.log(JSON.stringify({directRemote:direct?.exists,directLocal:fs.existsSync(path.join(control,'direct-shell.txt'))}));
  assert.ok(direct?.exists,'Native ! shell commands must execute on the work host');
  assert.equal(fs.existsSync(path.join(control,'direct-shell.txt')),false,'Shell mode must never fall back to the controller');
 }
 console.log('PASS '+(windows?'Windows':'Linux')+' product-created native Claude TUI, original target tools, exact native history after reconnect, shared native settings, no routing prompt');
 }finally{if(role)await agents.close({id:host.id,session:role.id});await agents.shutdown();await terminals.shutdown();await ssh.execute(host.id,command('rm -rf -- '+ssh.quote(work),'Remove-Item -LiteralPath '+ssh.psquote(work)+' -Recurse -Force -ErrorAction SilentlyContinue'),base,20);model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
