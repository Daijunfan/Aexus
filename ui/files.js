import {popover} from './popover.js'
import {confirmDiscard} from './unsaved.js'
import {pathComplete,eyeIcon} from './path-complete.js'
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const stationType='application/x-cloud-hosts-station',remoteType='application/x-cloud-hosts-file'
const selected=new Set(),expanded=new Set(),directories=new Map()
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(2)+' GB'
const fileIcon='<svg viewBox="0 0 48 48" fill="none"><path d="M12 5h16l9 10v27H12z" fill="#f9fbff" stroke="currentColor" stroke-width="2"/><path d="M28 5v11h9M18 24h13M18 31h10" stroke="currentColor" stroke-width="2"/></svg>'
const folderIcon='<svg viewBox="0 0 64 52" fill="none"><path d="M5 13V7a3 3 0 0 1 3-3h18l7 8h23a3 3 0 0 1 3 3v28H5z" fill="#d9a94a"/><path d="M4 15h56l-4 31H8z" fill="#f2cc73"/><path d="M6 17h52" stroke="#ffe9ac" stroke-width="2"/></svg>'
const order=(a,b)=>(a.type==='folder'?0:1)-(b.type==='folder'?0:1)||a.name.localeCompare(b.name,'zh-CN')
export function filesPane(root,host,rpc,message){
 let disposed=false,items=[],jobs=[],remote=[],directory=directories.get(host?.id)||host?.defaultDirectory,version=0,signature='',jobsSignature='',directoryReady=false,refreshing=false,dragging=false,timer,parent=localStorage.getItem('cloud.station.parent')||null,view=localStorage.getItem('cloud.station.view')||'grid',remoteView=localStorage.getItem('cloud.remote.view')||'tree',showHidden=localStorage.getItem('cloud.remote.showHidden.'+(host?.id||'none'))==='1'
 const native=window.webkit?.messageHandlers?.station||(window.chrome?.webview?{postMessage:data=>window.chrome.webview.postMessage(data)}:null),q=s=>root.querySelector(s),join=(base,name)=>base.replace(/[\\/]+$/,'')+(host?.os==='windows'?'\\':'/')+name
 root.innerHTML=`<div class="files-heading"><div><strong>文件中转站</strong><p>整理文件层级，按需在本机与云主机之间复制。</p></div><span class="station-badge">独立保存 · 本机中转</span></div><div class="files-layout"><section class="remote-files file-section"><div class="section-heading"><strong ${host?'data-no-i18n':''}>${esc(host?.name||'远端文件')}</strong><div class="view-switch"><button data-remote-view="tree" title="目录列表">☷</button><button data-remote-view="grid" title="大图标">▦</button></div><button id="remote-trash" ${host?'':'disabled'}>回收站</button><button id="remote-refresh" ${host?'':'disabled'}>刷新</button></div><form id="remote-navigation"><button type="button" id="remote-up" ${host?'':'disabled'} aria-label="返回上一级目录" title="返回上一级目录">←</button><input id="remote-directory" aria-label="远端目录" value="${esc(directory||'')}" placeholder="选择左侧主机" ${host?'':'disabled'}><button type="button" id="remote-hidden" class="file-hidden-toggle" aria-pressed="${showHidden}" title="显示或隐藏隐藏文件" aria-label="显示隐藏文件" ${host?'':'disabled'}>${eyeIcon}</button><button ${host?'':'disabled'}>前往</button></form><div id="remote-list" class="file-list remote-drop" aria-label="远端文件列表"></div><div class="file-section-foot"><span>拖入文件或文件夹，复制到当前目录。</span><button id="send-selected" disabled>发送所选</button></div></section><section id="station-drop" class="file-section station-section" aria-label="文件中转站"><div class="section-heading"><strong>中转站 <span id="station-count">0</span></strong><div class="view-switch"><button data-station-view="tree" aria-label="树形视图">☷</button><button data-station-view="grid" aria-label="大图标视图">▦</button></div></div><div class="station-toolbar"><button id="station-folder">＋ 文件夹</button><button id="station-file">＋ 文件</button><button id="station-add">导入文件</button><button id="station-add-folder">导入文件夹</button><input id="station-upload" type="file" multiple hidden><input id="station-folder-upload" type="file" webkitdirectory multiple hidden></div><div id="station-breadcrumbs"></div><input id="station-search" type="search" placeholder="搜索文件、文件夹" aria-label="搜索中转站文件"><div id="station-list" class="file-list"></div><div class="station-selection"><span id="selection-count">未选择</span><button id="station-move" disabled>移动到…</button><button id="station-clear-selection">清除选择</button></div><div class="file-section-foot"><span>拖到文件夹可调整层级；拖到主机可发送。</span></div></section></div><div id="transfer-jobs" aria-live="polite"></div><dialog id="station-dialog"></dialog>`
 const pathChooser=host?pathComplete(q('#remote-directory'),{host,rpc,showHidden:()=>showHidden}):null
 q('#remote-hidden').onclick=()=>{
  showHidden=!showHidden;
  localStorage.setItem('cloud.remote.showHidden.'+host.id,showHidden?'1':'0');
  q('#remote-hidden').setAttribute('aria-pressed',String(showHidden));
  q('#remote-hidden').title=showHidden?'隐藏隐藏文件':'显示隐藏文件';
  pathChooser?.refresh();void browse(directory)
 }
 function report(error){if(!disposed)message(error.message||String(error),'error')}
 const children=id=>items.filter(item=>item.parent===(id||null)).sort(order)
 const topSelection=()=>[...selected].filter(id=>{let item=items.find(row=>row.id===id);while(item?.parent){if(selected.has(item.parent))return false;item=items.find(row=>row.id===item.parent)}return true})
 const goto=id=>{parent=id||null;localStorage.setItem('cloud.station.parent',parent||'');if(parent)expanded.add(parent);selected.clear();renderStation()}
 let edited=null,discardTask=null
 function dialog(title,body,accept){
  const el=q('#station-dialog');el.innerHTML=`<form><h3 data-no-i18n>${esc(title)}</h3>${body}<div class="dialog-actions"><button type="button" id="dialog-cancel">取消</button><button class="primary">确定</button></div></form>`
  const form=el.querySelector('form'),editor=form.querySelector('.file-editor')
  edited=editor?{editor,original:editor.value,saving:false}:null
  const close=async()=>{if(await leaveEditor()){edited=null;el.close()}}
  el.oncancel=event=>{event.preventDefault();void close()}
  el.showModal();el.querySelector('input,textarea,select')?.focus();el.querySelector('#dialog-cancel').onclick=()=>void close()
  form.onsubmit=async event=>{
   event.preventDefault();if(form.dataset.saving)return
   form.dataset.saving='1';if(edited)edited.saving=true
   const submit=form.querySelector('.primary');submit.disabled=true
   try{await accept(new FormData(form));if(disposed)return;edited=null;el.close();await refresh(true)}
   catch(error){report(error)}finally{delete form.dataset.saving;submit.disabled=false;if(edited)edited.saving=false}
  }
 }
 function leaveEditor(){
  if(!edited)return Promise.resolve(true)
  if(edited.saving){message('正在保存，请稍候');return Promise.resolve(false)}
  if(edited.editor.value===edited.original)return Promise.resolve(true)
  if(!discardTask)discardTask=confirmDiscard(root).then(value=>{if(value&&edited){edited.original=edited.editor.value}return value}).finally(()=>discardTask=null)
  return discardTask
 }
 const beforeLeave=event=>event.detail.checks.push(leaveEditor())
 const beforeUnload=event=>{if(edited&&edited.editor.value!==edited.original){event.preventDefault();event.returnValue=''}}
 window.addEventListener('workspace-before-leave',beforeLeave);window.addEventListener('beforeunload',beforeUnload)
 function updateSend(){
  const valid=!!host&&directoryReady&&q('#remote-directory').value.trim()===directory
  q('#send-selected').disabled=!valid||!selected.size;q('#remote-trash').disabled=!valid
  root.querySelectorAll('.station-send').forEach(button=>button.disabled=!valid)
 }
 q('#remote-directory').addEventListener('input',updateSend)

 function create(type){dialog(type==='folder'?'新建文件夹':'新建文件',`<label>名称<input name="name" required value="${type==='folder'?'新建文件夹':'未命名.txt'}"></label>${type==='file'?'<label>文件内容<textarea name="text" rows="7" placeholder="可留空"></textarea></label>':''}`,data=>rpc('station.create',{name:data.get('name'),type,parent,text:data.get('text')||''}))}
 function rename(item){dialog('重命名',`<label>名称<input name="name" required value="${esc(item.name)}"></label>`,data=>rpc('station.update',{item:item.id,patch:{name:data.get('name')}}))}
 function move(ids){dialog('移动到文件夹',`<label>目标目录<select name="parent"><option value="">中转站根目录</option>${items.filter(item=>item.type==='folder'&&!ids.includes(item.id)).sort((a,b)=>a.logicalPath.localeCompare(b.logicalPath)).map(item=>`<option data-no-i18n value="${item.id}">${esc(item.logicalPath)}</option>`).join('')}</select></label>`,async data=>{for(const item of ids)await rpc('station.update',{item,patch:{parent:data.get('parent')||null}});selected.clear()})}
 async function open(item){if(item.type==='folder'){goto(item.id);return}const text=/\.(txt|md|json|csv|xml|html?|css|[cm]?js|tsx?|py|sh|ya?ml|log)$/i.test(item.name);if(text){try{const value=await rpc('station.read',{item:item.id});if(disposed)return;dialog('编辑 '+item.name,`<textarea name="text" class="file-editor" rows="16">${esc(value.text)}</textarea>`,data=>rpc('station.write',{item:item.id,text:data.get('text'),expectedHash:value.sha256}))}catch(error){report(error)}}else{const el=q('#station-dialog');el.innerHTML=`<div class="preview-heading"><strong data-no-i18n>${esc(item.name)}</strong><button id="preview-close">关闭</button></div><img class="file-preview" src="./station/thumbnail/${item.id}?v=${item.sha256||item.modifiedAt}" alt="文件预览"><p class="hint">${size(item.bytes)} · ${esc(item.logicalPath)}</p>`;el.showModal();el.querySelector('#preview-close').onclick=()=>el.close()}}
 function crumbs(){const path=[];let item=items.find(row=>row.id===parent);while(item){path.unshift(item);item=items.find(row=>row.id===item.parent)}q('#station-breadcrumbs').innerHTML='<button data-folder="" data-folder-target="">中转站</button>'+path.map(item=>`<span>›</span><button data-no-i18n data-folder="${item.id}" data-folder-target="${item.id}">${esc(item.name)}</button>`).join('');q('#station-breadcrumbs').querySelectorAll('[data-folder]').forEach(button=>button.onclick=()=>goto(button.dataset.folder))}
 function visual(item){const folder=item.type==='folder',extension=item.name.split('.').at(-1).toUpperCase();return `<div class="asset-visual ${folder?'folder-visual':'file-visual'}">${folder?folderIcon:fileIcon}${!folder?`<img loading="lazy" src="./station/thumbnail/${item.id}?v=${item.sha256||item.modifiedAt}" alt="${esc(item.name)}缩略图"><span class="asset-extension ${extension==='PDF'?'pdf':''}">${esc(extension.slice(0,5))}</span>`:''}</div>`}
 function card(item,depth=0){const folder=item.type==='folder';return `<article class="station-item ${view==='grid'?'asset-card':'tree-row'} ${selected.has(item.id)?'selected':''}" data-item="${item.id}" tabindex="0" ${view==='tree'?`role="treeitem" aria-level="${depth+1}" ${folder?`aria-expanded="${expanded.has(item.id)}"`:''}`:''} ${folder?'data-folder-target="'+item.id+'"':''} draggable="true" style="--depth:${depth}"><input class="station-select" type="checkbox" aria-label="选择 ${esc(item.name)}" ${selected.has(item.id)?'checked':''}>${view==='tree'?`<button class="tree-disclosure" ${folder?'':'disabled'} aria-label="展开 ${esc(item.name)}">${folder?(expanded.has(item.id)?'⌄':'›'):''}</button>`:''}${visual(item)}<div class="station-item-info"><strong data-no-i18n title="${esc(item.logicalPath)}">${esc(item.name)}</strong><span>${folder?item.children+' 项':size(item.bytes)} · <span data-no-i18n>${esc(item.source?.name||'中转站')}</span></span></div><button class="item-menu" aria-label="操作 ${esc(item.name)}">⋯</button><div class="station-actions"><button class="station-send" ${host?'':'disabled'}>发送</button><button class="station-download">下载</button>${native?'<button class="station-drag-out" aria-label="拖到本机" title="按住拖到文件管理器">↗</button>':''}</div></article>`}
 function renderStation(){
  const list=q('#station-list'),focused=list.contains(document.activeElement)?{id:document.activeElement.closest('[data-item]')?.dataset.item,selector:document.activeElement.classList[0]}:null,scroll=list.scrollTop
  if(parent&&!items.some(item=>item.id===parent))parent=null;for(const id of selected)if(!items.some(item=>item.id===id))selected.delete(id);crumbs();
  q('#station-count').textContent=items.length;updateSend();q('#station-move').disabled=!selected.size;q('#selection-count').textContent=selected.size?'已选 '+selected.size+' 项':'未选择';
  root.querySelectorAll('[data-station-view]').forEach(button=>button.classList.toggle('active',button.dataset.stationView===view));
  const query=q('#station-search').value.trim().toLowerCase();let html='';
  if(query)html=items.filter(item=>(item.name+' '+item.logicalPath).toLowerCase().includes(query)).sort(order).map(item=>card(item)).join('');
  else if(view==='grid')html=children(parent).map(item=>card(item)).join('');
  else{const walk=(id,depth)=>children(id).map(item=>card(item,depth)+(item.type==='folder'&&expanded.has(item.id)?walk(item.id,depth+1):'')).join('');html=walk(null,0)}
  q('#station-list').classList.toggle('asset-grid',view==='grid');q('#station-list').setAttribute('role',view==='tree'?'tree':'list');q('#station-list').innerHTML=html||`<div class="file-empty station-empty">${folderIcon}<strong>${query?'没有匹配项目':'整理你的文件'}</strong><p>新建文件夹、文件，或拖入已有文件。</p></div>`
  q('#station-list').querySelectorAll('[data-item]').forEach(row=>{
   const item=items.find(item=>item.id===row.dataset.item),id=item.id;
   row.querySelector('img')?.addEventListener('error',event=>event.target.remove());
   row.querySelector('.station-select').onchange=event=>{event.target.checked?selected.add(id):selected.delete(id);row.classList.toggle('selected',event.target.checked);q('#station-move').disabled=!selected.size;q('#selection-count').textContent=selected.size?'已选 '+selected.size+' 项':'未选择';updateSend()};
   row.querySelector('.station-item-info').ondblclick=()=>open(item);if(item.type==='folder'){row.querySelector('.station-item-info').onclick=()=>goto(id);row.querySelector('.asset-visual').onclick=()=>goto(id)}row.querySelector('.asset-visual').ondblclick=()=>open(item);
   const disclosure=row.querySelector('.tree-disclosure');if(disclosure)disclosure.onclick=()=>{expanded.has(id)?expanded.delete(id):expanded.add(id);renderStation()};
   row.ondragend=()=>{dragging=false};row.ondragstart=event=>{dragging=true;const ids=selected.has(id)?topSelection():[id];event.dataTransfer.effectAllowed='copyMove';event.dataTransfer.setData(stationType,JSON.stringify(ids))};
   row.querySelector('.station-send').onclick=()=>send([id],host.id,directory);
   row.querySelector('.station-download').onclick=()=>{if(native)native.postMessage({type:'save',id});else{const a=document.createElement('a');a.href='./station/download/'+id;a.download=item.name+(item.type==='folder'?'.zip':'');a.click()}};
   const drag=row.querySelector('.station-drag-out');if(drag){drag.onmousedown=event=>{event.preventDefault();event.stopPropagation();native.postMessage({type:'drag',ids:selected.has(id)?topSelection():[id],x:event.clientX,y:event.clientY})};drag.ondragstart=event=>event.preventDefault()}
   row.querySelector('.item-menu').onclick=event=>{event.stopPropagation();const menu=popover(event.currentTarget,`<div class="popover-heading" data-no-i18n>${esc(item.name)}</div><button data-action="open">${item.type==='folder'?'打开文件夹':'预览 / 编辑'}</button><button data-action="rename">重命名</button><button data-action="move">移动到…</button><button data-action="remove" class="danger">删除中转站副本</button>`);menu.element.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.action;menu.close();if(action==='open')void open(item);if(action==='rename')rename(item);if(action==='move')move([id]);if(action==='remove'){const confirm=popover(row.querySelector('.item-menu'),'<div class="popover-heading">删除 '+esc(item.name)+'？</div><button class="danger">确认删除副本</button>');confirm.element.querySelector('button').onclick=async()=>{confirm.close();try{await rpc('station.remove',{item:id});await refresh(true)}catch(error){report(error)}}}})};
  })
  updateSend();list.scrollTop=scroll
  if(focused)for(const row of list.querySelectorAll('[data-item]'))if(row.dataset.item===focused.id){
   (focused.selector==='station-item'?row:row.querySelector('.'+focused.selector))?.focus({preventScroll:true});break
  }
 }
 async function browse(next){
  if(!host)return
  const ticket=++version;directoryReady=false;updateSend();q('#remote-list').innerHTML='<div class="file-empty">正在读取远端文件…</div>'
  try{const result=await rpc('hosts.files',{id:host.id,directory:next,operation:'workspace',arguments:{operation:'list',args:{path:'.',hidden:showHidden}}});if(disposed||ticket!==version)return;directory=result.root;directories.set(host.id,directory);q('#remote-directory').value=directory;directoryReady=true;pathChooser?.close();remote=result.entries;renderRemote();updateSend()}
  catch(error){if(!disposed&&ticket===version){remote=[];q('#remote-directory').value=directory||'';q('#remote-list').innerHTML='<div class="file-empty">无法读取该目录，请检查路径或连接。</div>';updateSend();report(error)}}
 }
 function renderRemote(){
  if(!directoryReady)return
  root.querySelectorAll('[data-remote-view]').forEach(button=>button.classList.toggle('active',button.dataset.remoteView===remoteView));q('#remote-list').classList.toggle('asset-grid',remoteView==='grid');
  q('#remote-list').innerHTML=remote.map((item,index)=>`<div class="remote-row ${remoteView==='grid'?'remote-asset':''}" data-entry="${index}" ${!item.symlink?'draggable="true"':''}>${item.directory?`<button type="button" class="file-symbol folder-open" aria-label="打开文件夹 ${esc(item.name)}" title="打开文件夹">${folderIcon}</button>`:`<span class="file-symbol">${fileIcon}</span>`}<button class="file-name" data-no-i18n title="${esc(item.name)}">${esc(item.name)}</button><span class="file-size">${item.directory?'文件夹':size(item.bytes)}</span><button class="remote-fetch" ${item.symlink?'disabled':''}>存入中转站</button><button class="remote-delete danger" ${item.symlink?'disabled':''} aria-label="删除远端 ${esc(item.name)}">删除</button></div>`).join('')||'<div class="file-empty">这个目录还没有文件。</div>';
  q('#remote-list').querySelectorAll('[data-entry]').forEach(row=>{const item=remote[Number(row.dataset.entry)];const openEntry=()=>item.directory?browse(join(directory,item.name)):fetchRemote({host:host.id,directory,path:item.name},parent);row.querySelector('.file-name').onclick=openEntry;if(item.directory)row.querySelector('.folder-open').onclick=openEntry;row.querySelector('.remote-fetch').onclick=()=>fetchRemote({host:host.id,directory,path:item.name},parent);row.querySelector('.remote-delete').onclick=event=>{const confirm=popover(event.currentTarget,'<div class="popover-heading">将 '+esc(item.name)+' 放入此目录的回收站？</div><button class="danger">确认移入回收站</button>');confirm.element.querySelector('button').onclick=async()=>{confirm.close();try{await rpc('hosts.files',{id:host.id,directory,operation:'workspace',arguments:{operation:'trash',args:{path:item.path}}});await browse(directory);message('已删除，可在此目录的回收站恢复')}catch(error){report(error)}}};row.ondragstart=event=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData(remoteType,JSON.stringify({host:host.id,directory,path:item.name}))}})
 }
 function renderJobs(){q('#transfer-jobs').innerHTML=jobs.slice(-4).reverse().map(job=>`<div class="transfer-job ${job.state}"><div><strong>${job.kind==='fetch'?'存入中转站':'发送到 ' }<span data-no-i18n>${job.kind==='fetch'?'':esc(job.hostName)}</span> · <span data-no-i18n>${esc(job.name)}</span></strong><span>${job.state==='running'?size(job.bytes)+' / '+size(job.total):job.state==='done'?'已完成，文件保留在中转站':esc(job.error||'已取消')}</span></div>${job.state==='running'?`<progress value="${job.bytes}" max="${job.total||1}"></progress><button data-cancel="${job.id}">取消</button>`:'<span class="transfer-result">'+(job.state==='done'?'✓':'!')+'</span>'}</div>`).join('');q('#transfer-jobs').querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>rpc('station.cancel',{job:button.dataset.cancel}).catch(report))}
 async function refresh(force=false){
  if(refreshing&&!force)return;refreshing=true
  try{const data=await rpc('station.list');if(disposed)return;items=data.items;jobs=data.jobs
   const next=JSON.stringify(items),nextJobs=JSON.stringify(jobs)
   if(!dragging&&(force||next!==signature)){signature=next;renderStation()}
   if(force||nextJobs!==jobsSignature){jobsSignature=nextJobs;renderJobs()}
  }finally{refreshing=false}
 }
 async function fetchRemote(source,target){try{await rpc('station.fetch',{...source,parent:target});message('正在存入中转站');await refresh()}catch(error){report(error)}}
 async function send(ids,target,targetDirectory,fromCurrent=true){if(fromCurrent&&(!directoryReady||q('#remote-directory').value.trim()!==directory)){message('目标目录尚未就绪，请先成功打开目录。','error');return}try{for(const item of ids)await rpc('station.send',{item,host:target,directory:targetDirectory});message('已加入发送队列');await refresh();void completeSends()}catch(error){report(error)}}
 async function completeSends(){try{while(!disposed){const result=await rpc('station.list');if(!result.jobs.some(job=>job.state==='running')){if(host&&directoryReady&&q('#remote-directory').value.trim()===directory)void browse(directory);return}await new Promise(resolve=>setTimeout(resolve,700))}}catch(error){report(error)}}
 async function upload(files,target=parent){for(const file of files){try{await new Promise((resolve,reject)=>{const request=new XMLHttpRequest();request.open('POST','./station/upload?name='+encodeURIComponent(file.name)+(target?'&parent='+target:''));request.upload.onprogress=event=>{if(!disposed&&event.lengthComputable)message('存入 '+file.name+' · '+Math.floor(event.loaded/event.total*100)+'%')};request.onload=()=>request.status===200?resolve():reject(Error(JSON.parse(request.responseText).error||'存入失败'));request.onerror=()=>reject(Error('连接中断，请重试'));request.send(file)});await refresh()}catch(error){report(error)}}}
 async function uploadFolder(files){const folders=new Map();for(const file of files){const parts=file.webkitRelativePath.split('/');let target=parent,prefix='';for(const name of parts.slice(0,-1)){prefix+='/'+name;if(!folders.has(prefix)){const item=await rpc('station.create',{name,type:'folder',parent:target});folders.set(prefix,item.id)}target=folders.get(prefix)}await upload([file],target)}await refresh(true)}
 async function entryUpload(entry,target){if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));await upload([file],target)}else{const folder=await rpc('station.create',{name:entry.name,type:'folder',parent:target}),reader=entry.createReader();while(true){const rows=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!rows.length)break;for(const child of rows)await entryUpload(child,folder.id)}}}
 const mark=(el,on)=>el.classList.toggle('drop-active',on),types=event=>event.dataTransfer.types;
 q('#station-drop').ondragover=event=>{if(![stationType,remoteType,'Files'].some(type=>types(event).includes(type)))return;event.preventDefault();event.dataTransfer.dropEffect=types(event).includes(stationType)?'move':'copy';mark(event.target.closest('[data-folder-target]')||q('#station-drop'),true)};
 q('#station-drop').ondragleave=event=>{const node=event.target.closest('[data-folder-target]');if(node&&!node.contains(event.relatedTarget))mark(node,false);if(!event.currentTarget.contains(event.relatedTarget))mark(event.currentTarget,false)};
 q('#station-drop').ondrop=async event=>{event.preventDefault();root.querySelectorAll('.drop-active').forEach(el=>mark(el,false));const node=event.target.closest('[data-folder-target]'),target=node?(node.dataset.folderTarget||null):parent,source=event.dataTransfer.getData(remoteType),data=event.dataTransfer.getData(stationType);try{if(data){for(const item of JSON.parse(data))await rpc('station.update',{item,patch:{parent:target||null}});await refresh(true)}else if(source)await fetchRemote(JSON.parse(source),target);else{const entries=[...event.dataTransfer.items].map(item=>item.webkitGetAsEntry?.()).filter(Boolean);if(entries.length)for(const entry of entries)await entryUpload(entry,target);else await upload([...event.dataTransfer.files],target)}}catch(error){report(error)}};
 q('#remote-list').ondragover=event=>{if(host&&directoryReady&&q('#remote-directory').value.trim()===directory&&types(event).includes(stationType)){event.preventDefault();event.dataTransfer.dropEffect='copy';mark(event.currentTarget,true)}};q('#remote-list').ondragleave=event=>{if(!event.currentTarget.contains(event.relatedTarget))mark(event.currentTarget,false)};q('#remote-list').ondrop=event=>{event.preventDefault();mark(event.currentTarget,false);const data=event.dataTransfer.getData(stationType);if(data&&host)void send(JSON.parse(data),host.id,directory)};
 const hosts=document.querySelector('#hosts'),dragover=event=>{const node=event.target.closest('[data-id]');if(node&&types(event).includes(stationType)){event.preventDefault();event.dataTransfer.dropEffect='copy';mark(node,true)}},dragleave=event=>{const node=event.target.closest('[data-id]');if(node&&!node.contains(event.relatedTarget))mark(node,false)},drop=async event=>{const node=event.target.closest('[data-id]'),data=event.dataTransfer.getData(stationType);if(!node||!data)return;event.preventDefault();mark(node,false);try{const target=await rpc('hosts.get',{id:node.dataset.id});await send(JSON.parse(data),target.id,target.defaultDirectory,false);node.click()}catch(error){report(error)}};
 hosts.addEventListener('dragenter',dragover,true);hosts.addEventListener('dragover',dragover,true);hosts.addEventListener('dragleave',dragleave,true);hosts.addEventListener('drop',drop,true);
 q('#station-folder').onclick=()=>create('folder');q('#station-file').onclick=()=>create('file');q('#station-add').onclick=()=>q('#station-upload').click();q('#station-add-folder').onclick=()=>q('#station-folder-upload').click();q('#station-upload').onchange=event=>{void upload([...event.target.files]);event.target.value=''};q('#station-folder-upload').onchange=event=>{void uploadFolder([...event.target.files]).catch(report);event.target.value=''};
 q('#remote-trash').onclick=async()=>{try{const result=await rpc('hosts.files',{id:host.id,directory,operation:'workspace',arguments:{operation:'trash-list',args:{path:'.'}}});const menu=popover(q('#remote-trash'),'<div class="popover-heading">当前目录的回收站</div>'+ (result.items.length?result.items.map(item=>'<button data-restore="'+item.id+'">恢复 '+esc(item.path)+'</button>').join(''):'<p class="popover-empty">回收站为空</p>'),{width:260});menu.element.querySelectorAll('[data-restore]').forEach(button=>button.onclick=async()=>{try{await rpc('hosts.files',{id:host.id,directory,operation:'workspace',arguments:{operation:'restore',args:{id:button.dataset.restore}}});menu.close();await browse(directory);message('已恢复')}catch(error){report(error)}})}catch(error){report(error)}};
 q('#station-list').onkeydown=event=>{
  if(view!=='tree'||event.altKey||event.ctrlKey||event.metaKey)return;
  const row=event.target.closest('.station-item');
  if(!row||event.target.matches('input[type=text],input[type=search],textarea'))return;
  const rows=[...q('#station-list').querySelectorAll('.station-item')],index=rows.indexOf(row);
  const id=row.dataset.item,item=items.find(entry=>entry.id===id);
  if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End'){
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));
   rows[next]?.focus({preventScroll:true});rows[next]?.scrollIntoView({block:'nearest'});return;
  }
  if(event.key==='ArrowRight'&&item?.type==='folder'){
   event.preventDefault();if(!expanded.has(id)){expanded.add(id);renderStation();q('#station-list').querySelector(`[data-item="${CSS.escape(id)}"]`)?.focus({preventScroll:true})}
   else rows[index+1]?.focus({preventScroll:true});return;
  }
  if(event.key==='ArrowLeft'){
   if(item?.type==='folder'&&expanded.has(id)){event.preventDefault();expanded.delete(id);renderStation();q('#station-list').querySelector(`[data-item="${CSS.escape(id)}"]`)?.focus({preventScroll:true})}
   else if(item?.parent){event.preventDefault();q('#station-list').querySelector(`[data-item="${CSS.escape(item.parent)}"]`)?.focus({preventScroll:true})}
  }
 };
 q('#station-search').oninput=renderStation;q('#station-clear-selection').onclick=()=>{selected.clear();renderStation()};q('#station-move').onclick=()=>move(topSelection());q('#send-selected').onclick=()=>send(topSelection(),host.id,directory);
 root.querySelectorAll('[data-station-view]').forEach(button=>button.onclick=()=>{view=button.dataset.stationView;localStorage.setItem('cloud.station.view',view);renderStation()});root.querySelectorAll('[data-remote-view]').forEach(button=>button.onclick=()=>{remoteView=button.dataset.remoteView;localStorage.setItem('cloud.remote.view',remoteView);renderRemote()});
 q('#remote-navigation').onsubmit=event=>{event.preventDefault();void browse(q('#remote-directory').value.trim())};q('#remote-refresh').onclick=()=>browse(directory);q('#remote-up').onclick=()=>{let next=directory.replace(/[\\/]+$/,'').replace(/[\\/][^\\/]+$/,'')||'/';if(/^[a-z]:$/i.test(next))next+='\\';void browse(next)};
 if(host)void browse(directory);else q('#remote-list').innerHTML='<div class="file-empty">选择主机即可浏览文件。</div>';
 void refresh().catch(report);timer=setInterval(()=>{if(!document.hidden)void refresh().catch(report)},1000);const complete=event=>event.detail?.error?report(event.detail.error):message(event.detail?.message||'文件已保存');window.addEventListener('station-native-result',complete);
 return()=>{disposed=true;window.removeEventListener('workspace-before-leave',beforeLeave);window.removeEventListener('beforeunload',beforeUnload);q('#station-dialog').close();clearInterval(timer);hosts.removeEventListener('dragenter',dragover,true);hosts.removeEventListener('dragover',dragover,true);hosts.removeEventListener('dragleave',dragleave,true);hosts.removeEventListener('drop',drop,true);window.removeEventListener('station-native-result',complete);pathChooser?.dispose()}
}
