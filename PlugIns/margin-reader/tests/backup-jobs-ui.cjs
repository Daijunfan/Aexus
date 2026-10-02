'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('backup-jobs');let failure,release;
 try{
  const {page,api}=f,output=await fs.readFile(path.join(__dirname,'../artifacts/interaction-current.txt'),'utf8').then(s=>s.trim(),()=>f.output);
  const source=randomBytes(20*1024*1024+11);await fs.writeFile(path.join(f.workspace,'large-source.bin'),source);
  await api('fs.write',{path:'note.md',content:'# 保留的原件'});
  await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();
  const open=async()=>{await page.click('#library-backups');await page.click('#backup-resumable');await expect(page.locator('.backup-job-panel')).toBeVisible();};
  await open();await page.fill('[name=backupJobPath]','ui-resumable.mrbackup');await page.fill('[name=backupJobPassword]','backup ui passphrase');await page.click('#backup-job-prepare');
  await expect(page.locator('#backup-job-status')).toContainText('检查点已准备');const jobId=await page.inputValue('[name=backupJobId]');assert(jobId);
  let job=await api('library.backup.job.get',{jobId,password:'backup ui passphrase'});assert.equal(job.copiedBytes,0);assert.equal(job.phase,'copying');
  let intercepted=false;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/rpc',async route=>{
   const data=route.request().postDataJSON();
   if(data?.method==='library.backup.job.step'&&!intercepted){intercepted=true;await gate;await route.continue();}
   else await route.continue();
  });
  await page.click('#backup-job-run');await expect.poll(()=>intercepted).toBe(true);await page.click('#backup-job-pause');release();
  await expect(page.locator('#backup-job-status')).toContainText('已暂停');job=await api('library.backup.job.get',{jobId,password:'backup ui passphrase'});assert(job.copiedBytes>0&&job.copiedBytes<job.totalBytes);let copied=job.copiedBytes;
  assert.equal(await fs.stat(path.join(f.workspace,'ui-resumable.mrbackup')).catch(()=>null),null);
  await page.screenshot({path:path.join(output,'resumable-backup-paused.png'),animations:'disabled'});
  f.pass('The real backup dialog prepares a frozen checkpoint, pauses after a committed request and never publishes a partial directory');
  await page.unroute('**/rpc');intercepted=false;const secondGate=new Promise(resolve=>{release=resolve;});
  await page.route('**/rpc',async route=>{const data=route.request().postDataJSON();if(data?.method==='library.backup.job.step'&&!intercepted){intercepted=true;await secondGate;await route.continue();}else await route.continue();});
  await page.click('#backup-job-run');await expect.poll(()=>intercepted).toBe(true);await page.click('#dialog-cancel');
  await page.click('#library-backups');await page.click('#backup-resumable');await expect(page.locator('#dialog')).toBeHidden();await expect(page.locator('#toast')).toContainText('当前备份批次仍在结束中');
  release();await expect.poll(async()=>(await api('library.backup.job.get',{jobId,password:'backup ui passphrase'})).revision).toBeGreaterThan(job.revision);
  copied=(await api('library.backup.job.get',{jobId,password:'backup ui passphrase'})).copiedBytes;await page.unroute('**/rpc');
  f.pass('Closing a running panel and immediately reopening cannot strand a second panel with permanently disabled controls');
  await page.reload();await page.locator('body[data-ready=true]').waitFor();await open();
  await page.selectOption('[name=backupJobId]',jobId);await expect(page.locator('[name=backupJobPassword]')).toHaveValue('');await page.click('#backup-job-load');await expect(page.locator('#backup-job-status')).toContainText('口令');
  await page.fill('[name=backupJobPassword]','backup ui passphrase');await page.click('#backup-job-load');await expect(page.locator('#backup-job-count')).toContainText('MiB');
  assert.equal((await api('library.backup.job.get',{jobId,password:'backup ui passphrase'})).copiedBytes,copied);
  await page.click('#backup-job-run');await expect(page.locator('.backup-job-panel')).toHaveAttribute('data-phase','complete',{timeout:30000});await expect(page.locator('#backup-job-run')).toBeEnabled();
  await api('library.backup.inspect',{path:'ui-resumable.mrbackup',password:'backup ui passphrase'});await api('library.backup.restore',{path:'ui-resumable.mrbackup',password:'backup ui passphrase',folder:'Restored'});
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'Restored/large-source.bin')),source);assert.equal(await fs.readFile(path.join(f.workspace,'Restored/note.md'),'utf8'),'# 保留的原件');
  f.pass('Reopening forgets the passphrase but keeps copied bytes; continuation publishes a standard backup that restores byte-for-byte');
  await page.locator('.backup-job-advanced summary').click();await page.click('#backup-job-discard');await page.click('#backup-job-discard-confirm');await expect(page.locator('#backup-job-phase')).toHaveText('检查点已清理');
  assert.equal((await api('library.backup.job.list')).total,0);assert((await fs.stat(path.join(f.workspace,'ui-resumable.mrbackup'))).isDirectory());assert.deepEqual(await fs.readFile(path.join(f.workspace,'large-source.bin')),source);
  f.pass('Explicit checkpoint cleanup leaves the original files and the published backup intact');
 }catch(error){failure=error;}
 release?.();await f.finish(failure);
})().catch(error=>{console.error(error);process.exitCode=1;});
