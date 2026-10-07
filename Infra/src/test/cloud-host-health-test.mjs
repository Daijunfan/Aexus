import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'

const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-health-'))),trace=path.join(temp,'ssh.jsonl')
fs.writeFileSync(path.join(temp,'ssh'),`#!/usr/bin/env python3
import sys,os,time,json
from pathlib import Path
host=sys.argv[-2]
def record(event):
 with open(os.environ['AC_HEALTH_TRACE'],'a') as f:f.write(json.dumps({'host':host,'event':event})+'\\n')
record('start');time.sleep(.4);record('end')
if host=='offline':sys.stderr.write('fixture SSH unavailable');sys.exit(255)
print('__AGENTS_COMPANY_ALIVE__')
`,{mode:0o755})
const f=await fixtureCore({PATH:temp+path.delimiter+process.env.PATH,AC_HEALTH_TRACE:trace})
try{
 const hosts=[]
 for(let i=0;i<9;i++)hosts.push(await f.cli('host','create','--data',JSON.stringify({name:'Health '+i,host:i===8?'offline':'probe-'+i,os:'linux',defaultDirectory:'/tmp'})))
 const calls=[hosts[0],hosts[0],hosts[0],...hosts,hosts[0]]
 const results=await Promise.all(calls.map(host=>f.request(null,'host.check',{id:host.id})))
 assert.ok(results.every(r=>r.ok));assert.equal(results.filter(r=>!r.data.connected).length,1)
 const events=fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse)
 assert.equal(events.filter(e=>e.event==='start').length,9,'concurrent requests for one host share one SSH probe')
 let active=0,maximum=0
 for(const event of events){active+=event.event==='start'?1:-1;maximum=Math.max(maximum,active)}
 assert.equal(active,0);assert.ok(maximum<=3,`background probe concurrency is ${maximum}`)
 const checkedAt=results[0].data.checkedAt;assert.equal(results[1].data.checkedAt,checkedAt)
 assert.equal((await f.cli('host','check',hosts[0].id)).connected,true,'completed probes are refreshed on the next request')
 assert.equal(fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='start').length,10)
 assert.equal((await f.cli('host','get',hosts[8].id)).status.connected,false,'failure is reported and releases the queue')
 console.log('PASS Core health checks: coalesced duplicate callers, at most 3 concurrent SSH probes, failure isolation, persisted health and fresh subsequent checks')
}finally{await f.close();fs.rmSync(temp,{recursive:true,force:true})}
