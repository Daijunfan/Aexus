import {confirmDiscard} from './unsaved.js'

// File Board uses the same native/SSH workspace RPC as Single Host Files.
// A dialog owns a captured host + tab + absolute root so switching cards while
// saving can never redirect a write to another host or another directory.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const join=(parent,name)=>parent==='.'?name:parent+'/'+name
const parentOf=path=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'.'
const filename=path=>path.split('/').at(-1)
export function validName(name,windows){
 if(!name||name!==name.trim()||name==='.'||name==='..'||/[\\/\0\r\n]/.test(name)||new TextEncoder().encode(name).length>255)
  throw Error('Invalid file or folder name. Use one name without a path separator.')
 if(windows&&(/[<>:"|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)))
  throw Error('This filename is reserved or invalid on Windows.')
 if(name==='.cloud-hosts')throw Error('This name is reserved for Cloud Hosts metadata.')
 return name
}
export function fileBoardActions(root,rpc,message,onChanged){
 const modal=document.createElement('dialog')
 modal.className='file-board-dialog'
 root.append(modal)
 let current=null,busy=false,opening=false,discardTask=null,disposed=false
 const request=(context,operation,args)=>rpc('hosts.files',{
  id:context.hostId,directory:context.directory,operation:'workspace',arguments:{operation,args}
 })
 const context=(entry,tab)=>({entry,tab,hostId:entry.host.id,directory:tab.path,windows:entry.host.os==='windows'})
 const dirty=()=>current?.editor&&current.editor.value!==current.original
 async function canLeave(){
  if(!current)return true
  if(busy){message('A file operation is still being saved.','error');return false}
  if(!dirty())return true
  if(!discardTask)discardTask=confirmDiscard(root).finally(()=>discardTask=null)
  return discardTask
 }
 async function close(){
  if(!await canLeave())return
  current=null;modal.close();modal.replaceChildren()
 }
 modal.oncancel=event=>{event.preventDefault();void close()}
 const beforeLeave=event=>event.detail?.checks?.push(canLeave())
 const beforeUnload=event=>{if(busy||dirty()){event.preventDefault();event.returnValue=''}}
 window.addEventListener('workspace-before-leave',beforeLeave)
 window.addEventListener('beforeunload',beforeUnload)
 function render({title,body,submit,perform,editable=false}){
  if(disposed||!modal.isConnected||current||opening)return false
  const previous=document.activeElement
  modal.innerHTML=`<form><header><h3>${title}</h3><button class="file-board-dialog-x" type="button" aria-label="Close">×</button></header>${body}<p class="file-board-action-error" role="alert" hidden></p><footer><button type="button" class="file-board-dialog-cancel">取消</button>${submit?`<button class="${submit==='确认移入回收站'?'danger':'primary'} file-board-dialog-submit">${submit}</button>`:''}</footer></form>`
  const form=modal.querySelector('form')
  current={editor:editable?modal.querySelector('.file-board-editor'):null,original:null,previous}
  if(current.editor)current.original=current.editor.value
  modal.showModal()
  modal.querySelector('input,textarea,.file-board-dialog-cancel')?.focus()
  modal.querySelector('.file-board-dialog-x').onclick=()=>void close()
  modal.querySelector('.file-board-dialog-cancel').onclick=()=>void close()
  form.onsubmit=async event=>{
   event.preventDefault()
   if(busy||!perform)return
   busy=true;const button=form.querySelector('.file-board-dialog-submit');button.disabled=true
   const error=form.querySelector('.file-board-action-error');error.hidden=true
   try{
    const mutation=await perform(new FormData(form))
    if(disposed)return
    current=null;modal.close();modal.replaceChildren()
    if(!root.isConnected)return
    try{await onChanged(mutation)}catch(error){message(error.message||String(error),'error')}
    if(previous?.isConnected)previous.focus({preventScroll:true})
   }catch(e){
    if(disposed)return
    error.textContent=e.message||String(e);error.hidden=false
    // An edit conflict or connection failure must never discard the draft.
   }finally{busy=false;if(button?.isConnected)button.disabled=false}
  }
  return true
 }
 const label=(caption,body)=>`<label>${caption}${body}</label>`
 const scope=c=>`<div class="file-board-dialog-scope" data-no-i18n title="${esc(c.directory)}">${esc(c.directory)}</div>`
 function create(entry,tab,type,parent='.'){
  if(current||opening)return
  const c=context(entry,tab),folder=type==='folder',initial=folder?'New Folder':'untitled.txt'
  const rootPath=parent==='.'?'':parent+'/'
  render({title:folder?'新建文件夹':'新建文件',body:scope(c)+`<p class="file-board-dialog-path" data-no-i18n>${esc(rootPath||'.')}</p>`+
   label('名称',`<input name="name" value="${esc(initial)}" autocomplete="off" required maxlength="255">`)+
   (folder?'':label('文件内容',`<textarea name="content" class="file-board-new-content" rows="8" spellcheck="false" placeholder="Optional file content"></textarea>`)),
   submit:'创建',perform:async data=>{
    const name=validName(String(data.get('name')),c.windows),path=join(parent,name)
    await request(c,folder?'mkdir':'write',folder?{path}:{path,content:String(data.get('content')||''),create:true})
    return {context:c,kind:folder?'mkdir':'create',path,parent}
   }})
 }
 function rename(entry,tab,item){
  if(current||opening)return
  const c=context(entry,tab),parent=parentOf(item.path)
  render({title:'重命名',body:scope(c)+`<p class="file-board-dialog-path" data-no-i18n>${esc(item.path)}</p>`+
   label('名称',`<input name="name" required value="${esc(item.name)}" autocomplete="off" maxlength="255">`),
   submit:'保存',perform:async data=>{
    const name=validName(String(data.get('name')),c.windows),path=join(parent,name)
    if(path!==item.path)await request(c,'move',{path:item.path,to:path})
    return {context:c,kind:'rename',path,previous:item.path,parent,directory:item.directory}
   }})
 }
 function trash(entry,tab,item){
  if(current||opening)return
  const c=context(entry,tab)
  render({title:'移入回收站',body:scope(c)+`<p>将所选${item.directory?'文件夹':'文件'}放入当前工作目录的回收站？</p><p class="file-board-dialog-path" data-no-i18n>${esc(item.path)}</p><p>可以从回收站恢复，其他文件不受影响。</p>`,
   submit:'确认移入回收站',perform:async()=>{await request(c,'trash',{path:item.path});return {context:c,kind:'trash',path:item.path,parent:parentOf(item.path)}}})
 }
 async function open(entry,tab,item){
  if(disposed||item.directory||current||opening)return
  const c=context(entry,tab)
  opening=true
  try{
   if(item.symlink)throw Error('Symbolic links are read-only in the File Board.')
   const response=await request(c,'read',{path:item.path})
   if(disposed||!root.isConnected||!modal.isConnected)return
   const title='<span>编辑文本文件</span><strong data-no-i18n title="'+esc(item.path)+'">'+esc(item.name)+'</strong>'
   const body=scope(c)+`<p class="file-board-dialog-path" data-no-i18n>${esc(item.path)}</p>`
   opening=false
   if(response.binary||typeof response.content!=='string'||!response.hash){
    render({title,body:body+`<p role="status">This file is binary, not valid UTF-8 or larger than 4 MB. It can be viewed using another application; File Board will not rewrite its bytes.</p>`})
    return
   }
   render({title,body:body+`<textarea class="file-board-editor" name="content" rows="20" spellcheck="false" aria-label="Text file contents">${esc(response.content)}</textarea><small>The file will be saved only if it has not changed since opening.</small>`,
    editable:true,submit:'保存',perform:async data=>{
     const text=String(data.get('content'))
     if(text!==response.content)await request(c,'write',{path:item.path,hash:response.hash,content:text})
     return {context:c,kind:'edit',path:item.path,parent:parentOf(item.path)}
    }})
  }catch(error){if(!disposed)message(error.message||String(error),'error')}
  finally{opening=false}
 }
 function dispose(){
  disposed=true;current=null;opening=false
  window.removeEventListener('workspace-before-leave',beforeLeave)
  window.removeEventListener('beforeunload',beforeUnload)
  if(modal.open)modal.close()
  modal.remove()
 }
 return {create,rename,trash,open,canLeave,dispose,modal}
}
