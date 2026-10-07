// Actual search UI and event subscriptions; all records, events and transport stay in memory.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'vite'
import {chromium,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'../../..'),renderer=path.join(root,'Infra/src/renderer/src'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-library-refresh-'))),out=path.join(root,'.aexus/artifacts/message-library-refresh')
let browser
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 fs.writeFileSync(path.join(temp,'index.html'),'<html data-theme="violet" data-presentation="messages"><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>')
 const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,quote,file])=>'import '+JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)).join('\n')
 fs.writeFileSync(path.join(temp,'fixture.tsx'),`
import React,{useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {MessageLibrary} from '${renderer}/components/MessageLibrary';
import {MessengerContext,useMessengerState} from '${renderer}/components/useMessenger';
import {setInterfaceLanguage} from '${renderer}/i18n';setInterfaceLanguage('en');
function Fixture(){const messenger=useMessengerState(true);window.libraryFixture={open:messenger.setLibrary};useEffect(()=>{if(messenger.ready)messenger.setLibrary({})},[messenger.ready]);return <MessengerContext.Provider value={messenger}><div className="app in-messages"><div className="message-view"><div className="message-stage">{messenger.library&&<MessageLibrary key={JSON.stringify(messenger.library)}/>}</div></div></div></MessengerContext.Provider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`+styles)
 await build({configFile:false,root:temp,publicDir:false,esbuild:{jsx:'automatic'},build:{outDir:path.join(temp,'dist'),reportCompressedSize:false},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1200,height:840},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(()=>{
  const listeners=new Set();window.calls=[];window.held=[];window.holdNext=false;window.searchDelay=0;window.searching=0;window.maxSearching=0
  window.message=(conversation,id,text,createdAt=100)=>({conversation,conversationTitle:conversation,id,author:conversation.startsWith('employee:')?'Aster':'You',authorIdentity:conversation.startsWith('employee:')?{kind:'agent',employeeId:conversation.slice(9)}:{kind:'operator'},role:conversation.startsWith('employee:')?'assistant':'user',text,images:[],createdAt,preferences:{saved:true}})
  window.records=[window.message('group:studio','g1','Original group proposal',300),window.message('employee:aster','p1','Existing private result',200),window.message('group:other','o1','Other group record',100)]
  window.emit=(channel,payload={})=>listeners.forEach(listener=>listener({channel,payload}))
  window.agents={platform:'macos',onEvent:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},call:async(cmd,args={})=>{
   window.calls.push({cmd,args:structuredClone(args)})
   if(cmd==='messenger.state')return {version:1,revision:1,conversations:{},messages:{},drafts:{},folders:[]}
   if(cmd==='messenger.search'){
    window.maxSearching=Math.max(window.maxSearching,++window.searching)
    const all=window.records.filter(message=>(!args.conversation||message.conversation===args.conversation)&&(!args.query||message.text.toLowerCase().includes(args.query.toLowerCase()))&&(args.filter!=='saved'||message.preferences.saved)&&(args.author!=='you'||message.authorIdentity.kind==='operator')&&(args.author!=='employee'||message.authorIdentity.kind==='agent')).sort((a,b)=>b.createdAt-a.createdAt||a.conversation.localeCompare(b.conversation)||a.id.localeCompare(b.id))
    const offset=args.offset??0,messages=all.slice(offset,offset+(args.limit??40)),result=structuredClone({messages,total:all.length,hasMore:offset+messages.length<all.length})
    if(window.holdNext){window.holdNext=false;await new Promise(resolve=>window.held.push(resolve))}
    if(window.searchDelay)await new Promise(resolve=>setTimeout(resolve,window.searchDelay))
    window.searching--
    return result
   }
   throw Error('Unexpected fixture call: '+cmd)
  }}
 })
 await page.route('https://library-refresh.test/**',route=>route.fulfill({path:path.join(temp,'dist',new URL(route.request().url()).pathname.slice(1)||'index.html')}))
 await page.goto('https://library-refresh.test/')
 const rows=page.locator('.message-result'),text=rows.locator('p'),searches=()=>page.evaluate(()=>window.calls.filter(call=>call.cmd==='messenger.search')),emit=(channel,payload)=>page.evaluate(([channel,payload])=>window.emit(channel,payload),[channel,payload]),open=config=>page.evaluate(config=>window.libraryFixture.open(config),config)
 const settled=()=>expect(page.locator('.message-library-results')).toHaveAttribute('aria-busy','false')
 await expect(rows).toHaveCount(3);await settled()
 // Continuous native lifecycle traffic must not postpone initial results or cancel slow searches.
 await page.evaluate(()=>{window.searchDelay=180;window.maxSearching=0;window.stormTick=0;window.libraryFixture.open({filter:'saved'});window.storm=setInterval(()=>{window.records[0].text='Live update '+(++window.stormTick);window.emit('chat:changed',{id:'studio'});window.emit('session:turn-end',{sessionId:'live-aster'})},40)})
 await expect(page.locator('.message-library h2')).toHaveText('Saved messages');await expect(rows).toHaveCount(3,{timeout:1000});assert.ok(await page.evaluate(()=>window.stormTick>0),'first results are visible while events still arrive')
 await expect(page.locator('.message-library-summary [role=status]')).toHaveText('3 messages',{timeout:1000})
 await page.evaluate(()=>{clearInterval(window.storm);window.records[0].text='Final update after continuous events';window.emit('chat:changed',{id:'studio'})})
 await expect(text.first()).toHaveText('Final update after continuous events');await expect.poll(()=>page.evaluate(()=>window.searching)).toBe(0);assert.equal(await page.evaluate(()=>window.maxSearching),1,'same-query refreshes are serialized')
 await page.evaluate(()=>{window.searchDelay=0;window.records[0].text='Original group proposal';window.libraryFixture.open({})});await expect(text.first()).toHaveText('Original group proposal');await settled()
 await page.evaluate(()=>{window.records[0].text='Corrected group proposal';window.records[0].editedAt=400;window.records[0].editRevision=1;window.emit('chat:changed',{id:'studio',editedMessageId:'g1'})})
 await expect(text.first()).toHaveText('Corrected group proposal');await expect(rows.first()).toContainText('Edited')
 await page.evaluate(()=>{window.records.unshift(window.message('group:studio','g2','A new public update',500));window.emit('chat:changed',{id:'studio'})})
 await expect(rows).toHaveCount(4);await expect(text.first()).toHaveText('A new public update')
 for(const [index,event] of ['session:user','session:turn-end','session:interrupted','session:error'].entries()){
  await page.evaluate(([index,event])=>{window.records.unshift(window.message('employee:aster','private-'+index,'Persisted '+event,600+index));window.emit(event,{sessionId:'live-aster',...(event==='session:error'?{message:'Fixture stopped'}:{})})},[index,event])
  await expect(text.first()).toHaveText('Persisted '+event)
 }
 let count=(await searches()).length
 await page.evaluate(()=>{for(let i=0;i<60;i++)for(const channel of ['session:agent','session:codex','session:message'])window.emit(channel,{sessionId:'live-aster',event:{kind:'text-delta',text:'token'}})})
 await page.waitForTimeout(180);assert.equal((await searches()).length,count,'token streams do not trigger searches')
 await page.evaluate(()=>{for(let i=0;i<20;i++)window.emit('chat:changed',{id:'studio'})})
 await expect.poll(async()=>(await searches()).length).toBe(count+1);await settled();await page.waitForTimeout(100);assert.equal((await searches()).length,count+1,'a change burst coalesces into one refresh')

 await open({conversation:'group:studio',filter:'saved'});await expect(rows).toHaveCount(2);await settled();count=(await searches()).length
 await emit('chat:changed',{id:'other'});await emit('session:turn-end',{sessionId:'live-aster'});await emit('channel:changed',{kind:'posts',channelIds:['news']});await page.waitForTimeout(180)
 assert.equal((await searches()).length,count,'group scope ignores other groups, private turns and channels')
 await page.evaluate(()=>{window.records.find(message=>message.id==='g1').text='Saved proposal corrected again';window.emit('chat:changed',{id:'studio',editedMessageId:'g1'})})
 await expect(text).toContainText(['A new public update','Saved proposal corrected again'])

 await open({conversation:'employee:aster'});await expect(rows).toHaveCount(5);await settled();count=(await searches()).length
 await emit('chat:changed',{id:'studio'});await emit('channel:changed',{kind:'posts',channelIds:['news']});await page.waitForTimeout(180);assert.equal((await searches()).length,count,'private scope ignores group and channel traffic')
 await page.evaluate(()=>{window.records.find(message=>message.id==='p1').text='Private result after interruption';window.emit('session:interrupted',{sessionId:'live-aster'})})
 await expect(text.last()).toHaveText('Private result after interruption');assert.equal((await searches()).at(-1).args.conversation,'employee:aster','native session events retain the explicit employee search scope')
 await open({conversation:'channel:news'});await expect(rows).toHaveCount(0);await settled();count=(await searches()).length
 await emit('channel:changed',{kind:'reads',channelIds:['news'],entryIds:['seen-article']});await page.waitForTimeout(180);assert.equal((await searches()).length,count,'personal reading never reloads unchanged search result bodies')
 await emit('chat:changed',{id:'studio'});await emit('session:user',{sessionId:'live-aster'});await emit('channel:changed',{kind:'posts',channelIds:['other']});await page.waitForTimeout(180);assert.equal((await searches()).length,count,'channel scope ignores unrelated traffic')
 await emit('channel:changed',{kind:'posts',channelIds:['news']});await expect.poll(async()=>(await searches()).length).toBe(count+1);await settled()

 // Preserve a deep reading position and every loaded record when new results arrive at the head.
 await page.evaluate(()=>{window.records=Array.from({length:75},(_,i)=>window.message('group:studio','page-'+i,'A stable reading position '+i+' · '+'Details worth keeping. '.repeat(8),1000-i));window.libraryFixture.open({conversation:'group:studio'})})
 await expect(rows).toHaveCount(40);await page.getByRole('button',{name:'Load more messages',exact:true}).click();await expect(rows).toHaveCount(75)
 const anchor=page.locator('[data-message-key="group:studio/page-60"]')
 await anchor.scrollIntoViewIfNeeded();const anchorTop=(await anchor.boundingBox()).y
 await page.evaluate(()=>{window.records.unshift(window.message('group:studio','head','Newest group update',2000));window.emit('chat:changed',{id:'studio'})})
 await expect(rows).toHaveCount(76);for(let i=0;i<75;i++)await expect(page.locator('[data-message-key="group:studio/page-'+i+'"]')).toHaveCount(1)
 assert.ok(Math.abs((await anchor.boundingBox()).y-anchorTop)<3,'refresh keeps the same visible message at the same screen position')
 fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'reading-position.png')})

 // Same-query events wait behind a held request, then refresh the newest authoritative text.
 await page.evaluate(()=>{window.holdNext=true;window.records.find(message=>message.id==='head').text='Stale held snapshot';window.emit('chat:changed',{id:'studio',editedMessageId:'head'})})
 await expect.poll(()=>page.evaluate(()=>window.held.length)).toBe(1)
 count=(await searches()).length
 await page.evaluate(()=>{window.records.find(message=>message.id==='head').text='Newest authoritative correction';window.emit('chat:changed',{id:'studio',editedMessageId:'head'})})
 await page.waitForTimeout(180);assert.equal((await searches()).length,count,'same-query events do not start a concurrent request')
 await page.evaluate(()=>window.held.shift()());await expect(page.locator('[data-message-key="group:studio/head"] p')).toHaveText('Newest authoritative correction');await settled()

 // Query, filter and conversation changes still reject old responses rather than queueing behind them.
 await page.evaluate(()=>{window.holdNext=true;window.emit('chat:changed',{id:'studio'})});await expect.poll(()=>page.evaluate(()=>window.held.length)).toBe(1)
 await page.getByRole('textbox',{name:'Search full message history'}).fill('Newest authoritative correction');await expect(rows).toHaveCount(1);await settled()
 await page.evaluate(()=>window.held.shift()());await page.waitForTimeout(100);await expect(rows).toHaveCount(1)
 await page.evaluate(()=>{window.holdNext=true;window.emit('chat:changed',{id:'studio'})});await expect.poll(()=>page.evaluate(()=>window.held.length)).toBe(1)
 await page.evaluate(()=>{window.records.find(message=>message.id==='head').preferences.saved=false});await page.getByRole('button',{name:'Saved',exact:true}).click();await expect(rows).toHaveCount(0);await settled()
 await page.evaluate(()=>window.held.shift()());await page.waitForTimeout(100);await expect(rows).toHaveCount(0)
 await page.evaluate(()=>{window.holdNext=true;window.records.push(window.message('employee:aster','private-final','A separate private conversation',3000));window.emit('chat:changed',{id:'studio'})});await expect.poll(()=>page.evaluate(()=>window.held.length)).toBe(1)
 await open({conversation:'employee:aster'});await expect(text).toHaveText(['A separate private conversation']);await settled()
 await page.evaluate(()=>window.held.shift()());await page.waitForTimeout(100);await expect(text).toHaveText(['A separate private conversation'])

 // Leaving cancels the pending debounce and ignores any already-started query response.
 await page.evaluate(()=>{window.holdNext=true;window.emit('session:turn-end',{sessionId:'live-aster'})});await expect.poll(()=>page.evaluate(()=>window.held.length)).toBe(1)
 count=(await searches()).length;await emit('session:turn-end',{sessionId:'live-aster'});await page.getByRole('button',{name:'Close message library',exact:true}).click();await expect(page.locator('.message-library')).toHaveCount(0)
 await page.evaluate(()=>{window.held.shift()();window.emit('chat:changed',{id:'studio'});window.emit('session:turn-end',{sessionId:'live-aster'})});await page.waitForTimeout(180)
 assert.equal((await searches()).length,count,'unmounted library has no event or timer queries');assert.deepEqual(errors,[])
 assert.ok((await page.evaluate(()=>window.calls)).every(call=>['messenger.state','messenger.search'].includes(call.cmd)),'fixture never mutates Core or starts an engine')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks:['slow initial results remain visible during continuous events','one in-flight same-query search and coalesced trailing refresh','global group edits and new posts','persisted private user/completed/interrupted/error events','group/private/channel scopes','saved group edits','no token-triggered queries','burst debounce','76 loaded results retained with stable reading anchor','query/filter/conversation changes reject superseded responses','leave cancels timer and ignores late response'],realCoreCalls:0,platform:'headless Chrome'},null,2))
 console.log('PASS live message library refresh: group and persisted private changes, scoped/debounced queries, stable reading window, stale response and leave cleanup')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
