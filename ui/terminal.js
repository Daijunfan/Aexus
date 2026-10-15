import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {SerializeAddon} from '@xterm/addon-serialize'
import {WebglAddon} from '@xterm/addon-webgl'
import {popover} from './popover.js'
import '@xterm/xterm/css/xterm.css'

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const selectedSessions=new Map()
const snapshots=new Map()
let renderers=0
const MAX_CACHED_VIEWS=4, INPUT_WINDOW=65536, MAX_QUEUED_INPUT=1024*1024
function saveSnapshot(key,value){
  snapshots.delete(key);snapshots.set(key,value)
  let size=[...snapshots.values()].reduce((n,s)=>n+s.data.length,0)
  while(size>8*1024*1024||snapshots.size>20){const oldest=snapshots.keys().next().value;size-=snapshots.get(oldest).data.length;snapshots.delete(oldest)}
}

export function terminalPane(root,host,rpc,message,_configure,_loadClient,{autofocus=true}={}){
  let disposed=false,current,items=[],operation=0,inViewport=true,clock=0,panes=[]
  const views=new Map(),focusAnchor=document.activeElement
  root.innerHTML=`<div class="workbar terminal-heading"><div><strong data-no-i18n>${esc(host.name)}</strong><span id="terminal-status">正在读取会话…</span></div></div><div class="terminal-toolbar"><nav id="terminal-sessions" class="terminal-tabbar" role="tablist" aria-label="终端会话"></nav><div class="terminal-actions"><button id="terminal-reconnect" title="重新连接" aria-label="重新连接" hidden>↻</button><button id="terminal-new" class="primary" title="新建终端" aria-label="新建终端">＋</button><button id="terminal-close" title="结束终端及运行任务" aria-label="结束终端及运行任务" disabled>×</button><button id="terminal-more" aria-label="更多终端操作" title="搜索、分屏、复制与显示设置">⋯</button></div></div><form class="terminal-search" hidden><input type="search" aria-label="搜索终端内容" placeholder="搜索终端内容"><span role="status"></span><button type="button" data-search="previous" aria-label="上一个匹配">↑</button><button type="button" data-search="next" aria-label="下一个匹配">↓</button><button type="button" data-search="close" aria-label="关闭终端搜索">×</button></form><div class="terminal-surface"><div class="terminal-placeholder"><h3>正在准备终端</h3></div></div><div class="surface-foot"><span>SSH · ${esc(host.host)}</span><span>Tab 补全 · Ctrl+C 中断 · ⌘/Ctrl+F 搜索</span></div>`
  const q=s=>root.querySelector(s),surface=q('.terminal-surface'),tabs=q('#terminal-sessions')
  const status=text=>{if(!disposed&&q('#terminal-status').textContent!==text)q('#terminal-status').textContent=text}
  const visible=()=>!disposed&&inViewport&&!document.hidden&&root.getClientRects().length>0
  const shown=view=>panes.includes(view)&&visible()
  const snapshotKey=id=>host.id+':'+id
  function focus(view){if(view.retired||!panes.includes(view))return;current=view;view.used=++clock;for(const item of panes){item.element.classList.toggle('focused',item===view);item.term.options.cursorBlink=item===view&&visible()}options();updateStatus(view)}
  function accelerate(view){
    if(view.rendererTried||renderers>=4||!shown(view))return
    view.rendererTried=true
    try{const renderer=new WebglAddon();view.term.loadAddon(renderer);view.renderer=renderer;renderers++;view.element.dataset.renderer='webgl';renderer.onContextLoss(()=>{if(view.renderer){view.renderer=null;renderers--;renderer.dispose();view.element.dataset.renderer='dom'}})}catch{view.element.dataset.renderer='dom'}
  }
  function search(direction='next'){
    if(!current)return
    const text=q('.terminal-search input').value
    const found=current.search[direction==='previous'?'findPrevious':'findNext'](text,{decorations:{matchBackground:'#314263',activeMatchBackground:'#4d6396',matchOverviewRuler:'#7085b8',activeMatchColorOverviewRuler:'#b8caff'}})
    if(!found)q('.terminal-search [role=status]').textContent=text?'未找到':''
  }
  function openSearch(){q('.terminal-search').hidden=false;q('.terminal-search input').focus();q('.terminal-search input').select()}
  function closeSearch(){q('.terminal-search').hidden=true;current?.search.clearDecorations();current?.term.focus()}
  q('.terminal-search').onsubmit=event=>{event.preventDefault();search()}
  q('.terminal-search input').oninput=()=>search()
  q('.terminal-search').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();closeSearch()}}
  q('.terminal-search').onclick=event=>{const action=event.target.dataset.search;if(action==='close')closeSearch();else if(action)search(action)}
  function revealTab(){
    const button=tabs.querySelector('[aria-selected="true"]');if(!button)return
    const bounds=tabs.getBoundingClientRect(),rect=button.getBoundingClientRect()
    if(rect.left<bounds.left)tabs.scrollLeft-=bounds.left-rect.left
    else if(rect.right>bounds.right)tabs.scrollLeft+=rect.right-bounds.right
  }
  function options(){
    if(disposed)return
    const ids=new Set(items.map(item=>item.id)),buttons=new Map([...tabs.children].map(button=>[button.dataset.terminal,button]))
    for(const button of [...tabs.children])if(!ids.has(button.dataset.terminal))button.remove()
    for(const [index,item] of items.entries()){
      let button=buttons.get(item.id)
      if(!button){button=document.createElement('button');button.dataset.terminal=item.id;button.setAttribute('role','tab');tabs.append(button)}
      const label=`终端 ${index+1}`,selected=String(item.id===current?.id)
      button.title=item.running?'切换终端':'重新连接此终端'
      if(button.textContent!==label)button.textContent=label
      if(button.getAttribute('aria-selected')!==selected)button.setAttribute('aria-selected',selected)
      button.tabIndex=item.id===current?.id?0:-1
    }
    revealTab();q('#terminal-close').disabled=!current
    q('#terminal-reconnect').hidden=!current||current.exited||current.socket?.readyState===WebSocket.OPEN||current.socket?.readyState===WebSocket.CONNECTING
  }
  function flush(view,force=false){
    view.flushScheduled=false
    if(view.socket?.readyState!==WebSocket.OPEN)return
    while(view.input.length&&(force||!view.protocol||view.unackedSize<INPUT_WINDOW)){
      let end=Math.min(16384,view.input.length)
      const last=view.input.charCodeAt(end-1)
      if(end<view.input.length&&last>=0xD800&&last<=0xDBFF)end--
      const data=view.input.slice(0,end),seq=++view.inputSeq
      view.socket.send(JSON.stringify({op:'input',data,seq}));view.input=view.input.slice(end)
      if(view.protocol){view.unacked.set(seq,data.length);view.unackedSize+=data.length}
    }
  }
  function input(view,data){
    if(view.retired||view.exited)return
    if(view.input.length+data.length>MAX_QUEUED_INPUT){message('待发送输入过大，请等待发送完成后分批粘贴。此次输入未发送。','error');return}
    view.input+=data
    if(!view.flushScheduled){view.flushScheduled=true;queueMicrotask(()=>flush(view))}
  }
  function retire(view){
    if(view.retired)return
    if(view.processing||view.restoring){view.retireRequested=true;return}
    view.retired=true
    // WebSocket close follows its already-queued messages. Do not reroute them
    // through HTTP, which could reorder or duplicate input during a tab switch.
    if(view.socket?.readyState===WebSocket.OPEN){flush(view,true);view.socket.close()}
    if(!view.closed)saveSnapshot(snapshotKey(view.id),{data:view.serialize.serialize(),cursor:view.cursor,cols:view.term.cols,rows:view.term.rows,viewport:view.term.buffer.active.viewportY,selection:view.term.getSelectionPosition(),fontSize:view.term.options.fontSize,hscroll:view.element.scrollLeft})
    if(view.renderer){view.renderer=null;renderers--}
    view.term.dispose();view.element.remove();views.delete(view.id)
  }
  function trim(){
    while(views.size>MAX_CACHED_VIEWS){
      const candidate=[...views.values()].filter(v=>!panes.includes(v)&&!v.processing&&!v.restoring&&!v.input.length&&!v.unackedSize).sort((a,b)=>a.used-b.used)[0]
      if(!candidate)break
      retire(candidate)
    }
  }
  function updateStatus(view){
    if(current!==view||disposed)return
    status(view.exited?'已退出 · code '+(view.exitCode??'—'):view.socket.readyState===WebSocket.OPEN?'运行中 · '+(host.os==='windows'?'PowerShell':'SSH'):'连接中断 · 会话保留')
    q('#terminal-reconnect').hidden=view.exited||view.socket.readyState===WebSocket.OPEN||view.socket.readyState===WebSocket.CONNECTING
  }
  function pump(view){
    if(view.retired||view.processing||!shown(view)||!view.frames.length)return
    const frame=view.frames.shift();view.frameChars-=frame.reply.output?.length||0
    const {reply,socket}=frame
    view.processing=true
    if(reply.reset){view.term.reset();if(!view.gapReported){message('后台输出超过历史缓存范围，已恢复最近内容。');view.gapReported=true}}
    const complete=()=>{
      view.processing=false
      if(view.retired)return
      view.cursor=reply.cursor??view.cursor
      if(reply.seq!==undefined&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({op:'ack',seq:reply.seq}))
      if(reply.running===false){view.exited=true;view.exitCode=reply.exitCode;view.term.options.disableStdin=true;const item=items.find(t=>t.id===view.id);if(item)item.running=false;options()}
      updateStatus(view)
      if(view.reconnecting&&view.exited){view.reconnecting=false;void renew(view);return}
      if(view.automatic&&view.exited){void closeSession(view,'连接未能保持，点击 ＋ 重试。').catch(error=>{if(!disposed)message(error.message,'error')});return}
      if(view.retireRequested){retire(view);return}
      if(view.reconnectAfterWrite){view.reconnectAfterWrite=false;connect(view);return}
      pump(view)
    }
    if(reply.output)view.term.write(reply.output,complete);else complete()
  }
  function connect(view){
    if(view.retired)return
    view.frames=[];view.frameChars=0;view.protocol=false;view.unacked.clear();view.unackedSize=0
    const url=new URL('./terminal-stream',location.href)
    url.protocol=location.protocol==='https:'?'wss:':'ws:'
    url.searchParams.set('host',host.id);url.searchParams.set('terminal',view.id);url.searchParams.set('cursor',String(view.cursor));url.searchParams.set('flow','1')
    const socket=view.socket=new WebSocket(url)
    socket.onopen=()=>{
      if(view.socket!==socket)return
      flush(view,view.retired)
      if(view.retired){socket.close();return}
      view.term.options.disableStdin=!!view.exited;resize(view);updateStatus(view)
    }
    socket.onmessage=event=>{
      if(view.retired||view.socket!==socket)return
      try{
        const reply=JSON.parse(event.data)
        if(reply.type==='ready'){view.protocol=reply.protocol>=2;flush(view);return}
        if(reply.inputAck!==undefined){view.unackedSize-=view.unacked.get(reply.inputAck)||0;view.unacked.delete(reply.inputAck);flush(view);trim();return}
        if(reply.error)throw Error(reply.error)
        if(view.frameChars+(reply.output?.length||0)>512*1024){
          // Compatibility with an older running backend; new backends use ACKs.
          view.frames=[];view.frameChars=0;reply.reset=true
        }
        view.frames.push({reply,socket});view.frameChars+=reply.output?.length||0;pump(view)
      }catch(error){view.term.options.disableStdin=true;message(error.message,'error');socket.close()}
    }
    socket.onclose=()=>{
      if(view.retired||view.socket!==socket)return
      view.term.options.disableStdin=true
      if(view.input.length||view.unackedSize)message(`连接中断：${view.input.length} 个字符尚未发送，${view.unackedSize} 个字符尚未确认写入。为避免重复执行，未自动重发；请检查命令后重新连接。`,'error')
      view.input='';view.unacked.clear();view.unackedSize=0
      updateStatus(view)
    }
    socket.onerror=()=>{if(!view.retired&&current===view)status('连接失败 · 点击重新连接')}
  }
  function resize(view=current){
    if(!view||!shown(view)||view.retired||view.restoring||!surface.clientWidth||!surface.clientHeight)return
    // Preserve a readable native terminal width in narrow board cards. The
    // outer panel scrolls horizontally; xterm fits to this actual inner width.
    if(view.content)view.content.style.minWidth=Math.round(view.term.options.fontSize*0.63*100+44)+'px'
    view.fit.fit()
    const size=view.term.cols+':'+view.term.rows
    if(view.socket?.readyState===WebSocket.OPEN&&view.size!==size){view.size=size;view.socket.send(JSON.stringify({op:'resize',cols:view.term.cols,rows:view.term.rows}))}
  }
  function attach(item,slot=Math.max(0,panes.indexOf(current))){
    if(disposed)return
    if(!item.running){void renew(item);return}
    if(current?.id===item.id){resume(current);return}
    const previous=panes[slot]
    if(previous){flush(previous);previous.element.hidden=true;previous.term.options.cursorBlink=false}
    selectedSessions.set(host.id,item.id)
    let view=views.get(item.id)
    if(!view){
      surface.querySelector('.terminal-placeholder')?.remove()
      const element=document.createElement('div');element.className='terminal-view';element.dataset.session=item.id
      const content=document.createElement('div');content.className='terminal-hscroll-content';element.append(content);surface.prepend(element)
      const saved=snapshots.get(snapshotKey(item.id));snapshots.delete(snapshotKey(item.id))
      const term=new Terminal({allowProposedApi:true,cols:saved?.cols||80,rows:saved?.rows||24,windowsPty:host.os==='windows'?{backend:'conpty',buildNumber:host.status?.environment?.buildNumber}:undefined,cursorBlink:false,fontFamily:'"SFMono-Regular", Menlo, Consolas, monospace',fontSize:saved?.fontSize||14,lineHeight:1.2,scrollback:6000,theme:{background:'#141b24',foreground:'#e2e9f2',cursor:'#b9d7ff',selectionBackground:'#315064'}})
      const fit=new FitAddon();term.loadAddon(fit);term.open(content)
      const serialize=new SerializeAddon(),find=new SearchAddon();term.loadAddon(serialize);term.loadAddon(find)
      term.loadAddon(new WebLinksAddon((event,url)=>{if(!event.ctrlKey&&!event.metaKey)return;if(window.webkit?.messageHandlers?.station)window.webkit.messageHandlers.station.postMessage({type:'open-link',url});else window.open(url,'_blank','noopener')}))
      view={id:item.id,term,fit,serialize,search:find,element,content,cursor:saved?.cursor||0,input:'',inputSeq:0,unacked:new Map(),unackedSize:0,frames:[],frameChars:0,exited:!item.running,automatic:!!item.automatic,restoring:!!saved}
      views.set(item.id,view)
      // A delayed IME commit belongs to the textarea that received it, even
      // when the user has already selected a different terminal.
      term.onData(data=>input(view,data))
      term.attachCustomKeyEventHandler(event=>{
        if(event.type==='keyup'&&!panes.includes(view))return false
        if(event.type!=='keydown')return true
        if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'){event.preventDefault();focus(view);openSearch();return false}
        if((event.metaKey||event.ctrlKey)&&['+','=','-','0'].includes(event.key)){event.preventDefault();term.options.fontSize=event.key==='0'?14:Math.max(10,Math.min(24,term.options.fontSize+(event.key==='-'?-1:1)));resize(view);return false}
        return true
      })
      element.addEventListener('focusin',()=>focus(view));element.addEventListener('mousedown',()=>focus(view))
      find.onDidChangeResults(result=>{if(current===view)q('.terminal-search [role=status]').textContent=result.resultCount?(result.resultIndex+1)+' / '+result.resultCount:'未找到'})
      if(saved)term.write(saved.data,()=>{view.restoring=false;if(view.retireRequested){retire(view);return}if(saved.selection)term.select(saved.selection.start.x,saved.selection.start.y,(saved.selection.end.y-saved.selection.start.y)*term.cols+saved.selection.end.x-saved.selection.start.x);term.scrollToLine(saved.viewport);resize(view);element.scrollLeft=saved.hscroll||0;pump(view)})
      current=view;panes[slot]=view;connect(view)
    }else {current=view;resume(view)}
    const existing=panes.indexOf(view);if(existing>=0&&existing!==slot)panes[slot]=previous;else panes[slot]=view
    surface.classList.toggle('is-split',panes.length>1)
    for(const item of panes){surface.append(item.element);item.element.hidden=false}
    view.used=++clock
    accelerate(view)
    view.term.options.cursorBlink=visible();resize(view);pump(view);updateStatus(view);options();trim()
    if(autofocus&&(document.activeElement===focusAnchor||root.contains(document.activeElement)))view.term.focus()
  }
  function resume(view){
    if(view.socket?.readyState===WebSocket.CLOSED||view.socket?.readyState===3){
      view.reconnecting=true
      if(view.processing)view.reconnectAfterWrite=true
      else connect(view)
    }
  }
  async function renew(item){
    if(item.renewing)return
    item.renewing=true
    try{await closeSession(views.get(item.id)||item);if(!disposed)await openNew(false,true,true)}
    catch(error){if(!disposed)message(error.message,'error')}
  }
  let resizeTimer
  const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{for(const view of panes)resize(view)},60)});observer.observe(surface)
  const visibility=()=>{for(const view of panes)if(!view.retired){view.term.options.cursorBlink=visible();if(visible()){accelerate(view);resize(view);pump(view)}}}
  const intersection=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;visibility()}):null
  intersection?.observe(root);document.addEventListener('visibilitychange',visibility)
  async function openNew(split=false,focusInput=false,automatic=false){
    const ticket=++operation,button=q('#terminal-new');button.disabled=true;status('正在打开终端…')
    const requestedFrom=document.activeElement
    try{const item=await rpc('hosts.terminal-open',{id:host.id});if(!item.running){await rpc('hosts.terminal-close',{id:host.id,terminal:item.id});if(!disposed)status('连接失败');return}if(disposed)return;item.automatic=automatic;items.push(item);if(ticket===operation){attach(item,split?1:Math.max(0,panes.indexOf(current)));if(focusInput&&(document.activeElement===requestedFrom||root.contains(document.activeElement)||document.activeElement===document.body))current.term.focus()}else options()}
    catch(error){if(!disposed){status('打开失败');message(error.message,'error')}}
    finally{if(!disposed)button.disabled=false}
  }
  q('#terminal-new').onclick=()=>void openNew(false,true)
  q('#terminal-more').onclick=()=>{
    const menu=popover(q('#terminal-more'),'<button data-action="search">搜索终端内容</button><button data-action="split">'+(panes.length>1?'合并分屏':'分屏新终端')+'</button><button data-action="copy">复制选中文字</button><button data-action="paste">粘贴</button><button data-action="select">全选</button><button data-action="clear">清空画面</button><button data-action="zoom-in">放大字体</button><button data-action="zoom-out">缩小字体</button>',{width:190})
    menu.element.onclick=async event=>{const action=event.target.dataset.action;if(!action||!current)return;menu.close();try{
      if(action==='search')openSearch()
      if(action==='split'){if(panes.length>1){for(const view of panes)if(view!==current)view.element.hidden=true;panes=[current];surface.classList.remove('is-split');resize();current.term.focus()}else void openNew(true,true)}
      if(action==='copy')await navigator.clipboard.writeText(current.term.getSelection())
      if(action==='paste'){current.term.paste(await navigator.clipboard.readText());current.term.focus()}
      if(action==='select')current.term.selectAll()
      if(action==='clear')current.term.clear()
      if(action==='zoom-in'||action==='zoom-out'){current.term.options.fontSize=Math.max(10,Math.min(24,current.term.options.fontSize+(action==='zoom-in'?1:-1)));resize()}
    }catch(error){message(error.message,'error')}}
  }
  tabs.onclick=event=>{const item=items.find(t=>t.id===event.target.closest('[data-terminal]')?.dataset.terminal);if(item){operation++;attach(item);current?.term.focus()}}
  tabs.onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!items.length)return
    event.preventDefault();const at=items.findIndex(t=>t.id===current?.id),next=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowRight'?1:-1)+items.length)%items.length
    operation++;attach(items[next]);tabs.querySelector('[aria-selected="true"]')?.focus()
  }
  tabs.addEventListener('wheel',event=>{if(Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;const before=tabs.scrollLeft;tabs.scrollLeft+=event.deltaY;if(tabs.scrollLeft!==before)event.preventDefault()},{passive:false})
  q('#terminal-reconnect').onclick=()=>{if(!current)return;if(current.processing)current.reconnectAfterWrite=true;else connect(current);options();current.term.focus()}
  async function closeSession(view,emptyMessage='新建终端即可重新连接。'){
    if(view.closing)return
    view.closing=true
    try{
      await rpc('hosts.terminal-close',{id:host.id,terminal:view.id})
      const at=items.findIndex(t=>t.id===view.id);items=items.filter(t=>t.id!==view.id)
      if(selectedSessions.get(host.id)===view.id)selectedSessions.delete(host.id)
      if(current===view)current=null
      panes=panes.filter(item=>item!==view);view.closed=true;snapshots.delete(snapshotKey(view.id))
      if(view.term)retire(view)
      if(disposed)return
      surface.classList.toggle('is-split',panes.length>1)
      if(!current&&panes.length){current=panes[0];resize();updateStatus(current)}
      else if(!current&&items.some(t=>t.running))attach(items.slice(Math.max(0,at)).find(t=>t.running)||items.find(t=>t.running))
      if(!current){surface.innerHTML='<div class="terminal-placeholder"><h3>暂无连接</h3><p>'+esc(emptyMessage)+'</p></div>';status('未连接')}
      options()
      if(root.contains(document.activeElement))current?.term.focus()
    }finally{view.closing=false}
  }
  q('#terminal-close').onclick=()=>{
    const target=current;if(!target)return
    const menu=popover(q('#terminal-close'),'<div class="popover-heading">结束此终端及运行任务？</div><button class="danger" data-end>确认结束</button><button data-cancel>取消</button>',{width:240})
    menu.element.querySelector('[data-cancel]').onclick=()=>menu.close()
    menu.element.querySelector('[data-end]').onclick=()=>{menu.close();if(!disposed)void closeSession(target).catch(error=>message(error.message,'error'))}
  }
  const ticket=operation
  void rpc('hosts.terminal-list',{id:host.id}).then(async result=>{
    if(disposed||ticket!==operation)return
    // Only records confirmed exited by the broker are removed. A lost viewer
    // socket must never kill a still-running SSH job.
    const expired=result.filter(t=>!t.running)
    await Promise.all(expired.map(t=>rpc('hosts.terminal-close',{id:host.id,terminal:t.id}).then(()=>snapshots.delete(snapshotKey(t.id)))))
    if(disposed||ticket!==operation)return
    const preferred=selectedSessions.get(host.id)||result[0]?.id
    items=result.filter(t=>t.running);options()
    const item=items.find(t=>t.id===selectedSessions.get(host.id))||items.find(t=>host.os!=='windows'||t.runtimeVersion>=2)
    if(item&&!expired.some(t=>t.id===preferred))attach(item);else void openNew(false,false,true)
  }).catch(error=>{if(!disposed)message(error.message,'error')})
  const activate=()=>{if(q('#terminal-new').disabled)return;if(!current)void openNew(false,false,true);else if(current.exited)void renew(current);else resume(current)}
  root.addEventListener('terminal-activate',activate)
  return ()=>{disposed=true;root.removeEventListener('terminal-activate',activate);clearTimeout(resizeTimer);observer.disconnect();intersection?.disconnect();document.removeEventListener('visibilitychange',visibility);for(const view of [...views.values()])retire(view);current=null}
}
