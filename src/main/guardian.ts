import os from 'node:os'
import {observeGuardianSnapshot,setGuardianEventBackgroundSampling} from './guardian-events'
import path from 'node:path'
import {isIP} from 'node:net'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import {statfs} from 'node:fs/promises'
import {APP_HOME} from '../shared/protocol'
import type {GuardianConnection,GuardianInterface,GuardianLocation,GuardianSecurityCheck,GuardianSettings,GuardianSnapshot} from '../shared/guardian'

const run=promisify(execFile),settingsFile=path.join(APP_HOME,'guardian.json')
const command=async(file:string,args:string[]=[]) => (await run(file,args,{timeout:5000,maxBuffer:8*1024*1024,env:{...process.env,LC_ALL:'C'}})).stdout
let settings:GuardianSettings|undefined,cached:GuardianSnapshot|undefined,inflight:Promise<GuardianSnapshot>|undefined
const BACKGROUND_INTERVAL_MS=60_000
let backgroundStarted=false,backgroundTimer:ReturnType<typeof setInterval>|null=null
let previousCpu:os.CpuInfo[]|undefined,previousNetwork:{at:number;interfaces:GuardianInterface[]}|undefined
let securityCache:GuardianSecurityCheck[]|undefined
const history:GuardianSnapshot['history']=[]
const locations=new Map<string,{at:number;location:GuardianLocation|null}>(),geoPending=new Map<string,AbortController>()
const geoRequests:number[]=[]
let geoError:string|null=null,publicIp:string|null=null,publicLocation:GuardianLocation|null=null,selfLookupAt=0

export function guardianSettings():GuardianSettings{
  if(!settings){
    const saved=existsSync(settingsFile)?JSON.parse(readFileSync(settingsFile,'utf8')) as Partial<GuardianSettings>:{}
    settings={geoLookupEnabled:saved.geoLookupEnabled===true,backgroundSamplingEnabled:saved.backgroundSamplingEnabled===true,home:saved.home??null}
  }
  return structuredClone(settings)
}
export function setGuardianSettings(patch:Record<string,unknown>):GuardianSettings{
  if(Object.keys(patch).some(key=>!['geoLookupEnabled','backgroundSamplingEnabled','home'].includes(key)))throw Error('Unknown Guardian setting')
  const next=guardianSettings()
  if(patch.geoLookupEnabled!==undefined){if(typeof patch.geoLookupEnabled!=='boolean')throw Error('geoLookupEnabled must be boolean');next.geoLookupEnabled=patch.geoLookupEnabled}
  if(patch.backgroundSamplingEnabled!==undefined){if(typeof patch.backgroundSamplingEnabled!=='boolean')throw Error('backgroundSamplingEnabled must be boolean');next.backgroundSamplingEnabled=patch.backgroundSamplingEnabled}
  if(patch.home!==undefined){
    if(patch.home===null)next.home=null
    else{
      const home=patch.home as GuardianLocation
      if(!Number.isFinite(home.latitude)||Math.abs(home.latitude)>90||!Number.isFinite(home.longitude)||Math.abs(home.longitude)>180||typeof home.label!=='string'||!home.label.trim()||home.label.length>120)throw Error('Provide a location label, latitude -90..90 and longitude -180..180')
      next.home={latitude:home.latitude,longitude:home.longitude,label:home.label.trim(),source:'manual'}
    }
  }
  mkdirSync(APP_HOME,{recursive:true});writeFileSync(settingsFile+'.tmp',JSON.stringify(next,null,2)+'\n',{mode:0o600});renameSync(settingsFile+'.tmp',settingsFile)
  settings=next;cached=undefined
  if(!next.geoLookupEnabled){for(const controller of geoPending.values())controller.abort();geoPending.clear();locations.clear();publicIp=null;publicLocation=null;selfLookupAt=0;geoError=null}
  synchronizeGuardianBackgroundSampling()
  return guardianSettings()
}

/** User opt-in, Core-host only. An app quit or sleep leaves a visible observation gap. */
function synchronizeGuardianBackgroundSampling(){
 if(backgroundTimer){clearInterval(backgroundTimer);backgroundTimer=null}
 setGuardianEventBackgroundSampling(false)
 if(!backgroundStarted)return
 let enabled=false
 try{enabled=guardianSettings().backgroundSamplingEnabled}catch(error){console.error('[Guardian background settings]',(error as Error).message);return}
 if(!enabled)return
 setGuardianEventBackgroundSampling(true)
 const sample=()=>{void guardianSnapshot().catch(error=>console.error('[Guardian background sample]',(error as Error).message))}
 sample()
 backgroundTimer=setInterval(sample,BACKGROUND_INTERVAL_MS)
 backgroundTimer.unref?.()
}
export function startGuardianBackgroundSampling(){
 if(backgroundStarted)return stopGuardianBackgroundSampling
 backgroundStarted=true
 synchronizeGuardianBackgroundSampling()
 return stopGuardianBackgroundSampling
}
export function stopGuardianBackgroundSampling(){
 backgroundStarted=false
 synchronizeGuardianBackgroundSampling()
}

/** Reject private, local, special-use and proxy fake-IP ranges before any external lookup. */
export function publicAddress(address:string):boolean{
  let value=address.split('%')[0].toLowerCase()
  if(value.startsWith('::ffff:'))value=value.slice(7)
  if(isIP(value)===4){
    const [a,b,c]=value.split('.').map(Number)
    return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&(c===0||c===2)||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)
  }
  if(isIP(value)!==6||!/^\s*[23]/.test(value))return false
  const [first,second]=value.split(':').map(part=>parseInt(part||'0',16))
  return !(first===0x2001&&(second<0x200||second===0xdb8)||first===0x2002||first===0x3fff)
}
const loopback=(address:string)=>address==='::1'||address.startsWith('127.')||address.startsWith('::ffff:127.')
function endpoint(value:string){const dot=value.lastIndexOf('.'),address=value.slice(0,dot);return {address:address==='*'?'*':address,port:Number(value.slice(dot+1))||0}}
export function parseConnections(output:string):GuardianConnection[]{
  const rows:GuardianConnection[]=[],identityCount=new Map<string,number>()
  for(const line of output.split('\n')){
    const match=line.trim().match(/^tcp[46]\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s+([A-Z_]+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+(.+?):(\d+)\s/)
    if(!match)continue
    const local=endpoint(match[1]),remote=endpoint(match[2]),state=match[3],pid=Number(match[7])||null,remoteAddress=remote.address==='*'?null:remote.address
    const scope=state==='LISTEN'?'listening':!remoteAddress?'private':loopback(remoteAddress)?'loopback':publicAddress(remoteAddress)?'public':'private'
    // Multiple sockets can share the same endpoint tuple in netstat. React keys and
    // inspector selection must stay unique even for duplicate listening rows.
    const key=`${line.trim().split(/\s+/)[0]}:${pid}:${match[1]}:${match[2]}:${state}`,occurrence=identityCount.get(key)??0
    identityCount.set(key,occurrence+1)
    rows.push({id:`${key}:${occurrence}`,pid,process:match[6].trim(),localAddress:local.address,localPort:local.port,remoteAddress,remotePort:remoteAddress?remote.port:null,state,scope,direction:'unknown',location:null,rxBytes:Number(match[4]),txBytes:Number(match[5])})
  }
  const listeners=rows.filter(row=>row.state==='LISTEN')
  for(const row of rows)if(row.state==='ESTABLISHED'&&row.pid&&listeners.some(listener=>listener.pid===row.pid&&listener.localPort===row.localPort&&(listener.localAddress==='*'||listener.localAddress===row.localAddress)))row.direction='inbound'
  return rows
}
export function parseInterfaces(output:string):GuardianInterface[]{
  const addresses=os.networkInterfaces(),rows:GuardianInterface[]=[]
  for(const line of output.split('\n')){
    const fields=line.trim().split(/\s+/)
    if(!fields[2]?.startsWith('<Link#'))continue
    const name=fields[0].replace(/\*$/,''),counters=fields.slice(fields.length-7)
    if(counters.length!==7||!counters.every(value=>/^\d+$/.test(value)))continue
    rows.push({name,addresses:(addresses[name]??[]).map(item=>item.address),rxBytes:Number(counters[2]),txBytes:Number(counters[5]),rxBytesPerSecond:null,txBytesPerSecond:null})
  }
  return rows
}
export function parseMemory(output:string,totalBytes:number,swap:string,pressure:string):GuardianSnapshot['memory']{
  const pageSize=Number(output.match(/page size of (\d+) bytes/)?.[1])
  if(!pageSize)throw Error('vm_stat did not report a page size')
  const bytes=(key:string)=>Number(output.match(new RegExp('^'+key+':\\s+(\\d+)','m'))?.[1]??0)*pageSize
  const freeBytes=bytes('Pages free'),inactiveBytes=bytes('Pages inactive'),speculativeBytes=bytes('Pages speculative')
  const swapBytes=(key:string)=>{const m=swap.match(new RegExp(key+' = ([\\d.]+)([MG])'));return m?Number(m[1])*1024**(m[2]==='G'?3:2):0}
  return {totalBytes,usedBytes:Math.max(0,totalBytes-freeBytes-speculativeBytes),availableBytes:Math.min(totalBytes,freeBytes+inactiveBytes+speculativeBytes),freeBytes,wiredBytes:bytes('Pages wired down'),compressedBytes:bytes('Pages occupied by compressor'),activeBytes:bytes('Pages active'),inactiveBytes,cachedBytes:bytes('File-backed pages'),swapUsedBytes:swapBytes('used'),swapTotalBytes:swapBytes('total'),pressure:pressure.trim()==='1'?'normal':pressure.trim()==='2'?'warn':pressure.trim()==='4'?'critical':'unknown'}
}
export function parseProcesses(output:string):GuardianSnapshot['processes']{
  return output.split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);return m?[{pid:Number(m[1]),cpuPercent:Number(m[2]),memoryBytes:Number(m[3])*1024,name:path.basename(m[4])}]:[]}).sort((a,b)=>b.cpuPercent-a.cpuPercent)
}

async function security():Promise<GuardianSecurityCheck[]>{
  if(securityCache&&Date.now()-securityCache[0].checkedAt<300000)return securityCache
  const checks=[['firewall','Application Firewall','/usr/libexec/ApplicationFirewall/socketfilterfw',['--getglobalstate'],/enabled|State = [12]/i,/disabled|State = 0/i],['filevault','FileVault','/usr/bin/fdesetup',['status'],/FileVault is On/i,/FileVault is Off/i],['sip','System Integrity Protection','/usr/bin/csrutil',['status'],/status: enabled/i,/status: disabled/i]] as const
  securityCache=await Promise.all(checks.map(async([id,label,file,args,on,off])=>{
    try{const detail=(await command(file,[...args])).trim();return {id,label,status:on.test(detail)?'enabled' as const:off.test(detail)?'disabled' as const:'unknown' as const,detail,checkedAt:Date.now()}}
    catch(error){return {id,label,status:'unknown' as const,detail:(error as Error).message.split('\n')[0],checkedAt:Date.now()}}
  }))
  return securityCache
}
function lookupLocation(ip:string){
  if(!guardianSettings().geoLookupEnabled||ip&&!publicAddress(ip)||geoPending.has(ip))return
  while(geoRequests.length&&Date.now()-geoRequests[0]>=60000)geoRequests.shift()
  if(geoRequests.length>=30)return
  geoRequests.push(Date.now())
  const controller=new AbortController();geoPending.set(ip,controller)
  const timer=setTimeout(()=>controller.abort(Error('Geolocation request timed out')),6000)
  void (async()=>{
    try{
      const response=await fetch('https://ipwho.is/'+encodeURIComponent(ip)+'?fields=success,message,ip,country,country_code,city,latitude,longitude',{signal:controller.signal,redirect:'error'})
      if(!response.ok)throw Error('Geolocation service returned HTTP '+response.status)
      const data=await response.json() as {success:boolean;message?:string;ip:string;latitude:number;longitude:number;country:string;country_code:string;city:string}
      if(!data.success||!publicAddress(data.ip)||!Number.isFinite(data.latitude)||!Number.isFinite(data.longitude)||Math.abs(data.latitude)>90||Math.abs(data.longitude)>180)throw Error(data.message||'Geolocation service returned no public location')
      if(geoPending.get(ip)!==controller||!guardianSettings().geoLookupEnabled||controller.signal.aborted)return
      const location:GuardianLocation={latitude:data.latitude,longitude:data.longitude,label:[data.city,data.country].filter(Boolean).join(', ')||data.ip,country:data.country,countryCode:data.country_code,city:data.city,source:'ipwho.is'}
      if(ip)locations.set(ip,{at:Date.now(),location})
      else{publicIp=data.ip;publicLocation=location;selfLookupAt=Date.now()}
      geoError=null
    }catch(error){
      if(geoPending.get(ip)!==controller||!guardianSettings().geoLookupEnabled)return
      geoError=controller.signal.aborted?'Geolocation request timed out':(error as Error).message
      if(ip)locations.set(ip,{at:Date.now(),location:null});else selfLookupAt=Date.now()
    }
    finally{clearTimeout(timer);if(geoPending.get(ip)===controller)geoPending.delete(ip)}
  })()
}
function geolocation(connections:GuardianConnection[]):GuardianSnapshot['geo']{
  const enabled=guardianSettings().geoLookupEnabled
  if(enabled){
    if(Date.now()-selfLookupAt>3600000)lookupLocation('')
    for(const [ip,value] of locations)if(Date.now()-value.at>(value.location?86400000:300000))locations.delete(ip)
    for(const row of connections){
      if(row.scope!=='public'||!row.remoteAddress)continue
      const value=locations.get(row.remoteAddress)
      row.location=value?.location??null
      if(!value&&geoPending.size<3&&locations.size<512)lookupLocation(row.remoteAddress)
    }
  }
  return {provider:'ipwho.is',enabled,status:!enabled?'disabled':geoPending.size?'resolving':geoError?'error':locations.size||publicLocation?'ready':'idle',pending:geoPending.size,error:enabled?geoError:null,publicIp:enabled?publicIp:null,publicLocation:enabled?publicLocation:null}
}

async function collect():Promise<GuardianSnapshot>{
  const issues:string[]=[],sampledAt=Date.now(),cpu=os.cpus(),totalBytes=os.totalmem()
  const cores=previousCpu?cpu.map((item,index)=>{const before=previousCpu![index]?.times;if(!before)return 0;const total=Object.values(item.times).reduce((a,b)=>a+b,0)-Object.values(before).reduce((a,b)=>a+b,0);return total>0?Math.max(0,Math.min(100,100*(1-(item.times.idle-before.idle)/total))):0}):[]
  previousCpu=cpu
  const usagePercent=cores.length?cores.reduce((a,b)=>a+b,0)/cores.length:null
  const read=async(file:string,args:string[]=[])=>{try{return await command(file,args)}catch(error){issues.push(path.basename(file)+': '+(error as Error).message.split('\n')[0]);return ''}}
  const supported=process.platform==='darwin'
  if(!supported)issues.push('Detailed memory, interfaces, TCP and security checks require a macOS Core host.')
  const [vm,swap,pressure,tcp,net,processText,checks]=supported?await Promise.all([read('/usr/bin/vm_stat'),read('/usr/sbin/sysctl',['-n','vm.swapusage']),read('/usr/sbin/sysctl',['-n','kern.memorystatus_vm_pressure_level']),read('/usr/sbin/netstat',['-anv','-p','tcp']),read('/usr/sbin/netstat',['-ibn']),read('/bin/ps',['-axo','pid=,pcpu=,rss=,comm=']),security()]):['','','','','','',[]] as const
  let memory:GuardianSnapshot['memory']={totalBytes,freeBytes:os.freemem(),usedBytes:totalBytes-os.freemem(),availableBytes:os.freemem(),wiredBytes:0,compressedBytes:0,activeBytes:0,inactiveBytes:0,cachedBytes:0,swapUsedBytes:0,swapTotalBytes:0,pressure:'unknown'}
  if(vm)try{memory=parseMemory(vm,totalBytes,swap,pressure)}catch(error){issues.push((error as Error).message)}
  let disk:GuardianSnapshot['disk']=null
  try{const target=supported?'/System/Volumes/Data':os.homedir(),value=await statfs(target),total=value.blocks*value.bsize,available=value.bavail*value.bsize;disk={path:target,totalBytes:total,availableBytes:available,usedBytes:total-available,usedPercent:100*(total-available)/total}}
  catch(error){issues.push('Disk: '+(error as Error).message)}
  const allProcesses=parseProcesses(processText),processNames=new Map(allProcesses.map(item=>[item.pid,item.name]))
  const connections=parseConnections(tcp).map(row=>({...row,process:row.pid?processNames.get(row.pid)??row.process:row.process})),interfaces=parseInterfaces(net)
  const intervalMs=previousNetwork?sampledAt-previousNetwork.at:null
  if(previousNetwork&&intervalMs&&intervalMs>0){
    const prior=new Map(previousNetwork.interfaces.map(row=>[row.name,row]))
    for(const item of interfaces){const before=prior.get(item.name);if(before){item.rxBytesPerSecond=Math.max(0,item.rxBytes-before.rxBytes)*1000/intervalMs;item.txBytesPerSecond=Math.max(0,item.txBytes-before.txBytes)*1000/intervalMs}}
  }
  previousNetwork={at:sampledAt,interfaces}
  // Physical interfaces only: summing utun/bridge and physical counters double-counts traffic.
  const physical=interfaces.filter(item=>/^en\d+$/.test(item.name)),rxBytesPerSecond=intervalMs?physical.reduce((sum,item)=>sum+(item.rxBytesPerSecond??0),0):null,txBytesPerSecond=intervalMs?physical.reduce((sum,item)=>sum+(item.txBytesPerSecond??0),0):null
  history.push({at:sampledAt,cpuPercent:usagePercent,cores,memoryPercent:memory.usedBytes/totalBytes*100,memory,disk,rxBytesPerSecond,txBytesPerSecond});while(history.length>300||history.length&&sampledAt-history[0].at>15*60*1000)history.shift()
  const snapshot:GuardianSnapshot={sampledAt,intervalMs,host:{hostname:os.hostname(),platform:process.platform,arch:process.arch,cpuModel:cpu[0]?.model??'Unknown',cpuCount:cpu.length,uptimeSeconds:os.uptime()},cpu:{usagePercent,cores},memory,disk,network:{interfaces,rxBytesPerSecond,txBytesPerSecond,connections,listening:connections.filter(row=>row.state==='LISTEN').length,publicConnections:connections.filter(row=>row.scope==='public').length},processes:allProcesses,security:[...checks],settings:guardianSettings(),geo:geolocation(connections),issues,history:[...history]}
  try{observeGuardianSnapshot(snapshot)}catch(error){issues.push('Guardian event journal: '+(error as Error).message)}
  return snapshot
}
export function guardianSnapshot():Promise<GuardianSnapshot>{
  if(cached&&Date.now()-cached.sampledAt<2000){cached.settings=guardianSettings();cached.geo=geolocation(cached.network.connections);return Promise.resolve(cached)}
  return inflight??=(collect().then(value=>cached=value).finally(()=>{inflight=undefined}))
}
