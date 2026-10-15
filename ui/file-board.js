import {hostAddress} from './host-address.js'
import {osIcon,osName} from './os.js'
import {sortable} from './sortable.js'
import {popover} from './popover.js'
import {dragRowHeight,keyRowHeight} from './board-resize.js'
import {pathComplete,eyeIcon} from './path-complete.js'
import {fileBoardActions} from './file-board-actions.js'
import {fileBoardTransfers} from './file-board-transfer.js'

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const folderIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 5.5h6l2 2h8v8.5H2z" fill="#E4B45D" stroke="#C79740" stroke-width="1"/><path d="M2 8h16v8H2z" fill="#F2CF7D"/></svg>'
const fileIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2h7l4 4v12H5z" fill="#EBF1FC" stroke="#8194B1"/><path d="M12 2v4h4" fill="none" stroke="#8194B1"/></svg>'
const validPath=(os,path)=>os==='windows' ? /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/\/[^/]+\/[^/]+)/.test(path) : path.startsWith('/')
const fresh=()=>({nodes:new Map([['.',{entries:null,loading:false,error:''}]]),items:new Map(),expanded:new Set(),selected:''})
const tabId=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)
const size=bytes=>bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB'

export function fileBoardPane(root,hosts,state,rpc,message,save,open){
 let disposed=false,columns=1,layoutWidth=0
 const board=state.fileBoard,cards=new Map(),q=s=>root.querySelector(s)
 board.showHidden??={}
 root.classList.add('file-board-workbench')
 root.innerHTML=`<div class="board-heading file-board-heading"><div><h2>文件看板</h2><p>将文件或文件夹拖到另一主机、文件夹或标签页即可复制；源文件保留，目标同名不会覆盖。</p></div><label class="file-board-columns">每行 <select id="file-board-columns" aria-label="文件看板列数">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${board.columns===n?'selected':''}>${n} 列</option>`).join('')}</select></label><button id="file-board-add">＋ 添加主机</button></div><div class="board-grid file-board-grid"></div>`
 const grid=q('.file-board-grid'),hostDragType='application/x-cloud-host-order'
 function snapshot(){return {hosts:[...grid.children].map(node=>node.dataset.id),tabs:board.tabs,active:board.active,sizes:board.sizes,showHidden:board.showHidden,columns:board.columns,cardHeight:board.cardHeight,initialized:true}}
 function persist(){
  const patch=structuredClone(snapshot())
  Object.assign(board,patch)
  return save({fileBoardPatch:patch}).catch(error=>message(error.message,'error'))
 }
 function choices(){q('#file-board-add').disabled=cards.size===hosts.length}
 function ordered(){return [...grid.children].map(node=>cards.get(node.dataset.id))}
 function row(entry){const entries=ordered(),start=Math.floor(entries.indexOf(entry)/columns)*columns;return entries.slice(start,start+columns)}
 function layout(){
  layoutWidth=grid.clientWidth
  columns=Math.min(board.columns,Math.max(1,Math.floor((layoutWidth+12)/358)))
  grid.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`
  const entries=ordered()
  for(let start=0;start<entries.length;start+=columns){
   const peers=entries.slice(start,start+columns),height=Math.max(...peers.map(e=>board.sizes[e.host.id]??board.cardHeight))
   for(const peer of peers){
    peer.body.style.height=height+'px'
    const input=peer.node.querySelector('.file-board-height')
    if(document.activeElement!==input)input.value=height
    peer.node.querySelector('.file-board-resize[role="separator"]').setAttribute('aria-valuenow',String(height))
   }
  }
 }
 function activeTab(entry){return board.tabs[entry.host.id].find(tab=>tab.id===board.active[entry.host.id])||board.tabs[entry.host.id][0]}
 function modelFor(entry,tab){
  if(!entry.models.has(tab.id))entry.models.set(tab.id,fresh())
  return entry.models.get(tab.id)
 }
 function renderTabs(entry){
  const tabs=board.tabs[entry.host.id],active=activeTab(entry)
  entry.tabs.innerHTML=tabs.map((tab,index)=>`<span class="file-board-tab"><button class="file-board-tab-select" data-tab="${esc(tab.id)}" role="tab" aria-selected="${tab.id===active.id}" title="${esc(tab.path)}">文件 ${index+1}</button><button class="file-board-tab-close" data-close="${esc(tab.id)}" aria-label="关闭文件 ${index+1}" ${tabs.length===1?'disabled':''}>×</button></span>`).join('')+'<button class="file-board-new-tab" aria-label="新建文件视图" title="新建独立目录视图">＋</button>'
  entry.path.value=active.path
  if(document.activeElement===entry.path)entry.complete?.focusEnd()
  entry.complete?.close()
  entry.node.querySelector('.file-board-location').textContent=active.path
 }
 function renderTree(entry){
  const tab=activeTab(entry),model=modelFor(entry,tab),focused=entry.tree.contains(document.activeElement)?document.activeElement.closest('[data-tree-path]')?.dataset.treePath:null,scroll=entry.body.scrollTop
  const walk=(relative,depth)=>{
   const node=model.nodes.get(relative)
   if(!node||node.loading)return `<div class="file-tree-progress" style="--depth:${depth}">正在读取目录…</div>`
   if(node.error)return `<div class="file-tree-error" style="--depth:${depth}" role="alert">${esc(node.error)}</div>`
   if(!node.entries?.length)return `<div class="file-tree-empty" style="--depth:${depth}">空文件夹</div>`
   return node.entries.map(item=>{
    const folder=item.directory,expanded=model.expanded.has(item.path)
    return `<div tabindex="0" draggable="${!item.symlink}" class="file-tree-row ${model.selected===item.path?'selected':''}" data-tree-path="${esc(item.path)}" role="treeitem" aria-level="${depth+1}" ${folder?`aria-expanded="${expanded}"`:''} style="--depth:${depth}" title="${esc(item.name)}"><span class="file-tree-chevron">${folder?expanded?'⌄':'›':''}</span><span class="file-tree-icon">${folder?folderIcon:fileIcon}</span><span class="file-tree-name" data-no-i18n>${esc(item.name)}</span>${item.symlink?'<span class="file-tree-meta">链接</span>':folder?'':`<span class="file-tree-meta">${size(item.bytes)}</span>`}<button type="button" class="file-tree-actions" aria-label="操作 ${esc(item.name)}" title="File actions">⋯</button></div>`+(folder&&expanded?walk(item.path,depth+1):'')
   }).join('')
  }
  entry.tree.innerHTML=walk('.',0)
  entry.body.scrollTop=scroll
  if(focused)for(const button of entry.tree.querySelectorAll('[data-tree-path]'))if(button.dataset.treePath===focused)button.focus({preventScroll:true})
  const rootNode=model.nodes.get('.')
  const count=rootNode?.entries?.length
  const selected=model.items.get(model.selected)
  entry.node.querySelector('.file-board-selected-actions').disabled=!selected
  entry.status.textContent=selected?(selected.directory?'文件夹 · ':'文件 · ')+selected.name+(selected.directory?'':' · '+size(selected.bytes)):count===undefined?'正在连接…':count+' 项 · 文件夹单击展开'
 }
 async function fetchFolder(entry,tab,relative){
  const model=modelFor(entry,tab),node=model.nodes.get(relative)||{entries:null,loading:false,error:''}
  if(node.loading)return
  node.loading=true;node.error='';model.nodes.set(relative,node)
  if(activeTab(entry).id===tab.id)renderTree(entry)
  try{
   const reply=await rpc('hosts.files',{id:entry.host.id,directory:tab.path,operation:'workspace',arguments:{operation:'list',args:{path:relative,hidden:!!board.showHidden[entry.host.id]}}})
   if(disposed||entry.removed||entry.models.get(tab.id)!==model)return
   node.entries=reply.entries;node.loading=false
   for(const item of reply.entries)model.items.set(item.path,item)
   if(activeTab(entry).id===tab.id)renderTree(entry)
  }catch(error){
   if(disposed||entry.removed||entry.models.get(tab.id)!==model)return
   node.error=error.message;node.loading=false
   if(activeTab(entry).id===tab.id)renderTree(entry)
  }
 }
 async function navigate(entry,next){
  const tab=activeTab(entry),path=next.trim()
  if(!validPath(entry.host.os,path)){entry.status.textContent='请输入此主机上的绝对路径';entry.path.setCustomValidity('必须填写绝对路径');entry.path.reportValidity();entry.path.setCustomValidity('');return}
  const previous=modelFor(entry,tab),same=path===tab.path,scroll=entry.body.scrollTop
  // Clicking Refresh moves DOM focus to its button before navigation starts.
  // If refreshing the same directory, restore focus to the still-selected
  // file/tree row after the tree is rebuilt, keeping keyboard navigation live.
  const focused=entry.tree.contains(document.activeElement)
    ?document.activeElement.closest('[data-tree-path]')?.dataset.treePath
    :same?previous.selected:null
  const model=fresh();entry.models.set(tab.id,model);model.nodes.get('.').loading=true
  if(!same)renderTree(entry);else entry.status.textContent='正在刷新目录…'
  const current=()=>!disposed&&!entry.removed&&entry.models.get(tab.id)===model
  try{
   const reply=await rpc('hosts.files',{id:entry.host.id,directory:path,operation:'workspace',arguments:{operation:'list',args:{path:'.',hidden:!!board.showHidden[entry.host.id]}}})
   if(!current())return
   tab.path=reply.root
   const node=model.nodes.get('.');node.entries=reply.entries;node.loading=false
   for(const item of reply.entries)model.items.set(item.path,item)
   if(same){
    // Load parents before their expanded descendants and prune removed paths.
    for(const relative of [...previous.expanded].sort((a,b)=>a.split('/').length-b.split('/').length)){
     if(!current())return
     if(model.items.get(relative)?.directory){model.expanded.add(relative);await fetchFolder(entry,tab,relative)}
    }
    if(model.items.has(previous.selected))model.selected=previous.selected
   }
   if(!current())return
   if(activeTab(entry).id===tab.id){renderTabs(entry);renderTree(entry);entry.body.scrollTop=same?scroll:0
    if(focused)for(const button of entry.tree.querySelectorAll('[data-tree-path]'))if(button.dataset.treePath===focused)button.focus({preventScroll:true})
   }
   void persist()
  }catch(error){
   if(!current())return
   entry.models.set(tab.id,previous)
   if(activeTab(entry).id===tab.id){entry.path.value=tab.path;renderTree(entry);entry.status.textContent='无法读取：'+error.message}
  }
 }
 // Mutations are scoped to the captured host/tab, even when the visible
 // selection changes while a remote operation is in flight.
 async function afterAction({context,kind,path,parent,previous,directory}){
  const {entry,tab}=context
  if(disposed||entry.removed||!board.tabs[entry.host.id]?.some(value=>value.id===tab.id))return
  const model=entry.models.get(tab.id)
  if(model){
   if(kind==='rename'&&directory){
    model.expanded=new Set([...model.expanded].map(value=>value===previous||value.startsWith(previous+'/')?path+value.slice(previous.length):value))
   }
   if(kind==='trash')model.selected=''
   else if(kind!=='edit')model.selected=path
   if(parent&&parent!=='.')model.expanded.add(parent)
  }
  if(activeTab(entry).id===tab.id)await navigate(entry,tab.path)
  else entry.models.delete(tab.id)
 }
 const actions=fileBoardActions(root,rpc,message,afterAction)
 const transfers=fileBoardTransfers(root,rpc,message,async job=>{
  const entry=cards.get(job.destination.hostId)
  if(!entry||entry.removed)return
  const tabs=(board.tabs[entry.host.id]||[]).filter(tab=>tab.path===job.destination.directory)
  for(const tab of tabs){
   const model=entry.models.get(tab.id)
   if(model){
    const ancestors=job.destination.path.split('/').slice(0,-1)
    for(let index=0;index<ancestors.length;index++)model.expanded.add(ancestors.slice(0,index+1).join('/'))
    model.selected=job.destination.path
   }
   if(activeTab(entry).id===tab.id)await navigate(entry,tab.path)
   else entry.models.delete(tab.id)
  }
 })
 let dragHoverTimer=null,dragHoverKey='',highlight=null
 function clearFileDrop(){
  clearTimeout(dragHoverTimer);dragHoverTimer=null;dragHoverKey=''
  highlight?.classList.remove('file-board-drop-target');highlight=null
  for(const card of cards.values())card.node.classList.remove('file-board-drop-active')
 }
 function markDrop(entry,marker){
  if(highlight!==marker){highlight?.classList.remove('file-board-drop-target');highlight=marker;highlight?.classList.add('file-board-drop-target')}
  for(const card of cards.values())card.node.classList.toggle('file-board-drop-active',card===entry)
 }
 function dropDestination(entry,event){
  const select=event.target.closest('[data-tab]')
  if(select&&entry.tabs.contains(select)){
   const tab=board.tabs[entry.host.id].find(value=>value.id===select.dataset.tab)
   if(tab)return {tab,relative:'.',marker:select}
  }
  const tab=activeTab(entry)
  const row=event.target.closest('[data-tree-path]')
  if(row&&entry.tree.contains(row)){
   const model=modelFor(entry,tab),item=model.items.get(row.dataset.treePath)
   if(item?.directory&&!item.symlink)return {tab,relative:item.path,marker:row,folder:true}
   if(item){const parent=parentOf(item.path);return {tab,relative:parent,marker:parent==='.'?entry.body:entry.tree.querySelector(`[data-tree-path="${CSS.escape(parent)}"]`)||entry.body}}
  }
  return {tab,relative:'.',marker:entry.body}
 }

 function selection(entry){const model=modelFor(entry,activeTab(entry));return model.items.get(model.selected)||null}
 const parentOf=path=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'.'
 function destination(entry){const selected=selection(entry);return selected?.directory?selected.path:selected?parentOf(selected.path):'.'}
 function itemMenu(entry,item,anchor){
  const tab=activeTab(entry)
  const menu=popover(anchor,`<div class="popover-heading" data-no-i18n>${esc(item.name)}</div>${item.directory?'<button data-action="open">打开文件夹</button><button data-action="new-file">新建文件</button><button data-action="new-folder">新建文件夹</button>':'<button data-action="edit">打开 / 编辑文本</button>'}<button data-action="copy">复制到主机…</button><button data-action="rename">重命名</button><button data-action="trash" class="danger">移入回收站</button>`,{width:200})
  menu.element.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{
   const action=button.dataset.action;menu.close()
   if(action==='open'){
    const model=modelFor(entry,tab)
    if(!model.expanded.has(item.path)){
     model.expanded.add(item.path)
     void fetchFolder(entry,tab,item.path)
     renderTree(entry)
    }
   }else if(action==='copy'){
    const picker=popover(anchor,`<div class="popover-heading">选择目标主机 · Copy</div>${[...cards.values()].map(target=>`<button data-copy-destination="${esc(target.host.id)}">${osIcon(target.host)}<span data-no-i18n>${esc(target.host.name)} · ${esc(activeTab(target).path)}</span></button>`).join('')}`,{width:330})
    picker.element.querySelectorAll('[data-copy-destination]').forEach(button=>button.onclick=()=>{
     const target=cards.get(button.dataset.copyDestination),targetTab=target&&activeTab(target)
     picker.close()
     if(target&&!transfers.offerSelection(entry,tab,item,target,targetTab,'.'))message('A file copy preview is already open.','error')
    })
   }else if(action==='edit')void actions.open(entry,tab,item)
   else if(action==='rename')actions.rename(entry,tab,item)
   else if(action==='trash')actions.trash(entry,tab,item)
   else actions.create(entry,tab,action==='new-folder'?'folder':'file',item.path)
  })
 }
 function activate(entry,id){
  if(!board.tabs[entry.host.id].some(tab=>tab.id===id))return
  const keepFocus=entry.tabs.contains(document.activeElement)
  board.active[entry.host.id]=id
  renderTabs(entry);renderTree(entry)
  if(keepFocus)entry.tabs.querySelectorAll('[data-tab]').forEach(button=>{if(button.dataset.tab===id)button.focus({preventScroll:true})})
  const tab=activeTab(entry),model=modelFor(entry,tab)
  if(model.nodes.get('.')?.entries===null&&!model.nodes.get('.')?.loading)void fetchFolder(entry,tab,'.')
  void persist()
 }
 function createTab(entry){
  const tabs=board.tabs[entry.host.id]
  const tab={id:tabId(),path:activeTab(entry).path}
  tabs.push(tab);activate(entry,tab.id)
 }
 function closeTab(entry,id){
  const tabs=board.tabs[entry.host.id],index=tabs.findIndex(tab=>tab.id===id)
  if(index<0||tabs.length===1)return
  tabs.splice(index,1);entry.models.delete(id)
  if(board.active[entry.host.id]===id)board.active[entry.host.id]=tabs[Math.min(index,tabs.length-1)].id
  renderTabs(entry);renderTree(entry)
  const next=activeTab(entry),model=modelFor(entry,next)
  if(model.nodes.get('.')?.entries===null&&!model.nodes.get('.')?.loading)void fetchFolder(entry,next,'.')
  void persist()
 }
 function add(host){
  if(cards.has(host.id)){focus(host.id);return}
  if(!board.tabs[host.id]?.length)board.tabs[host.id]=[{id:tabId(),path:host.defaultDirectory}]
  if(!board.tabs[host.id].some(tab=>tab.id===board.active[host.id]))board.active[host.id]=board.tabs[host.id][0].id
  const node=document.createElement('article')
  node.className='board-card file-board-card';node.dataset.id=host.id
  node.innerHTML=`<div class="board-card-top"><div class="board-handle" draggable="true" title="拖动调整位置">${osIcon(host)}<div><strong>${esc(host.name)}</strong><span>${esc(osName(host))} · ${esc(hostAddress(host))}</span></div><span class="drag-grip" aria-hidden="true">⠿</span></div><button class="board-open" aria-label="打开 ${esc(host.name)} 的单机工作台" title="打开单机">↗</button><button class="board-remove" aria-label="移出 ${esc(host.name)}" title="移出文件看板">×</button></div><div class="file-board-tabs" role="tablist" aria-label="${esc(host.name)} 文件视图"></div><form class="file-board-navigation"><span aria-hidden="true">⌁</span><input class="file-board-path" aria-label="${esc(host.name)} 当前绝对路径" spellcheck="false" autocomplete="off"><button type="button" class="file-hidden-toggle" aria-pressed="${!!board.showHidden[host.id]}" title="显示或隐藏隐藏文件" aria-label="显示隐藏文件">${eyeIcon}</button><button type="submit" title="打开此绝对路径">前往</button><button type="button" class="file-board-refresh" aria-label="刷新目录" title="刷新当前目录">↻</button></form><div class="file-board-tools"><button type="button" class="file-board-create-file" title="Create text file">＋ 文件</button><button type="button" class="file-board-create-folder" title="Create folder">＋ 文件夹</button><button type="button" class="file-board-selected-actions" title="Manage selected file or folder" aria-label="选中项目的操作" disabled>⋯ 操作</button></div><div class="file-board-transfer-list" aria-label="File transfers" aria-live="polite" hidden></div><div class="file-board-body"><div class="file-board-tree" role="tree" aria-label="${esc(host.name)} 目录树"></div></div><div class="file-board-footer"><span class="file-board-status" aria-live="polite"></span><label>行高 <input class="file-board-height" type="number" min="240" max="1000" step="10" aria-label="${esc(host.name)} 文件窗口高度">px</label><span class="file-board-location" hidden></span></div><div class="board-resize-edge file-board-resize" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="调整 ${esc(host.name)} 所在行高度" aria-valuemin="240" aria-valuemax="1000" title="拖动改变文件窗口高度"></div>`
  grid.append(node)
  const entry={host,node,body:node.querySelector('.file-board-body'),tabs:node.querySelector('.file-board-tabs'),path:node.querySelector('.file-board-path'),tree:node.querySelector('.file-board-tree'),status:node.querySelector('.file-board-status'),models:new Map(),removed:false}
  cards.set(host.id,entry)
  transfers.register(entry)
  entry.complete=pathComplete(entry.path,{host,rpc,showHidden:()=>!!board.showHidden[host.id],valid:()=>!entry.removed&&cards.get(host.id)===entry})
  renderTabs(entry);renderTree(entry)
  const hiddenToggle=node.querySelector('.file-hidden-toggle')
  hiddenToggle.onclick=()=>{board.showHidden[host.id]=!board.showHidden[host.id];hiddenToggle.setAttribute('aria-pressed',String(board.showHidden[host.id]));hiddenToggle.title=board.showHidden[host.id]?'隐藏隐藏文件':'显示隐藏文件';entry.models.clear();renderTree(entry);entry.complete.refresh();void fetchFolder(entry,activeTab(entry),'.');void persist()}
  entry.tabs.onclick=event=>{
   const close=event.target.closest('[data-close]')
   if(close){closeTab(entry,close.dataset.close);return}
   const tab=event.target.closest('[data-tab]')
   if(tab){activate(entry,tab.dataset.tab);return}
   if(event.target.closest('.file-board-new-tab'))createTab(entry)
  }
  entry.tabs.onkeydown=event=>{
   if(!['ArrowLeft','ArrowRight'].includes(event.key)||!event.target.closest('[data-tab]'))return
   event.preventDefault()
   const tabs=board.tabs[host.id],index=tabs.findIndex(tab=>tab.id===event.target.dataset.tab)
   activate(entry,tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length].id)
  }
  entry.node.querySelector('.file-board-navigation').onsubmit=event=>{event.preventDefault();void navigate(entry,entry.path.value)}
  entry.node.querySelector('.file-board-refresh').onclick=()=>void navigate(entry,activeTab(entry).path)
  node.querySelector('.file-board-create-file').onclick=()=>actions.create(entry,activeTab(entry),'file',destination(entry))
  node.querySelector('.file-board-create-folder').onclick=()=>actions.create(entry,activeTab(entry),'folder',destination(entry))
  node.querySelector('.file-board-selected-actions').onclick=event=>{const item=selection(entry);if(item)itemMenu(entry,item,event.currentTarget);else actions.create(entry,activeTab(entry),'file','.')}
  entry.tree.ondragstart=event=>{
   const row=event.target.closest('[data-tree-path]')
   if(!row||!entry.tree.contains(row))return
   const model=modelFor(entry,activeTab(entry)),item=model.items.get(row.dataset.treePath)
   if(transfers.begin(entry,activeTab(entry),item,event))row.classList.add('file-board-dragging')
   else event.preventDefault()
  }
  entry.tree.ondragend=()=>{transfers.end();clearFileDrop();entry.tree.querySelectorAll('.file-board-dragging').forEach(node=>node.classList.remove('file-board-dragging'))}
  node.addEventListener('dragover',event=>{
   if(!transfers.recognizes(event))return
   event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy'
   const target=dropDestination(entry,event)
   markDrop(entry,target.marker)
   const key=entry.host.id+'|'+target.tab.id+'|'+target.relative
   if(key===dragHoverKey)return
   clearTimeout(dragHoverTimer);dragHoverKey=key
   if(target.folder){
    dragHoverTimer=setTimeout(()=>{
     const model=modelFor(entry,target.tab)
     if(!model.expanded.has(target.relative)){
      model.expanded.add(target.relative)
      const item=model.nodes.get(target.relative)
      if(!item||item.error)void fetchFolder(entry,target.tab,target.relative)
      if(activeTab(entry).id===target.tab.id)renderTree(entry)
     }
    },650)
   }else if(entry.tabs.contains(target.marker)&&activeTab(entry).id!==target.tab.id){
    dragHoverTimer=setTimeout(()=>activate(entry,target.tab.id),750)
   }
  })
  node.addEventListener('drop',event=>{
   if(!transfers.recognizes(event))return
   event.preventDefault();event.stopPropagation()
   const target=dropDestination(entry,event)
   const handled=transfers.offer(event,entry,target.tab,target.relative)
   clearFileDrop()
   if(!handled)message('Copy preview is already open; finish or cancel it before dropping another file.','error')
  })
  node.addEventListener('dragleave',event=>{if(transfers.drag&&!node.contains(event.relatedTarget))clearFileDrop()})
  entry.tree.onclick=event=>{
   const button=event.target.closest('[data-tree-path]')
   if(!button)return
   const tab=activeTab(entry),model=modelFor(entry,tab),item=model.items.get(button.dataset.treePath)
   if(!item)return
   if(event.target.closest('.file-tree-actions')){
    event.stopPropagation();itemMenu(entry,item,event.target.closest('.file-tree-actions'));return
   }
   if(!item.directory&&(event.target.closest('.file-tree-name')||event.target.closest('.file-tree-icon')))void actions.open(entry,tab,item)
   const keepFocus=document.activeElement===button
   model.selected=item.path
   if(item.directory){if(model.expanded.has(item.path))model.expanded.delete(item.path);else{model.expanded.add(item.path);const folder=model.nodes.get(item.path);if(!folder||folder.error)void fetchFolder(entry,tab,item.path)}}
   renderTree(entry)
   if(keepFocus)entry.tree.querySelectorAll('[data-tree-path]').forEach(row=>{if(row.dataset.treePath===item.path)row.focus({preventScroll:true})})
  }
  // A native file browser always offers actions from the row context menu.
  // Re-select after rendering so its anchor is not detached from the DOM.
  entry.tree.oncontextmenu=event=>{
   const row=event.target.closest('[data-tree-path]')
   if(!row||!entry.tree.contains(row))return
   const tab=activeTab(entry),model=modelFor(entry,tab),item=model.items.get(row.dataset.treePath)
   if(!item)return
   event.preventDefault()
   model.selected=item.path
   renderTree(entry)
   const selected=[...entry.tree.querySelectorAll('[data-tree-path]')].find(node=>node.dataset.treePath===item.path)
   if(selected)itemMenu(entry,item,selected.querySelector('.file-tree-actions')||selected)
  }
  entry.tree.ondblclick=event=>{
   if(event.target.closest('.file-tree-actions'))return
   const row=event.target.closest('[data-tree-path]'),item=row&&modelFor(entry,activeTab(entry)).items.get(row.dataset.treePath)
   if(item&&!item.directory)void actions.open(entry,activeTab(entry),item)
  }
  entry.tree.onkeydown=event=>{
   if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End','Enter','F2','Delete'].includes(event.key))return
   const button=event.target.closest('[data-tree-path]');if(!button)return
   event.preventDefault()
   const model=modelFor(entry,activeTab(entry)),item=model.items.get(button.dataset.treePath),rows=[...entry.tree.querySelectorAll('[data-tree-path]')],index=rows.indexOf(button)
   const move=next=>{if(!next)return;model.selected=next.dataset.treePath;renderTree(entry);for(const row of entry.tree.querySelectorAll('[data-tree-path]'))if(row.dataset.treePath===model.selected){row.focus({preventScroll:true});row.scrollIntoView({block:'nearest'})}}
   if(event.key==='ArrowDown')return move(rows[Math.min(index+1,rows.length-1)])
   if(event.key==='ArrowUp')return move(rows[Math.max(index-1,0)])
   if(event.key==='Home')return move(rows[0])
   if(event.key==='End')return move(rows.at(-1))
   if(!item)return
   if(event.key==='Enter'){
    if(item.directory)button.click();else void actions.open(entry,activeTab(entry),item)
    return
   }
   if(event.key==='F2'){actions.rename(entry,activeTab(entry),item);return}
   if(event.key==='Delete'){actions.trash(entry,activeTab(entry),item);return}
   const expanded=model.expanded.has(item.path)
   if(event.key==='ArrowRight'){
    if(!item.directory)return
    if(!expanded)button.click();else if(rows[index+1]?.getAttribute('aria-level')>button.getAttribute('aria-level'))move(rows[index+1])
   }else if(item.directory&&expanded)button.click()
   else{const parent=item.path.slice(0,item.path.lastIndexOf('/'));move(rows.find(row=>row.dataset.treePath===parent))}
  }
  node.querySelector('.board-open').onclick=()=>open(host.id)
  node.querySelector('.board-remove').onclick=()=>{entry.removed=true;entry.complete.dispose();transfers.unregister(host.id);node.remove();cards.delete(host.id);layout();choices();void persist()}
  const setHeight=height=>{for(const peer of row(entry))board.sizes[peer.host.id]=height;layout()}
  const heightInput=node.querySelector('.file-board-height')
  heightInput.oninput=()=>{if(heightInput.checkValidity())setHeight(Number(heightInput.value))}
  heightInput.onchange=()=>{if(heightInput.checkValidity())void persist();else heightInput.reportValidity()}
  const handle=node.querySelector('.file-board-resize');let resizing
  handle.onpointerdown=event=>{if(event.button!==0||event.isPrimary===false||resizing)return;event.preventDefault();resizing={id:event.pointerId,y:event.clientY,height:Number(entry.body.style.height.slice(0,-2)),changed:false};handle.setPointerCapture(event.pointerId);node.classList.add('resizing')}
  handle.onpointermove=event=>{if(!resizing||event.pointerId!==resizing.id)return;event.preventDefault();const next=dragRowHeight(resizing.height,event.clientY-resizing.y);if(next!==Number(entry.body.style.height.slice(0,-2))){setHeight(next);resizing.changed=true}}
  const endResize=event=>{if(!resizing||event.pointerId!==resizing.id)return;const changed=resizing.changed;resizing=null;node.classList.remove('resizing');if(changed)void persist()}
  handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=endResize
  handle.onkeydown=event=>{const height=Number(entry.body.style.height.slice(0,-2)),next=keyRowHeight(height,event.key,event.shiftKey?50:10);if(next===null)return;event.preventDefault();if(height!==next){setHeight(next);void persist()}}
  layout();choices()
  void fetchFolder(entry,activeTab(entry),'.')
 }
 function focus(id){
  let entry=cards.get(id)
  if(!entry){const host=hosts.find(h=>h.id===id);if(host){add(host);void persist();entry=cards.get(id)}}
  if(entry){entry.node.scrollIntoView({block:'nearest',behavior:'smooth'});entry.path.focus({preventScroll:true})}
 }
 root.ondragover=event=>{if(event.dataTransfer.types.includes(hostDragType)){event.preventDefault();event.dataTransfer.dropEffect='copy';grid.classList.add('drop-active')}}
 root.ondragleave=event=>{if(!root.contains(event.relatedTarget))grid.classList.remove('drop-active')}
 root.ondrop=event=>{const id=event.dataTransfer.getData(hostDragType);if(!id)return;event.preventDefault();grid.classList.remove('drop-active');const host=hosts.find(h=>h.id===id);if(host){if(cards.has(id))focus(id);else{add(host);void persist()}}}
 const order=board.initialized?board.hosts:hosts.slice(0,2).map(h=>h.id)
 for(const id of order){const host=hosts.find(h=>h.id===id);if(host)add(host)}
 layout();choices()
 if(!board.initialized)void persist()
 q('#file-board-columns').onchange=event=>{board.columns=Number(event.target.value);layout();void persist()}
 q('#file-board-add').onclick=()=>{
  const picker=popover(q('#file-board-add'),'<div class="popover-heading">添加云主机到文件看板</div><input class="host-picker-search" type="search" placeholder="搜索主机" aria-label="搜索云主机"><div class="host-picker-list"></div>',{width:300})
  const draw=()=>{const query=picker.element.querySelector('input').value.toLowerCase();picker.element.querySelector('.host-picker-list').innerHTML=hosts.filter(h=>!cards.has(h.id)&&h.name.toLowerCase().includes(query)).map(h=>'<button data-host="'+esc(h.id)+'">'+osIcon(h)+'<span>'+esc(h.name)+'</span></button>').join('');picker.element.querySelectorAll('[data-host]').forEach(button=>button.onclick=()=>{add(hosts.find(h=>h.id===button.dataset.host));picker.close();void persist()})}
  picker.element.querySelector('input').oninput=draw;draw();picker.element.querySelector('input').focus()
 }
 const observer=new ResizeObserver(()=>{if(grid.clientWidth!==layoutWidth)layout()});observer.observe(grid)
 const stopSort=sortable(grid,{selector:'.board-card',handle:'.board-handle',type:'application/x-cloud-file-board-order',onChange:()=>{layout();void persist()}})
 return {focus,dispose(){disposed=true;clearFileDrop();root.ondragover=null;root.ondragleave=null;root.ondrop=null;stopSort();observer.disconnect();for(const entry of cards.values()){entry.removed=true;entry.complete.dispose()}transfers.dispose();actions.dispose();root.classList.remove('file-board-workbench')}}
}
