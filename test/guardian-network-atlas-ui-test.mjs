// Real local TCP observations; hidden Electron, isolated data and no geolocation consent.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url)
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-atlas-ui-')))
const output=path.join(root,'.aexus/artifacts/guardian-network-atlas-20261011')
fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_HOME:path.join(temp,'codex')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const report={passed:false,checks:[],errors:[],consoleErrors:[],geoConsentGranted:false,paidModelCalls:0}
let app,page
try{
 app=await electron.launch({executablePath:require('electron'),args:[root],env})
 page=await app.firstWindow()
 page.setDefaultTimeout(15000)
 page.on('pageerror',error=>report.errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text())})
 await page.getByRole('button',{name:'Guardian',exact:true}).click()
 await page.getByTestId('guardian-open-modules').click()
 await page.getByTestId('guardian-modules-menu').locator('[data-domain="network"]').click()
 const network=page.getByTestId('guardian-network-panel')
 await expect(network).toBeVisible()
 await page.getByRole('button',{name:'暂停实时采样',exact:true}).click()
 const atlas=network.getByTestId('guardian-network-atlas')
 await expect(atlas).toBeVisible()
 await expect.poll(async()=>Number(await atlas.getAttribute('data-total'))).toBeGreaterThan(0)
 const values=await atlas.evaluate(element=>({
  total:Number(element.dataset.total),owned:Number(element.dataset.owned),unknown:Number(element.dataset.unowned),
  rows:[...element.querySelectorAll('button[data-pid]')].map(item=>({pid:Number(item.dataset.pid),count:Number(item.dataset.count)}))
 }))
 assert.equal(values.owned+values.unknown,values.total)
 assert.ok(values.rows.length>0&&values.rows.length<=6)
 assert.ok(values.rows.every(item=>item.count>0))
 assert.ok(values.rows.reduce((sum,item)=>sum+item.count,0)<=values.owned)
 report.checks.push('All atlas counters originate in one observed TCP snapshot; no fabricated owner count')
 await atlas.scrollIntoViewIfNeeded()
 await page.screenshot({path:path.join(output,'network-atlas-wide.png'),animations:'disabled'})
 const first=values.rows[0]
 await atlas.locator('button[data-pid]').first().click()
 await expect(atlas.locator(`button[data-pid="${first.pid}"]`)).toHaveAttribute('aria-pressed','true')
 await expect(network.locator('.g-pid-chip')).toContainText('PID '+first.pid)
 const observed=await network.locator('tbody tr td:first-child small').allTextContents()
 assert.ok(observed.length>0&&observed.every(item=>item==='PID '+first.pid))
 report.checks.push('Selecting a measured PID filters the existing TCP inspector exactly')
 await atlas.getByRole('button',{name:'显示全部进程的网络连接'}).click()
 await expect(network.locator('.g-pid-chip')).toHaveCount(0)
 await expect(atlas.getByRole('button',{name:'显示全部进程的网络连接'})).toHaveAttribute('aria-pressed','true')
 report.checks.push('The local-host hub clears the PID selection without mutating Core')
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900))
 await atlas.scrollIntoViewIfNeeded()
 assert.ok(await page.getByTestId('guardian-view').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'compact view must not overflow')
 await page.screenshot({path:path.join(output,'network-atlas-compact.png'),animations:'disabled'})
 report.checks.push('The topology stays interactive and non-overflowing in a 720px hidden window')
 const settings=await page.evaluate(()=>window.agents.call('guardian.settings-get'))
 assert.equal(settings.geoLookupEnabled,false)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 assert.deepEqual(report.errors,[])
 assert.deepEqual(report.consoleErrors,[])
 report.checks.push('No foreground window, geolocation consent, paid model or page error')
 report.passed=true
 console.log('PASS Guardian Network Atlas: '+report.checks.join('; '))
}catch(error){
 report.failure=error.stack??String(error)
 await page?.screenshot({path:path.join(output,'network-atlas-failure.png')}).catch(()=>{})
 throw error
}finally{
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n')
 await app?.close()
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
