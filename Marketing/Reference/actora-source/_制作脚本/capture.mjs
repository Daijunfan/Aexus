// Reproducible, hidden-window product photography. All accounts, tasks and workspaces are demonstrations.
// No production employees, credentials, cloud hosts or model endpoints are used.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const output=path.resolve(import.meta.dirname,'..'),root=path.resolve(output,'..'),raw=path.join(output,'_原始截图')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-showcase-'))),state=path.join(temp,'state'),control=path.join(temp,'control'),projects=path.join(temp,'projects'),work=path.join(temp,'work'),shared=path.join(temp,'shared'),tunnel=path.join(temp,'tunnel')
for(const dir of [state,control,projects,work,shared,tunnel,path.join(temp,'claude'),path.join(temp,'codex')])fs.mkdirSync(dir,{recursive:true})
fs.mkdirSync(raw,{recursive:true});fs.writeFileSync(path.join(control,'release-all'),'')
const remoteBridge=`import json,sys\nr=json.load(sys.stdin)\nt=r['target']\nprint(json.dumps({'connected':True,'info':'Demonstration connection','environment':{'os':t.get('os','linux'),'distribution':t.get('distribution','ubuntu'),'distributionName':'Demo environment'}}))\n`
fs.writeFileSync(path.join(tunnel,'bridge.py'),remoteBridge)
for(const name of ['terminal.py','transport.py'])fs.copyFileSync(path.join(root,'Modules/Tunnel',name),path.join(tunnel,name))
const shell=path.join(temp,'demo-shell');fs.writeFileSync(shell,"#!/bin/sh\nexport PS1='workspace $ '\nexec /bin/bash --noprofile --norc -i\n",{mode:0o755})
const codex=path.join(import.meta.dirname,'demo-codex.cjs')
// Use the repository's protocol fixture: the source is saved alongside the photography scripts.
let fixture=fs.readFileSync(path.join(root,'test/fixtures/initialization-codex.cjs'),'utf8').replace("displayName:'Fixture'","displayName:'GPT-6 Luna'")
fixture=fixture.replace("const streamFile=path.join(control,employee+'.stream.txt')",`const stageFile=path.join(control,employee+'.stage.json')
        if(!hidden&&fs.existsSync(stageFile)&&!streamed){const stage=JSON.parse(fs.readFileSync(stageFile,'utf8'));if(stage.kind==='thinking'){event('item/reasoning/summaryTextDelta',{threadId:thread,turnId:turn,itemId:'thinking',delta:stage.text});streamed='stage'}else if(stage.kind==='tool'){event('item/started',{threadId:thread,turnId:turn,item:{id:'work',type:'commandExecution',command:stage.text}});streamed='stage'}}
        const streamFile=path.join(control,employee+'.stream.txt')`)
fs.writeFileSync(codex,fixture,{mode:0o755})
// A loopback-only response fixture supplies example Claude dialogue; never a provider request.
const pending=new Set(),model=http.createServer(async(req,res)=>{
 let body='';for await(const part of req)body+=part
 if(req.url.includes('count_tokens')){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":1}');return}
 if(!req.url.includes('messages')){res.writeHead(404).end();return}
 const data=JSON.parse(body),last=JSON.stringify(data.messages?.filter(m=>m.role==='user').at(-1)?.content??''),hidden=last.includes('private initialization')
 const answer=hidden?'OK':last.includes('Markdown 排版')?'## 小站的下一步\n\n先把重要的三件事做好。\n\n| 事项 | 负责方向 | 验收重点 |\n| --- | --- | --- |\n| 首屏布局 | 前端 | 标题清楚，按钮好找 |\n| 项目文案 | 内容 | 一句话说清用途 |\n| 手机适配 | 测试 | 排版完整，不横向溢出 |\n\n### 交接时记住\n- 保留关键设计约定。\n- 把结果写进项目笔记。\n- 遇到问题先说明原因，再给下一步。':last.includes('文案')?'我在整理首页文案，先把重点写得更简洁。':last.includes('测试')?'正在逐项检查交互，先确认主要流程。':'正在整理资料，稍后把结果放进项目笔记。'
 const message={id:'demo-'+Date.now(),type:'message',role:'assistant',model:data.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}
 if(!data.stream){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...message,content:[{type:'text',text:answer}],stop_reason:'end_turn'}));return}
 res.writeHead(200,{'content-type':'text/event-stream'});const emit=event=>res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
 for(const event of [{type:'message_start',message},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:answer}},{type:'content_block_stop',index:0}])emit(event)
 if(hidden){emit({type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}});emit({type:'message_stop'});res.end()}else{pending.add(res);res.on('close',()=>pending.delete(res))}
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
const env={...process.env}
for(const key of Object.keys(env))if(/^(ANTHROPIC_|OPENAI_|AGENTS_COMPANY_TOKEN|AGENTS_COMPANY_EMPLOYEE|AGENTS_COMPANY_SOCKET|AGENTS_COMPANY_PORT|CODEX_API_KEY)/.test(key))delete env[key]
Object.assign(env,{SHELL:shell,HISTFILE:'/dev/null',BASH_SILENCE_DEPRECATION_WARNING:'1',AGENTS_COMPANY_HOME:state,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_WORKSPACES:work,AGENTS_COMPANY_SHARED_DIR:shared,AGENTS_COMPANY_TUNNEL_DIR:tunnel,AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1740',AGENTS_COMPANY_HEIGHT:'1280',CODEX_BIN:codex,CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,CLAUDE_CONFIG_DIR:path.join(temp,'claude'),ANTHROPIC_BASE_URL:`http://127.0.0.1:${model.address().port}`,ANTHROPIC_API_KEY:'local-demonstration-only',ANTHROPIC_AUTH_TOKEN:'',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',NO_PROXY:'127.0.0.1,localhost'})
delete env.ELECTRON_RUN_AS_NODE
const groups=[],cards=[],rooms={},teamRoots={},teamSettings={}
const team=(name,x,y,width=1180,height=890,config={mode:'build'})=>{
 groups.push(name);rooms[name]={bounds:{x,y,width,height,shape:'rounded',arrangement:'free',pinned:true},design:{theme:['lavender','ocean','rose','amber','slate'][groups.length%5],scenery:false,pattern:'dots'}};teamSettings[name]=config
 teamRoots[name]=config.mode==='cloud'?config.remote.directory:path.join(config.mode==='work'?work:projects,name)
 if(config.mode!=='cloud')fs.mkdirSync(teamRoots[name],{recursive:true})
}
const employee=(id,title,group,engine,avatar,x,y,manager=false,creator,kind='worker')=>{
 const remote=teamSettings[group].mode==='cloud',cwd=remote?teamRoots[group]+'/'+id:path.join(teamRoots[group],title)
 if(!remote)fs.mkdirSync(cwd,{recursive:true})
 const card={id,title,group,engine,avatar,kind,cwd,model:engine==='codex'?'gpt-6-luna':'claude-sonnet-4-6',effort:'low',createdAt:cards.length+1,managementRole:manager?'manager':'employee',position:{x,y},accessMode:'trusted',permissionMode:'bypassPermissions',...(creator?{createdBy:{kind:'agent',employeeId:creator}}:{})}
 cards.push(card);return card
}
team('星火创作社',0,0,1320,1290)
employee('lead','火火 · Manager','星火创作社','codex','fireball',565,575,true)
const crew=[['front','小码 · 前端','codex','byte'],['copy','橘子 · 文案','claude','marmalade'],['logic','阿蓝 · 后端','codex','dewey'],['qa','小鹿 · 测试','claude','woodi'],['design','方糖 · 设计','codex','wondercube'],['docs','石头 · 整理','codex','stacky']]
const positions=[[185,215],[945,215],[75,575],[1055,575],[185,945],[945,945]]
crew.forEach(([id,title,engine,avatar],i)=>employee(id,title,'星火创作社',engine,avatar,...positions[i],false,'lead'))
team('两位好搭档',1460,0,780,660)
employee('engine-codex','Codey','两位好搭档','codex','codex',115,245)
employee('engine-claude','Claude','两位好搭档','claude','marmalade',445,245)
const clouds=[['Web Studio','ubuntu','linux','web'],['产品实验室','ubuntu','linux','lab'],['Windows 工坊',undefined,'windows','win'],['远程研发部','kali','linux','dev']]
clouds.forEach(([name,distribution,os,id],i)=>{
 team(name,(i%2)*920,1550+Math.floor(i/2)*740,840,650,{mode:'cloud',remote:{host:id+'.demo.invalid',user:'studio',os,distribution,directory:os==='windows'?'C:/Studio':'/workspace/'+id}})
 employee(id+'-a','项目伙伴',name,'codex',i===2?'stacky':'byte',150,250)
 employee(id+'-b','原生伙伴',name,'claude',i===3?'inky':'fireball',485,250,false,undefined,'cloud-native-worker')
})
team('灵感与计划',2600,0,900,700,{mode:'work',pluginId:'mininotion'})
employee('note-lead','整理师','灵感与计划','codex','dewey',100,245,true)
employee('note-write','记录员','灵感与计划','claude','woodi',575,245,false,'note-lead')
team('阅读研究室',3600,0,900,700,{mode:'work',pluginId:'margin-reader'})
employee('reader','研究员','阅读研究室','codex','marmalade',150,255)
employee('archiver','归档员','阅读研究室','claude','inky',540,255)
team('云主机管家',3100,820,900,700,{mode:'work',pluginId:'cloud-hosts'})
employee('cloud-lead','云端管家','云主机管家','codex','fireball',355,260,true)
team('文件接力站',4600,820,820,660)
employee('handoff','接力员','文件接力站','codex','marmalade',315,245)
fs.writeFileSync(path.join(state,'sessions.json'),JSON.stringify({groups,sessions:cards,rooms,teamRoots,teamSettings,preferences:{theme:'white',sidebarWidth:64,pageZoom:1,snapEmployees:true},viewport:{x:40,y:30,zoom:.95},access:{version:1,revision:0,globalManagerIds:[],relations:[]}}))
for(const [name,content] of Object.entries({'产品需求.md':'# 小小的起点\n\n让一个想法，从任务变成可以触摸的页面。\n\n## 这一周\n- 梳理目标用户\n- 完成首屏设计\n- 检查移动端体验\n\n## 下一步\n把重要的反馈留在这里，让下一位伙伴接着做。','发布清单.md':'# 发布前，最后看一眼\n\n- [x] 确认标题与介绍\n- [x] 整理项目截图\n- [ ] 复核链接\n- [ ] 发布与收集反馈','本周笔记.txt':'留一点时间给创意。\n把零碎的事情交给工作流。'}))fs.writeFileSync(path.join(shared,name),content)
const front=cards.find(c=>c.id==='handoff');for(const name of ['设计','文档','交付'])fs.mkdirSync(path.join(front.cwd,name))
fs.copyFileSync(path.join(shared,'产品需求.md'),path.join(front.cwd,'文档','产品需求.md'))
fs.writeFileSync(path.join(front.cwd,'README.md'),'# 星火小站\n\n一个把想法变成作品的项目。\n\n今日目标：完成首屏、整理文案、检查交互。')
const app=await electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:[],env,timeout:30000}),page=await app.firstWindow();page.setDefaultTimeout(20000)
let lastLog='',focusTimer;const shots=[];app.process().stderr.on('data',data=>lastLog=(lastLog+data).slice(-12000))
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:30000,maxBuffer:8e6})).stdout);if(!result.ok)throw Error(result.error);return result.data}
const tokens=new Map();const as=async(id,...args)=>{if(!tokens.has(id))tokens.set(id,(await cli('auth','agent-token',id)).token);const result=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env:{...env,AGENTS_COMPANY_TOKEN:tokens.get(id)},timeout:15000,maxBuffer:8e6})).stdout);if(!result.ok)throw Error(result.error);return result.data}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const focus=async(manager,worker)=>{clearInterval(focusTimer);await as(manager,'session','info','--employee',worker);focusTimer=setInterval(()=>as(manager,'session','info','--employee',worker).catch(()=>{}),650)}
const unfocus=async()=>{clearInterval(focusTimer);await as('lead','auth','whoami')}
const shot=async(name,source=page,selector)=>{await source.evaluate(()=>document.fonts.ready);await delay(180);const file=path.join(raw,name+'.png');await (selector?source.locator(selector):source).screenshot({path:file,scale:'css'});shots.push({name,file:path.relative(output,file),disclosure:'应用实拍；演示工作区；任务与云主机状态为演示数据，不作为真实模型执行或远端连接的证明'});console.log('CAPTURE '+name)}
const resize=async(w=1740,h=1280)=>app.evaluate(({BrowserWindow},{w,h})=>BrowserWindow.getAllWindows()[0].setContentSize(w,h),{w,h})
const views=new Map()
const view=async(name,teams,theme='white')=>{
 await unfocus();await cli('view','open','home');await cli('view','shared','off').catch(()=>{});await cli('settings','set','--theme',theme)
 if(!views.has(name)){const created=await cli('team-view','create','--name',name,'--teams',JSON.stringify(teams));views.set(name,created.id??created.views?.at(-1)?.id??(await cli('team-view','list')).views.at(-1).id)}
 await cli('team-view','select',views.get(name));await delay(150)
 const selected=(await cli('office','layout')).rooms.filter(r=>teams.includes(r.name)),minX=Math.min(...selected.map(r=>r.bounds.x)),minY=Math.min(...selected.map(r=>r.bounds.y)),maxX=Math.max(...selected.map(r=>r.bounds.x+r.bounds.width)),maxY=Math.max(...selected.map(r=>r.bounds.y+r.bounds.height))
 const box=await page.locator('.infinite-canvas').boundingBox(),zoom=Math.min(1.1,(box.width-90)/(maxX-minX),(box.height-80)/(maxY-minY))
 await cli('canvas','set','--x',String((box.width-(maxX-minX)*zoom)/2-minX*zoom),'--y',String(35-minY*zoom),'--zoom',String(zoom))
 await delay(200)
}
const plugin=async(id,team,method,params={})=>cli('plugin','call',id,method,'--team',team,'--params',JSON.stringify(params))
const pluginOpen=async(id,team,w=1440,h=1050)=>{const opened=app.waitForEvent('window');const info=await cli('plugin','open',id,'--team',team);const win=await opened;win.setDefaultTimeout(20000);await cli('plugin','place',info.id,'--width',String(w),'--height',String(h));await win.waitForLoadState('domcontentloaded');await delay(700);return {win,info}}
try{
 await page.locator('.infinite-canvas').waitFor();await resize(1740,1500)
 // Photograph-specific redaction of filesystem paths and secondary geometry HUDs only.
 await page.addStyleTag({content:'.team-root-label,.room-dimension,.canvas-hud,.terminal-location,.session-settings .cwd,.shared-location{visibility:hidden!important}.employee-state{opacity:0!important} .activity-bubble{display:none}'} )
 await view('协作现场',['星火创作社']);await shot('01-协作-待命');await shot('01-协作-待命近景',page,'[data-department="星火创作社"]')
 for(const id of ['lead',...crew.map(c=>c[0])])fs.writeFileSync(path.join(control,id+'.hold-user'),'')
 await cli('session','send','--employee','lead','--text','把本周的小站计划分给伙伴们，先完成首屏、文案、交互与资料整理。')
 for(const [id,,engine] of crew){try{await as('lead','session','send','--employee',id,'--text',id==='copy'?'请整理首屏文案，写得更简洁。':id==='qa'?'请检查这次页面的交互测试，先看主要流程。':'请推进今天的示例任务，把需要协作的部分记在项目笔记中。')}catch(e){console.log('DEMO_ENGINE '+id+' '+String(e).slice(0,180))}}
 await focus('lead','front');await shot('01-协作-工作现场');await shot('01-协作-团队近景',page,'[data-department="星火创作社"]')
 await view('协作现场',['星火创作社'],'white');await focus('lead','logic');await shot('01-协作-浅色现场');await shot('01-协作-浅色近景',page,'[data-department="星火创作社"]')
 await view('双引擎',['两位好搭档'],'white');await shot('03-双引擎-浅色');await shot('03-双引擎-近景',page,'[data-department="两位好搭档"]')
 await view('双引擎',['两位好搭档'],'white');await shot('03-双引擎-浅色全景')
 for(const id of ['engine-codex','engine-claude']){fs.writeFileSync(path.join(control,id+'.hold-user'),'');await cli('session','send','--employee',id,'--text','请一起整理这份示例项目的笔记和下一步计划。')}
 await shot('03-双引擎-一起工作',page,'[data-department="两位好搭档"]')
 await resize(1740,1500);await view('远程项目',clouds.map(c=>c[0]),'white');await expect(page.locator('.team-health[data-connected="true"]')).toHaveCount(4);await shot('02-多云-浅色全景')
 await view('远程项目',clouds.map(c=>c[0]),'white');await shot('02-多云-浅色');await shot('02-云端-工作方式',page,'[data-department="Web Studio"]')
 await resize();await view('协作现场',['星火创作社'],'white')
 fs.writeFileSync(path.join(control,'front.stage.json'),JSON.stringify({kind:'tool',text:'检查首屏布局与按钮状态'}));fs.writeFileSync(path.join(control,'logic.stage.json'),JSON.stringify({kind:'thinking',text:'先梳理输入和输出，再把接口拆成小步骤。'}));fs.writeFileSync(path.join(control,'design.stream.txt'),'我把需要确认的视觉细节整理好了，准备交给前端伙伴。')
 await page.addStyleTag({content:'.activity-bubble{display:block!important}.activity-text{-webkit-line-clamp:2!important;max-height:54px}.activity-bubble{max-width:225px!important}'} )
 await focus('lead','design');await delay(250);await shot('05-工作气泡-协作现场')
 await page.addStyleTag({content:'.activity-bubble{display:none!important}'} )
 fs.writeFileSync(path.join(control,'handoff.reply.txt'),'示例交接准备好了。\n\n### 下一步\n- 前端：调整首屏与手机端间距。\n- 文案：精简标题，保留最重要的一句话。\n\n### 文件放在哪里\n产品需求、发布清单和本周笔记都在左侧中转站，可以继续编辑，或交给下一位伙伴。')
 await cli('session','send','--employee','handoff','--text','整理一下示例项目的交接，让下一位伙伴接着做。');await expect.poll(async()=>(await cli('session','status','--employee','handoff'))[0].busy).toBe(false)
 await resize(1500,1000);await cli('settings','set','--terminal-height','120');await cli('view','open','conversation','--employee','handoff');await page.locator('.conversation-dialog').waitFor();await shot('05-会话-工作台')
 await cli('view','shared','on');await page.locator('.shared-drawer').waitFor();await shot('07-中转站-并排')
 await page.locator('.shared-files [data-file="产品需求.md"] .file-open').click();await page.locator('.shared-files .file-preview textarea').waitFor();await shot('07-中转站-可编辑');await shot('07-中转站-笔记细节',page,'.shared-drawer')
 await cli('view','close');await cli('view','shared','off');await resize(1740,1500);await view('插件空间',['灵感与计划','阅读研究室','云主机管家'],'white');await shot('10-插件-团队')
 const p=(method,params={})=>plugin('mininotion','灵感与计划',method,params)
 await p('settings.set',{changes:{theme:'light',sidebarWidth:238}})
 const notes=await p('page.create',{title:'把好想法，留在这里。',color:'white',icon:'✨',cover:'blue',blocks:[{type:'heading',props:{level:2},content:'今天，先做一点喜欢的事。'},{type:'paragraph',content:'灵感、计划和正在推进的作品，都可以住在同一个工作空间。'},{type:'heading',props:{level:2},content:'这一周的小目标'},{type:'checkListItem',props:{checked:true},content:'把想法整理成一个小计划'},{type:'checkListItem',props:{checked:true},content:'给每位伙伴安排清晰的任务'},{type:'checkListItem',props:{checked:false},content:'打磨第一个能分享的版本'},{type:'checkListItem',props:{checked:false},content:'收集反馈，然后继续生长'},{type:'heading',props:{level:2},content:'留给未来的自己'},{type:'paragraph',content:'不用一下子做完所有事情。知道下一步是什么，就已经很棒了。'}]})
 const knowledge=await p('page.create',{title:'我们的小小知识库',color:'white',icon:'📚',blocks:[{type:'heading',props:{level:2},content:'让每一次整理，都成为下一次的起点。'},{type:'paragraph',content:'这个空间用来保存项目背景、关键决定、资料链接和可复用的方法。'},{type:'heading',props:{level:2},content:'01  项目手册'},{type:'bulletListItem',content:'我们正在解决什么问题？'},{type:'bulletListItem',content:'哪些约定需要每位伙伴知道？'},{type:'heading',props:{level:2},content:'02  灵感档案'},{type:'bulletListItem',content:'值得回看的设计与表达'},{type:'bulletListItem',content:'还没来得及实现的小点子'},{type:'heading',props:{level:2},content:'03  可复用的方法'},{type:'paragraph',content:'把做过的事留下来，让下一次开始得更轻松。'}]})
 for(const [title,icon] of [['项目背景','🪴'],['会议小记','☕'],['灵感收件箱','💡'],['写作素材','✍️']])await p('page.create',{title,color:'white',icon,blocks:[{type:'paragraph',content:'把值得保留的信息，变成下一次工作的起点。'}]})
 const board=await p('database.create',{title:'本周 · 一起推进',color:'white',view:'board'})
 const recentRecords=[]
 for(const [title,status,priority,icon,cover,summary] of [
 ['整理需求与想法','未开始','中','💡','sunset','把想做的事情收好：面向谁，解决什么问题，先完成哪一步。'],
 ['设计轻盈的首屏','进行中','高','🎨','dusk','留白、字体与按钮层级。让用户第一眼就找到重点。'],
 ['写一段清楚的介绍','进行中','中','✍️','pink','少一点术语，多一点具体的使用场景。写出用户为什么需要它。'],
 ['打磨手机端体验','进行中','高','📱','blue','检查窄屏布局与触控区域，保留完整的标题和关键操作。'],
 ['留下项目记录','已完成','低','📝','sand','把讨论、决定和下一步写下来，让伙伴知道项目走到了哪里。'],
 ['把资料归档','已完成','中','🗂️','paper','给参考资料一个清楚的归处，留下出处和可复用的结论。']]){
  const rec=await p('record.create',{databaseId:board.id,title,color:'white',icon,values:{status,priority},blocks:[{type:'paragraph',content:summary}]})
  await p('page.update',{pageId:rec.id,changes:{cover}});recentRecords.push({...rec,icon,cover})
 }
 const notion=await pluginOpen('mininotion','灵感与计划',1480,1120);await notion.win.locator('.sidebar').waitFor();await p('page.open',{pageId:notes.id});await expect(notion.win.getByRole('textbox',{name:'页面标题'})).toHaveValue(notes.title);await shot('06-笔记-清爽页面',notion.win)
 await p('page.open',{pageId:board.id});await notion.win.locator('.database').waitFor();await shot('06-笔记-任务看板',notion.win)
 await p('settings.set',{changes:{theme:'light'}});await expect(notion.win.locator('html')).toHaveAttribute('data-theme','light');await shot('06-笔记-静谧看板',notion.win)
 await p('page.open',{pageId:knowledge.id});await expect(notion.win.getByRole('textbox',{name:'页面标题'})).toHaveValue(knowledge.title);await shot('09-知识库-静谧',notion.win)
 await p('settings.set',{changes:{theme:'light'}});await shot('09-知识库-清爽',notion.win)
 await notion.win.locator('.sidebar-nav').getByRole('button',{name:'主页',exact:true}).click();await notion.win.locator('.overview').waitFor();await shot('06-笔记-主页',notion.win)
 await expect(notion.win.locator('.recent-card .page-emoji')).toHaveCount(6)
 const icons=await notion.win.locator('.recent-card .page-emoji').allTextContents();assert.equal(new Set(icons).size,6)
 assert.equal(await notion.win.locator('.recent-card .page-default-icon').count(),0)
 const coverStyles=await notion.win.locator('.recent-card .card-preview').evaluateAll(items=>items.map(el=>getComputedStyle(el).backgroundImage));assert.equal(new Set(coverStyles).size,6)
 // Verify GUI picker -> shared Core -> close/reopen persistence.
 await p('page.open',{pageId:recentRecords.at(-1).id});await notion.win.getByRole('button',{name:'更换页面图标'}).click();await notion.win.getByRole('button',{name:'🧭',exact:true}).click()
 await expect.poll(async()=>(await p('page.get',{pageId:recentRecords.at(-1).id})).icon).toBe('🧭')
 await p('page.update',{pageId:recentRecords.at(-1).id,changes:{icon:'🗂️'}})
 const guideline=await p('page.create',{title:'界面设计约定',color:'white',icon:'🎨',blocks:[{type:'heading',props:{level:2},content:'把清楚，放在好看之前。'},{type:'paragraph',content:'我们希望每一页都轻盈、易读，用户不用猜下一步在哪里。'},{type:'heading',props:{level:2},content:'01  留白与层级'},{type:'bulletListItem',content:'一个区域只保留一个最重要的动作。'},{type:'bulletListItem',content:'标题、正文、补充说明需要有明显层次。'},{type:'heading',props:{level:2},content:'02  交互与反馈'},{type:'bulletListItem',content:'点击后及时反馈，失败要告诉用户原因。'},{type:'bulletListItem',content:'缩小窗口时，关键内容和操作仍然完整。'}]})
 for(const [title,icon,body] of [['首屏设计任务','🖥️','首屏的标题与按钮层级，沿用下面的设计约定。'],['移动端检查清单','📱','检查窄屏上的字体、间距和触控区域。'],['设计交接笔记','🖇️','交接时，先确认伙伴读过同一份设计说明。']])await p('page.create',{title,color:'white',icon,blocks:[{type:'paragraph',content:body},{type:'pageLink',props:{pageId:guideline.id,title:guideline.title}}]})
 await p('page.open',{pageId:knowledge.id});await notion.win.locator('.sidebar-nav').getByRole('button',{name:/搜索/}).click();await notion.win.getByRole('textbox',{name:'搜索所有笔记'}).fill('设计')
 await expect.poll(async()=>notion.win.locator('.search-result').count()).toBeGreaterThanOrEqual(4);await shot('12-知识库-全文搜索',notion.win)
 await notion.win.locator('body').press('Escape');await p('page.open',{pageId:guideline.id});await notion.win.locator('.backlinks summary').click();await expect(notion.win.locator('.backlinks button')).toHaveCount(3);await shot('12-知识库-反向链接',notion.win)
 // Restore six decorated recent records and verify after a real plugin reopen.
 for(const rec of recentRecords)await p('page.update',{pageId:rec.id,changes:{icon:rec.icon,cover:rec.cover}})
 await cli('plugin','dismiss',notion.info.id)
 const reopen=await pluginOpen('mininotion','灵感与计划',1480,1120);await reopen.win.locator('.sidebar-nav').getByRole('button',{name:'主页',exact:true}).click();await expect(reopen.win.locator('.recent-card .page-emoji')).toHaveCount(6)
 assert.deepEqual(new Set(await reopen.win.locator('.recent-card .page-emoji').allTextContents()),new Set(recentRecords.map(r=>r.icon)))
 await shot('06-笔记-主页',reopen.win);await shot('12-Notion-六张卡片',reopen.win,'.recent-grid');await cli('plugin','dismiss',reopen.info.id)
 console.log('PASS MiniNotion six distinct saved icons/covers/content; GUI icon change read through CLI; persistent after plugin reopen')

 const hosts=await pluginOpen('cloud-hosts','云主机管家',1360,1040);await hosts.win.locator('#add').waitFor();await shot('02-云管家-主机列表',hosts.win);await cli('plugin','dismiss',hosts.info.id)
 await view('协作现场',['星火创作社'],'white');await cli('session','interrupt','--employee','lead');fs.unlinkSync(path.join(control,'lead.hold-user'))
 fs.writeFileSync(path.join(control,'lead.reply.txt'),'两份示例排期已保存，目前保持暂停。\n\n### 每天 09:00 · 晨间整理\n让小码回看项目待办，先给你一份简短的进度笔记。\n\n### 每周一 10:00 · 项目复盘\n让石头整理项目记录，把值得继续的想法放回计划里。\n\n你可以修改时间、内容和负责的伙伴。启用后，应用运行时会按计划触发。')
 for(const [name,id,days,time] of [['晨间整理 · 示例','front',[1,2,3,4,5,6,7],'09:00'],['项目复盘 · 示例','docs',[1],'10:00']])await as('lead','schedule','create','--spec',JSON.stringify({name,enabled:false,action:{type:'agent',employeeId:id,prompt:'整理项目记录，写一份简短的进度笔记。'},rule:{kind:'weekly',days,time,timezone:'Asia/Shanghai'}}))
 await cli('session','send','--employee','lead','--text','帮我保存一份示例排期：每天九点回看待办，周一十点再做项目复盘。先保持暂停。')
 await expect.poll(async()=>(await cli('session','status','--employee','lead'))[0].busy).toBe(false)
 await resize(1500,1000);await cli('view','open','conversation','--employee','lead');await page.locator('.conversation-dialog').waitFor();await shot('08-定时-对话示例');await shot('08-定时-会话细节',page,'.conversation-chat')
 await cli('view','close');await resize(1740,1500);await view('协作现场',['星火创作社'],'white');await shot('08-静谧-办公室')
 await resize(1740,1500);await view('我的项目',['星火创作社','两位好搭档','Web Studio','产品实验室'],'white');await shot('04-项目-多视图')
 await view('插件空间',['灵感与计划','阅读研究室','云主机管家'],'white');await shot('10-插件-静谧')
 await view('所有项目',groups,'white');await shot('04-项目-总览')
 // Each publication image below is a distinct feature/state, never another crop of the same frame.
 await resize(1500,1050);await cli('view','open','conversation','--employee','engine-codex');await page.getByRole('button',{name:'打开斜杠命令'}).click();await page.getByRole('listbox',{name:'斜杠命令'}).waitFor();await shot('12-Codex-斜杠命令');await page.locator('.composer textarea').fill('');await cli('view','close')
 await cli('session','interrupt','--employee','engine-claude');await cli('session','send','--employee','engine-claude','--text','帮我把小站的下一步整理好，用 Markdown 排版，列出负责人和验收重点。')
 await cli('view','open','conversation','--employee','engine-claude');await expect(page.locator('.conversation-chat')).toContainText('交接时记住');await shot('12-Claude-Markdown交接');await cli('view','close')
 await view('我的项目',['星火创作社','两位好搭档','Web Studio','产品实验室'],'white');await page.getByRole('button',{name:'编辑当前视图'}).click();await page.getByRole('dialog',{name:'编辑视图'}).waitFor();await shot('12-视图-挑选团队');await page.getByRole('button',{name:'关闭视图编辑'}).click()
 await cli('team-view','select','all');await cli('settings','set','--team-overview','on');await cli('canvas','set','--x','-120','--y','-400','--zoom','.42');await page.locator('.canvas-overview').waitFor();await shot('12-视图-定位索引');await cli('settings','set','--team-overview','off')
 await cli('session','enqueue','--employee','front','--text','当前检查结束后，再复核手机端的按钮间距。');await cli('session','enqueue','--employee','front','--text','最后把发现的问题整理成一份交接清单。')
 await cli('view','open','conversation','--employee','front');await page.getByLabel('待发送消息').waitFor();await expect(page.locator('.pending-messages>div')).toHaveCount(2);await shot('12-会话-任务排队');await cli('view','close')
 await cli('view','open','conversation','--employee','handoff');await cli('view','shared','on');await page.locator('.shared-files [data-file="本周笔记.txt"] .file-open').click();await page.locator('.shared-files textarea').fill('本周的交接笔记\n\n已完成\n· 整理产品需求和首屏文案\n· 对齐下一版的设计方向\n\n接下来\n· 复核移动端按钮间距\n· 把测试反馈交给前端伙伴\n\n下周见，继续把小站打磨好。');await page.locator('.shared-files').getByRole('button',{name:'保存文件',exact:true}).click();await expect.poll(async()=>(await cli('workspace','read','本周笔记.txt','--shared')).content).toContain('下周见')
 await shot('12-中转站-TXT已保存')
 const transfer=await cli('transfer','start','--from',JSON.stringify({shared:true,path:'发布清单.md'}),'--to',JSON.stringify({employee:'handoff',path:'交付'}));await expect.poll(async()=>(await cli('transfer','get',transfer.id)).state).toBe('completed')
 assert.equal(fs.readFileSync(path.join(front.cwd,'交付','发布清单.md'),'utf8'),fs.readFileSync(path.join(shared,'发布清单.md'),'utf8'))
 await cli('view','shared','off');await page.locator('.employee-files [data-file="交付"] .file-open').click();await page.locator('.employee-files [data-file="交付/发布清单.md"] .file-open').click();await shot('12-中转站-交付已到达');await cli('view','close')
 const scheduleCard=await cli('card','create','--title','晨间整理员','--group','文件接力站','--avatar','dewey','--engine','codex','--model','gpt-6-luna','--effort','low');fs.writeFileSync(path.join(control,scheduleCard.id+'.hold-user'),'')
 const once=await cli('schedule','create','--name','整理进度笔记 · 演示','--employee',scheduleCard.id,'--prompt','整理今天的项目记录，生成一份简短的进度笔记。','--every-seconds','3600','--paused');const run=await cli('schedule','run',once.id)
 await expect.poll(async()=>(await cli('session','status','--employee',scheduleCard.id))[0].busy).toBe(true)
 fs.writeFileSync(path.join(control,scheduleCard.id+'.stream.txt'),'正在整理今天的项目记录：先回看待办，再把需要继续的事情写清楚。')
 await cli('view','open','conversation','--employee',scheduleCard.id);await expect(page.locator('.task-provenance')).toContainText('定时任务');await expect(page.locator('.conversation-chat')).toContainText('正在整理今天');await shot('12-定时-真实派发状态')
 await cli('workspace','write','晨间进度.md','--employee',scheduleCard.id,'--content','# 晨间进度 · 示例\n\n## 今天先做这三件事\n\n1. 复核昨天留下的界面问题。\n2. 整理两条需要确认的反馈。\n3. 把发布素材和项目笔记归档。\n\n## 需要你决定\n\n优先打磨移动端体验，还是先发布一个预览版？\n\n这是隔离演示工作区中的文档，由捕捉脚本通过 CLI 写入。')
 fs.unlinkSync(path.join(control,scheduleCard.id+'.hold-user'));await expect.poll(async()=>(await cli('schedule','history',once.id)).find(r=>r.id===run.id)?.status).toBe('succeeded')
 await page.locator('.employee-files [data-file="晨间进度.md"] .file-open').click();await shot('12-定时-结果文档');await cli('view','close')
 const reader=(method,params={})=>plugin('margin-reader','阅读研究室',method,params)
 await reader('fs.write',{path:'设计中的留白.md',content:'# 设计中的留白\n\n让内容呼吸，让重点被看见。\n\n## 第一章：少一点，清楚一点\n\n当一个页面有太多东西在争抢注意力，用户就很难知道从哪里开始。留白不是空着，而是在替内容分配优先级。\n\n## 第二章：给阅读一条路线\n\n先让标题说清楚问题，再用正文展开细节。每个段落只讲一件事，让前后内容自然接上。\n\n## 第三章：把节奏留给读者\n\n行距、段落间距和标题之间的距离，都在提醒读者何时停顿、何时继续。\n\n## 阅读笔记\n\n把最重要的一句话留下来，下一次打开时，就知道自己为什么保存了这篇文章。'})
 await reader('document.open',{path:'设计中的留白.md'})
 const reading=await pluginOpen('margin-reader','阅读研究室',1500,1120);await reading.win.getByText('设计中的留白.md',{exact:true}).first().click();await expect(reading.win.locator('body')).toContainText('给阅读一条路线');await shot('12-插件-阅读空间',reading.win);await cli('plugin','dismiss',reading.info.id)
 await view('插件空间',['灵感与计划','阅读研究室','云主机管家'],'white');await cli('view','open','team','--mode','work','--plugin','mininotion');await page.getByRole('button',{name:/Work · 插件/}).click();await page.locator('input[name="team-name"]').fill('我的灵感工作室');await page.locator('select[name="team-plugin"]').locator('..').getByRole('button').click();await page.getByRole('listbox').waitFor();await shot('12-插件-选择工作工具');await cli('view','close')

 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 fs.writeFileSync(path.join(output,'_制作脚本','截图清单.json'),JSON.stringify({appVersion:await app.evaluate(({app})=>app.getVersion()),capturedAt:new Date().toISOString(),disclosure:'所有界面均由已安装 App 和插件实际渲染；工作区、对话及连接状态使用隔离的演示数据。无真实模型计费、无真实云主机调用。',shots},null,2))
 console.log('CAPTURE COMPLETE '+shots.length)
}catch(error){console.error(lastLog.slice(-3500));await page.screenshot({path:path.join(raw,'_capture-error.png'),scale:'css'}).catch(()=>{});throw error}
finally{clearInterval(focusTimer);for(const response of pending)response.end();await app.close();model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
