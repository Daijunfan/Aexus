import type { NativeAPI } from '../types';
import { fromWireResponse } from '../core/protocol';

/** Browser adapter for the same native UI. The backend remains the only writer. */
export function installPluginBridge() {
  const base=new URL('.',location.href).href,token=location.pathname.split('/')[1];
  const listeners={state:new Set<(event:any)=>void>(),ui:new Set<(event:any)=>void>(),agent:new Set<(event:any)=>void>(),command:new Set<(name:string)=>void>(),flush:new Set<()=>Promise<void>>()};
  let latest:any;
  const assetPrefix=base+'data/asset/';
  const translate=(value:any,incoming:boolean):any=>{
    if(typeof value==='string') {
      if(incoming&&value.startsWith('asset://local/'))return assetPrefix+value.slice(14).split('/').map(encodeURIComponent).join('/');
      if(!incoming&&value.startsWith(assetPrefix))return 'asset://local/'+decodeURIComponent(value.slice(assetPrefix.length));
      return value;
    }
    if(Array.isArray(value))return value.map(v=>translate(v,incoming));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,translate(v,incoming)]));
    return value;
  };
  const api:NativeAPI['api']=async(method,params={},id=crypto.randomUUID())=>{
    const response=await fetch(base+'rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params:translate(params,false)})});
    return translate(fromWireResponse(await response.json()),true);
  };
  const call=async(method:string,params:Record<string,any>={})=>{const result=await api(method,params);if(result.error)throw new Error(result.error.message);return result.result};
  const events=new EventSource(base+'events');
  const receive=(event:any)=>{event=translate(event,true);if(event.type==='state'){latest=event;listeners.state.forEach(f=>f(event))}else if(event.type==='ui')listeners.ui.forEach(f=>f(event));else if(event.type==='agent')listeners.agent.forEach(f=>f(event))};
  events.onmessage=event=>receive(JSON.parse(event.data));
  events.onopen=()=>void api('workspace.get').then(response=>receive({type:'state',workspace:response.result,revision:response.revision}));
  const on=(kind:keyof typeof listeners,fn:any)=>{(listeners[kind] as Set<any>).add(fn);if(kind==='state'&&latest)queueMicrotask(()=>fn(latest));return()=>{(listeners[kind] as Set<any>).delete(fn)}};
  const workspaceURL=(relative:string)=>base+'data/workspace/'+relative.split('/').map(encodeURIComponent).join('/');
  const download=(href:string,name:string)=>{const a=document.createElement('a');a.href=href;a.download=name;a.click()};
  window.native={
    rendererReady:async()=>{await call('ui.register');window.parent.postMessage({type:'agents-plugin:ready',token},'*')},
    folderMode:true,workspaceURL,api,
    onState:fn=>on('state',fn),onUI:fn=>on('ui',fn),onAgent:fn=>on('agent',fn),onCommand:fn=>on('command',fn),onFlush:fn=>on('flush',fn),
    load:async()=>{const [response,info]=await Promise.all([api('workspace.get'),call('fs.info')]);if(response.error)throw new Error(response.error.message);return {workspace:response.result,dataPath:info.root,version:'folder-plugin'}},
    save:async()=>{throw new Error('文件夹插件通过 workspace.patch 保存差异，不支持整体替换工作空间')},
    saveAsset:async(name,bytes)=>{let binary='';for(const part of new Uint8Array(bytes))binary+=String.fromCharCode(part);return call('fs.asset-upload',{name,contentBase64:btoa(binary)})},
    uploadToSpace:async()=>{throw new Error('请使用文件夹文件入口或 CLI 上传到 Workspace')},
    revealSpace:async()=>false,chooseEngine:async()=>null,
    exportPage:async(pageId,type)=>{const output=`Exports/${pageId}.${type}`;await call('file.export',{pageId,type,output});download(workspaceURL(output),`${pageId}.${type}`);return true},
    exportFile:async(name,content)=>{const output=`Exports/${name.replace(/[\\/]/g,'-')}`;await call('fs.write',{path:output,content});download(workspaceURL(output),name);return true},
    exportAsset:async(url,name)=>{download(url,name);return true},
    chooseImports:async()=>[],importFiles:async()=>[],
    exportBackup:async()=>{throw new Error('文件夹模式请备份整个 Workspace 文件夹')},importBackup:async()=>{throw new Error('文件夹模式请通过文件夹迁移数据')},
    revealData:async()=>{},versions:pageId=>call('history.list',{pageId}),snapshot:async()=>{},printPDF:async()=>false,setTheme:theme=>{window.parent.postMessage({type:'agents-plugin:appearance',token,theme},'*')},
    openExternal:async url=>{if(url.startsWith('mininotion://page/'))listeners.command.forEach(fn=>fn(`open-page:${url.slice(18)}`));else window.parent.postMessage({type:'agents-plugin:external',token,url},'*')},
    loadDraft:()=>call('fs.draft-read'),saveDraft:draft=>call('fs.draft-write',{draft}),
  };
  window.addEventListener('message',async event=>{
    if(event.source!==window.parent||event.data?.token!==token||event.data?.type!=='agents-plugin:flush')return;
    let error='';try{await Promise.all([...listeners.flush].map(flush=>flush()))}catch(e){error=String((e as Error).message)}
    window.parent.postMessage({type:'agents-plugin:flushed',token,id:event.data.id,error},'*');
  });
}
