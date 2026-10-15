// Safe, async directory completion shared by File Board and Single Host Files.
// Directory names are displayed with textContent; no path becomes HTML or a shell command.
export const eyeIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="file-eye-slash" d="M3 21 21 3" stroke-width="2"/></svg>';
export function pathParts(path,windows=false){
 if(typeof path!=='string'||!path.trim()||path.length>4096||/[\0\r\n]/.test(path))return null;
 const index=windows?Math.max(path.lastIndexOf('/'),path.lastIndexOf('\\')):path.lastIndexOf('/');
 if(index<0)return null;
 const base=path.slice(0,index+1),part=path.slice(index+1);
 if(windows ? !/^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/]|\/\/[^/]+\/[^/]+\/)/.test(base) : !base.startsWith('/'))return null;
 return {base,part,separator:windows?(path[index]==='/'?'/':'\\'):'/'};
}
export const isHiddenFile=(row,os)=>row.name.startsWith('.')||os==='windows'&&row.hidden===true;
export function pathComplete(input,{host,rpc,showHidden,valid=()=>true}){
 const form=input.closest('form'),menu=document.createElement('div');
 menu.className='file-path-options';menu.id='file-path-options-'+Math.random().toString(36).slice(2);
 menu.setAttribute('role','listbox');menu.hidden=true;form.append(menu);
 input.setAttribute('aria-controls',menu.id);input.setAttribute('aria-expanded','false');
 input.setAttribute('aria-autocomplete','list');
 let disposed=false,timer,request=0,items=[],selected=-1,context=null;
 const end=()=>{const length=input.value.length;input.setSelectionRange(length,length);input.scrollLeft=input.scrollWidth};
 function close(){menu.hidden=true;input.setAttribute('aria-expanded','false');items=[];selected=-1;context=null;menu.replaceChildren()}
 function select(index){
  const item=items[index];if(!item||!context)return false;
  input.value=context.base+item.name+context.separator;
  end();close();schedule();return true;
 }
 function highlight(index){
  selected=index;
  for(const [at,button] of [...menu.children].entries()){
   button.classList.toggle('selected',at===index);button.setAttribute('aria-selected',String(at===index));
   if(at===index){input.setAttribute('aria-activedescendant',button.id);button.scrollIntoView({block:'nearest'});}
  }
 }
 async function update(){
  const ticket=++request,raw=input.value;
  if(disposed||document.activeElement!==input||!valid()){close();return}
  const parts=pathParts(raw,host.os==='windows');
  if(!parts){close();return}
  const {base,part}=parts;
  try{
   const response=await rpc('hosts.files',{id:host.id,directory:base,operation:'workspace',arguments:{operation:'list',args:{path:'.',hidden:showHidden()}}});
   if(disposed||ticket!==request||document.activeElement!==input||input.value!==raw||!valid())return;
   const rows=(response.entries||[]).filter(item=>item.directory&&!item.symlink&&item.name.toLocaleLowerCase().startsWith(part.toLocaleLowerCase()))
   items=rows.slice(0,160);context=parts;selected=-1;menu.replaceChildren();
   if(!rows.length){close();return}
   const fragment=document.createDocumentFragment();
   for(const [index,item] of items.entries()){
    const button=document.createElement('button');button.type='button';button.id=menu.id+'-'+index;button.className='file-path-option';button.setAttribute('role','option');button.setAttribute('aria-selected','false');
    const folder=document.createElement('span');folder.className='file-path-folder';folder.textContent='▸';
    const text=document.createElement('span');text.className='file-path-label';text.textContent=item.name;
    button.append(folder,text);button.title=item.name;
    button.addEventListener('pointerdown',e=>e.preventDefault());
    button.addEventListener('click',()=>select(index));fragment.append(button);
   }
   menu.append(fragment);menu.hidden=false;input.setAttribute('aria-expanded','true');
   input.removeAttribute('aria-activedescendant');
  }catch(error){
   if(ticket!==request||disposed||input.value!==raw)return;
   close(); // A failed directory probe must leave typed path untouched.
  }
 }
 function schedule(){clearTimeout(timer);const ticket=++request;timer=setTimeout(()=>{if(ticket===request)void update()},140)}
 function focusEnd(){setTimeout(()=>{if(!disposed&&document.activeElement===input)end()},0)}
 const onFocus=()=>{focusEnd();if(/[\\/]$/.test(input.value))schedule()};
 const onClick=()=>focusEnd();
 const onInput=()=>schedule();
 const onKey=event=>{
  if(menu.hidden)return;
  if(event.key==='Escape'){event.preventDefault();close();return}
  if(!['ArrowDown','ArrowUp','Enter','Tab'].includes(event.key))return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();highlight(selected===-1?event.key==='ArrowDown'?0:items.length-1:(selected+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);return;
  }
  if(selected>=0){event.preventDefault();select(selected)}
  else if(event.key==='Tab')close();
 };
 const onBlur=()=>setTimeout(()=>{if(document.activeElement!==input&&!menu.contains(document.activeElement))close()},120);
 input.addEventListener('focus',onFocus);input.addEventListener('click',onClick);
 input.addEventListener('input',onInput);input.addEventListener('keydown',onKey);input.addEventListener('blur',onBlur);
 return {close,refresh:schedule,focusEnd,dispose(){disposed=true;clearTimeout(timer);request++;menu.remove();input.removeEventListener('focus',onFocus);input.removeEventListener('click',onClick);input.removeEventListener('input',onInput);input.removeEventListener('keydown',onKey);input.removeEventListener('blur',onBlur)}};
}
