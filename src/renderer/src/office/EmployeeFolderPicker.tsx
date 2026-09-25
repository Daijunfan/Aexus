import {useEffect,useRef,useState} from 'react'
import {api} from '../api'

type Listing={root:string;path:string;entries:{name:string;path:string;directory:boolean;symlink?:boolean}[]}

/** Team-scoped directory browsing uses the same Core API as `agents workspace list`. */
export function EmployeeFolderPicker({team,cloud,windows,selected,onSelect,onClose}:{team:string;cloud:boolean;windows:boolean;selected:string;onSelect:(path:string)=>void;onClose:()=>void}){
  const [listing,setListing]=useState<Listing|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const container=useRef<HTMLDivElement>(null)
  const browse=async(path:string)=>{
    setBusy(true);setError('')
    try{const data=await api.call<Listing>('workspace.list',{team,path});setListing({...data,path:data.path||'.'})}
    catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  useEffect(()=>{void browse('.')},[team])
  useEffect(()=>{container.current?.scrollIntoView({block:'center'})},[])
  const absolute=(relative:string)=>{
    const root=listing!.root
    if(relative==='.')return root
    const separator=windows?'\\':'/'
    return root.replace(/[\\/]+$/,'')+separator+relative.replace(/\//g,separator)
  }
  const folders=listing?.entries.filter(entry=>entry.directory&&!entry.symlink)??[]
  const parent=listing?.path==='.'?'.':listing?.path.split('/').slice(0,-1).join('/')||'.'
  return <div ref={container} className="employee-directory-picker" aria-label={`${team} 可绑定的文件夹`}>
    <header><strong>{cloud?'云端':'Team'} 文件夹</strong><button type="button" onClick={onClose}>完成</button></header>
    <nav><button type="button" disabled={busy||listing?.path==='.'} onClick={()=>void browse(parent)}>↑ 上一级</button><code title={listing?.root}>{listing?absolute(listing.path):'正在读取…'}</code></nav>
    <div className="employee-directory-list" role="listbox" aria-label="选择员工工作文件夹">
      {listing&&(cloud||listing.path!=='.')&&<button type="button" role="option" aria-selected={selected===absolute(listing.path)} className="directory-current" onClick={()=>onSelect(absolute(listing.path))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSelect(absolute(listing.path));onClose()}}}>使用当前文件夹</button>}
      {folders.map(entry=><button type="button" role="option" aria-selected={selected===absolute(entry.path)} key={entry.path} onClick={()=>onSelect(absolute(entry.path))} onDoubleClick={()=>{onSelect(absolute(entry.path));void browse(entry.path)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSelect(absolute(entry.path));onClose()}else if(e.key==='ArrowRight'){e.preventDefault();void browse(entry.path)}}}>▱ {entry.name}</button>)}
      {listing&&!folders.length&&<small>这里没有子文件夹。{cloud?'可选择当前文件夹。':'返回上一级选择其他子文件夹。'}</small>}
    </div>
    <small>点击即选中；双击进入子文件夹；选中后按回车确认。{!cloud&&'插件员工只能使用 Team 根目录下的子文件夹。'}</small>
    {error&&<p role="alert">{error}</p>}
  </div>
}
