import {Fragment,useEffect,useRef,useState,type CSSProperties,type ReactNode,type DragEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react'
import {PanelDivider} from './PanelDivider'
import {Icon} from './Icon'
import {api} from '../api'
import {downloadBrowserFile} from '../web/files'
import {copyFile,dragFile,dropFiles,hasFileDrop,pasteFile,uploadFiles} from '../file-transfers'
import {onPluginFlush} from '../plugins'

type Entry={name:string;path:string;directory:boolean;symlink:boolean;bytes:number;modifiedAt:number}
type Document={path:string;content?:string;hash?:string;bytes:number;binary:boolean;mimeType?:string;data?:string}
let latestDeleted:object|undefined
export function FileWorkspace({team,employee,shared=false,children,onAttachImage,explorerWidth=230}:{shared?:boolean;explorerWidth?:number;team?:string;employee?:string;children?:ReactNode;onAttachImage?:(path:string)=>void}) {
  const scope=shared?{shared:true}:{team,employee}
  const fileInput=useRef<HTMLInputElement>(null)
  const receive=(e:DragEvent,path:string)=>{if(!hasFileDrop(e.dataTransfer))return;e.preventDefault();e.stopPropagation();setError('');void dropFiles(e.dataTransfer,{...scope,path:path||'.'}).then(()=>refresh()).catch(e=>setError(e.message))}
  const allowDrop=(e:DragEvent)=>{if(hasFileDrop(e.dataTransfer)){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy'}}
  const [widthDraft,setWidthDraft]=useState<number>()
  useEffect(()=>setWidthDraft(undefined),[explorerWidth])
  const [folder,setFolder]=useState(''),[entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState('')
  const [document,setDocument]=useState<Document|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[hidden,setHidden]=useState(false)
  const [create,setCreate]=useState<{kind:'file'|'folder'|'rename';path?:string;parent?:string}|null>(null),[name,setName]=useState('')
  const trash=useRef<{id:string;path:string}|null>(null)
  const deletion=useRef({})
  const committing=useRef(false)
  const [saving,setSaving]=useState(false),[showFile,setShowFile]=useState(false)
  const [expanded,setExpanded]=useState(new Set([''])),[branches,setBranches]=useState<Record<string,Entry[]>>({})
  const call=(op:string,args:Record<string,unknown>={})=>api.call('workspace.'+op,{...scope,...args})
  const load=async()=>{const paths=employee?[...expanded]:[folder];return Promise.all(paths.map(async value=>[value,(await call('list',{path:value||'.',hidden})).entries] as const))}
  const refresh=async()=>{const result=await load();setLoadError('');if(employee)setBranches(Object.fromEntries(result));else setEntries(result[0][1])}
  useEffect(()=>{let active=true,pending=false;const poll=async()=>{if(pending)return;pending=true;try{const result=await load();if(active){setLoadError('');if(employee)setBranches(Object.fromEntries(result));else setEntries(result[0][1])}}catch(e){if(active)setLoadError((e as Error).message)}finally{pending=false}};void poll();const timer=setInterval(poll,2000);return()=>{active=false;clearInterval(timer)}},[folder,team,employee,shared,hidden,expanded])
  const toggle=(entry:Entry)=>{setFolder(expanded.has(entry.path)?entry.path.split('/').slice(0,-1).join('/'):entry.path);setExpanded(previous=>{const next=new Set(previous);if(next.has(entry.path))next.delete(entry.path);else next.add(entry.path);return next})}
  const dirty=!!document&&!document.binary&&draft!==document.content
  const save=async()=>{
    if(!dirty||!document)return
    setSaving(true)
    try{await call('write',{path:document.path,content:draft,hash:document.hash});setDocument(await call('read',{path:document.path}));setError('');await refresh()}
    catch(e){setError((e as Error).message);throw e}finally{setSaving(false)}
  }
  useEffect(()=>onPluginFlush(save),[dirty,draft,document,team,employee])
  const open=async(entry:Entry)=>{
    try{await save();setError('');if(entry.directory){setFolder(entry.path);setSelected('');setDocument(null)}else{const data=await call(/\.(png|jpe?g|gif|webp)$/i.test(entry.path)?'image':'read',{path:entry.path});setFolder(entry.path.split('/').slice(0,-1).join('/'));setSelected(entry.path);setDocument(data);setDraft(data.content||'');setShowFile(true)}}catch(e){setError((e as Error).message)}
  }
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
    const next=[parent,value].filter(Boolean).join('/')
    if(create?.kind==='rename'){await call('move',{path:create.path,to:next});if(employee){const old=create.path!;setExpanded(previous=>new Set([...previous].map(p=>p===old||p.startsWith(old+'/')?next+p.slice(old.length):p)));setFolder(previous=>previous===old||previous.startsWith(old+'/')?next+previous.slice(old.length):previous)};if(selected===create.path||selected.startsWith(create.path+'/')){const moved=next+selected.slice(create.path!.length);setSelected(moved);setDocument(await call('read',{path:moved}))}}
    else if(create?.kind==='folder')await call('mkdir',{path:next})
    else {await call('write',{path:next,content:'',create:true});setSelected(next);setDocument(await call('read',{path:next}));setDraft('');setShowFile(true)}
    setCreate(null);setName('')
    });committing.current=false
  }
  const beginCreate=(kind:'file'|'folder')=>{setCreate({kind,parent:folder});setName('');if(employee)setExpanded(previous=>new Set([...previous,folder]))}
  const inlineEditor=(depth:number)=><form className="file-inline-editor" style={{paddingLeft:depth*12+4}} onSubmit={e=>{e.preventDefault();void submit()}}><Icon name={create?.kind==='folder'?'folder':'file'}/><input autoFocus name="file-name" aria-label="文件名称" placeholder={create?.kind==='folder'?'文件夹名称':'文件名称'} value={name} onChange={e=>setName(e.target.value)} onFocus={e=>{if(create?.kind==='rename')e.target.select()}} onBlur={()=>{if(!committing.current)setCreate(null)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setCreate(null)}}}/></form>
  const pieces=folder.split('/').filter(Boolean)
  const rows=(items:Entry[],depth=0,parent=employee?'':folder):ReactNode=><>{create&&create.kind!=='rename'&&create.parent===parent&&inlineEditor(depth)}{items.map(entry=><Fragment key={entry.path}><div className={`file-row ${selected===entry.path?'selected':''}`} data-file={entry.path} data-symlink={entry.symlink||undefined} data-drop-folder={entry.directory?entry.path:undefined} tabIndex={0} draggable={!entry.symlink&&create?.path!==entry.path} onDragStart={e=>dragFile(e.dataTransfer,{...scope,path:entry.path})} onDragOver={entry.directory?allowDrop:undefined} onDrop={entry.directory?e=>receive(e,entry.path):undefined} style={{paddingLeft:depth*12}}>{create?.kind==='rename'&&create.path===entry.path?inlineEditor(0):<button className="file-open" onClick={()=>employee&&entry.directory?toggle(entry):void open(entry)}><Icon name={entry.directory?(expanded.has(entry.path)?'chevron-down':'chevron-right'):entry.symlink?'link':'file'}/><span>{entry.name}<small>{entry.directory?'文件夹':entry.bytes<1024?`${entry.bytes} B`:`${Math.round(entry.bytes/1024)} KB`}</small></span></button>}{onAttachImage&&!entry.directory&&/\.(png|jpe?g|gif|webp)$/i.test(entry.path)&&<button className="file-action" aria-label={`附加图片 ${entry.name}`} title="附加到消息" onClick={()=>{onAttachImage(entry.path);setShowFile(false)}}><Icon name="add"/></button>}{api.mode==='web'&&!entry.directory&&!entry.symlink&&<button className="file-action" aria-label={`下载 ${entry.name}`} onClick={()=>downloadBrowserFile({...scope,path:entry.path})}><Icon name="cloud-download"/></button>}<button className="file-action" aria-label={`重命名 ${entry.name}`} onClick={()=>{setCreate({kind:'rename',path:entry.path});setName(entry.name)}}><Icon name="edit"/></button><button className="file-action" aria-label={`删除 ${entry.name}`} onClick={()=>void mutate(async()=>{trash.current=await call('trash',{path:entry.path});latestDeleted=deletion.current;if(entry.directory&&employee){setExpanded(previous=>new Set([...previous].filter(p=>p!==entry.path&&!p.startsWith(entry.path+'/'))));setFolder(previous=>previous===entry.path||previous.startsWith(entry.path+'/')?entry.path.split('/').slice(0,-1).join('/'):previous)};if(selected===entry.path||selected.startsWith(entry.path+'/')){setSelected('');setDocument(null)}})}><Icon name="trash"/></button></div>{employee&&entry.directory&&expanded.has(entry.path)&&rows(branches[entry.path]??[],depth+1,entry.path)}</Fragment>)}</>
  const importButton=<button className="explorer-action" title="从当前设备导入文件" aria-label="从当前设备导入文件" onClick={()=>fileInput.current?.click()}><Icon name="add"/></button>
  return <div className={`file-workspace ${employee?'employee-files':''} ${shared?'shared-files':''} ${shared&&document?'shared-preview-open':''}`} onKeyDown={fileKeys} style={{'--explorer-width':`${widthDraft??explorerWidth}px`,'--pane-width':'clamp(140px,var(--explorer-width),45%)'} as CSSProperties}>
    {employee&&<PanelDivider axis="x" value={widthDraft??explorerWidth} min={140} max={520} label="调整文件栏宽度" onDraft={setWidthDraft} onCommit={value=>api.call('settings.set',{explorerWidth:value})}/>}
    <div className="file-toolbar"><nav aria-label="当前文件夹"><button data-drop-folder="." onDragOver={allowDrop} onDrop={e=>receive(e,'.')} onClick={()=>void up('')}><Icon name="files"/> {shared?'共享文件':'项目'}</button>{pieces.map((piece,index)=><span key={index}> / <button data-drop-folder={pieces.slice(0,index+1).join('/')} onDragOver={allowDrop} onDrop={e=>receive(e,pieces.slice(0,index+1).join('/'))} onClick={()=>void up(pieces.slice(0,index+1).join('/'))}>{piece}</button></span>)}</nav><div><input ref={fileInput} type="file" multiple hidden aria-label="选择本地文件上传" onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';setError('');void uploadFiles(files,{...scope,path:folder||'.'}).then(()=>refresh()).catch(e=>setError(e.message))}}/>{!shared&&importButton}<button className="explorer-action" title="新建文件夹" aria-label={employee?"新建文件夹":"＋ 文件夹"} onClick={()=>beginCreate('folder')}><Icon name="new-folder"/></button><button className="explorer-action" title="新建文件" aria-label={employee?"新建文件":"＋ 文件"} onClick={()=>beginCreate('file')}><Icon name="new-file"/></button><button className="explorer-action" title="隐藏文件" aria-label="隐藏文件" onClick={()=>setHidden(!hidden)} aria-pressed={hidden}><Icon name="eye"/></button><button onClick={()=>void refresh().catch(e=>setLoadError(e.message))} aria-label="刷新目录"><Icon name="refresh"/></button>{shared&&importButton}</div></div>

    {(error||loadError)&&<div className="workspace-error" role="alert">{error||loadError}</div>}
    <div className="file-split"><div className="file-list" role="list" tabIndex={0} aria-label={shared?"共享文件":"项目文件"}>
      {!create&&!error&&!loadError&&!(employee?branches['']:entries)?.length&&<p className="file-empty">{shared?<>拖入文件或文件夹保存到本机。<br/>可从这里拖往其他工作区。</>:<>这个文件夹还是空的。<br/>可以新建文件，或交给员工开始工作。</>}</p>}
      {rows(employee?(branches['']??[]):entries)}
    </div><div className="file-preview">{children&&<div className="workbench-tabs"><button className={!showFile?'active':''} onClick={()=>setShowFile(false)}>会话</button>{document&&<button className={showFile?'active':''} onClick={()=>setShowFile(true)}>{document.path}{dirty?' •':''}</button>}</div>}{children&&<div className="conversation-chat" hidden={showFile&&!!document}>{children}</div>}{(!children||showFile)&&(document?<><header>{shared&&<button aria-label="返回共享文件列表" onClick={()=>void save().then(()=>{setDocument(null);setSelected('')}).catch(()=>{})}><Icon name="arrow-left"/></button>}<strong title={document.path}>{document.path}</strong><span>{dirty?'有未保存修改':'已保存'}<button title="放弃当前未保存修改，重新读取文件" onClick={async()=>{try{const data=await call('read',{path:document.path});setDocument(data);setDraft(data.content||'');setError('')}catch(e){setError((e as Error).message)}}}>重新载入文件</button>{!document.binary&&<button disabled={!dirty||saving} onClick={()=>void save().catch(()=>{})}>{saving?'保存中…':'保存文件'}</button>}</span></header>{document.mimeType&&document.data?<img className="file-preview-image" alt={document.path} src={`data:${document.mimeType};base64,${document.data}`}/>:document.binary?<div className="file-empty">此文件暂不支持文本预览。<br/>{document.bytes.toLocaleString()} 字节 · 文件保留在原目录中。</div>:<textarea aria-label="文件内容" autoFocus={shared} placeholder={shared?"在这里输入文本…":undefined} spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();void save().catch(()=>{})}}}/>}</>:<div className="file-empty"><span className="file-empty-icon">▰</span><h3>Build your next idea.</h3><p>这里就是你的项目文件夹。<br/>选择文件开始编辑，或点击员工打开对话。</p></div>)}</div></div>
  </div>
}
