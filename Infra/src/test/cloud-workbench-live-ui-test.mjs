// Opt-in, read-only remote shell and RDP negotiation. Uses an isolated host registry; no employees or model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
if(process.env.AGENTS_CLOUD_WORKBENCH_LIVE!=='1')throw Error('Set AGENTS_CLOUD_WORKBENCH_LIVE=1 to authorize read-only tests on registered hosts')
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-live-ui-')),source=path.join(os.homedir(),'AgentsCompany/cloud-hosts'),records=JSON.parse(fs.readFileSync(path.join(source,'hosts.json'))),host=records.find(h=>h.name===(process.env.AGENTS_CLOUD_LIVE_HOST||'BUPT Windows'));assert.ok(host)
const dir=path.join(temp,'cloud-hosts');fs.mkdirSync(dir,{mode:0o700});fs.writeFileSync(path.join(dir,'hosts.json'),JSON.stringify(records.filter(h=>h.id===host.id||h.id===host.vm?.hypervisorId)),{mode:0o600});if(fs.existsSync(path.join(source,'credential.key')))fs.copyFileSync(path.join(source,'credential.key'),path.join(dir,'credential.key'))
const env={...process.env,AGENTS_COMPANY_HOME:temp,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1400',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:35000})).stdout);assert.ok(r.ok,r.error);return r.data}
try{
 await page.locator('.infinite-canvas').waitFor();const opened=app.waitForEvent('window');await page.locator('[data-plugin="cloud-hosts"]').click();const plugin=await opened
 await expect(plugin.locator('#add')).toBeEnabled();await plugin.locator(`[data-id="${host.id}"]`).click();await plugin.locator('[data-view=terminal]').click();const start=Date.now();await plugin.locator('#terminal-new').click();await expect(plugin.locator('.xterm')).toBeVisible()
 const term=(await cli('host','terminal-list',host.id))[0],read=()=>cli('host','terminal-read',host.id,'--terminal',term.id)
 await expect.poll(async()=>(await read()).output,{timeout:30000}).toContain(host.os==='windows'?'PS ':'$')
 const marker='LIVE_'+Date.now(),command=host.os==='windows'?`Write-Output ('LIVE_' + '${marker.slice(5)}'); [Environment]::OSVersion.Platform`:`printf '%s%s\\n' 'LIVE_' '${marker.slice(5)}'; uname -s`
 await cli('host','terminal-input',host.id,'--terminal',term.id,'--data',command,'--enter')
 await expect.poll(async()=>(await read()).output.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g,''),{timeout:30000}).toContain(marker)
 await expect.poll(async()=>(await read()).output,{timeout:10000}).toContain(host.os==='windows'?'Win32NT':'Linux')
 console.log(JSON.stringify({host:host.name,terminal:'real remote shell + hidden xterm passed',elapsedMs:Date.now()-start}))
 await cli('host','terminal-close',host.id,'--terminal',term.id)
 if(host.os==='windows'){
  const probe=await cli('host','exec',host.id,'--command',"Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in @(3389,5900,5901)} | Select-Object -ExpandProperty LocalPort -Unique",'--timeout','15')
  const ports=probe.stdout.trim().split(/\s+/).filter(s=>/^\d+$/.test(s));console.log(JSON.stringify({host:host.name,desktopPorts:ports}))
  if(ports.includes('3389')){
   await cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'rdp',address:'127.0.0.1',port:3389,viaHostId:host.id}}))
   const transport=await cli('host','desktop-open',host.id),started=Date.now()
   try{const negotiation=await new Promise((resolve,reject)=>{const socket=net.connect({host:transport.address,port:transport.port});socket.setTimeout(10000,()=>socket.destroy(Error('RDP negotiation timeout')));socket.on('error',reject);socket.on('connect',()=>socket.write(Buffer.from('030000130ee000000000000100080003000000','hex')));socket.on('data',data=>{socket.destroy();resolve(data)})});assert.equal(negotiation[0],3);assert.equal(negotiation[11],2);console.log(JSON.stringify({host:host.name,rdp:'X.224 negotiation passed over managed SSH tunnel',securityProtocol:negotiation.readUInt32LE(15),elapsedMs:Date.now()-started,authenticatedDesktop:false}))}finally{await cli('host','desktop-close',host.id,'--session',transport.id)}
  }
 }
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
