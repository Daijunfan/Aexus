import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const root=path.resolve(import.meta.dirname,'..')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-guardian-events-'))
const original=process.env.AGENTS_COMPANY_HOME
process.env.AGENTS_COMPANY_HOME=temp
let events
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 const entry=path.join(temp,'events.cjs')
 await build({stdin:{contents:"export * from './src/main/guardian-events';export * from './src/shared/guardian-report'",resolveDir:root},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:entry,define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 events=createRequire(import.meta.url)(entry)
 const t=Date.now()-10000
 const processRows=[{pid:112,name:'Safari',cpuPercent:15,memoryBytes:90000000}]
 const connection=(ip)=>({scope:'public',process:'Safari',pid:112,remoteAddress:ip,remotePort:443,localAddress:'10.0.0.10',localPort:50000,state:'ESTABLISHED',direction:'unknown'})
 const first={sampledAt:t,cpu:{usagePercent:25},memory:{pressure:'normal'},processes:processRows,security:[{id:'firewall',label:'Application Firewall',status:'disabled'}],network:{connections:[connection('8.8.8.8')]},issues:[]}
 events.observeGuardianSnapshot(first)
 assert.equal(events.guardianEventFeed().events.length,0,'first sample establishes baseline')
 assert.equal(events.guardianEventFeed().coverage.sampleCount,1)
 const second={...first,sampledAt:t+3000,cpu:{usagePercent:91},memory:{pressure:'warn'},processes:[{...processRows[0],cpuPercent:133}],security:[{...first.security[0],status:'enabled'}],network:{connections:[...first.network.connections,connection('1.1.1.1')]}}
 events.observeGuardianSnapshot(second)
 const feed=events.guardianEventFeed()
 assert.deepEqual(new Set(feed.events.map(e=>e.kind)),new Set(['cpu-rise','memory-pressure','security-change','network-change']))
 assert.ok(feed.events.every(e=>e.status==='open'&&e.entries.length===1&&e.count===1))
 const network=feed.events.find(e=>e.kind==='network-change')
 assert.equal(network.subject.process,'Safari')
 assert.equal(network.subject.remoteAddress,'1.1.1.1')
 assert.match(network.summary,/相较上一份 TCP 快照/)
 assert.match(network.summary,/不代表软件首次联网/)
 const beforeCheck=events.guardianEventSample({id:network.id},second)
 const baseline=beforeCheck.events.find(item=>item.id===network.id).measurements
 assert.equal(baseline.length,1)
 assert.equal(baseline[0].hostCpuPercent,91)
 assert.equal(baseline[0].processObserved,true)
 assert.equal(baseline[0].tcpPeerObserved,true)
 assert.throws(()=>events.guardianEventSample({id:network.id},second),/尚无更新/)
 const afterCheck=events.guardianEventSample({id:network.id},{...second,sampledAt:t+9000,network:{connections:[connection('8.8.8.8')]}})
 const measurements=afterCheck.events.find(item=>item.id===network.id).measurements
 assert.equal(measurements.length,2)
 assert.equal(measurements.at(-1).tcpPeerObserved,false,'absent TCP endpoint is only a point-in-time observation')
 assert.equal(feed.coverage.sampleCount,2)
 events.observeGuardianSnapshot({...second,sampledAt:t+6000,issues:['netstat: inaccessible'],network:{connections:[...second.network.connections,connection('9.9.9.9')]}})
 assert.equal(events.guardianEventFeed().events.length,4,'failed TCP sample must not create peer events')
 let reviewed=events.guardianEventChange({id:network.id,status:'reviewed',note:'已确认是测试行为'})
 assert.equal(reviewed.events.find(e=>e.id===network.id).status,'reviewed')
 assert.ok(reviewed.events.find(e=>e.id===network.id).entries.some(e=>e.by==='user'&&e.text.includes('已确认')))
 reviewed=events.guardianEventNote({id:network.id,note:'复核记录'})
 assert.ok(reviewed.events.find(e=>e.id===network.id).entries.some(e=>e.text==='复核记录'))
 events.guardianEventChange({id:network.id,status:'open'})
 assert.equal(events.guardianEventFeed().events.find(e=>e.id===network.id).status,'open')
 const before=events.guardianEventFeed().events.length
 const after=events.guardianEventCreate({title:'人工检查',summary:'现有观测线索',subject:{pid:112,process:'Safari'}})
 assert.equal(after.events.length,before+1)
 assert.equal(after.events[0].kind,'manual')
 for(const input of [{title:'',summary:'missing'},{title:'ok',summary:'x',subject:{process:'x',unexpected:'y'}},{title:'ok',summary:'y',subject:{pid:-2}}]){
  assert.throws(()=>events.guardianEventCreate(input))
 }
 assert.throws(()=>events.guardianEventChange({id:'bogus',status:'reviewed'}),/not found/)
 assert.throws(()=>events.guardianEventChange({id:network.id,status:'secret'}),/Invalid/)
 const file=path.join(temp,'guardian-events.json')
 assert.ok(fs.existsSync(file))
 assert.equal(fs.statSync(file).mode&0o777,0o600,'Guardian locally stored IP observations must be private')
 const stored=JSON.parse(fs.readFileSync(file,'utf8'))
 assert.equal(stored.version,1)
 assert.equal(stored.events.length,before+1)
 assert.ok(stored.events.every(event=>Array.isArray(event.entries)))
 const report=events.summarizeGuardianEvents(events.guardianEventFeed())
 assert.equal(report.total,stored.events.length)
 assert.equal(report.days.reduce((sum,item)=>sum+item.count,0),report.total,'daily activity must equal report summary count')
 const share=events.guardianShareSummary(report)
 assert.doesNotMatch(share,/1\\.1\\.1\\.1|Safari|现有观测线索|实际进程/, 'share must not disclose sensitive event content')
 assert.match(share,/仅统计已保留的 Guardian 事件/)
 console.log('PASS Guardian events: baseline, four evidence-limited change types, ignored missing TCP sample, persisted manual investigation, review timeline, bounded inputs and 0600 local file.')
}finally{
 if(original===undefined)delete process.env.AGENTS_COMPANY_HOME
 else process.env.AGENTS_COMPANY_HOME=original
 fs.rmSync(temp,{recursive:true,force:true})
}
