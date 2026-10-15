import {hostAddress} from './host-address.js'
import {osIcon,osName} from './os.js'
import {sortable} from './sortable.js'
import {popover} from './popover.js'
import {boardRows} from './board-layout.js'
import {dragRowHeight,keyRowHeight} from './board-resize.js'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function boardPane(root,hosts,state,rpc,message,loadClient,save,open,rebuild){
  let disposed=false,columns=0,layoutWidth=0
  const group=state.boards.find(b=>b.id===state.activeBoard),cards=new Map(),q=s=>root.querySelector(s)
  const operatingSystems=[['windows','Windows'],['linux','Linux'],['ubuntu','Ubuntu'],['kali','Kali'],['debian','Debian'],['macos','macOS']]
  root.innerHTML=`<div class="board-groups"><nav class="board-group-tabs" aria-label="工作组">${state.boards.map(b=>`<button data-group="${esc(b.id)}" role="tab" aria-selected="${b.id===group.id}">${esc(b.name)}</button>`).join('')}</nav><button id="board-new">＋ 新建工作组</button><button id="board-settings-toggle" aria-expanded="false">工作组设置</button></div><form class="board-new-form" hidden><label>工作组名称<input id="board-new-name" required maxlength="80" value="工作组 ${state.boards.length+1}"></label><button class="primary" type="submit">创建工作组</button><button id="board-new-cancel" type="button">取消</button></form><form class="board-settings" hidden><label>工作组名称<input id="board-name" required maxlength="80" value="${esc(group.name)}"></label><label>每行最多<select id="board-columns" aria-label="每行卡片列数">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===group.columns?'selected':''}>${n} 列</option>`).join('')}</select></label><label>默认内容高度<input id="board-height" aria-label="默认卡片高度" type="number" required min="240" max="1000" step="10" value="${group.cardHeight}"></label>${operatingSystems.map(([key,name])=>`<label>${name} 高度<input data-os-height="${key}" aria-label="${name}终端默认高度" type="number" min="240" max="1000" step="10" placeholder="${group.cardHeight}" value="${group.osHeights?.[key]??''}"></label>`).join('')}<button class="primary" type="submit">保存设置</button><button id="board-delete" class="danger" type="button" ${state.boards.length===1?'disabled':''}>移除工作组</button><p>操作系统高度留空时使用默认值；同行采用较大高度，所有列等宽。手动行高优先，可点击卡片“重置”恢复默认。</p></form><div class="board-heading"><div><h2>${esc(group.name)}</h2><p>拖动顶部排序；在终端底边上下拖动，调整整行高度。</p></div><button id="board-add">＋ 添加主机</button><button id="board-refresh">刷新信息</button></div><div class="board-grid"></div>`
  const grid=q('.board-grid'),hostDragType='application/x-cloud-host-order'
  root.ondragover=event=>{if(event.dataTransfer.types.includes(hostDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';grid.classList.add('drop-active')}}
  root.ondragleave=event=>{if(!root.contains(event.relatedTarget))grid.classList.remove('drop-active')}
  root.ondrop=event=>{const id=event.dataTransfer.getData(hostDragType);if(!id)return;event.preventDefault();grid.classList.remove('drop-active');const host=hosts.find(h=>h.id===id);if(host){if(cards.has(id)){message('此主机已在当前工作组');focus(id)}else{add(host);void persist()}}}
  function choices(){q('#board-add').disabled=cards.size===hosts.length}
  async function persist(patch={}){
    Object.assign(group,patch)
    try{return await save({boardId:group.id,boardPatch:structuredClone({...patch,hosts:[...grid.children].map(card=>card.dataset.id),modes:group.modes,sizes:group.sizes,initialized:true})})}catch(error){message(error.message,'error')}
  }
  async function change(patch){try{await save(patch);if(!disposed)rebuild()}catch(error){message(error.message,'error')}}
  root.querySelectorAll('[data-group]').forEach(button=>button.onclick=()=>void change({activeBoard:button.dataset.group}))
  q('#board-new').onclick=()=>{q('.board-new-form').hidden=false;q('#board-new-name').focus();q('#board-new-name').select()}
  q('#board-new-cancel').onclick=()=>{q('.board-new-form').hidden=true}
  q('.board-new-form').onsubmit=async event=>{event.preventDefault();const button=q('.board-new-form button[type="submit"]');button.disabled=true;await change({createBoard:{name:q('#board-new-name').value},mode:'board'});if(!disposed)button.disabled=false}
  q('#board-settings-toggle').onclick=()=>{const form=q('.board-settings');form.hidden=!form.hidden;q('#board-settings-toggle').setAttribute('aria-expanded',String(!form.hidden))}
  q('.board-settings').onsubmit=async event=>{
    event.preventDefault()
    const result=await persist({name:q('#board-name').value.trim(),columns:Number(q('#board-columns').value),cardHeight:Number(q('#board-height').value),osHeights:Object.fromEntries([...root.querySelectorAll('[data-os-height]')].filter(input=>input.value).map(input=>[input.dataset.osHeight,Number(input.value)]))})
    if(!result||disposed)return
    q('.board-heading h2').textContent=group.name;q('[data-group="'+group.id+'"]').textContent=group.name
    layout();q('.board-settings').hidden=true;q('#board-settings-toggle').setAttribute('aria-expanded','false');message('工作组设置已保存')
  }
  q('#board-delete').onclick=event=>{const button=event.currentTarget;if(!button.dataset.confirm){button.dataset.confirm='1';button.textContent='确认移除此工作组';return}void change({removeBoard:group.id})}
  function ordered(){return [...grid.children].map(node=>cards.get(node.dataset.id))}
  function row(entry){const entries=ordered(),start=Math.floor(entries.indexOf(entry)/columns)*columns;return entries.slice(start,start+columns)}
  function layout(){
    layoutWidth=grid.clientWidth
    columns=Math.min(group.columns,Math.max(1,Math.floor((grid.clientWidth+12)/358)))
    grid.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`
    for(const {entries,height} of boardRows(ordered(),group,columns))for(const entry of entries){
      entry.body.style.height=height+'px'
      const input=entry.node.querySelector('.card-height')
      if(document.activeElement!==input)input.value=height
      entry.node.querySelector('.board-resize-edge[role="separator"]').setAttribute('aria-valuenow',String(height))
    }
  }
  function metadata(card,info){
    const host=hosts.find(h=>h.id===card.dataset.id);if(host)card.querySelector('.board-handle>div>span').textContent=osName(host)+' · '+hostAddress({...host,info})
    const networks=(info.networks||[]).map(net=>`<span title="${esc(net.name+' · '+net.cidr)}">IP ${esc(net.address)}</span>`).join('')
    const groups=new Map();for(const g of (info.gpus||[]).filter(g=>!g.name.includes('Basic Display'))){const name=g.name.replace(/^NVIDIA /,'');groups.set(name,(groups.get(name)||0)+1)}
    const gpu=[...groups].map(([name,count])=>(count>1?count+' × ':'')+name).join(' · ')
    const detected=info.virtualization?.kind==='virtual'?'虚拟机 · '+info.virtualization.platform:info.virtualization?.kind==='physical'?'物理机':''
    card.querySelector('.board-metadata').innerHTML=`${detected?'<span class="machine-kind">'+esc(detected)+'</span>':''}<span title="${esc(info.cpu||info.model)}">CPU ${info.cores??'—'} 核 · 内存 ${Number.isFinite(info.memoryMB)?(info.memoryMB/1024).toFixed(0):'—'} GiB</span>${networks}${gpu?'<span title="'+esc(gpu)+'">'+esc(gpu)+'</span>':''}`
  }
  async function info(entry,force=false){
    if(entry.host.info)metadata(entry.node,entry.host.info)
    if(entry.host.info?.virtualization&&!force)return
    try{const value=await rpc('hosts.inspect',{id:entry.host.id});if(disposed||!entry.node.isConnected)return;entry.host.info=value;metadata(entry.node,value)}catch(error){if(!disposed&&entry.node.isConnected)entry.node.querySelector('.board-metadata').textContent='信息暂不可用 · '+error.message}
  }
  async function show(entry,mode){
    const ticket=++entry.version;entry.cleanup();entry.cleanup=()=>{};entry.body.innerHTML='<div class="pane-loading">正在准备…</div>'
    try{const pane=await loadClient(mode);if(disposed||ticket!==entry.version||!cards.has(entry.host.id))return;entry.cleanup=pane(entry.body,entry.host,rpc,message,()=>open(entry.host.id),loadClient,{autofocus:false})}catch(error){if(!disposed&&ticket===entry.version)entry.body.innerHTML='<div class="pane-loading">'+esc(error.message)+'</div>'}
  }
  function add(host){
    if(cards.has(host.id))return focus(host.id)
    const node=document.createElement('article');node.className='board-card';node.dataset.id=host.id
    node.innerHTML=`<div class="board-card-top"><div class="board-handle" draggable="true" title="拖动调整位置">${osIcon(host)}<div><strong>${esc(host.name)}</strong><span>${esc(osName(host))} · ${esc(hostAddress(host))}</span></div><span class="drag-grip" aria-hidden="true">⠿</span></div><button class="board-open" title="单机工作台" aria-label="打开 ${esc(host.name)}工作台">↗</button><button class="board-remove" aria-label="移出 ${esc(host.name)}">×</button></div><div class="board-metadata">正在读取网络和硬件…</div><div class="board-body"></div><div class="board-resize-edge" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="调整 ${esc(host.name)} 所在行高度" aria-valuemin="240" aria-valuemax="1000" title="上下拖动终端下边框调整整行高度，方向键也可调整"></div><div class="board-card-footer"><label>行高<input class="card-height" aria-label="${esc(host.name)}卡片高度" type="number" min="240" max="1000" step="10">px</label><button class="card-reset" title="恢复整行默认高度" aria-label="重置 ${esc(host.name)}卡片尺寸">重置</button></div><div class="board-resize-edge board-resize-bottom" aria-hidden="true" title="上下拖动调整整行高度"></div>`
    grid.append(node);const entry={host,node,body:node.querySelector('.board-body'),cleanup:()=>{},version:0};cards.set(host.id,entry)
    node.querySelector('.board-open').onclick=()=>open(host.id)
    node.querySelector('.board-remove').onclick=()=>{entry.version++;entry.cleanup();node.remove();cards.delete(host.id);layout();choices();void persist()}
    const setHeight=height=>{for(const peer of row(entry))group.sizes[peer.host.id]={span:1,height};layout()}
    const heightInput=node.querySelector('.card-height')
    heightInput.oninput=()=>{if(heightInput.checkValidity()){setHeight(Number(heightInput.value))}}
    heightInput.onchange=()=>{if(!heightInput.checkValidity())heightInput.reportValidity();else void persist()}
    node.querySelector('.card-reset').onclick=()=>{for(const peer of row(entry))delete group.sizes[peer.host.id];layout();void persist()}
    const handles=node.querySelectorAll('.board-resize-edge');let resizing
    for(const handle of handles){
      handle.onpointerdown=event=>{
        if(event.button!==0||event.isPrimary===false||resizing)return
        event.preventDefault()
        resizing={pointerId:event.pointerId,y:event.clientY,height:Number(entry.body.style.height.slice(0,-2)),changed:false}
        handle.setPointerCapture(event.pointerId)
        node.classList.add('resizing')
      }
      handle.onpointermove=event=>{
        if(!resizing||event.pointerId!==resizing.pointerId)return
        event.preventDefault()
        const next=dragRowHeight(resizing.height,event.clientY-resizing.y)
        if(next!==Number(entry.body.style.height.slice(0,-2))){setHeight(next);resizing.changed=true}
      }
      const endResize=event=>{
        if(!resizing||event.pointerId!==resizing.pointerId)return
        const changed=resizing.changed
        resizing=null;node.classList.remove('resizing')
        if(changed)void persist()
      }
      handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=endResize
    }
    node.querySelector('.board-resize-edge[role="separator"]').onkeydown=event=>{
      const current=Number(entry.body.style.height.slice(0,-2))
      const next=keyRowHeight(current,event.key,event.shiftKey?50:10)
      if(next===null)return
      event.preventDefault();event.stopPropagation()
      if(next!==current){setHeight(next);void persist()}
    }
    layout();void show(entry,'terminal');void info(entry);choices()
  }
  function focus(id){const entry=cards.get(id);if(!entry){const host=hosts.find(h=>h.id===id);if(host){add(host);void persist()}return}entry.body.dispatchEvent(new Event('terminal-activate'));entry.node.scrollIntoView({block:'nearest',behavior:'smooth'});entry.node.animate([{boxShadow:'0 0 0 3px #82a9d8'},{boxShadow:'0 2px 12px #193d6610'}],{duration:650})}
  const order=group.initialized?group.hosts:hosts.slice(0,2).map(h=>h.id)
  for(const id of order){const host=hosts.find(h=>h.id===id);if(host)add(host)}
  layout();choices();const observer=new ResizeObserver(()=>{if(grid.clientWidth!==layoutWidth)layout()});observer.observe(grid)
  if(!group.initialized&&cards.size)void persist()
  const stopSort=sortable(grid,{selector:'.board-card',handle:'.board-handle',type:'application/x-cloud-board-order',onChange:()=>{layout();void persist()}})
  q('#board-add').onclick=()=>{const picker=popover(q('#board-add'),'<div class="popover-heading">选择要添加的云主机</div><input class="host-picker-search" type="search" placeholder="搜索主机" aria-label="搜索可添加主机"><div class="host-picker-list"></div>',{width:300});const draw=()=>{const query=picker.element.querySelector('input').value.toLowerCase();picker.element.querySelector('.host-picker-list').innerHTML=hosts.filter(h=>!cards.has(h.id)&&h.name.toLowerCase().includes(query)).map(h=>'<button data-host="'+h.id+'">'+osIcon(h)+'<span>'+esc(h.name)+'</span></button>').join('');picker.element.querySelectorAll('[data-host]').forEach(button=>button.onclick=()=>{add(hosts.find(h=>h.id===button.dataset.host));picker.close();void persist()})};picker.element.querySelector('input').oninput=draw;draw();picker.element.querySelector('input').focus()}
  q('#board-refresh').onclick=()=>{for(const entry of cards.values())void info(entry,true)}
  return {focus,dispose(){disposed=true;root.ondragover=null;root.ondragleave=null;root.ondrop=null;stopSort();observer.disconnect();for(const entry of cards.values()){entry.version++;entry.cleanup()}}}
}
