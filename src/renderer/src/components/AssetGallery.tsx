import {useEffect,useRef,useState,type KeyboardEvent,type CSSProperties,type DragEvent} from 'react'
import type {AssetNode,AssetFilters,AssetBrowse,AssetPreview} from '../../../shared/asset-schema'
import {assetTitle,assetSize} from '../../../shared/asset-presentation'
import {api} from '../api'
import {translate as t,useI18n} from '../i18n'
import {AssetGlyph,AssetHostBadge,assetOwnerLine} from './AssetIdentity'
import {Icon} from './Icon'
import {dragFile,hasFileDrop} from '../file-transfers'

const covers=new Map<string,AssetPreview>(),queue:Array<{key:string;id:string;alive:()=>boolean;resolve:(value:AssetPreview)=>void}>=[]
let running=0,coverBytes=0,coverEpoch=0
function drain(){while(running<2&&queue.length){const job=queue.shift()!;if(!job.alive())continue;running++;void api.call<AssetPreview>('assets.preview',{id:job.id}).then(value=>{if(value.kind==='image'){coverBytes-=covers.get(job.key)?.data?.length??0;covers.set(job.key,value);coverBytes+=value.data?.length??0;while(covers.size>60||coverBytes>10*1024*1024){const key=covers.keys().next().value!;coverBytes-=covers.get(key)?.data?.length??0;covers.delete(key)}}if(job.alive())job.resolve(value)}).catch(()=>job.alive()&&job.resolve({kind:'fallback'})).finally(()=>{running--;drain()})}}
export function clearAssetCovers(){covers.clear();coverBytes=0;coverEpoch++}
function AssetCover({node,revision}:{node:AssetNode;revision:number}){
 const root=useRef<HTMLSpanElement>(null),[cover,setCover]=useState<AssetPreview>(),key=[node.id,node.bytes,node.modifiedAt,coverEpoch].join(':')
 useEffect(()=>{let alive=true;if(node.directory||node.storage==='remote')return
  const cached=covers.get(key);if(cached){setCover(cached);return}setCover(undefined)
  const observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting)){observer.disconnect();queue.push({key,id:node.id,alive:()=>alive,resolve:setCover});drain()}},{root:root.current?.closest('.asset-scroll'),rootMargin:'120px'})
  if(root.current)observer.observe(root.current);return()=>{alive=false;observer.disconnect()}
 },[key,node.directory,node.storage])
 return <span ref={root} className={'asset-cover '+(cover?.kind==='image'?'has-cover':'')} data-preview={cover?.kind??'pending'}>{cover?.kind==='image'?<img src={`data:${cover.mimeType};base64,${cover.data}`} alt={t('Preview of {0}',[assetTitle(node)])} loading="lazy" decoding="async" draggable={false}/>:<AssetGlyph node={node} large/>}{!node.directory&&<span className="asset-cover-type">{node.name.split('.').at(-1)?.toUpperCase().slice(0,7)}</span>}</span>
}
export function AssetGallery({initialRoot,filters,query,revision,hidden,selected,onSelect,onOpen,onLocate,onContext,onDrop,onInfo,onClearSearch,onPage,onFolder}:{initialRoot?:string;filters:AssetFilters;query:string;revision:number;hidden:boolean;selected?:string;onSelect:(node:AssetNode)=>void;onOpen:(node:AssetNode)=>void;onLocate:(node:AssetNode)=>void;onContext:(node:AssetNode,anchor:{x:number;y:number})=>void;onDrop:(event:DragEvent,node:AssetNode)=>void;onInfo:(node:AssetNode)=>void;onClearSearch:()=>void;onPage?:(page:AssetBrowse)=>void;onFolder?:(node:AssetNode)=>void}){
 useI18n();const [root,setRoot]=useState(initialRoot??'root'),[offset,setOffset]=useState(0),[page,setPage]=useState<AssetBrowse>(),[error,setError]=useState(''),[size,setSize]=useState(()=>{try{const n=Number(localStorage.getItem('avalon.file-icon-size'));return n>=130&&n<=230?n:170}catch{return 170}}),scroll=useRef<HTMLDivElement>(null),history=useRef<string[]>([]),serial=useRef(0),previous=useRef('')
 const key=JSON.stringify([filters,query,hidden,root,offset]),scopeKey=JSON.stringify([filters.view,filters.team,filters.employee,filters.conversation,filters.host]),lastScope=useRef(scopeKey)
 useEffect(()=>{if(lastScope.current!==scopeKey){lastScope.current=scopeKey;setRoot('root');setOffset(0);history.current=[]}},[scopeKey])
 useEffect(()=>setOffset(0),[query,filters.kind,filters.storage,filters.sort,hidden])
 useEffect(()=>{let active=true,timer:ReturnType<typeof setTimeout>|undefined;const ticket=++serial.current,changed=key!==previous.current;previous.current=key;if(changed){setPage(undefined);scroll.current?.scrollTo({top:0})}setError('')
  const load=async()=>{try{const value=await api.call<AssetBrowse>('assets.browse',{...filters,root:query.trim()?'root':root,query,hidden,offset,limit:60});if(!active||ticket!==serial.current)return;setPage(value);onPage?.(value);if(!query)onFolder?.(value.parent);if(value.indexing)timer=setTimeout(()=>void load(),700)}catch(cause){if(active){setError((cause as Error).message);setPage(undefined)}}}
  timer=setTimeout(()=>void load(),query?140:0);return()=>{active=false;clearTimeout(timer)}
 },[key,revision])
 const navigate=(node:AssetNode)=>{if(!node.directory){onOpen(node);return}history.current.push(root);setRoot(node.id);setOffset(0);onClearSearch()}
 const keys=(event:KeyboardEvent,node:AssetNode)=>{
  if(event.key==='Enter'){event.preventDefault();navigate(node)}
  if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const box=event.currentTarget.getBoundingClientRect();onContext(node,{x:box.left+20,y:box.top+24})}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='i'){event.preventDefault();onInfo(node)}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const items=[...scroll.current!.querySelectorAll<HTMLButtonElement>('.asset-entry')],index=items.indexOf(event.currentTarget as HTMLButtonElement),columns=Math.max(1,getComputedStyle(scroll.current!.querySelector('.asset-gallery-grid')!).gridTemplateColumns.split(' ').length),step=event.key==='ArrowUp'?-columns:event.key==='ArrowDown'?columns:event.key==='ArrowLeft'?-1:1,next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+step));items[next]?.focus();if(page?.entries[next])onSelect(page.entries[next])}
 }
 const currentTitle=query?t('Search results'):root==='root'?t('Your file library'):page?assetTitle(page.parent):t('Loading…')
 return <div className="asset-library-view" style={{'--asset-card-size':size+'px'} as CSSProperties}>
  <header className="asset-library-heading"><div><h2>{currentTitle}</h2><p>{page?t('{0} items',[page.total]):t('Loading files…')}{query?' · '+t('Across your workspaces'):''}</p></div><label title={t('Icon size')}><Icon name="zoom-in"/><input aria-label={t('Icon size')} type="range" min={130} max={230} step={10} value={size} onChange={event=>{const n=Number(event.target.value);setSize(n);try{localStorage.setItem('avalon.file-icon-size',String(n))}catch{}}}/></label></header>
  <nav className="asset-library-breadcrumbs" aria-label={t('Library location')}><button disabled={!history.current.length} aria-label={t('Previous folder')} onClick={()=>{setRoot(history.current.pop()??'root');setOffset(0);onClearSearch()}}><Icon name="arrow-left"/></button><button onClick={()=>{setRoot('root');setOffset(0);onClearSearch()}}><Icon name="home"/>{t('All spaces')}</button>{!query&&page?.breadcrumbs.filter(crumb=>crumb.id!=='root').map(crumb=><button key={crumb.id} onClick={()=>{history.current.push(root);setRoot(crumb.id);setOffset(0)}}><Icon name="chevron-right"/>{t(crumb.name)}</button>)}</nav>
  {error&&<p role="alert" className="asset-error">{t('Could not load this folder. Return to All spaces or refresh.')} <button onClick={()=>setRoot('root')}>{t('All spaces')}</button></p>}
  <div ref={scroll} className="asset-scroll asset-gallery-scroll" aria-label={t('Company assets')} role="list" aria-busy={!page||page.indexing}>
   <div className="asset-gallery-grid">{page?.entries.map(node=><div key={node.id} className="asset-row asset-list-row asset-tile" data-selected={selected===node.id||undefined} onContextMenu={event=>{event.preventDefault();event.stopPropagation();onSelect(node);onContext(node,{x:event.clientX,y:event.clientY})}}>
    <button className="asset-entry" role="listitem" data-asset-id={node.id} data-directory={node.directory} data-locked={node.locked} aria-label={assetTitle(node)} aria-current={selected===node.id?'true':undefined} title={assetTitle(node)} onClick={()=>onSelect(node)} onDoubleClick={()=>navigate(node)} onKeyDown={event=>keys(event,node)} draggable={!!node.location&&(!node.locked||!node.directory)} onDragStart={event=>node.location&&dragFile(event.dataTransfer,node.location)} onDragOver={event=>{if(node.directory&&node.location&&!node.readOnly&&hasFileDrop(event.dataTransfer)){event.preventDefault();event.dataTransfer.dropEffect='copy'}}} onDrop={event=>onDrop(event,node)}>
     <AssetCover node={node} revision={revision}/><span className="asset-name"><strong>{assetTitle(node)}</strong><small>{assetOwnerLine(node)}</small></span><span className="asset-tile-meta"><AssetHostBadge node={node}/><small>{node.directory?node.fileCount!==undefined?t('{0} files',[node.fileCount]):t('Folder'):assetSize(node.bytes)}</small></span>
    </button><div className="asset-file-actions"><button aria-label={t(node.directory?'Open folder: {0}':'Show in folder: {0}',[assetTitle(node)])} title={t(node.directory?'Open folder':'Show in folder')} onClick={()=>node.directory?navigate(node):onLocate(node)}><Icon name="folder-opened"/></button><button aria-label={t('Actions for {0}',[assetTitle(node)])} aria-haspopup="menu" onClick={event=>{onSelect(node);const box=event.currentTarget.getBoundingClientRect();onContext(node,{x:box.right-220,y:box.bottom+4})}}><Icon name="ellipsis"/></button></div>
   </div>)}</div>
   {page&&!page.entries.length&&!error&&<div className="asset-empty"><Icon name={query?'search':'folder-opened'}/><strong>{t(query?'No files match these filters':'This folder is empty.')}</strong><p>{t('Choose another workspace or clear the filters. Your files stay in their original folders.')}</p></div>}
  </div>
  <footer className="asset-library-footer"><span>{t('Click to select · Double-click to open · Right-click for actions')}</span>{(offset>0||page?.nextOffset!==null)&&<><button aria-label={t('Previous page')} disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-60))}><Icon name="chevron-left"/></button><button aria-label={t('Next page')} disabled={page?.nextOffset===null||!page} onClick={()=>setOffset(page!.nextOffset!)}><Icon name="chevron-right"/></button></>}</footer>
 </div>
}
