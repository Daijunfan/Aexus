// Opt-in: six real gpt-5.6-luna/low turns, isolated employees and target folders.
import fs from'node:fs';import os from'node:os';import path from'node:path';import{spawn,execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';import crypto from'node:crypto';
if(process.env.AGENTS_COMPANY_LIVE_SAFETY!=='1')throw Error('Set AGENTS_COMPANY_LIVE_SAFETY=1 to authorize Luna/low inference');
const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-cloud-live-')),env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_TUNNEL_DIR:root+'/Modules/Tunnel'},nonce=crypto.randomUUID().slice(0,8),marker=temp+'/mac-sentinel';fs.writeFileSync(marker,'UNCHANGED_'+nonce);const original=fs.readFileSync(marker);
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','ignore']}),report={model:'gpt-5.6-luna',effort:'low',rounds:[],success:false};let card,session;
const cli=async(...a)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/bin/agents',...a,'--json'],{env,timeout:40000})).stdout}catch(e){stdout=e.stdout||JSON.stringify({ok:false,error:e.message})}const r=JSON.parse(stdout);if(!r.ok)throw Error(r.error);return r.data};
const targets=[{os:'linux',host:'bupt208',root:'/home/djf/.cache'},{os:'windows',host:'bupt-windows',root:'C:\\Users\\djf\\AgentsCompany'}];
const cleanup=async target=>{if(!card)return;try{await cli('card','remove',card.id)}finally{if(target.os==='windows'){const encoded=Buffer.from(`Remove-Item -LiteralPath '${card.cwd.replaceAll("'","''")}' -Recurse -Force`,'utf16le').toString('base64');await run('ssh',['-T','-o','BatchMode=yes',target.host,'powershell -NoProfile -NonInteractive -EncodedCommand '+encoded])}else await run('ssh',['-T','-o','BatchMode=yes',target.host,`rm -rf -- '${card.cwd}'`]);card=undefined;session=undefined}};
try{
 for(let i=0;i<80;i++){try{await cli('status');break}catch{await new Promise(r=>setTimeout(r,100))}}
 for(const target of targets){
  try{
   const team='Cloud '+target.os;await cli('group','add',team,'--mode','cloud','--remote-host',target.host,'--remote-dir',target.root,'--remote-os',target.os);card=await cli('card','create','--title','Safety-'+nonce,'--group',team,'--engine','codex','--avatar','fireball','--model','gpt-5.6-luna','--effort','low');
   session=(await cli('session','open',card.id)).sessionId;let nativeId;
   const first='ROUTE_'+nonce+'_1',second='ROUTE_'+nonce+'_2';
   const tasks=[{text:`用工具查看当前操作系统、主机名和工作目录。在当前目录创建 routing-proof.txt，内容只包含 ${first}，读回验证。不修改其他文件。`,file:'routing-proof.txt',value:first},{text:`读取 routing-proof.txt，然后在当前工作目录创建“中文记录.txt”，内容只包含 ${second}，读回验证。不修改其他文件。`,file:'中文记录.txt',value:second},{text:`将当前目录的 routing-proof.txt 重命名为 routing-renamed.txt，读回内容并列出当前目录。不修改其他文件。`,file:'routing-renamed.txt',value:first}];
   for(let round=0;round<tasks.length;round++){
    if(round===2){await cli('session','close',session);session=(await cli('session','open',card.id)).sessionId}
    const t=tasks[round];await cli('session','send',session,t.text);let snapshot;
    for(let n=0;n<180;n++){snapshot=await cli('session','snapshot',session);if(!snapshot.busy)break;if(n===179)throw Error('model turn timeout');await new Promise(r=>setTimeout(r,1000))}
    const current=snapshot.items.slice(snapshot.items.findLastIndex(i=>i.role==='user')+1),failure=snapshot.error||current.find(i=>i.role==='notice'&&i.tone==='error')?.text;if(failure)throw Error(failure);
    const file=await cli('workspace','read','--employee',card.id,'--path',t.file);assert.equal(file.content.trim(),t.value);assert.deepEqual(fs.readFileSync(marker),original);assert.equal(snapshot.model,'gpt-5.6-luna');assert.equal(snapshot.effort,'low');if(nativeId)assert.equal(snapshot.threadId,nativeId);nativeId=snapshot.threadId;
    const blocks=current.filter(i=>i.role==='assistant').flatMap(i=>i.blocks);assert.ok(blocks.some(b=>b.kind==='tool'),'model never used a tool');
    const evidence={os:target.os,round:round+1,cwd:card.cwd,file:t.file,content:file.content.trim(),nativeSessionPreserved:true,macSentinelUnchanged:true,toolCount:blocks.filter(b=>b.kind==='tool').length,reply:blocks.filter(b=>b.kind==='text').map(b=>b.text).join('\n')};report.rounds.push(evidence);console.log('PASS '+target.os+' round '+(round+1)+' '+t.file);
   }
  }finally{await cleanup(target)}
 }
 report.success=true;
}catch(e){report.error=e.message;process.exitCode=1;console.error('FAIL '+e.message)}finally{fs.mkdirSync(root+'/artifacts/cloud-safety',{recursive:true});fs.writeFileSync(root+'/artifacts/cloud-safety/gpt-live.json',JSON.stringify(report,null,2));daemon.kill('SIGTERM');await new Promise(r=>daemon.once('exit',r));fs.rmSync(temp,{recursive:true,force:true})}
