// Real Web/Core and authenticated CLI mutations; no production state or paid provider.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),out=path.join(f.root,'.aexus/artifacts/slimming-final/events'),checks=[],measurements=[];fs.mkdirSync(out,{recursive:true});let browser,page
const rpc=async(cmd,args={})=>{const reply=await f.request(null,cmd,args);assert.ok(reply.ok,reply.error);return reply.data}
try{
 await rpc('settings.set',{language:'en'});await rpc('group.add',{name:'Design'});await rpc('group.add',{name:'Engineering'})
 const a=await f.create('Aster','Design'),b=await f.create('Rowan','Engineering'),group=await rpc('chat.create',{name:'Release review',members:[a.id,b.id]})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1380,height:960}});const errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000)
 await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click();await expect(page.locator('.infinite-canvas')).toBeVisible()
 console.log('EVENT CASE: authenticated browser');await page.evaluate(()=>{const call=window.agents.call;window.requestAudit=[];window.agents.call=async(cmd,args)=>{window.requestAudit.push({cmd,args,at:performance.now()});return call(cmd,args)}})
 const clear=async()=>{await page.waitForTimeout(600);await page.evaluate(()=>window.requestAudit=[])}
 const audit=async(label,deny)=>{await page.waitForTimeout(600);const requests=await page.evaluate(()=>window.requestAudit),counts={};for(const request of requests)counts[request.cmd]=(counts[request.cmd]??0)+1;assert.ok(!requests.some(deny),label+': '+JSON.stringify(counts));measurements.push({label,counts});return requests}
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Message Aster',exact:true}).click();await expect(page.locator('.message-conversation .composer textarea')).toBeEnabled();await clear()
 for(let i=0;i<30;i++)await rpc('messenger.draft',{conversation:'employee:'+b.id,text:'Background note '+i,clientMessageId:'draft-'+i})
 await audit('30 background draft saves',request=>['session.list','session.snapshot','session.inbox','chat.list','plan.query'].includes(request.cmd))
 await expect(page.locator('.message-contact[data-employee="'+b.id+'"]')).toContainText('Background note 29');await expect(page.locator('.message-conversation .composer textarea')).toHaveValue('')
 console.log('EVENT CASE: background drafts isolated');checks.push('Background drafts reach their own conversation without reopening engines, fetching all live sessions or overwriting the selected draft')
 await clear();for(let i=0;i<12;i++)await rpc('card.place',{id:a.id,x:100+i,y:200+i,snap:false})
 await audit('12 visual employee moves',request=>request.cmd==='session.list'&&request.args?.live||['session.snapshot','session.inbox','chat.list'].includes(request.cmd))
 console.log('EVENT CASE: visual-only changes isolated');await rpc('card.rename',{cardId:b.id,title:'Rowan · Engineering'});await expect(page.getByRole('button',{name:'Message Rowan · Engineering',exact:true})).toBeVisible();console.log('EVENT CASE: renamed member shown');await page.getByRole('button',{name:'Open group Release review',exact:true}).click();console.log('EVENT CASE: group opened');await page.getByRole('button',{name:'Manage group',exact:true}).click();await expect(page.getByRole('dialog',{name:'Edit group',exact:true})).toContainText('Rowan · Engineering');await page.keyboard.press('Escape')
 console.log('EVENT CASE: group members inspected');checks.push('Canvas-only writes skip group/inbox and execution queries; a real employee rename still refreshes shared group membership labels')
 await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-view')).toBeVisible();await clear()
 const jobs=[];for(let i=0;i<15;i++)jobs.push(await rpc('schedule.create',{spec:{name:'Release check '+i,enabled:false,action:{type:'agent',employeeId:i%2?a.id:b.id,prompt:'A paused scenario: do not execute.'},rule:{kind:'once',at:new Date(Date.now()+86400000).toISOString()},plan:{priority:i%3?'normal':'high',tags:['release']}}}))
 await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(15)
 const requests=await audit('15 paused plan creations',request=>request.cmd==='session.list'&&request.args?.live||['session.snapshot','session.inbox','chat.list'].includes(request.cmd));assert.ok(requests.some(request=>request.cmd==='plan.query'))
 assert.equal((await rpc('schedule.history')).length,0);await page.screenshot({path:path.join(out,'plan-events.png')})
 checks.push('External plan edits refresh the actual database while unrelated live sessions and hidden Messages catalogs remain untouched')
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open group Release review',exact:true}).click();const input=page.getByRole('textbox',{name:'Group message',exact:true});await input.fill('Review the release');await page.getByRole('button',{name:'Send group message',exact:true}).click();await expect(input).toHaveValue('')
 await f.until(async()=>{const history=await rpc('chat.history',{id:group.id});return history.messages.length&&history.messages.every(message=>message.deliveries.every(delivery=>delivery.status==='completed'))},'real group execution and acknowledgments')
 for(const person of [a,b])assert.equal((await rpc('session.transcript',{employee:person.id})).items.filter(item=>item.text==='Review the release').length,1)
 await page.screenshot({path:path.join(out,'messages-events.png')});checks.push('After filtered background traffic, a real group broadcast still executes exactly once in both existing native conversations')
 assert.deepEqual(errors,[]);assert.deepEqual(await rpc('terminal.list'),[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,measurements,scope:'Actual headless browser and disposable authenticated Core; deterministic engine protocol'},null,2));console.log('PASS '+checks.join('; '))
}catch(error){console.error('EVENT CASE FAILED',error);throw error}finally{await browser?.close();await f.close()}
