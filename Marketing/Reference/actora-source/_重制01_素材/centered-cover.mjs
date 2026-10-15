// Re-render the installed product UI from an isolated, static demonstration scene.
// No production teams, credentials, cloud connections or model calls are used.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {auditLines} from '../_制作脚本/audit-lines.mjs'
const root=path.resolve(import.meta.dirname,'../..'),output=path.resolve(import.meta.dirname,'..'),folder=path.join(output,'01_我给AI开了家公司'),run=promisify(execFile),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-centered-cover-'))),home=path.join(temp,'state'),projects=path.join(temp,'projects'),audit=path.join(import.meta.dirname,'中心布局逐线验收')
fs.mkdirSync(home);fs.mkdirSync(projects)
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1920'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','ELECTRON_RUN_AS_NODE'].includes(key))delete env[key]
const groups=[],rooms={},teamRoots={},teamSettings={},sessions=[],settings={}
const addTeam=(name,x,y,w,h,theme,os='macos',distribution)=>{
 groups.push(name);rooms[name]={bounds:{x,y,width:w,height:h,shape:'rounded',arrangement:'free',pinned:true},design:{theme,pattern:'grid',scenery:true,plants:true,lamp:false,shelf:false,art:false}}
 const local=path.join(projects,name);fs.mkdirSync(local,{recursive:true})
 const directory=os==='windows'?'C:/Workspace/Quality':'/workspace/'+(distribution||'content')
 teamSettings[name]=os==='macos'?{mode:'build'}:{mode:'cloud',remote:{host:(distribution||os)+'.demo.invalid',os,distribution,directory}}
 teamRoots[name]=os==='macos'?local:directory
}
const center='协作中枢';addTeam(center,1165,1445,560,560,'lavender')
const specs=[
 {name:'Ubuntu · 研发中心',x:0,y:0,theme:'ocean',os:'linux',distribution:'ubuntu',manager:['阿蓝','marmalade','claude'],crew:[['前端开发','byte','codex'],['接口服务','inky','claude'],['代码审查','woodi','codex']]},
 {name:'Windows · 产品测试',x:1770,y:0,theme:'sage',os:'windows',manager:['阿白','codex','codex'],crew:[['自动化测试','wondercube','codex'],['兼容检查','bsod','claude'],['体验评估','seedy','claude']]},
 {name:'Kali · 安全研究',x:0,y:2200,theme:'rose',os:'linux',distribution:'kali',manager:['阿沐','dewey','claude'],crew:[['环境巡检','rocky','codex'],['日志分析','stacky','claude'],['审查报告','woodi','codex']]},
 {name:'macOS · 内容创作',x:1770,y:2200,theme:'amber',os:'macos',manager:['阿森','null-signal','codex'],crew:[['资料整理','seedy','codex'],['文案创作','marmalade','claude'],['设计协作','voltcoin','claude']]}
]
for(const t of specs)addTeam(t.name,t.x,t.y,1120,1250,t.theme,t.os,t.distribution)
function addCard(id,title,group,role,avatar,engine,x,y,creator,native=false){
 const cloud=teamSettings[group].mode==='cloud',local=role!=='employee'||!cloud,cwd=local?path.join(projects,group,title):(teamSettings[group].remote.os==='windows'?path.win32:path.posix).join(teamRoots[group],title)
 if(local)fs.mkdirSync(cwd,{recursive:true})
 const card={id,title,group,cwd,engine,model:engine==='codex'?'gpt-6-luna':'deepseek-flash',effort:'low',kind:native?'cloud-native-worker':'worker',managementRole:role,workEnvironment:local?'local':'team',avatar,position:{x,y},createdAt:Date.now(),createdBy:creator?{kind:'agent',employeeId:creator}:{kind:'operator'},orderIndex:sessions.length,accessMode:'trusted',initialization:{status:'ready',finishedAt:Date.now()}}
 if(cloud&&local)card.localWorkspaceRoot=path.join(projects,group)
 sessions.push(card);return card
}
const governor=addCard('poster-governor','星火',center,'governor','fireball','claude',185,220)
for(const [i,t] of specs.entries()){
 t.lead=addCard('poster-manager-'+i,...[t.manager[0],t.name,'manager',t.manager[1],t.manager[2],465,320,governor.id])
 t.workers=t.crew.map(([title,avatar,engine],j)=>addCard(`poster-employee-${i}-${j}`,title,t.name,'employee',avatar,engine,[80,465,850][j],900,t.lead.id,j===0&&t.os!=='macos'))
}
const id='centered-poster',seed={groups,rooms,teamRoots,teamSettings,sessions,preferences:{theme:'white',sidebarWidth:56,pageZoom:1,snapEmployees:false},teamViews:[{id,name:'AI 公司 · 协作',teams:groups,viewport:{x:50,y:143,zoom:.444}}],activeTeamViewId:id,access:{version:2,revision:0,globalManagerIds:[],relations:[]}}
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(seed))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:30000,maxBuffer:10e6})).stdout);assert.ok(r.ok,r.error);return r.data}
const app=await electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:['--disable-gpu','--force-device-scale-factor=3'],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
try{
 await page.locator('.infinite-canvas').waitFor();await expect(page.locator('.employee')).toHaveCount(17)
 // Presentation-only cleanup; all identities, positions and connector geometry remain actual product data.
 await page.addStyleTag({content:'.team-root-label,.room-dimension,.canvas-hud,.team-health,.sleep-marks{visibility:hidden!important}.employee-state,.activity-bubble{display:none!important}.official-frame{animation:none!important}.management-line{stroke:#7b85bd!important;stroke-width:2.6!important}.management-line-halo{stroke-width:6!important}'})
 // Sixteen independent, rectilinear paths. No shared trunks, no crossing headers or actors.
 const connect=async(source,target,from,to,route)=>cli('connector','set','--manager',source.id,'--employee',target.id,'--source',from.side,'--source-offset',String(from.offset),'--target',to.side,'--target-offset',String(to.offset),'--points',JSON.stringify(route))
 for(const t of specs){
  const left=t.x===0,upper=t.y===0,side=left?'left':'right',offset=upper?.3:.7,s={x:left?185:375,y:220+250*offset},rail=left?-20:580,target={x:t.x+(left?655:465)-1165,y:t.y+445-1445}
  await connect(governor,t.lead,{side,offset},{side:left?'right':'left',offset:.5},[s,{x:rail,y:s.y},{x:rail,y:target.y},target])
  for(let j=0;j<3;j++){
   const offset=[.1,.5,.9][j],sx=465+190*offset,tx=[80,465,850][j]+95,route=j===1?[{x:sx,y:570},{x:tx,y:900}]:[{x:sx,y:570},{x:sx,y:720},{x:tx,y:720},{x:tx,y:900}]
   await connect(t.lead,t.workers[j],{side:'bottom',offset},{side:'top',offset:.5},route)
  }
 }
 const layout=await cli('office','layout');assert.equal(layout.connections.length,16)
 for(const t of specs){assert.equal(sessions.filter(c=>c.createdBy?.employeeId===t.lead.id).length,3)}
 await page.evaluate(()=>document.fonts.ready)
 await expect.poll(()=>page.locator('.pet-cell').evaluateAll(elements=>Promise.all(elements.map(el=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=getComputedStyle(el).backgroundImage.slice(5,-2)}))).then(xs=>xs.every(Boolean)))).toBe(true)
 const lines=await auditLines(layout,page,audit,'中央Governor-16条连线')
 const candidate=path.join(import.meta.dirname,'中央Governor-封面候选.png');await page.screenshot({path:candidate,animations:'disabled',scale:'device'})
 const evidence={appVersion:await app.evaluate(({app})=>app.getVersion()),createdAt:new Date().toISOString(),candidate,disclosure:'已安装软件的隔离演示场景。没有连接真实云主机、运行模型或修改真实员工。隐藏目录、尺寸、休息符号等摄影辅助信息；连接线由公开 Core API 设置，并与渲染 SVG 逐一比对。',teams:specs.map(t=>({name:t.name,manager:t.lead.title,employees:t.workers.map(w=>w.title)})),governor:governor.title,lines:lines.length,allLinesPassed:true,layout,originalOtherFiles:Object.fromEntries(fs.readdirSync(folder).filter(name=>name!=='01_封面.png').map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name))).digest('hex')]))}
 fs.writeFileSync(path.join(import.meta.dirname,'中央布局验收.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({candidate,lines:lines.length,actors:17,teams:5,dimensions:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}))}))
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
}catch(error){await page.screenshot({path:path.join(import.meta.dirname,'中央布局-检查.png'),scale:'css'}).catch(()=>{});throw error}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
