import {osIcon,osName} from './os.js'
import {sortable} from './sortable.js'
import {popover} from './popover.js'
import {agentTerminal} from './agent-terminal.js'
import {agentCanvas} from './agent-canvas.js'
import {sourceChoices,sourceLabel,permittedEngines,canCreateAgent} from './agent-create-options.js'
import {names,esc,normalize,origin,statusName,cloudIcon} from './agent-model.js'
import './agent-board.css'

export function agentBoardPane(root,initialHosts,rpc,message,initialHost,state={},saveWorkspace,options={}){
 let disposed=false,hosts=initialHosts.slice(),sessions=[],refreshTask=null,ready=false,inspectorClose,refreshTimer
 const layout={hosts:[],columns:2,roleHeight:270,roleOrder:{},roleOffsets:{},initialized:false,...state.agentBoard},cards=new Map(),dialogs=new Set(),capabilities=new Map()
 const singleHostId=options.singleHostId;
 const visibleSessions=()=>sessions.filter(item=>layout.hosts.includes(item.targetHostId));

 if(singleHostId){layout.hosts=[singleHostId];layout.columns=1;layout.initialized=true}
 let initialOpen=options.autoOpenSession,activating=new Set();
 const save=saveWorkspace||((patch)=>rpc('hosts.workspace',{patch}))
 root.classList.add('agent-workbench','board-workbench')
 root.innerHTML=`<div class="agent-board"><div class="board-heading agent-heading"><div><h2>Agent 看板</h2><p>每个小矩形代表一个会话 · 独立查看启动来源</p></div><span class="agent-count" aria-live="polite">正在读取…</span><button id="agent-add-host" disabled>添加主机</button><button id="agent-refresh">刷新</button></div><div class="agent-legend"><span>${osIcon({os:'macos'})}<span>本地来源按实际系统显示</span></span><span>${cloudIcon}<span>云端引擎来源</span></span><span>离开看板不会停止会话</span></div><div class="board-grid agent-grid" aria-label="Agent 工作主机"></div><p class="agent-group-empty" hidden>选择要添加的云主机</p></div>`
 const q=s=>root.querySelector(s),grid=q('.agent-grid')
 if(singleHostId){root.classList.add('single-agent-workbench');q('.agent-heading h2').textContent='Coding Agents';q('.agent-heading p').textContent='Sessions working on this host · drag to swap';q('#agent-add-host').hidden=true}

 const hostById=id=>hosts.find(host=>host.id===id)||sessions.find(item=>item.targetHostId===id)?.targetHost;
 function gridColumns(){grid.style.gridTemplateColumns='';grid.dataset.columns='auto'}
 async function persist(){
  // Keep legacy tab metadata out of native session layout updates.
  const {hubTab:_tab,projectViewId:_project,groups:_groups,activeGroup:_group,...layoutOnly}=layout
  const patch=singleHostId?{roleHeight:layout.roleHeight,roleOrder:structuredClone(layout.roleOrder),roleOffsets:structuredClone(layout.roleOffsets)}:structuredClone(layoutOnly);
  try{await save({agentBoardPatch:patch})}catch(error){if(!disposed)message(error.message,'error')}
 }
 function roleLayout(){
  for(const card of cards.values()){
   const viewport=card.node.querySelector('.agent-role-viewport')
   viewport.style.height=layout.roleHeight+'px'
   card.node.querySelector('.agent-role-resize').setAttribute('aria-valuenow',String(layout.roleHeight))
   card.canvas?.resize()
  }
 }

 function dialog(className,html){
  const element=document.createElement('dialog'),previous=document.activeElement
  element.className='agent-dialog '+className;element.innerHTML=html;root.append(element)
  let cleanup=()=>{},closed=false
  const close=()=>{if(closed)return;closed=true;cleanup();dialogs.delete(close);element.close();element.remove();if(previous?.isConnected)previous.focus({preventScroll:true})}
  element.oncancel=event=>{event.preventDefault();close()}
  element.querySelectorAll('[data-close]').forEach(button=>button.onclick=close)
  dialogs.add(close);element.showModal()
  return {element,close,onClose:fn=>{cleanup=fn}}
 }
 function ensureHost(id){if(!layout.hosts.includes(id)){layout.hosts.push(id);layout.initialized=true;void persist()}}
 function draw(){
  if(disposed)return
  const relevant=visibleSessions();
  const boardHosts=layout.hosts;
  for(const [id,card]of cards)if(!boardHosts.includes(id)){card.canvas?.dispose();card.node.remove();cards.delete(id)}
  for(const id of boardHosts){
   const host=hostById(id);if(!host)continue
   const items=relevant.filter(item=>item.targetHostId===id)
   let card=cards.get(id)
   if(!card){
    const node=document.createElement('section');node.className='board-card agent-host-card';node.dataset.id=id;node.dataset.host=id
    node.innerHTML=`<div class="board-card-top"><div class="board-handle" draggable="true" title="拖动排列工作主机">${osIcon(host)}<div><strong></strong><span></span></div><span class="drag-grip" aria-hidden="true">⠿</span></div><button data-add-role aria-label="${esc('在 '+host.name+' 新建 Agent')}">＋</button><button data-hide-host aria-label="${esc('从看板隐藏 '+host.name)}">×</button></div><div class="agent-role-viewport" role="region" tabindex="0" aria-label="${esc(host.name)} 的 Coding Agent 会话，可上下左右滚动"><div class="agent-role-grid"></div></div><div class="agent-role-resize" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="调整所有 Agent 主机的会话区域高度" aria-valuemin="180" aria-valuemax="600" aria-valuenow="${layout.roleHeight}" title="上下拖动调整 Agent 会话区域高度，方向键也可调整"></div><div class="board-card-footer"><span></span></div>`
    grid.append(node);card={node,signature:'',statusSignature:'',initialized:false};cards.set(id,card)
    card.canvas=agentCanvas(node,id,layout,persist,openSession)
    const resize=node.querySelector('.agent-role-resize')
    let resizing=null
    resize.onpointerdown=event=>{
     if(event.button!==0||event.isPrimary===false)return
     event.preventDefault();resizing={pointerId:event.pointerId,y:event.clientY,height:layout.roleHeight,changed:false}
     resize.setPointerCapture(event.pointerId)
    }
    resize.onpointermove=event=>{
     if(!resizing||resizing.pointerId!==event.pointerId)return
     const height=Math.max(180,Math.min(600,Math.round((resizing.height+event.clientY-resizing.y)/10)*10))
     if(height!==layout.roleHeight){layout.roleHeight=height;roleLayout();resizing.changed=true}
    }
    const endResize=event=>{if(!resizing||event.pointerId!==resizing.pointerId)return;const changed=resizing.changed;resizing=null;if(changed)void persist()}
    resize.onpointerup=resize.onpointercancel=resize.onlostpointercapture=endResize
    resize.onkeydown=event=>{
     const delta=event.key==='ArrowDown'?10:event.key==='ArrowUp'?-10:null
     if(delta===null)return
     event.preventDefault();layout.roleHeight=Math.max(180,Math.min(600,layout.roleHeight+(event.shiftKey?delta*5:delta)));roleLayout();void persist()
    }
    roleLayout()

    node.querySelectorAll('[data-add-role]').forEach(button=>{button.hidden=!!host.hostMissing;button.title='Create native Coding Agent session';button.onclick=()=>createRole(id)})
    node.querySelector('[data-hide-host]').hidden=!!singleHostId
    node.querySelector('[data-hide-host]').onclick=()=>{layout.hosts=layout.hosts.filter(value=>value!==id);draw();void persist()}

   }
   card.node.querySelector('.board-handle strong').textContent=host.name
   card.node.querySelector('.board-handle>div>span').textContent=host.hostMissing?'Host ID not found in CloudHosts registry':(id==='local'?'本地工作主机':'云端工作主机')+' · '+osName(host)
   card.node.querySelector('.board-card-footer>span').textContent=items.length+' 个会话 · '+items.filter(item=>item.running).length+' 个会话在线'
   const signature=JSON.stringify(items.map(item=>[item.id,item.name,item.engine,item.cwd,item.engineHost,item.targetHost,item.threadRecovery]))
   const statusSignature=JSON.stringify(items.map(item=>[item.id,item.status,item.running,item.busy,item.error]))
   if(signature!==card.signature&&!card.canvas.dragging){
    card.signature=signature;card.statusSignature=statusSignature
    const focused=card.node.contains(document.activeElement)?document.activeElement.closest('[data-session]')?.dataset.session:null
    card.node.querySelector('.agent-role-grid').innerHTML=items.length?items.map(item=>`<button class="agent-role" draggable="true" type="button" data-id="${esc(item.id)}" data-session="${esc(item.id)}" data-source="${esc(item.engineHostId)}" data-target="${esc(item.targetHostId)}" data-identity-source=\"cloudhosts-native\" data-status="${esc(item.status||'stopped')}" aria-label="${esc(item.name+' · '+names[item.engine])}" title="${esc(item.name+'\nWork host: '+item.targetHost.name+'\nDirectory: '+item.cwd+'\nEngine source: '+item.engineHost.name+(item.threadRecovery?'\nRecovered from unavailable thread '+item.threadRecovery.previousThreadId:''))}"><span class="agent-role-top"><span class="agent-role-kind">Coding Agent</span><img class="agent-engine-native" data-engine="${esc(item.engine)}" src="./engines/${esc(item.engine)}.svg" alt="${esc(names[item.engine])} 原生图标" draggable="false"></span><strong class="agent-role-name">${esc(item.name)}</strong><span class="agent-role-status"><i class="${item.error?'is-error':item.busy?'is-busy':item.running?'is-online':''}"></i>${esc(names[item.engine])} · ${esc(statusName(item))}</span>${origin(item)}</button>`).join(''):'<div class="agent-host-empty"><span>此主机还没有 Agent</span><small>选择任意引擎来源，在这里工作</small></div>'
    card.canvas.arrange(items)
    if(!card.initialized){card.initialized=true;card.canvas.restore()}
    if(focused)[...card.node.querySelectorAll('[data-session]')].find(node=>node.dataset.session===focused)?.focus({preventScroll:true})
   } else if(statusSignature!==card.statusSignature&&!card.canvas.dragging){
    // Frequent polling changes only the existing card's status nodes. Preserve
    // focus, drag source, scroll and native session subscriptions.
    card.statusSignature=statusSignature;
    const buttons=new Map([...card.node.querySelectorAll('.agent-role')].map(tile=>[tile.dataset.session,tile]));
    for(const item of items){
     const tile=buttons.get(item.id);if(!tile)continue;
     tile.dataset.status=item.status||'stopped';
     const line=tile.querySelector('.agent-role-status');
     if(line){line.querySelector('i').className=item.error?'is-error':item.busy?'is-busy':item.running?'is-online':'';
       line.lastChild.textContent=names[item.engine]+' · '+statusName(item)}
    }
   }
  }
  // Restore persisted order without replacing live role buttons (and their focus).
  const ordered=boardHosts.map(id=>cards.get(id)?.node).filter(Boolean)
  ordered.forEach((node,index)=>{if(grid.children[index]!==node)grid.insertBefore(node,grid.children[index]||null)})
  q('.agent-group-empty').hidden=boardHosts.length>0||!ready
  q('.agent-count').textContent=relevant.length+' 个会话 · '+relevant.filter(item=>item.running).length+' 在线'
  q('#agent-add-host').disabled=!!singleHostId||!ready||hosts.every(host=>layout.hosts.includes(host.id))
 }
 function refresh(force=false){
  if(disposed)return Promise.resolve()
  // Creation and rename must await a new snapshot even if a periodic poll was in flight.
  if(refreshTask)return force?refreshTask.then(()=>refresh(true)):refreshTask
  const task=(async()=>{
   try{
    const [list,hostList]=await Promise.all([rpc('hosts.agent-list'),rpc('hosts.agent-hosts')]);if(disposed)return
    hosts=hostList;sessions=list.filter(item=>!singleHostId||item.targetHostId===singleHostId).map(item=>normalize(item,hosts));ready=true;grid.classList.add('loaded')
    if(!layout.initialized){layout.hosts=hosts.map(host=>host.id);layout.initialized=true;void persist()}
    const local=hosts.find(host=>host.id==='local')
    if(local)q('.agent-legend>span').innerHTML=osIcon(local)+'<span>本地主机 · '+osName(local)+'</span>'
    draw()
    if(initialOpen){const id=initialOpen;initialOpen=null;void openSession(id)}
   }catch(error){if(!disposed){q('.agent-count').textContent='读取失败';message(error.message,'error')}}
  })()
  refreshTask=task.finally(()=>{refreshTask=null})
  return refreshTask
 }
 function createRole(targetId=initialHost||'local'){
  if(!ready)return
  const host=hostById(targetId)||hosts[0]
  const options=hosts.map(h=>`<option data-no-i18n value="${esc(h.id)}">${esc(h.id==='local'?sourceLabel(h):h.name)} · ${esc(osName(h))}</option>`).join('')
  const origins=sourceChoices(hosts,host.id).map(h=>`<option value="${esc(h.id)}" ${h.id==='local'?'':'data-no-i18n'}>${esc(sourceLabel(h))}</option>`).join('')
  const modal=dialog('agent-create-dialog',`<header><div><h2>新建 Coding Agent</h2><p>原生 CLI · 使用引擎自己的配置与会话</p></div><button type="button" data-close aria-label="关闭新建 Agent">×</button></header><form class="agent-create"><div class="agent-create-grid"><label>会话名称<input id="agent-name" required maxlength="100" value="Agent ${sessions.length+1}" autocomplete="off"></label><label>引擎来源<select id="agent-source">${origins}</select></label><label>Coding Agent 引擎<select id="agent-engine">${Object.entries(names).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><label>工作主机<select id="agent-target">${options}</select></label><label class="agent-create-directory">工作目录<input id="agent-directory" required autocomplete="off" spellcheck="false" value="${esc(host.defaultDirectory)}" placeholder="工作主机上的绝对路径"></label><label class="agent-permission" hidden>跨主机权限<select id="agent-permission"><option value="ask">按原生引擎请求确认</option><option value="full">完整权限 · 使用目标账号的权限</option></select></label></div><p class="agent-route-preview"></p><p id="agent-engine-status" role="status">正在检测引擎…</p><footer><button type="button" data-probe>重新检测</button><button type="button" data-close>取消</button><button class="primary" type="submit" id="agent-start" disabled>创建并连接</button></footer></form>`)
  const el=modal.element,find=s=>el.querySelector(s),source=find('#agent-source'),target=find('#agent-target'),engine=find('#agent-engine'),start=find('#agent-start'),status=find('#agent-engine-status')
  let alive=true,checking=0,found,submitting=false,creationId,creationSignature
  // Work host A permits exactly two origins: A's own native CLI and the
  // controller's Mac CLI. When the work host IS the controller, only Mac
  // appears. Never list disabled unrelated hosts as gray menu entries.
  source.value=host.id;target.value=host.id
  modal.onClose(()=>{alive=false;checking++})
  const changed=select=>select.dispatchEvent(new Event('input',{bubbles:true}))
  function syncOriginOptions(preferred=target.value){
   const choices=sourceChoices(hosts,target.value)
   source.replaceChildren(...choices.map(host=>{
    const option=document.createElement('option')
    option.value=host.id;option.textContent=sourceLabel(host)
    if(host.id!=='local')option.setAttribute('data-no-i18n','')
    return option
   }))
   source.value=choices.some(host=>host.id===preferred)?preferred:target.value
   changed(source)
  }
  function availability(){
   const routed=source.value!==target.value
   const previous=engine.value
   const eligible=permittedEngines(source.value,target.value,found)
   engine.replaceChildren(...eligible.map(id=>{
    const option=document.createElement('option');option.value=id;option.textContent=names[id]
    return option
   }))
   engine.value=eligible.includes(previous)?previous:eligible[0]||''
   changed(engine)
   const verified=canCreateAgent(source.value,target.value,engine.value,found)
   start.disabled=submitting||!verified
   find('.agent-permission').hidden=!routed
   const engineHost=hosts.find(h=>h.id===source.value),workHost=hosts.find(h=>h.id===target.value)
   const origin=engineHost?sourceLabel(engineHost):'',work=workHost?.name||''
   const engineName=names[engine.value]||'Coding Agent'
   find('.agent-route-preview').textContent=routed?origin+' '+engineName+' → '+work:origin+' · Run and work on this host'
   status.textContent=routed
    ?engineName+' 在 '+origin+' 运行，文件与命令在 '+work+' 执行。请保持本机在线。'
    :'Native Agents run and work on '+work+' using that host’s own authentication.'
   if(found&&!eligible.length)status.textContent=routed?'当前没有可用的原生路由，请检查目标主机的连接与引擎安装。':'No installed Coding Agent CLI is available on '+origin+'. Install an engine on that host and click Check Again.'
   else if(found&&routed&&!verified)status.textContent=found.routingNote||'当前没有可用的原生路由，请检查目标主机的连接与引擎安装。'
  }
  async function probe(force=false){
   const ticket=++checking,id=source.value,targetId=target.value,key=id+'->'+targetId
   found=null;availability()
   start.disabled=true;status.textContent='Checking the installed engine and the selected work host…'
   try{
    if(force)capabilities.delete(key)
    if(!capabilities.has(key))capabilities.set(key,rpc('hosts.agent-capabilities',{id,targetHostId:targetId}).catch(error=>{capabilities.delete(key);throw error}))
    const result=await capabilities.get(key)
    if(!alive||ticket!==checking)return
    found=result;availability()
   }catch(error){
    if(alive&&ticket===checking){found=null;status.textContent='Cannot verify '+source.value+' → '+target.value+': '+error.message;start.disabled=true}
   }
  }
  source.onchange=()=>{found=null;void probe()}
  target.onchange=()=>{
   find('#agent-directory').value=hosts.find(h=>h.id===target.value)?.defaultDirectory||''
   // Same-host is the default; the controller offers verified native routes.
   syncOriginOptions(target.value)
   found=null;void probe()
  }
  engine.onchange=availability
  find('[data-probe]').onclick=()=>void probe(true)
  find('form').onsubmit=async event=>{
   event.preventDefault();if(submitting||start.disabled||!find('form').reportValidity())return
   submitting=true;start.disabled=true;status.textContent='正在验证工作目录并连接引擎…'
   const args={engineHostId:source.value,targetHostId:target.value,engine:engine.value,name:find('#agent-name').value,directory:find('#agent-directory').value,permission:find('#agent-permission').value}
   const signature=JSON.stringify(args)
   if(signature!==creationSignature){creationSignature=signature;creationId=crypto.randomUUID()}
   args.creationId=creationId
   const fields=[...el.querySelectorAll('input,select,[data-probe]')];fields.forEach(field=>field.disabled=true)
   try{const item=await rpc('hosts.agent-open',args);if(disposed)return;ensureHost(args.targetHostId);await refresh(true);if(!alive||disposed)return;modal.close();void openSession(item.id)}
   catch(error){if(alive&&!disposed){status.textContent=error.message;message(error.message,'error');await refresh()}}
   finally{submitting=false;if(alive&&!disposed){fields.forEach(field=>field.disabled=false);availability()}}
  }
  find('#agent-name').focus();find('#agent-name').select();void probe()
 }
 async function openSession(id){
  let item=sessions.find(row=>row.id===id);if(!item||disposed)return
  inspectorClose?.()
  const modal=dialog('agent-inspector',`<header><div><h2 data-no-i18n>${esc(item.name)}</h2><p data-no-i18n>${esc(names[item.engine])} · ${esc(item.engineHost.name)} → ${esc(item.targetHost.name)}</p></div><button type="button" class="agent-rename-toggle">重命名</button><button type="button" data-close aria-label="关闭会话视图">×</button></header><form class="agent-rename" hidden><input aria-label="会话名称" required maxlength="100" value="${esc(item.name)}"><button type="submit">保存名称</button><button type="button" class="agent-rename-cancel">取消</button></form><div class="agent-session-meta">${origin(item)}<span>工作目录 <code>${esc(item.cwd)}</code></span></div><div class="agent-session-view"><div class="agent-stopped" role="status">正在连接此会话…</div></div><footer><span class="agent-view-note">关闭视图保留会话 · 停止会话终止引擎</span><button type="button" class="danger agent-end">停止会话</button><button type="button" class="danger agent-remove">移除会话</button></footer>`)
  inspectorClose=modal.close
  const el=modal.element,view=el.querySelector('.agent-session-view'),end=el.querySelector('.agent-end'),remove=el.querySelector('.agent-remove')
  let disposeView=()=>{},alive=true,pending=false,connecting=true,removed=false
  const current=()=>alive&&!disposed
  const controls=()=>{if(!current())return;end.hidden=removed||!item.running;remove.hidden=removed||item.running;end.disabled=remove.disabled=pending||connecting}
  controls()
  modal.onClose(()=>{alive=false;disposeView();if(inspectorClose===modal.close)inspectorClose=undefined})
  const rename=el.querySelector('.agent-rename')
  el.querySelector('.agent-rename-toggle').onclick=()=>{rename.hidden=false;rename.querySelector('input').focus();rename.querySelector('input').select()}
  el.querySelector('.agent-rename-cancel').onclick=()=>{rename.hidden=true}
  rename.onsubmit=async event=>{
   event.preventDefault();if(!rename.reportValidity())return
   const submit=rename.querySelector('[type=submit]');submit.disabled=true
   try{const result=await rpc('hosts.agent-rename',{id:item.targetHostId,session:item.id,name:rename.querySelector('input').value});if(!current())return;item.name=result.name;el.querySelector('h2').textContent=item.name;rename.hidden=true;await refresh()}
   catch(error){if(current())message(error.message,'error')}finally{if(current())submit.disabled=false}
  }
  async function action(method,button){
   if(pending||connecting)return
   if(!button.dataset.confirm){button.dataset.confirm='1';button.textContent=method==='close'?'确认停止此会话':'确认移除此会话';return}
   pending=true;controls()
   try{await rpc('hosts.agent-'+method,{id:item.targetHostId,session:item.id,confirm:true});if(!current())return;modal.close();await refresh(true)}
   catch(error){if(current())message(error.message,'error')}finally{pending=false;controls()}
  }
  end.onclick=event=>void action('close',event.currentTarget)
  remove.onclick=event=>void action('remove',event.currentTarget)
  const stopped=()=>{if(!current())return;item.running=false;controls();void refresh()}
  const retry=()=>{if(current()&&!pending)void openSession(id)}
  try{
   // Always recheck the backend; Ctrl+C may have happened since the last poll.
   const latest=(await rpc('hosts.agent-list',{id:item.targetHostId})).find(role=>role.id===id)
   if(!current())return
   if(!latest){removed=true;throw Error('Agent session no longer exists')}
   item=normalize(latest,hosts)
   if(!item.running){
    const result=await rpc('hosts.agent-activate',{id:item.targetHostId,session:id})
    if(!current())return
    await refresh(true);if(!current())return
    if(result.removed){removed=true;throw Error(result.reason||'Agent session no longer exists')}
    item=sessions.find(row=>row.id===id)||normalize(result,hosts)
   }
   if(item.engine==='codex'&&item.transport==='native'){
    const terminal=await rpc('hosts.agent-tui',{id:item.targetHostId,session:id})
    if(!current())return
    if(item.threadId&&terminal.threadId!==item.threadId)throw Error('Codex returned a different thread. Refusing to open it.')
    item=normalize(terminal,hosts)
   }
   if(!current())return
   if(!item.running)throw Error(item.error||'Session unavailable')
   disposeView=agentTerminal(view,item,rpc,message,stopped,retry)
  }catch(error){
   if(!current())return
   // Keep technical failures out of the full-screen toast. The same native
   // identity remains recoverable, and diagnostics appear only on request.
   view.innerHTML='<div class="agent-stopped agent-connect-panel"><h3>会话暂时未连接</h3><p>原会话已保留。请检查连接或登录状态，然后重试。</p><button type="button" class="agent-retry-connect">重新连接</button><details><summary>连接诊断</summary><pre data-no-i18n></pre></details></div>'
   view.querySelector('details pre').textContent=String(error.message||'Session unavailable')
   view.querySelector('.agent-retry-connect').onclick=retry
   await refresh(true)
   if(!current())return
   const latest=sessions.find(row=>row.id===id);if(latest)item=latest
  }finally{connecting=false;controls()}
 }
 q('#agent-refresh').onclick=()=>{
  capabilities.clear();
  // Changes made by the native CLI are stored in the same workspace. The
  // Refresh button must pull its latest role order, not overwrite it with an
  // old browser snapshot when sessions change.
  void (async()=>{
   try{
    const latest=await rpc('hosts.workspace');
    if(disposed)return;
    if(latest?.agentBoard?.roleOrder){
     layout.roleOrder=structuredClone(latest.agentBoard.roleOrder);
     for(const [hostId,card] of cards)card.canvas?.arrange(sessions.filter(item=>item.targetHostId===hostId));
    }
   }catch(error){if(!disposed)message(error.message,'error')}
   await refresh(true)
  })()
 }
 q('#agent-add-host').onclick=()=>{
  const picker=popover(q('#agent-add-host'),'<div class="popover-heading">添加工作主机</div><div class="host-picker-list"></div>',{width:280})
  picker.element.querySelector('.host-picker-list').innerHTML=hosts.filter(h=>!layout.hosts.includes(h.id)).map(h=>`<button data-host="${esc(h.id)}">${osIcon(h)}<span>${esc(h.name)}</span></button>`).join('')
  picker.element.querySelectorAll('[data-host]').forEach(button=>button.onclick=()=>{ensureHost(button.dataset.host);draw();picker.close()})
 }
 const stopSort=sortable(grid,{selector:'.agent-host-card',handle:'.board-handle',type:'application/x-cloud-agent-host-order',onChange:ids=>{layout.hosts=ids;void persist()}})
 gridColumns();void refresh();refreshTimer=setInterval(()=>{if(!document.hidden)void refresh()},5000)
 return {refresh,focus(id){if(!hostById(id))return;ensureHost(id);draw();cards.get(id)?.node.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'})},dispose(){disposed=true;clearInterval(refreshTimer);stopSort();for(const close of [...dialogs])close();for(const card of cards.values())card.canvas?.dispose();cards.clear();root.classList.remove('agent-workbench','single-agent-workbench')}}
}
