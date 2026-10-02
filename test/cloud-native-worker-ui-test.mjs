import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-cloudnative-ui-'))),remote=path.join(temp,'remote'),bin=path.join(temp,'bin')
for(const directory of [remote,bin])fs.mkdirSync(directory)
fs.writeFileSync(path.join(bin,'ssh'),`#!/bin/sh\n[ -e ${JSON.stringify(path.join(temp,'offline'))} ] && exit 255\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n`,{mode:0o755})
const trap=path.join(temp,'local-codex');fs.writeFileSync(trap,`#!/bin/sh\nprintf called > ${JSON.stringify(path.join(temp,'LOCAL_CODEX_CALLED'))}\nexit 99\n`,{mode:0o755})
fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('--version')){console.log('codex-cli fixture');process.exit(0)}if(args[0]==='login'){console.log('Logged in');process.exit(0)}if(args.includes('app-server')){require('readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='model/list'?{data:[{id:'gpt-6-luna',model:'gpt-6-luna',displayName:'GPT-6 Luna',supportedReasoningEfforts:[{reasoningEffort:'low'}]}]}:{};console.log(JSON.stringify({id:r.id,result}))});return}process.exit(2)\n`,{mode:0o755})
const env={...process.env,HOME:path.join(temp,'user'),PATH:[bin,path.dirname(process.execPath),'/usr/bin','/bin','/usr/sbin','/sbin'].join(':'),CODEX_BIN:trap,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel'),AGENTS_COMPANY_HIDDEN:'1'}
fs.mkdirSync(env.HOME);delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{try{const result=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:30000})).stdout);if(!result.ok)throw Error(result.error);return result.data}catch(error){if(error.stdout){const result=JSON.parse(error.stdout);throw Error(result.error)}throw error}}
try{
 await page.locator('.infinite-canvas').waitFor()
 await cli('group','add','Local')
 const host=await cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}))
 await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await page.locator('.add-employee').click()
 await page.locator('select[name="kind"]').selectOption('cloud-native-worker')
 await expect(page.locator('.native-engine-check')).toContainText('请先选择已绑定主机')
 await expect(page.locator('.save-employee')).toBeDisabled()
 await page.locator('select[name="group"]').selectOption('Cloud')
 await page.locator('input[name="title"]').fill('Native')
 await expect(page.locator('.native-engine-check.ready')).toContainText('codex-cli fixture',{timeout:15000})
 await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 const card=(await cli('session','list')).sessions.find(value=>value.title==='Native')
 assert.equal(card.kind,'cloud-native-worker');assert.equal(card.nativeOrigin.hostId,host.id);assert.ok(fs.existsSync(path.join(remote,'Native')))
 await assert.rejects(()=>cli('card','move',card.id,'Local'))
 await assert.rejects(()=>cli('group','configure','Cloud','--mode','build'))
 await assert.rejects(()=>cli('host','update',host.id,'--data',JSON.stringify({host:'another-host'})))
 await assert.rejects(()=>cli('config','engine',card.id,'claude'))
 assert.equal((await cli('session','list')).sessions.find(value=>value.id===card.id).engine,'codex')
 await expect(page.locator(`[data-card-id="${card.id}"]`)).toHaveAttribute('data-kind','cloud-native-worker')
 await expect(page.locator(`[data-card-id="${card.id}"] .cloud-native-foot`)).toHaveCount(1)
 assert.deepEqual(await page.locator(`[data-card-id="${card.id}"] .cloud-native-foot`).evaluate(element=>{const style=getComputedStyle(element);return [style.zIndex,style.animationName]}),['7','cloud-native-float'])
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.locator(`[data-card-id="${card.id}"]`).screenshot({path:path.join(root,'artifacts/cloud-native-worker.png')})
 const local=await cli('card','create','--title','Local cloud','--group','Cloud','--engine','codex')
 assert.equal(local.kind,'worker');await expect(page.locator(`[data-card-id="${local.id}"] .cloud-native-foot`)).toHaveCount(0)
 await page.locator('.add-employee').click();await page.locator('select[name="kind"]').selectOption('cloud-native-worker');await page.locator('select[name="group"]').selectOption('Cloud')
 await page.locator('input[name="title"]').fill('Missing Claude')
 await page.locator('.engine-choices button').filter({hasText:'Claude Agent'}).click()
 await expect(page.locator('.native-engine-check.error')).toContainText('未找到 Claude Code',{timeout:15000})
 await expect(page.locator('.save-employee')).toBeDisabled()
 await assert.rejects(()=>cli('card','create','--title','Missing CLI record','--group','Cloud','--kind','cloud-native-worker','--engine','claude'))
 assert.ok(!fs.existsSync(path.join(remote,'Missing CLI record')))
 fs.rmSync(path.join(temp,'LOCAL_CODEX_CALLED'),{force:true})
 fs.writeFileSync(path.join(temp,'offline'),'1')
 await assert.rejects(()=>cli('session','open',card.id))
 assert.equal(fs.existsSync(path.join(temp,'LOCAL_CODEX_CALLED')),false,'offline cloud worker never starts the Mac Codex CLI')
 console.log('PASS cloud-native role, remote precheck, cloud badge, local Worker compatibility and early missing-CLI rejection')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
