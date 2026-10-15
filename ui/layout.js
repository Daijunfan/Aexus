export function adjustableLayout(){
 const app=document.querySelector('.app'),sidebar=document.querySelector('main>aside'),toolbar=document.querySelector('.toolbar')
 const limits={sidebar:[52,460],toolbar:[36,72]},values={sidebar:218,toolbar:44}
 try{const saved=JSON.parse(localStorage.getItem('cloud-hosts.layout')||'{}');Object.assign(values,saved);if(saved.version!==2)values.toolbar=Math.min(values.toolbar,44)}catch{}
 function apply(name,value){const [min,max]=limits[name];values[name]=Math.round(Math.max(min,Math.min(max,value)));app.style.setProperty('--'+name+'-size',values[name]+'px');document.querySelector('[data-resize="'+name+'"]').setAttribute('aria-valuenow',values[name]);if(name==='sidebar'){app.classList.toggle('sidebar-icons',values.sidebar<100);app.classList.toggle('sidebar-compact',values.sidebar<180)}}
 function save(){localStorage.setItem('cloud-hosts.layout',JSON.stringify({...values,version:2}))}
 for(const name of Object.keys(limits)){
  const handle=document.querySelector('[data-resize="'+name+'"]');handle.setAttribute('aria-valuemin',limits[name][0]);handle.setAttribute('aria-valuemax',limits[name][1]);apply(name,values[name])
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);app.classList.add('layout-resizing');const rect=(name==='sidebar'?sidebar:toolbar).getBoundingClientRect(),start=name==='sidebar'?event.clientX:event.clientY,base=name==='sidebar'?rect.width:rect.height;handle.onpointermove=e=>apply(name,base+(name==='sidebar'?e.clientX:e.clientY)-start);handle.onpointerup=handle.onpointercancel=()=>{handle.onpointermove=null;app.classList.remove('layout-resizing');save()}}
  handle.onkeydown=event=>{const step=({ArrowLeft:-10,ArrowUp:-10,ArrowRight:10,ArrowDown:10})[event.key];if(step||event.key==='Home'||event.key==='End'){event.preventDefault();apply(name,event.key==='Home'?limits[name][0]:event.key==='End'?limits[name][1]:values[name]+step);save()}}
  handle.ondblclick=()=>{apply(name,name==='sidebar'?218:44);save()}
 }
}
