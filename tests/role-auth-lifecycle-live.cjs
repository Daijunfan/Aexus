// Exercise real cookie/CSRF handling across existing sessions, windows and Core instances.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('../AgentBoard/Aexus/node_modules/playwright');
const {verifyRevocation}=require('./role-auth-revocation.cjs');
const backend=process.env.CLOUD_HOSTS_TEST_BACKEND||path.resolve(__dirname,'../artifacts/Aexus.app/Contents/Resources/backend');
const backendRelease=(()=>{try{return JSON.parse(fs.readFileSync(path.join(backend,'release.json'),'utf8'))}catch{return null}})();
const out=process.env.CLOUD_HOSTS_AUTH_OUT||path.resolve(__dirname,'../artifacts/full-acceptance-20261015');fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),children=[],homes=[],checks=[],failures=[],notes={};let browser,context;
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const r=await fn();if(r)return r;await delay(80)}throw Error('Timeout waiting for hosted authentication')}
async function start(){const home=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-auth-ui-'));homes.push(home);const child=spawn(process.env.CLOUD_HOSTS_TEST_NODE||path.join(path.dirname(backend),'node'),[backend+'/cli.cjs','serve'],{env:{...process.env,CLOUD_HOSTS_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(home,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(home,'work')},stdio:'ignore'});children.push(child);const s=await until(()=>{try{return JSON.parse(fs.readFileSync(path.join(home,'server.json')))}catch{return null}});return s}
async function frame(page){await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready,null,{timeout:45000});return (await page.locator('iframe').elementHandle()).contentFrame()}
const rpc=(f,cmd,args={})=>f.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args});
async function open(s){const p=await context.newPage();p.tokens=[];p.on('response',async r=>{if(r.status()>=400&&r.url().includes('/api/')){const body=await r.json().catch(()=>({}));if(r.status()!==401)failures.push({status:r.status(),route:new URL(r.url()).pathname,code:body.code,error:body.error})}});p.on('request',r=>{const token=r.headers()['x-agents-csrf'];if(token&&r.url().includes('/api/'))p.tokens.push(token)});await p.goto(s.url);await p.locator('#role-board-mode').click();await frame(p);return p}
/** The Core origin, browser client and instance-scoped cookie of one hosted window. */
async function window_(page){const origin=new URL((await frame(page)).url()).origin,port=new URL(origin).port,clientId=await page.evaluate(()=>window.cloudHosts.roleBoard.clientId),cookie=(await context.cookies(origin)).find(value=>value.name==='agents_company_session_'+port+'_'+crypto.createHash('sha256').update(clientId).digest('hex').slice(0,12));return {origin,cookie,clientId,token:page.tokens.at(-1)}}
const pass=name=>{checks.push(name);console.log('PASS '+name)};
(async()=>{try{
 const a=await start();browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1360,height:1000}});const p=await open(a);await rpc(await frame(p),'group.add',{name:'Auth persisted team'});pass('Cold startup can create a Team');
 for(let i=0;i<4;i++){await p.locator('#agent-board-mode').click();await p.locator('.agent-grid').waitFor();await p.locator('#role-board-mode').click();await rpc(await frame(p),'settings.set',{showTeamOverview:!!(i%2)});await p.reload();await rpc(await frame(p),'group.list')}
 pass('Existing cookies survive repeated board reentry and window reload');
 // Two browser windows must not replace each other's hosted login cookie.
 const q=await open(a);await rpc(await frame(q),'group.add',{name:'Second window team'});await rpc(await frame(p),'group.rename',{name:'Auth persisted team',nextName:'First window still writable'});await rpc(await frame(q),'settings.set',{showTeamOverview:true});pass('Two windows maintain independently authorized writable sessions');
 const b=await start(),r=await open(b);await rpc(await frame(r),'group.add',{name:'Second Core team'});await rpc(await frame(p),'group.list');await rpc(await frame(q),'settings.set',{showTeamOverview:false});assert.deepEqual(await rpc(await frame(r),'group.list'),['Second Core team']);pass('Two localhost Core instances do not overwrite each other’s session cookies');
 // A request must carry this window's own CSRF token, browser client and session cookie.
 const w=await window_(p),wq=await window_(q),own=(value,cookie=value.cookie)=>cookie&&cookie.name+'='+cookie.value;
 const attempt=async(csrf,client=w.clientId,cookie=own(w))=>{const response=await fetch(`${w.origin}/api/rpc`,{method:'POST',headers:{Origin:w.origin,...(cookie?{Cookie:cookie}:{}),'content-type':'application/json','x-agents-client':client,...(csrf===undefined?{}:{'x-agents-csrf':csrf})},body:JSON.stringify({cmd:'group.list',args:{}})});return response.status};
 assert.ok(w.cookie&&w.clientId&&w.token&&wq.cookie&&wq.token,'both hosted windows hold their own instance-scoped cookie, client id and CSRF token');
 assert.equal(await attempt(w.token),200);
 assert.equal(await attempt(undefined),403,'a write without a CSRF token is refused');
 assert.equal(await attempt(''),403,'an empty CSRF token is refused');
 assert.equal(await attempt(wq.token),403,'another window CSRF token is refused');
 assert.equal(await attempt(w.token,'short'),400,'an invalid browser client is refused');
 assert.equal(await attempt(w.token,w.clientId,own(wq)),401,'another window session cookie is refused');
 pass('A request without this window CSRF token, client or cookie is refused');
 // Signing out on the Core host revokes the session; only the owning host can
 // authorize another one, and the running view keeps its place.
 notes.revocation=await verifyRevocation({page:p,frame:await frame(p),context,origin:w.origin,clientId:w.clientId,csrf:w.token,call:rpc});
 pass('A revoked window is re-authorized by its host and resumes the same view without replaying a write');
 await q.close();for(let i=0;i<3;i++){await p.reload();await rpc(await frame(p),'settings.set',{showTeamOverview:!!(i%2)})}pass('Closing one window leaves the remaining session writable');
 assert.deepEqual(failures,[]);fs.writeFileSync(path.join(out,'role-auth-lifecycle.json'),JSON.stringify({passed:true,checks,failures,notes,backend,version:backendRelease&&backendRelease.version,buildId:backendRelease&&backendRelease.buildId},null,2));
}catch(e){fs.writeFileSync(path.join(out,'role-auth-lifecycle.json'),JSON.stringify({passed:false,checks,failures,notes,error:e.message,backend,version:backendRelease&&backendRelease.version,buildId:backendRelease&&backendRelease.buildId},null,2));console.error(e.stack);process.exitCode=1}finally{await Promise.race([browser?.close(),delay(5000)]);for(const c of children)c.kill('SIGTERM');await Promise.all(children.map(c=>until(()=>c.exitCode!==null||c.signalCode,10000).catch(()=>c.kill('SIGKILL'))));for(const h of homes)fs.rmSync(h,{recursive:true,force:true})}})().then(()=>process.exit(process.exitCode||0));
