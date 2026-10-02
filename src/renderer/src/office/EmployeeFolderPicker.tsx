import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useRef,useState} from 'react'
import {api} from '../api'

type Listing={root:string;path:string;entries:{name:string;path:string;directory:boolean;symlink?:boolean}[]}

/** Team-scoped directory browsing uses the same Core API as `agents workspace list`. */
export function EmployeeFolderPicker({team,cloud,windows,selected,onSelect,onClose}:{team:string;cloud:boolean;windows:boolean;selected:string;onSelect:(path:string)=>void;onClose:()=>void}){
  useI18n()

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
  return <div ref={container} className="employee-directory-picker" aria-label={uiText("Folders available to {0}",[team])}>
    <header><strong>{cloud?uiText("Cloud"):uiText("Team")}  {uiText("Folder")}</strong><button type="button" onClick={onClose}>{uiText("Done")}</button></header>
    <nav><button type="button" disabled={busy||listing?.path==='.'} onClick={()=>void browse(parent)}>{uiText("↑ Parent folder")}</button><code title={listing?.root}>{listing?absolute(listing.path):uiText("Reading…")}</code></nav>
    <div className="employee-directory-list" role="listbox" aria-label={uiText("Choose employee working folder")}>
      {listing&&(cloud||listing.path!=='.')&&<button type="button" role="option" aria-selected={selected===absolute(listing.path)} className="directory-current" onClick={()=>onSelect(absolute(listing.path))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSelect(absolute(listing.path));onClose()}}}>{uiText("Use current folder")}</button>}
      {folders.map(entry=><button type="button" role="option" aria-selected={selected===absolute(entry.path)} key={entry.path} onClick={()=>onSelect(absolute(entry.path))} onDoubleClick={()=>{onSelect(absolute(entry.path));void browse(entry.path)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onSelect(absolute(entry.path));onClose()}else if(e.key==='ArrowRight'){e.preventDefault();void browse(entry.path)}}}>▱ {entry.name}</button>)}
      {listing&&!folders.length&&<small>{uiText("No subfolders here.")}{cloud?uiText("You can choose the current folder."):uiText("Go up to choose another subfolder.")}</small>}
    </div>
    <small>{uiText("Click to select; double-click to enter a subfolder; press Enter to confirm.")}{!cloud&&uiText("Plugin employees can only use subfolders of their Team root.")}</small>
    {error&&<p role="alert">{error}</p>}
  </div>
}
