// Shared browser-rendered select menus for WKWebView and WebView2.
// Keep the native <select> in the DOM for FormData, validation and existing
// change handlers. Only its visual presentation is replaced.
let active=null
let installed=false
let counter=0
const controllers=new WeakMap()

function titleFor(select){
  const explicit=select.getAttribute('aria-label')||select.getAttribute('title')
  if(explicit)return explicit
  const label=select.closest('label')
  if(label){
    const text=[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent.trim()).join(' ').trim()
    if(text)return text
  }
  return select.name||'选择选项'
}
function entries(select){
  return [...select.options].map((option,index)=>({
    index,disabled:option.disabled||option.closest('optgroup')?.disabled||false,
    label:option.label||option.textContent.trim(),value:option.value
  }))
}
function usable(items,index,direction){
  if(!items.length||items.every(item=>item.disabled))return -1
  let at=(index+items.length)%items.length
  for(let i=0;i<items.length;i++){
    if(!items[at].disabled)return at
    at=(at+direction+items.length)%items.length
  }
  return -1
}
function close(focus=false){
  if(!active)return
  const state=active
  active=null
  state.dialog?.removeEventListener('close',state.dialogClose)
  state.menu.remove()
  state.trigger.setAttribute('aria-expanded','false')
  state.trigger.removeAttribute('aria-controls')
  state.trigger.removeAttribute('aria-activedescendant')
  document.removeEventListener('pointerdown',state.outside,true)
  window.removeEventListener('resize',state.position)
  window.removeEventListener('scroll',state.scrolled,true)
  if(focus&&state.trigger.isConnected)state.trigger.focus({preventScroll:true})
}
function renderHighlight(state){
  state.buttons.forEach((button,index)=>{
    const highlighted=index===state.index
    button.classList.toggle('highlighted',highlighted)
    button.setAttribute('aria-selected',String(index===state.select.selectedIndex))
  })
  const focusOption=state.buttons[state.index]
  if(focusOption){
    state.trigger.setAttribute('aria-activedescendant',focusOption.id)
    focusOption.scrollIntoView({block:'nearest',inline:'nearest'})
  }
}
function choose(state,index){
  if(index<0||state.items[index]?.disabled)return
  const changed=state.select.selectedIndex!==index
  state.select.selectedIndex=index
  close(true)
  state.refresh()
  if(changed){
    state.select.dispatchEvent(new Event('input',{bubbles:true}))
    state.select.dispatchEvent(new Event('change',{bubbles:true}))
  }
}
function show(select,trigger,refresh){
  if(select.disabled||!select.isConnected)return
  if(active?.select===select){close(true);return}
  close()
  const items=entries(select)
  if(!items.length)return
  const menu=document.createElement('div')
  menu.className='styled-select-menu'
  menu.id='styled-select-menu-'+(++counter)
  menu.setAttribute('role','listbox')
  menu.setAttribute('aria-label',titleFor(select))
  menu.setAttribute('data-cloud-select-menu','')
  const dialog=select.closest('dialog[open]')
  const parent=dialog||document.body
  parent.append(menu)
  const state={select,trigger,refresh,menu,dialog,items,buttons:[],index:usable(items,Math.max(0,select.selectedIndex),1)}
  state.dialogClose=()=>{if(active===state)close()}
  const position=()=>{
    if(!select.isConnected){close();return}
    const box=trigger.getBoundingClientRect()
    const width=Math.min(Math.max(box.width,180),window.innerWidth-16)
    menu.style.width=width+'px'
    menu.style.maxHeight=Math.max(96,Math.min(276,window.innerHeight-24))+'px'
    const h=menu.offsetHeight
    const spaceBelow=window.innerHeight-box.bottom-10
    const top=spaceBelow<h&&box.top>spaceBelow?Math.max(8,box.top-h-6):Math.max(8,box.bottom+5)
    menu.style.left=Math.max(8,Math.min(box.left,window.innerWidth-width-8))+'px'
    menu.style.top=top+'px'
  }
  for(const item of items){
    const option=document.createElement('button')
    option.type='button'
    option.className='styled-select-option'
    option.textContent=item.label
    option.title=item.label
    option.id=menu.id+'-option-'+item.index
    option.tabIndex=-1
    option.setAttribute('role','option')
    option.setAttribute('aria-selected',String(item.index===select.selectedIndex))
    option.disabled=!!item.disabled
    option.addEventListener('pointerenter',()=>{if(item.disabled)return;state.index=item.index;renderHighlight(state)})
    option.addEventListener('pointerdown',event=>event.preventDefault())
    option.addEventListener('click',()=>choose(state,item.index))
    state.buttons.push(option);menu.append(option)
  }
  state.outside=event=>{
    if(!state.menu.contains(event.target)&&!state.trigger.contains(event.target))close()
  }
  state.position=position
  state.scrolled=event=>{if(!state.menu.contains(event.target))close()}
  active=state
  trigger.setAttribute('aria-expanded','true')
  trigger.setAttribute('aria-controls',menu.id)
  position()
  renderHighlight(state)
  dialog?.addEventListener('close',state.dialogClose)
  document.addEventListener('pointerdown',state.outside,true)
  window.addEventListener('resize',position)
  window.addEventListener('scroll',state.scrolled,true)
}
export function enhanceStyledSelect(select){
  if(!(select instanceof HTMLSelectElement)||select.multiple||select.size>1||select.classList.contains('styled-select-native'))return
  const wrapper=document.createElement('span')
  wrapper.className='styled-select'
  const trigger=document.createElement('button')
  trigger.type='button'
  trigger.className='styled-select-trigger'
  trigger.setAttribute('role','combobox')
  trigger.setAttribute('aria-haspopup','listbox')
  trigger.setAttribute('aria-expanded','false')
  trigger.setAttribute('aria-label',titleFor(select))
  const label=document.createElement('span')
  label.className='styled-select-value'
  const caret=document.createElement('span')
  caret.className='styled-select-caret'
  caret.setAttribute('aria-hidden','true')
  caret.textContent='⌄'
  trigger.append(label,caret)
  select.before(wrapper)
  wrapper.append(select,trigger)
  select.classList.add('styled-select-native')
  select.tabIndex=-1
  select.setAttribute('aria-hidden','true')
  const refresh=()=>{
    const chosen=select.selectedOptions[0]
    label.textContent=chosen?.label||chosen?.textContent.trim()||'请选择'
    trigger.disabled=select.disabled
    trigger.title=label.textContent
    trigger.setAttribute('aria-label',titleFor(select)+'：'+label.textContent)
    if(active?.select===select&&(!select.isConnected||select.disabled))close()
  }
  trigger.addEventListener('click',event=>{event.preventDefault();refresh();show(select,trigger,refresh)})
  trigger.addEventListener('keydown',event=>{
    const keys=['ArrowUp','ArrowDown','Home','End','Enter',' ','Escape']
    if(!keys.includes(event.key)){
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        if(!active||active.select!==select)show(select,trigger,refresh)
        const state=active
        if(state?.select===select){
          const match=state.items.findIndex(item=>!item.disabled&&item.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))
          if(match!==-1){state.index=match;renderHighlight(state)}
        }
      }
      return
    }
    event.preventDefault()
    if(event.key==='Escape'){close(true);return}
    if(event.key==='Enter'||event.key===' '){
      if(active?.select===select)choose(active,active.index)
      else show(select,trigger,refresh)
      return
    }
    if(active?.select!==select)show(select,trigger,refresh)
    const state=active
    if(!state||state.select!==select)return
    const delta=event.key==='ArrowUp'?-1:1
    const next=event.key==='Home'?usable(state.items,0,1):event.key==='End'?usable(state.items,state.items.length-1,-1):usable(state.items,(state.index+delta+state.items.length)%state.items.length,delta)
    if(next>=0){state.index=next;renderHighlight(state)}
  })
  select.addEventListener('change',refresh)
  select.addEventListener('input',refresh)
  select.addEventListener('focus',()=>trigger.focus({preventScroll:true}))
  select.addEventListener('invalid',()=>{
    trigger.classList.add('styled-select-invalid')
    trigger.focus({preventScroll:true})
  })
  select.addEventListener('change',()=>trigger.classList.remove('styled-select-invalid'))
  controllers.set(select,{wrapper,trigger,refresh})
  refresh()
}
export function enhanceStyledSelects(root=document){
  if(root instanceof HTMLSelectElement)enhanceStyledSelect(root)
  for(const select of root.querySelectorAll('select:not(.styled-select-native)'))enhanceStyledSelect(select)
}
export function refreshStyledSelectLabels(){
  for(const select of document.querySelectorAll('select.styled-select-native'))controllers.get(select)?.refresh()
}
export function installStyledSelects(){
  if(installed)return
  installed=true
  enhanceStyledSelects()
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.target instanceof HTMLSelectElement&&controllers.has(record.target))controllers.get(record.target).refresh()
      for(const node of record.addedNodes){
        if(node.nodeType!==Node.ELEMENT_NODE)continue
        enhanceStyledSelects(node)
        if(node.closest?.('select.styled-select-native'))controllers.get(node.closest('select'))?.refresh()
      }
    }
    if(active&&!active.select.isConnected)close()
  })
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','required']})
}
