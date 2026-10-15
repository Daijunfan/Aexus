import {desktopExecutable} from './fixtures/desktop-app.mjs'
// Hidden native UI with a real Core send; delay only its accepted IPC response in this disposable process.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),application=process.env.AGENTS_COMPANY_TEST_APP,mode=application?(path.resolve(application).startsWith('/Applications/')?'installed':'candidate'):'source',out=path.join(root,'artifacts/private-draft-native')
const bundleRoot=application?(application.endsWith('.app')?application:application.slice(0,application.indexOf('.app/')+4)):undefined
fs.mkdirSync(out,{recursive:true});let f,app,page,appProcess;const checks=[],errors=[],report={passed:false,mode,application:application??'Coordinated source Electron build',checks,rendererErrors:errors,providerCalls:0}
if(bundleRoot){assert.ok(bundleRoot.endsWith('.app'));report.asarSha256=createHash('sha256').update(fs.readFileSync(path.join(bundleRoot,'Contents/Resources/app.asar'))).digest('hex')}
try{
 f=await fixtureCore(bundleRoot?{AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(bundleRoot,'Contents/Resources/plugins')}:{})
 await f.stop()
 const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1280',AGENTS_COMPANY_HEIGHT:'940'};for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_WEB','AGENTS_COMPANY_WEB_URL','AGENTS_COMPANY_HEADLESS'])delete env[key]
 app=await electron.launch({executablePath:application?(desktopExecutable(application)):require('electron'),args:application?[]:[root],env});appProcess=app.process();report.pid=appProcess.pid;page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.locator('.infinite-canvas').waitFor()
 report.hidden=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible()));assert.ok(report.hidden)
 await app.evaluate(({ipcMain})=>{
  const handlers=ipcMain._invokeHandlers;if(!(handlers instanceof Map))throw Error('This Electron does not expose the verified IPC handler map');const original=handlers.get('api:request');if(typeof original!=='function')throw Error('The real API IPC handler is missing')
  const state=globalThis.privateDraftProbe={original,calls:[],holdText:null,accepted:0,returned:0,release:null}
  ipcMain.removeHandler('api:request');ipcMain.handle('api:request',async(event,request)=>{
   if(['session.send','session.enqueue'].includes(request.cmd))state.calls.push({cmd:request.cmd,args:structuredClone(request.args)})
   // Run the original trusted-frame, authenticated Core and native foreground checks without bypass.
   const result=await original(event,request)
   if(request.cmd==='session.send'&&request.args?.text===state.holdText){state.holdText=null;state.accepted++;await new Promise(resolve=>state.release=resolve);state.release=null;state.returned++}
   return result
  })
 })
 const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),rpc=async(cmd,args={})=>{const response=await f.request(null,cmd,args);assert.ok(response.ok,response.error);return response.data},stored=async id=>(await rpc('messenger.state')).drafts['employee:'+id],input=()=>page.locator('.message-conversation .composer-box textarea'),open=async card=>{await call('view.open',{kind:'messages',employee:card.id});await expect(page.locator('.message-thread-header .message-person strong')).toHaveText(card.title);await expect(input()).toBeEnabled()},arm=text=>app.evaluate((_electron,text)=>{globalThis.privateDraftProbe.holdText=text},text),release=()=>app.evaluate(()=>globalThis.privateDraftProbe.release?.()),accepted=count=>expect.poll(()=>app.evaluate(()=>globalThis.privateDraftProbe.accepted)).toBe(count),returned=count=>expect.poll(()=>app.evaluate(()=>globalThis.privateDraftProbe.returned)).toBe(count),users=async id=>(await rpc('session.transcript',{employee:id})).items.filter(item=>item.role==='user')
 await call('settings.set',{language:'en'});await f.cli('group','add','Native draft recovery');const a=await f.create('Draft Governor','Native draft recovery','governor'),b=await f.create('Draft Secretary','Native draft recovery','secretary')
 await open(a);await input().fill('NATIVE_ACCEPTED_OLD');await arm('NATIVE_ACCEPTED_OLD');await page.getByRole('button',{name:'Send message',exact:true}).click();await accepted(1);const first=await stored(a.id);assert.equal(first.text,'NATIVE_ACCEPTED_OLD');assert.ok(first.clientMessageId);assert.equal((await users(a.id)).filter(item=>item.text==='NATIVE_ACCEPTED_OLD').length,1)
 await open(b);await input().fill('KEEP_INDEPENDENT_B');await open(a);await input().fill('KEEP_NEW_NATIVE_A');const newer=await f.until(async()=>{const draft=await stored(a.id);return draft?.text==='KEEP_NEW_NATIVE_A'&&draft},'new A saved');assert.notEqual(newer.clientMessageId,first.clientMessageId);await release();await returned(1);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(input()).toHaveValue('KEEP_NEW_NATIVE_A');assert.equal((await stored(a.id)).clientMessageId,newer.clientMessageId);assert.equal((await stored(b.id)).text,'KEEP_INDEPENDENT_B');await f.until(async()=>!(await f.status(a.id)).busy,'first native work complete');await page.screenshot({path:path.join(out,mode+'-newer-draft.png')})
 checks.push('Real accepted IPC send followed by A→B→A preserves the new A draft and independent B draft; old completion cannot clear their saved identities')
 await input().fill('NATIVE_UNCHANGED_REOPEN');await arm('NATIVE_UNCHANGED_REOPEN');await page.getByRole('button',{name:'Send message',exact:true}).click();await accepted(2);await open(b);await open(a);await expect(input()).toHaveValue('NATIVE_UNCHANGED_REOPEN');await release();await returned(2);await expect(input()).toHaveValue('');await f.until(async()=>!(await stored(a.id)),'accepted unchanged A cleared');assert.equal((await stored(b.id)).text,'KEEP_INDEPENDENT_B');await f.until(async()=>!(await f.status(a.id)).busy,'second native work complete')
  checks.push('An unchanged A draft reopened during its real send clears after success, despite navigation sequence changes')
  await input().fill('NATIVE_PEER_DRAFT');await arm('NATIVE_PEER_DRAFT');await page.getByRole('button',{name:'Send message',exact:true}).click();await accepted(3);await rpc('messenger.draft',{conversation:'employee:'+a.id,text:'PEER_NATIVE_DRAFT_B',clientMessageId:'peer-native-b'});await release();await returned(3);await expect(input()).toHaveValue('PEER_NATIVE_DRAFT_B');assert.equal((await stored(a.id)).clientMessageId,'peer-native-b');await open(b);await open(a);await expect(input()).toHaveValue('PEER_NATIVE_DRAFT_B');await f.until(async()=>!(await f.status(a.id)).busy,'peer native work complete')
  checks.push('A second real Core client replacing the unchanged in-flight draft is reflected in the native composer and local reopening state after CAS no-op')
 await open(b);await input().fill('SECRETARY_NATIVE_UI_SEND');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(input()).toHaveValue('');await f.until(async()=>!(await f.status(b.id)).busy&&(await users(b.id)).some(item=>item.text==='SECRETARY_NATIVE_UI_SEND'),'Secretary actual UI send complete');assert.equal((await users(b.id)).filter(item=>item.text==='SECRETARY_NATIVE_UI_SEND').length,1);assert.equal((await f.status(b.id)).currentTask.viewId,undefined);const calls=await app.evaluate(()=>globalThis.privateDraftProbe.calls),secretarySend=calls.find(value=>value.args.text==='SECRETARY_NATIVE_UI_SEND');assert.ok(secretarySend);assert.equal(secretarySend.args.viewId,undefined);assert.ok(calls.filter(value=>value.args.text.startsWith('NATIVE_')).every(value=>value.args.viewId==='all'));await page.screenshot({path:path.join(out,mode+'-secretary-send.png')});assert.equal(await stored(b.id),undefined)
 checks.push('Secretary sends from the actual composer with no Governor-only viewId; Governor requests retain their explicit all-view scope')
  assert.equal((await users(a.id)).filter(item=>item.text.startsWith('NATIVE_')).length,3);assert.deepEqual(await rpc('terminal.list'),[]);assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())));report.passed=true;console.log('PASS '+mode+' native private draft: '+checks.join('; '))
}catch(error){report.error=error.message;await page?.screenshot({path:path.join(out,mode+'-failure.png')}).catch(()=>{});throw error}
finally{
 if(app){await app.evaluate(({ipcMain})=>{const state=globalThis.privateDraftProbe;if(state){state.release?.();ipcMain.removeHandler('api:request');ipcMain.handle('api:request',state.original);delete globalThis.privateDraftProbe}}).catch(()=>{});await app.close()}
 report.closed=!appProcess||appProcess.exitCode!==null||appProcess.signalCode!==null;await f?.close();fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(report,null,2));assert.ok(report.closed,'The hidden test application must exit')
}
