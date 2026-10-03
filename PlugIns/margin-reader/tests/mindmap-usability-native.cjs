'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const exec=require('node:util').promisify(require('node:child_process').execFile),root=path.resolve(__dirname,'..'),host=path.resolve(root,'../..');
const {_electron:electron,expect}=require(path.join(host,'node_modules/@playwright/test'));
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mr-save-native-'))),output=path.join(root,'artifacts/mindmap-usability-20261003/native');await fs.mkdir(output,{recursive:true});
 const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'empty'),AGENTS_COMPANY_PLUGIN_DIRS:path.join(root,'dist-plugin'),AGENTS_COMPANY_HIDDEN:'1'};
 for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'].includes(key))delete env[key];
 const report={passed:false,platform:process.platform,modelCalls:0,realWorkspaceChanges:false,checks:[],errors:[]};let app,page,failure;
 try{
  const native=process.env.MR_USABILITY_NATIVE_APP;app=await electron.launch({executablePath:native||require(path.join(host,'node_modules/electron')),args:native?[]:[host],env});await app.firstWindow();
  const cli=async(...args)=>{const j=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:8*1024*1024})).stdout);assert(j.ok,j.error);return j.data;};
  const api=(method,p={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(p)),info=await api('system.info');assert(info.workspace.startsWith(temp+path.sep));report.pluginVersion=info.version;report.package=path.join(root,'dist-plugin');
  const opened=app.waitForEvent('window'),window=await cli('plugin','open','margin-reader');page=await opened;page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).setBounds({width:1520,height:1000}),page.url());
  const pass=text=>{report.checks.push(text);console.log('PASS '+text);};await require('./mindmap-usability-exercise.cjs').exercise({page,api,url:page.url(),pass,output});
  for(const suite of ['excerpt-drag','mindmap-explorer','mindmap-zones'])await require('./'+suite+'-exercise.cjs').exercise({page,api,url:page.url(),workspace:info.workspace,pass,output});
  await page.click('#mm-themes');await page.fill('[data-mm-field=fontSize]','25');await assert.rejects(cli('plugin','dismiss',window.id),e=>/未保存/.test(e.stdout||e.message));assert(!page.isClosed());
  await page.locator('[data-mm-field=fontSize]').press('Meta+s');await expect(page.locator('#mindmap-format-panel')).toHaveAttribute('data-dirty','false');
  await cli('plugin','dismiss',window.id);await expect.poll(()=>page.isClosed()).toBe(true);assert.equal((await cli('plugin','windows')).length,0);
  assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));assert.deepEqual(report.errors,[]);report.passed=true;
  pass('An actual hidden desktop plugin window rejects unsaved close, accepts Cmd+S, then closes through the authenticated host API');
 }catch(e){failure=e;report.error=e.stack;await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
 finally{await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));if(app){const timer=setTimeout(()=>app.process().kill('SIGKILL'),10000);try{await app.close();}finally{clearTimeout(timer);}}await fs.rm(temp,{recursive:true,force:true});}
 if(failure)throw failure;
})().catch(e=>{console.error(e);process.exitCode=1;});
