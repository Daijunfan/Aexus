import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-api-'))),project=path.resolve(import.meta.dirname,'../../..'),home=path.join(temp,'state'),run=promisify(execFile)
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work')}
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'Infra/src/cli/agents')]
let daemon,done;const start=async()=>{daemon=spawn(executable,[...prefix,'serve'],{env,stdio:'ignore'});done=new Promise(r=>daemon.once('exit',r));for(let i=0;i<100;i++){try{await cli('status');return}catch{await new Promise(r=>setTimeout(r,40))}}throw new Error('Service did not start')}
const stop=async()=>{daemon.kill('SIGTERM');await done}
const cli=async(...args)=>{const data=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:10000})).stdout);assert.ok(data.ok,data.error);return data.data}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await start();const prefs=await cli('settings','get');ok(prefs.sidebarWidth===64&&prefs.snapEmployees,'sidebar width and snap defaults exist without a GUI')
 await cli('settings','set','--page-zoom','1.2','--explorer-width','300','--terminal-height','270');assert.equal((await cli('settings','get')).pageZoom,1.2);await assert.rejects(()=>cli('settings','set','--page-zoom','2'));
 await cli('group','add','Studio');await cli('room','bounds','Studio','--width','760','--height','700')
 const first=await cli('card','create','--title','A','--group','Studio'),second=await cli('card','create','--title','B','--group','Studio','--avatar','fireball','--color','#92b9df')
 await cli('card','place',first.id,'--x','48','--y','182','--snap','off')
 const pos=async()=>(await cli('session','list')).sessions.find(c=>c.id===second.id).position
 await cli('card','place',second.id,'--x','280','--y','189');assert.deepEqual(await pos(),{x:273,y:182});ok(true,'CLI placement uses the same standard-seat snap as the UI')
 await cli('settings','set','--sidebar-width','80','--snap-employees','off')
 await cli('card','place',second.id,'--x','280','--y','189');assert.deepEqual(await pos(),{x:280,y:189});ok(true,'saved snap-off leaves the exact requested position')
 await cli('card','place',second.id,'--x','280','--y','189','--snap','on');assert.deepEqual(await pos(),{x:273,y:182});ok(true,'per-placement snap override is available from CLI')
 await cli('card','place',second.id,'--x','280','--y','189','--snap','on','--zoom','3');assert.deepEqual(await pos(),{x:280,y:189});ok(true,'snap threshold is scaled to screen pixels')
 await assert.rejects(()=>cli('settings','set','--sidebar-width','10'));ok((await cli('settings','get')).sidebarWidth===80,'invalid sidebar width leaves persisted settings intact')
 const session=await cli('session','open',second.id);await assert.rejects(()=>cli('session','rename',session.sessionId,'一位员工 · 一个会话'))
 ok((await cli('session','snapshot',session.sessionId)).title==='B','live session IDs cannot bypass the employee name lock')
 await assert.rejects(()=>cli('card','update',second.id,'--title','Changed','--cwd','unwanted-new-folder','--directory-mode','create'))
 ok(!fs.existsSync(path.join(path.join(temp,'projects'),'Studio','unwanted-new-folder')),'immutable-name validation runs before folder creation')
 await cli('room','design','Studio','--background','#d8e9f3','--pattern','grid','--scenery','off')
 const beforeBounds=(await cli('room','layout','Studio')).bounds
 await cli('card','place',first.id,'--x','1300','--y','950','--snap','off')
 assert.deepEqual((await cli('room','layout','Studio')).bounds,beforeBounds)
 const confined=(await cli('room','layout','Studio')).employees.find(c=>c.card.id===first.id).position;ok(confined.x+190<=beforeBounds.width&&confined.y+250<=beforeBounds.height,'out-of-bounds placement is clamped without resizing the Team')
 await cli('room','bounds','Studio','--width','520','--height','450')
 const resized=await cli('room','layout','Studio');ok(resized.bounds.width===520&&resized.bounds.height===520&&resized.employees.every(c=>c.position.x+190<=520&&c.position.y>=182&&c.position.y+250<=520),'resizing honors the header minimum and confines all employee footprints below it')
 await assert.rejects(()=>cli('room','design','Studio','--background','invalid'))
 const again=await cli('session','open',second.id);ok(again.sessionId===session.sessionId&&(await cli('session','list','--live')).length===1,'reopening do not create another conversation')
 await assert.rejects(()=>cli('session','rename',second.id,' '));await cli('session','close',session.sessionId)
 await stop();await start()
 assert.equal((await cli('settings','get')).pageZoom,1.2);assert.equal((await cli('settings','get')).explorerWidth,300);assert.equal((await cli('settings','get')).terminalHeight,270);
 const store=await cli('session','list'),saved=store.sessions.find(c=>c.id===second.id)
 ok(store.rooms.Studio.design.background==='#d8e9f3'&&store.rooms.Studio.design.pattern==='grid'&&store.rooms.Studio.design.scenery===false,'custom Team background survives service restart')
 ok(saved.title==='B'&&saved.avatar==='fireball'&&saved.color==='#92b9df'&&store.sessions.length===2,'name, role appearance and identity survive service restart')
 ok((await cli('settings','get')).sidebarWidth===80&&!(await cli('settings','get')).snapEmployees,'sidebar size and snap preference survive restart')
 console.log(`PASS=${n} FAIL=0 — pure CLI, no model calls`)
}finally{if(daemon?.exitCode===null)await stop();fs.rmSync(temp,{recursive:true,force:true})}
