// Opt-in: one real Luna/low turn on a temporary Windows employee, no visible window.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
if(process.env.AGENTS_COMPANY_WINDOWS_MESSAGE_LIVE!=='1')throw Error('Set AGENTS_COMPANY_WINDOWS_MESSAGE_LIVE=1 for one Luna/low turn')
const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-win-message-')),label='Message-'+crypto.randomUUID().slice(0,8),env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_TUNNEL_DIR:root+'/Modules/Tunnel'},host='bupt-windows',base='C:\\Users\\djf\\AgentsCompany',remote=base+'\\'+label
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),done=new Promise(r=>daemon.once('exit',r));let employee,session
const cli=async(...args)=>{const out=(await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:35000})).stdout,response=JSON.parse(out);assert.ok(response.ok,response.error);return response.data}
const encoded=script=>Buffer.from(script,'utf16le').toString('base64')
const report={model:'gpt-5.6-luna',effort:'low',host,success:false}
try{
 for(let n=0;n<100;n++){try{if((await cli('status')).running)break}catch{}await new Promise(r=>setTimeout(r,100))}
 await cli('group','add','Windows live','--mode','cloud','--remote-host',host,'--remote-os','windows','--remote-dir',base)
 employee=await cli('card','create','--title',label,'--group','Windows live','--engine','codex','--model','gpt-5.6-luna','--effort','low')
 session=(await cli('session','open',employee.id)).sessionId
 await cli('session','send',session,'只使用工具读取当前工作目录，并简短回复该目录。不要创建或修改文件。')
 let snapshot
 for(let n=0;n<120;n++){snapshot=await cli('session','snapshot',session);if(!snapshot.busy&&snapshot.items.some(i=>i.role==='assistant'))break;await new Promise(r=>setTimeout(r,1000))}
 assert.equal(snapshot.model,'gpt-5.6-luna');assert.equal(snapshot.effort,'low')
 const items=snapshot.items.slice(snapshot.items.findLastIndex(i=>i.role==='user')+1),tools=items.filter(i=>i.role==='assistant').flatMap(i=>i.blocks??[]).filter(b=>b.kind==='tool')
 report.toolCount=tools.length;report.toolResults=tools.map(t=>({isError:t.isError,output:String(t.result??'').slice(-350)}))
 assert.ok(tools.length,'No remote tool call');assert.ok(tools.some(t=>!t.isError&&String(t.result??'').includes(remote)),'Remote tool result did not identify the Windows directory')
 assert.ok(!items.some(i=>i.role==='notice'&&i.tone==='error'),'Remote turn failed')
 report.success=true;report.toolCount=tools.length;report.remoteDirectoryVerified=true;console.log('PASS one real Luna/low turn used Windows native tools in the temporary workspace')
}catch(error){report.error=error.message;process.exitCode=1;console.error('FAIL '+error.message)}finally{
 fs.mkdirSync(root+'/artifacts/windows-message',{recursive:true});fs.writeFileSync(root+'/artifacts/windows-message/live.json',JSON.stringify(report,null,2))
 if(session)try{await cli('session','close',session)}catch{}
 if(employee)try{await cli('card','remove',employee.id)}catch{}
 daemon.kill('SIGTERM');await done
 if(employee){await run('ssh',['-T','-o','BatchMode=yes',host,'powershell -NoProfile -NonInteractive -EncodedCommand '+encoded("Remove-Item -LiteralPath '"+remote+"' -Recurse -Force")])}
 fs.rmSync(temp,{recursive:true,force:true})
}
