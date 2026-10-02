import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const selectedSessions=new Map()
export function terminalPane(root,host,rpc,message){
  let disposed=false,current,items=[],pending='',inputTimer,inputChain=Promise.resolve(),operation=0
  root.innerHTML=`<div class="workbar"><div><strong>${esc(host.name)}</strong><span id="terminal-status">${host.os==='windows'?'PowerShell':'SSH'} · 选择或新建会话</span></div><select id="terminal-sessions" aria-label="终端会话"></select><button id="terminal-new" class="primary">＋ 新终端</button><button id="terminal-close" disabled>结束会话</button></div><div class="terminal-surface"><div class="terminal-placeholder"><span class="large-symbol">›_</span><h3>打开远端终端</h3><p>目录、环境变量与交互进程随会话保留。</p><code>${esc(host.defaultDirectory)}</code></div></div><div class="surface-foot"><span>SSH · ${esc(host.host)}</span><span>切换页面保留会话</span></div>`
  const q=s=>root.querySelector(s),surface=q('.terminal-surface')
  const status=text=>{if(!disposed&&q('#terminal-status').textContent!==text)q('#terminal-status').textContent=text}
  function options(){q('#terminal-sessions').innerHTML='<option value="" disabled>选择会话</option>'+items.map((t,i)=>`<option value="${esc(t.id)}">终端 ${i+1}${t.running?'':' · 已退出'}</option>`).join('');q('#terminal-sessions').value=current?.id||''}
  function send(){clearTimeout(inputTimer);inputTimer=null;if(!pending||!current)return;const data=pending,id=current.id;pending='';inputChain=inputChain.then(()=>rpc('hosts.terminal-input',{id:host.id,terminal:id,data})).catch(e=>{if(!disposed)message(e.message,'error')})}
  function detach(){send();const previous=current;current=null;if(!previous)return;previous.abort.abort();previous.observer.disconnect();clearTimeout(previous.resizeTimer);previous.term.dispose()}
  async function read(view){
    try{
      while(!disposed&&current===view){
        const reply=await rpc('hosts.terminal-read',{id:host.id,terminal:view.id,cursor:view.cursor,waitMs:15000},{signal:view.abort.signal})
        if(disposed||current!==view)return
        if(reply.reset){view.term.reset();if(!view.gapReported){message('输出超过缓存范围，已显示最近内容。');view.gapReported=true}}
        if(reply.output)await new Promise(resolve=>view.term.write(reply.output,resolve))
        if(disposed||current!==view)return
        view.cursor=reply.cursor
        status(reply.running?'运行中 · '+(host.os==='windows'?'PowerShell':'SSH'):'已退出 · code '+reply.exitCode)
        if(!reply.running){const item=items.find(t=>t.id===view.id);if(item)item.running=false;options();return}
      }
    }catch(e){if(!disposed&&current===view&&e.name!=='AbortError'){status('连接中断 · 重新进入此页面可恢复');message(e.message,'error')}}
  }
  function attach(item){
    if(disposed||current?.id===item.id)return
    detach();selectedSessions.set(host.id,item.id);surface.innerHTML='';q('#terminal-close').disabled=false
    const term=new Terminal({cursorBlink:true,fontFamily:'"SFMono-Regular", Menlo, Consolas, monospace',fontSize:13,lineHeight:1.25,scrollback:6000,theme:{background:'#141b24',foreground:'#d4deeb',cursor:'#95d4c6',selectionBackground:'#315064',black:'#15202b',blue:'#89b0fa',green:'#96d8b0',red:'#ec9a9a'}})
    const fit=new FitAddon();term.loadAddon(fit);term.open(surface);fit.fit()
    const view={id:item.id,term,fit,cursor:0,abort:new AbortController(),observer:null,resizeTimer:null};current=view
    term.onData(data=>{if(current!==view)return;pending+=data;if(!inputTimer)inputTimer=setTimeout(send,8)})
    let size=''
    const resize=()=>{if(disposed||current!==view||!surface.clientWidth||!surface.clientHeight)return;fit.fit();const next=term.cols+':'+term.rows;if(next===size)return;size=next;void rpc('hosts.terminal-resize',{id:host.id,terminal:view.id,cols:term.cols,rows:term.rows}).catch(e=>{if(current===view)message(e.message,'error')})}
    view.observer=new ResizeObserver(()=>{clearTimeout(view.resizeTimer);view.resizeTimer=setTimeout(resize,60)});view.observer.observe(surface)
    resize();options();term.focus();void read(view)
  }
  q('#terminal-new').onclick=async()=>{const ticket=++operation,button=q('#terminal-new');button.disabled=true;status('正在打开终端…');try{const item=await rpc('hosts.terminal-open',{id:host.id});if(disposed||ticket!==operation)return;items.push(item);attach(item)}catch(e){if(!disposed){status('打开失败');message(e.message,'error')}}finally{if(!disposed)button.disabled=false}}
  q('#terminal-sessions').onchange=e=>{const item=items.find(t=>t.id===e.target.value);if(item){operation++;attach(item)}}
  q('#terminal-close').onclick=async()=>{
    if(!current)return;const view=current,button=q('#terminal-close');button.disabled=true;send();await inputChain
    try{await rpc('hosts.terminal-close',{id:host.id,terminal:view.id});items=items.filter(t=>t.id!==view.id);if(selectedSessions.get(host.id)===view.id)selectedSessions.delete(host.id);if(disposed||current!==view)return;detach();surface.innerHTML='<div class="terminal-placeholder"><span class="large-symbol">›_</span><h3>会话已结束</h3><p>新建终端即可重新连接。</p></div>';options();status('已关闭')}
    catch(e){if(!disposed)message(e.message,'error')}
    finally{if(!disposed)button.disabled=!current}
  }
  const ticket=operation
  void rpc('hosts.terminal-list',{id:host.id}).then(result=>{if(disposed||ticket!==operation)return;items=result;options();if(items.length)attach(items.find(t=>t.id===selectedSessions.get(host.id))||items.find(t=>t.running)||items.at(-1))}).catch(e=>{if(!disposed)message(e.message,'error')})
  return ()=>{disposed=true;detach();clearTimeout(inputTimer)}
}
