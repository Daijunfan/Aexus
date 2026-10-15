// Hosted Role Board authentication over the real source Core: one browser
// cookie jar, several windows, several localhost Core instances.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto'),{test}=require('node:test')
const {ROOT,startHostedInstance}=require('./role-auth-hosted-fixture.cjs')
const PARENT_ORIGIN='http://127.0.0.1:65123'
/** One hosted Core instance, as the owning CloudHosts process starts it. */
const instance=(temp,label)=>startHostedInstance({temp,label,renderer:path.join(temp,label+'-renderer'),parentOrigin:PARENT_ORIGIN})
const scopedCookie=(cookies,origin)=>{const prefix='agents_company_session_'+new URL(origin).port+'_',header=cookies.find(value=>value.startsWith(prefix));return header&&header.slice(0,header.indexOf(';'))}
const authHeaders=(client,csrf)=>({'content-type':'application/json','x-agents-client':client,...(csrf===undefined?{}:{'x-agents-csrf':csrf})})
async function rpc(origin,client,cookies,csrf,cmd='group.list',args={}){
  const response=await fetch(origin+'/api/rpc',{method:'POST',headers:{Origin:origin,Cookie:cookies.join('; '),...authHeaders(client,csrf),'x-request-id':randomUUID()},body:JSON.stringify({cmd,args})})
  return {status:response.status,body:await response.json().catch(()=>({}))}
}
async function bootstrap(origin,client,cookies=[]){
  const response=await fetch(origin+'/api/bootstrap',{headers:{...(cookies.length?{Cookie:cookies.join('; ')}:{}),...(client?{'x-agents-client':client}:{})}})
  return {status:response.status,body:await response.json().catch(()=>({}))}
}

test('hosted Role Board sessions are scoped to the window and the Core instance',{timeout:300000},async()=>{
  const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-auth-scope-')))
  fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'),'dir')
  const [a,b]=[await instance(temp,'a'),await instance(temp,'b')]
  try{
    const windowA=randomUUID(),windowB=randomUUID()
    assert.equal((await bootstrap(a.origin)).status,401,'an unnamed caller without a session is unauthenticated')

    // First authorization of a window.
    const first=await a.exchange(a.ticket({clientId:windowA}))
    assert.equal(first.status,200,JSON.stringify(first.body))
    const scoped=scopedCookie(first.cookies,a.origin)
    assert.ok(scoped,'the session cookie is scoped to this Core instance and browser client')
    assert.ok(first.cookies.some(value=>/HttpOnly/.test(value)&&/SameSite=Strict/.test(value)&&!/Secure/.test(value)))
    assert.equal((await bootstrap(a.origin,windowA,[scoped])).body.data.csrf,first.body.data.csrf)
    assert.equal((await rpc(a.origin,windowA,[scoped],first.body.data.csrf)).status,200)

    // Re-entry: the same window is authorized again while it still holds its session.
    const again=await a.exchange(a.ticket({clientId:windowA}))
    assert.equal(again.status,200)
    assert.equal(scopedCookie(again.cookies,a.origin),scoped,'re-authorization reuses the live session instead of rotating the cookie')
    assert.equal(again.body.data.csrf,first.body.data.csrf)
    assert.equal((await rpc(a.origin,windowA,[scoped],first.body.data.csrf)).status,200,'the CSRF token in the mounted client stays valid across re-authorization')
    assert.equal((await bootstrap(a.origin,windowA,[scoped])).status,200)

    // A second window in the same browser cookie jar must not displace the first.
    const other=await a.exchange(a.ticket({clientId:windowB}))
    const scopedB=scopedCookie(other.cookies,a.origin)
    assert.ok(scopedB&&scopedB!==scoped)
    assert.equal((await bootstrap(a.origin,windowA,[scoped,scopedB])).body.data.csrf,first.body.data.csrf)
    assert.equal((await bootstrap(a.origin,windowB,[scoped,scopedB])).body.data.csrf,other.body.data.csrf)
    assert.equal((await rpc(a.origin,windowA,[scoped,scopedB],first.body.data.csrf)).status,200)
    assert.equal((await rpc(a.origin,windowB,[scoped,scopedB],other.body.data.csrf)).status,200)

    // Wrong, missing and borrowed credentials are refused without touching the session.
    assert.equal((await rpc(a.origin,windowA,[scoped],'')).status,403)
    assert.equal((await rpc(a.origin,windowA,[scoped],undefined)).status,403)
    assert.equal((await rpc(a.origin,windowA,[scoped],other.body.data.csrf)).status,403)
    assert.equal((await rpc(a.origin,windowB,[scoped],first.body.data.csrf)).status,401)
    assert.equal((await rpc(a.origin,'short',[scoped],first.body.data.csrf)).status,400)
    assert.equal((await bootstrap(a.origin,windowB,[scoped])).status,401,'another window cannot read this session')
    const replay=a.ticket({clientId:windowB})
    assert.equal((await a.exchange(replay)).status,200)
    assert.equal((await a.exchange(replay)).status,403,'a host ticket is single-use')
    assert.equal((await a.exchange('forged.ticket')).status,403)
    assert.equal((await a.exchange(a.ticket({clientId:windowB,expiresAt:Date.now()-1000}))).status,403)

    // A stream and a download resolve the same scoped session.
    const {WebSocket}=require(path.join(ROOT,'node_modules/ws'))
    const openStream=(client,cookies)=>new Promise(resolve=>{
      const socket=new WebSocket(a.origin.replace('http','ws')+'/api/events?client='+client,{headers:{Origin:a.origin,Cookie:cookies.join('; ')}})
      socket.on('open',()=>resolve({accepted:true,socket}));socket.on('error',()=>resolve({accepted:false,socket}));socket.on('unexpected-response',()=>resolve({accepted:false,socket}))
    })
    const mine=await openStream(windowA,[scoped])
    assert.ok(mine.accepted,'the event stream accepts the scoped session cookie')
    const theirs=await openStream(windowB,[scoped])
    assert.equal(theirs.accepted,false,'a window cannot stream on another window session cookie')
    mine.socket.close();theirs.socket?.close()
    const download=await fetch(a.origin+'/api/download?client='+windowA+'&from='+encodeURIComponent(JSON.stringify({path:'/nonexistent'})),{headers:{Cookie:scoped}})
    await download.body?.cancel?.()
    assert.ok(![401,403].includes(download.status),'an authorized download is not refused for authentication')

    // Two Core instances reached from one cookie jar keep independent sessions.
    const sharedA=await a.exchange(a.ticket({clientId:windowA})),sharedB=await b.exchange(b.ticket({clientId:windowA}))
    const jar=[scopedCookie(sharedA.cookies,a.origin),scopedCookie(sharedB.cookies,b.origin)].filter(Boolean)
    assert.equal(jar.length,2,'each instance issues its own cookie name')
    assert.equal((await bootstrap(a.origin,windowA,jar)).status,200)
    assert.equal((await bootstrap(b.origin,windowA,jar)).status,200)
    assert.equal((await rpc(b.origin,windowA,jar,sharedB.body.data.csrf)).status,200)
    assert.equal((await rpc(a.origin,windowA,jar,sharedA.body.data.csrf)).status,200,'one instance never authenticates against the other instance session')
    assert.equal((await rpc(a.origin,windowA,jar,sharedB.body.data.csrf)).status,403)

    // Sign-out revokes the session; the host re-authorizes the window and the
    // client resumes with a new session and a new CSRF token.
    const out=await fetch(a.origin+'/api/logout',{method:'POST',headers:{Origin:a.origin,Cookie:scoped,...authHeaders(windowA,first.body.data.csrf)},body:'{}'})
    assert.equal(out.status,200)
    assert.equal((await bootstrap(a.origin,windowA,[scoped])).status,401)
    assert.equal((await rpc(a.origin,windowA,[scoped],first.body.data.csrf)).status,401)
    const renewed=await a.exchange(a.ticket({clientId:windowA}))
    assert.equal(renewed.status,200)
    const renewedCookie=scopedCookie(renewed.cookies,a.origin)
    assert.notEqual(renewed.body.data.csrf,first.body.data.csrf,'a revoked session is not resurrected')
    assert.equal((await bootstrap(a.origin,windowA,[renewedCookie])).body.data.csrf,renewed.body.data.csrf)
    assert.equal((await rpc(a.origin,windowA,[renewedCookie],renewed.body.data.csrf)).status,200)
  }finally{await Promise.all([a.close(),b.close()]);fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
})
