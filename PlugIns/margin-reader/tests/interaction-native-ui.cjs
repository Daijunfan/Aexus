'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const exec=require('node:util').promisify(require('node:child_process').execFile);
const root=path.resolve(__dirname,'..'),host=path.resolve(root,'../..');
const {_electron:electron,expect}=require(path.join(host,'node_modules/@playwright/test'));
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mr-interaction-native-')));
 const output=process.env.MR_AUDIT_OUTPUT||await fs.readFile(path.join(root,'artifacts/interaction-current.txt'),'utf8').then(s=>s.trim(),()=>path.join(root,'artifacts/interaction-native'));
 assert(path.resolve(output).startsWith(path.join(root,'artifacts')+path.sep));await fs.mkdir(output,{recursive:true});
 const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'empty'),AGENTS_COMPANY_PLUGIN_DIRS:'',AGENTS_COMPANY_HIDDEN:'1'};
 for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'].includes(key))delete env[key];
 let app,page;const report={passed:false,checks:[],errors:[],modelCalls:0,platform:process.platform};
 const pass=value=>{report.checks.push(value);console.log('PASS '+value);};
 try{
  app=await electron.launch({executablePath:require(path.join(host,'node_modules/electron')),args:[host],env});await app.firstWindow();
  const cli=async(...args)=>{const reply=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:16*1024*1024})).stdout);assert(reply.ok,reply.error);return reply.data;};
  await cli('plugin','install',path.join(root,'dist-plugin'));const api=(method,params={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(params));
  const workspace=(await api('system.info')).workspace;assert(workspace.startsWith(temp+path.sep));
  let set=await api('study.create',{title:'原生窗口交互验收'});set=await api('study.note.create',{setId:set.id,expectedRevision:set.revision,title:'原生卡片',text:'Shared Core body',color:'purple'});const id=set.cards[0].id;
  await api('study.open',{setId:set.id});
  const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;
  page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(15000);await page.setViewportSize({width:1440,height:960});await page.waitForSelector('body[data-ready=true]');
  const card=page.locator(`.study-card[data-card-id="${id}"]`);await card.locator('header strong').click();await card.focus();await card.press('F2');
  await expect(page.locator('#card-inspector')).toBeVisible();await page.fill('[name=inspector-note]','Native saved note');await page.locator('[name=inspector-note]').press('Meta+Enter');
  await expect(page.locator('#inspector-status')).toContainText('已保存');assert.equal((await api('study.get',{setId:set.id})).cards[0].note,'Native saved note');await page.click('#inspector-close');
  pass('Hidden native plugin window edits the same Core card through F2 and the platform save shortcut');
  await page.keyboard.press('Meta+k');await expect(page.locator('#tool-finder')).toBeVisible();await page.fill('#tool-finder-query','外观');await page.locator('#tool-finder-query').press('Enter');await expect(page.locator('#dialog-title')).toHaveText('外观工作室');
  await page.locator('#appearance-custom summary').click();await page.fill('[name=uiCustomAccent]','#268978');await page.fill('[name=uiCustomGlow]','#dfbaf3');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  assert.equal((await api('appearance.get')).appearance.uiCustomAccent,'#268978');
  await api('settings.set',{uiCustomAccent:'#8740b8',theme:'dark'});await expect(page.locator('body')).toHaveAttribute('data-theme','dark');
  await page.reload();await page.waitForSelector('body[data-ready=true]');assert.equal((await api('appearance.get')).appearance.uiCustomAccent,'#8740b8');await card.locator('header strong').click();await page.click('#card-inspector-open');await expect(page.locator('#card-inspector')).toBeVisible();await expect(page.locator('[name=inspector-note]')).toHaveValue('Native saved note');
  await page.screenshot({path:path.join(output,'native-interaction.png'),animations:'disabled'});await page.click('#inspector-close');
  pass('Native tool search opens the custom theme studio; CLI changes synchronize and persisted edits survive reload');
  await page.click('#library-backups');await page.click('#backup-resumable');await page.fill('[name=backupJobPath]','native-checkpoint.mrbackup');await page.click('#backup-job-prepare');await expect(page.locator('#backup-job-status')).toContainText('检查点已准备');
  const jobId=await page.inputValue('[name=backupJobId]');await page.click('#backup-job-run');await expect(page.locator('.backup-job-panel')).toHaveAttribute('data-phase','complete',{timeout:30000});await expect(page.locator('#backup-job-run')).toBeEnabled();
  assert.equal((await api('library.backup.job.get',{jobId})).phase,'complete');assert((await api('library.backup.inspect',{path:'native-checkpoint.mrbackup'})).studies.some(s=>s.id===set.id));await page.click('#dialog-cancel');
  pass('Native resumable backup controls publish a verified standard backup through the installed plugin runtime');
  assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())));assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.error=error.stack;await page?.screenshot({path:path.join(output,'native-interaction-failure.png')}).catch(()=>{});throw error;}
 finally{
  if(app){const timeout=setTimeout(()=>{try{app.process().kill('SIGKILL');}catch{}},10000);try{await app.close();}finally{clearTimeout(timeout);}}
  await fs.rm(temp,{recursive:true,force:true});await fs.writeFile(path.join(output,'interaction-native-results.json'),JSON.stringify(report,null,2));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
