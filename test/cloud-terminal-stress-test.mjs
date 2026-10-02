import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {sshFixture} from './fixtures/cloud-workbench.mjs'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-stress-')),bin=path.join(temp,'bin');sshFixture(bin)
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH}),quote=s=>"'"+s.replaceAll("'","'\\''")+"'"
try{
 const host=await f.cli('host','create','--data',JSON.stringify({name:'Stress fixture',host:'fixture',os:'linux',defaultDirectory:temp})),terminal=await f.cli('host','terminal-open',host.id)
 const input=data=>f.cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data',data)
 const read=()=>f.cli('host','terminal-read',host.id,'--terminal',terminal.id)
 const data='终端🙂\n'.repeat(14000),bytes=Buffer.from(data),{createHash}=await import('node:crypto'),expected=createHash('sha256').update(bytes).digest('hex')
 const script=`import os,tty,termios,hashlib\ns=termios.tcgetattr(0)\ntry:\n tty.setraw(0);os.write(1,b'PASTE_'+b'READY\\n');remaining=${bytes.length};h=hashlib.sha256()\n while remaining:\n  part=os.read(0,min(65536,remaining));h.update(part);remaining-=len(part)\nfinally:termios.tcsetattr(0,termios.TCSADRAIN,s)\nprint('PASTE_SHA='+h.hexdigest(),flush=True)`
 await input('python3 -c '+quote(script)+'\r');await f.until(async()=>(await read()).output.includes('PASTE_READY'),'raw paste reader')
 // Socket API avoids OS argv size limits for a real large Unicode paste.
 const sent=await f.request(null,'host.terminal-input',{id:host.id,terminal:terminal.id,data});assert.equal(sent.ok,true)
 await f.until(async()=>(await read()).output.includes('PASTE_SHA='+expected),'exact pasted bytes')
 const flood="import sys;sys.stdout.write(('日志🙂 abcdefghijklmnopqrstuvwxyz0123456789\\n')*120000);sys.stdout.write('FLOOD_'+'COMPLETE\\n');sys.stdout.flush()"
 const started=performance.now();await input('python3 -c '+quote(flood)+'\r')
 const tail=await f.until(async()=>{const r=await read();return r.output.includes('FLOOD_COMPLETE')?r:false},'flood output')
 assert.equal(tail.reset,true);assert.ok(tail.output.length<=256000);assert.ok(!tail.output.includes('\ufffd'));assert.ok(tail.cursor>4e6)
 await input("printf '%s%s\\n' 'RESPONSIVE_' 'AFTER_FLOOD'\r");await f.until(async()=>(await read()).output.includes('RESPONSIVE_AFTER_FLOOD'),'post-flood response')
 console.log(JSON.stringify({passed:true,pastedUtf8Bytes:bytes.length,pasteHashMatched:true,outputCodeUnits:tail.cursor,retainedCodeUnits:tail.output.length,floodMs:Math.round(performance.now()-started),responsiveAfterFlood:true}))
 await f.cli('host','terminal-close',host.id,'--terminal',terminal.id)
}finally{await f.close();fs.rmSync(temp,{recursive:true,force:true})}
