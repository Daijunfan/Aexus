import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile),s=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'scene.json'))),tokens=new Map()
const request=async(token,...args)=>{const {stdout}=await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...process.env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:20000,maxBuffer:8e6});const r=JSON.parse(stdout);if(!r.ok)throw Error(r.error);return r.data},cli=(...a)=>request(null,...a)
for(const c of s.employees){const status=(await cli('session','status','--employee',c.id))[0];if(status.busy)throw Error(c.title+' is busy');if(status.lastReply?.id)await cli('session','acknowledge','--employee',c.id,'--reply-id',status.lastReply.id);if(c.engine==='claude'){const opened=await cli('session','open',c.id);await cli('config','thinking',opened.sessionId,'off')}if(c.role!=='employee')tokens.set(c.id,(await cli('auth','agent-token',c.id)).token)}
await cli('view','open','home');await cli('canvas','set','--view',s.viewId,'--x',String(150-s.offset*.53),'--y','50','--zoom','.53')
const gov=s.employees.find(c=>c.role==='governor')
await Promise.all(s.employees.map(c=>{const parent=c.role==='employee'?s.employees.find(m=>m.group===c.group&&m.role==='manager'):c.role==='manager'?gov:null;return request(parent?tokens.get(parent.id):null,'session','send','--employee',c.id,'--text','请为新团队送一句五字祝福。只回复五个汉字，不调用工具。',...(c.role==='governor'?['--view',s.viewId]:[]))}))
for(let i=0;i<3;i++){await cli('ui','screenshot',path.join(import.meta.dirname,`01-清爽实拍-${i+1}.png`));if(i<2)await new Promise(r=>setTimeout(r,170))}
console.log('Captured actual short-task starts, without changing product rendering')
