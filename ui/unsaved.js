// Panes register only while mounted; dynamic bundles share a DOM event, not
// separate module-local state. A declined leave never destroys the editor.
export async function canLeave(){
 const detail={checks:[]};window.dispatchEvent(new CustomEvent('workspace-before-leave',{detail}))
 for(const check of detail.checks)if(!await check)return false
 return true
}
export function confirmDiscard(parent=document.body){
 return new Promise(resolve=>{
  const el=document.createElement('dialog'),previous=document.activeElement
  el.className='unsaved-dialog';el.innerHTML='<form><h3>放弃未保存的修改？</h3><p>关闭后，本次编辑内容将被丢弃。</p><div class="dialog-actions"><button type="button" data-stay>继续编辑</button><button type="submit" class="danger">放弃修改</button></div></form>'
  parent.append(el)
  const finish=value=>{el.close();el.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value)}
  el.oncancel=event=>{event.preventDefault();finish(false)}
  el.querySelector('[data-stay]').onclick=()=>finish(false)
  el.querySelector('form').onsubmit=event=>{event.preventDefault();finish(true)}
  el.showModal();el.querySelector('[data-stay]').focus()
 })
}
