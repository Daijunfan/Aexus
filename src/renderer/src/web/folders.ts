import type {AgentsApi} from '../api'
/** Select a directory on the execution server, never pretend it is a browser-local path. */
export function chooseServerFolder(api:AgentsApi,initial:string):Promise<{path:string|null}>{
  return new Promise(resolve=>{
    const overlay=document.createElement('div');overlay.className='web-login-overlay'
    const panel=document.createElement('section');panel.className='web-folder-picker';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','选择后端主机文件夹')
    const title=document.createElement('h2');title.textContent='选择后端主机文件夹'
    const note=document.createElement('p');note.textContent='这里的目录属于运行 Core 的主机。浏览器本地文件请使用上传。'
    const input=document.createElement('input');input.value=initial;input.setAttribute('aria-label','后端目录路径')
    const list=document.createElement('div');list.className='web-folder-list'
    const error=document.createElement('p'),footer=document.createElement('footer'),cancel=document.createElement('button'),select=document.createElement('button'),up=document.createElement('button')
    cancel.textContent='取消';select.textContent='选择此目录';up.textContent='上一级'
    panel.append(title,note,input,up,list,error,footer);footer.append(cancel,select);overlay.append(panel);document.body.append(overlay)
    let directory='',parent='',sequence=0
    const finish=(path:string|null)=>{overlay.remove();resolve({path})}
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
