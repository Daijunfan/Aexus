import { folderDataDirectory } from './paths';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite,validateWorkspace } from '../../electron/storage.cjs';
import {validateDomain} from '../core/validate';
import { makePage } from '../model';
import { executeWorkspaceCommand } from '../core/commands';
import { normalizeWorkspace } from '../core/normalize';
import { CommandError } from '../core/errors';
import type { Page, Workspace } from '../types';

export const FOLDER_FORMAT = 'mininotion.page/v1';
const ignoredNames=new Set(['node_modules','.git','.mininotion','.agents-company','.claude','.codex','dist','target']);
export const ignoredFolderPath=(value:string)=>value.split(/[\\/]/).some(p=>ignoredNames.has(p)||p.startsWith('.')) || /(?:AGENTS|CLAUDE)\.md$/.test(value) || value.endsWith('.tmp');
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const fileId=(value:string)=>`disk-${digest(value).slice(0,24)}`;
export function withinFolder(root: string, value: string, write=false) {
  if(!value || value.includes('\0')) throw new CommandError('INVALID_PATH','缺少有效文件路径');
  const file=path.resolve(root,value), relative=path.relative(root,file);
  if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)) throw new CommandError('WORKSPACE_BOUNDARY','路径不属于当前 Workspace');
  let existing=file;
  while(!fs.existsSync(existing)) existing=path.dirname(existing);
  const resolved=fs.realpathSync(existing);
  if(resolved!==root&&!resolved.startsWith(root+path.sep)) throw new CommandError('WORKSPACE_BOUNDARY','软链接指向 Workspace 外部');
  if(write && (!relative || relative.split(path.sep).some(p=>p==='.mininotion'||p==='.agents-company') || ['AGENTS.md','CLAUDE.md'].includes(relative))) throw new CommandError('MANAGED_PATH','不能通过文件接口覆盖工作区管理文件');
  return file;
}
type Entry={id:string;hash:string;stamp:string;kind:string;trash?:string;externalParentId?:string};
type Index={files:Record<string,Entry>};
export class FolderWorkspace {
  readonly root:string;
  readonly directory:string;
  readonly indexFile:string;
  index:Index={files:{}};
  errors:{path:string;message:string}[]=[];
  importing=false;
  constructor(root:string) {
    this.root=fs.realpathSync(root);this.directory=folderDataDirectory(root);this.indexFile=path.join(this.directory,'folder-index.json');
    if(fs.existsSync(this.indexFile))this.index=JSON.parse(fs.readFileSync(this.indexFile,'utf8'));
  }
  private saveIndex(){atomicWrite(this.indexFile,this.index)}
  list(relative='') {
    const directory=withinFolder(this.root,relative||'.');
    return fs.readdirSync(directory,{withFileTypes:true}).filter(e=>!ignoredFolderPath(e.name)&&!e.isSymbolicLink()).map(e=>({name:e.name,path:path.relative(this.root,path.join(directory,e.name)).split(path.sep).join('/'),directory:e.isDirectory(),bytes:e.isFile()?fs.statSync(path.join(directory,e.name)).size:0})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
  }
  read(relative:string) {
    const file=withinFolder(this.root,relative),stat=fs.statSync(file);
    if(!stat.isFile()||stat.size>4*1024*1024)throw new CommandError('PREVIEW_LIMIT','文本预览最大支持 4 MB；请下载或使用原始文件');
    const content=fs.readFileSync(file,'utf8');return {path:path.relative(this.root,file).split(path.sep).join('/'),content,hash:digest(content),bytes:stat.size};
  }
  write(relative:string,content:string,hash?:string) {
    const file=withinFolder(this.root,relative,true);
    if(hash && (!fs.existsSync(file)||digest(fs.readFileSync(file))!==hash))throw new CommandError('FILE_CONFLICT','文件已被其他工具修改，请重新读取再保存');
    atomicWrite(file,content);return this.read(relative);
  }
  remove(relative:string) {
    const file=withinFolder(this.root,relative,true);
    relative=path.relative(this.root,file).split(path.sep).join('/');
    if(!fs.statSync(file).isFile())throw new CommandError('INVALID_PATH','此接口只移除单个文件');
    const saved=path.join(this.directory,'trash',`${Date.now()}-${path.basename(file)}`);
    fs.mkdirSync(path.dirname(saved),{recursive:true});fs.renameSync(file,saved);if(this.index.files[relative]){this.index.files[relative].trash=path.basename(saved);this.saveIndex()}return {path:relative,trash:saved};
  }
  restore(relative:string) {
    relative=path.relative(this.root,withinFolder(this.root,relative,true)).split(path.sep).join('/');
    const entry=this.index.files[relative];if(!entry?.trash)throw new CommandError('FILE_NOT_FOUND','回收目录中没有此文件');
    const file=withinFolder(this.root,relative,true);
    if(fs.existsSync(file))throw new CommandError('FILE_CONFLICT','原路径已有文件，不会覆盖');
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.renameSync(path.join(this.directory,'trash',path.basename(entry.trash)),file);delete entry.trash;this.saveIndex();return {path:relative};
  }
  scan(input:Workspace|null): Workspace | null {
    const previousIndex=this.index;this.index=structuredClone(previousIndex);
    try {
    const workspace=input || executeWorkspaceCommand(null,'workspace.init',{empty:true,name:path.basename(this.root)}).workspace!;
    const pages=new Map(workspace.pages.map(p=>[p.id,p]));
    const seen=new Set<string>();let changed=!input;this.errors=[];
    const folders=new Set<string>();
    const walk=(directory:string)=>{
      for(const entry of this.list(directory)) {
        if(entry.directory){walk(entry.path);continue}
        const relative=entry.path,file=withinFolder(this.root,relative),stat=fs.statSync(file);
        seen.add(relative);
        const stamp=`${stat.mtimeMs}:${stat.size}`,previous=this.index.files[relative];
        if(previous?.stamp===stamp&&pages.has(previous.id))continue;
        try {
          const rich=relative.endsWith('.mininotion.json');
          const content=rich||stat.size<=4*1024*1024?fs.readFileSync(file):Buffer.from(stamp);
          const hash=digest(content);
          if(previous?.hash===hash&&pages.has(previous.id)){previous.stamp=stamp;continue}
          let page:Page,kind:string;
          if(rich) {
            const data=JSON.parse(content.toString('utf8'));
            if(data.format!==FOLDER_FORMAT||!data.page||typeof data.page.title!=='string')throw new Error('原生页面文件格式须为 mininotion.page/v1，并包含 page.title');
            const id=previous?.id||data.page.id||fileId(relative);
            if(Object.entries(this.index.files).some(([other,e])=>other!==relative&&e.id===id))throw new Error('其他文件已使用同一页面 ID');
            page=makePage({...data.page,id,sourceFile:undefined,updatedAt:Date.now()});kind='native';
          } else {
            const extension=path.extname(relative).toLowerCase();
            kind=['.md','.markdown'].includes(extension)?'markdown':extension==='.csv'?'csv':/\.(png|jpe?g|gif|webp|svg)$/.test(extension)?'image':extension==='.pdf'?'pdf':/\.(txt|json|ya?ml|[cm]?js|tsx?|jsx|py|rs|go|java|css|html?|sh|toml|xml|log)$/.test(extension)?'text':'binary';
            const parent=path.posix.dirname(relative);
            let folder=parent;
            while(folder!=='.'){folders.add(folder);folder=path.posix.dirname(folder)}
            const id=previous?.id||fileId(relative),old=pages.get(id);
            page=makePage({...old,id,parentId:parent==='.'?null:fileId(`directory:${parent}`),title:path.basename(relative),locked:true,blocks:[],sourceFile:{path:relative,kind,hash},trashedAt:undefined});
          }
          this.index.files[relative]={id:page.id,hash,stamp,kind};pages.set(page.id,page);changed=true;
        }catch(error){this.errors.push({path:relative,message:String((error as Error).message)})}
      }
    };
    walk('');
    for(const [relative,entry] of Object.entries(this.index.files)) {
      if(seen.has(relative))continue;
      const page=pages.get(entry.id);
      if(page&&!page.trashedAt){pages.set(page.id,{...page,trashedAt:Date.now()});changed=true}
    }
    // Recreate directory parents for unchanged raw-file pages as well.
    for(const page of pages.values())if(page.sourceFile && !page.trashedAt) {
      let folder=path.posix.dirname(page.sourceFile.path);
      while(folder!=='.'){folders.add(folder);folder=path.posix.dirname(folder)}
    }
    for(const folder of folders){const id=fileId(`directory:${folder}`);if(!pages.has(id)){const parent=path.posix.dirname(folder);pages.set(id,makePage({id,parentId:parent==='.'?null:fileId(`directory:${parent}`),title:path.posix.basename(folder),locked:true,sourceFile:{path:folder,kind:'directory',hash:''}}));changed=true}}
    // A physical child folder may contain a note whose logical notebook is
    // outside this scope. Show it locally without importing the parent's data.
    for(const entry of Object.values(this.index.files)) {
      const page=pages.get(entry.id);if(entry.kind!=='native'||!page)continue;
      if(page.parentId&&!pages.has(page.parentId)){entry.externalParentId=page.parentId;pages.set(page.id,{...page,parentId:null});changed=true}
      else if(entry.externalParentId&&pages.has(entry.externalParentId)){pages.set(page.id,{...page,parentId:entry.externalParentId});delete entry.externalParentId;changed=true}
    }
    const next=changed?normalizeWorkspace({...workspace,pages:[...pages.values()]}):null;
    if(next){validateWorkspace(next);validateDomain(next)}
    this.saveIndex();
    return next;
    }catch(error){this.index=previousIndex;throw error}
  }
  beforeSave(next:Workspace,previous:Workspace|null) {
    if(this.importing)return;
    const writes:{relative:string;file:string;content:string;page:Page;externalParentId?:string}[]=[];
    for(const page of next.pages) {
      if(page.sourceFile){
        const old=previous?.pages.find(p=>p.id===page.id),known=Object.entries(this.index.files).find(([,entry])=>entry.id===page.id);
        if(known&&page.trashedAt&&!old?.trashedAt&&fs.existsSync(withinFolder(this.root,known[0])))this.remove(known[0]);
        if(known&&!page.trashedAt&&old?.trashedAt&&known[1].trash)this.restore(known[0]);
        continue;
      }
      const old=previous?.pages.find(p=>p.id===page.id);
      if(old && JSON.stringify(old)===JSON.stringify(page))continue;
      const known=Object.entries(this.index.files).find(([,e])=>e.id===page.id&&e.kind==='native');
      const relative=known?.[0]??`Documents/${page.id}.mininotion.json`,file=withinFolder(this.root,relative,true);
      if(known&&(!fs.existsSync(file)||digest(fs.readFileSync(file))!==known[1].hash))throw new CommandError('FILE_CONFLICT',`${relative} 已发生外部修改，请同步后重试`);
      const externalParentId=page.parentId?undefined:known?.[1].externalParentId;
      const content=JSON.stringify({format:FOLDER_FORMAT,page:externalParentId?{...page,parentId:externalParentId}:page},null,2)+'\n';
      writes.push({relative,file,content,page,externalParentId});
    }
    for(const write of writes){atomicWrite(write.file,write.content);const stat=fs.statSync(write.file);this.index.files[write.relative]={id:write.page.id,hash:digest(write.content),stamp:`${stat.mtimeMs}:${stat.size}`,kind:'native',...(write.externalParentId?{externalParentId:write.externalParentId}:{})}}
    for(const old of previous?.pages||[])if(!next.pages.some(page=>page.id===old.id)) {
      const known=Object.entries(this.index.files).find(([,entry])=>entry.id===old.id);
      if(!known)continue;
      const file=known[1].trash?path.join(this.directory,'trash',path.basename(known[1].trash)):withinFolder(this.root,known[0],true);
      if(fs.existsSync(file))fs.unlinkSync(file);
      delete this.index.files[known[0]];
    }
    this.saveIndex();
  }
}
