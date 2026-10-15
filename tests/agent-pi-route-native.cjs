// Actual Pi CLI + standard tools; execution crosses a private transport into
// a separate workspace. Model responses and both workspaces are disposable.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const mode=process.argv[2]||'local';assert.ok(['local','gpu','windows'].includes(mode));
const remote=mode!=='local',windows=mode==='windows',product=process.argv.includes('--tui');
assert.ok(!product||remote,'Product TUI test needs a real SSH host');
const temp=fs.mkdtempSync('/tmp/cloudhosts-pi-route-'),profile=path.join(temp,'pi');
let source=path.join(temp,'controller');
const tag=path.basename(temp),parent=windows?'C:\\Users\\djf':'/tmp';
const target=remote?(windows?parent+'\\AppData\\Local\\Temp\\'+tag:'/tmp/'+tag+'-work'):path.join(temp,'work');
for(const folder of [source,profile,...(remote?[]:[target])])fs.mkdirSync(folder);
process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const registry=require('../src/registry.cjs'),route=require('../src/agent-route-io.cjs'),ssh=require('../src/ssh.cjs');
const host=registry.create({name:'Native work fixture',host:remote?(windows?'DJF-Windows':'bupt208'):'work.invalid',jump:windows?'bupt208':undefined,os:windows?'windows':remote?'linux':'macos',defaultDirectory:remote?parent:target});
const {LocalWorker}=require('./fixtures/local-workspace.cjs');

const requests=[],events=[],spillPaths=new Set(),turns=[
 ['write',{path:'proof.txt',content:'REMOTE_NATIVE_PROOF\n'}],
 [windows?'powershell':'bash',{command:windows?'Get-Content -LiteralPath proof.txt -Encoding UTF8; (Get-Location).Path':'cat proof.txt; pwd'}],
 ['read',{path:'proof.txt'}],
 ['edit',{path:'proof.txt',edits:[{oldText:'REMOTE_NATIVE_PROOF',newText:'REMOTE_NATIVE_CHANGED'}]}],
 ['ls',{path:'.'}],['find',{pattern:'*.txt'}],['grep',{pattern:'CHANGED',path:'.'}],
 ['read',{path:(windows?path.win32:path.posix).join(target,'proof.txt')}],
 ['read',{path:'~/'+(windows?path.win32:path.posix).relative(windows?parent:remote?'/home/djf':os.homedir(),(windows?path.win32:path.posix).join(target,'proof.txt'))}],
 [windows?'powershell':'bash',{command:windows?"Write-Output 'REMOTE_SPILL_MARKER'; 1..4000 | ForEach-Object { 'native output line' }":"printf 'REMOTE_SPILL_MARKER\\n'; printf 'native output line\\n%.0s' {1..4000}"}],
 ['read',{path:'pending-native-output',limit:1}]
];
const model=http.createServer(async(req,res)=>{
 let raw='';for await(const data of req)raw+=data;
 if(req.method!=='POST'){res.writeHead(404).end();return}
 const body=JSON.parse(raw);requests.push(body);const turn=turns[requests.length-1];
 if(turn?.[1].path==='pending-native-output'){
  const value=body.messages.findLast(message=>message.role==='tool').content;
  const text=typeof value==='string'?value:value.map(part=>part.text||'').join('\n');
  const output=text.match(/Full output: ([^\]\r\n]+)\]/)?.[1];
  if(output){turn[1].path=output;spillPaths.add(output)}
 }
 const delta=turn?{role:'assistant',tool_calls:[{index:0,id:'native-'+requests.length,type:'function',function:{name:turn[0],arguments:JSON.stringify(turn[1])}}]}:{role:'assistant',content:'ROUTED_NATIVE_DONE'};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const [d,finish]of [[delta,null],[{},turn?'tool_calls':'stop']])res.write('data: '+JSON.stringify({id:'fixture-'+requests.length,object:'chat.completion.chunk',created:1,model:'native-fixture',choices:[{index:0,delta:d,finish_reason:finish}]})+'\n\n');
 res.end('data: [DONE]\n\n');
});
let bridge,child,role,agents,terminals;
const history=()=>{
 const folder=path.join(profile,'sessions');if(!fs.existsSync(folder))return [];
 const file=fs.readdirSync(folder,{recursive:true}).find(name=>name.endsWith(role.nativeSessionId+'.jsonl'));
 return file?fs.readFileSync(path.join(folder,file),'utf8').trim().split('\n').map(JSON.parse):[];
};
(async()=>{try{
 if(remote){
  const identity=await ssh.execute(host.id,windows?'[Environment]::MachineName; (Get-CimInstance Win32_ComputerSystem).Model':'hostname',parent,20);
  assert.equal(identity.exit_code,0);assert.ok(windows?identity.stdout.includes('90YS0006CP')&&identity.stdout.includes('DJF'):identity.stdout.trim()==='gpubupt208','Wrong physical reference host');
  const made=await ssh.execute(host.id,windows?'New-Item -ItemType Directory -Path '+ssh.psquote(target)+' -Force|Out-Null':'mkdir -p -- '+ssh.quote(target),parent,20);assert.equal(made.exit_code,0,made.stderr);
 }
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 fs.writeFileSync(path.join(profile,'models.json'),JSON.stringify({providers:{fixture:{baseUrl:'http://127.0.0.1:'+model.address().port+'/v1',api:'openai-completions',models:[{id:'native-fixture',name:'Native fixture',reasoning:false}]}}}));
 fs.writeFileSync(path.join(profile,'auth.json'),JSON.stringify({fixture:{type:'api_key',key:'fixture-only'}}));
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({defaultProvider:'fixture',defaultModel:'native-fixture',defaultTools:['read','bash','edit','write','ls','find','grep']}));
 const configured=fs.readFileSync(path.join(profile,'settings.json'),'utf8');
 if(product){
  Object.assign(process.env,{PI_CODING_AGENT_DIR:profile,CLOUD_HOSTS_PI:path.join(os.homedir(),'.npm-global/bin/pi')});
  agents=require('../src/agent-sessions.cjs');terminals=require('../src/terminals.cjs');
  role=await agents.open({engineHostId:'local',targetHostId:host.id,engine:'pi',directory:target,name:'Native Pi route QA'});
  source=role.controlCwd;assert.ok(role.running);assert.equal(requests.length,0);
  await new Promise(r=>setTimeout(r,400));
  await terminals.input(role.terminalId,'Perform the requested file operations and finish.');
  await new Promise(r=>setTimeout(r,180));await terminals.input(role.terminalId,'\r');
  const deadline=Date.now()+45000;while(Date.now()<deadline&&!history().some(row=>row.message?.role==='assistant'&&JSON.stringify(row.message).includes('ROUTED_NATIVE_DONE')))await new Promise(r=>setTimeout(r,100));
  if(requests.length!==turns.length+1)fs.writeFileSync('/tmp/cloudhosts-pi-tui-failed.txt',(await terminals.read(role.terminalId,0)).output||'');
  assert.equal(requests.length,turns.length+1,'Actual native TUI must finish all tool calls');
  events.push({type:'agent_end',messages:history().filter(row=>row.type==='message').map(row=>row.message)});
 }else{
 bridge=await route.open({targetHostId:host.id,cwd:target},{controlCwd:source,...(remote?{}:{createWorker:(id,cwd)=>new LocalWorker(cwd)})});
 const rejected=await fetch(bridge.environment.CLOUD_HOSTS_ROUTE_URL,{method:'POST',body:'{}'});assert.equal(rejected.status,403);
 child=spawn(path.join(os.homedir(),'.npm-global/bin/pi'),['--mode','rpc','--no-builtin-tools','--no-extensions','--no-skills','--no-context-files','--no-prompt-templates','--tools',['read',windows?'powershell':'bash','edit','write','ls','find','grep'].join(','),'--extension',path.resolve(__dirname,'../Runtime/pi_route.mjs')],{cwd:source,env:{...process.env,...bridge.environment,PI_CODING_AGENT_DIR:profile},stdio:['pipe','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b);const lines=createInterface({input:child.stdout});lines.on('line',line=>{try{events.push(JSON.parse(line))}catch{}});
 await bridge.ready();assert.equal(requests.length,0,'Attaching the native route does not submit a prompt');
 child.stdin.write(JSON.stringify({id:'proof',type:'prompt',message:'Perform the requested file operations and finish.'})+'\n');
 const deadline=Date.now()+25000;while(Date.now()<deadline&&!(requests.length>=turns.length+1&&events.some(e=>e.type==='agent_settled')))await new Promise(r=>setTimeout(r,50));
 assert.ok(events.some(e=>e.type==='agent_settled'),stderr+'\n'+JSON.stringify(events).slice(-3000));
 }
 if(!remote)assert.ok(fs.existsSync(path.join(target,'proof.txt')),JSON.stringify({requests:requests.length,events}).slice(-5000));
 const content=remote?Buffer.from((await ssh.files(host.id,'native_io',{operation:'read',args:{path:'proof.txt'}},target)).data,'base64').toString('utf8'):fs.readFileSync(path.join(target,'proof.txt'),'utf8');
 assert.equal(content,'REMOTE_NATIVE_CHANGED\n');
 assert.equal(fs.existsSync(path.join(source,'proof.txt')),false,'Native tools must never touch the controller workspace');
 assert.equal(requests.length,turns.length+1);
 const results=events.findLast(event=>event.type==='agent_end').messages.filter(message=>message.role==='toolResult');
 assert.equal(results.length,turns.length);assert.ok(results.every(result=>!result.isError),JSON.stringify(results));
 for(const name of ['ls','find'])assert.ok(JSON.stringify(results.find(result=>result.toolName===name)).includes('proof.txt'));
 assert.ok(JSON.stringify(results.find(result=>result.toolName==='grep')).includes('REMOTE_NATIVE_CHANGED'));
 assert.match(JSON.stringify(results.at(-1)),/REMOTE_SPILL_MARKER/,'Truncated native output remains readable on the target');
 const visible=JSON.stringify(requests[0]);
 assert.ok(!visible.includes(source)&&!visible.includes(fs.realpathSync(source)),'Controller working directory must stay out of model context');
 assert.doesNotMatch(visible,/cloud_docs|cloud_api|work.invalid|Native work fixture|CLOUD_HOSTS_ROUTE|via SSH|routing instructions/);
 const renderedTarget=target.replaceAll('\\','/');
 assert.ok(visible.includes(JSON.stringify(renderedTarget).slice(1,-1)),'Native model receives the actual work directory');
 const second=JSON.stringify(requests[2]);assert.ok(second.includes(JSON.stringify(target).slice(1,-1)),'Native shell result comes from the execution workspace');
 if(product){
  const id=role.nativeSessionId,count=requests.length;
  await terminals.close(role.terminalId);
  role=await agents.activate({id:host.id,session:role.id});
  assert.equal(role.nativeSessionId,id);assert.ok(role.running);
  await new Promise(r=>setTimeout(r,400));
  const screen=(await terminals.read(role.terminalId,0)).output;
  assert.match(screen,/ROUTED_NATIVE_DONE/,'Exact native history must be visible after reconnect');
  assert.equal(requests.length,count,'Reconnect must not send a model prompt');
  const settingsAfter=JSON.parse(fs.readFileSync(path.join(profile,'settings.json'),'utf8'));
  delete settingsAfter.lastChangelogVersion;assert.deepEqual(settingsAfter,JSON.parse(configured));
  console.log('PASS product-created original Pi TUI, exact native history reconnect, shared settings unchanged');
 }
 console.log('PASS '+mode+' real Pi CLI: original read/write/edit/bash/ls/find/grep tools, unchanged task, private route auth, target-only effects, native cwd metadata, no routing prompt');
 }finally{if(agents){if(role)await agents.close({id:host.id,session:role.id});await agents.shutdown();await terminals.shutdown()}if(child){child.stdin.end();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('close',r))}await bridge?.close();for(const file of spillPaths){if(remote)await ssh.execute(host.id,windows?'Remove-Item -LiteralPath '+ssh.psquote(file)+' -Force':'rm -f -- '+ssh.quote(file),parent,20);else fs.rmSync(file,{force:true})}if(remote){const removed=await ssh.execute(host.id,windows?'Remove-Item -LiteralPath '+ssh.psquote(target)+' -Recurse -Force -ErrorAction SilentlyContinue':'rm -rf -- '+ssh.quote(target),parent,20);assert.equal(removed.exit_code,0,removed.stderr)}model.closeAllConnections();await new Promise(r=>model.close(r));fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
