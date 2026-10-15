import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile),file=path.join(import.meta.dirname,'scene.json'),tokens=new Map()
export const cli=async(...args)=>request(undefined,...args)
async function request(token,...args){let stdout;try{({stdout}=await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...process.env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:90000,maxBuffer:8e6}))}catch(e){stdout=e.stdout;if(!stdout)throw e}const r=JSON.parse(stdout);if(!r.ok)throw Error(r.error);return r.data}
export async function as(id,...args){if(!tokens.has(id))tokens.set(id,(await cli('auth','agent-token',id)).token);return request(tokens.get(id),...args)}
export async function ready(id){const end=Date.now()+180000;while(Date.now()<end){const s=(await cli('session','status','--employee',id))[0];if(s.initialization?.status==='ready')return;if(s.initialization?.status==='failed')throw Error(s.initialization.error);await new Promise(r=>setTimeout(r,1000))}throw Error('Initialization timeout')}
const scene=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {teams:[],employees:[],createdAt:new Date().toISOString()}
const save=()=>fs.writeFileSync(file,JSON.stringify(scene,null,2))
if(!scene.original){scene.original={store:await cli('session','list'),view:await cli('team-view','list'),settings:await cli('settings','get')};scene.offset=Math.max(...(await cli('office','layout')).rooms.map(r=>r.bounds.x+r.bounds.width))+1200;save()}
const specs=[{name:'宣传总部',folder:'总部',theme:'amber',x:580,y:0,w:500,h:530},{name:'产品研发组',folder:'研发',theme:'ocean',x:0,y:700,w:760,h:850},{name:'内容创作组',folder:'创作',theme:'lavender',x:900,y:700,w:760,h:850}]
for(const s of specs){if(!scene.teams.includes(s.name)){const directory='/Users/Shared/AI公司/'+s.folder;fs.mkdirSync(directory,{recursive:true});await cli('group','add',s.name,'--mode','build','--directory-mode','bind','--root',directory);scene.teams.push(s.name);save()}await cli('room','design',s.name,'--theme',s.theme,'--pattern','plain','--scenery','on','--plants','on','--lamp','on','--shelf','off','--art','off')}
async function hire(parent,title,team,role,avatar,engine='claude'){
 let c=scene.employees.find(c=>c.title===title&&c.group===team)
 if(!c){const args=['card','create','--title',title,'--group',team,'--management-role',role,'--engine',engine,'--model',engine==='claude'?'deepseek-flash':'gpt-6-luna','--effort','low','--avatar',avatar];const result=await(parent?as(parent,...args):cli(...args));c={id:result.id,title,group:team,role,engine,cwd:result.cwd};scene.employees.push(c);save();console.log('Created '+title+' / '+role)}await ready(c.id);return c
}
const governor=await hire(null,'星火','宣传总部','governor','fireball')
const dev=await hire(governor.id,'阿蓝','产品研发组','manager','codex'),content=await hire(governor.id,'橘子','内容创作组','manager','marmalade')
await hire(dev.id,'开发','产品研发组','employee','byte','codex');await hire(dev.id,'测试','产品研发组','employee','woodi')
await hire(content.id,'写作','内容创作组','employee','dewey');await hire(content.id,'校对','内容创作组','employee','inky','codex')
for(const s of specs){await cli('room','bounds',s.name,'--x',String(scene.offset+s.x),'--y',String(s.y),'--width','1100','--height','1100','--arrangement','free');const members=scene.employees.filter(c=>c.group===s.name);for(let i=0;i<members.length;i++){const p=members.length===1?[155,190]:i===0?[285,200]:i===1?[110,540]:[460,540];await cli('card','place',members[i].id,'--x',String(p[0]),'--y',String(p[1]),'--snap','off')}await cli('room','bounds',s.name,'--x',String(scene.offset+s.x),'--y',String(s.y),'--width',String(s.w),'--height',String(s.h))}
if(!scene.viewId){const v=await cli('team-view','create','--name','宣传 · 第一篇','--teams',JSON.stringify(scene.teams));scene.viewId=v.id??v.views?.find(v=>v.name==='宣传 · 第一篇')?.id;if(!scene.viewId)throw Error('Missing view ID: '+JSON.stringify(v));save()}
await cli('team-view','select',scene.viewId)
await cli('settings','set','--theme','white','--page-zoom','1')
await cli('canvas','set','--view',scene.viewId,'--x',String(150-scene.offset*.53),'--y','50','--zoom','.53')
scene.layout=await cli('office','layout','--view',scene.viewId);save();console.log(JSON.stringify({viewId:scene.viewId,teams:scene.teams,employees:scene.employees.length}))
