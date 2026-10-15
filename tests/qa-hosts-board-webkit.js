// QA-owned re-verification of the Hosts Board / view-switch assertions that
// tests/workspace-mode-webkit.js still states for the three-view era.
//
// tests/workspace-mode-webkit.js (inherited, not modified) expects the toolbar
// to contain exactly "Single Host | Hosts Board | Agent Board", expects the
// backend viewOrder to be that same three-element list after each reorder, and
// looks up `#agent-columns`. Since the Role Board became the fourth primary
// view (dist/ui/index.html: single-mode, hosts-board-mode, agent-board-mode,
// role-board-mode) and the Agent Board's host-column control is now
// `#agent-group-columns`, those seven checks fail on the shipped build even
// though the behaviour they describe still holds for four views.
//
// This fixture states the same intent against the current contract:
// four draggable views, reorder with Alt+ArrowLeft and with a mouse drag, the
// order persisted through the backend, the Agent Board keeping a host-column
// control without a legacy inner-role column list, and a resizable role area.
//
// Run: artifacts/full-acceptance-20261015/qa-swift-bin/wk-webkit-hosts-board \
//        "$BACKEND_URL" tests/qa-hosts-board-webkit.js
window.runWorkspaceModeChecks=async function(){
 const checks=[],messages=[]
 const record=(name,result)=>checks.push({name,passed:!!result})
 window.addEventListener('error',event=>messages.push(event.message||'window error'))
 window.addEventListener('unhandledrejection',event=>messages.push(String(event.reason)))
 const wait=async function(condition,max=10000){
  const until=Date.now()+max
  do{if(await condition())return true;await new Promise(r=>setTimeout(r,60))}while(Date.now()<until)
  return false
 }
 const rpc=async(method,params={})=>{
  const response=await fetch('./rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})})
  const result=await response.json()
  if(result.error)throw Error(result.error.message)
  return result.result
 }
 const button=id=>document.getElementById(id)
 const nav=document.querySelector('.mode-switch')
 const order=()=>[...nav.querySelectorAll('button[data-id]')].map(node=>node.dataset.id)
 const EXPECTED='single|hosts-board|agent-board|role-board'

 await wait(()=>!button('add')?.disabled,15000)
 record('Toolbar exposes exactly Single Host, Hosts Board, Agent Board and Role Board',
  EXPECTED.split('|').every(id=>!!document.getElementById(id+'-mode'))&&
  !document.getElementById('board-mode')&&!document.getElementById('file-board-mode')&&
  nav.querySelectorAll('button').length===4&&document.querySelectorAll('.mode-switch button').length===4&&
  order().join('|')===EXPECTED)
 record('All four views expose draggable native buttons',
  nav.querySelectorAll('button[draggable="true"]').length===4)

 const draggable=button('agent-board-mode')
 const before=order()
 draggable.focus()
 draggable.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}))
 const afterKeyboard=order()
 record('Alt + left arrow reorders view buttons without changing mode',
  afterKeyboard.indexOf('agent-board')===before.indexOf('agent-board')-1&&
  afterKeyboard.slice().sort().join('|')===before.slice().sort().join('|')&&
  draggable===document.activeElement&&button('single-mode').classList.contains('active')&&
  (await rpc('hosts.workspace')).mode==='single')
 record('View button order persists via the backend',
  await wait(async()=>{
   const saved=(await rpc('hosts.workspace')).viewOrder
   return Array.isArray(saved)&&saved.join('|')===order().join('|')&&saved.length===4
  }))

 const origin=button('single-mode'),destination=button('agent-board-mode'),transfer=new DataTransfer()
 const originalAnimate=Element.prototype.animate
 let animations=0
 if(originalAnimate)Element.prototype.animate=function(...args){animations++;return originalAnimate.apply(this,args)}
 try{
  origin.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer,cancelable:true}))
  destination.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:transfer,cancelable:true}))
  origin.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer,cancelable:true}))
 }finally{Element.prototype.animate=originalAnimate}
 const dragged=order()
 record('Mouse-style drag changes real view order',
  dragged.join('|')!==afterKeyboard.join('|')&&dragged.indexOf('single')!==0&&
  dragged.slice().sort().join('|')===afterKeyboard.slice().sort().join('|'))
 record('FLIP animates tab movement unless reduced motion was requested',
  animations>0||matchMedia('(prefers-reduced-motion: reduce)').matches)
 record('Dragged order persists without activating another view',
  await wait(async()=>{
   const state=await rpc('hosts.workspace')
   return state.viewOrder.join('|')===dragged.join('|')&&state.mode!=='agent-board'&&state.mode!=='role-board'
  })&&button('single-mode').classList.contains('active'))

 // Let the reorder animation and the persisted patch settle before switching.
 await wait(async()=>(await rpc('hosts.workspace')).viewOrder.join('|')===order().join('|'))
 await new Promise(r=>setTimeout(r,300))
 // Select the File Board child first so the "last used child" restore below is meaningful.
 button('hosts-board-mode').click()
 await wait(()=>!!document.querySelector('[data-hosts-board-view="file-board"]'))
 document.querySelector('[data-hosts-board-view="file-board"]')?.click()
 await wait(async()=>(await rpc('hosts.workspace')).hostsBoardMode==='file-board')
 button('agent-board-mode').click()
 const agentReady=await wait(()=>!!document.querySelector('.agent-grid')&&!!document.querySelector('.agent-count')&&button('agent-board-mode').classList.contains('active'),15000)
 record('Agent board click loads real bundled WebKit Xterm frontend',agentReady)
 record('Agent board mode persists through HTTP',(await rpc('hosts.workspace')).mode==='agent-board')
 record('Agent board keeps a host-column control, auto-flows inner roles and resizes them',
  !!document.querySelector('#agent-group-columns')&&!document.querySelector('#agent-role-columns')&&
  !!document.querySelector('.agent-role-resize')&&!!document.querySelector('.agent-role-grid'))

 button('hosts-board-mode').click()
 record('Hosts Board restores the last used File Board from Agent Board',await wait(()=>
  !!document.querySelector('.file-board-grid')&&document.querySelector('[data-hosts-board-view="file-board"][aria-selected="true"]'))&&
  (await rpc('hosts.workspace')).hostsBoardMode==='file-board')
 document.querySelector('[data-hosts-board-view="board"]')?.click()
 record('Terminal Board switches within Hosts Board without a fourth top button',await wait(()=>
  !!document.querySelector('.board-grid')&&document.querySelector('[data-hosts-board-view="board"][aria-selected="true"]'))&&
  (await rpc('hosts.workspace')).mode==='board'&&nav.querySelectorAll('button').length===4)
 button('role-board-mode').click()
 record('Role Board is reachable as the fourth primary view',await wait(async()=>
  button('role-board-mode').classList.contains('active')&&
  !button('agent-board-mode').classList.contains('active')&&
  (await rpc('hosts.workspace')).mode==='role-board'))
 button('single-mode').click()
 record('Single Host remains independent of every board',
  await wait(()=>button('single-mode').classList.contains('active')&&!!document.querySelector('.view-tabs'))&&
  (await rpc('hosts.workspace')).mode==='single')
 record('No Invalid workspace layout shown',!document.querySelector('#message')?.textContent.includes('Invalid workspace layout'))
 record('No uncaught browser errors',messages.length===0)
 return {checks,passed:checks.every(check=>check.passed),errors:messages}
}
