const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync('/tmp/cloudhosts-claude-native-');process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs'),{ClaudeWorker}=require('../src/agent-claude-worker.cjs');
const windows=process.argv.includes('windows'),base=windows?'C:\\Users\\djf':'/tmp';
const host=registry.create({name:'Native Claude work',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:base}),work=windows?path.win32.join(base,'AppData','Local','Temp',path.basename(temp)+'-work'):'/tmp/'+path.basename(temp)+'-work';
const command=(linux,win)=>windows?win:linux;
(async()=>{let worker;try{
 const identity=await ssh.execute(host.id,command('hostname','[Environment]::MachineName; (Get-CimInstance Win32_ComputerSystem).Model'),base,20);assert.ok(windows?identity.stdout.includes('DJF')&&identity.stdout.includes('90YS0006CP'):identity.stdout.trim()==='gpubupt208');
 assert.equal((await ssh.execute(host.id,command('mkdir -p -- '+ssh.quote(work),'New-Item -ItemType Directory -Path '+ssh.psquote(work)+' -Force|Out-Null'),base,20)).exit_code,0);
 worker=new ClaudeWorker(host.id,work);const info=await worker.request('initialize');
 assert.ok(info.tools.some(tool=>tool.name==='Read'));assert.equal(info.cwd,work);
 const call=tool=>worker.request('call',[tool]);
 const file=work+'/proof.txt';
 const write=await call({tool:'Write',file_path:file,content:'NATIVE_SSH_PROOF\n'});assert.equal(write.result.type,'create',JSON.stringify(write));
 const read=await call({tool:'Read',file_path:file});assert.match(read.result.file.content,/NATIVE_SSH_PROOF/);
 const edit=await call({tool:'Edit',file_path:file,old_string:'NATIVE_SSH_PROOF',new_string:'NATIVE_SSH_CHANGED'});assert.equal(edit.result.newString,'NATIVE_SSH_CHANGED',JSON.stringify(edit));
 const shell=await call({tool:'Bash',command:windows?'cat proof.txt; cygpath -w "$PWD"':'cat proof.txt; pwd'});assert.match(shell.result.stdout,/NATIVE_SSH_CHANGED/);assert.ok(shell.result.stdout.includes(work));
 assert.equal(fs.existsSync(path.join(temp,'proof.txt')),false);
 const environmentProbe="import os,json;from pathlib import Path;p=Path(os.environ.get('CLAUDE_CONFIG_DIR',str(Path.home()/'.claude')))/'settings.json';e=json.loads(p.read_text()).get('env',{});print(json.dumps({'transport':any(k.startswith('CLOUD_HOSTS_EXEC_') for k in os.environ),'guard':os.environ.get('ANTHROPIC_AUTH_TOKEN')=='native-tools-only','same_key':os.environ.get('ANTHROPIC_AUTH_TOKEN')==e.get('ANTHROPIC_AUTH_TOKEN'),'same_url':os.environ.get('ANTHROPIC_BASE_URL')==e.get('ANTHROPIC_BASE_URL')}))";
 const envResult=await call({tool:'Bash',command:(windows?'python':'python3')+' -c '+ssh.quote(environmentProbe)});
 const nativeEnv=JSON.parse(envResult.result.stdout.trim());
 assert.deepEqual(nativeEnv,{transport:false,guard:false,same_key:true,same_url:true},'Native shell children retain the canonical host configuration, without private transport variables');
 const background=await call({tool:'Bash',command:'sleep 1; printf NATIVE_BACKGROUND > background.txt',run_in_background:true});
 assert.ok(background.result.backgroundTaskId,JSON.stringify(background));
 const backgroundDeadline=Date.now()+8000;let backgroundReady=false;
 while(Date.now()<backgroundDeadline){backgroundReady=(await ssh.files(host.id,'native_io',{operation:'stat',args:{path:'background.txt'}},work)).exists;if(backgroundReady)break;await new Promise(r=>setTimeout(r,100))}
 assert.ok(backgroundReady);assert.equal((await call({tool:'Read',file_path:work+'/background.txt'})).result.file.content,'NATIVE_BACKGROUND');
 const stopped=await call({tool:'Bash',command:'sleep 3; printf WRONG > background-stopped.txt',run_in_background:true});
 assert.ok(stopped.result.backgroundTaskId);
 const stop=await call({tool:'TaskStop',task_id:stopped.result.backgroundTaskId});assert.ok(!stop.isError,JSON.stringify(stop));
 await new Promise(r=>setTimeout(r,3300));assert.equal((await ssh.files(host.id,'native_io',{operation:'stat',args:{path:'background-stopped.txt'}},work)).exists,false);
 console.log('PASS original background Bash and TaskStop use the work host');
 const abort=new AbortController();
 const cancelled=worker.request('call',[{tool:'Bash',command:'printf started > started.txt; sleep 2; printf wrong > after-cancel.txt'}],{},undefined,abort.signal);
 const rejected=assert.rejects(cancelled);
 const until=Date.now()+8000;let started=false;
 while(Date.now()<until){if((await ssh.execute(host.id,command('test -e started.txt',"if(!(Test-Path -LiteralPath started.txt)){exit 1}"),work,20)).exit_code===0){started=true;break}await new Promise(r=>setTimeout(r,100))}
 assert.ok(started,'The native shell must actually start before cancellation');abort.abort();await rejected;
 await new Promise(r=>setTimeout(r,2300));assert.equal((await ssh.execute(host.id,command('test ! -e after-cancel.txt',"if(Test-Path -LiteralPath after-cancel.txt){exit 1}"),work,20)).exit_code,0,'The interrupted native command must not keep writing');

 console.log('PASS '+(windows?'Windows':'Linux')+' original Claude '+info.version+' Read/Write/Edit/Bash over actual SSH; native results, target-only writes, no primary model loop, canonical shell environment, private transport hidden, active command cancellation');
 }finally{worker?.close();await ssh.execute(host.id,command('rm -rf -- '+ssh.quote(work),'Remove-Item -LiteralPath '+ssh.psquote(work)+' -Recurse -Force -ErrorAction SilentlyContinue'),base,20);fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
