// Historical filename retained for npm compatibility; cloud Manager/Governor are now explicitly supported.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-cloud-ui-'))),bin=path.join(temp,'bin'),control=path.join(temp,'fixture'),remote=path.join(temp,'cloud')
for(const dir of [bin,control,remote])fs.mkdirSync(dir);fs.writeFileSync(path.join(control,'release-all'),'')
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('node:child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}\n`,{mode:0o755})
fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}\nif(process.argv.includes('--version')){console.log('codex-fixture');process.exit(0)}if(process.argv.includes('login')){console.log('fixture authenticated');process.exit(0)}require(${JSON.stringify(path.join(root,'test/fixtures/initialization-codex.cjs'))});\n`,{mode:0o755})
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[process.env.AGENTS_COMPANY_TEST_APPLICATION||root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'})
const cli=async(...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
const form=page.locator('.employee-form'),field=name=>form.locator('select[name="'+name+'"]'),choose=async(name,label)=>{await field(name).locator('..').getByRole('button').click();await page.getByRole('listbox').getByRole('option',{name:label,exact:true}).click()}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('settings','set','--language','en');await cli('group','add','Local')
 const host=await cli('host','create','--data',JSON.stringify({name:'Remote',host:'fixture',os:'linux',defaultDirectory:remote}));await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await page.locator('.add-employee').click();await choose('group','Local');await choose('managementRole','Manager');await choose('group','Cloud')
 await expect(field('managementRole')).toHaveValue('manager');await expect(field('workEnvironment')).toHaveValue('team');await expect(form.locator('.workspace-contract')).toContainText(remote)
 await choose('managementRole','Governor');await expect(field('workEnvironment')).toHaveValue('team')
 await choose('kind','Cloud Native Worker · Runs on the cloud host');await expect(field('managementRole')).toHaveValue('governor')
 for(const role of ['manager','governor'])await expect(field('managementRole').locator('option[value="'+role+'"]')).toHaveJSProperty('disabled',false)
 await expect(field('managementRole').locator('option[value=secretary]')).toHaveJSProperty('disabled',true)
 await form.locator('input[name=title]').fill('Native Governor UI');await expect(field('model')).toBeEnabled();await field('model').selectOption('gpt-6-luna',{force:true})
 await form.locator('.save-employee').click();await expect(form).toHaveCount(0)
 const saved=(await cli('session','list')).sessions.find(card=>card.title==='Native Governor UI');assert.equal(saved.kind,'cloud-native-worker');assert.equal(saved.managementRole,'governor');assert.ok(saved.cwd.startsWith(remote));assert.equal(saved.workEnvironment,'team')
 await expect.poll(async()=>(await cli('session','status','--employee',saved.id))[0].initialization.status).toBe('ready')
 await page.locator('.add-employee').click();await choose('group','Cloud');if(await field('kind').inputValue()!=='cloud-native-worker')await choose('kind','Cloud Native Worker · Runs on the cloud host')
 await choose('managementRole','Manager');await expect(form.locator('[data-engine=cline]')).toBeDisabled()
 await form.getByRole('button',{name:'Use Core engine with this cloud workspace',exact:true}).click()
 await expect(field('kind')).toHaveValue('worker');await expect(field('managementRole')).toHaveValue('manager');await expect(field('workEnvironment')).toHaveValue('team');await expect(form.locator('[data-engine=cline]')).toBeEnabled();await expect(form.locator('[data-engine=pi]')).toBeEnabled()
 await choose('workEnvironment','Core local workspace');await expect(field('managementRole')).toHaveValue('manager');await expect(form.locator('.workspace-contract')).toContainText(env.AGENTS_COMPANY_PROJECTS)
 const out=path.join(root,'artifacts/mentions-engines-cloud');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'cloud-role-ui.png')});await cli('view','close')
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS cloud role UI: changing Team/kind preserves Manager/Governor, no implicit local switch, native Governor saves/initializes, explicit Core switch enables Cline/Pi without changing the cloud workspace, Secretary restriction remains separate')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
