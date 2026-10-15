import {osIcon} from './os.js'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function remoteTabs(root,rpc,message,loadClient,configure,onSelect){
 const tabs=new Map();let selected
 root.innerHTML='<nav class="remote-tabbar" aria-label="远程桌面标签页"></nav><div class="remote-panels"></div><div class="remote-empty"><span>▱</span><h2>远程桌面工作区</h2><p>从左侧选择 Windows 或 macOS 主机，即可在独立标签页中打开桌面。</p></div>'
 const nav=root.querySelector('nav'),panels=root.querySelector('.remote-panels'),empty=root.querySelector('.remote-empty');nav.hidden=true;panels.hidden=true
 function select(id){selected=id;for(const tab of tabs.values()){const active=tab.host.id===id;tab.panel.hidden=!active;tab.button.setAttribute('aria-selected',String(active));if(!active)tab.cleanup.pause?.()}empty.hidden=tabs.size>0;panels.hidden=tabs.size===0;nav.hidden=tabs.size===0;if(tabs.has(id))onSelect?.(tabs.get(id).host)}
 function close(id){const tab=tabs.get(id);if(!tab)return;tab.closed=true;tab.cleanup();tab.button.remove();tab.panel.remove();tabs.delete(id);if(selected===id)select([...tabs.keys()].at(-1));empty.hidden=tabs.size>0;panels.hidden=tabs.size===0;nav.hidden=tabs.size===0}
 const key=host=>JSON.stringify([host.host,host.os,host.port||22,host.desktop||null,host.jump||'',host.sshConfig||'',host.knownHosts||'',host.identityFile||''])
 async function mount(tab){
  const revision=++tab.revision;tab.cleanup();tab.cleanup=()=>{}
  tab.panel.innerHTML='<div class="pane-loading">正在准备远程桌面…</div>'
  try{const pane=await loadClient('desktop');if(tab.closed||revision!==tab.revision)return;tab.cleanup=pane(tab.panel,tab.host,rpc,message,()=>configure(tab.host),loadClient)}
  catch(error){if(!tab.closed&&revision===tab.revision){tab.panel.innerHTML='<div class="pane-loading">'+esc(error.message)+'</div>';message(error.message,'error')}}
 }
 function update(host){
  const tab=tabs.get(host.id);if(!tab)return
  const changed=key(tab.host)!==key(host)
  if(changed&&tab.cleanup.hasConnection?.())return
  Object.assign(tab.host,host)
  tab.button.querySelector('[data-no-i18n]').textContent=host.name
  tab.button.querySelector('button').setAttribute('aria-label','关闭 '+host.name+'桌面标签页')
  if(changed)void mount(tab);else tab.cleanup.updateHost?.(host)
 }
 async function open(host){
  if(tabs.has(host.id)){update(host);select(host.id);return}
  const button=document.createElement('div');button.className='remote-tab';button.setAttribute('role','tab');button.tabIndex=0;button.innerHTML=osIcon(host)+'<span data-no-i18n>'+esc(host.name)+'</span><button aria-label="关闭 '+esc(host.name)+'桌面标签页">×</button>'
  const panel=document.createElement('section');panel.className='remote-panel';panel.setAttribute('role','tabpanel');nav.append(button);panels.append(panel)
  const tab={host:{...host},button,panel,cleanup:()=>{},closed:false,revision:0};tabs.set(host.id,tab)
  button.onclick=()=>select(host.id);button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(host.id)}}
  button.querySelector('button').onclick=e=>{e.stopPropagation();close(host.id)};select(host.id)
  await mount(tab)
 }
 return {open,update,pause(){for(const tab of tabs.values())tab.cleanup.pause?.()},dispose(){for(const id of [...tabs.keys()])close(id)}}
}
