import '../styles/conversation-workspaces.css'
import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {Fragment,useEffect,useRef,useState,type CSSProperties,type ReactNode,type DragEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react'
import {PanelDivider} from './PanelDivider'
import {Icon} from './Icon'
import {api} from '../api'
import {revealFile,downloadFile} from '../file-actions'
import {copyFile,dragFile,dropFiles,hasFileDrop,pasteFile,uploadFiles} from '../file-transfers'
import {onPluginFlush} from '../plugins'

type Entry={name:string;path:string;directory:boolean;symlink:boolean;bytes:number;modifiedAt:number}
type Document={path:string;content?:string;hash?:string;bytes:number;binary:boolean;mimeType?:string;data?:string}
let latestDeleted:object|undefined
export function FileWorkspace({readOnly=false,assetRoot,initialFile='',team,employee,conversation,initialFolder='',shared=false,children,onAttachImage,explorerWidth=230}:{readOnly?:boolean;assetRoot?:string;initialFile?:string;conversation?:string;initialFolder?:string;shared?:boolean;explorerWidth?:number;team?:string;employee?:string;children?:ReactNode;onAttachImage?:(path:string)=>void}) {
  useI18n()

  const scope=assetRoot?{asset:assetRoot}:conversation?{conversation}:shared?{shared:true}:{team,employee}
  const fileInput=useRef<HTMLInputElement>(null)
  const receive=(e:DragEvent,path:string)=>{if(readOnly||!hasFileDrop(e.dataTransfer))return;e.preventDefault();e.stopPropagation();setDropActive(false);setError('');void dropFiles(e.dataTransfer,{...scope,path:path||'.'}).then(()=>refresh()).catch(e=>setError(e.message))}
  const allowDrop=(e:DragEvent)=>{if(hasFileDrop(e.dataTransfer)){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy'}}
  const [dropActive,setDropActive]=useState(false)
  const [widthDraft,setWidthDraft]=useState<number>()
  useEffect(()=>setWidthDraft(undefined),[explorerWidth])
  const [folder,setFolder]=useState(initialFolder),[entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState('')
  const [document,setDocument]=useState<Document|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[hidden,setHidden]=useState(false)
  const [create,setCreate]=useState<{kind:'file'|'folder'|'rename';path?:string;parent?:string}|null>(null),[name,setName]=useState('')
  const trash=useRef<{id:string;path:string}|null>(null)
  const deletion=useRef({})
  const committing=useRef(false)
  const [saving,setSaving]=useState(false),[showFile,setShowFile]=useState(false)
  const [expanded,setExpanded]=useState(new Set(['',...(initialFolder?[initialFolder]:[])])),[branches,setBranches]=useState<Record<string,Entry[]>>({})
  const call=(op:string,args:Record<string,unknown>={})=>assetRoot?api.call('assets.file',{...args,id:assetRoot,operation:op,...(args.id?{trashId:args.id}:{})}):conversation?api.call('conversation.file',{conversation,operation:op,...args}):api.call('workspace.'+op,{...scope,...args})
  const load=async()=>{const paths=employee?[...expanded]:[folder];return Promise.all(paths.map(async value=>[value,(await call('list',{path:value||'.',hidden})).entries] as const))}
  const refresh=async()=>{const result=await load();setLoadError('');if(employee)setBranches(Object.fromEntries(result));else setEntries(result[0][1])}
  useEffect(()=>{let active=true,pending=false;const poll=async()=>{if(pending)return;pending=true;try{const result=await load();if(active){setLoadError('');if(employee)setBranches(Object.fromEntries(result));else setEntries(result[0][1])}}catch(e){if(active)setLoadError((e as Error).message)}finally{pending=false}};void poll();const timer=setInterval(poll,2000);return()=>{active=false;clearInterval(timer)}},[folder,team,employee,conversation,shared,hidden,expanded])
  const toggle=(entry:Entry)=>{setFolder(expanded.has(entry.path)?entry.path.split('/').slice(0,-1).join('/'):entry.path);setExpanded(previous=>{const next=new Set(previous);if(next.has(entry.path))next.delete(entry.path);else next.add(entry.path);return next})}
  const dirty=!readOnly&&!!document&&!document.binary&&draft!==document.content
  const save=async()=>{
    if(!dirty||!document)return
    setSaving(true)
    try{await call('write',{path:document.path,content:draft,hash:document.hash});setDocument(await call('read',{path:document.path}));setError('');await refresh()}
    catch(e){setError((e as Error).message);throw e}finally{setSaving(false)}
  }
  const latestSave=useRef(save);latestSave.current=save
  useEffect(()=>onPluginFlush(()=>latestSave.current()),[])
  const open=async(entry:Entry)=>{
    if(!entry.directory&&document?.path===entry.path){setSelected(entry.path);setShowFile(true);return}
    try{await save();setError('');if(entry.directory){setFolder(entry.path);setSelected('');setDocument(null)}else{const data=await call(/\.(png|jpe?g|gif|webp)$/i.test(entry.path)?'image':'read',{path:entry.path});setFolder(entry.path.split('/').slice(0,-1).join('/'));setSelected(entry.path);setDocument(data);setDraft(data.content||'');setShowFile(true)}}catch(e){setError((e as Error).message)}
  }
  useEffect(()=>{if(initialFile)void open({name:initialFile.split('/').at(-1)!,path:initialFile,directory:false,symlink:false,bytes:0,modifiedAt:0})},[assetRoot,initialFile])
  const up=async(value:string)=>{try{await save();setFolder(value);setSelected('');setDocument(null);setError('')}catch{}}
  const mutate=async(action:()=>Promise<void>)=>{try{setError('');await save();await action();if(employee)setExpanded(previous=>new Set(previous));else await refresh()}catch(e){setError((e as Error).message)}}
  const undo=()=>{if(!trash.current)return;void mutate(async()=>{await call('restore',{id:trash.current!.id});trash.current=null;latestDeleted=undefined})}
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(!(e.metaKey||e.ctrlKey)||e.key.toLowerCase()!=='z'||e.shiftKey||latestDeleted!==deletion.current||e.target instanceof Element&&e.target.closest('input,textarea,[contenteditable="true"]'))return
      e.preventDefault();undo()
    }
    globalThis.document.addEventListener('keydown',key);return()=>globalThis.document.removeEventListener('keydown',key)
  },[team,employee,shared,document])
  const fileKeys=(e:ReactKeyboardEvent)=>{
    if(!(e.metaKey||e.ctrlKey)||e.target instanceof Element&&e.target.closest('input,textarea,[contenteditable="true"]'))return
    const target=e.target instanceof Element?e.target.closest<HTMLElement>('[data-file]'):null
    if(e.key.toLowerCase()==='c'&&target&&!target.dataset.symlink){e.preventDefault();copyFile({...scope,path:target.dataset.file!})}
    if(e.key.toLowerCase()==='v'){e.preventDefault();setError('');const destination=e.target instanceof Element?e.target.closest<HTMLElement>('[data-drop-folder]')?.dataset.dropFolder:undefined;void pasteFile({...scope,path:destination||folder||'.'}).then(()=>refresh()).catch(error=>setError(error.message))}
  }
  const submit=async()=>{
    if(committing.current||!create)return
    if(!name.trim()){setCreate(null);return}
    committing.current=true
    await mutate(async()=>{
    const value=name.trim();if(!value||value.includes('/')||value==='.'||value==='..')throw new Error('请输入有效的文件名')
    const parent=create?.kind==='rename'?create.path?.split('/').slice(0,-1).join('/')??'':create?.parent??''
    let next=[parent,value].filter(Boolean).join('/')
    if(create?.kind==='rename'){const result=await call('move',{path:create.path,to:next});next=result.path??next;if(employee){const old=create.path!;setExpanded(previous=>new Set([...previous].map(p=>p===old||p.startsWith(old+'/')?next+p.slice(old.length):p)));setFolder(previous=>previous===old||previous.startsWith(old+'/')?next+previous.slice(old.length):previous)};if(selected===create.path||selected.startsWith(create.path+'/')){const moved=next+selected.slice(create.path!.length);setSelected(moved);setDocument(await call('read',{path:moved}))}}
    else if(create?.kind==='folder')await call('mkdir',{path:next})
    else {await call('write',{path:next,content:'',create:true});setSelected(next);setDocument(await call('read',{path:next}));setDraft('');setShowFile(true)}
    setCreate(null);setName('')
    });committing.current=false
  }
  const beginCreate=(kind:'file'|'folder')=>{setCreate({kind,parent:folder});setName('');if(employee)setExpanded(previous=>new Set([...previous,folder]))}
  const inlineEditor=(depth:number)=><form className="file-inline-editor" style={{paddingLeft:depth*12+4}} onSubmit={e=>{e.preventDefault();void submit()}}><Icon name={create?.kind==='folder'?'folder':'file'}/><input autoFocus name="file-name" aria-label={uiText("File name")} placeholder={create?.kind==='folder'?uiText("Folder name"):uiText("File name")} value={name} onChange={e=>setName(e.target.value)} onFocus={e=>{if(create?.kind==='rename')e.target.select()}} onBlur={()=>{if(!committing.current)setCreate(null)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setCreate(null)}}}/></form>
  const pieces=folder.split('/').filter(Boolean)
  const rows=(items:Entry[],depth=0,parent=employee?'':folder):ReactNode=><>{create&&create.kind!=='rename'&&create.parent===parent&&inlineEditor(depth)}{items.map(entry=><Fragment key={entry.path}><div className={`file-row ${selected===entry.path?'selected':''}`} data-file={entry.path} data-symlink={entry.symlink||undefined} data-drop-folder={entry.directory?entry.path:undefined} tabIndex={0} draggable={!entry.symlink&&create?.path!==entry.path} onDragStart={e=>dragFile(e.dataTransfer,{...scope,path:entry.path})} onDragOver={entry.directory?allowDrop:undefined} onDrop={entry.directory?e=>receive(e,entry.path):undefined} style={{paddingLeft:depth*12}}>{create?.kind==='rename'&&create.path===entry.path?inlineEditor(0):<button className="file-open" onClick={()=>employee&&entry.directory?toggle(entry):void open(entry)}><Icon name={entry.directory?(expanded.has(entry.path)?'chevron-down':'chevron-right'):entry.symlink?'link':'file'}/><span>{entry.name}<small>{entry.directory?uiText("Folder"):entry.bytes<1024?uiText("{0} B",[entry.bytes]):uiText("{0} KB",[Math.round(entry.bytes/1024)])}</small></span></button>}{onAttachImage&&!entry.directory&&/\.(png|jpe?g|gif|webp)$/i.test(entry.path)&&<button className="file-action" aria-label={uiText("Attach image {0}",[entry.name])} title={uiText("Attach to message")} onClick={()=>{onAttachImage(entry.path);setShowFile(false)}}><Icon name="add"/></button>}<button className="file-action" aria-label={uiText('Open in Finder: {0}',[entry.name])} title={uiText('Open in Finder')} onClick={()=>{setError('');void revealFile({...scope,path:entry.path}).catch(error=>setError(error.message))}}><Icon name="folder-opened"/></button>{!entry.directory&&!entry.symlink&&<button className="file-action" aria-label={uiText("Download {0}",[entry.name])} title={uiText('Download file')} onClick={()=>{setError('');void downloadFile({...scope,path:entry.path}).catch(error=>setError(error.message))}}><Icon name="cloud-download"/></button>}<button disabled={readOnly} className="file-action" aria-label={uiText("Rename {0}",[entry.name])} onClick={()=>{setCreate({kind:'rename',path:entry.path});setName(entry.name)}}><Icon name="edit"/></button><button disabled={readOnly} className="file-action" aria-label={uiText("Delete {0}",[entry.name])} onClick={()=>void mutate(async()=>{trash.current=await call('trash',{path:entry.path});latestDeleted=deletion.current;if(entry.directory&&employee){setExpanded(previous=>new Set([...previous].filter(p=>p!==entry.path&&!p.startsWith(entry.path+'/'))));setFolder(previous=>previous===entry.path||previous.startsWith(entry.path+'/')?entry.path.split('/').slice(0,-1).join('/'):previous)};if(selected===entry.path||selected.startsWith(entry.path+'/')){setSelected('');setDocument(null)}})}><Icon name="trash"/></button></div>{employee&&entry.directory&&expanded.has(entry.path)&&rows(branches[entry.path]??[],depth+1,entry.path)}</Fragment>)}</>
  const importButton=<button className="explorer-action" title={uiText("Import files from this device")} aria-label={uiText("Import files from this device")} onClick={()=>fileInput.current?.click()}><Icon name="add"/></button>
  return <div className={`file-workspace ${employee?'employee-files':''} ${shared?'shared-files':''} ${shared&&document?'shared-preview-open':''}`} onKeyDown={fileKeys} style={{'--explorer-width':`${widthDraft??explorerWidth}px`,'--pane-width':'clamp(140px,var(--explorer-width),45%)'} as CSSProperties}>
    {employee&&<PanelDivider axis="x" value={widthDraft??explorerWidth} min={140} max={520} label={uiText("Resize file sidebar")} onDraft={setWidthDraft} onCommit={value=>api.call('settings.set',{explorerWidth:value})}/>}
    <div className="file-toolbar"><nav aria-label={uiText("Current folder")}><button data-drop-folder="." onDragOver={allowDrop} onDrop={e=>receive(e,'.')} onClick={()=>void up('')}><Icon name="files"/> {conversation?uiText("Shared workspace"):shared?uiText("Shared files"):uiText("Project")}</button>{pieces.map((piece,index)=><span key={index}> / <button data-drop-folder={pieces.slice(0,index+1).join('/')} onDragOver={allowDrop} onDrop={e=>receive(e,pieces.slice(0,index+1).join('/'))} onClick={()=>void up(pieces.slice(0,index+1).join('/'))}>{piece}</button></span>)}</nav><div><input ref={fileInput} type="file" multiple hidden aria-label={uiText("Choose local files to upload")} onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';setError('');void uploadFiles(files,{...scope,path:folder||'.'}).then(()=>refresh()).catch(e=>setError(e.message))}}/>{!shared&&!readOnly&&importButton}<button className="explorer-action" title={uiText('Open in Finder')} aria-label={uiText('Open current folder in Finder')} onClick={()=>{setError('');void revealFile({...scope,path:folder||'.'}).catch(error=>setError(error.message))}}><Icon name="folder-opened"/></button><button disabled={readOnly} className="explorer-action" title={uiText("New folder")} aria-label={employee?uiText("New folder"):uiText("＋ Folder")} onClick={()=>beginCreate('folder')}><Icon name="new-folder"/></button><button disabled={readOnly} className="explorer-action" title={uiText("New file")} aria-label={employee?uiText("New file"):uiText("＋ File")} onClick={()=>beginCreate('file')}><Icon name="new-file"/></button><button className="explorer-action" title={uiText("Hidden files")} aria-label={uiText("Hidden files")} onClick={()=>setHidden(!hidden)} aria-pressed={hidden}><Icon name="eye"/></button><button onClick={()=>void refresh().catch(e=>setLoadError(e.message))} aria-label={uiText("Refresh directory")}><Icon name="refresh"/></button>{shared&&!readOnly&&importButton}</div></div>

    {(error||loadError)&&<div className="workspace-error" role="alert">{error||loadError}</div>}
    <div className="file-split"><div className="file-list" role="list" tabIndex={0} data-drop-folder={folder||'.'} data-drop-active={dropActive||undefined} onDragOver={e=>{if(hasFileDrop(e.dataTransfer)){allowDrop(e);setDropActive(true)}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropActive(false)}} onDragEnd={()=>setDropActive(false)} onDrop={e=>receive(e,folder)} aria-label={shared?uiText("Shared files"):uiText("Project files")}>
      {!create&&!error&&!loadError&&!(employee?branches['']:entries)?.length&&<p className="file-empty">{shared?<>{uiText("Drop files or folders to save them on this host.")}<br/>{uiText("You can drag them into other workspaces from here.")}</>:<>{uiText("This folder is empty.")}<br/>{uiText("Create a file, or ask an employee to start working.")}</>}</p>}
      {rows(employee?(branches['']??[]):entries)}
    </div><div className="file-preview">{children&&<div className="workbench-tabs"><button className={!showFile?'active':''} onClick={()=>setShowFile(false)}>{uiText("Conversations")}</button>{document&&<button className={showFile?'active':''} onClick={()=>setShowFile(true)}>{document.path}{dirty?' •':''}</button>}</div>}{children&&<div className="conversation-chat" hidden={showFile&&!!document}>{children}</div>}{(!children||showFile)&&(document?<><header>{shared&&<button aria-label={uiText("Back to shared files")} onClick={()=>void save().then(()=>{setDocument(null);setSelected('')}).catch(()=>{})}><Icon name="arrow-left"/></button>}<strong title={document.path}>{document.path}</strong><span>{dirty?uiText("Unsaved changes"):uiText("All changes saved")}<button title={uiText("Discard unsaved changes and reload the file")} onClick={async()=>{try{const data=await call('read',{path:document.path});setDocument(data);setDraft(data.content||'');setError('')}catch(e){setError((e as Error).message)}}}>{uiText("Reload file")}</button>{!document.binary&&<button disabled={!dirty||saving} onClick={()=>void save().catch(()=>{})}>{saving?uiText("Saving…"):uiText("Save file")}</button>}</span></header>{document.mimeType&&document.data?<img className="file-preview-image" alt={document.path} src={`data:${document.mimeType};base64,${document.data}`}/>:document.binary?<div className="file-empty">{uiText("Text preview is not available for this file.")}<br/>{document.bytes.toLocaleString()}  {uiText("bytes · The file stays in its original directory.")}</div>:<textarea readOnly={readOnly} aria-label={uiText("File content")} autoFocus={shared} placeholder={shared?uiText("Enter text here…"):undefined} spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();void save().catch(()=>{})}}}/>}</>:<div className="file-empty"><span className="file-empty-icon">▰</span><h3>{uiText("Build your next idea.")}</h3><p>{uiText("This is your project folder.")}<br/>{uiText("Choose a file to edit, or open an employee’s conversation.")}</p></div>)}</div></div>
  </div>
}
