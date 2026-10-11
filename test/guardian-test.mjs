import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-guardian-')),previous=process.env.AGENTS_COMPANY_HOME,originalFetch=globalThis.fetch
process.env.AGENTS_COMPANY_HOME=temp
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let core
try{
  const sessions=['employee','manager','governor','secretary'].map(role=>({id:role,title:role,engine:'codex',kind:'worker',group:'A',cwd:temp,createdAt:1,initialization:{status:'ready'},managementRole:role}))
  fs.writeFileSync(path.join(temp,'sessions.json'),JSON.stringify({sessions,groups:['A'],teamRoots:{A:temp},rooms:{}}))
  const entry=path.join(temp,'test.cjs')
  await build({stdin:{contents:"export * from './src/main/guardian';export {handleRequest} from './src/main/server';export {authorize,operatorContext} from './src/main/authorization';export {closeChannels} from './src/main/channels'",resolveDir:root},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:entry,define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  core=createRequire(import.meta.url)(entry)
  for(const value of ['10.1.2.3','127.0.0.1','0.0.0.0','100.64.0.1','169.254.5.6','172.31.9.8','192.168.0.1','192.0.2.1','198.18.0.1','198.19.255.255','198.51.100.5','203.0.113.7','224.0.0.1','255.255.255.255','::','::1','fe80::1234%en0','fc00::1','ff02::1','2001:db8::1','2001:20::1','3fff::1','::ffff:192.168.0.1'])assert.equal(core.publicAddress(value),false,value)
  for(const value of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888','::ffff:8.8.8.8'])assert.equal(core.publicAddress(value),true,value)
  const row=(local,remote,state,pid=22,name='node')=>`tcp4 0 0 ${local} ${remote} ${state} 120 90 131072 131072 ${name}:${pid} 00100 0000`
  const connections=core.parseConnections([row('*.8080','*.*','LISTEN'),row('10.0.0.2.8080','8.8.8.8.5555','ESTABLISHED'),row('10.0.0.2.9000','1.1.1.1.443','ESTABLISHED'),row('127.0.0.1.5000','127.0.0.1.7890','ESTABLISHED'),row('10.0.0.2.5001','198.18.0.1.443','ESTABLISHED')].join('\n'))
  assert.equal(connections.length,5);assert.equal(connections[1].direction,'inbound');assert.equal(connections[2].direction,'unknown');assert.equal(connections[3].scope,'loopback');assert.equal(connections[4].scope,'private');assert.equal(connections[0].remoteAddress,null)
  const ipv6=core.parseConnections(row('2001:4860::1.8080','2606:4700::1111.443','ESTABLISHED',33,'Google Chrome').replace('tcp4','tcp6'))
  assert.equal(ipv6[0].remoteAddress,'2606:4700::1111');assert.equal(ipv6[0].process,'Google Chrome')
  const interfaces=core.parseInterfaces('Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\nen0 1500 <Link#15> aa:bb:cc 20 0 123456 30 0 654321 0\nen0 1500 10/8 10.1.2.3 20 - 123456 30 - 654321 -\nutun0 1500 <Link#17> 0 0 42 0 0 100 0')
  assert.equal(interfaces.length,2);assert.equal(interfaces[0].rxBytes,123456);assert.equal(interfaces[1].txBytes,100)
  const memory=core.parseMemory('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 20.\nPages wired down: 90.\nPages occupied by compressor: 60.\nFile-backed pages: 300.',1024**3,'total = 1024.00M used = 128.00M free = 896.00M','1')
  assert.equal(memory.freeBytes,100*16384);assert.equal(memory.swapUsedBytes,128*1024**2);assert.equal(memory.pressure,'normal');assert.equal(memory.compressedBytes,60*16384)
  let calls=[]
  globalThis.fetch=async url=>{calls.push(String(url));const ip=decodeURIComponent(new URL(url).pathname.slice(1))||'8.8.8.8';return new Response(JSON.stringify({success:true,ip,latitude:37.3,longitude:-121.8,country:'United States',country_code:'US',city:'San Jose'}),{status:200,headers:{'content-type':'application/json'}})}
  assert.deepEqual(core.guardianSettings(),{geoLookupEnabled:false,home:null})
  const caller=role=>({principal:{kind:'agent',employeeId:role},requestId:'guardian-test'})
  for(const role of ['employee','manager'])await assert.rejects(core.handleRequest({cmd:'guardian.snapshot'},caller(role)),/Forbidden/)
  for(const role of ['governor','secretary']){assert.doesNotThrow(()=>core.authorize('guardian.snapshot',{},undefined,caller(role)));await assert.rejects(core.handleRequest({cmd:'guardian.settings-set',args:{geoLookupEnabled:true}},caller(role)),/Only the user/)}
  const a=core.guardianSnapshot(),b=core.guardianSnapshot();assert.equal(a,b,'concurrent sampling is shared')
  const first=await a;assert.equal(first.geo.enabled,false);assert.equal(calls.length,0,'default snapshot sends no geolocation request');assert.ok(first.memory.totalBytes>0);assert.ok(first.disk.totalBytes>0);assert.equal(first.cpu.usagePercent,null)
  await new Promise(resolve=>setTimeout(resolve,2100));const second=await core.guardianSnapshot()
  assert.ok(second.cpu.usagePercent>=0&&second.cpu.usagePercent<=100);assert.ok(second.network.rxBytesPerSecond>=0);assert.equal(second.history.length,2)
  if(process.platform==='darwin'){assert.ok(second.network.interfaces.length>0);assert.ok(second.network.connections.length>0);assert.ok(second.processes.length>0);assert.equal(second.security.length,3);assert.deepEqual(second.issues,[])}
  const user=core.operatorContext(),home={latitude:39.9,longitude:116.4,label:'Local observation point'}
  const saved=await core.handleRequest({cmd:'guardian.settings-set',args:{home}},user);assert.equal(saved.home.source,'manual');assert.equal(calls.length,0,'manual location stays local')
  for(const bad of [{geoLookupEnabled:'yes'},{home:{...home,latitude:91}},{home:{...home,longitude:181}},{endpoint:'https://other.invalid'}])assert.throws(()=>core.setGuardianSettings(bad))
  await core.handleRequest({cmd:'guardian.settings-set',args:{geoLookupEnabled:true}},user)
  await core.guardianSnapshot();await new Promise(resolve=>setTimeout(resolve,30));const located=await core.guardianSnapshot()
  assert.ok(calls.length>0);assert.equal(located.geo.publicIp,'8.8.8.8');assert.ok(calls.every(url=>{const value=new URL(url),ip=decodeURIComponent(value.pathname.slice(1));return value.protocol==='https:'&&value.host==='ipwho.is'&&(!ip||core.publicAddress(ip))}))
  core.setGuardianSettings({geoLookupEnabled:false});const before=calls.length;const disabled=await core.guardianSnapshot();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls.length,before);assert.equal(disabled.geo.publicIp,null);assert.equal(disabled.geo.status,'disabled');assert.ok(disabled.network.connections.every(row=>row.location===null))
  const pending=[]
  globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>{pending.push({url:String(url),resolve,reject});options.signal.addEventListener('abort',()=>reject(Error('aborted')))})
  core.setGuardianSettings({geoLookupEnabled:true});await core.guardianSnapshot();const firstPending=pending.map(item=>item.url);assert.ok(firstPending.length>0)
  core.setGuardianSettings({geoLookupEnabled:false});await new Promise(resolve=>setTimeout(resolve,10));core.setGuardianSettings({geoLookupEnabled:true});await core.guardianSnapshot()
  assert.ok(pending.slice(firstPending.length).some(item=>item.url===firstPending[0]),'withdrawn request never poisons the lookup cache after re-enable')
  core.setGuardianSettings({geoLookupEnabled:false});await new Promise(resolve=>setTimeout(resolve,10))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp,'guardian.json'),'utf8')),{geoLookupEnabled:false,home:{...home,source:'manual'}})
  console.log(`PASS Guardian: live ${process.platform} sampling; CPU/network deltas; ${second.network.connections.length} actual TCP sockets; snapshot coalescing; IPv4/IPv6 private/fake-IP exclusions; listener direction evidence; role authorization; opt-in-only mocked HTTPS geolocation; local-only manual location; disable clears location and stops lookups.`)
}finally{globalThis.fetch=originalFetch;core?.setGuardianSettings({geoLookupEnabled:false});core?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temp,{recursive:true,force:true})}
