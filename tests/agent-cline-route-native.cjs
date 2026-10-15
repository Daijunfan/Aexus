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
 assert.equal(role.nativeHasInput,false);await terminals.close(terminal.id);
 role=await agents.activate({id:target.id,session:role.id});terminal={id:role.terminalId};assert.equal(role.nativeSessionId,sessionId);
 const emptyReady=Date.now()+20000;while(Date.now()<emptyReady){screen=(await terminals.read(terminal.id,0)).output;if(screen.includes('Ask anything'))break;await new Promise(r=>setTimeout(r,150))}
 assert.match(screen,/Ask anything/);assert.equal(requests.length,0);
 await terminals.input(terminal.id,'Read proof.txt.');await new Promise(r=>setTimeout(r,180));await terminals.input(terminal.id,'\r');
 const done=Date.now()+20000;while(Date.now()<done&&requests.length<turns.length+1)await new Promise(r=>setTimeout(r,100));
 console.log(JSON.stringify({requests:requests.length,tools:turns.map(t=>t[0])}));
 fs.writeFileSync('/tmp/cloudhosts-cline-hub-screen.txt',(await terminals.read(terminal.id,0)).output);
 assert.equal(requests.length,turns.length+1);
 assert.equal(agents.session(target.id,role.id).nativeHasInput,true,'A real submitted turn must be remembered before reconnect');
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
 console.log('PASS '+platform+' product-created original Mac Cline TUI/Core to original target executors, native read/write/edit/search/command, same-history TUI reconnect and Core-crash recovery, native target metadata, no routing prompt or source read');
 }finally{if(role)await agents.close({id:target.id,session:role.id});await agents.shutdown();await terminals.shutdown();await ssh.execute(target.id,command('rm -rf -- '+ssh.quote(work),'Remove-Item -LiteralPath '+ssh.psquote(work)+' -Recurse -Force -ErrorAction SilentlyContinue'),base,20);model.closeAllConnections();await new Promise(r=>model.close(r));fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
