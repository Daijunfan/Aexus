window.runAgentBoardChecks=async function(){
 const waitFor=async test=>{for(let n=0;n<40&&!test();n++)await new Promise(resolve=>setTimeout(resolve,100))}
 const checks=[],record=(name,passed)=>checks.push({name,passed:!!passed}),sleep=()=>new Promise(resolve=>setTimeout(resolve,110)),tuiDetails=[]
 const local={id:'local',name:'本地主机',host:'local-device',os:'macos',defaultDirectory:'/Users/dev/work',local:true}
 const hosts=[local,{id:'mac-1',name:'Mac Build Host',host:'mac.invalid',os:'macos',defaultDirectory:'/Users/build'}, {id:'win-1',name:'Windows Engine',host:'win.invalid',os:'windows',defaultDirectory:'C:\\projects'},...Array.from({length:5},(_,i)=>({id:'linux-'+i,name:'Linux '+i,host:'linux.invalid',os:'linux',defaultDirectory:'/home/dev'}))]
 const role=(id,engineHostId,targetHostId,engine,name)=>({id,name,engineHostId,targetHostId,hostId:targetHostId,engineHost:hosts.find(h=>h.id===engineHostId),targetHost:hosts.find(h=>h.id===targetHostId),engine,kind:'agent',transport:engine==='codex'?'native':'pty',threadId:engine==='codex'?'thread-'+id:undefined,running:true,status:'idle',cwd:hosts.find(h=>h.id===targetHostId).defaultDirectory})
 let records=[role('s1','local','mac-1','codex','API 重构'),role('s2','win-1','mac-1','codex','跨平台构建'),role('s3','mac-1','mac-1','claude','原生会话'),role('s4','local','local','pi','本地检查'),role('s5','mac-1','win-1','codex','Windows 工作'),role('s-cline','local','linux-0','cline','Cline integration')]
 const operations=[],messages=[],sockets=[],saved=[];let backendRoleOrder={}
 let next=6,delayList=false,releaseList=null,failActivate=null,failTui=null,waitOpen=false,releaseOpen=null
 const rpc=async(method,args={})=>{
  operations.push({method,args:structuredClone(args)})
  if(method==='hosts.agent-hosts')return structuredClone(hosts)
  if(method==='hosts.agent-list'){
   const snapshot=structuredClone(records)
   if(delayList){delayList=false;await new Promise(resolve=>{releaseList=resolve})}
   return snapshot
  }
  if(method==='hosts.workspace'){if(!args.patch)return {agentBoard:{roleOrder:structuredClone(backendRoleOrder)}};saved.push(args.patch);if(args.patch.agentBoardPatch?.roleOrder)backendRoleOrder=structuredClone(args.patch.agentBoardPatch.roleOrder);return {agentBoard:args.patch.agentBoardPatch}}
  if(method==='hosts.agent-capabilities')return {hostId:args.id,engines:{codex:true,claude:true,cline:args.id==='win-1',pi:args.id==='local'},transparentRouting:{codex:args.id==='local'&&args.targetHostId!=='local',claude:false,cline:false,pi:false},routingVerified:args.id==='local'&&args.targetHostId!=='local'}
  if(method==='hosts.agent-open'){const item=role('s'+next++,args.engineHostId,args.targetHostId,args.engine,args.name);item.cwd=args.directory;records.push(item);if(waitOpen){waitOpen=false;await new Promise(resolve=>{releaseOpen=resolve})}return structuredClone(item)}
  if(method==='hosts.agent-close'){records.find(item=>item.id===(args.session||args.terminal)).running=false;return true}
  if(method==='hosts.agent-restart'){const item=records.find(item=>item.id===args.session);item.running=true;item.status='idle';return item}
  if(method==='hosts.agent-activate'){if(failActivate===args.session)throw Error('SSH network temporarily unavailable');const item=records.find(item=>item.id===args.session);item.running=true;item.error=undefined;item.status='idle';return structuredClone(item)}
  if(method==='hosts.agent-tui'){if(failTui===args.session)throw Error('Codex native TUI did not attach (native_tui_handshake_timeout, generation 0)');const item=records.find(item=>item.id===args.session);item.terminalId='tui-'+item.id;return structuredClone(item)}
  if(method==='hosts.agent-remove'){records=records.filter(item=>item.id!==args.session);return {removed:true}}
  if(method==='hosts.agent-rename'){const item=records.find(item=>item.id===args.session);item.name=args.name;return structuredClone(item)}
  if(method==='hosts.agent-read')return {cursor:2,events:args.cursor?[]:[{seq:1,kind:'message',itemId:'m1',text:'原生会话就绪 <script>bad()</script>'},{seq:2,kind:'tool',itemId:'t1',text:'pwd'}],approvals:[],running:true,busy:false,status:'idle'}
  if(method==='hosts.agent-send')return {accepted:true,turnId:'turn-1'}
  throw Error('Unexpected method '+method)
 }
 class FakeSocket{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3
  constructor(url){this.url=new URL(url);this.readyState=0;this.sent=[];sockets.push(this);queueMicrotask(()=>{if(this.readyState!==0)return;this.readyState=1;this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'ready',protocol:2})});this.onmessage?.({data:JSON.stringify({output:'Agent online\r\n',cursor:14,seq:1,running:true})})})}
  send(data){this.sent.push(JSON.parse(data))}
  close(){this.readyState=3;this.onclose?.()}
 }
 window.WebSocket=FakeSocket
 const root=document.querySelector('#root'),pane=window.cloudClients['agent-board'],controller=pane(root,hosts.filter(h=>h.id!=='local'),rpc,text=>messages.push(text),'mac-1')
 const q=s=>root.querySelector(s),close=()=>q('.agent-inspector header [data-close]')?.click()
 await sleep()
 record('Company board displays all work hosts, including actual Core-local host',q('[data-host="local"]')&&root.querySelectorAll('.agent-host-card').length===8)
 record('One work host exposes all roles from different launch machines simultaneously',q('[data-host="mac-1"] .agent-role-grid').querySelectorAll('.agent-role').length===3)
 record('Local-launched role on cloud workspace has local Mac footer without cloud icon',q('[data-session="s1"] .agent-origin.is-local .os-macos')&&!q('[data-session="s1"] .agent-cloud'))
 const localOS=q('[data-session="s1"] .agent-origin.is-local>.os-icon'),nativeOS=localOS?.querySelector('img')
 await nativeOS?.decode?.()
 const osBox=localOS?.getBoundingClientRect(),logo=nativeOS?.getBoundingClientRect()
 record('Mac native logo is completely contained in the Agent footer instead of being clipped by global OS styling',
  !!nativeOS?.naturalWidth&&logo.width<=osBox.width&&logo.height<=osBox.height&&
  logo.left>=osBox.left-.5&&logo.top>=osBox.top-.5&&logo.right<=osBox.right+.5&&logo.bottom<=osBox.bottom+.5)

 record('Remote-launched role shows its real source cloud name even when target differs',q('[data-session="s2"] .agent-origin.is-cloud strong').textContent==='Windows Engine')
 record('Same-host remote CLI still displays remote-source cloud',!!q('[data-session="s3"] .agent-origin.is-cloud .agent-cloud'))
 record('Board render does not launch engines, probe hosts or open terminal sockets',sockets.length===0&&!operations.some(op=>['hosts.agent-open','hosts.agent-send','hosts.agent-capabilities'].includes(op.method)))
 const transient=records.find(item=>item.id==='s2');transient.running=false;transient.status='error';transient.error='SSH network temporarily unavailable';
 failActivate='s2';q('#agent-refresh').click();await sleep();q('[data-session="s2"]').click()
 await waitFor(()=>!!q('.agent-inspector .agent-retry-connect'))
 record('9: temporary outage remains inside the Agent inspector with a retry control, no raw error toast',
  !!q('.agent-inspector')&&q('.agent-inspector h2')?.textContent==='跨平台构建'&&
  !!q('.agent-inspector .agent-retry-connect')&&
  !q('.agent-inspector .agent-stopped').textContent.split('连接诊断')[0].includes('SSH network temporarily unavailable')&&
  !messages.some(text=>String(text).includes('SSH network temporarily unavailable')))
 record('9: offline Agent remains manageable with Rename and Remove actions',
  !!q('.agent-inspector .agent-rename-toggle')&&!q('.agent-inspector .agent-remove')?.hidden&&
  !q('.agent-inspector .agent-remove')?.disabled)
 close();failActivate=null;transient.running=true;transient.status='idle';transient.error=undefined;q('#agent-refresh').click();await sleep()
 const failedRole=records.find(item=>item.id==='s1');failedRole.running=false;failedRole.status='error';failedRole.error='no rollout found for thread id 01a12e0b'
 q('#agent-refresh').click();await sleep()
 record('The Agent tile never renders raw errors or sensitive protocol diagnostics',
  !q('[data-session="s1"] .agent-role-error')&&
  !q('[data-session="s1"]').title.includes('no rollout found')&&
  q('[data-session="s1"] .agent-role-status')?.textContent.includes('异常'))
 q('[data-session="s1"]').click();await sleep()
 record('Clicking a stopped Agent immediately auto-activates it without manual Restart',operations.filter(op=>op.method==='hosts.agent-activate'&&op.args.session==='s1').length===1&&records.find(r=>r.id==='s1').running)
 record('Agent inspector never asks for a manual Restart button',!q('.agent-restart')&&!operations.some(op=>op.method==='hosts.agent-send'))
 close();failedRole.error=undefined;failedRole.running=true;failedRole.status='idle';q('#agent-refresh').click();await sleep()
 failTui='s1';const beforeFallback=operations.filter(op=>op.method==='hosts.agent-send').length;
 const beforeRetryTui=operations.filter(op=>op.method==='hosts.agent-tui'&&op.args.session==='s1').length;
 q('[data-session="s1"]').click();await waitFor(()=>!!q('.agent-inspector .agent-connect-panel'));
 // A native TUI handshake outage is a transport failure, not a conversation
 // change: the product keeps the same native Codex identity and offers the
 // shared retry control (ui/agent-board.js openSession catch). The retired
 // inline conversation-log fallback and its `.agent-retry-tui` control no
 // longer exist, so assert the surviving contract: the exact bound thread is
 // preserved, the raw protocol diagnostic stays inside the on-demand
 // <details> panel, and no model message is injected on the failure path.
 const tuiPanel=q('.agent-inspector .agent-connect-panel')
 tuiDetails.push({panel:!!tuiPanel,retry:!!q('.agent-inspector .agent-retry-connect'),
  visible:tuiPanel?.textContent.slice(0,160),
  diagnostic:q('.agent-inspector .agent-connect-panel details pre')?.textContent,
  thread:records.find(row=>row.id==='s1').threadId,toasts:messages.slice()})
 record('Native TUI handshake outage keeps the exact bound Codex conversation without a toast or model request',
  !!tuiPanel&&!!q('.agent-inspector .agent-retry-connect')&&
  q('.agent-inspector .agent-connect-panel details pre')?.textContent.includes('native_tui_handshake_timeout')&&
  !tuiPanel.textContent.split('连接诊断')[0].includes('native_tui_handshake_timeout')&&
  !messages.some(text=>String(text).includes('native_tui_handshake_timeout'))&&
  records.find(row=>row.id==='s1').threadId==='thread-s1'&&
  operations.filter(op=>op.method==='hosts.agent-send').length===beforeFallback);
 failTui=null;q('.agent-inspector .agent-retry-connect')?.click();await waitFor(()=>!!q('.agent-inspector .xterm'));
 const retryTui=operations.filter(op=>op.method==='hosts.agent-tui'&&op.args.session==='s1').length;
 tuiDetails.push({retried:!!q('.agent-inspector .xterm'),thread:records.find(row=>row.id==='s1').threadId,tuiCalls:{beforeRetryTui,afterRetry:retryTui},
  socket:sockets.findLast(socket=>socket.url.searchParams.get('terminal')==='tui-s1')?.url.search})
 record('Retry from the connect panel restores the original Codex TUI and bound thread',
  !!q('.agent-inspector .xterm')&&!q('.agent-inspector .agent-connect-panel')&&
  records.find(row=>row.id==='s1').threadId==='thread-s1'&&retryTui>beforeRetryTui&&
  sockets.findLast(socket=>socket.url.searchParams.get('terminal')==='tui-s1')?.url.searchParams.get('host')==='mac-1');
 close();await sleep()

 const nativeIcons=['codex','claude','cline','pi']
 const iconGeometry=[]
 for(const engine of nativeIcons){
  const img=root.querySelector(`.agent-engine-native[data-engine="${engine}"]`)
  try{await img?.decode()}catch{}
  if(!img||!img.naturalWidth){iconGeometry.push({engine,loaded:false});continue}
  const square=document.createElement('canvas');square.width=128;square.height=128
  const context=square.getContext('2d');context.drawImage(img,0,0,128,128)
  const pixels=context.getImageData(0,0,128,128).data
  let left=128,top=128,right=0,bottom=0,opaque=0
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
   if(pixels[(y*128+x)*4+3]<35)continue
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);opaque++
  }
  const card=img.closest('.agent-role'),a=img.getBoundingClientRect(),b=card.getBoundingClientRect()
  iconGeometry.push({engine,loaded:true,width:img.naturalWidth,visibleWidth:(right-left+1)/128,visibleHeight:(bottom-top+1)/128,
   hasPadding:left>1&&top>1&&right<126&&bottom<126,insideCard:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom,opaque})
 }
 record('All four native Coding Agent icon assets load successfully',iconGeometry.length===4&&iconGeometry.every(icon=>icon.loaded))
 record('All four native icons fill their SVG viewport without internal cropping or excessive blank margins',
  iconGeometry.every(icon=>icon.visibleWidth>=.70&&icon.visibleHeight>=.70&&icon.hasPadding&&icon.opaque>200))
 record('Engine logos remain entirely inside compact session cards',iconGeometry.every(icon=>icon.insideCard))
 window.cloudHostsIconGeometry=iconGeometry
 record('Every role is one compact session rectangle with its native engine icon',
  !!q('[data-session="s1"] .agent-engine-native')&&q('[data-session="s1"] .agent-engine-native')?.naturalWidth>0&&
  !!q('[data-session="s3"] .agent-engine-native')&&!!q('[data-session="s4"] .agent-engine-native')&&
  root.querySelectorAll('[data-session]').length===records.length)
 record('Fixed Within host columns setting is completely removed',!q('#agent-role-columns')&&!q('.agent-role-columns'))
 for(let i=0;i<14;i++)records.push(role('extra-'+i,i%2?'win-1':'local','mac-1','codex','Long-running Role '+i))
 q('#agent-refresh').click();await sleep()
 const viewport=q('[data-host="mac-1"] .agent-role-viewport')
 const inner=viewport.querySelector('.agent-role-grid')
 const first=q('[data-host="mac-1"] [data-session="s1"]')
 const adaptive=[],layoutDetails=[],columnDetails=[]
 for(const width of [430,650,1000]){
  root.style.width=width+'px';await sleep();
  const count=getComputedStyle(inner).gridTemplateColumns.trim().split(/\s+/).length
  adaptive.push(count)
  layoutDetails.push({width,innerColumns:count,innerTrack:getComputedStyle(inner).gridTemplateColumns,viewportScrollWidth:viewport.scrollWidth,viewportClientWidth:viewport.clientWidth,rootScrollWidth:root.scrollWidth,rootClientWidth:root.clientWidth,tileWidths:[...inner.querySelectorAll('.agent-role')].map(tile=>tile.clientWidth),tileHeights:[...inner.querySelectorAll('.agent-role')].map(tile=>Math.round(tile.getBoundingClientRect().height))})
  record(`Host inner grid at ${width}px is responsive without horizontal clipping`,
   count>=1&&viewport.scrollWidth<=viewport.clientWidth+1&&root.scrollWidth<=root.clientWidth+1&&
   [...inner.querySelectorAll('.agent-role')].every(tile=>tile.clientWidth<=220&&tile.getBoundingClientRect().height<=150))
 }
 // `.agent-role-grid` is `repeat(auto-fill,minmax(min(100%,176px),1fr))`
 // (dist/ui/agent-board.bundle.css), so the real column count is a step
 // function of the *viewport* width, not of the outer window: the host card
 // stops widening before the next 176px column fits. Assert the contract —
 // monotonic in width, strictly more columns in the widest layout, and every
 // multi-column track at least the 176px floor — instead of demanding an
 // increase at every sampled window size.
 const roleGridWidths=layoutDetails.filter(entry=>entry.innerColumns!==undefined)
 const trackFloors=roleGridWidths.map(entry=>entry.innerTrack.trim().split(/\s+/).map(track=>parseFloat(track)))
 tuiDetails.push({roleGridWidths,trackFloors})
 record('Panel resize automatically increases real Agent columns',
  adaptive.every((count,index)=>index===0||count>=adaptive[index-1])&&
  adaptive[2]>adaptive[0]&&
  roleGridWidths.map(entry=>entry.viewportClientWidth).every((width,index,all)=>index===0||width>=all[index-1])&&
  trackFloors.every(tracks=>tracks.length===1||tracks.every(track=>track>=175)))
 root.style.width='1000px';await sleep()
 layoutDetails.push({stage:'dense',adaptive,scrollHeight:viewport.scrollHeight,clientHeight:viewport.clientHeight,scrollWidth:viewport.scrollWidth,clientWidth:viewport.clientWidth,connected:viewport.isConnected,outerHTML:viewport.outerHTML.slice(0,200)})
 record('Dense Agent roles scroll vertically, not horizontally',viewport.scrollHeight>viewport.clientHeight&&viewport.scrollWidth<=viewport.clientWidth+1)
 viewport.scrollTop=90
 record('Role viewport retains its independent vertical scroll offset',viewport.scrollTop>0)
 layoutDetails.push({stage:'scroll',scrollTop:viewport.scrollTop,connected:viewport.isConnected})
 first.focus({preventScroll:true})
 const beforeFocus=document.activeElement===first, beforeId=first.dataset.session;
 records[0].busy=true;await controller.refresh(true);await sleep()
 const sameDOM=first===q('[data-host="mac-1"] [data-session="s1"]'),afterFocus=document.activeElement===first,afterScroll=viewport.scrollTop>0;
 window.statusFocusDetails={beforeFocus,beforeId,sameDOM,afterFocus,afterScroll,activeTag:document.activeElement?.tagName,activeId:document.activeElement?.id};
 record('Status-only polls patch the same Agent DOM node without stealing keyboard focus',sameDOM&&afterFocus&&afterScroll)
 records[0].busy=false;records=records.filter(item=>!item.id.startsWith('extra-'))
 q('#agent-refresh').click();await sleep()
 close();await sleep();
 record('No stale inspector remains before a drag gesture',!q('.agent-inspector'))
 // Agent dragging swaps occupied slots, never saves arbitrary coordinates.
 const roleViewport=q('[data-host="mac-1"] .agent-role-viewport')
 roleViewport.scrollLeft=0;roleViewport.scrollTop=0
 const roleTile=q('[data-host="mac-1"] [data-session="s1"]')
 const otherTile=q('[data-host="mac-1"] [data-session="s2"]')
 const canvas=q('[data-host="mac-1"] .agent-role-grid')
 const originalOrder=[...canvas.querySelectorAll('[data-session]')].map(tile=>tile.dataset.session)
 const transfer=new DataTransfer()
 const drag=(node,type)=>node.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}))
 drag(roleTile,'dragstart');drag(otherTile,'dragover');drag(otherTile,'drop');drag(roleTile,'dragend');await sleep()
 const swapped=[...canvas.querySelectorAll('[data-session]')].map(tile=>tile.dataset.session)
 record('Dragging Agent A onto Agent B swaps relative grid positions only',swapped.indexOf('s1')===originalOrder.indexOf('s2')&&swapped.indexOf('s2')===originalOrder.indexOf('s1'))
 record('Persisted swap order never modifies either engine source or work host',
  saved.at(-1).agentBoardPatch.roleOrder['mac-1']?.[0]==='s2'&&
  records.find(r=>r.id==='s1').targetHostId==='mac-1'&&!operations.some(op=>op.method==='hosts.agent-open'))
 roleTile.click();record('A completed drag cannot accidentally open its Agent inspector',!q('.agent-inspector'))
 roleTile.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}));await sleep()
 record('Alt + Left swaps Agent with its immediate left neighbor',
  [...canvas.querySelectorAll('[data-session]')].map(tile=>tile.dataset.session).join('|')===originalOrder.join('|'))
 record('No free-position coordinates are persisted when swapping Agent cards',!saved.at(-1).agentBoardPatch.rolePositions?.s1)
 // CLI changes must become visible after the normal Refresh action.
 backendRoleOrder={'mac-1':['s3','s1','s2']};q('#agent-refresh').click();await sleep()
 record('Refresh reads and displays a slot swap persisted by another CLI process',
  [...canvas.querySelectorAll('[data-session]')].map(tile=>tile.dataset.session).slice(0,3).join('|')==='s3|s1|s2')
 backendRoleOrder={'mac-1':originalOrder};q('#agent-refresh').click();await sleep()

 // The same host accommodates many roles by adding rows only.
 for(let i=0;i<96;i++)records.push(role('many-'+i,'local','mac-1','codex','Worker '+i))
 q('#agent-refresh').click();await sleep()
 const scrollTrack=q('[data-host="mac-1"] .agent-vertical-track'),scrollThumb=scrollTrack.querySelector('.agent-vertical-thumb')
 record('Large fleets add vertical rows with no horizontal card clipping',
  roleViewport.scrollHeight>1800&&roleViewport.scrollWidth<=roleViewport.clientWidth+1&&root.scrollWidth<=root.clientWidth+1&&canvas.querySelectorAll('.agent-role').length===99)
 window.scrollbarDetails={hidden:scrollTrack.hidden,track:getComputedStyle(scrollTrack).cursor,thumb:getComputedStyle(scrollThumb).cursor,scrollHeight:roleViewport.scrollHeight,clientHeight:roleViewport.clientHeight}
 layoutDetails.push({stage:'fleet',roleViewport:{scrollHeight:roleViewport.scrollHeight,clientHeight:roleViewport.clientHeight,scrollWidth:roleViewport.scrollWidth,clientWidth:roleViewport.clientWidth},root:{scrollWidth:root.scrollWidth,clientWidth:root.clientWidth},tiles:canvas.querySelectorAll('.agent-role').length,track:{hidden:scrollTrack.hidden,cursor:getComputedStyle(scrollTrack).cursor,classes:scrollTrack.className}})
 record('Right-side vertical scrollbar becomes a hand/grab cursor and is always visible on overflow',
  !scrollTrack.hidden&&getComputedStyle(scrollTrack).cursor==='grab'&&getComputedStyle(scrollThumb).cursor==='grab')
 roleViewport.scrollTop=60;scrollTrack.setPointerCapture=()=>{}
 const point=(type,y)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:45,isPrimary:true,button:0,clientY:y})
 scrollThumb.dispatchEvent(point('pointerdown',50));scrollThumb.dispatchEvent(point('pointermove',120));scrollThumb.dispatchEvent(point('pointerup',120))
 record('Dragging the scrollbar hand moves only this host viewport',roleViewport.scrollTop>60)
 await new Promise(resolve=>setTimeout(resolve,580))
 record('Vertical canvas scrollbar position persists across reloads',saved.at(-1).agentBoardPatch.roleOffsets['mac-1']?.top>60)
 records=records.filter(item=>!item.id.startsWith('many-'));q('#agent-refresh').click();await sleep()
 const resize=q('[data-host="mac-1"] .agent-role-resize'),height=Number(resize.getAttribute('aria-valuenow'))
 resize.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await sleep()
 record('Keyboard adjusts all Agent role viewport heights consistently',
  Number(resize.getAttribute('aria-valuenow'))===height+10&&q('[data-host="local"] .agent-role-viewport').style.height===(height+10)+'px')

 const grid=q('.agent-grid')
 // The user-facing host-column selector moved into the Agent workgroup settings
 // (`#agent-group-columns`, ui/agent-groups.js) in the unified-workbench
 // revision. The board pane no longer owns a column control: it *receives* the
 // active workgroup's saved column count through workspace state and reports it
 // back on `agentBoardPatch.columns`. The matrix below therefore mounts the
 // board pane exactly the way the workgroup pane does, once per column count.
 // tests/workspace-mode-webkit.js and tests/language-webkit.js assert the real
 // `#agent-group-columns` control and its 1–6 options in the full application.
 const mountColumnBoard=async(columns,width)=>{
  const container=document.createElement('div')
  container.style.width=width+'px'
  document.body.append(container)
  const board=pane(container,hosts.filter(host=>host.id!=='local'),rpc,text=>messages.push(text),'mac-1',{agentBoard:{columns,hosts:[],initialized:false,roleHeight:270}})
  await waitFor(()=>!!container.querySelector('.agent-host-card')&&!!container.querySelector('.agent-role'))
  await sleep()
  return {container,board,grid:container.querySelector('.agent-grid')}
 }
 for(const width of [1000,600,380]){
  for(const columns of [1,2,3,4,5,6]){
   const mounted=await mountColumnBoard(columns,width)
   columnDetails.push({width,columns,mounted:!!mounted.grid,track:mounted.grid?getComputedStyle(mounted.grid).gridTemplateColumns:null,dataset:mounted.grid?.dataset.columns,boardScrollWidth:mounted.container.scrollWidth,boardClientWidth:mounted.container.clientWidth,hostCards:mounted.container.querySelectorAll('.agent-host-card').length})
   record(`Fixed ${columns} host columns at ${width}px, no horizontal board overflow`,
    getComputedStyle(mounted.grid).gridTemplateColumns.split(' ').length===columns&&
    mounted.container.scrollWidth<=mounted.container.clientWidth+1)
   mounted.board.dispose()
   mounted.container.remove()
  }
 }
 record('Column selection persists independently of other boards',saved.at(-1).agentBoardPatch.columns===6&&!saved.at(-1).boardPatch&&!saved.at(-1).fileBoardPatch)
 root.style.width='1000px';await sleep()
 const stale=records.find(item=>item.id==='s2')
 stale.engineHost={...stale.engineHost,name:'已过期的登记名'}
 hosts.find(host=>host.id==='win-1').name='Windows Engine · Renamed'
 q('#agent-refresh').click();await sleep()
 record('Cloud origin follows current host registration, not a stale role snapshot',q('[data-session="s2"] .agent-origin strong')?.textContent==='Windows Engine · Renamed')
 hosts.find(host=>host.id==='win-1').name='Windows Engine'
 q('#agent-refresh').click();await sleep()
 const beforeClaudeSockets=sockets.length;
 q('[data-session="s3"]').click();await waitFor(()=>sockets.length>beforeClaudeSockets);await sleep()
 record('Native PTY mounts only after opening its role',root.querySelectorAll('.xterm').length===1&&sockets.at(-1).url.searchParams.get('host')==='mac-1'&&sockets.at(-1).url.searchParams.get('terminal')==='s3')
 await waitFor(()=>sockets.at(-1).sent.some(frame=>frame.op==='ack'&&frame.seq===1))
 record('Terminal output is acknowledged after rendering',sockets.at(-1).sent.some(frame=>frame.op==='ack'&&frame.seq===1))
 q('[data-action="search"]').click();record('Search retained in role inspector',!q('.agent-card-search').hidden);q('[data-search="close"]').click()
 close();await sleep();record('Closing inspector disconnects renderer, preserves backend role',sockets.at(-1).readyState===3&&records.find(item=>item.id==='s3').running)
 // Reproduce Ctrl+C before the renderer's next 5s poll. The card still
 // advertises running, but the backend knows its PTY process already exited.
 records.find(item=>item.id==='s3').running=false;
 const reOpenSocketCount=sockets.length;
 q('[data-session="s3"]').click();await waitFor(()=>sockets.length>reOpenSocketCount);
 record('Single first click recovers a Ctrl+C exit even with stale running state in the card',
  operations.some(op=>op.method==='hosts.agent-activate'&&op.args.session==='s3')&&
  records.find(item=>item.id==='s3').running&&!!q('.agent-inspector'))
 record('Reopened PTY resumes its output cursor without duplicate output',sockets.at(-1).url.searchParams.get('cursor')==='14');
 // Ctrl+C exited the CLI while inspector remains open: clicking the status
 // must auto-activate and reopen, without exposing a manual Restart button.
 records.find(r=>r.id==='s3').running=false
 const deadSocket=sockets.at(-1)
 deadSocket.onmessage?.({data:JSON.stringify({output:'^C\r\n',cursor:15,seq:2,running:false,exitCode:130})})
 await waitFor(()=>!!q('.agent-card-state')?.textContent.includes('点击恢复'))
 record('Stopped PTY footer is clickable without requiring a Restart control',
  q('.agent-card-state')?.textContent.includes('点击恢复')&&!q('.agent-restart'))
 q('.agent-card-state')?.click()
 await waitFor(()=>operations.some(op=>op.method==='hosts.agent-activate'&&op.args.session==='s3'))
 await waitFor(()=>sockets.length>reOpenSocketCount+1)
 record('Clicking stopped PTY status relaunches automatically',
  operations.some(op=>op.method==='hosts.agent-activate'&&op.args.session==='s3')&&records.find(r=>r.id==='s3').running&&!!q('.agent-inspector'))
 close();await sleep()
 q('[data-session="s1"]').click();await sleep()
 await waitFor(()=>!!q('.agent-inspector .xterm'))
 record('Routed Codex renders the actual native CLI TUI, never the custom conversation UI',
  !!q('.agent-inspector .xterm')&&!q('.agent-conversation-log')&&
  operations.some(op=>op.method==='hosts.agent-tui'&&op.args.session==='s1'))
 const codexSocket=sockets.findLast(socket=>socket.url.searchParams.get('terminal')==='tui-s1')
 window.codexRouteDebug={host:codexSocket?.url.searchParams.get('host'),terminal:codexSocket?.url.searchParams.get('terminal'),thread:records.find(item=>item.id==='s1').threadId,opened:operations.filter(op=>op.method==='hosts.agent-tui').map(op=>op.args.session)}
 record('Existing Codex TUI binds to the exact requested native session and work host',
  codexSocket?.url.searchParams.get('host')==='mac-1'&&
  codexSocket?.url.searchParams.get('terminal')==='tui-s1'&&
  records.find(item=>item.id==='s1').threadId==='thread-s1')
 const originalThread=records.find(item=>item.id==='s1').threadId;
 const nativeLaunchCount=operations.filter(op=>op.method==='hosts.agent-open').length;
 let thirtyViews=true;
 for(let i=0;i<30;i++){
  close();await sleep();
  q('[data-session="s1"]').click();
  await waitFor(()=>!!q('.agent-inspector .xterm'));
  const mounted=q('.agent-inspector .xterm');
  if(!mounted||records.find(item=>item.id==='s1').threadId!==originalThread)thirtyViews=false;
 }
 record('Closing and reopening the same Codex inspector 30 times preserves its exact native thread',thirtyViews&&q('.agent-inspector .xterm')&&
  records.find(item=>item.id==='s1').threadId===originalThread);
 record('30 GUI reattachments never reopen engine instances or create duplicate Agent roles',
  operations.filter(op=>op.method==='hosts.agent-open').length===nativeLaunchCount&&
  records.filter(item=>item.id==='s1').length===1&&
  operations.filter(op=>op.method==='hosts.agent-tui'&&op.args.session==='s1').length>=30);
 record('No missing-rollout notice, custom text composer or injected model message appears',
  !q('.agent-recovery-note')&&!q('.agent-compose')&&
  !operations.some(op=>op.method==='hosts.agent-send'))
 q('.agent-rename-toggle').click();q('.agent-rename input').value='后端检查 <安全>'
 q('.agent-rename').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await sleep()
 record('Session rename updates card without invoking model or changing route',
  q('[data-session="s1"] .agent-role-name').textContent==='后端检查 <安全>'&&
  !operations.some(op=>op.method==='hosts.agent-send')&&records.find(item=>item.id==='s1').engineHostId==='local')
 close();await sleep();q('[data-host="mac-1"] [data-add-role]').click();await sleep()
 q('#agent-directory').value='/Users/dev/kept';q('#agent-source').value='local';q('#agent-source').dispatchEvent(new Event('change',{bubbles:true}));await sleep()
 record('Changing engine source does not overwrite target working directory',q('#agent-directory').value==='/Users/dev/kept')
 record('Remote work on a cloud machine exposes only Mac and the cloud machine as interactive Engine Origins',
  [...q('#agent-source').options].map(o=>o.value).join('|')==='local|mac-1'&&
  [...q('#agent-source').options].every(o=>!o.disabled))
 record('Remote engine choices include only the engines this work host verified',
  [...q('#agent-engine').options].map(o=>o.value).join('|')==='codex'&&
  [...q('#agent-engine').options].every(o=>!o.disabled))
 q('#agent-target').value='win-1';q('#agent-target').dispatchEvent(new Event('change',{bubbles:true}));await sleep()
 record('Changing work host defaults engine source to the same target machine',q('#agent-source').value==='win-1')
 record('Other cloud origins are absent (not gray/disabled); selected target and Mac remain clickable',
  [...q('#agent-source').options].map(o=>o.value).join('|')==='local|win-1'&&
  [...q('#agent-source').options].every(o=>!o.disabled)&&
  !q('#agent-source option[value="mac-1"]'))
 record('Same-host engine menu excludes uninstalled options instead of graying them out',
  [...q('#agent-engine').options].map(o=>o.value).join('|')==='codex|claude|cline'&&
  [...q('#agent-engine').options].every(o=>!o.disabled))
 q('#agent-source').value='local';q('#agent-source').dispatchEvent(new Event('change',{bubbles:true}));await sleep()
 record('Selecting local Mac Origin on a remote target enables verified remote Codex creation',
  q('#agent-source').value==='local'&&!q('#agent-start').disabled&&
  [...q('#agent-source').options].every(o=>!o.disabled))
 q('#agent-directory').value='C:\\projects\\new work';q('#agent-name').value='本机 Codex · 远端工作'
 delayList=true;q('#agent-refresh').click();await waitFor(()=>!!releaseList)
 q('.agent-create').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await sleep()
 releaseList?.();await waitFor(()=>!!q('[data-host="win-1"] [data-session="s6"]'))
 record('Creating a role during an older board refresh still opens the new role',!!q('.agent-inspector')&&!!q('[data-host="win-1"] [data-session="s6"]'))
 const created=operations.find(op=>op.method==='hosts.agent-open')
 record('Creation transmits launch source and target separately, preserves absolute path and name',created?.args.engineHostId==='local'&&created.args.targetHostId==='win-1'&&created.args.directory==='C:\\projects\\new work'&&created.args.name==='本机 Codex · 远端工作')
 record('Controller-local engine displays in remote WORK host with local Mac source',q('[data-host="win-1"] [data-session="s6"] .is-local strong').textContent==='Mac')
 q('.agent-end').click();record('First stop click requires confirmation and sends no stop',!operations.some(op=>op.method==='hosts.agent-close'))
 q('.agent-end').click();await sleep()
 record('Confirmed stop only stops selected work-target role',operations.find(op=>op.method==='hosts.agent-close')?.args.id==='win-1'&&!records.find(item=>item.id==='s6').running&&records.find(item=>item.id==='s1').running)
 close();await sleep()
 // A backend may accept a create request while the user closes its dialog.
 // Its late response must update the role list but never steal focus or popup.
 const previousCount=records.length
 q('[data-host="mac-1"] [data-add-role]').click();await sleep();
 q('#agent-name').value='Late background creation'
 q('#agent-directory').value='/Users/dev/work'
 waitOpen=true;q('.agent-create').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 await waitFor(()=>!!releaseOpen)
 const creationDialog=q('.agent-create-dialog')
 creationDialog?.querySelector('[data-close]')?.click()
 releaseOpen?.();await sleep();await sleep()
 record('16: cancelling create dialog stops a late backend success from opening an Agent inspector',
  !q('.agent-inspector')&&!q('.agent-create-dialog')&&records.length===previousCount+1&&
  q('[data-session="s7"]')?.querySelector('.agent-role-name')?.textContent==='Late background creation')
 const before=operations.length;controller.dispose();await sleep()
 record('Disposal closes owned views without stopping other backend roles',sockets.every(socket=>socket.readyState===3)&&!root.querySelector('dialog')&&!operations.slice(before).some(op=>op.method==='hosts.agent-close'))
 return {checks,passed:checks.every(check=>check.passed),statusFocusDetails:window.statusFocusDetails,errors:messages,debug:window.codexRouteDebug,iconGeometry,scrollbarDetails:window.scrollbarDetails,layoutDetails,columnDetails,tuiDetails}
}
