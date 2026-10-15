import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util'
const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile),s=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'scene.json')))
const call=async(token,...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...process.env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:20000,maxBuffer:8e6})).stdout);if(!r.ok)throw Error(r.error);return r.data},cli=(...a)=>call(null,...a)
const members=s.employees.filter(c=>c.group==='产品研发组'),manager=members.find(c=>c.role==='manager'),gov=s.employees.find(c=>c.role==='governor'),mt=(await cli('auth','agent-token',manager.id)).token,gt=(await cli('auth','agent-token',gov.id)).token
for(const c of s.employees){const st=(await cli('session','status','--employee',c.id))[0];if(st.busy)throw Error('Still busy');if(st.lastReply?.id)await cli('session','acknowledge','--employee',c.id,'--reply-id',st.lastReply.id)}
await cli('canvas','set','--view',s.viewId,'--x',String(176-s.offset),'--y','-640','--zoom','1')
await new Promise(r=>setTimeout(r,250))
await Promise.all(members.map(c=>call(c.role==='manager'?gt:mt,'session','send','--employee',c.id,'--text','为团队提一个四字目标，只回复四个字，不调用工具。')))
await new Promise(r=>setTimeout(r,200))
for(let i=0;i<3;i++){await cli('ui','screenshot',path.join(import.meta.dirname,`02-协作特写-${i+1}.png`));if(i<2)await new Promise(r=>setTimeout(r,150))}
console.log('Captured actual Manager → Employee tasks at readable scale')
