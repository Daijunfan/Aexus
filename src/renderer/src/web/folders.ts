import {translate as uiText,onInterfaceLanguageChange} from '../i18n'
import type {AgentsApi} from '../api'
/** Select a directory on the execution server, never pretend it is a browser-local path. */
export function chooseServerFolder(api:AgentsApi,initial:string):Promise<{path:string|null}>{
  return new Promise(resolve=>{
    const overlay=document.createElement('div');overlay.className='web-login-overlay'
    const panel=document.createElement('section');panel.className='web-folder-picker';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',uiText('Choose a Core-host folder'))
    const title=document.createElement('h2');title.textContent=uiText('Choose a Core-host folder')
    const note=document.createElement('p');note.textContent=uiText('These folders belong to the Core host. Upload files from the browser’s device instead.')
    const input=document.createElement('input');input.value=initial;input.setAttribute('aria-label',uiText('Core-host directory path'))
    const list=document.createElement('div');list.className='web-folder-list'
    const error=document.createElement('p'),footer=document.createElement('footer'),cancel=document.createElement('button'),select=document.createElement('button'),up=document.createElement('button')
    cancel.textContent=uiText('Cancel');select.textContent=uiText('Choose this directory');up.textContent=uiText('Parent folder')
    panel.append(title,note,input,up,list,error,footer);footer.append(cancel,select);overlay.append(panel);document.body.append(overlay)
    const offLanguage=onInterfaceLanguageChange(()=>{panel.setAttribute('aria-label',uiText('Choose a Core-host folder'));title.textContent=uiText('Choose a Core-host folder');note.textContent=uiText('These folders belong to the Core host. Upload files from the browser’s device instead.');input.setAttribute('aria-label',uiText('Core-host directory path'));cancel.textContent=uiText('Cancel');select.textContent=uiText('Choose this directory');up.textContent=uiText('Parent folder')})
    let directory='',parent='',sequence=0
    const finish=(path:string|null)=>{offLanguage();overlay.remove();resolve({path})}
    const load=async(value:string)=>{
      const id=++sequence;select.disabled=true;error.textContent=''
      try{
        const data=await api.call<{path:string;parent:string;entries:{name:string;path:string}[]}>('system.directories',{path:value})
        if(id!==sequence)return;directory=data.path;parent=data.parent;input.value=directory;list.replaceChildren()
        for(const item of data.entries){const button=document.createElement('button');button.textContent=item.name;button.onclick=()=>void load(item.path);list.append(button)}
        select.disabled=false
      }catch(cause){if(id===sequence)error.textContent=(cause as Error).message}
    }
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void load(input.value)}}
    panel.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();finish(null)}}
    up.onclick=()=>void load(parent);cancel.onclick=()=>finish(null);select.onclick=()=>finish(directory)
    void load(initial);input.focus()
  })
}
