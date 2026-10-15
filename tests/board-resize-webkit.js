// Native WKWebView regression: hit targets, cursor, vertical-only resizing and persistence.
window.runBoardResizeChecks = async function () {
  const checks=[],root=document.querySelector('#root')
  root.classList.add('board-workbench')
  const hosts=[
    {id:'linux-1',name:'Linux 1',os:'linux',host:'test1',defaultDirectory:'/tmp'},
    {id:'linux-2',name:'Linux 2',os:'linux',host:'test2',defaultDirectory:'/tmp'}
  ]
  for (const host of hosts) host.info={virtualization:{kind:'virtual',platform:'KVM'},cores:4,memoryMB:4096,networks:[],gpus:[]}
  const group={id:'default',name:'回归测试',hosts:hosts.map(h=>h.id),columns:2,cardHeight:350,initialized:true,modes:{},sizes:{},osHeights:{}}
  const state={activeBoard:'default',boards:[group]}
  const saved=[]
  const controller=window.__boardPane(root,hosts,state,async()=>({}),()=>{},async()=>element=>{
    element.innerHTML='<div class="terminal-surface" style="height:100%"></div>'
    return ()=>{}
  },async patch=>{saved.push(structuredClone(patch));return state},()=>{},()=>{})
  // Hidden WKWebView instances may suspend requestAnimationFrame; DOM measurements force layout.
  await Promise.resolve()
  const cards=[...root.querySelectorAll('.board-card')]
  const card=cards[0],second=cards[1],edge=card.querySelector('.board-resize-edge[role="separator"]'),bottom=card.querySelector('.board-resize-bottom'),input=card.querySelector('.card-height')
  const height=card=>Number(card.querySelector('.board-body').style.height.slice(0,-2))
  const width=card=>card.getBoundingClientRect().width
  const test=(name,condition)=>checks.push({name,exact:!!condition})
  const hit=node=>{
    const rect=node.getBoundingClientRect()
    return document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===node
  }
  test('Two cards have the same default height',cards.length===2&&height(card)===350&&height(second)===350)
  test('Removed corner button while height input and reset stay',!card.querySelector('.card-resize')&&!!input&&!!card.querySelector('.card-reset'))
  test('Bottom seam is a full-width vertical resize hit target',getComputedStyle(edge).cursor==='ns-resize'&&hit(edge)&&edge.getBoundingClientRect().width>300)
  test('Bottom card border is also a vertical resize hit target',getComputedStyle(bottom).cursor==='ns-resize'&&hit(bottom))
  const inputBox=input.getBoundingClientRect()
  test('Height input remains clickable',document.elementFromPoint(inputBox.left+inputBox.width/2,inputBox.top+inputBox.height/2)===input)
  const originalWidths=cards.map(width)
  // Simulated pointer stream exercises the same handlers as a real pointer. Capture
  // is stubbed because a synthetic pointer lacks an OS-tracked active pointer ID.
  edge.setPointerCapture=()=>{}
  const pointer=(id,y)=>({pointerId:id,button:0,isPrimary:true,clientY:y,preventDefault(){}})
  edge.onpointerdown(pointer(11,300))
  edge.onpointermove(pointer(11,300))
  test('Horizontal-only movement does not change row height',height(card)===350)
  edge.onpointermove(pointer(11,427))
  test('Dragging lower edge down changes both row heights',height(card)===480&&height(second)===480)
  test('Drag preserves both card widths',cards.every((item,i)=>Math.abs(width(item)-originalWidths[i])<1))
  edge.onpointerup(pointer(11,427))
  await Promise.resolve()
  test('Release saves both row heights',saved.length===1&&group.sizes['linux-1'].height===480&&group.sizes['linux-2'].height===480)
  bottom.setPointerCapture=()=>{}
  bottom.onpointerdown(pointer(12,250))
  bottom.onpointermove(pointer(12,200))
  bottom.onpointerup(pointer(12,200))
  await Promise.resolve()
  test('Card bottom edge can also shrink row',height(card)===430&&height(second)===430&&saved.length===2)
  edge.onkeydown({key:'ArrowUp',shiftKey:false,preventDefault(){},stopPropagation(){}})
  await Promise.resolve()
  test('Keyboard arrows resize row and update ARIA value',height(card)===420&&height(second)===420&&edge.getAttribute('aria-valuenow')==='420')
  card.querySelector('.card-reset').click()
  await Promise.resolve()
  test('Reset restores row height',height(card)===350&&height(second)===350)
  controller.dispose()
  return {checks,passed:checks.every(c=>c.exact)}
}
