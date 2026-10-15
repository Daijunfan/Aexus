window.runWorkspaceModeChecks=async function(){
 const checks=[],messages=[]
 const record=(name,result)=>checks.push({name,passed:!!result})
 window.addEventListener('error',event=>messages.push(event.message||'window error'))
 window.addEventListener('unhandledrejection',event=>messages.push(String(event.reason)))
 const wait=async function(condition,max=7000){
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
 record('Aexus main toolbar has exactly Single Host, Hosts Board, Agent Board and Role Board',
  ['single-mode','hosts-board-mode','agent-board-mode','role-board-mode'].every(id=>!!document.getElementById(id))&&
  !document.getElementById('board-mode')&&!document.getElementById('file-board-mode')&&
  document.querySelectorAll('.mode-switch button').length===4)
 const booted=await wait(()=>!document.querySelector('#add')?.disabled)
 record('Real HTTP RPC bootstrapped original single mode',booted&&(await rpc('hosts.workspace')).mode==='single')
 const button=id=>document.getElementById(id)
 const nav=document.querySelector('.mode-switch')
 const initialOrder=[...nav.querySelectorAll('button[data-id]')].map(button=>button.dataset.id)
 record('Four toolbar views expose draggable native buttons',initialOrder.join('|')==='single|hosts-board|agent-board|role-board'&&nav.querySelectorAll('button[draggable="true"]').length===4)
 const draggable=button('agent-board-mode')
 draggable.focus()
 draggable.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}))
 record('Alt + left arrow reorders view buttons without changing mode',
  [...nav.children].map(node=>node.dataset.id).join('|')==='single|agent-board|hosts-board|role-board'&&draggable===document.activeElement)
 const savedOrder=await wait(async()=>{
  const order=(await rpc('hosts.workspace')).viewOrder
  return order?.join('|')==='single|agent-board|hosts-board|role-board'
 })
 record('View button order persists via the backend',savedOrder)
 const origin=button('single-mode'),destination=button('agent-board-mode'),transfer=new DataTransfer()
 const originalAnimate=Element.prototype.animate
 let animations=0
 if(originalAnimate)Element.prototype.animate=function(...args){animations++;return originalAnimate.apply(this,args)}
 try{
  origin.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer,cancelable:true}))
  destination.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:transfer,cancelable:true}))
  origin.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer,cancelable:true}))
 }finally{Element.prototype.animate=originalAnimate}
 const dragged=[...nav.children].map(node=>node.dataset.id).join('|')
 record('Mouse-style drag changes real view order',dragged==='agent-board|single|hosts-board|role-board')
 record('FLIP animates tab movement unless reduced motion was requested',animations>0||matchMedia('(prefers-reduced-motion: reduce)').matches)
 record('Dragged order persists without activating another view',await wait(async()=>{
  const state=await rpc('hosts.workspace')
  return state.viewOrder.join('|')===dragged&&state.mode==='single'
 }))
 await new Promise(resolve=>setTimeout(resolve,300))
 record('Real Core computer is present and pinned first in the left host sidebar',
  !!document.querySelector('#hosts .host-card[data-id="local"]')&&
  document.querySelector('#hosts .host-card')?.dataset.id==='local'&&
  !document.querySelector('#hosts .host-card[data-id="local"]').draggable)
 const hostSearch=document.querySelector('#search')
 hostSearch.value='Filtered';hostSearch.dispatchEvent(new Event('input',{bubbles:true}))
 const filteredCards=[...document.querySelectorAll('#hosts .host-card')]
 record('11: sorting is disabled while host search results are filtered',
  filteredCards.length===2&&filteredCards.every(card=>card.draggable===false))
 hostSearch.value='';hostSearch.dispatchEvent(new Event('input',{bubbles:true}))
 record('11: original full host order remains draggable after clearing the filter',
  document.querySelectorAll('#hosts .host-card[draggable="true"]').length>=2)
 record('Local Core host exposes native terminal/file info and cannot be removed',await (async()=>{
  const state=await rpc('hosts.get',{id:'local'});
  return state.local===true&&state.os&&state.status?.connected;
 })())
 record('Single-host overview shows Coding Agent engines already working on this host',
  await wait(()=>!!document.querySelector('#single-agents-preview .single-agents-grid')))
 const agentTab=document.querySelector('[data-view="agents"]')
 record('Single-host view has a dedicated Coding Agents tab',agentTab?.textContent.trim()==='Coding Agents')
 agentTab?.click()
 record('Single-host Coding Agents tab contains only this work machine',await wait(()=>
  !!document.querySelector('#panel.single-agent-workbench .agent-host-card[data-host="local"]')&&
  document.querySelectorAll('#panel.single-agent-workbench .agent-host-card').length===1))
 const separator=document.querySelector('#panel.single-agent-workbench .agent-role-resize')
 const previousHeight=(await rpc('hosts.workspace')).agentBoard.roleHeight
 separator.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))
 record('20: Single Host Agent resize saves its height through RPC without changing current host',
  await wait(async()=> (await rpc('hosts.workspace')).agentBoard.roleHeight===previousHeight+10))

 document.querySelector('[data-view="overview"]')?.click()
 await wait(()=>!!document.querySelector('#single-agents-preview'))

 button('hosts-board-mode').click()
 record('Hosts Board opens with two internal views, defaulting to Terminal Board',await wait(()=>
  !!document.querySelector('.board-grid')&&button('hosts-board-mode').classList.contains('active')&&
  document.querySelectorAll('.hosts-board-tabs button').length===2&&
  document.querySelector('[data-hosts-board-view="board"][aria-selected="true"]')&&
  (document.querySelector('[data-hosts-board-view="file-board"]')?.textContent.trim()==='File Board')))
 document.querySelector('[data-hosts-board-view="file-board"]')?.click()
 const fileReady=await wait(()=>!!document.querySelector('.file-board-grid')&&button('hosts-board-mode').classList.contains('active')&&
  document.querySelector('[data-hosts-board-view="file-board"][aria-selected="true"]'))
 const state=await rpc('hosts.workspace')
 record('File Board is a child of Hosts Board with persistent internal selection',fileReady&&state.mode==='file-board'&&state.hostsBoardMode==='file-board')
 record('File board has host add and 1–6 column selector',
   !!document.querySelector('#file-board-add')&&document.querySelectorAll('#file-board-columns option').length===6)
 if(fileReady){
  const columns=document.querySelector('#file-board-columns')
  columns.value='6';columns.dispatchEvent(new Event('change',{bubbles:true}))
 }
 record('File board column layout persists through HTTP',await (async()=>{
   let value=false
   for(let i=0;i<40;i++){
     const state=await rpc('hosts.workspace')
     if(state.fileBoard.columns===6){value=true;break}
     await new Promise(r=>setTimeout(r,50))
   }
   return value
 })())
 button('agent-board-mode').click()
 const agentReady=await wait(()=>!!document.querySelector('.agent-grid')&&!!document.querySelector('.agent-count')&&button('agent-board-mode').classList.contains('active'),10000)
 record('Agent board click loads real bundled WebKit Xterm frontend',agentReady)
 record('Agent board mode persists through HTTP',(await rpc('hosts.workspace')).mode==='agent-board')
 record('Agent board keeps a per-workgroup host-column control, auto-flows inner roles and resizes them',
   !!document.querySelector('#agent-group-columns')&&!document.querySelector('#agent-role-columns')&&
   !!document.querySelector('.agent-role-resize')&&!!document.querySelector('.agent-role-grid'))
 button('hosts-board-mode').click()
 record('Hosts Board restores the last used File Board from Agent Board',await wait(()=>
  !!document.querySelector('.file-board-grid')&&document.querySelector('[data-hosts-board-view="file-board"][aria-selected="true"]'))&&
  (await rpc('hosts.workspace')).hostsBoardMode==='file-board')
 record('File Board restores saved columns after switching back',!!document.querySelector('#file-board-columns')&&document.querySelector('#file-board-columns').value==='6')
 document.querySelector('[data-hosts-board-view="board"]')?.click()
 record('Terminal Board switches within Hosts Board without adding a top button',await wait(()=>
  !!document.querySelector('.board-grid')&&document.querySelector('[data-hosts-board-view="board"][aria-selected="true"]'))&&
  (await rpc('hosts.workspace')).mode==='board'&&nav.querySelectorAll('button').length===4)
 button('single-mode').click()
 record('Single Host remains independent of both Hosts Board children',await wait(()=>button('single-mode').classList.contains('active')&&!!document.querySelector('.view-tabs'))&&(await rpc('hosts.workspace')).mode==='single')
 button('hosts-board-mode').click()
 record('Hosts Board remembers Terminal Board selection after leaving for Single Host',await wait(()=>
  !!document.querySelector('.board-grid')&&document.querySelector('[data-hosts-board-view="board"][aria-selected="true"]'))&&
  (await rpc('hosts.workspace')).hostsBoardMode==='board')
 record('No Invalid workspace layout shown',!document.querySelector('#message')?.textContent.includes('Invalid workspace layout'))
 record('No uncaught browser errors',messages.length===0)
 return {passed:checks.every(c=>c.passed),checks,errors:messages}
}
