import {randomUUID} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,renameSync,statSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/protocol'
import type {GuardianSnapshot} from '../shared/guardian'
import type {GuardianEvent,GuardianEventChange,GuardianEventFeed,GuardianEventSubject,GuardianManualEvent,GuardianEventNote,GuardianEventMeasurement} from '../shared/guardian-events'

const FILE=path.join(APP_HOME,'guardian-events.json')
const RETENTION_DAYS=7
const RETENTION_MS=RETENTION_DAYS*86400000
const MAX_EVENTS=250
const MAX_ENTRIES=24
const DEDUPE_MS=30*60000
let events:GuardianEvent[]|undefined
let previous:GuardianSnapshot|undefined
let startedAt:number|null=null,lastSampledAt:number|null=null,sampleCount=0

function store():GuardianEvent[]{
 if(events)return events
 if(!existsSync(FILE))return events=[]
 if(statSync(FILE).size>2*1024*1024)throw Error('Guardian 事件文件超出限制，请先备份并检查。')
 const parsed=JSON.parse(readFileSync(FILE,'utf8')) as {version?:number;events?:GuardianEvent[]}
 if(parsed.version!==1||!Array.isArray(parsed.events))throw Error('Guardian 事件文件格式异常，请先备份并检查。')
 events=parsed.events.filter(event=>typeof event.id==='string'&&typeof event.title==='string'&&typeof event.lastSeenAt==='number'&&Array.isArray(event.entries)).map(event=>({...event,measurements:Array.isArray(event.measurements)?event.measurements.slice(-8):[]}))
 return events
}
function save(){
 const items=store(),cutoff=Date.now()-RETENTION_MS
 events=items.filter(item=>item.lastSeenAt>=cutoff).sort((a,b)=>b.lastSeenAt-a.lastSeenAt).slice(0,MAX_EVENTS)
 mkdirSync(APP_HOME,{recursive:true})
 const tmp=FILE+'.tmp'
 writeFileSync(tmp,JSON.stringify({version:1,events},null,2)+'\n',{mode:0o600})
 renameSync(tmp,FILE)
}
function assertText(value:unknown,label:string,max:number){
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+' must contain 1–'+max+' characters')
 return value.trim()
}
function assertSubject(value:unknown):GuardianEventSubject{
 if(value===undefined)return {}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Guardian event subject')
 const data=value as Record<string,unknown>,subject:GuardianEventSubject={}
 if(Object.keys(data).some(key=>!['pid','process','remoteAddress','remotePort','security'].includes(key)))throw Error('Unknown Guardian event subject property')
 if(data.process!==undefined)subject.process=assertText(data.process,'process',160)
 if(data.pid!==undefined){if(!Number.isSafeInteger(data.pid)||Number(data.pid)<1)throw Error('Invalid PID');subject.pid=Number(data.pid)}
 if(data.remoteAddress!==undefined)subject.remoteAddress=assertText(data.remoteAddress,'remoteAddress',120)
 if(data.remotePort!==undefined){if(!Number.isInteger(data.remotePort)||Number(data.remotePort)<0||Number(data.remotePort)>65535)throw Error('Invalid port');subject.remotePort=Number(data.remotePort)}
 if(data.security!==undefined)subject.security=assertText(data.security,'security',50)
 return subject
}
function record(input:Pick<GuardianEvent,'fingerprint'|'kind'|'importance'|'title'|'summary'|'subject'>,at:number){
 const items=store(),existing=items.find(item=>item.fingerprint===input.fingerprint&&at-item.lastSeenAt<DEDUPE_MS)
 if(existing){
  // A previously reviewed change stays reviewed; an identical later observation is not a new verdict.
  if(existing.status!=='open')return false
  existing.lastSeenAt=at;existing.count++
  if(existing.entries.at(-1)?.text!==input.summary)existing.entries.push({at,by:'observation',text:input.summary})
  existing.entries=existing.entries.slice(-MAX_ENTRIES)
 }else{
  items.unshift({id:randomUUID(),...input,status:'open',firstSeenAt:at,lastSeenAt:at,count:1,entries:[{at,by:input.kind==='manual'?'user':'observation',text:input.summary}],measurements:[]})
 }
 save()
 return true
}
export function guardianEventFeed():GuardianEventFeed{
 return {events:structuredClone(store().filter(event=>event.lastSeenAt>=Date.now()-RETENTION_MS).sort((a,b)=>b.lastSeenAt-a.lastSeenAt).slice(0,MAX_EVENTS)),retentionDays:RETENTION_DAYS,coverage:{mode:'on-demand',startedAt,lastSampledAt,sampleCount}}
}
export function guardianEventCreate(input:GuardianManualEvent){
 if(!input||typeof input!=='object')throw Error('Invalid event')
 const title=assertText(input.title,'title',140),summary=assertText(input.summary,'summary',900),subject=assertSubject(input.subject)
 record({fingerprint:'manual:'+randomUUID(),kind:'manual',importance:'notice',title,summary,subject},Date.now())
 return guardianEventFeed()
}
export function guardianEventChange(input:GuardianEventChange){
 if(!input||typeof input!=='object'||!['open','reviewed','dismissed'].includes(input.status))throw Error('Invalid event status')
 const id=assertText(input.id,'id',100),note=input.note===undefined?'':assertText(input.note,'note',500)
 const item=store().find(event=>event.id===id)
 if(!item)throw Error('Guardian event not found')
 if(item.status!==input.status||note){item.status=input.status;item.entries.push({at:Date.now(),by:'user',text:input.status==='reviewed'?'用户标记为已核对'+(note?'：'+note:''):input.status==='dismissed'?'用户已忽略'+(note?'：'+note:''):'用户重新打开调查'+(note?'：'+note:'')});item.entries=item.entries.slice(-MAX_ENTRIES);save()}
 return guardianEventFeed()
}
export function guardianEventNote(input:GuardianEventNote){
 if(!input||typeof input!=='object')throw Error('Invalid note')
 const id=assertText(input.id,'id',100),note=assertText(input.note,'note',500)
 const item=store().find(event=>event.id===id)
 if(!item)throw Error('Guardian event not found')
 item.entries.push({at:Date.now(),by:'user',text:note})
 item.entries=item.entries.slice(-MAX_ENTRIES);save()
 return guardianEventFeed()
}
export function guardianEventSample(input:{id:string},snapshot:GuardianSnapshot){
 if(!input||typeof input!=='object')throw Error('Invalid observation request')
 const id=assertText(input.id,'id',100),item=store().find(event=>event.id===id)
 if(!item)throw Error('Guardian event not found')
 if(!snapshot||!Number.isFinite(snapshot.sampledAt))throw Error('Guardian snapshot is unavailable')
 const prior=item.measurements?.at(-1)
 if(prior&&prior.at>=snapshot.sampledAt)throw Error('尚无更新的 Guardian 快照，请稍后重新采样。')
 const psReady=!snapshot.issues.some(issue=>issue.startsWith('ps:'))
 const netReady=!snapshot.issues.some(issue=>issue.startsWith('netstat:'))
 const subject=item.subject
 const knownProcess=subject.pid!==undefined&&!!subject.process
 const process=knownProcess&&psReady?snapshot.processes.find(row=>row.pid===subject.pid&&row.name===subject.process):undefined
 const knownPeer=!!subject.remoteAddress&&(!!subject.process||subject.pid!==undefined)
 const peer=knownPeer&&netReady?snapshot.network.connections.some(row=>row.remoteAddress===subject.remoteAddress&&(subject.pid===undefined||row.pid===subject.pid)&&(!subject.process||row.process===subject.process)):null
 const check=subject.security?snapshot.security.find(row=>row.id===subject.security):undefined
 const measurement:GuardianEventMeasurement={
  at:snapshot.sampledAt,hostCpuPercent:snapshot.cpu.usagePercent,memoryPressure:snapshot.memory.pressure,
  processObserved:knownProcess&&psReady?!!process:null,
  processCpuPercent:process?.cpuPercent??null,
  processMemoryBytes:process?.memoryBytes??null,
  tcpPeerObserved:peer,
  securityStatus:check?.status??null,
  issues:snapshot.issues.map(issue=>issue.split(':')[0]).slice(0,5)
 }
 item.measurements=[...(item.measurements??[]),measurement].slice(-8)
 item.entries.push({at:Date.now(),by:'user',text:'用户触发复核采样：整机 CPU '+(measurement.hostCpuPercent==null?'不可读取':measurement.hostCpuPercent.toFixed(1)+'%')+'；内存压力 '+measurement.memoryPressure+'；关联 PID '+(measurement.processObserved===null?'未检查':measurement.processObserved?'仍可见':'本次未见')+'。结果需要结合实际任务判断。'})
 item.entries=item.entries.slice(-MAX_ENTRIES)
 save()
 return guardianEventFeed()
}

function sampled(snapshot:GuardianSnapshot,issue:string){return !snapshot.issues.some(text=>text.startsWith(issue+':'))}
/** Only compare consecutive successful samples in this process; gaps never become invented history. */
export function observeGuardianSnapshot(next:GuardianSnapshot){
 const prior=previous
 previous=next
 startedAt??=next.sampledAt;lastSampledAt=next.sampledAt;sampleCount++
 if(!prior||next.sampledAt-prior.sampledAt>30000||next.sampledAt<=prior.sampledAt)return
 if(prior.cpu.usagePercent!=null&&next.cpu.usagePercent!=null&&prior.cpu.usagePercent<55&&next.cpu.usagePercent>=85&&sampled(next,'ps')){
  const top=[...next.processes].sort((a,b)=>b.cpuPercent-a.cpuPercent)[0]
  const process=top?.name??'未知'
  record({fingerprint:'cpu-rise:'+process,kind:'cpu-rise',importance:'notice',title:'处理器负载明显升高',summary:'相邻采样中整机 CPU 从 '+prior.cpu.usagePercent.toFixed(0)+'% 升至 '+next.cpu.usagePercent.toFixed(0)+'%。当前 CPU 占用最高的可见进程为 '+process+'；这只能说明同时出现，尚不能判定原因。',subject:top?{pid:top.pid,process:top.name}:{}} ,next.sampledAt)
 }
 if(prior.memory.pressure!=='unknown'&&next.memory.pressure!=='unknown'&&prior.memory.pressure!==next.memory.pressure&&(next.memory.pressure==='warn'||next.memory.pressure==='critical')){
  record({fingerprint:'memory-pressure',kind:'memory-pressure',importance:'attention',title:'内存压力升高',summary:'系统报告内存压力从 '+prior.memory.pressure+' 变为 '+next.memory.pressure+'，建议结合交换区与具体工作负载判断。',subject:{}},next.sampledAt)
 }
 for(const check of next.security){
  const before=prior.security.find(item=>item.id===check.id)
  if(before&&before.status!=='unknown'&&check.status!=='unknown'&&before.status!==check.status){
   record({fingerprint:'security-change:'+check.id,kind:'security-change',importance:'attention',title:check.label+' 配置发生变化',summary:check.label+' 从 '+before.status+' 变为 '+check.status+'。这是系统配置状态变化，不能据此判断是否遭遇攻击。',subject:{security:check.id}},next.sampledAt)
  }
 }
 if(!sampled(prior,'netstat')||!sampled(next,'netstat')||!sampled(prior,'ps')||!sampled(next,'ps'))return
 const beforePeers=new Set(prior.network.connections.filter(c=>c.scope==='public'&&c.remoteAddress).map(c=>c.process+'\u0000'+c.remoteAddress))
 const beforeProcesses=new Set(prior.processes.map(p=>p.name))
 const byProcess=new Map<string,typeof next.network.connections>()
 for(const connection of next.network.connections){
  if(connection.scope!=='public'||!connection.remoteAddress||!beforeProcesses.has(connection.process)||beforePeers.has(connection.process+'\u0000'+connection.remoteAddress))continue
  const rows=byProcess.get(connection.process)??[]
  if(!rows.some(row=>row.remoteAddress===connection.remoteAddress))rows.push(connection)
  byProcess.set(connection.process,rows)
 }
 for(const [process,rows] of [...byProcess].sort((a,b)=>b[1].length-a[1].length).slice(0,3)){
  const one=rows[0],examples=rows.slice(0,3).map(row=>row.remoteAddress+':'+row.remotePort).join('、')
  record({fingerprint:'network-change:'+process,kind:'network-change',importance:'notice',title:process+' 出现新的公网 TCP 对端',summary:'相较上一份 TCP 快照，多出 '+rows.length+' 个该进程的公网对端。示例：'+examples+'。这是采样窗口间的变化，不代表软件首次联网、实际传输内容或安全风险。',subject:{process,pid:one.pid??undefined,remoteAddress:one.remoteAddress??undefined,remotePort:one.remotePort??undefined}},next.sampledAt)
 }
}
