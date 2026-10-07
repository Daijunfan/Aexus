// Explicit opt-in against existing employees. Only short messages and read-only API checks; no roster changes.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
if(process.env.AGENTS_COMPANY_LIVE_ACCEPTANCE!=='1')throw Error('Set AGENTS_COMPANY_LIVE_ACCEPTANCE=1 to send the authorized short test messages')
const root=path.resolve(import.meta.dirname,'../../..'),run=promisify(execFile),report={startedAt:new Date().toISOString(),checks:[]},artifact=path.join(root,'.aexus/artifacts/governor-cloud-acceptance-live.json')
const raw=async(tokenFile,...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env:{...process.env,...(tokenFile?{AGENTS_COMPANY_TOKEN_FILE:tokenFile}:{})},timeout:45000,maxBuffer:16e6})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}return JSON.parse(stdout)}
const call=async(tokenFile,...args)=>{const r=await raw(tokenFile,...args);assert.ok(r.ok,r.error);return r.data},cli=(...args)=>call(null,...args)
const record=(name,data={})=>{report.checks.push({name,passed:true,...data});fs.writeFileSync(artifact,JSON.stringify(report,null,2)+'\n');console.log('PASS '+name)}
const roster=(await cli('session','list')).sessions
const pick=(group,title)=>{const c=roster.find(c=>c.group===group&&c.title===title);assert.ok(c,group+'/'+title);if(c.engine==='codex'){assert.equal(c.model,'gpt-6-luna');assert.equal(c.effort,'low')}return c}
const governor=pick('Team-Managers','hi'),webManager=pick('Web 研发部','橘子'),researchManager=pick('研究实验室','阿沐')
const web=[pick('Web 研发部','文文'),pick('Web 研发部','小码')],research=[pick('研究实验室','墨墨'),pick('研究实验室','小字')],windows=pick('产品体验部','小墨')
const kali=roster.filter(c=>/^kali-Linux[12]$/.test(c.group))
for(const c of [governor,webManager,researchManager,windows,...kali.filter(c=>c.title!=='assault'&&c.title!=='defense')]){assert.equal(c.engine,'claude');assert.equal(c.model,'deepseek-flash')}
const status=async c=>(await cli('session','status','--employee',c.id))[0]
const latest=async c=>{const items=(await cli('session','transcript','--employee',c.id)).items;return items.slice(items.findLastIndex(i=>i.role==='user'))}
const answer=items=>items.flatMap(i=>i.blocks??[]).filter(b=>b.kind==='text').map(b=>b.text).join('\n').trim()
const wait=async(c,since,expected)=>{const end=Date.now()+180000;for(let n=0;Date.now()<end;n++){
 const s=await status(c)
 if(!s.busy&&s.lastReply?.createdAt>=since){const text=answer(await latest(c));if(expected)assert.ok(text.includes(expected),c.title+': '+text);return {id:c.id,title:c.title,reply:text,replyAt:s.lastReply.createdAt}}
 if(n&&n%20===0)console.log('Waiting for '+c.title)
 await new Promise(r=>setTimeout(r,1000))
}throw Error('Timeout waiting for '+c.title)}
const send=async(c,text)=>{assert.equal((await status(c)).busy,false,c.title+' is already busy');const since=Date.now(),sent=await cli('session','send','--employee',c.id,'--text',text);assert.ok(sent.messageId);return {since,sent}}
const tokenFile=async c=>(await cli('auth','agent-token',c.id)).file
try{
 // The Governor must discover and contact all six Kali employees a second time, after a fresh app start.
 const g=await send(governor,'这是简短 API 验收：请通过 agents CLI 给 Kali Linux 两个 Team 的全部员工发送：只回复五个汉字“你好云伙伴”，不要执行其他操作。逐个独立发送，读取每个人的新回复再汇总；不要创建员工、改设置或修改文件。')
 await wait(governor,g.since)
 record('Governor repeated Kali delivery', {results:await Promise.all(kali.map(c=>wait(c,g.since,'你好云伙伴')))})
 // Two real Claude/Flash Managers dispatch to both routed Claude and native remote Codex workers.
 const instruction=(manager,employees)=>`只做 API 消息测试：请用 agents CLI 给你本 Team 的 ${employees.map(c=>c.title).join(' 和 ')} 各发送：只回复五个汉字“星河映远山”，不要执行其他操作。分别读取两人的新回复后，最后只回复“管理链已通”。不要创建员工、改设置或修改文件。`
 const nested=await send(governor,`通过 agents CLI 分别给以下两位 Manager 发送简单测试任务，并读取两人的新回复：\n${webManager.group}/${webManager.title}：${instruction(webManager,web)}\n${researchManager.group}/${researchManager.title}：${instruction(researchManager,research)}\n只调用公司 API，不创建或删除员工、不更改配置。两位都完成后最后回复“跨队管理通过”。`)
 await wait(governor,nested.since,'跨队管理通过')
 record('Governor to two Managers to routed/native cloud Employees',{managers:await Promise.all([webManager,researchManager].map(c=>wait(c,nested.since,'管理链已通'))),results:await Promise.all([...web,...research].map(c=>wait(c,nested.since,'星河映远山')))})
 const poem=await send(governor,`请使用 agents CLI 给 ${windows.group}/${windows.title} 发送：“只写一首四句短诗，每句五个汉字，主题春风。不要调用工具或做其他操作。”读取它的新回复后汇总。不要改配置。`)
 await wait(governor,poem.since);const verse=await wait(windows,poem.since);assert.ok(verse.reply.length>=20&&verse.reply.length<160)
 record('Governor to Windows Claude cloud employee',{result:verse})
 for(const c of [kali.find(c=>c.title==='kali-player1'),windows]){
  const round=await send(c,'这是一次只读 API 连通测试。请用你工作环境中的 agents auth whoami --json 核对当前员工身份，然后最终只回复五个汉字“身份已核对”。不要调用其他员工，不要修改文件。')
  const result=await wait(c,round.since,'身份已核对'),items=await latest(c),tools=items.flatMap(i=>i.blocks??[]).filter(b=>b.kind==='tool')
  assert.ok(tools.some(t=>JSON.stringify(t.result).includes(c.id)),'remote identity must come from an actual tool response')
  record('Remote employee CLI identity round trip: '+c.group,{result})
 }
 // Exercise the real identity boundary without issuing any unauthorized mutation.
 const managerToken=await tokenFile(webManager),workerToken=await tokenFile(web[0])
 assert.equal((await raw(managerToken,'session','info','--employee',windows.id)).ok,false)
 assert.equal((await raw(workerToken,'session','info','--employee',web[1].id)).ok,false)
 assert.equal((await raw(managerToken,'host','list')).ok,false)
 assert.ok((await call(managerToken,'management','topology')).nodes.every(n=>n.group===webManager.group))
 record('Live Manager and Employee read boundaries reject cross-Team/peer/host access')
 const localRecord=JSON.parse(fs.readFileSync(path.join(os.homedir(),'AgentsCompany/sessions.json'))).sessions.find(c=>c.id===governor.id)
 const nativeModels=[]
 for(const dir of fs.readdirSync(path.join(os.homedir(),'.claude/projects'),{withFileTypes:true}))if(dir.isDirectory()){
  const file=path.join(os.homedir(),'.claude/projects',dir.name,localRecord.claudeSessionId+'.jsonl')
  if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').split('\n').filter(Boolean)){const e=JSON.parse(line);if(e.type==='assistant'&&e.message?.model&&e.message.model!=='<synthetic>')nativeModels.push(e.message.model)}
 }
 assert.equal(nativeModels.at(-1),'deepseek-flash');record('Governor actual native response model is DeepSeek Flash')
 report.finishedAt=new Date().toISOString();report.passed=true;fs.writeFileSync(artifact,JSON.stringify(report,null,2)+'\n')
}catch(error){report.passed=false;report.error=error.message;fs.writeFileSync(artifact,JSON.stringify(report,null,2)+'\n');throw error}
