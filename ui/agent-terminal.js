import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import {SerializeAddon} from '@xterm/addon-serialize'
import {WebLinksAddon} from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
const names={codex:'Codex',claude:'Claude Code',cline:'Cline',pi:'Pi'}
const isPresent=node=>!!node?.isConnected
const snapshots=new Map()
function remember(item,view){
 try{
  const data=view.serialize.serialize()
  if(data.length>1024*1024)return
  snapshots.delete(item.terminalId||item.id);snapshots.set(item.terminalId||item.id,{data,cursor:view.cursor,cols:view.term.cols,rows:view.term.rows})
  while(snapshots.size>16||[...snapshots.values()].reduce((n,s)=>n+s.data.length,0)>8*1024*1024)snapshots.delete(snapshots.keys().next().value)
 }catch{}
}


export function agentTerminal(root,item,rpc,message,onExit=()=>{},onActivate=()=>{}){
 root.innerHTML=`<form class="agent-card-search" hidden><input type="search" placeholder="搜索终端输出" aria-label="搜索 Agent 会话输出"><span></span><button type="button" data-search="previous" aria-label="上一个">↑</button><button type="button" data-search="next" aria-label="下一个">↓</button><button type="button" data-search="close" aria-label="关闭搜索">×</button></form><div class="agent-session-surface"><div class="agent-session-hscroll"></div></div><div class="agent-card-foot"><button class="agent-card-state" type="button">连接中…</button><div><button type="button" data-action="search">搜索</button><button type="button" data-action="copy">复制</button><button type="button" data-action="paste">粘贴</button><button type="button" data-action="zoom">A±</button></div></div>`
 const node=root,card={node,view:null},surface=node.querySelector('.agent-session-surface')
    const searchForm=node.querySelector('.agent-card-search'),searchInput=searchForm.querySelector('input')
    const searchOutput=direction=>{
     const view=card.view;if(!view)return
     const text=searchInput.value
     const found=view.search[direction==='previous'?'findPrevious':'findNext'](text)
     searchForm.querySelector('span').textContent=found?'':'未找到'
    }
    const showSearch=()=>{searchForm.hidden=false;searchInput.focus();searchInput.select()}
    const closeSearch=()=>{searchForm.hidden=true;card.view?.search.clearDecorations();card.view?.term.focus()}
    node.querySelector('[data-action="search"]').onclick=showSearch
    searchForm.onsubmit=e=>{e.preventDefault();searchOutput('next')}
    searchInput.oninput=()=>searchOutput('next')
    searchForm.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeSearch()}}
    searchForm.onclick=e=>{const action=e.target.dataset.search;if(action==='close')closeSearch();else if(action)searchOutput(action)}
    card.showSearch=showSearch
    node.querySelector('[data-action="copy"]').onclick=async()=>{if(card.view)try{await navigator.clipboard.writeText(card.view.term.getSelection())}catch(error){message(error.message,'error')}}
    node.querySelector('[data-action="paste"]').onclick=async()=>{if(card.view)try{card.view.term.paste(await navigator.clipboard.readText());card.view.term.focus()}catch(error){message(error.message,'error')}}
    node.querySelector('[data-action="zoom"]').onclick=()=>{if(!card.view)return;const t=card.view.term;t.options.fontSize=t.options.fontSize>=19?12:t.options.fontSize+1;card.view.fit.fit()}
  const stored=snapshots.get(item.terminalId||item.id);snapshots.delete(item.terminalId||item.id)
  const term=new Terminal({cols:stored?.cols||90,rows:stored?.rows||25,allowProposedApi:true,cursorBlink:true,scrollback:8000,
   fontFamily:'"SFMono-Regular", Menlo, Consolas, monospace',fontSize:13,lineHeight:1.18,
   theme:{background:'#151d29',foreground:'#e4eaf4',cursor:'#c4d8ff',selectionBackground:'#385778'}})
  const fit=new FitAddon(),search=new SearchAddon(),serialize=new SerializeAddon()
  term.loadAddon(fit);term.loadAddon(search);term.loadAddon(serialize)
  term.loadAddon(new WebLinksAddon((event,url)=>{if(!event.metaKey&&!event.ctrlKey)return;if(window.webkit?.messageHandlers?.station)window.webkit.messageHandlers.station.postMessage({type:'open-link',url});else window.open(url,'_blank','noopener')}))
  const content=surface.querySelector('.agent-session-hscroll')
  term.open(content);card.view={item,term,fit,search,serialize,dead:false,cursor:stored?.cursor||0,socket:null,
   input:'',unacked:new Map(),unackedSize:0,inputSeq:0,protocol:false}
  const view=card.view
  const flush=()=>{
   const socket=view.socket
   if(view.dead||!view.protocol||socket?.readyState!==WebSocket.OPEN)return
   while(view.input.length&&view.unackedSize<65536){
    let chars=Math.min(16384,view.input.length,65536-view.unackedSize)
    if(chars<view.input.length&&view.input.charCodeAt(chars-1)>=0xD800&&view.input.charCodeAt(chars-1)<=0xDBFF)chars--
    if(!chars)break
    const data=view.input.slice(0,chars),seq=++view.inputSeq
    view.input=view.input.slice(chars)
    view.unacked.set(seq,data.length);view.unackedSize+=data.length
    socket.send(JSON.stringify({op:'input',data,seq}))
   }
  }
  term.onData(data=>{
   if(view.dead||!item.running)return
   if(!view.socket||view.socket.readyState===WebSocket.CLOSING||view.socket.readyState===WebSocket.CLOSED){
    message('Agent 会话连接中断，输入未发送。请重连并检查执行状态。','error');return
   }
   if(view.input.length+view.unackedSize+data.length>1024*1024){
    message('输入队列已满，请分批粘贴。此次输入未发送。','error');return
   }
   view.input+=data;flush()
  })
  term.attachCustomKeyEventHandler(event=>{
   if(event.type==='keydown'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){
    event.preventDefault();card.showSearch();return false
   }
   return true
  })
  const resize=()=>{
   if(view.dead||!isPresent(surface)||!surface.clientWidth||!surface.clientHeight)return
   content.style.minWidth=Math.round(term.options.fontSize*0.63*100+44)+'px'
   fit.fit()
   if(view.socket?.readyState===WebSocket.OPEN)view.socket.send(JSON.stringify({op:'resize',cols:term.cols,rows:term.rows}))
  }
  view.resizeObserver=new ResizeObserver(()=>resize());view.resizeObserver.observe(surface)
  const connect=()=>{
   if(view.dead||view.socket?.readyState===WebSocket.CONNECTING||view.socket?.readyState===WebSocket.OPEN)return
   const url=new URL('./terminal-stream',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:'
   url.searchParams.set('host',item.targetHostId||item.hostId);url.searchParams.set('terminal',item.terminalId||item.id)
   url.searchParams.set('cursor',String(view.cursor));url.searchParams.set('flow','1')
   const socket=view.socket=new WebSocket(url)
   view.protocol=false
   socket.onopen=()=>{if(view.dead)return;resize();card.node.querySelector('.agent-card-state').textContent='运行中 · '+names[item.engine]}
   socket.onmessage=event=>{
    if(view.dead||view.socket!==socket)return
    let reply
    try{reply=JSON.parse(event.data)}catch{return}
    if(reply.type==='ready'){view.protocol=reply.protocol>=2;flush();return}
    if(reply.inputAck!==undefined){
     view.unackedSize-=view.unacked.get(reply.inputAck)||0;view.unacked.delete(reply.inputAck);flush();return
    }
    if(reply.error){message(reply.error,'error');return}
    if(reply.reset)term.reset()
    const finished=()=>{
     if(view.dead)return
     view.cursor=reply.cursor??view.cursor
     if(reply.seq!==undefined&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({op:'ack',seq:reply.seq}))
     if(reply.running===false){
      term.options.disableStdin=true
      card.node.querySelector('.agent-card-state').textContent='已退出 · 点击恢复 · code '+(reply.exitCode??'—')
      socket.close()
      item.running=false
      onExit()
     }
    }
    if(reply.output)term.write(reply.output,finished);else finished()
   }
   socket.onclose=()=>{
    if(view.dead||view.socket!==socket)return
    if(view.unackedSize||view.input.length)message('连接中断：存在尚未确认写入的 Agent 输入，未自动重发；请检查执行状态。','error')
    view.input='';view.unacked.clear();view.unackedSize=0;view.protocol=false
    if(view.item.running)card.node.querySelector('.agent-card-state').textContent='连接断开 · 点击恢复'
   }
   socket.onerror=()=>{if(!view.dead)card.node.querySelector('.agent-card-state').textContent='连接失败 · 点击恢复'}
  }
  card.node.querySelector('.agent-card-state').onclick=()=>{if(!view.item.running){onActivate();return}if(view.socket?.readyState!==WebSocket.OPEN)connect()}
  const start=()=>{if(view.dead)return;connect();requestAnimationFrame(()=>{resize();if(!view.dead)term.focus()})}
  if(stored?.data)term.write(stored.data,start);else start()
 return ()=>{
  const view=card.view;if(!view)return
  view.dead=true
  if(view.unackedSize||view.input.length)message('存在未确认写入的输入；已停止转发且不会自动重发，请检查执行状态。','error')
  remember(item,view);view.socket?.close();view.resizeObserver.disconnect();view.term.dispose();card.view=null
 }
}
