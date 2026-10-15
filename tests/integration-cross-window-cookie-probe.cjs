// Candidate security probe: resolve each hosted window's cookie by its exact
// instance/client name, then assert own credentials work and foreign cookies or
// missing/borrowed CSRF are refused. Both windows share the real browser jar.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {chromium}=require('../AgentBoard/Aexus/node_modules/playwright');
const backend=process.env.CLOUD_HOSTS_TEST_BACKEND||path.resolve(__dirname,'../artifacts/Aexus.app/Contents/Resources/backend');
const backendRelease=(()=>{try{return JSON.parse(fs.readFileSync(path.join(backend,'release.json'),'utf8'))}catch{return null}})();
const node=process.env.CLOUD_HOSTS_TEST_NODE||path.join(path.dirname(backend),'node');
const out=process.env.CLOUD_HOSTS_PROBE_OUT||path.resolve(__dirname,'../artifacts/full-acceptance-20261015/integration');
fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[],notes={};let browser,child,home;
const check=(name,passed,detail)=>{checks.push({name,passed:!!passed,detail:detail===undefined?'':String(detail)});console.log((passed?'PASS ':'FAIL ')+name+(detail?'  ['+detail+']':''))};
const until=async(fn,timeout=45000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(120)}throw Error('timeout')};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,12);
const cookieFor=(jar,clientId,port)=>jar.find(c=>c.name===`agents_company_session_${port}_${digest(clientId)}`);
const own=cookie=>cookie&&cookie.name+'='+cookie.value;

/** One hosted window: the real Role Board, its own client id and its CSRF token. */
async function openWindow(url,tag,context){
  // Both windows must share one browser context: that is the whole point — one
  // cookie jar, several windows, exactly as the product's CloudHosts shell runs.
  const page=await context.newPage();
  page.tokens=[];
  page.on('request',request=>{const token=request.headers()['x-agents-csrf'];if(token&&request.url().includes('/api/'))page.tokens.push(token)});
  await page.goto(url);
  // The Role Board only mounts when its entry is opened, exactly as a user does.
  await page.locator('#role-board-mode').click();
  await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready,[],{timeout:60000});
  const client=await page.evaluate(()=>window.cloudHosts.roleBoard.clientId);
  await until(()=>page.tokens.length>0,30000);
  const frameUrl=new URL(await page.locator('iframe').first().getAttribute('src'),url);
  return {page,client,origin:frameUrl.origin,port:frameUrl.port,token:page.tokens.at(-1),frameUrl:frameUrl.origin+frameUrl.pathname,tag};
}

(async()=>{
 try{
  home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-cross-window-')));
  child=spawn(node,[path.join(backend,'cli.cjs'),'serve'],{env:{...process.env,CLOUD_HOSTS_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(home,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(home,'work')},stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000)});
  const state=await until(()=>{try{return JSON.parse(fs.readFileSync(path.join(home,'server.json')))}catch{return null}},60000);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const a=await openWindow(state.url,'A',context),b=await openWindow(state.url,'B',context);
  notes.clientA=a.client;notes.clientB=b.client;notes.origin=a.origin;

  const jar=await context.cookies(a.origin);
  notes.cookieNames=jar.filter(c=>c.name.startsWith('agents_company_session')).map(c=>c.name);
  const cookieA=cookieFor(jar,a.client,a.port),cookieB=cookieFor(jar,b.client,a.port);
  check('The two hosted windows hold two distinct instance-scoped session cookies',
        Boolean(cookieA)&&Boolean(cookieB)&&cookieA.name!==cookieB.name,
        'A='+(cookieA&&cookieA.name)+' B='+(cookieB&&cookieB.name));
  const rpc=async(csrf,client,cookie)=>{
    const response=await fetch(a.origin+'/api/rpc',{method:'POST',headers:{Origin:a.origin,
      ...(cookie?{Cookie:cookie}:{}),'content-type':'application/json',
      ...(client===undefined?{}:{'x-agents-client':client}),...(csrf===undefined?{}:{'x-agents-csrf':csrf})},
      body:JSON.stringify({cmd:'group.list',args:{}})});
    return response.status;
  };
  const ownA=own(cookieA),ownB=own(cookieB);
  check('A window writes with its own cookie, client id and CSRF token',
        await rpc(a.token,a.client,ownA)===200);
  check('Another window session cookie is refused even with this window client id and CSRF token',
        await rpc(a.token,a.client,ownB)===401,'sent B cookie with A client+csrf -> '+await rpc(a.token,a.client,ownB));
  check('The same is true in the other direction',
        await rpc(b.token,b.client,ownA)===401,'sent A cookie with B client+csrf -> '+await rpc(b.token,b.client,ownA));
  check('The other window keeps working with its own cookie, client id and CSRF token',
        await rpc(b.token,b.client,ownB)===200);
  check('A request with no session cookie is unauthenticated',
        await rpc(a.token,a.client,undefined)===401);
  check('A missing CSRF token is refused',await rpc(undefined,a.client,ownA)===403);
  check('An empty CSRF token is refused',await rpc('',a.client,ownA)===403);
  check('The other window CSRF token is refused',await rpc(b.token,a.client,ownA)===403);
  check('An invalid browser client id is rejected',await rpc(a.token,'short',ownA)===400);

  const bootstrap=async(cookie,client)=>{
    const response=await fetch(a.origin+'/api/bootstrap',{headers:{...(cookie?{Cookie:cookie}:{}),...(client?{'x-agents-client':client}:{})}});
    return response.status;
  };
  check('A window bootstraps with its own cookie and client id',await bootstrap(ownA,a.client)===200);
  check('Another window cookie does not bootstrap this window',await bootstrap(ownB,a.client)===401);
  check('No cookie is unauthenticated',await bootstrap(undefined,a.client)===401);

  fs.writeFileSync(path.join(out,'cross-window-cookie-probe.json'),
    JSON.stringify({passed:checks.every(c=>c.passed),checks,notes,modelCalls:0,backend,version:backendRelease&&backendRelease.version,buildId:backendRelease&&backendRelease.buildId},null,2));
  process.exitCode=checks.every(c=>c.passed)?0:1;
 }catch(error){
  fs.writeFileSync(path.join(out,'cross-window-cookie-probe.json'),
    JSON.stringify({passed:false,checks,notes,error:error.message,backend,version:backendRelease&&backendRelease.version,buildId:backendRelease&&backendRelease.buildId},null,2));
  console.error(error.stack);process.exitCode=1;
 }finally{
  await Promise.race([browser?.close(),delay(5000)]).catch(()=>{});
  if(child){
    // Cleanup is verified, never assumed: SIGTERM, wait, then SIGKILL and wait for
    // the exit, so no isolated Core is left running after the probe ends.
    child.kill('SIGTERM');
    const exited=await until(()=>child.exitCode!==null||child.signalCode,10000).catch(()=>false);
    if(!exited){
      child.kill('SIGKILL');
      const killed=await until(()=>child.exitCode!==null||child.signalCode,10000).catch(()=>false);
      if(!killed)console.error('WARNING: isolated Core pid '+child.pid+' did not exit');
    }
  }
  if(home)fs.rmSync(home,{recursive:true,force:true});
 }
})();
