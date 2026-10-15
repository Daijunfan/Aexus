// A hosted Aexus Core started from source, as the owning CloudHosts process
// starts it: private home, IPC parent, loopback web server and a bridge secret
// that only the host may sign session tickets with.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{randomBytes,randomUUID,createHmac,createHash}=require('node:crypto')
const ROOT=path.resolve(__dirname,'../AgentBoard/Aexus'),{build}=require(path.join(ROOT,'node_modules/esbuild'))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const freePort=async()=>{const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port}
async function startHostedInstance({temp,label,renderer,parentOrigin}){
  const {fixtureCore}=await import(path.join(ROOT,'test/fixtures/headless-core.mjs'))
  const port=await freePort(),instanceId=randomUUID(),secret=randomBytes(32).toString('hex')
  fs.mkdirSync(renderer,{recursive:true})
  // A hosted Core reads the host registry from the owning CloudHosts process.
  const projection=path.join(temp,label+'-host-projection.json')
  fs.writeFileSync(projection,JSON.stringify({schemaVersion:1,source:'cloudhosts',projectionRevision:createHash('sha256').update(label).digest('hex'),hosts:[]}))
  const entry=path.join(temp,label+'-daemon.cjs')
  await build({stdin:{contents:`import{startRuntime}from'./src/main/runtime';import{startWebServer}from'./src/main/web/server';const stop=startRuntime(),web=startWebServer({port:${port},renderer:${JSON.stringify(renderer)}});let closing=false;const shutdown=async()=>{if(closing)return;closing=true;await(await web).close();await stop();process.exit(0)};process.on('message',message=>{if(message?.type==='agents-company:shutdown')void shutdown()});process.once('SIGTERM',()=>void shutdown());void web.catch(error=>{console.error(error.message);process.exit(1)})`,resolveDir:ROOT,sourcefile:label+'-hosted-daemon.ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(ROOT)},logLevel:'silent'})
  const core=await fixtureCore({AGENTS_COMPANY_PACKAGE_ROOT:ROOT,AGENTS_COMPANY_HOSTED:'1',
    AGENTS_COMPANY_HOST_INSTANCE_ID:instanceId,AGENTS_COMPANY_HOST_BRIDGE_SECRET:secret,AGENTS_COMPANY_HOST_PARENT_ORIGIN:parentOrigin,
    AGENTS_COMPANY_HOST_PROJECTION_PATH:projection},entry)
  const origin='http://127.0.0.1:'+port
  const up=()=>fetch(origin+'/api/health').then(response=>response.ok).catch(()=>false)
  for(let attempt=0;attempt<300&&!await up();attempt++)await delay(50)
  if(!await up())throw Error('hosted Core web server did not start ('+label+')')
  return {origin,instanceId,hostOrigin:parentOrigin,home:core.env.AGENTS_COMPANY_HOME,
    ticket({clientId,windowId=randomUUID(),nonce=randomBytes(18).toString('base64url'),expiresAt=Date.now()+20000,instanceId:forInstance=instanceId}={}){
      const grant=Buffer.from(JSON.stringify({purpose:'hosted-embed-login',instanceId:forInstance,windowId,clientId,parentOrigin,nonce,expiresAt})).toString('base64url')
      return grant+'.'+createHmac('sha256',secret).update(grant).digest('base64url')
    },
    exchange(ticket){
      return fetch(origin+'/api/hosted/exchange',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify({ticket})})
        .then(async response=>({status:response.status,body:await response.json().catch(()=>({})),cookies:response.headers.getSetCookie()}))
    },
    close:()=>core.close()}
}
function sourceProvenance(){
  const files=['src/main/web/auth.ts','src/main/web/server.ts','src/renderer/src/web/transport.ts','src/renderer/src/web/host.ts','src/renderer/src/web/Gate.tsx'].map(file=>path.join(ROOT,file)).concat(path.resolve(ROOT,'../../ui/aexus-embed.js'))
  const hashes=Object.fromEntries(files.map(file=>[path.relative(path.resolve(ROOT,'../..'),file),createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))
  return {backend:ROOT,version:JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).version,buildId:'source-fixture-'+createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),sourceHashes:hashes,evidenceKind:'isolated-source-fixture'}
}
module.exports={ROOT,freePort,startHostedInstance,sourceProvenance}
