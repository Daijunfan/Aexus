// Hidden desktop and real authenticated Core/CLI. All employees, engines and tasks are disposable fixtures.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-binding-ui-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/management-bindings')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1600',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=async(token,...args)=>{const result=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
const cli=(...args)=>call(null,...args)
const status=async card=>(await cli('session','status','--employee',card.id))[0]
const create=async(title,group,role='employee',token=null)=>{const card=await call(token,'card','create','--title',title,'--group',group,'--engine','codex','--model','gpt-6-luna','--management-role',role);await expect.poll(async()=>(await status(card)).initialization.status).toBe('ready');return card}
const line=(source,target)=>page.locator(`.management-connection[data-manager="${source.id}"][data-employee="${target.id}"]`)
const mutate=(token,operation,source,target)=>call(token,'management',operation,'--manager',source.id,'--employee',target.id)
const normal=async source=>{
 await expect(source).toHaveCount(1);await expect(source).toHaveAttribute('data-active','false');await expect(source).toHaveAttribute('data-temporary','false')
 const style=await source.locator('.management-line').evaluate(el=>({stroke:getComputedStyle(el).stroke,dash:getComputedStyle(el).strokeDasharray,marker:el.getAttribute('marker-end'),path:el.getAttribute('d')}))
 assert.notEqual(style.stroke,'rgb(50, 188, 120)');assert.equal(style.dash,'none');assert.match(style.marker,/^url\(#/);assert.ok(style.path)
}
try{
 await page.locator('.infinite-canvas').waitFor()
 await cli('group','add','Binding Team');await cli('group','add','Governor Team')
 const manager=await create('Manager A','Binding Team','manager'),peer=await create('Manager B','Binding Team','manager'),governor=await create('Governor','Governor Team','governor'),worker=await create('Shared Employee','Binding Team')
 const mt=(await cli('auth','agent-token',manager.id)).token,pt=(await cli('auth','agent-token',peer.id)).token,gt=(await cli('auth','agent-token',governor.id)).token
 const child=await create('Creator Employee','Binding Team','employee',mt)
 await cli('room','bounds','Binding Team','--x','0','--y','0','--width','1020','--height','1100')
 await cli('room','bounds','Governor Team','--x','1200','--y','0','--width','560','--height','600')
 for(const [card,x,y] of [[manager,40,220],[peer,330,220],[worker,720,530],[child,380,810],[governor,170,250]])await cli('card','place',card.id,'--x',String(x),'--y',String(y),'--snap','off')
 await cli('canvas','set','--x','30','--y','20','--zoom','.65')
 const before=await cli('session','list')
 await expect(line(manager,worker)).toHaveCount(0);await normal(line(manager,child))
 await mutate(mt,'bind',manager,worker);await mutate(pt,'bind',peer,worker);await mutate(gt,'bind',governor,worker)
 const after=await cli('session','list');assert.deepEqual(after.sessions,before.sessions);assert.deepEqual(after.rooms,before.rooms)
 for(const theme of ['white','black']){
  await cli('settings','set','--theme',theme)
  for(const source of [manager,peer,governor])await normal(line(source,worker))
  assert.deepEqual((await cli('management','activity')).interactions,[])
  await page.screenshot({path:path.join(output,'persistent-'+theme+'.png')})
 }
 const creator=(await cli('management','topology')).edges.find(edge=>edge.employeeId===child.id)
 await call(mt,'management','unbind',creator.id);await expect(line(manager,child)).toHaveCount(0)
 await mutate(mt,'unbind',manager,worker);await expect(line(manager,worker)).toHaveCount(0)
 for(const source of [peer,governor])await normal(line(source,worker))
 await cli('settings','set','--theme','white');await page.reload();await page.locator('.infinite-canvas').waitFor()
 await expect(line(manager,child)).toHaveCount(0);await expect(line(manager,worker)).toHaveCount(0)
 for(const source of [peer,governor])await normal(line(source,worker))
 await cli('team-view','create','--name','One Team','--teams',JSON.stringify(['Binding Team']))
 await expect(line(governor,worker)).toHaveCount(0);await normal(line(peer,worker))
 await cli('team-view','select','all');await normal(line(governor,worker))
 // A real task retains its temporary green line when its persistent binding is removed.
 await mutate(mt,'bind',manager,worker)
 const hold=path.join(control,worker.id+'.hold-user');fs.writeFileSync(hold,'')
 await call(mt,'session','send','--employee',worker.id,'--text','Held fixture work')
 await expect(line(manager,worker)).toHaveAttribute('data-active','true');await expect(line(manager,worker)).toHaveAttribute('data-temporary','false')
 const task=(await cli('session','info','--employee',worker.id)).currentTask
 await mutate(mt,'unbind',manager,worker)
 await expect(line(manager,worker)).toHaveAttribute('data-temporary','true');await expect(line(manager,worker)).toHaveAttribute('data-active','true')
 await expect(line(manager,worker).locator('.management-line')).toHaveCSS('stroke','rgb(50, 188, 120)')
 assert.equal((await cli('session','info','--employee',worker.id)).currentTask.messageId,task.messageId)
 for(const source of [peer,governor])await normal(line(source,worker))
 fs.unlinkSync(hold);await expect.poll(async()=>(await status(worker)).busy).toBe(false)
 await expect(line(manager,worker)).toHaveCount(0)
 for(const source of [peer,governor])await normal(line(source,worker))
 await page.screenshot({path:path.join(output,'after-unbind.png')})
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
 console.log('PASS hidden binding arrows: multiple idle solid directional arrows, two themes, source-specific removal, creator suppression, reload/views, genuine task green-to-removed transition and unchanged employees/geometry')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
