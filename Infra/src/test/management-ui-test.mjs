import {localTunnel} from './fixtures/local-tunnel.mjs'
import fs from 'node:fs'
import net from 'node:net'
import platform from '../cli/platform.cjs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-provenance-ui-'))),bin=path.join(temp,'bin'),control=path.join(temp,'fixture'),remote=path.join(temp,'cloud')
for(const dir of [bin,control,remote])fs.mkdirSync(dir);fs.writeFileSync(path.join(control,'release-all'),'')
fs.writeFileSync(path.join(bin,'ssh'),'#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n',{mode:0o755})
const env={...process.env,AGENTS_COMPANY_TUNNEL_DIR:localTunnel(path.join(temp,'tunnel'),root),PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[],followers=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
try{
 await page.locator('.infinite-canvas').waitFor()
 const host=await cli('host','create','--data',JSON.stringify({name:'Remote',host:'fixture',os:process.platform==='win32'?'windows':process.platform==='darwin'?'macos':'linux',defaultDirectory:remote}));await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await page.locator('.add-employee').click();await page.locator('input[name=title]').fill('Mac Manager');await page.locator('select[name=group]').selectOption('Cloud')
 await expect(page.locator('select[name=managementRole] option[value=manager]')).toHaveJSProperty('disabled',false)
 await page.locator('select[name=managementRole]').selectOption('manager');await page.locator('select[name=workEnvironment]').selectOption('local');await expect(page.locator('select[name=workEnvironment]')).toHaveValue('local');await page.locator('select[name=model]').selectOption('gpt-6-luna')
 await expect(page.locator('.default-employee-path')).toContainText(env.AGENTS_COMPANY_PROJECTS);await page.locator('.save-employee').click();await expect(page.locator('.employee-form')).toHaveCount(0)
 const manager=(await cli('session','list')).sessions.find(c=>c.title==='Mac Manager');await expect.poll(async()=>(await cli('session','status','--employee',manager.id))[0].initialization.status).toBe('ready');assert.equal(manager.remote,null);assert.equal(manager.managementRole,'manager')
 const user=await cli('card','create','--title','User Created','--group','Cloud','--work-environment','local','--model','gpt-6-luna');await expect.poll(async()=>(await cli('session','status','--employee',user.id))[0].initialization.status).toBe('ready')
 await expect(page.locator('.office-connections [data-relation]')).toHaveCount(0)
 const token=(await cli('auth','agent-token',manager.id)).token,managerCall=async(...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env:{...env,AGENTS_COMPANY_TOKEN:token},timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
 const child=await managerCall('card','create','--title','Manager Created','--group','Cloud','--work-environment','local','--model','gpt-6-luna');await expect.poll(async()=>(await cli('session','status','--employee',child.id))[0].initialization.status).toBe('ready')
 await cli('card','update',manager.id,'--avatar','clawd');await cli('card','update',child.id,'--avatar','claude-octopus')
 const idle=await cli('card','create','--title','Idle observer','--group','Cloud','--work-environment','local','--model','gpt-6-luna');await expect.poll(async()=>(await cli('session','status','--employee',idle.id))[0].initialization.status).toBe('ready')
 const topology=await cli('management','topology');assert.equal(topology.edges.length,1);assert.equal(topology.edges[0].managerId,manager.id);assert.equal(topology.edges[0].employeeId,child.id)
 await expect(page.locator('.office-connections [data-relation]')).toHaveCount(1)
 const createdLine=page.locator(`.management-connection[data-manager="${manager.id}"][data-employee="${child.id}"]`)
 await managerCall('session','transcript','--employee',child.id)
 await expect(createdLine).toHaveAttribute('data-active','false')
 await managerCall('session','info','--employee',user.id)
 const temporaryLine=page.locator(`.management-connection[data-manager="${manager.id}"][data-employee="${user.id}"]`)
 await expect(temporaryLine).toHaveCount(0)
 const follow=async employee=>{const socket=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME));followers.push(socket);await new Promise((resolve,reject)=>{socket.once('error',reject);socket.once('connect',()=>socket.write(JSON.stringify({cmd:'session.follow',args:{employee},auth:token})+'\n'));socket.once('data',()=>resolve())});return socket}
 for(const card of [child,user]){fs.writeFileSync(path.join(control,card.id+'.hold-user'),'');await managerCall('session','send','--employee',card.id,'--text','Wait for fixture release')}
 const childStream=await follow(child.id),userStream=await follow(user.id)
 await expect(createdLine).toHaveAttribute('data-active','true');await expect(createdLine).toHaveAttribute('data-temporary','false')
 await expect(temporaryLine).toHaveAttribute('data-temporary','true');await expect(temporaryLine).toHaveAttribute('data-active','true')
 await expect(createdLine.locator('.management-line')).toHaveCSS('stroke','rgb(20, 122, 78)')
 await expect(page.locator('.office-connections')).toHaveCSS('animation-name','management-flow')
 assert.notEqual(await temporaryLine.locator('.management-line').evaluate(el=>getComputedStyle(el).strokeDasharray),'none')
 await expect(page.locator(`[data-card-id="${manager.id}"]`)).toHaveAttribute('data-state','communicating')
 for(const card of [manager,child,user])await expect(page.locator(`[data-card-id="${card.id}"] .sleep-marks`)).toHaveCount(0)
 assert.equal((await cli('session','status','--employee',manager.id))[0].busy,false,'communication cannot falsify engine busy state')
 await expect(page.locator(`[data-card-id="${idle.id}"]`)).toHaveAttribute('data-state','sleeping');await expect(page.locator(`[data-card-id="${idle.id}"] .sleep-marks`)).toHaveCount(1)
 assert.equal((await cli('management','activity')).interactions.length,2)
 childStream.destroy();await expect(createdLine).toHaveAttribute('data-active','true');await expect(temporaryLine).toHaveAttribute('data-active','true')
 userStream.destroy();await expect(temporaryLine).toHaveCount(1)
 await cli('session','interrupt','--employee',child.id);await expect(createdLine).toHaveAttribute('data-active','false');await expect(temporaryLine).toHaveAttribute('data-active','true')
 await cli('session','interrupt','--employee',user.id);await expect(temporaryLine).toHaveCount(0)
 await expect(page.locator(`[data-card-id="${manager.id}"]`)).toHaveAttribute('data-state','sleeping')
 await cli('view','open','employee','--employee',manager.id);await expect(page.locator('.profile-badges')).toContainText('Manager');await expect(page.locator('.management-role-settings select')).toHaveCount(0);await expect(page.locator('.management-panel')).toHaveCount(0)
 await cli('view','close');await page.screenshot({path:path.join(root,'.aexus/artifacts/mixed-team-creation-lines.png')})
 const before=await page.locator('.office-connections [data-relation]').getAttribute('d');await managerCall('card','place',child.id,'--x','470','--y','210','--snap','off');await expect.poll(()=>page.locator('.office-connections [data-relation]').getAttribute('d')).not.toBe(before)
 await cli('room','bounds','Cloud','--width','1100','--height','900')
 for(const [card,x,y] of [[manager,60,200],[user,415,380],[child,780,600]])await managerCall('card','place',card.id,'--x',String(x),'--y',String(y),'--snap','off')
 await cli('canvas','set','--x','30','--y','20','--zoom','.8')
 await managerCall('session','send','--employee',user.id,'--text','Second fixture turn');await follow(user.id);await expect(temporaryLine).toHaveCount(1)
 await page.screenshot({path:path.join(root,'.aexus/artifacts/multi-agent-interaction-dark.png')})
 await cli('settings','set','--theme','white');await managerCall('session','send','--employee',child.id,'--text','Second fixture turn');await follow(child.id);await expect(createdLine).toHaveAttribute('data-active','true')
 await page.screenshot({path:path.join(root,'.aexus/artifacts/multi-agent-interaction-light.png')})
 const savedPosition=(await cli('office','layout','--team','Cloud')).rooms[0].employees.find(card=>card.id===child.id).position
 const dragStart=await page.locator(`[data-card-id="${child.id}"] .employee-name`).boundingBox(),beforeDrag=await createdLine.locator('.management-line').getAttribute('d')
 await page.mouse.move(dragStart.x+20,dragStart.y+8);await page.mouse.down();await page.mouse.move(dragStart.x-60,dragStart.y-45,{steps:5})
 await expect.poll(()=>createdLine.locator('.management-line').getAttribute('d')).not.toBe(beforeDrag)
 assert.deepEqual((await cli('office','layout','--team','Cloud')).rooms[0].employees.find(card=>card.id===child.id).position,savedPosition,'preview routing does not persist mid-drag')
 await page.mouse.up();await expect.poll(async()=>(await cli('office','layout','--team','Cloud')).rooms[0].employees.find(card=>card.id===child.id).position.x).not.toBe(savedPosition.x)
 await cli('team-view','create','--name','Empty','--teams','[]');await expect(page.locator('.office-connections [data-relation]')).toHaveCount(0);assert.equal((await cli('management','topology')).edges.length,1);await cli('team-view','select','all');await expect(page.locator('.office-connections [data-relation]')).toHaveCount(1)
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden mixed-Team UI: Mac work environment enables Manager, local directory persists, user-created employees have no line, creator-only SVG follows dragging/views, management works without a line, manual relation controls removed')
}finally{followers.forEach(socket=>socket.destroy());await app.close();fs.rmSync(temp,{recursive:true,force:true})}
