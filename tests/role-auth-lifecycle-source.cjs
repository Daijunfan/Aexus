// Live hosted Role Board authentication against the real source build: the real
// CloudHosts embed, the real Web renderer, real cookies and real Core instances.
// Covers cold start, board re-entry, window reload, two windows in one cookie
// jar, two localhost Core instances, and revocation with host re-authorization.
// Run: node tests/role-auth-lifecycle-source.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {ROOT,startHostedInstance,sourceProvenance}=require('./role-auth-hosted-fixture.cjs')
const {verifyRevocation}=require('./role-auth-revocation.cjs')
const {build:buildWeb}=require(path.join(ROOT,'node_modules/vite'))
const {build:buildEmbed}=require(path.join(ROOT,'node_modules/esbuild'))
const {chromium}=require(path.join(ROOT,'node_modules/playwright'))
const OUT=process.env.CLOUD_HOSTS_AUTH_OUT||path.resolve(__dirname,'../artifacts/claude-manager-20261015')
const provenance=sourceProvenance()
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const checks=[],failures=[],notes={},cores={a:null,b:null};let browser,context,hostA,hostB,temp
const pass=label=>{checks.push(label);console.log('PASS '+label)}
const PAGE=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hosted Role Board</title></head><body>
<nav id="mode-tabs"><button id="agent-board-mode" type="button">Agent Board</button><button id="role-board-mode" type="button">Role Board</button></nav>
<div id="detail"></div>
<script src="/embed.js"></script>
<script>
let mode=null,controller=null
const rpc=async(method,params={})=>{
  const response=await fetch('/host/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,params})})
  const reply=await response.json()
  if(reply.error)throw new Error(reply.error.message||String(reply.error))
  return reply.result
}
function render(){
  if(controller){controller.dispose();controller=null}
  const detail=document.getElementById('detail')
  if(mode==='agent-board'){detail.innerHTML='<div class="agent-workbench"><div class="agent-grid"></div></div>';return}
  if(mode==='role-board'){
    detail.innerHTML='<div class="agent-hub"><nav class="agent-hub-nav"></nav><div class="aexus-embed-content"></div></div>'
    controller=AexusEmbed.aexusEmbed({root:detail.querySelector('.aexus-embed-content'),rpc,message:(text,kind)=>console.log('toast',kind,text)})
    return
  }
  detail.innerHTML=''
}
function setMode(next){mode=next;render()}
document.getElementById('agent-board-mode').onclick=()=>setMode('agent-board')
document.getElementById('role-board-mode').onclick=()=>setMode('role-board')
setMode('role-board')
</script></body></html>`
/** The owning CloudHosts process: serves the host page and signs single-use session tickets. */
function hostPage(embedFile,current){
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1')
    if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(PAGE);return}
    if(req.method==='GET'&&url.pathname==='/embed.js'){res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(embedFile).pipe(res);return}
    if(req.method==='POST'&&url.pathname==='/host/rpc'){
      let body='';for await(const chunk of req)body+=chunk
      const {method,params={}}=JSON.parse(body),origin='http://127.0.0.1:'+server.address().port,core=current()
      const reply=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({result:value}))}
      const deny=(message,code)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({error:{code,message}}))}
      try{
        if(method==='roleboard.runtime'||method==='roleboard.start')
          return reply(core?{status:'ready',url:core.origin,instanceId:core.instanceId}:{status:'stopped',error:'Aexus is not running'})
        if(method==='roleboard.ticket'){
          if(!core||params.instanceId!==core.instanceId)return deny('Aexus instance is not ready','INSTANCE_MISMATCH')
          if(params.parentOrigin!==origin)return deny('Invalid hosted session binding','HOSTED_BINDING_DENIED')
          return reply({ticket:core.ticket({clientId:String(params.clientId),windowId:String(params.windowId)}),expiresAt:Date.now()+20000})
        }
        if(method==='roleboard.native')return reply({})
        return deny('Unsupported host method '+method,'METHOD_DENIED')
      }catch(error){return deny(error.message,'HOST_ERROR')}
    }
    res.writeHead(404);res.end('not found')
  })
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({port:server.address().port,origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(done=>server.close(done))})))
}
async function attached(page){
  await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready===true,null,{timeout:90000})
  const frame=await (await page.locator('iframe').first().elementHandle()).contentFrame()
  await frame.waitForFunction(()=>typeof window.agents?.call==='function',null,{timeout:60000})
  return frame
}
const call=(frame,cmd,args={})=>frame.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
async function openHost(url){
  const page=await context.newPage()
  page.tokens=[]
  page.on('response',async response=>{
    if(response.status()<400||!response.url().includes('/api/'))return
    const body=await response.json().catch(()=>({}))
    if(response.status()!==401)failures.push({status:response.status(),route:new URL(response.url()).pathname,error:body.error})
  })
  page.on('request',request=>{const token=request.headers()['x-agents-csrf'];if(token&&request.url().includes('/api/'))page.tokens.push(token)})
  await page.goto(url)
  return page
}
;(async()=>{try{
  temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-auth-live-source-')))
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),'dir')
  fs.mkdirSync(OUT,{recursive:true})
  const renderer=path.join(temp,'renderer')
  await buildWeb({configFile:path.join(ROOT,'vite.web.config.ts'),build:{outDir:renderer,emptyOutDir:true},logLevel:'silent'})
  const embedFile=path.join(temp,'embed.js')
  await buildEmbed({entryPoints:[path.resolve(__dirname,'../ui/aexus-embed.js')],bundle:true,format:'iife',globalName:'AexusEmbed',outfile:embedFile,logLevel:'silent'})
  hostA=await hostPage(embedFile,()=>cores.a)
  hostB=await hostPage(embedFile,()=>cores.b)
  cores.a=await startHostedInstance({temp,label:'a',renderer,parentOrigin:hostA.origin})
  cores.b=await startHostedInstance({temp,label:'b',renderer,parentOrigin:hostB.origin})
  browser=await chromium.launch({...process.platform==='darwin'?{channel:'chrome'}:{},headless:true})
  context=await browser.newContext({viewport:{width:1360,height:1000}})

  const p=await openHost(hostA.origin)
  let frame=await attached(p)
  await call(frame,'group.add',{name:'Auth persisted team'})
  pass('Cold hosted start authorizes the frame and creates a Team')

  for(let i=0;i<3;i++){
    await p.locator('#agent-board-mode').click()
    await p.locator('.agent-grid').waitFor({state:'attached'})
    await p.locator('#role-board-mode').click()
    frame=await attached(p)
    await call(frame,'settings.set',{showTeamOverview:!!(i%2)})
    await p.reload()
    frame=await attached(p)
    await call(frame,'group.list')
  }
  pass('Repeated board re-entry and window reload keep one authorized session without a CSRF failure')

  const q=await openHost(hostA.origin),qFrame=await attached(q)
  await call(qFrame,'group.add',{name:'Second window team'})
  await call(frame,'group.rename',{name:'Auth persisted team',nextName:'First window still writable'})
  await call(qFrame,'settings.set',{showTeamOverview:true})
  pass('Two windows in one cookie jar stay independently authorized and writable')

  const r=await openHost(hostB.origin),rFrame=await attached(r)
  await call(rFrame,'group.add',{name:'Second Core team'})
  await call(frame,'settings.set',{showTeamOverview:false})
  await call(qFrame,'group.list')
  assert.deepEqual(await call(rFrame,'group.list'),['Second Core team'])
  pass('A second localhost Core instance in the same cookie jar never replaces another instance session')

  // Sign-out on the Core host revokes the session of a mounted window. Only the
  // owning host can authorize another one, and the running view survives.
  notes.revocation=await verifyRevocation({page:p,frame,context,origin:cores.a.origin,clientId:await p.evaluate(()=>window.cloudHosts.roleBoard.clientId),csrf:p.tokens.at(-1),call})
  pass('Revocation is re-authorized by the host and resumes the same view without replaying the refused write')

  await q.close()
  for(let i=0;i<2;i++){await p.reload();frame=await attached(p);await call(frame,'settings.set',{showTeamOverview:!!(i%2)})}
  assert.deepEqual(failures,[])
  pass('Closing one window leaves the remaining session writable with no refused request')

  fs.writeFileSync(path.join(OUT,'role-auth-source-lifecycle.json'),JSON.stringify({passed:true,checks,failures,notes,...provenance},null,2))
}catch(error){
  fs.mkdirSync(OUT,{recursive:true})
  fs.writeFileSync(path.join(OUT,'role-auth-source-lifecycle.json'),JSON.stringify({passed:false,checks,failures,notes,error:error.message,...provenance},null,2))
  console.error(error.stack);process.exitCode=1
}finally{
  await Promise.race([browser?.close(),delay(5000)])
  for(const instance of Object.values(cores))await instance?.close().catch(()=>{})
  await Promise.all([hostA?.close(),hostB?.close()].map(value=>value?.catch(()=>{})))
  await Promise.race([fs.promises.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100}),delay(5000)]).catch(()=>{})
  process.exit(process.exitCode||0)
}})()
