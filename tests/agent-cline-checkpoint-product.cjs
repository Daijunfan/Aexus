// Product-created Mac Cline native TUI/Core, original executors over real SSH, isolated model fixture.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync('/tmp/cloudhosts-cline-hub-');
Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CLINE_DIR:path.join(temp,'profile'),CLINE_DATA_DIR:path.join(temp,'profile/data')});
const sdkFile=require('node:url').pathToFileURL(path.resolve(__dirname,'../Runtime/cline_sdk.mjs')).href;
let control=path.join(temp,'control');fs.mkdirSync(control);
fs.writeFileSync(path.join(control,'proof.txt'),'LOCAL_SHOULD_NOT_READ');
const project=path.resolve(__dirname,'..');
const registry=require(project+'/src/registry.cjs'),ssh=require(project+'/src/ssh.cjs');
const windows=process.argv.includes('windows'),base=windows?'C:\\Users\\djf':'/tmp',platform=windows?'win32':'linux';
const target=registry.create({name:'Native Cline work',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:base}),work=windows?path.win32.join(base,'AppData','Local','Temp',path.basename(temp)+'-work'):'/tmp/'+path.basename(temp)+'-work';
const command=(linux,win)=>windows?win:linux;
const requests=[],turns=[['editor',{path:work+'/second.txt',new_text:'NATIVE_TOOLCHAIN_PROOF\n'}],['read_files',{files:[{path:work+'/second.txt'}]}],['search_codebase',{queries:['NATIVE_TOOLCHAIN_PROOF']}],['run_commands',{commands:[command('cat second.txt; pwd','Get-Content -LiteralPath second.txt; (Get-Location).Path')]}],['editor',{path:work+'/second.txt',old_text:'NATIVE_TOOLCHAIN_PROOF',new_text:'NATIVE_TOOLCHAIN_CHANGED'}],['read_files',{files:[{path:work+'/second.txt'}]}]];
const model=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;if(req.method!=='POST'){res.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');return}const body=JSON.parse(raw);requests.push(body);const turn=turns[requests.length-1],tool=!turn;const delta=turn?{role:'assistant',tool_calls:[{index:0,id:'probe-'+requests.length,type:'function',function:{name:turn[0],arguments:JSON.stringify(turn[1])}}]}:{role:'assistant',content:'NATIVE_HUB_DONE'};res.writeHead(200,{'content-type':'text/event-stream'});for(const[d,f]of [[delta,null],[{},tool?'stop':'tool_calls']])res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'native-fixture',choices:[{index:0,delta:d,finish_reason:f}]})+'\n\n');res.end('data: [DONE]\n\n')});
(async()=>{let role,terminal;const terminals=require('../src/terminals.cjs'),agents=require('../src/agent-sessions.cjs');try{
 const identity=await ssh.execute(target.id,command('hostname','[Environment]::MachineName; (Get-CimInstance Win32_ComputerSystem).Model'),base,20);assert.ok(windows?identity.stdout.includes('DJF')&&identity.stdout.includes('90YS0006CP'):identity.stdout.trim()==='gpubupt208');
 assert.equal((await ssh.execute(target.id,command('mkdir -p -- '+ssh.quote(work),'New-Item -ItemType Directory -Path '+ssh.psquote(work)+' -Force|Out-Null'),base,20)).exit_code,0);
 const initial=await ssh.files(target.id,'native_io',{operation:'write',args:{path:'tracked.txt',data:Buffer.from('checkpoint baseline\n').toString('base64')}},work);
 assert.equal(initial,true);
 const repository=await ssh.execute(target.id,'git init; git config user.name Native-QA; git config user.email native-qa@localhost; git config core.autocrlf false; git add tracked.txt; git commit -m checkpoint-baseline',work,30);assert.equal(repository.exit_code,0,repository.stderr);
 await ssh.files(target.id,'native_io',{operation:'write',args:{path:'before.txt',data:Buffer.from('untracked before task\n').toString('base64')}},work);
 await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const settings=path.join(process.env.CLINE_DATA_DIR,'settings');fs.mkdirSync(settings,{recursive:true});
 const baseUrl='http://127.0.0.1:'+model.address().port+'/v1';
 const provider={provider:'openai-compatible',model:'native-fixture',apiKey:'fixture-only',baseUrl};
 fs.writeFileSync(path.join(settings,'providers.json'),JSON.stringify({version:1,lastUsedProvider:'openai-compatible',modes:{},providers:{'openai-compatible':{settings:provider,updatedAt:new Date().toISOString(),tokenSource:'manual'}}}));
 fs.writeFileSync(path.join(settings,'models.json'),JSON.stringify({version:1,providers:{'openai-compatible':{models:{'native-fixture':{id:'native-fixture',name:'Native Fixture'}}}}}));
 role=await agents.open({engineHostId:'local',targetHostId:target.id,engine:'cline',directory:work,name:'Native Cline work QA'});
 control=role.controlCwd;terminal={id:role.terminalId};
 const sessionId=role.nativeSessionId;assert.ok(sessionId);
 let screen='';const ready=Date.now()+20000;while(Date.now()<ready){screen=(await terminals.read(terminal.id,0)).output;if(screen.includes('Ask anything'))break;await new Promise(r=>setTimeout(r,150))}
 assert.match(screen,/Ask anything/);assert.equal(requests.length,0);
 await terminals.input(terminal.id,'Read proof.txt.');await new Promise(r=>setTimeout(r,180));await terminals.input(terminal.id,'\r');
 const done=Date.now()+20000;while(Date.now()<done&&requests.length<turns.length+1)await new Promise(r=>setTimeout(r,100));
 console.log(JSON.stringify({requests:requests.length,tools:turns.map(t=>t[0])}));
 fs.writeFileSync('/tmp/cloudhosts-cline-hub-screen.txt',(await terminals.read(terminal.id,0)).output);
 assert.equal(requests.length,turns.length+1);
 const results=requests.at(-1).messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content)).flat();
 assert.ok(results.every(result=>result.success!==false),JSON.stringify(results));
 assert.ok(JSON.stringify(results).includes('NATIVE_TOOLCHAIN_CHANGED'));
 await new Promise(r=>setTimeout(r,500));
 await terminals.close(terminal.id);
 const before=requests.length;
 role=await agents.activate({id:target.id,session:role.id});assert.equal(role.nativeSessionId,sessionId);terminal={id:role.terminalId};
 const resumed=Date.now()+15000;let restored='';while(Date.now()<resumed){restored=(await terminals.read(terminal.id,0)).output;if(restored.includes('NATIVE_HUB_DONE'))break;await new Promise(r=>setTimeout(r,150))}
 assert.ok(restored.includes('NATIVE_HUB_DONE'),'Original native TUI must show its previous task after reconnect');
 assert.equal(requests.length,before,'Reattachment must not start a model turn');
 const nativeHub=JSON.parse(fs.readFileSync(path.join(control,'cline-hub.json'),'utf8'));
 assert.ok(Number.isInteger(nativeHub.pid)&&nativeHub.pid!==process.pid);process.kill(nativeHub.pid,'SIGKILL');
 const stopped=Date.now()+6000;while(Date.now()<stopped&&agents.session(target.id,role.id).running)await new Promise(r=>setTimeout(r,50));
 assert.equal(agents.session(target.id,role.id).running,false,'A lost native Core must close its TUI before any local fallback');
 await assert.rejects(async()=>terminals.input(terminal.id,'must never run locally'),/exited|Unknown terminal/);
 role=await agents.activate({id:target.id,session:role.id});terminal={id:role.terminalId};
 assert.equal(role.nativeSessionId,sessionId);
 const recovered=Date.now()+15000;let recoveredScreen='';while(Date.now()<recovered){recoveredScreen=(await terminals.read(terminal.id,0)).output;if(recoveredScreen.includes('NATIVE_HUB_DONE'))break;await new Promise(r=>setTimeout(r,150))}
 assert.ok(recoveredScreen.includes('NATIVE_HUB_DONE'));assert.equal(requests.length,before);
 await new Promise(r=>setTimeout(r,300));await terminals.input(terminal.id,'Reply after recovering the same native session.');
 await new Promise(r=>setTimeout(r,180));await terminals.input(terminal.id,'\r');
 const nextTurn=Date.now()+15000;while(Date.now()<nextTurn&&requests.length===before)await new Promise(r=>setTimeout(r,100));
 assert.equal(requests.length,before+1);await new Promise(r=>setTimeout(r,500));
 const {sdk}=await import(sdkFile),history=await sdk.ClineCore.create({backendMode:'local',automation:{autoStart:false}});
 try{assert.ok(JSON.stringify(await history.readMessages(sessionId)).includes('Reply after recovering the same native session.'),'The resumed task must be persisted under the original native ID')}finally{await history.dispose('verification')}
 assert.ok(!JSON.stringify(requests).includes('LOCAL_SHOULD_NOT_READ'),'No original local tool fallback');
 assert.ok(!JSON.stringify(requests).includes(control),'No controller work directory in native model context');
 assert.ok(JSON.stringify(requests[0]).includes('Platform: '+platform));if(windows)assert.match(requests[0].tools.find(tool=>tool.function?.name==='run_commands').function.description,/PowerShell/);
 const connection=JSON.parse(fs.readFileSync(path.join(control,'cline-hub.json'),'utf8'));
 const native=await sdk.ClineCore.create({backendMode:'hub',hub:{endpoint:connection.url,authToken:connection.authToken,workspaceRoot:control},automation:{autoStart:false}});
 try{
  const record=await native.get(sessionId),history=sdk.readSessionCheckpointHistory(record);
  assert.ok(history.some(entry=>entry.runCount===1),'Original Core must persist the remote checkpoint');
  assert.equal(history.find(entry=>entry.runCount===1).kind,'stash','Untracked files must be captured');
  // A failed chat restore must restore both the previous files and staging area.
  await ssh.execute(target.id,'git add second.txt',work,20);
  const beforeIndex=(await ssh.execute(target.id,'git write-tree',work,20)).stdout.trim();
  const beforeHash=await ssh.files(target.id,'native_io',{operation:'read',args:{path:'second.txt'}},work);
  const {ClineWorker}=require('../src/agent-cline-worker.cjs'),worker=new ClineWorker(target.id,work);
  const checkpoint=(operation,args)=>worker.request('checkpoint',[{operation,...args}]);
  let applied=false;
  try{
   await worker.request('initialize');
   await assert.rejects(new sdk.SessionVersioningService().restoreCheckpoint({sessionId,checkpointRunCount:1,start:{},restore:{messages:true,workspace:true},
    getSession:()=>native.get(sessionId),readMessages:()=>native.readMessages(sessionId),
    applyWorkspaceCheckpoint:async(_,entry)=>{await checkpoint('restore',{sessionId,checkpoint:entry});applied=true;assert.equal((await ssh.files(target.id,'native_io',{operation:'stat',args:{path:'second.txt'}},work)).exists,false)},
    beginWorkspaceRestoreTransaction:async()=>{
     const backupId='restore-'+require('node:crypto').randomUUID(),backup=await checkpoint('create',{sessionId:backupId,runCount:1});
     return {commit:()=>checkpoint('release',{sessionId:backupId,runCount:1}),rollback:async()=>{await checkpoint('rollback',{sessionId:backupId,checkpoint:backup});await checkpoint('release',{sessionId:backupId,runCount:1})}};
    },
    startSession:async()=>{throw Error('Simulated native session persistence failure')},getStartedSessionId:result=>result.sessionId,cleanupStartedSession:async()=>{}
   }),/Simulated native session persistence failure/);
   assert.ok(applied,'Failure must occur after the target workspace was restored');
  }finally{worker.close()}
  assert.deepEqual(await ssh.files(target.id,'native_io',{operation:'read',args:{path:'second.txt'}},work),beforeHash);
  assert.equal((await ssh.execute(target.id,'git write-tree',work,20)).stdout.trim(),beforeIndex);
  const restored=await native.restore({sessionId,checkpointRunCount:1,start:{source:'cli',interactive:true,config:{cwd:control,providerId:provider.provider,modelId:provider.model,apiKey:provider.apiKey,baseUrl,providerConfig:provider,enableTools:true,enableSpawnAgent:true,enableAgentTeams:true}},restore:{messages:true,workspace:true}});
  assert.ok(restored.sessionId&&restored.sessionId!==sessionId);
  const gone=await ssh.files(target.id,'native_io',{operation:'stat',args:{path:'second.txt'}},work);assert.equal(gone.exists,false,'Remote edits after the selected checkpoint are removed');
  assert.equal(Buffer.from((await ssh.files(target.id,'native_io',{operation:'read',args:{path:'before.txt'}},work)).data,'base64').toString(),'untracked before task\n');
  await new Promise(r=>setTimeout(r,150));
  assert.equal(agents.session(target.id,role.id).nativeSessionId,restored.sessionId,'The Agent follows the native restore fork');
  const committed=await ssh.execute(target.id,'git add before.txt; git commit -m user-change-after-checkpoint',work,20);assert.equal(committed.exit_code,0,committed.stderr);
  const head=(await ssh.execute(target.id,'git rev-parse HEAD',work,20)).stdout.trim();
  await assert.rejects(native.restore({sessionId:restored.sessionId,checkpointRunCount:1,restore:{messages:false,workspace:true}}),/commit|branch/i);
  assert.equal((await ssh.execute(target.id,'git rev-parse HEAD',work,20)).stdout.trim(),head,'A restore must never discard later commits');
  await terminals.close(role.terminalId);role=await agents.activate({id:target.id,session:role.id});
  assert.equal(role.nativeSessionId,restored.sessionId);
  console.log('PASS native checkpoint creation, target-only restore, failure rollback with original index, native history fork and reconnect');
 }finally{await native.dispose('verification')}
 console.log('PASS '+platform+' product-created original Mac Cline TUI/Core to original target executors, native read/write/edit/search/command, same-history TUI reconnect and Core-crash recovery, native target metadata, no routing prompt or source read');
 }finally{if(role)await agents.close({id:target.id,session:role.id});await agents.shutdown();await terminals.shutdown();await ssh.execute(target.id,command('rm -rf -- '+ssh.quote(work),'Remove-Item -LiteralPath '+ssh.psquote(work)+' -Recurse -Force -ErrorAction SilentlyContinue'),base,20);model.closeAllConnections();await new Promise(r=>model.close(r));fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
