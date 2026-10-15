import {hostAddress,hostAddresses} from './host-address.js'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const value=v=>v===undefined||v===null||v===''?'—':typeof v==='boolean'?(v?'是':'否'):esc(v)
const gib=mb=>Number.isFinite(mb)?(mb/1024).toFixed(1)+' GiB':null
const percent=v=>Number.isFinite(v)?v+'%':null
const facts=rows=>'<div class="info-facts">'+rows.map(([label,data])=>`<div><span>${esc(label)}</span><strong>${value(data)}</strong></div>`).join('')+'</div>'
const table=(head,rows)=>`<div class="info-table" tabindex="0"><table><thead><tr>${head.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(v=>'<td>'+value(v)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+head.length+'">未获取到数据</td></tr>'}</tbody></table></div>`
export function infoPane(root,host,rpc,message){
  let disposed=false,info=host.info,section='system',network='',refreshing=false
  root.classList.add('info-pane')
  root.innerHTML=`<div class="detail-heading"><div><h2>${esc(host.name)}</h2><p class="info-address">${esc(hostAddress(host))}</p></div><button id="info-refresh" class="primary">检测并刷新</button></div><p class="info-time"></p><nav class="info-tabs" role="tablist" aria-label="主机信息分类"></nav><div class="info-content" role="tabpanel"></div>`
  const q=s=>root.querySelector(s)
  function render(){
    const sections=[['system','系统'],['hardware','处理器与内存'],['network','网络与 IP'],['routes','路由与网关'],['gpu','GPU'],['storage','磁盘'],...(info?.remoteDesktop?[['rdp','远程桌面']]:[])]
    if(!sections.some(([id])=>id===section))section='system'
    q('.info-tabs').innerHTML=sections.map(([id,name])=>`<button role="tab" data-section="${id}" aria-selected="${section===id}" tabindex="${section===id?0:-1}">${name}</button>`).join('')
    q('.info-address').textContent=hostAddress({...host,info})+' · SSH '+host.host+(host.port&&host.port!==22?' · 端口 '+host.port:'')
    if(!info){q('.info-content').innerHTML='<div class="pane-loading">正在检测主机…</div>';return}
    const s=info.system||{},v=info.virtualization,cpu=info.cpuDetails||{},ram=info.memory||{},p=info.performance||{},rdp=info.remoteDesktop||{}
    q('.info-time').textContent=Number.isFinite(info.checkedAt)?'最后检测：'+new Date(info.checkedAt).toLocaleString():'尚无检测时间'
    const title=sections.find(([id])=>id===section)[1]
    let content=''
    if(section==='system')content=facts([['连接地址 / SSH',host.host],['IP 地址',hostAddresses({...host,info}).join(' · ')],['实际主机名',s.hostname],['操作系统',s.os],['版本',s.version],['内核 / 构建号',s.kernel],['厂商',s.manufacturer],['设备型号',s.model],['设备类型',(v?.kind==='virtual'?'虚拟机':v?.kind==='physical'?'物理机':'尚未确定')+(v?.platform?' · '+v.platform:'')],['运行时间',Number.isFinite(s.uptimeSeconds)?Math.floor(s.uptimeSeconds/86400)+' 天 '+Math.floor(s.uptimeSeconds%86400/3600)+' 小时':null]])+((v?.evidence||[]).length?'<details class="info-evidence"><summary>检测依据</summary>'+v.evidence.map(e=>'<p>'+esc(e)+'</p>').join('')+'</details>':'')
    if(section==='hardware')content=facts([['CPU',info.cpu],['物理核心',cpu.physicalCores],['逻辑核心 / 线程',cpu.logicalCores??info.cores],['CPU 数量',cpu.sockets],['CPU 当前使用率',percent(p.cpuPercent)],['内存总量',gib(info.memoryMB)],['可用内存',gib(ram.availableMB)],['内存当前使用率',percent(ram.usedPercent)]])
    if(section==='network'){
      const interfaces=info.interfaces?.length?info.interfaces:(info.networks||[]).map(n=>({name:n.name,addresses:[n]}))
      const item=interfaces.find(n=>n.name===network)||interfaces[0];network=item?.name||''
      content=item?'<label class="info-network-picker">网卡<select aria-label="选择网卡">'+interfaces.map(n=>'<option value="'+esc(n.name)+'" '+(n.name===network?'selected':'')+'>'+esc(n.name)+' · '+esc(n.status||'')+'</option>').join('')+'</select></label>'+facts([['网卡',item.description],['MAC 地址',item.mac],['链路速度',item.speed||(item.speedMbps?item.speedMbps+' Mbps':null)],['MTU',item.mtu],['DHCP',item.dhcp],['DNS 服务器',(item.dns||[]).join(' · ')]])+table(['IP 地址','地址族','前缀','网段'],(item.addresses||[]).map(a=>[a.address,a.family==='inet6'?'IPv6':'IPv4',a.prefix===undefined?null:'/'+a.prefix,a.cidr])):'<p class="info-note">尚未获取网卡信息。当前连接入口：'+esc(host.host)+'</p>'
    }
    if(section==='routes')content=table(['网卡','地址族','网关','度量值'],(info.routes||[]).map(r=>[r.interface,r.family,r.gateway,r.metric]))
    if(section==='gpu')content=table(['设备','显存','已用显存','使用率','温度'],(info.gpus||[]).map(g=>[g.name,gib(g.memoryMB),gib(g.usedMB),percent(g.utilization),g.temperature===undefined?null:g.temperature+' °C']))
    if(section==='storage')content=table(['挂载点 / 盘符','文件系统','总容量','可用空间'],(info.storage||[]).map(d=>[d.mount,d.filesystem,Number.isFinite(d.totalGB)?d.totalGB+' GiB':null,Number.isFinite(d.freeGB)?d.freeGB+' GiB':null]))
    if(section==='rdp')content=facts([['系统版本',rdp.edition],['RDP 被连接端',rdp.supported?'支持':'此版本不支持'],['远程桌面开关',rdp.enabled?'已启用':'未启用'],['服务状态',rdp.service]])
    q('.info-content').innerHTML='<section class="info-section"><h3>'+esc(title)+'</h3>'+content+'</section>'
    const picker=q('.info-network-picker select');if(picker)picker.onchange=()=>{network=picker.value;render()}
  }
  q('.info-tabs').onclick=event=>{const button=event.target.closest('[data-section]');if(button){section=button.dataset.section;render();q('[aria-selected="true"]').focus({preventScroll:true})}}
  q('.info-tabs').onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
    event.preventDefault();const buttons=[...q('.info-tabs').children],at=buttons.findIndex(b=>b.dataset.section===section),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length
    section=buttons[next].dataset.section;render();q('[aria-selected="true"]').focus({preventScroll:true})
  }
  async function refresh(){
    if(refreshing)return
    refreshing=true;const button=q('#info-refresh');button.disabled=true;button.textContent='检测中…'
    try{const result=await rpc('hosts.inspect',{id:host.id});if(disposed)return;info=result;host.info=result;render()}
    catch(error){if(!disposed){message(error.message,'error');if(!info)q('.info-content').innerHTML='<p class="info-note">检测失败，请检查连接后重试。</p>'}}
    finally{refreshing=false;if(!disposed){button.disabled=false;button.textContent='检测并刷新'}}
  }
  q('#info-refresh').onclick=refresh;render();if(!info||Date.now()-(info.checkedAt||0)>30000)void refresh()
  return()=>{disposed=true;root.classList.remove('info-pane')}
}
