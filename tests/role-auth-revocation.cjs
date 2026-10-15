// Hold only the test page's next host exchange so revocation is observable even
// when the real host can authorize a replacement session immediately.
const assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto')
const cookieName=(origin,client)=>'agents_company_session_'+new URL(origin).port+'_'+createHash('sha256').update(client).digest('hex').slice(0,12)
async function verifyRevocation({page,frame,context,origin,clientId,csrf,call}){
  const cookie=(await context.cookies(origin)).find(value=>value.name===cookieName(origin,clientId))
  assert.ok(cookie&&csrf,'the mounted window has its own cookie and CSRF token')
  const headers={Origin:origin,Cookie:cookie.name+'='+cookie.value,'content-type':'application/json','x-agents-client':clientId,'x-agents-csrf':csrf}
  const marker='Auth refused '+randomUUID(),documentId=randomUUID(),requests=[]
  const presentation=await frame.evaluate(id=>{window.__authDocument=id;return document.documentElement.dataset.presentation},documentId)
  const record=request=>{if(request.url()===origin+'/api/rpc'&&request.postData()?.includes(marker))requests.push(request.postData())}
  page.on('request',record)
  let release
  const held=new Promise(resolve=>{release=resolve})
  const exchange=async route=>{await held;await route.continue()}
  await page.route(origin+'/api/hosted/exchange',exchange)
  try{
    const logout=await fetch(origin+'/api/logout',{method:'POST',headers,body:'{}'})
    assert.equal(logout.status,200,'the Core revokes this exact window session')
    const old=await fetch(origin+'/api/bootstrap',{headers})
    assert.equal(old.status,401,'the old cookie is immediately invalid')
    await assert.rejects(()=>call(frame,'group.add',{name:marker}),'a revoked session cannot mutate')
    const refusedRequests=requests.length
    assert.ok(refusedRequests<=1,'the refused mutation is sent at most once')
    release()
    let teams
    for(let attempt=0;attempt<180&&!teams;attempt++){
      teams=await call(frame,'group.list').catch(()=>null)
      if(!teams)await new Promise(resolve=>setTimeout(resolve,100))
    }
    assert.ok(teams,'the host re-authorizes the same mounted frame')
    assert.equal(await frame.evaluate(()=>window.__authDocument),documentId,'re-authorization preserves the mounted document')
    assert.equal(await frame.evaluate(()=>document.documentElement.dataset.presentation),presentation,'re-authorization preserves the current view')
    assert.equal(teams.includes(marker),false,'the refused mutation has no effect after recovery')
    assert.equal(requests.length,refusedRequests,'recovery never replays the refused mutation')
    await call(frame,'group.add',{name:marker})
    assert.equal(requests.length,refusedRequests+1,'an explicit new mutation sends exactly once')
    assert.equal((await call(frame,'group.list')).filter(name=>name===marker).length,1)
    return {oldCookieStatus:old.status,refusedRequests,replayedRequests:0,explicitWriteRequests:1,sameDocument:true,presentation}
  }finally{release();await page.unroute(origin+'/api/hosted/exchange',exchange);page.off('request',record)}
}
module.exports={cookieName,verifyRevocation}
