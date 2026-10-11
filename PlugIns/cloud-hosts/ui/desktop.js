const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function desktopPane(root,host,rpc,message,configure,loadClient){
  let disposed=false,rfb,session,pollTimer,connecting,revision=0
  const profile=host.desktop,native=profile?.protocol==='rdp'
  const welcome=()=>`<div class="desktop-placeholder"><span class="large-symbol" aria-hidden="true">▱</span><h3>${profile?native?'在原生客户端中打开桌面':'连接远程桌面':'配置远程桌面'}</h3><p>${profile?native?'使用系统客户端完成登录与桌面操作。':'画面、键盘和鼠标直接在这里交互。':'选择主机已有的 RDP 或 VNC 服务。'}</p>${profile?`<code>${esc(profile.address)}:${profile.port} · ${profile.viaHostId?'SSH 加密':'直接连接'}</code>`:'<button id="desktop-setup" class="primary">连接设置</button>'}</div>`
  root.innerHTML=`<div class="workbar"><div><strong>${esc(host.name)}</strong><span id="desktop-status">${profile?profile.protocol.toUpperCase()+' · 尚未连接':'尚未配置桌面'}</span></div><button id="desktop-settings">连接设置</button><button id="desktop-connect" class="primary" ${profile?'':'disabled'}>连接桌面</button><button id="desktop-disconnect" disabled>${native&&!profile.viaHostId?'关闭连接记录':'断开'}</button></div><div id="desktop-screen" class="desktop-surface idle">${welcome()}</div><div id="desktop-auth" hidden></div><div class="desktop-tools" hidden><label>画质 <select id="desktop-quality"><option value="fast">流畅</option><option value="balanced">均衡</option><option value="sharp">清晰</option></select></label><label><input id="desktop-view-only" type="checkbox"> 只读</label><button id="desktop-cad">Ctrl · Alt · Del</button><button id="desktop-fullscreen">全屏</button></div><div class="surface-foot"><span>${profile?.viaHostId?'SSH 加密通道':'远程桌面'}</span><span>切换页面保留通道</span></div>`
  const q=s=>root.querySelector(s),screen=q('#desktop-screen')
  const status=text=>{if(!disposed&&q('#desktop-status').textContent!==text)q('#desktop-status').textContent=text}
  const disconnectLabel=native&&!profile.viaHostId?'关闭连接记录':'断开'
  const current=ticket=>!disposed&&ticket===revision
  const detach=()=>{const previous=rfb;rfb=null;previous?.disconnect()}
  const quality=()=>{if(!rfb)return;const mode=q('#desktop-quality').value;rfb.qualityLevel=mode==='sharp'?9:mode==='fast'?3:6;rfb.compressionLevel=mode==='fast'?6:2}
  q('#desktop-settings').onclick=configure;if(q('#desktop-setup'))q('#desktop-setup').onclick=configure
  q('#desktop-quality').value=profile?.quality||'balanced';q('#desktop-quality').onchange=quality
  q('#desktop-view-only').onchange=e=>{if(rfb)rfb.viewOnly=e.target.checked;q('#desktop-cad').disabled=e.target.checked}
  q('#desktop-cad').onclick=()=>{if(rfb&&!rfb.viewOnly)rfb.sendCtrlAltDel()}
  q('#desktop-fullscreen').onclick=()=>screen.requestFullscreen().catch(e=>message(e.message,'error'))
  async function monitor(){
    clearTimeout(pollTimer);if(disposed||!session||document.hidden||rfb)return
    const ticket=revision,id=session.id
    try{const items=await rpc('hosts.desktop-list',{id:host.id});if(!current(ticket)||session?.id!==id)return;const item=items.find(d=>d.id===id)
      if(!item||item.state==='disconnected'){status(item?.error||'通道已关闭');q('#desktop-connect').disabled=false;session=item; q('#desktop-disconnect').disabled=!item;return}
      if(item.state==='ready'&&session.state==='connecting'){session=item;status('已有通道 · 点击连接桌面继续');q('#desktop-disconnect').textContent=disconnectLabel}
    }catch(e){if(current(ticket))message(e.message,'error')}
    if(current(ticket))pollTimer=setTimeout(monitor,5000)
  }
  async function stop(){
    const pending=connecting,ticket=++revision;clearTimeout(pollTimer);detach();q('#desktop-disconnect').disabled=true;q('#desktop-connect').disabled=true;status(pending?'正在取消连接…':'正在断开…')
    try{
      let target=session
      if(!target&&pending){target=(await rpc('hosts.desktop-list',{id:host.id})).find(d=>d.state==='connecting'||d.state==='ready');if(!target)target=await pending.catch(()=>null)}
      if(target)await rpc('hosts.desktop-close',{id:host.id,session:target.id});if(!current(ticket))return;session=null;screen.classList.add('idle');screen.innerHTML=welcome();q('.desktop-tools').hidden=true;q('#desktop-auth').hidden=true;status(native&&!profile.viaHostId?'连接记录已关闭 · 客户端请单独退出':'已断开')}
    catch(e){if(current(ticket))message(e.message,'error')}
    finally{if(current(ticket)){q('#desktop-connect').disabled=false;q('#desktop-disconnect').disabled=!session;q('#desktop-disconnect').textContent=disconnectLabel}}
  }
  q('#desktop-disconnect').onclick=stop
  q('#desktop-connect').onclick=async()=>{
    const ticket=++revision;clearTimeout(pollTimer);detach();q('#desktop-connect').disabled=true;q('#desktop-disconnect').disabled=false;q('#desktop-disconnect').textContent='取消连接';status('正在建立通道…')
    const pending=rpc('hosts.desktop-open',{id:host.id});connecting=pending
    try{
      const [connection,RFB]=await Promise.all([pending,native?null:loadClient('vnc').catch(error=>({error}))]);if(!current(ticket))return;session=connection;connecting=null;q('#desktop-disconnect').disabled=false;q('#desktop-disconnect').textContent=disconnectLabel;if(RFB?.error)throw RFB.error
      if(native){
        screen.innerHTML='<div class="desktop-placeholder"><span class="large-symbol" aria-hidden="true">▱</span><h3>RDP 通道已就绪</h3><p>在系统客户端中完成身份验证。</p><div class="desktop-actions"><button id="desktop-launch" class="primary">打开 RDP 客户端</button><button id="desktop-download">下载 .rdp 配置</button></div><p class="hint">macOS 使用 Windows App · Windows 使用系统远程桌面</p></div>'
        if(connection.nativeLaunchAllowed===false){q('#desktop-launch').hidden=true;screen.querySelector('.hint').textContent=connection.browserNote;}
        q('#desktop-launch').onclick=async()=>{const button=q('#desktop-launch');button.disabled=true;try{await rpc('hosts.desktop-launch',{id:host.id,session:connection.id});if(current(ticket))status('客户端已启动 · 请完成桌面登录')}catch(e){if(current(ticket))message('无法打开 RDP 客户端：'+e.message+'。可下载配置后打开。','error')}finally{if(current(ticket))button.disabled=false}}
        q('#desktop-download').onclick=()=>{const url=URL.createObjectURL(new Blob([connection.profile],{type:'application/x-rdp'})),a=document.createElement('a');a.href=url;a.download='cloud-desktop.rdp';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
        status('通道就绪 · 等待桌面登录');void monitor()
      }else{
        if(!connection.webRelay&&!['127.0.0.1','localhost'].includes(location.hostname))throw Error('当前入口没有可用的安全桌面转发，请使用 Core 桌面 App 或 Web 网关。')
        screen.classList.remove('idle');screen.innerHTML='';const client=new RFB(screen,session.wsUrl,{shared:true});rfb=client;client.scaleViewport=true;client.background='#141b24';client.viewOnly=q('#desktop-view-only').checked;quality();q('.desktop-tools').hidden=false
        const active=()=>current(ticket)&&rfb===client
        client.addEventListener('connect',()=>{if(active()){status('桌面已连接');q('#desktop-auth').hidden=true}})
        client.addEventListener('disconnect',e=>{if(!active())return;rfb=null;status(e.detail.clean?'桌面已断开':'连接中断 · 点击连接桌面重试');q('#desktop-connect').disabled=false;q('#desktop-auth').hidden=true;void monitor()})
        client.addEventListener('securityfailure',e=>{if(active())message('桌面认证失败：'+(e.detail.reason||'请检查登录信息'),'error')})
        client.addEventListener('credentialsrequired',e=>{
          if(!active())return;q('#desktop-auth').hidden=false;q('#desktop-auth').innerHTML=`<form id="vnc-login"><strong>桌面身份验证</strong>${e.detail.types.map(type=>`<label>${({username:'用户名',password:'密码',target:'目标'})[type]||esc(type)}<input name="${esc(type)}" type="${type==='password'?'password':'text'}" autocomplete="off" required></label>`).join('')}<button class="primary">登录</button></form>`
          q('#vnc-login input')?.focus();q('#vnc-login').onsubmit=event=>{event.preventDefault();if(!active())return;client.sendCredentials(Object.fromEntries(new FormData(event.target)));event.target.reset();q('#desktop-auth').hidden=true}
        })
        client.addEventListener('serververification',()=>{if(active()){message('此 VNC 服务需要额外公钥验证，请使用已验证的 SSH 通道或系统客户端','error');client.disconnect()}})
        status('正在进行桌面握手…')
      }
    }catch(e){if(current(ticket)){message(e.message,'error');status('连接失败 · 可以重试');q('#desktop-connect').disabled=false;q('#desktop-disconnect').disabled=!session;q('#desktop-disconnect').textContent=disconnectLabel}}
    finally{if(connecting===pending)connecting=null}
  }
  const ticket=revision
  void rpc('hosts.desktop-list',{id:host.id}).then(items=>{if(!current(ticket)||session)return;session=items.find(d=>d.state==='ready'||d.state==='connecting');if(session){q('#desktop-disconnect').disabled=false;q('#desktop-disconnect').textContent=session.state==='connecting'?'取消连接':disconnectLabel;status(session.state==='connecting'?'通道正在建立 · 可继续或取消':'已有通道 · 点击连接桌面继续');void monitor()}}).catch(e=>{if(current(ticket))message(e.message,'error')})
  const visibility=()=>{clearTimeout(pollTimer);if(!document.hidden)void monitor()};document.addEventListener('visibilitychange',visibility)
  return ()=>{disposed=true;revision++;clearTimeout(pollTimer);document.removeEventListener('visibilitychange',visibility);detach()}
}
