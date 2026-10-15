import {validName} from './file-board-actions.js'

// Native HTML drag payloads are not trusted as RPC parameters. We retain the
// selected item and its original host/tab inside this controller and use the
// dataTransfer payload only as an opaque gesture key. A drop always COPIES.
const type='application/x-cloudhosts-file-board-item'
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const leaf=path=>path.split('/').at(-1)
const join=(directory,name)=>directory==='.'?name:directory+'/'+name
const copyName=name=>{const index=name.lastIndexOf('.');return index>0?name.slice(0,index)+' (copy)'+name.slice(index):name+' (copy)'}
export function fileBoardTransfers(root,rpc,message,onComplete){
 let disposed=false,drag=null,busy=false,pollTask,timer
 const seen=new Map(),dismissed=new Set(),updated=new Set(),cards=new Map()
 const dialog=document.createElement('dialog')
 dialog.className='file-board-transfer-dialog file-board-dialog';root.append(dialog)
 const inProgress=()=>[...seen.values()].some(job=>job.state==='running')
 function register(entry){cards.set(entry.host.id,entry);render(entry)}
 function unregister(id){cards.delete(id)}
 function begin(entry,tab,item,event){
  if(disposed||!item||item.symlink||event.target.closest('button'))return false
  const token=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)
  drag={token,hostId:entry.host.id,hostName:entry.host.name,directory:tab.path,path:item.path,name:item.name,directoryEntry:item.directory}
  event.dataTransfer.setData(type,token)
  event.dataTransfer.effectAllowed='copy';return true
 }
 function recognizes(event){
  return !!drag&&!!event.dataTransfer&&[...event.dataTransfer.types].includes(type)
 }
 function end(){drag=null}
 function offer(event,entry,tab,relative='.'){
  if(disposed||!recognizes(event)||event.dataTransfer.getData(type)!==drag.token)return false
  const source={...drag};end()
  return preview(source,entry,tab,relative)
 }
 function offerSelection(sourceEntry,sourceTab,item,targetEntry,targetTab,relative='.'){
  if(!item||item.symlink)return false
  return preview({hostId:sourceEntry.host.id,hostName:sourceEntry.host.name,directory:sourceTab.path,
   path:item.path,name:item.name,directoryEntry:item.directory},targetEntry,targetTab,relative)
 }
 function preview(source,entry,tab,relative='.'){
  if(disposed||busy||dialog.open||!entry||!tab)return false
  const same=source.hostId===entry.host.id&&source.directory===tab.path&&
    source.path.slice(0,source.path.lastIndexOf('/')+1)===(relative==='.'?'':relative+'/')
  const suggested=same?copyName(source.name):source.name
  const target={hostId:entry.host.id,hostName:entry.host.name,directory:tab.path,relative,windows:entry.host.os==='windows'}
  const displayTarget=target.directory.replace(/[\\/]+$/,'')+(target.windows?'\\':'/')+(relative==='.'?'':relative+'/')
  dialog.innerHTML=`<form><header><h3>${source.directoryEntry?'Copy Folder':'Copy File'}</h3><button type="button" class="file-board-transfer-x" aria-label="Close transfer preview">×</button></header>
    <p class="file-board-transfer-explanation">${source.directoryEntry?'Includes nested folders, hidden files and empty directories.':'Copies the original bytes without changing the source.'} Original is retained; existing targets are never overwritten.</p>
    <label>From host<div class="file-board-transfer-path" data-no-i18n>${esc(source.hostName)} · ${esc(source.directory)} / ${esc(source.path)}</div></label>
    <label>To host / folder<div class="file-board-transfer-path" data-no-i18n>${esc(target.hostName)} · ${esc(displayTarget)}</div></label>
    <label>Copy as<input name="filename" autocomplete="off" maxlength="255" required value="${esc(suggested)}" aria-label="Destination filename"></label>
    <p class="file-board-transfer-error" role="alert" hidden></p>
    <footer><button type="button" class="file-board-transfer-cancel">Cancel</button><button class="primary file-board-transfer-submit">${source.directoryEntry?'Copy Folder':'Copy File'}</button></footer></form>`
  dialog.showModal();dialog.querySelector('input[name=filename]').focus()
  const close=()=>{if(busy)return;dialog.close();dialog.replaceChildren()}
  dialog.querySelector('.file-board-transfer-x').onclick=close
  dialog.querySelector('.file-board-transfer-cancel').onclick=close
  dialog.oncancel=event=>{event.preventDefault();close()}
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(busy)return
   const error=dialog.querySelector('.file-board-transfer-error')
   let name
   try{name=validName(dialog.querySelector('[name=filename]').value,target.windows)}
   catch(e){error.textContent=e.message;error.hidden=false;return}
   busy=true;dialog.querySelector('.file-board-transfer-submit').disabled=true;error.hidden=true
   try{
    const job=await rpc('station.copy',{
     sourceHost:source.hostId,sourceDirectory:source.directory,path:source.path,
     host:target.hostId,directory:target.directory,to:join(target.relative,name)
    })
    seen.set(job.id,job);dialog.close();dialog.replaceChildren()
    for(const card of cards.values())render(card)
    schedule()
   }catch(e){error.textContent=e.message;error.hidden=false;dialog.querySelector('.file-board-transfer-submit').disabled=false}
   finally{busy=false}
  }
  return true
 }
 function render(entry){
  const panel=entry.node.querySelector('.file-board-transfer-list');if(!panel)return
  const jobs=[...seen.values()].filter(job=>job.kind==='copy'&&job.destination?.hostId===entry.host.id&&!dismissed.has(job.id)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,8)
  panel.hidden=jobs.length===0
  const active=document.activeElement?.closest('[data-file-transfer]')?.dataset.fileTransfer
  panel.innerHTML=jobs.map(job=>{
   const status=job.state==='done'?'Complete':job.state==='cancelled'?'Cancelled':job.state==='failed'?'Failed':'Copying…'
   const fraction=job.state==='done'?100:job.total>0?Math.max(0,Math.min(99,Math.round(job.bytes/job.total*100))):null
   const label=job.source?.hostName+' → '+job.destination?.hostName
   const caption=job.error||`${job.files||0} files · ${job.bytes||0} bytes transferred`
   return `<div class="file-board-transfer-row" data-file-transfer="${esc(job.id)}" data-transfer-state="${esc(job.state)}" title="${esc(caption)}">
     <div class="file-board-transfer-summary"><span class="file-board-transfer-name" data-no-i18n>${esc(job.name)}</span><small>${esc(status)}</small></div>
     <small class="file-board-transfer-hosts" data-no-i18n>${esc(label)}</small>
     <div class="file-board-transfer-meter">${job.state==='running'?`<progress ${fraction===null?'':`value="${fraction}"`} max="100" aria-label="Copy progress"></progress>`:job.state==='done'?'<progress value="100" max="100"></progress>':''}</div>
     ${job.error?`<p class="file-board-transfer-error-inline">${esc(job.error)}</p>`:''}
     <button class="file-board-transfer-action" type="button" data-transfer-command="${job.state==='running'?'cancel':'dismiss'}" data-job="${esc(job.id)}">${job.state==='running'?'Cancel':'×'}</button>
   </div>`
  }).join('')
  if(active){const button=panel.querySelector(`[data-job="${CSS.escape(active)}"]`);button?.focus({preventScroll:true})}
 }
 async function refresh(){
  if(disposed||pollTask)return
  pollTask=(async()=>{
   try{
    const response=await rpc('station.list')
    if(disposed)return
    const now=Date.now()
    for(const job of response.jobs||[]){
     if(job.kind!=='copy'||!job.destination?.hostId)continue
     if(job.state!=='running'&&now-(job.finishedAt||now)>10*60*1000&&!seen.has(job.id))continue
     const previous=seen.get(job.id)
     seen.set(job.id,job)
     if(job.state==='done'&&!updated.has(job.id)){
      updated.add(job.id);void onComplete(job).catch(e=>message(e.message,'error'))
     }
     if(previous?.state==='running'&&job.state==='failed')message(`Copy failed: ${job.error||job.name}`,'error')
    }
    for(const entry of cards.values())render(entry)
   }catch(e){if(!disposed)message(e.message||String(e),'error')}
   finally{pollTask=null;if(inProgress())schedule()}
  })()
  await pollTask
 }
 function schedule(){clearTimeout(timer);if(!disposed)timer=setTimeout(()=>void refresh(),600)}
 const actionClick=async event=>{
  const button=event.target.closest('[data-transfer-command]')
  if(!button||!root.contains(button))return
  const id=button.dataset.job
  if(button.dataset.transferCommand==='cancel'){
   button.disabled=true
   try{await rpc('station.cancel',{job:id});schedule()}
   catch(e){message(e.message||String(e),'error');button.disabled=false}
  }else{dismissed.add(id);for(const entry of cards.values())render(entry)}
 }
 root.addEventListener('click',actionClick)
 void refresh()
 return {begin,recognizes,offer,offerSelection,end,register,unregister,dispose(){disposed=true;clearTimeout(timer);root.removeEventListener('click',actionClick);drag=null;cards.clear();dialog.oncancel=null;if(dialog.open)dialog.close();dialog.remove()},get drag(){return drag}}
}
