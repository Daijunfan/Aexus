import Guacamole from '../Vendor/guacamole/client.js'
import {desktopFullscreen} from './fullscreen.js'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function rdpPane(root,host,rpc,message,configure){
 let disposed=false,client,keyboard,mouse,observer,session,connecting=false,useSavedCredential=false
 const pressedKeys=new Set();let lastMouseState=null
 const defaultUser=host.desktop?.username||(host.host.includes('@')?host.host.split('@')[0]:'')
 root.innerHTML=`<div class="workbar"><div><strong data-no-i18n>${esc(host.name)}</strong><span class="rdp-status">RDP · 在软件内连接 Windows</span></div><button class="rdp-settings">连接设置</button><button class="rdp-disconnect" disabled>断开</button></div><form class="rdp-login"><div><h3>登录 Windows 远程桌面</h3><p>RDP 通过现有连接通道运行，使用 SSH 核对目标桌面证书。</p></div><label>Windows 登录账号<input name="username" autocomplete="username" required value="${esc(defaultUser)}"></label><label>登录密码<input name="password" type="password" autocomplete="current-password" required></label><label class="rdp-remember"><input name="remember" type="checkbox" checked>记住登录信息（系统钥匙串）</label><button class="primary">连接桌面</button></form><div class="rdp-screen" tabindex="0" aria-label="${esc(host.name)}远程桌面" hidden></div><div class="rdp-tools" hidden><label><input class="rdp-view-only" type="checkbox">只读</label><button class="rdp-cad">Ctrl · Alt · Del</button><button class="rdp-clipboard-toggle">剪贴板</button><button class="rdp-fullscreen">全屏</button><span>点击画面后使用键盘和鼠标</span></div><div class="rdp-clipboard" hidden><textarea aria-label="远程桌面剪贴板" placeholder="要传到远程桌面的文字"></textarea><button class="rdp-paste">发送文字</button><button class="rdp-copy">复制到本机</button></div>`
 const q=s=>root.querySelector(s),screen=q('.rdp-screen'),status=text=>{if(!disposed)q('.rdp-status').textContent=text}
 const otherAccount=document.createElement('button');otherAccount.type='button';otherAccount.textContent='使用其他账号';otherAccount.hidden=true;q('.rdp-login').append(otherAccount)
 function savedMode(enabled){useSavedCredential=enabled;const form=q('.rdp-login');form.querySelectorAll('label').forEach(label=>{label.hidden=enabled});form.elements.password.required=!enabled;form.elements.username.required=!enabled;form.querySelector('button').textContent=enabled?'使用已保存凭据连接':'连接桌面';form.querySelector('h3').textContent=enabled?'连接 Windows 远程桌面':'登录 Windows 远程桌面';otherAccount.hidden=!enabled}
 otherAccount.onclick=()=>{savedMode(false);q('.rdp-login').elements.username.focus()}
 const failed=e=>{if(disposed)return;status('连接已中断 · 可以重试');const detail=e.message||'连接通道已中断，请重新连接。';message('Windows 桌面连接失败：'+(/aborted|see logs/i.test(detail)?'连接通道已中断，请重新连接。':detail),'error')}
 const clipboard=text=>{if(!client||q('.rdp-view-only').checked)return;const stream=client.createClipboardStream('text/plain'),writer=new Guacamole.StringWriter(stream);writer.sendText(text);writer.sendEnd()}
 function detach(){observer?.disconnect();observer=null;keyboard?.reset();pressedKeys.clear();keyboard=null;mouse=null;lastMouseState=null;client?.disconnect();client=null;screen.innerHTML=''}
 async function stop(){const previous=session;session=null;detach();if(previous)await rpc('hosts.rdp-close',{id:host.id,session:previous.id});if(!disposed){screen.hidden=true;q('.rdp-tools').hidden=true;q('.rdp-login').hidden=false;q('.rdp-disconnect').disabled=true;status('已断开')}}
 q('.rdp-settings').onclick=configure
 q('.rdp-disconnect').onclick=()=>void stop().catch(e=>message(e.message,'error'))
 const leaveFullscreen=desktopFullscreen(root,q('.rdp-fullscreen'))
 q('.rdp-clipboard-toggle').onclick=()=>{q('.rdp-clipboard').hidden=!q('.rdp-clipboard').hidden}
 q('.rdp-paste').onclick=()=>{if(client){clipboard(q('.rdp-clipboard textarea').value);screen.focus()}}
 q('.rdp-copy').onclick=()=>navigator.clipboard.writeText(q('.rdp-clipboard textarea').value).catch(e=>message(e.message,'error'))
 q('.rdp-view-only').onchange=()=>{
  // Always release keys/buttons that were pressed before entering read-only.
  // Do not emit new input while read-only is selected.
  keyboard?.reset();
  if(client&&lastMouseState&&(lastMouseState.left||lastMouseState.middle||lastMouseState.right)){
   client.sendMouseState({...lastMouseState,left:false,middle:false,right:false,up:false,down:false},true);
  }
  // Guacamole Mouse tracks held buttons internally even while forwarding was
  // suppressed. Discard that local state before re-enabling control, otherwise
  // the next movement could transmit an unintended held-button click.
  lastMouseState=null;
  const readOnly=q('.rdp-view-only').checked;
  mouse?.reset();
  q('.rdp-cad').disabled=q('.rdp-paste').disabled=readOnly;
 }
 q('.rdp-cad').onclick=()=>{if(!client||q('.rdp-view-only').checked)return;for(const key of [0xffe3,0xffe9,0xffff])client.sendKeyEvent(1,key);for(const key of [0xffff,0xffe9,0xffe3])client.sendKeyEvent(0,key)}
 screen.onblur=()=>keyboard?.reset()
 screen.onmousedown=()=>screen.focus()
 screen.oncontextmenu=e=>e.preventDefault()
 screen.onpaste=e=>{if(client&&!q('.rdp-view-only').checked){const text=e.clipboardData.getData('text/plain');if(text){e.preventDefault();clipboard(text)}}}
 async function connect(event,useSaved=false){
  event?.preventDefault();if(connecting)return;connecting=true;const form=q('.rdp-login'),button=form.querySelector('button');button.disabled=true;status('正在连接并核对证书…')
  try{
   if(session)await stop()
   status('正在连接并核对证书…')
   const username=form.elements.username.value,password=form.elements.password.value,remember=form.elements.remember.checked;form.elements.password.value=''
   const value=await rpc('hosts.rdp-open',{id:host.id,...(useSaved?{}:{username,password,remember}),width:Math.max(640,Math.round(root.clientWidth)),height:Math.max(480,Math.round(root.clientHeight-85))})
   if(disposed){await rpc('hosts.rdp-close',{id:host.id,session:value.id});return}
   session=value;form.hidden=true;screen.hidden=false;q('.rdp-tools').hidden=false;q('.rdp-disconnect').disabled=false
   const tunnel=new Guacamole.WebSocketTunnel(value.wsUrl)
   client=new Guacamole.Client(tunnel);screen.append(client.getDisplay().getElement())
   tunnel.onerror=failed
   tunnel.onstatechange=state=>{if(state===Guacamole.Tunnel.State.CLOSED)client?.disconnect()}
   client.onerror=failed
   client.onstatechange=state=>{if(disposed)return;if(state===3){status('Windows 桌面已连接');screen.focus();size='';fit()}else if(state===5){status('桌面已断开');screen.hidden=true;q('.rdp-tools').hidden=true;q('.rdp-login').hidden=false;void leaveFullscreen.exit()}}
   client.onclipboard=(stream,type)=>{if(type!=='text/plain')return;const reader=new Guacamole.StringReader(stream);let text='';reader.ontext=part=>{text+=part};reader.onend=()=>{if(!disposed)q('.rdp-clipboard textarea').value=text}}
   keyboard=new Guacamole.Keyboard(screen);
   keyboard.onkeydown=key=>{if(!q('.rdp-view-only').checked){pressedKeys.add(key);client?.sendKeyEvent(1,key)}return false};
   keyboard.onkeyup=key=>{if(pressedKeys.delete(key))client?.sendKeyEvent(0,key)}
   const display=client.getDisplay(),element=display.getElement(),cursorLayer=display.getCursorLayer().getElement()
   mouse=new Guacamole.Mouse(element)
   let nativeCursor=true,pointerInside=false
   element.style.cursor='default';cursorLayer.style.visibility='hidden';cursorLayer.style.pointerEvents='none'
   display.showCursor(false)
   display.oncursor=(canvas,x,y)=>{
    nativeCursor=!canvas.width||!canvas.height||mouse.setCursor(canvas,x,y)
    if(!canvas.width||!canvas.height)element.style.cursor='none'
    else if(!nativeCursor)element.style.cursor='none'
    cursorLayer.style.visibility=nativeCursor?'hidden':'visible'
    display.showCursor(!nativeCursor&&pointerInside)
   }
   mouse.on('mouseout',()=>{pointerInside=false;display.showCursor(false)})
   mouse.onEach(['mousedown','mouseup','mousemove'],event=>{
    pointerInside=true;display.showCursor(!nativeCursor)
    if(event.type==='mousedown'&&document.activeElement!==screen)screen.focus()
    if(!q('.rdp-view-only').checked){lastMouseState={...event.state};client?.sendMouseState(event.state,true)}
    else if(!nativeCursor)display.moveCursor(event.state.x/display.getScale(),event.state.y/display.getScale())
   })
   let size='';const fit=()=>{if(!client||!screen.clientWidth||!screen.clientHeight)return;const display=client.getDisplay(),scale=Math.min(screen.clientWidth/(display.getWidth()||value.width),screen.clientHeight/(display.getHeight()||value.height));display.scale(scale);const next=screen.clientWidth+':'+screen.clientHeight;if(next!==size){size=next;client.sendSize(Math.max(320,screen.clientWidth),Math.max(240,screen.clientHeight))}}
   client.getDisplay().onresize=fit;observer=new ResizeObserver(fit);observer.observe(screen);client.connect('');fit();status('正在登录 Windows…')
  }catch(error){if(!disposed){status('连接失败 · 可以重试');q('.rdp-login').hidden=false;message(error.message,'error')}}finally{connecting=false;if(!disposed)button.disabled=false}
 }
 q('.rdp-login').onsubmit=event=>void connect(event,useSavedCredential)
 status('正在查找已保存的登录信息…')
 void rpc('hosts.rdp-credentials',{id:host.id}).then(value=>{if(disposed)return;if(value.username)q('.rdp-login').elements.username.value=value.username;if(value.hasSavedCredential){savedMode(true);q('.rdp-login').hidden=true;status('使用已保存的凭据登录…');void connect(null,true)}else status('RDP · 输入登录信息')}).catch(error=>{if(!disposed){status('RDP · 输入登录信息');message(error.message,'error')}})
 const dispose=()=>{disposed=true;leaveFullscreen();const previous=session;session=null;detach();if(previous)void rpc('hosts.rdp-close',{id:host.id,session:previous.id}).catch(()=>{})}
 dispose.pause=()=>{keyboard?.reset();void leaveFullscreen.exit()};dispose.hasConnection=()=>connecting||!!client;dispose.updateHost=value=>{host=value;q('.workbar strong').textContent=host.name};return dispose
}
