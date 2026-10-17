import {hostAddress,hostAddresses} from './host-address.js'
import {osIcon,osName} from './os.js'
import {sortable} from './sortable.js'
import {canLeave} from './unsaved.js'
import {verifyHostKey} from './ssh-trust.js'
import {boardPane} from './board.js'
import {fileBoardPane} from './file-board.js'
import {agentGroupsPane} from './agent-groups.js'
import {roleBoardPane} from './role-board.js'
import {roleHostPane} from './role-host.js'
import {remoteTabs} from './remote-tabs.js'
import {adjustableLayout} from './layout.js'
import {installStyledSelects} from './styled-select.js'
import {installLanguage,setLanguage,currentLanguage} from './i18n.js'
import {supportsDesktop,desktopDefaults} from './desktop-capabilities.js'
installLanguage()
adjustableLayout()
installStyledSelects()
const $=s=>document.querySelector(s),token=location.pathname.split('/')[1],escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let hosts=[],selected=null,editing=false,dirty=false,loading=false,view='overview',cleanup=()=>{},renderVersion=0
let workspace={mode:'single',boards:[]},boardController,fileBoardController,agentBoardController,roleBoardController,sorting=false,sortEnded=0,workspaceSaves=Promise.resolve(),pendingAgentId=null,pendingRoleId=null
let messageTimer
let desktopView=false
const inspectedAddresses=new Set()
let loadingAddresses=false
async function inspectAddresses(){
 if(loadingAddresses)return
 loadingAddresses=true
 const pending=hosts.filter(h=>h.id!=='local'&&!hostAddresses(h).length&&!inspectedAddresses.has(h.id))
 await Promise.all(Array.from({length:Math.min(3,pending.length)},async()=>{while(pending.length){const host=pending.shift();inspectedAddresses.add(host.id);try{const info=await rpc('hosts.inspect',{id:host.id});const current=hosts.find(h=>h.id===host.id);if(current)current.info=info;renderList()}catch{}}}))
 loadingAddresses=false
}
const message=(text,kind='info')=>{clearTimeout(messageTimer);const node=$('#message');node.textContent=text;node.dataset.kind=kind;if(text&&kind!=='error')messageTimer=setTimeout(()=>{node.textContent=''},5000)}
window.cloudClients={};window.cloudClientReady={}
const assets=new Map(),assetVersion='?v='+encodeURIComponent(document.querySelector('meta[name="cloud-hosts-version"]')?.content||'dev')
function loadClient(name){
 if(!assets.has(name))assets.set(name,new Promise((resolve,reject)=>{
  const styles=['terminal','agent-board'].includes(name)?new Promise((ready,failed)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='./'+name+'.bundle.css'+assetVersion;css.onload=ready;css.onerror=()=>{css.remove();failed(Error('终端样式加载失败，请重新选择此页面'))};document.head.append(css)}):Promise.resolve()
  styles.catch(reject)
  const script=document.createElement('script');script.src='./'+name+'.bundle.js'+assetVersion
  script.onload=()=>Promise.all([styles,window.cloudClientReady[name]]).then(()=>resolve(window.cloudClients[name]),reject)
  script.onerror=()=>{assets.delete(name);script.remove();reject(Error('工作台加载失败，请重新选择此页面'))};document.head.append(script)
 }))
 return assets.get(name).catch(error=>{assets.delete(name);throw error})
}
async function rpc(method,params={},options={}){const reply=await fetch('./rpc',{...options,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})}).then(r=>r.json());if(reply.error)throw Error(reply.error.message);return reply.result}
const label=osName
const desktops=remoteTabs($('#remote-workbench'),rpc,message,loadClient,async host=>{hideDesktops();selected=host.id;if(await form(host)!==false)$('#desktop-config').open=true},host=>{selected=host.id;renderList()})
function hideDesktops(){desktopView=false;desktops.pause();$('#remote-workbench').hidden=true;$('#detail').hidden=false}
function showDesktops(){if(dirty){message('请先保存或取消当前编辑');return}desktopView=true;$('#detail').hidden=true;$('#remote-workbench').hidden=false;document.querySelectorAll('.mode-switch button').forEach(button=>button.classList.remove('active'))}
async function openDesktop(id){if(!await canLeave())return;const host=hosts.find(h=>h.id===id);if(!supportsDesktop(host)){view='terminal';void setMode('single');return}showDesktops();void desktops.open(host)}
async function saveWorkspace(patch){const next=workspaceSaves.catch(()=>{}).then(()=>rpc('hosts.workspace',{patch}));workspaceSaves=next;workspace=await next;return workspace}
const modeNav=$('.mode-switch')
const standardViewOrder=['single','hosts-board','agent-board','role-board']
let modeSortedAt=0
function displayModeOrder(order=standardViewOrder){
 for(const mode of order){const button=modeNav.querySelector(`[data-id="${mode}"]`);if(button)modeNav.append(button)}
}
function saveModeOrder(){
 const order=[...modeNav.querySelectorAll('button[data-id]')].map(button=>button.dataset.id)
 if(order.join('|')===workspace.viewOrder?.join('|'))return
 void saveWorkspace({viewOrder:order}).catch(error=>{displayModeOrder(workspace.viewOrder);message(error.message,'error')})
}
sortable(modeNav,{selector:'button[data-id]',type:'application/x-cloud-view-order',onChange:saveModeOrder,onEnd:()=>{modeSortedAt=Date.now()}})
modeNav.onkeydown=event=>{
 if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return
 const button=event.target.closest('button[data-id]');if(!button)return
 const other=event.key==='ArrowLeft'?button.previousElementSibling:button.nextElementSibling
 if(!other?.matches('button[data-id]'))return
 event.preventDefault()
 const first=[...modeNav.children].map(node=>[node,node.getBoundingClientRect()])
 if(event.key==='ArrowLeft')modeNav.insertBefore(button,other)
 else modeNav.insertBefore(other,button)
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const [node,a] of first){
  const b=node.getBoundingClientRect();node.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px)`},{transform:'none'}],{duration:190,easing:'ease-out'})
 }
 button.focus({preventScroll:true});modeSortedAt=Date.now();saveModeOrder()
}

const langSelector=$('#language-select')
langSelector.onchange=async()=>{
 const old=currentLanguage(),next=langSelector.value
 if(next===old)return
 setLanguage(next)
 try{await saveWorkspace({language:next})}
 catch(error){setLanguage(old);langSelector.value=old;message(error.message,'error')}
}
async function setMode(mode){
 if(workspace.mode===mode&&!desktopView&&!editing)return;
 if(!await canLeave())return;
 if(dirty){message('请先保存或取消当前编辑');return}
 // The mounted Web client must finish its own state.flush before its iframe
 // is destroyed. Core execution continues after the view is hidden.
 if(workspace.mode==='role-board'&&mode!=='role-board'&&roleBoardController?.flush){
  try{await roleBoardController.flush()}catch(error){message('Aexus 页面状态保存失败：'+error.message,'error');return}
 }
 hideDesktops();await saveWorkspace({mode});editing=false;renderDetail()
}
let loadingHosts,lastList=''
async function load(){
 if(loadingHosts)return loadingHosts
 loadingHosts=(async()=>{const previous=JSON.stringify(hosts.find(h=>h.id===selected)),previousId=selected;hosts=await rpc('hosts.list');for(const host of hosts)desktops.update(host);if(selected&&!hosts.some(h=>h.id===selected))selected=null;selected??=hosts[0]?.id??null;renderList();if(workspace.mode==='single'&&!editing&&(previousId!==selected||view==='overview'&&previous!==JSON.stringify(hosts.find(h=>h.id===selected))||!$('#detail').children.length))renderDetail()})()
 try{await loadingHosts;void inspectAddresses()}finally{loadingHosts=null}
}
function renderList(){
 if(sorting)return
 const query=$('#search').value.trim().toLowerCase(),filtered=hosts.filter(h=>(h.name+' '+h.host+' '+label(h)+(h.id==='local'?' Local Host 本地主机':'')).toLowerCase().includes(query))
 const signature=JSON.stringify([selected,query,hosts]);if(signature===lastList)return;lastList=signature
 $('#count').textContent=hosts.length;$('#online-count').textContent=hosts.filter(h=>h.status?.connected).length
 $('#hosts').innerHTML=filtered.length?filtered.map(h=>`<div role="button" tabindex="0" class="host-card ${selected===h.id?'selected':''}" data-id="${escape(h.id)}" aria-pressed="${selected===h.id}" title="${escape(h.name)}" aria-label="${escape(h.name)}" ${h.id==='local'||!!query?'':'draggable="true"'}>${osIcon(h)}<span><strong>${escape(h.id==='local'?(currentLanguage()==='zh'?'本地主机':'Local Host'):h.name)}</strong><small title="${escape(h.id==='local'?'Core Machine':label(h)+' · SSH '+h.host)}">${escape(h.id==='local'?(currentLanguage()==='zh'?'当前电脑':'This Computer'):hostAddress(h))}</small><small class="host-connection">${escape(h.id==='local'?osName(h):h.host)}${h.id!=='local'&&h.port&&h.port!==22?' · '+h.port:''}</small></span><i class="lamp ${h.status?.connected?'online':h.status?'offline':''}" title="${h.status?.connected?'上次检查可连接':h.status?'上次检查未连接':'尚未检查'}"></i></div>`).join(''):'<p class="list-empty">'+(query?'没有匹配的主机':'尚未添加主机')+'</p>'
}
$('#hosts').onclick=async event=>{const button=event.target.closest('[data-id]');if(!button||sorting||Date.now()-sortEnded<200)return;if(!await canLeave())return;if(dirty){message('请先保存或取消当前编辑');return}if(!editing&&selected===button.dataset.id&&workspace.mode==='single'&&!desktopView){$('#panel')?.dispatchEvent(new Event('terminal-activate'));return};selected=button.dataset.id;editing=false;message('');renderList();if(desktopView)openDesktop(selected);else if(workspace.mode==='board')boardController?.focus(selected);else if(workspace.mode==='file-board')fileBoardController?.focus(selected);else if(workspace.mode==='agent-board')agentBoardController?.focus(selected);else if(workspace.mode!=='role-board')renderDetail()}
$('#hosts').onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&event.target.closest('.host-card')){event.preventDefault();event.target.closest('.host-card').click()}}
sortable($('#hosts'),{selector:'.host-card[draggable="true"]',type:'application/x-cloud-host-order',effectAllowed:'copyMove',onStart:()=>{sorting=true},onEnd:()=>{sorting=false;sortEnded=Date.now()},onChange:ids=>{let index=0;const visible=new Set(ids),all=hosts.map(host=>visible.has(host.id)?ids[index++]:host.id);void rpc('hosts.reorder',{ids:all}).then(rows=>{hosts=rows;lastList='';renderList()}).catch(error=>{lastList='';renderList();message(error.message,'error')})}})
function renderAgentPreview(hostId,version){
 const target=$('#single-agents-preview');if(!target)return;
 void rpc('hosts.agent-list',{id:hostId}).then(rows=>{
  if(version!==renderVersion||!target.isConnected)return;
  const order=workspace.agentBoard?.roleOrder?.[hostId]||[];
  rows.sort((a,b)=>{const x=order.indexOf(a.id),y=order.indexOf(b.id);return (x<0?Infinity:x)-(y<0?Infinity:y)});
  const signature=JSON.stringify(rows.map(item=>[item.id,item.name,item.engine,item.running,item.status,item.error,item.engineHostId,item.engineHost?.name]));
  if(target.dataset.signature===signature)return;target.dataset.signature=signature;
  const zh=currentLanguage()==='zh';
  target.querySelector('.single-agents-grid').innerHTML=rows.length?rows.map(item=>{
    const source=item.engineHostId==='local'?(zh?'本机':'Local '+osName(hosts.find(h=>h.id==='local')||{os:'macos'})):(item.engineHost?.name||hosts.find(h=>h.id===item.engineHostId)?.name||item.engineHostId);
    const state=item.running?(zh?'运行中':'Running'):(zh?'点击恢复':'Click to resume');
    return `<button type="button" class="single-agent-tile" data-session="${escape(item.id)}" data-status="${item.running?'running':'stopped'}" title="${escape(item.name+'\n'+source+(item.error?'\n'+item.error:''))}"><img src="./engines/${escape(item.engine)}.svg" alt="${escape(item.engine)}" draggable="false"><span data-no-i18n><strong>${escape(item.name)}</strong><small><i class="single-agent-lamp ${item.running?'running':''}"></i>${escape(item.engine)} · ${state}</small><small class="single-agent-source" title="${escape(source)}">${escape(source)}</small></span></button>`;
  }).join(''):'<p class="single-agents-empty">No Coding Agents assigned to this host.</p>';
  target.querySelectorAll('[data-session]').forEach(button=>button.onclick=()=>{pendingAgentId=button.dataset.session;view='agents';renderDetail()});
 }).catch(error=>{if(version===renderVersion&&target.isConnected)target.querySelector('.single-agents-grid').textContent=error.message});
}
function appendAgentPreview(host){
 const panel=$('#panel');panel.insertAdjacentHTML('beforeend',`<section id="single-agents-preview" class="single-agents-preview"><div class="single-agents-title"><h3>Coding Agents</h3><button type="button" id="single-agents-all">View All →</button></div><div class="single-agents-grid" aria-label="Agents working on ${escape(host.name)}"><p class="single-agents-empty">Loading agents…</p></div></section>`);
 $('#single-agents-all').onclick=()=>{pendingAgentId=null;view='agents';renderDetail()};
 const version=renderVersion;
 renderAgentPreview(host.id,version);
 const timer=setInterval(()=>{if(!document.hidden&&version===renderVersion)renderAgentPreview(host.id,version)},5000);
 cleanup=()=>clearInterval(timer);
}
function renderOverview(){const h=hosts.find(h=>h.id===selected);if(!h){$('#panel').innerHTML='<div class="empty"><span aria-hidden="true">⌁</span><h2>连接你的第一台主机</h2><p>集中管理连接，在终端或远程桌面中工作。</p><button class="primary" id="first-add">添加第一台主机</button></div>';$('#first-add').onclick=()=>form();return}
 if(h.id==='local'){
  $('#panel').innerHTML=`<div class="detail-heading"><div><span class="eyebrow">LOCAL COMPUTER · ${escape(osName(h))}</span><h2>Local Host</h2><p>${escape(h.host)} · ${escape(h.defaultDirectory)}</p></div></div><div class="status-card"><i class="lamp online"></i><div><strong>Local Core Host · Connected</strong><p>Manage the agents, terminal and files running directly on this computer.</p></div></div>`;
  appendAgentPreview(h);return;
 }
 const active=()=>selected===h.id&&!editing&&view==='overview'
 $('#panel').innerHTML=`<div class="detail-heading"><div><span class="eyebrow">${escape(label(h))} / SSH</span><h2 data-no-i18n>${escape(h.name)}</h2><p title="${escape(h.host)}">${escape(hostAddress(h))} <span class="tag">端口 ${h.port||22}</span></p></div><button id="edit">编辑主机</button></div><div class="status-card"><i class="lamp ${h.status?.connected?'online':h.status?'offline':''}"></i><div><strong>${h.status?.connected?'连接正常':h.status?'暂时无法连接':'等待连接检查'}</strong><p>${escape(h.status?.error||h.status?.environment?.distributionName||'状态来自上次 SSH 检查')}${h.status?.checkedAt?'<br>最后检测：'+escape(new Date(h.status.checkedAt).toLocaleString()):''}</p></div><button id="check">测试连接</button></div><div class="facts"><div><span>默认浏览目录</span><code>${escape(h.defaultDirectory)}</code></div><div><span>认证方式</span><strong>${h.hasPassword?'已保存密码':h.identityFile?'指定 SSH 私钥':'现有 SSH 密钥 / 配置'}</strong></div><div><span>桌面连接</span><strong>${h.desktop?escape(h.desktop.protocol.toUpperCase())+' · '+(h.desktop.viaHostId?'SSH 通道':'直接连接'):'未配置'}</strong></div></div><div class="detail-footer"><div><p>CLI 与窗口使用同一套主机配置。</p><details class="host-meta"><summary>主机 ID</summary><code>${escape(h.id)}</code></details></div><button class="danger" id="remove">删除主机</button></div>`
 appendAgentPreview(h);
 $('#edit').onclick=()=>form(h);$('#check').onclick=async()=>{
  const button=$('#check');button.disabled=true
  try{message('正在检测…');let result=await rpc('hosts.check',{id:h.id})
   if(!result.connected&&/host key verification failed|no .*host key is known|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(result.error||'')&&active()){
    if(await verifyHostKey(h,rpc))result=await rpc('hosts.check',{id:h.id})
   }
   await load();message(result.connected?'连接正常':result.error||'连接失败',result.connected?'info':'error')
  }catch(e){message(e.message,'error')}finally{if(button.isConnected)button.disabled=false}
 }
 $('#remove').onclick=async()=>{if($('#remove').dataset.confirm!=='1'){$('#remove').dataset.confirm='1';$('#remove').textContent='确认删除';return}try{await rpc('hosts.remove',{id:h.id});selected=null;await load();message('主机已移除')}catch(e){message(e.message,'error')}}
}
async function form(h={}){if(!await canLeave())return false;cleanup();renderVersion++;editing=true;dirty=false;$('#detail').classList.remove('workbench','board-workbench');message('');const desktopPreset=desktopDefaults(h);const field=(name,title,placeholder='',type='text')=>`<label>${title}<input name="${name}" type="${type}" value="${escape(h[name]??'')}" placeholder="${escape(placeholder)}" ${['name','host','defaultDirectory'].includes(name)?'required':''}></label>`
 $('#detail').innerHTML=`<form><div class="detail-heading"><div><span class="eyebrow">CONNECTION PROFILE</span><h2>${h.id?'编辑云主机':'新建云主机'}</h2></div><button type="button" id="cancel">取消</button></div><div class="form-grid">${field('name','主机名称','例如 GPU Server')}${field('host','SSH 账号与地址','user@203.0.113.10 或已配置的 SSH 别名')}</div><label>操作系统</label><div class="os-picker">${[['linux','Linux'],['windows','Windows'],['macos','macOS']].map(([value,text])=>`<label><input type="radio" name="os" value="${value}" ${(h.os||'linux')===value?'checked':''}><span>${text}</span></label>`).join('')}</div><div class="form-grid">${field('defaultDirectory','默认浏览目录','/home/user 或 C:\\Users\\user')}${field('port','SSH 端口','22','number')}</div><label>登录密码<input name="password" type="password" autocomplete="new-password" placeholder="${h.hasPassword?'留空保留现有密码':'可选，留空使用 SSH 密钥或已有配置'}"></label>${h.hasPassword?'<label class="checkbox"><input type="checkbox" name="clearPassword">删除保存的密码，改用密钥认证</label>':''}<details><summary>SSH 密钥与高级设置</summary><div class="form-grid">${field('identityFile','私钥路径','~/.ssh/id_ed25519')}${field('sshConfig','SSH 配置路径','~/.ssh/config')}${field('knownHosts','known_hosts 路径','~/.ssh/known_hosts')}${field('jump','跳板机','user@jump-host')}${field('distribution','Linux 发行版','kali / ubuntu / debian')}</div></details><details id="desktop-config"><summary>远程桌面 · RDP / VNC</summary><div class="form-grid"><label>桌面协议<select name="desktopProtocol"><option value="">未配置</option><option value="rdp" ${h.desktop?.protocol==='rdp'?'selected':''}>RDP · 内嵌 Windows 桌面</option><option value="vnc" ${desktopPreset.protocol==='vnc'?'selected':''}>VNC · 内嵌画面</option></select></label><label>连接通道<select name="desktopVia"><option value="">直接连接</option>${hosts.map(x=>`<option value="${escape(x.id)}" ${desktopPreset.viaHostId===x.id?'selected':''}>SSH · ${escape(x.name)}</option>`).join('')}</select></label><label>桌面服务地址<input name="desktopAddress" value="${escape(desktopPreset.address)}" placeholder="从连接通道看见的主机地址"></label><label>桌面端口<input name="desktopPort" type="number" min="1" max="65535" value="${desktopPreset.port}"></label><label>桌面用户名<input name="desktopUsername" value="${escape(h.desktop?.username||'')}" autocomplete="off"></label><label>VNC 画质<select name="desktopQuality">${[['balanced','均衡'],['fast','流畅'],['sharp','清晰']].map(([v,t])=>`<option value="${v}" ${(h.desktop?.quality||'balanced')===v?'selected':''}>${t}</option>`).join('')}</select></label></div><p class="hint">SSH 通道推荐用于非公网桌面服务。地址相对于 SSH 通道主机；连接本机桌面服务使用 127.0.0.1。远端须已启用 RDP 或 VNC，桌面密码在连接时输入。</p></details><p class="hint">工作目录只作为默认起点，操作时可以选择该账号可访问的其他现有目录。保持 SSH 主机指纹验证，不自动接受未知主机。</p><footer><button class="primary" type="submit">保存主机</button></footer></form>`
 const el=$('form');el.elements.name.focus({preventScroll:true});el.elements.desktopProtocol.onchange=()=>{el.elements.desktopPort.value=el.elements.desktopProtocol.value==='vnc'?5900:3389;dirty=true};el.oninput=()=>{dirty=true};$('#cancel').onclick=()=>{editing=false;dirty=false;renderDetail()}
 el.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(el));data.desktop=data.desktopProtocol?{protocol:data.desktopProtocol,address:data.desktopAddress.trim(),port:Number(data.desktopPort),username:data.desktopUsername,quality:data.desktopQuality,...(data.desktopVia?{viaHostId:data.desktopVia}:{})}:null;for(const key of Object.keys(data))if(key.startsWith('desktop')&&key!=='desktop')delete data[key];data.port=data.port?Number(data.port):undefined;if(!data.password)delete data.password;if(data.clearPassword)data.password='';delete data.clearPassword;if(data.os!=='linux')data.distribution='';if(h.id){const normalize=d=>d?{protocol:d.protocol,address:d.address,port:d.port,username:d.username||'',quality:d.quality||'balanced',viaHostId:d.viaHostId||''}:null;if(JSON.stringify(normalize(data.desktop))===JSON.stringify(normalize(h.desktop)))delete data.desktop;}const submit=el.querySelector('[type=submit]'),cancel=$('#cancel');dirty=true;submit.disabled=true;cancel.disabled=true;$('#add').disabled=true;try{const result=await rpc(h.id?'hosts.update':'hosts.create',h.id?{id:h.id,patch:data}:data);selected=result.id;editing=false;dirty=false;await load();if($('#detail form'))renderDetail();message('主机已保存，可以打开终端或远程桌面')}catch(error){message(error.message,'error')}finally{submit.disabled=false;cancel.disabled=false;$('#add').disabled=false}}
}
async function refresh(){if(loading)return;loading=true;$('#refresh').disabled=true;try{const results=await Promise.allSettled(hosts.map(h=>rpc('hosts.check',{id:h.id})));const failed=results.filter(r=>r.status==='rejected');await load();message(failed.length?failed.length+' 台主机检查失败':'连接状态已更新')}catch(e){message(e.message,'error')}finally{loading=false;$('#refresh').disabled=false}}
$('#station').onclick=async()=>{if(!await canLeave())return;if(dirty){message('请先保存或取消当前编辑');return}hideDesktops();view='files';void saveWorkspace({mode:'single'}).then(renderDetail)};$('#search').oninput=renderList;$('#add').onclick=()=>{if(dirty){message('请先保存或取消当前编辑');return}hideDesktops();form()};$('#refresh').onclick=refresh
Promise.all([rpc('hosts.workspace').then(value=>{workspace=value;setLanguage(workspace.language||'en');langSelector.value=currentLanguage()}),load()]).then(()=>{displayModeOrder(workspace.viewOrder);renderDetail();$('#add').disabled=false;$('#refresh').disabled=false;}).catch(e=>message(e.message,'error'));setInterval(()=>{if(!editing&&!document.hidden)void load().catch(e=>message(e.message,'error'))},10000)

function mountHostsBoardNavigation(root,mode){
 const nav=document.createElement('nav');nav.className='hosts-board-tabs';
 nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Hosts Board views');
 nav.innerHTML=[['board','Terminal Board'],['file-board','File Board']].map(([id,label])=>
  `<button type="button" role="tab" data-hosts-board-view="${id}" aria-selected="${id===mode}" tabindex="${id===mode?'0':'-1'}" class="${id===mode?'active':''}">${label}</button>`).join('');
 nav.addEventListener('click',event=>{const button=event.target.closest('[data-hosts-board-view]');if(button)void setMode(button.dataset.hostsBoardView).catch(error=>message(error.message,'error'))});
 nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  const current=event.target.closest('[data-hosts-board-view]');if(!current)return;
  event.preventDefault();const next=current[event.key==='ArrowLeft'?'previousElementSibling':'nextElementSibling']||nav.querySelector(event.key==='ArrowLeft'?'[data-hosts-board-view]:last-child':'[data-hosts-board-view]');
  if(next)void setMode(next.dataset.hostsBoardView).then(()=>$('#detail .hosts-board-tabs [aria-selected="true"]')?.focus()).catch(error=>message(error.message,'error'));
 });
 root.prepend(nav);
}
function renderDetail(){
 cleanup();cleanup=()=>{};boardController=null;fileBoardController=null;agentBoardController=null;roleBoardController=null;$('#detail').classList.remove('agent-workbench');const version=++renderVersion;editing=false
 $('#single-mode').classList.toggle('active',!desktopView&&workspace.mode==='single');$('#hosts-board-mode').classList.toggle('active',!desktopView&&['board','file-board'].includes(workspace.mode));$('#agent-board-mode').classList.toggle('active',!desktopView&&workspace.mode==='agent-board');$('#role-board-mode').classList.toggle('active',!desktopView&&workspace.mode==='role-board')
 if(workspace.mode==='agent-board'){
  const root=$('#detail');root.classList.remove('workbench','board-workbench');root.classList.add('agent-workbench');root.innerHTML='<div class="pane-loading">正在准备 Agent 看板…</div>'
  agentBoardController=agentGroupsPane(root,hosts,rpc,message,selected,workspace,saveWorkspace,loadClient)
  cleanup=()=>agentBoardController?.dispose()
  return
 }
 if(workspace.mode==='role-board'){
  const root=$('#detail');root.classList.remove('workbench','board-workbench');
  roleBoardController=roleBoardPane(root,rpc,message,workspace,saveWorkspace,{roleId:pendingRoleId});pendingRoleId=null;
  cleanup=()=>roleBoardController?.dispose();
  return
 }
 if(workspace.mode==='file-board'){const root=$('#detail');root.classList.remove('workbench');root.classList.add('board-workbench');fileBoardController=fileBoardPane(root,hosts,workspace,rpc,message,saveWorkspace,id=>{selected=id;view='overview';void setMode('single');renderList()});mountHostsBoardNavigation(root,'file-board');cleanup=()=>fileBoardController?.dispose();return}
 if(workspace.mode==='board'){const root=$('#detail');root.classList.remove('workbench');root.classList.add('board-workbench');boardController=boardPane(root,hosts,workspace,rpc,message,loadClient,saveWorkspace,id=>{selected=id;view='overview';void setMode('single');renderList()},renderDetail);mountHostsBoardNavigation(root,'board');cleanup=()=>boardController?.dispose();return}
 $('#detail').classList.remove('board-workbench')
 const host=hosts.find(h=>h.id===selected)
 $('#detail').innerHTML=`<nav class="view-tabs" aria-label="主机工作台"><button data-view="overview" class="${view==='overview'?'active':''}">概览</button><button data-view="info" class="${view==='info'?'active':''}" ${host?'':'disabled'}>主机信息</button><button data-view="terminal" class="${view==='terminal'?'active':''}" ${host?'':'disabled'}>终端</button>${supportsDesktop(host)?'<button data-view="desktop">远程桌面</button>':''}<button data-view="files" class="${view==='files'?'active':''}">文件</button><button data-view="agents" class="${view==='agents'?'active':''}" ${host?'':'disabled'}>Coding Agents</button><button data-view="roles" class="${view==='roles'?'active':''}" ${host?'':'disabled'}>Roles</button></nav><div id="panel"></div>`
 $('#detail').classList.toggle('workbench',view!=='overview'&&(!!host||view==='files'))
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{if(!await canLeave())return;if(b.dataset.view==='desktop'){openDesktop(host.id);return}if(view===b.dataset.view&&!$('#panel .pane-loading'))return;view=b.dataset.view;message('');renderDetail()})
 if(view==='overview'||!host&&view!=='files'){renderOverview();return}
 if(view==='roles'){
  const roles=roleHostPane($('#panel'),host,rpc,id=>{
   pendingRoleId=id||null;
   void setMode('role-board').catch(error=>{pendingRoleId=null;message(error.message,'error')});
  });
  cleanup=()=>roles.dispose();return;
 }
 if(view==='agents'){
  const section=$('#panel');section.innerHTML='<div class="pane-loading">Loading Coding Agents…</div>';
  const session=pendingAgentId;pendingAgentId=null;
  const filteredWorkspace={...workspace,agentBoard:{...workspace.agentBoard,hosts:[host.id],columns:1,initialized:true}};
  void loadClient('agent-board').then(pane=>{
   if(version!==renderVersion)return;
   agentBoardController=pane(section,[host],rpc,message,host.id,filteredWorkspace,saveWorkspace,{singleHostId:host.id,autoOpenSession:session});
   cleanup=()=>agentBoardController?.dispose();
  }).catch(error=>{if(version===renderVersion)message(error.message,'error')});return;
 }
 const configure=async()=>{if(await form(host)===false)return;$('#desktop-config').open=true;$('#desktop-config').scrollIntoView({block:'center'})}
 const target=view;$('#panel').innerHTML='<div class="pane-loading" role="status">正在准备'+(target==='terminal'?'终端':target==='files'?'文件':'桌面')+'…</div>'
 loadClient(target).then(pane=>{if(version!==renderVersion)return;cleanup=pane($('#panel'),host,rpc,message,configure,loadClient)}).catch(e=>{if(version===renderVersion){$('#panel').innerHTML='<div class="pane-loading">暂时无法加载，请重新选择此页面。</div>';message(e.message,'error')}})
}
window.addEventListener('pagehide',()=>{
 // Best-effort while browser unloads; authoritative persistence happens in
 // Aexus Core ordered shutdown and on normal view changes above.
 void roleBoardController?.flush?.().catch(()=>{});
 cleanup();desktops.dispose();
})

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!editing)void load().catch(e=>message(e.message,'error'))})

$('#single-mode').onclick=()=>{if(Date.now()-modeSortedAt<250)return;void setMode('single').catch(e=>message(e.message,'error'))}
$('#hosts-board-mode').onclick=()=>{if(Date.now()-modeSortedAt<250)return;void setMode(workspace.hostsBoardMode||'board').catch(e=>message(e.message,'error'))}
$('#agent-board-mode').onclick=()=>{if(Date.now()-modeSortedAt<250)return;void setMode('agent-board').catch(e=>message(e.message,'error'))}


$('#role-board-mode').onclick=()=>{if(Date.now()-modeSortedAt<250)return;void setMode('role-board').catch(e=>message(e.message,'error'))}
