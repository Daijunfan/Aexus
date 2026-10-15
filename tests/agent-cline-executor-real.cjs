// Original installed Cline tool executors over actual SSH; no provider/model.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync('/tmp/cloudhosts-cline-executor-');
process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs'),{ClineWorker}=require('../src/agent-cline-worker.cjs');
const windows=process.argv.includes('windows'),base=windows?'C:\\Users\\djf':'/tmp';
const host=registry.create({name:'Cline executor QA',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:base});
const work=windows?path.win32.join(base,'AppData','Local','Temp',path.basename(temp)+'-work'):'/tmp/'+path.basename(temp)+'-work';
const command=(linux,win)=>windows?win:linux;
(async()=>{let worker;try{
 const identity=await ssh.execute(host.id,command('hostname','[Environment]::MachineName; (Get-CimInstance Win32_ComputerSystem).Model'),base,20);
 assert.ok(windows?identity.stdout.includes('DJF')&&identity.stdout.includes('90YS0006CP'):identity.stdout.trim()==='gpubupt208');
 assert.equal((await ssh.execute(host.id,command('mkdir -p -- '+ssh.quote(work),'New-Item -ItemType Directory -Path '+ssh.psquote(work)+' -Force|Out-Null'),base,20)).exit_code,0);
 worker=new ClineWorker(host.id,work);const environment=await worker.request('initialize');
 assert.equal(environment.platform,windows?'win32':'linux');if(windows)assert.match(environment.shellDescription,/PowerShell/);assert.equal(environment.cwd,work);
 const context={agentId:'native-test',iteration:1,cwd:work};
 const call=(method,args,signal)=>worker.request(method,args,context,undefined,signal);
 await call('editor',[{path:'proof.txt',new_text:'NATIVE_EXECUTOR_PROOF\n'},work]);
 assert.match(await call('readFile',[{path:work+'/proof.txt'}]),/NATIVE_EXECUTOR_PROOF/);
 assert.match(await call('search',['NATIVE_EXECUTOR_PROOF',work]),/proof.txt/);
 await call('editor',[{path:'proof.txt',old_text:'NATIVE_EXECUTOR_PROOF',new_text:'NATIVE_EXECUTOR_CHANGED'},work]);
 assert.match(await call('bash',[command('cat proof.txt; pwd','Get-Content -LiteralPath proof.txt; (Get-Location).Path'),work]),new RegExp('NATIVE_EXECUTOR_CHANGED'));
 assert.equal(fs.existsSync(path.join(temp,'proof.txt')),false);
 const abort=new AbortController();
 const long=call('bash',[command('sleep 8; printf wrong > cancelled.txt',"Start-Sleep -Seconds 8; Set-Content -LiteralPath cancelled.txt -Value wrong"),work],abort.signal);
 setTimeout(()=>abort.abort(),250);
 await assert.rejects(long);
 assert.match(await call('bash',[command('printf still-connected',"Write-Output 'still-connected'"),work]),/still-connected/);
 assert.equal((await ssh.execute(host.id,command('test ! -e cancelled.txt',"if(Test-Path -LiteralPath cancelled.txt){exit 1}"),work,20)).exit_code,0);
 const lost=assert.rejects(call('bash',[command('sleep 1; printf wrong > after-disconnect.txt',"Start-Sleep -Seconds 2; Set-Content -LiteralPath after-disconnect.txt -Value wrong"),work]));
 await new Promise(r=>setTimeout(r,150));worker.close();await lost;
 await new Promise(r=>setTimeout(r,2500));
 assert.equal((await ssh.execute(host.id,command('test ! -e after-disconnect.txt',"if(Test-Path -LiteralPath after-disconnect.txt){exit 1}"),work,20)).exit_code,0,'Disconnect must stop its own native shell');
 console.log('PASS '+(windows?'Windows':'Linux')+' actual Cline SDK target executors: native read/editor/search/shell, target-only effects, independent abort and continued connection; no model or credentials');
 }finally{worker?.close();await ssh.execute(host.id,command('rm -rf -- '+ssh.quote(work),'Remove-Item -LiteralPath '+ssh.psquote(work)+' -Recurse -Force -ErrorAction SilentlyContinue'),base,20);fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
