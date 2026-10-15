// Governor hierarchy. Reproducible, hidden-window product photography. All accounts, tasks and workspaces are demonstrations.
// No production employees, credentials, cloud hosts or model endpoints are used.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {auditLines} from './audit-lines.mjs'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const output=path.resolve(import.meta.dirname,'..'),root=path.resolve(output,'..'),raw=path.join(output,'_原始截图')
const manifestFile=path.join(output,'工作场景/场景清单.json'),retained=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null
const persisted=retained?JSON.parse((await run(process.execPath,[root+'/bin/agents','session','list','--json'],{timeout:20000,maxBuffer:8e6})).stdout).data:null
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-showcase-'))),state=path.join(temp,'state'),control=path.join(temp,'control'),projects=path.join(temp,'projects'),work=path.join(temp,'work'),shared=path.join(temp,'shared'),tunnel=path.join(temp,'tunnel')
for(const dir of [state,control,projects,work,shared,tunnel,path.join(temp,'claude'),path.join(temp,'codex')])fs.mkdirSync(dir,{recursive:true})
fs.mkdirSync(raw,{recursive:true});fs.writeFileSync(path.join(control,'release-all'),'')
const remoteBridge=`import json,sys\nr=json.load(sys.stdin)\nt=r['target']\nprint(json.dumps({'connected':True,'info':'Demonstration connection','environment':{'os':t.get('os','linux'),'distribution':t.get('distribution','ubuntu'),'distributionName':'Demo environment'}}))\n`
fs.writeFileSync(path.join(tunnel,'bridge.py'),remoteBridge)
for(const name of ['terminal.py','transport.py','agents_client.py'])fs.copyFileSync(path.join(root,'Modules/Tunnel',name),path.join(tunnel,name))
const transport=path.join(tunnel,'demo-mcp.cjs')
fs.writeFileSync(transport,`const path=require('path'),rl=require('readline').createInterface({input:process.stdin});const target=JSON.parse(process.argv[2]),p=target.os==='windows'?path.win32:path.posix;rl.on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result={};if(m.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'demonstration-only',version:'1'}};else if(m.method==='tools/list')result={tools:[]};else if(m.method==='tools/call'){const a=m.params.arguments,operation=a.operation,args=a.args||{};const value=operation==='directory'?{path:p.resolve(target.directory,args.path||'.')}:{entries:[]};result={content:[{type:'text',text:JSON.stringify(value)}]}};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n')});`,{mode:0o755})
fs.writeFileSync(path.join(tunnel,'bridge.py'),`import json,sys,os\nrequest=json.load(sys.stdin); t=request['target']\nif sys.argv[1]=='prepare':\n print(json.dumps({'cwd':${JSON.stringify(state)},'args':[],'server':{'command':${JSON.stringify(process.execPath)},'args':[${JSON.stringify(transport)},json.dumps(t)]},'instructions':'Demonstration fixture. No remote commands are executed.'}))\nelse:\n print(json.dumps({'connected':True,'info':'Demonstration only','environment':{'os':t.get('os','linux'),'distribution':'kali' if 'kali' in t['host'] else 'ubuntu'}}))\n`)
const shell=path.join(temp,'demo-shell');fs.writeFileSync(shell,"#!/bin/sh\nexport PS1='workspace $ '\nexec /bin/bash --noprofile --norc -i\n",{mode:0o755})
const codex=path.join(import.meta.dirname,'demo-codex.cjs')
// Use the repository's protocol fixture: the source is saved alongside the photography scripts.
let fixture=fs.readFileSync(path.join(root,'test/fixtures/initialization-codex.cjs'),'utf8').replace("displayName:'Fixture'","displayName:'GPT-6 Luna'")
fixture=fixture.replace("const streamFile=path.join(control,employee+'.stream.txt')",`const stageFile=path.join(control,employee+'.stage.json')
        if(!hidden&&fs.existsSync(stageFile)&&!streamed){const stage=JSON.parse(fs.readFileSync(stageFile,'utf8'));if(stage.kind==='thinking'){event('item/reasoning/summaryTextDelta',{threadId:thread,turnId:turn,itemId:'thinking',delta:stage.text});streamed='stage'}else if(stage.kind==='tool'){event('item/started',{threadId:thread,turnId:turn,item:{id:'work',type:'commandExecution',command:stage.text}});streamed='stage'}}
        const streamFile=path.join(control,employee+'.stream.txt')`)
fs.writeFileSync(codex,fixture,{mode:0o755})
const nativeMap=path.join(temp,'native-map.json');fs.writeFileSync(nativeMap,'{}')
// A protocol fixture replaces SSH only in this isolated photography process. No host is contacted.
fs.writeFileSync(path.join(tunnel,'agent_process.py'),`import sys,signal,json,base64,os\nif sys.argv[1]=='gateway':\n print('Allocated port 54321',file=sys.stderr,flush=True)\n signal.pause()\nelif sys.argv[1]=='access-bootstrap':\n sys.stdin.read()\nelse:\n encoded=sys.argv[1]; p=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))\n if p['engine']!='codex': raise RuntimeError('Only native Codex protocol is stubbed for photography')\n if '--version' in p['args']: print('codex isolated-photo-fixture'); sys.exit(0)\n if p['args'][:2]==['login','status']: print('Logged in (isolated fixture)'); sys.exit(0)\n ids=json.load(open(${JSON.stringify(nativeMap)})); env=os.environ.copy(); env['AGENTS_COMPANY_EMPLOYEE']=ids.get(p['target']['directory'],'native-catalog')\n os.execve(${JSON.stringify(process.execPath)},[${JSON.stringify(process.execPath)},${JSON.stringify(codex)}]+p['args'],env)\n`)

// A loopback-only response fixture supplies example Claude dialogue; never a provider request.
const pending=new Set(),model=http.createServer(async(req,res)=>{
 let body='';for await(const part of req)body+=part
 if(req.url.includes('count_tokens')){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":1}');return}
 if(!req.url.includes('messages')){res.writeHead(404).end();return}
 const data=JSON.parse(body),last=JSON.stringify(data.messages?.filter(m=>m.role==='user').at(-1)?.content??''),hidden=last.includes('private initialization')
 const answer=hidden?'OK':last.includes('文案')?'我在整理首页文案，先把重点写得更简洁。':last.includes('测试')?'正在逐项检查交互，先确认主要流程。':'正在整理资料，稍后把结果放进项目笔记。'
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

team('决策中枢',1020,1085,430,530)
// [title, engine, pet, execution mode, rest]. Three to five subordinates per Manager.
let specs=[
 {name:'Web 研发部',os:'linux',distribution:'ubuntu',key:'ubuntu',x:0,y:0,manager:[385,190],engine:'claude',avatar:'marmalade',lead:'橘子',positions:[[75,480],[695,480],[75,755]],crew:[['小码','codex','byte','native'],['文文','claude','woodi','routed',true],['阿石','codex','stacky','local']]},
 {name:'产品体验部',os:'windows',key:'windows',x:1510,y:0,manager:[385,190],engine:'codex',avatar:'codex',lead:'阿白',positions:[[75,480],[695,480],[75,755],[695,755]],crew:[['阿蓝','codex','dewey','native'],['小墨','claude','inky','routed'],['阿狸','codex','marmalade','local',true],['布丁','claude','wondercube','routed']]},
 {name:'研究实验室',os:'linux',distribution:'kali',key:'kali',x:0,y:1645,manager:[385,190],engine:'claude',avatar:'dewey',lead:'阿沐',positions:[[75,480],[695,480],[75,755],[695,755],[75,1030]],crew:[['火苗','codex','fireball','native'],['墨墨','claude','inky','routed'],['木木','claude','woodi','local',true],['方糖','codex','wondercube','routed'],['小字','codex','byte','native']]},
 {name:'内容创作部',os:'macos',key:'macos',x:1510,y:1645,manager:[385,190],engine:'codex',avatar:'stacky',lead:'阿森',positions:[[75,480],[695,480],[75,755]],crew:[['写写','claude','marmalade','local'],['点点','codex','byte','local'],['皮皮','claude','woodi','local']]}
]
if(retained)specs=retained.specs.map((spec,i)=>({...spec,key:['ubuntu','windows','ubuntu-research','macos'][i],manager:[385,190],positions:[[75,480],[695,480],[75,755],[695,755],[75,1030]]}))
for(const t of specs)team(t.name,t.x,t.y,960,t.crew.length===5?1330:1055,t.os==='macos'?{mode:'build'}:{mode:'cloud',remote:{host:t.key+'.demo.invalid',user:'studio',os:t.os,distribution:t.distribution,directory:t.os==='windows'?'C:/Studio':'/workspace/'+t.key}})
const seed={groups,sessions:[],rooms,teamRoots,teamSettings,preferences:{theme:'white',sidebarWidth:64,pageZoom:1,snapEmployees:false},viewport:{x:40,y:30,zoom:.75},access:{version:2,revision:0,globalManagerIds:[],relations:[]}}
if(retained){
 const ids=new Set(retained.employees.map(e=>e.id));assert.ok(persisted&&persisted.sessions,'Open the main App or run agents serve before photographing the retained scene')
 seed.sessions=persisted.sessions.filter(e=>ids.has(e.id)).map(original=>{
  const c=structuredClone(original),remote=teamSettings[c.group].mode==='cloud'&&c.workEnvironment!=='local';
  for(const key of ['threadId','claudeSessionId','nativeConfigRoot','nativeId','nativeOrigin','nativeSessions','nativeOwnership','remote','workspaceError','lastReply','localWorkspaceRoot','initialization'])delete c[key]
  c.initialization={status:'ready',finishedAt:Date.now()};c.model=c.engine==='codex'?'gpt-6-luna':'claude-sonnet-4-6';c.directoryMode='bind';
  const base=remote?teamRoots[c.group]:path.join(projects,c.group);c.cwd=remote?(teamSettings[c.group].remote.os==='windows'?path.win32.join(base,c.title):path.posix.join(base,c.title)):path.join(base,c.title)
  if(!remote){fs.mkdirSync(c.cwd,{recursive:true});if(teamSettings[c.group].mode==='cloud')c.localWorkspaceRoot=base}
  return c
 });assert.equal(seed.sessions.length,20)
 for(const name of groups)seed.rooms[name]=structuredClone(persisted.rooms[name])
 seed.connectorAnchors=Object.fromEntries(Object.entries(persisted.connectorAnchors??{}).filter(([,v])=>ids.has(v.managerId)&&ids.has(v.employeeId)))
 const photoHosts=[]
 for(const [index,name] of groups.entries())if(teamSettings[name].mode==='cloud'){
  const remote=teamSettings[name].remote,host={id:`photo-host-${index}`,name,host:`studio@${remote.host}`,os:remote.os,distribution:remote.distribution,defaultDirectory:remote.directory,createdAt:1,updatedAt:1,hasPassword:false};photoHosts.push(host)
  seed.teamSettings[name]={mode:'cloud',hostId:host.id,directory:remote.directory}
  for(const card of seed.sessions.filter(c=>c.group===name&&c.kind==='cloud-native-worker'))card.nativeOrigin={kind:'cloud',hostId:host.id,host:host.host,os:host.os,directory:card.cwd}
 }
 fs.mkdirSync(path.join(state,'cloud-hosts'),{recursive:true});fs.writeFileSync(path.join(state,'cloud-hosts/hosts.json'),JSON.stringify(photoHosts))
}
fs.writeFileSync(path.join(state,'sessions.json'),JSON.stringify(seed))
const app=await electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:['--disable-gpu'],env,timeout:30000}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const timers=[],shots=[],receipts=[]
let lastLog='';app.process().stderr.on('data',data=>lastLog=(lastLog+data).slice(-18000))
const rawCall=async(token,args)=>{let out;try{out=(await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env:{...env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:30000,maxBuffer:8e6})).stdout}catch(e){out=e.stdout;if(!out)throw e}return JSON.parse(out)}
const cli=async(...args)=>{const result=await rawCall(null,args);if(!result.ok)throw Error(result.error);return result.data}
const tokens=new Map();const as=async(id,...args)=>{if(!tokens.has(id))tokens.set(id,(await cli('auth','agent-token',id)).token);const result=await rawCall(tokens.get(id),args);if(!result.ok)throw Error(result.error);receipts.push({caller:id,command:args[0]+'.'+args[1],...(args.includes('--employee')?{target:args[args.indexOf('--employee')+1]}:{}),accepted:true});return result.data}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const until=async(fn,label)=>{for(let i=0;i<200;i++){if(await fn())return;await delay(100)}throw Error('Timed out: '+label)}
const status=async(id)=>(await cli('session','status','--employee',id))[0]
const create=async(who,title,group,engine,avatar,role,x,y,execution)=>{
 const args=['card','create','--title',title,'--group',group,'--engine',engine,'--avatar',avatar,'--management-role',role,'--model',engine==='codex'?'gpt-6-luna':'claude-sonnet-4-6','--effort','low','--kind',execution==='native'?'cloud-native-worker':'worker',...(role!=='employee'||execution==='local'?['--work-environment','local']:[])]
 const card=retained?(await cli('session','list')).sessions.find(c=>c.id===retained.employees.find(e=>e.title===title&&e.group===group)?.id):await (who?as(who,...args):cli(...args))
 await until(async()=>{const v=await status(card.id);if(v.initialization?.status==='failed')throw Error(v.initialization.error);return v.initialization?.status==='ready'},'initialization '+title)
 if(!retained)await cli('card','place',card.id,'--x',String(x),'--y',String(y),'--snap','off')
 const mappings=JSON.parse(fs.readFileSync(nativeMap,'utf8'));mappings[card.cwd]=card.id;fs.writeFileSync(nativeMap,JSON.stringify(mappings));cards.push(card);return card
}
const view=async(names,w=1740,h=1500)=>{
 await app.evaluate(({BrowserWindow},{w,h})=>BrowserWindow.getAllWindows()[0].setContentSize(w,h),{w,h})
 const label=names.length===1?names[0]:names.length===groups.length?'跨团队编排':'直接管理员工',v=await cli('team-view','create','--name',label,'--teams',JSON.stringify(names));await cli('team-view','select',v.id);await expect(page.locator('.team-view-tabs [aria-current="page"]')).toHaveText(label);await expect.poll(async()=>(await page.locator('.infinite-canvas').boundingBox())?.width??0).toBeGreaterThan(100);await delay(120)
 const rs=(await cli('office','layout')).rooms.filter(r=>names.includes(r.name)),minX=Math.min(...rs.map(r=>r.bounds.x)),minY=Math.min(...rs.map(r=>r.bounds.y)),maxX=Math.max(...rs.map(r=>r.bounds.x+r.bounds.width)),maxY=Math.max(...rs.map(r=>r.bounds.y+r.bounds.height)),box=await page.locator('.infinite-canvas').boundingBox(),zoom=Math.min(1.35,(box.width-90)/(maxX-minX),(box.height-80)/(maxY-minY))
 await cli('canvas','set','--x',String((box.width-(maxX-minX)*zoom)/2-minX*zoom),'--y',String(35-minY*zoom),'--zoom',String(zoom));await delay(200)
}
const shot=async(name,selector)=>{await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await delay(400);const file=path.join(raw,name+'.png');await(selector?page.locator(selector):page).screenshot({path:file,scale:'css',animations:'disabled'});shots.push({name,file:path.relative(output,file)});console.log('CAPTURE '+name)}
const hold=async(from,to,text)=>{fs.writeFileSync(path.join(control,to.id+'.hold-user'),'');const reply=await(from?as(from,'session','send','--employee',to.id,'--text',text):cli('session','send','--employee',to.id,'--text',text));assert.ok(reply.messageId);await until(async()=>(await status(to.id)).busy,'busy '+to.title)}
const focus=async(from,to)=>{await as(from,'session','info','--employee',to);timers.push(setInterval(()=>as(from,'session','info','--employee',to).catch(()=>{}),650))}
try{
 await page.locator('.infinite-canvas').waitFor()
 await page.addStyleTag({content:'.team-root-label,.room-dimension,.canvas-hud,.terminal-location,.session-settings .cwd{visibility:hidden!important}.employee-state{opacity:0!important}.activity-bubble{display:none!important}'})
 const governor=await create(null,'火火','决策中枢','codex','fireball','governor',120,210)
 const leads=[]
 for(const t of specs){
  const lead=await create(governor.id,t.lead,t.name,t.engine,t.avatar,'manager',...t.manager);leads.push(lead);t.leadCard=lead
  t.cards=[];for(let i=0;i<t.crew.length;i++){const [title,engine,avatar,execution,rest]=t.crew[i];const c=await create(lead.id,title,t.name,engine,avatar,'employee',...t.positions[i],execution);t.cards.push({...c,demoRest:!!rest})}
 }
 const store=await cli('session','list');assert.equal(store.sessions.length,20)
 for(const t of specs){const lead=store.sessions.find(c=>c.id===t.leadCard.id);assert.equal(lead.createdBy.employeeId,governor.id);assert.equal(lead.remote,null);assert.equal(lead.workEnvironment,'local');for(let i=0;i<t.cards.length;i++){const found=store.sessions.find(c=>c.id===t.cards[i].id);assert.equal(found.createdBy.employeeId,lead.id);assert.equal(!!found.remote,t.crew[i][3]!=='local');assert.equal(found.kind,t.crew[i][3]==='native'?'cloud-native-worker':'worker')}}
 assert.equal((await cli('management','topology')).edges.length,19)
 await hold(null,governor,'协调四个项目团队，让各位 Manager 分工推进 Web 页面、产品体验、研究资料和内容创作。几位暂时没有任务的伙伴可以休息。')
 for(const t of specs){await hold(governor.id,t.leadCard,'请推进今天的示例项目，按每位伙伴的工作空间分配任务。');for(const c of t.cards)if(!c.demoRest)await hold(t.leadCard.id,c,'整理当前项目的资料与文档，记录下一步需要协作的事情。')}
 if(!retained){
 // Final placement is performed through real authenticated layout APIs after creation packing.
 for(const t of specs){
  await as(governor.id,'room','bounds',t.name,'--x',String(t.x),'--y',String(t.y),'--width','1400','--height','1400','--arrangement','free','--shape','rounded')
  await as(governor.id,'card','place',t.leadCard.id,'--x',String(t.manager[0]),'--y',String(t.manager[1]),'--snap','off')
  for(let i=0;i<t.cards.length;i++)await as(t.leadCard.id,'card','place',t.cards[i].id,'--x',String(t.positions[i][0]),'--y',String(t.positions[i][1]),'--snap','off')
  await as(governor.id,'room','bounds',t.name,'--width','960','--height',t.cards.length===5?'1330':'1055')
 }
 await as(governor.id,'room','bounds','决策中枢','--x','1020','--y','1085','--width','430','--height','530','--shape','rounded');await cli('card','place',governor.id,'--x','120','--y','210','--snap','off')
 // Resizing preserves occupied world positions; make the final frame alignment explicit afterwards.
 for(const t of specs)await as(governor.id,'room','bounds',t.name,'--x',String(t.x),'--y',String(t.y))
 await as(governor.id,'room','bounds','决策中枢','--x','1020','--y','1085')
 }
 await delay(1800);await focus(governor.id,leads[1].id)
 await view(groups,1830,2150)
 await until(async()=>(await cli('management','activity')).interactions.length===1,'only one active logical connection')
 await expect(page.locator('.employee[data-state="working"]')).toHaveCount(17);await expect(page.locator('.employee[data-state="sleeping"]')).toHaveCount(3);await expect(page.locator('.cloud-native-foot')).toHaveCount(4)
 const geometry=await cli('office','layout'),actualRoutes=geometry.connections.filter(c=>c.sourceTeam!==c.targetTeam);assert.equal(actualRoutes.length,4);assert.ok(actualRoutes.every(r=>r.status==='routed'));assert.equal(geometry.connections.length,19);assert.ok(geometry.connections.every(c=>c.status==='routed'&&!c.warning))
 await expect(page.locator('.office-connections [data-active="true"]')).toHaveCount(1)
 await auditLines(geometry,page,path.join(output,'逐线验收'),'01-主海报');
 await shot('13-跨Team-中心Governor', '.infinite-canvas');await shot('11-层级-应用总览')
 await view(['决策中枢'],1000,900);await shot('11-层级-Governor工牌',`[data-card-id="${governor.id}"]`)
 for(const timer of timers)clearInterval(timer);timers.length=0
 await view(['决策中枢',specs[1].name],1530,1430);await focus(governor.id,specs[1].cards[0].id)
 await expect(page.locator('.office-connections [data-temporary="true"]')).toHaveCount(1);await auditLines(await cli('office','layout','--view',(await cli('team-view','list')).activeId),page,path.join(output,'逐线验收'),'02-临时交互');await shot('13-跨Team-具体员工', '.infinite-canvas')
 for(const timer of timers)clearInterval(timer);timers.length=0;await focus(governor.id,leads[1].id)
 const finalStatus=await cli('session','status');assert.equal(finalStatus.filter(s=>s.busy).length,17)
 const activity=await cli('management','activity');assert.equal(activity.interactions.length,1);assert.equal(activity.interactions[0].employeeId,leads[1].id)
 await cli('session','interrupt','--employee',governor.id);fs.unlinkSync(path.join(control,governor.id+'.hold-user'))
 fs.writeFileSync(path.join(control,governor.id+'.reply.txt'),'## 四个小队，各自推进\n\n| 项目组 | Manager | 本轮安排 |\n| --- | --- | --- |\n| Web 研发部 · Ubuntu | 橘子 · Claude Code | Web 页面与交接说明 |\n| 产品体验部 · Windows | 阿白 · Codex | 产品资料和待确认问题 |\n| 研究实验室 · Ubuntu | 阿沐 · Claude Code | 研究笔记与参考资料 |\n| 内容创作部 · macOS | 阿森 · Codex | 内容整理与发布准备 |\n\n各队分别有 3、4、5、3 位 Employee。三位暂时没有任务，其余伙伴正在推进示例工作。\n\n这是示例工作区的分工回顾。')
 await cli('session','send','--employee',governor.id,'--view','all','--text','回顾四个项目组的分工，哪些人负责。');await until(async()=>!(await status(governor.id)).busy,'Governor recap')
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1500,1100));await cli('settings','set','--terminal-height','120');await cli('view','open','conversation','--employee',governor.id);await expect(page.locator('.conversation-chat')).toContainText('四个小队，各自推进');await shot('12-Governor-跨团队交接');await cli('view','close')
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 const evidence={retainedViewId:retained?.viewId,retainedEmployeeIds:retained?.employees.map(e=>e.id),appVersion:await app.evaluate(({app})=>app.getVersion()),capturedAt:new Date().toISOString(),disclosure:'已安装应用真实渲染。20 名员工、连接状态和回复均为隔离演示数据；真实 CLI 处理角色、工作区模式、派发、状态和路由。模型/SSH 使用本地协议 fixture，不是实际云主机执行证明，未消费模型额度。跨 Team 路由由 Core/SVG 真实绘制，没有海报装饰连线。',nativeProtocolFixture:true,noRealRemoteExecution:true,roles:store.sessions.map(c=>({id:c.id,title:c.title,team:c.group,role:c.managementRole,engine:c.engine,kind:c.kind,workEnvironment:c.workEnvironment,createdBy:c.createdBy,remoteOS:c.remote?.os})),teamEmployees:specs.map(t=>({name:t.name,os:t.os,distribution:t.distribution,employees:t.cards.length,sleeping:t.cards.filter(c=>c.demoRest).length})),activity,crossTeamConnections:actualRoutes,busyEmployees:17,sleepingEmployees:3,geometry:await cli('office','layout'),receipts,shots}
 fs.writeFileSync(path.join(import.meta.dirname,'层级截图与验证.json'),JSON.stringify(evidence,null,2));console.log('HIERARCHY COMPLETE '+shots.length+' — centered Governor, 4 rectangular Teams, 3/4/5/3 Employees, 17 busy + 3 asleep, 4 native / 5 routed / 6 local Employees, ONE active link')
}catch(error){try{for(const row of await cli('session','status'))if(!row.busy)console.error('IDLE',row.title,row.cardId??row.id,JSON.stringify((await cli('session','transcript','--employee',row.cardId??row.id)).slice?.(-2)??{}))}catch{}console.error(lastLog.slice(-7000));await page.screenshot({path:path.join(raw,'_hierarchy-error.png'),scale:'css'}).catch(()=>{});throw error}
finally{for(const timer of timers)clearInterval(timer);for(const response of pending)response.end();await app.close();model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
