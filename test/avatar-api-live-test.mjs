// Opt-in: fresh Claude Code supervisors, real DeepSeek Flash, isolated company/profile.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'
if(process.env.AGENTS_COMPANY_LIVE_ACCEPTANCE!=='1')throw Error('Set AGENTS_COMPANY_LIVE_ACCEPTANCE=1')
const root=path.resolve(import.meta.dirname,'..'),profile=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-avatar-claude-')))
const settings=JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'settings.json'),'utf8'))
const provider={...settings.env,ANTHROPIC_MODEL:'deepseek-flash',ANTHROPIC_DEFAULT_HAIKU_MODEL:'deepseek-flash',ANTHROPIC_DEFAULT_SONNET_MODEL:'deepseek-flash',ANTHROPIC_DEFAULT_OPUS_MODEL:'deepseek-flash'}
assert.match(provider.ANTHROPIC_BASE_URL??'',/^https:\/\/api\.deepseek\.com(?:\/|$)/)
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({env:provider,model:'deepseek-flash',alwaysThinkingEnabled:false}),{mode:0o600})
const f=await fixtureCore({CLAUDE_CONFIG_DIR:profile,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}),artifact=path.join(root,'artifacts/avatar-api/live-results.json')
const report={isolated:true,engine:'claude',model:'deepseek-flash',thinking:false,turns:[],supervisors:[],employees:[]}
fs.mkdirSync(path.dirname(artifact),{recursive:true})
const rpc=async(auth,cmd,args={})=>{const r=await f.request(auth,cmd,args);assert.ok(r.ok,r.error);return r.data}
const write=()=>fs.writeFileSync(artifact,JSON.stringify(report,null,2)+'\n')
const status=async id=>(await rpc(null,'session.status',{employee:id}))[0]
const wait=async(id,initialization=false)=>{
 const deadline=Date.now()+300000;let logged=Date.now()
 while(Date.now()<deadline){const s=await status(id);if(s.initialization?.status==='failed')throw Error(s.initialization.error);assert.ok(!s.waitingApproval,'Unexpected approval wait');if(!s.busy&&(!initialization||s.initialization?.status==='ready'))return s;if(Date.now()-logged>20000){console.log('Waiting for '+id);logged=Date.now()}await new Promise(r=>setTimeout(r,700))}
 throw Error('Timed out: '+id)
}
const turn=async(card,prompt)=>{
 const sent=await rpc(null,'session.send',{employee:card.id,text:prompt});await wait(card.id)
 const transcript=await rpc(null,'session.transcript',{employee:card.id});report.turns.push({employee:card.title,id:card.id,messageId:sent.messageId,prompt,transcript});write();return transcript
}
const cards=async()=>(await rpc(null,'session.list')).sessions
const verify=async(title,avatar,creator,group,role='employee')=>{
 const c=(await cards()).find(c=>c.title===title);assert.ok(c,'Not actually created: '+title)
 assert.equal(c.avatar,avatar);assert.equal(c.createdBy.employeeId,creator.id);assert.equal(c.group,group);assert.equal(c.managementRole,role);assert.equal(c.engine,'claude');assert.equal(c.model,'deepseek-flash');assert.equal(c.thinking,false);assert.ok(c.role,'profession not persisted');assert.ok(c.cwd.startsWith(f.temp))
 const auth=await f.token(creator.id),read=(await rpc(auth,'session.status',{employee:c.id}))[0];assert.equal(read.avatar,avatar);assert.equal(read.profession,c.role)
 report.employees.push({id:c.id,title:c.title,avatar:c.avatar,profession:c.role,managementRole:c.managementRole,group:c.group,createdBy:c.createdBy,model:c.model,thinking:c.thinking});write();return c
}
try{
 const key=provider.ANTHROPIC_API_KEY||provider.ANTHROPIC_AUTH_TOKEN;assert.ok(key)
 const models=await fetch('https://api.deepseek.com/models',{headers:{Authorization:'Bearer '+key}}).then(r=>{assert.ok(r.ok);return r.json()});assert.ok(models.data.some(m=>m.id==='deepseek-flash'));report.providerModelAvailable=true
 await f.cli('group','add','Avatar A');await f.cli('group','add','Avatar B')
 for(const role of ['manager','governor']){
  const c=await f.cli('card','create','--title','Fresh '+role,'--group','Avatar A','--management-role',role,'--engine','claude','--model','deepseek-flash','--thinking','off','--character','韦伯','--avatar-style','chibi','--permission','acceptEdits')
  assert.equal(c.thinking,false);await wait(c.id,true);const auth=await f.token(c.id),docs=(await rpc(auth,'api.docs')).markdown;assert.match(docs,/character.*avatarStyle/);assert.match(docs,/profession/)
  const handbook=path.join(c.cwd,'.agents-company/employees',c.id,'API.md');assert.match(fs.readFileSync(handbook,'utf8'),/avatar list/)
  report.supervisors.push({...c,handbookUpdatedVerified:true,initialization:(await status(c.id)).initialization});write();console.log('Fresh '+role+' initialized with updated handbook')
 }
 const [manager,governor]=report.supervisors
 const constraints='所有新员工都使用 Claude Code，DeepSeek Flash，关闭思考。通过公司的 API 工具完成，不直接修改状态文件，不给员工安排其他任务。请查人物目录并在创建后读回核验人物外形、职业和职级，名字相同不代表外形正确。'
 await turn(manager,'请在你自己的团队创建两名 Employee：名字“英雄王可爱版”，形象是吉尔伽美什可爱版，职业是代码审查；名字“Saber原作版”，形象是 Saber 原作风格，职业是测试。'+constraints)
 await verify('英雄王可爱版','fate-gilgamesh-chibi',manager,'Avatar A');await verify('Saber原作版','fate-saber-anime',manager,'Avatar A')
 await turn(governor,'请跨团队，在已有的 Avatar B 中创建：一名叫“樱原作版”的 Employee，形象间桐樱原作风格，职业文档整理；一名叫“凛经理”的 Manager，形象远坂凛可爱版，职业团队管理。'+constraints)
 await verify('樱原作版','fate-sakura-anime',governor,'Avatar B');const lead=await verify('凛经理','fate-rin-chibi',governor,'Avatar B','manager');await wait(lead.id,true)
 await turn(lead,'请在本团队创建一名叫“Archer可爱版”的 Employee，形象是 Archer 的可爱版，职业是构建检查。'+constraints)
 await verify('Archer可爱版','fate-archer-chibi',lead,'Avatar B')
 for(const t of report.turns){const text=JSON.stringify(t.transcript);assert.match(text,/avatar list/);assert.match(text,/card create/);assert.match(text,/session status/)}
 const modelsSeen=new Set();let thinkingBlocks=0
 for(const file of fs.globSync(path.join(profile,'projects','*','*.jsonl')))for(const line of fs.readFileSync(file,'utf8').split('\n').filter(Boolean)){
  const item=JSON.parse(line);if(item.type==='assistant'&&item.message?.model&&item.message.model!=='<synthetic>'){modelsSeen.add(item.message.model);thinkingBlocks+=item.message.content.filter(b=>b.type==='thinking').length}
 }
 assert.deepEqual([...modelsSeen],['deepseek-flash']);assert.equal(thinkingBlocks,0);report.nativeResponseModels=[...modelsSeen];report.nativeThinkingBlocks=thinkingBlocks;report.passed=true;write()
 console.log('PASS: fresh Manager, Governor and Governor-created Manager initialized; 5 exact named/style hires, cross-Team authority, real Flash responses with thinking off')
}catch(error){report.passed=false;report.error=error.message;try{report.failureCards=await cards();for(const c of report.failureCards.filter(c=>c.managementRole!=='employee'))report.turns.push({employee:c.title,transcript:await rpc(null,'session.transcript',{employee:c.id})})}catch{}write();throw error}
finally{await f.close();fs.rmSync(profile,{recursive:true,force:true})}
